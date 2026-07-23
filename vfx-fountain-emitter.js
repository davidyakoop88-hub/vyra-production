// vfx-fountain-emitter.js — the reusable premium fountain composite. Orchestrates
// 7 flow lanes (bezier paths, normalized), 3 depth layers, crystal hearts, sparkles,
// trails, and the source portal into one object that satisfies the Scene/system duck
// type from Milestone 1 (.container, .update(dt,t,turbulence), .destroy(),
// .activeCount) — so it plugs into VFX.Scene.addSystem() with zero changes to
// vfx-scene.js.
//
// Motion model: particles do NOT move via BaseParticle's vx/vy integration. Each
// carries a lane index + a normalized "path progress" (pathT, 0 at the source, 1 at
// the top fade line, and allowed to overshoot past 1 while extrapolating the lane's
// final tangent, fading out before removal). Position each tick = bezierPoint(lane,
// pathT) converted from normalized to pixel space using the emitter's CURRENT
// width/height — this is what makes spawn geometry responsive to resize, fixing the
// Milestone 1 limitation. Small perpendicular drift, scale shimmer, and rotation all
// come from FlowField's seeded noise, not fresh per-frame randomness.
//
// M2 hardening pass notes (see VYRA_VFX_ENGINE_M2_HARDENING_REPORT.md for the full
// list): every per-spawn random draw now comes from one of several independent
// seeded VFX.Rng streams (not Math.random()); lane choice is weighted toward
// center/inner lanes; quality changes arrive via applyQuality() from Scene, not
// demo-page polling; setPaused() is a complete simulation pause; the hot per-tick
// path (bezier sampling, dead-particle collection) no longer allocates.
window.VFX = window.VFX || {};

function vfxClamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function vfxLerp(a, b, t) { return a + (b - a) * t; }

const VFX_HEART_VARIANTS = ['violet', 'pink', 'blue', 'gold'];
const VFX_HEART_SIZE_CATEGORIES = ['TINY', 'SMALL', 'MEDIUM', 'HERO'];
const VFX_SIZE_WEIGHTS = [['TINY', 0.35], ['SMALL', 0.40], ['MEDIUM', 0.20], ['HERO', 0.05]];

VFX.FountainEmitter = class FountainEmitter {
  /**
   * @param {Object} opts
   * @param {VFX.TextureRegistry} opts.textureRegistry
   * @param {number} opts.width - logical (CSS-pixel) canvas width
   * @param {number} opts.height
   * @param {Object} [opts.budget] - one of VFX.FOUNTAIN_QUALITY_BUDGETS[...]
   * @param {number} [opts.seed]
   */
  constructor(opts) {
    this.registry = opts.textureRegistry;
    this.width = opts.width;
    this.height = opts.height;
    this.budget = opts.budget || VFX.FOUNTAIN_QUALITY_BUDGETS.high;
    this.seed = opts.seed ?? 777;
    this.flowField = new VFX.FlowField(this.seed, VFX.FLOW_LANES.length, { x: 0, width: 1 }, 24);

    // independent seeded RNG streams (M2 hardening item 4) — one per concern, all
    // derived from the same base seed via VFX.hashSeed so they never share state
    // or accidentally correlate with each other. See vfx-rng.js.
    this._rngSpawn = VFX.createRng(this.seed, 'spawn');       // life/alpha variance, noiseSeed
    this._rngLane = VFX.createRng(this.seed, 'lane');         // weighted lane choice
    this._rngVariant = VFX.createRng(this.seed, 'variant');   // heart color variant
    this._rngSize = VFX.createRng(this.seed, 'size');         // heart/sparkle size
    this._rngRotation = VFX.createRng(this.seed, 'rotation'); // initial + angular rotation speed
    this._rngShimmer = VFX.createRng(this.seed, 'shimmer');   // shimmer speed + phase
    this._rngTrail = VFX.createRng(this.seed, 'trail');       // trail eligibility

    // allocation-free scratch objects reused by _advanceParticle's bezier sampling
    // every tick, for every active particle (M2 hardening item 9) — see
    // VFX.bezierPointInto in vfx-fountain-types.js. Safe to share because each is
    // fully read-and-discarded within one synchronous _advanceParticle call before
    // the next particle's call reuses it.
    this._scratchPoint = { x: 0, y: 0 };
    this._scratchTangent = { x: 0, y: 0 };

    // every crystal-heart texture (4 variants x 4 size categories = 16) baked once
    // up front, so a spawn never triggers a first-use texture-bake hitch and
    // reset() can just look one up (M2 hardening item 11).
    this._heartTextureCache = {};
    for (const variant of VFX_HEART_VARIANTS) {
      this._heartTextureCache[variant] = {};
      for (const sizeCat of VFX_HEART_SIZE_CATEGORIES) {
        this._heartTextureCache[variant][sizeCat] = VFX.CrystalHeartTextures.get(this.registry, variant, sizeCat);
      }
    }

    this.container = new PIXI.Container();

    this.sourceLayer = new PIXI.Container();
    this.container.addChild(this.sourceLayer);
    this.source = new VFX.FountainSource(this.sourceLayer, this.registry, 0xb43dff, this.seed);

    const RENDER_ORDER = ['dust', 'bgSparkle', 'bgHeart', 'midSparkle', 'trails', 'midHeart', 'fgHeart', 'fgStar'];
    this._layerContainers = {};
    for (const name of RENDER_ORDER) {
      const isTrails = name === 'trails';
      const c = isTrails
        ? new PIXI.Container()
        : new PIXI.ParticleContainer(1000, { vertices: false, position: true, rotation: true, uvs: false, alpha: true, tint: true });
      this._layerContainers[name] = c;
      this.container.addChild(c);
    }
    // PIXI.ParticleContainer batches ignore per-child blendMode — only the container's
    // own blendMode applies. fgStar is the one layer that wants additive glow.
    this._layerContainers.fgStar.blendMode = PIXI.BLEND_MODES.ADD;

    this.trailPool = new VFX.TrailPool(this._layerContainers.trails, this.budget.trailLength || 6, this._trailCapacity());

    this._laneUsage = new Array(VFX.FLOW_LANES.length).fill(0);
    this._droppedSpawnCount = 0; // renamed from _forcedRecycleCount — nothing is
                                  // actually force-recycled here, a full pool just
                                  // refuses the spawn (M2 hardening item 10)
    // _paused implements a COMPLETE simulation pause (update() returns immediately,
    // freezing the source portal, every particle and every trail) — not just a
    // spawn gate. Chosen over renaming to pauseSpawning because a full freeze is
    // what the debug panel's Pause button is actually for (inspecting one static
    // frame), and it was no more code than gating spawn/advance separately (M2
    // hardening item 8).
    this._paused = false;
    this._intensityUser = 1;
    this._spawnRateMul = 1;
    this._turbulenceOverride = null;
    this._widthMul = 1;

    this._channels = this._buildChannels();

    // entrance gating — channel name -> 0..1 spawn gate, ramped by GSAP timeline
    this._gates = { source: 0, rings: 0, sparkle: 0, smallHeart: 0, mediumHeart: 0, fullIdle: 0 };
    this._entranceTimeline = null;
    this.playEntrance();
  }

  _trailCapacity() {
    // pools can't grow after construction, so trail capacity (like every channel's
    // pool capacity below) is sized against Ultra's budget — the maximum this
    // emitter could ever need — while the *active* cap enforced each tick tracks
    // the current budget via ch.maxActive / this.budget.trailChance.
    const ultra = VFX.FOUNTAIN_QUALITY_BUDGETS.ultra;
    return Math.max(8, Math.round(ultra.maxActive * ultra.trailChance * 1.5));
  }

  _channelCapacity(populationShare) {
    const ultra = VFX.FOUNTAIN_QUALITY_BUDGETS.ultra;
    return Math.max(4, Math.round(ultra.maxActive * populationShare));
  }

  _buildChannels() {
    const depths = VFX.FOUNTAIN_DEPTH_LAYERS;
    const defaultHeartTexture = this._heartTextureCache.violet.MEDIUM;
    const mk = (name, layer, factory, spawnRate, depthKey, gateKey, extra = {}) => {
      const depth = depthKey ? depths[depthKey] : null;
      const share = (depth ? depth.populationShare : 0.5) * (extra.shareMul ?? 1);
      // pool capacity is always sized for Ultra (the ceiling) since pools can't grow
      // after construction; maxActive is the *current*-budget soft cap enforced in
      // update() and is what setQualityBudget() actually adjusts.
      const poolCapacity = this._channelCapacity(share);
      const pool = new VFX.ParticlePool(() => {
        const p = factory();
        this._layerContainers[layer].addChild(p.sprite);
        return p;
      }, poolCapacity);
      const maxActive = Math.max(2, Math.round(this.budget.maxActive * share));
      // deadScratch: reused every update() tick instead of allocating a fresh
      // array per channel per tick (M2 hardening item 9).
      return { name, layer, pool, baseSpawnRate: spawnRate, depth, depthKey, gateKey, share, maxActive, spawnAccumulator: 0, deadScratch: [], ...extra };
    };

    // shareMul values within each depth must sum to 1.0 — they subdivide that
    // depth's populationShare among its channels (dust+bgSparkle+bgHeart share
    // 'background', midSparkle+midHeart share 'midground', fgHeart+fgStar share
    // 'foreground'). Without this every channel would independently claim the
    // *whole* depth share, over-allocating total capacity by ~2.3x.
    return [
      mk('dust', 'dust', () => new VFX.SparkleParticle(VFX.SparkleTextures.get(this.registry, 'dust')), 6, 'background', 'sparkle', { kind: 'dust', shareMul: 0.35 }),
      mk('bgSparkle', 'bgSparkle', () => new VFX.SparkleParticle(VFX.SparkleTextures.get(this.registry, 'dot')), 8, 'background', 'sparkle', { kind: 'dot', shareMul: 0.40 }),
      mk('bgHeart', 'bgHeart', () => new VFX.CrystalHeartParticle(defaultHeartTexture), 3, 'background', 'smallHeart', { isHeart: true, shareMul: 0.25 }),
      mk('midSparkle', 'midSparkle', () => new VFX.SparkleParticle(VFX.SparkleTextures.get(this.registry, 'dot')), 10, 'midground', 'sparkle', { kind: 'dot', shareMul: 0.45 }),
      mk('midHeart', 'midHeart', () => new VFX.CrystalHeartParticle(defaultHeartTexture), 6, 'midground', 'mediumHeart', { isHeart: true, trailEligible: true, shareMul: 0.55 }),
      mk('fgHeart', 'fgHeart', () => new VFX.CrystalHeartParticle(defaultHeartTexture), 2, 'foreground', 'mediumHeart', { isHeart: true, trailEligible: true, shareMul: 0.65 }),
      mk('fgStar', 'fgStar', () => new VFX.SparkleParticle(VFX.SparkleTextures.get(this.registry, 'star')), 1.2, 'foreground', 'sparkle', { kind: 'star', additive: true, shareMul: 0.35 })
    ];
  }

  // ---- entrance sequence -------------------------------------------------
  playEntrance() {
    if (typeof gsap === 'undefined') { // graceful fallback: snap to idle instantly
      Object.keys(this._gates).forEach(k => (this._gates[k] = 1));
      return;
    }
    this._entranceTimeline?.kill();
    Object.keys(this._gates).forEach(k => (this._gates[k] = 0));
    const g = this._gates;
    const tl = gsap.timeline();
    tl.to(g, { source: 1, duration: 0.35, ease: 'power1.out' }, 0.0);
    tl.to(g, { rings: 1, duration: 0.55, ease: 'back.out(1.4)' }, 0.25);
    tl.to(g, { sparkle: 1, duration: 0.8, ease: 'power2.out' }, 0.4);
    tl.to(g, { smallHeart: 1, duration: 0.9, ease: 'power2.out' }, 0.7);
    tl.to(g, { mediumHeart: 1, duration: 0.9, ease: 'power2.out' }, 1.1);
    tl.to(g, { fullIdle: 1, duration: 0.9, ease: 'power1.inOut' }, 1.6);
    this._entranceTimeline = tl;
  }

  resetEntrance() {
    this._entranceTimeline?.kill();
    Object.keys(this._gates).forEach(k => (this._gates[k] = 0));
    this.clear();
  }

  // ---- dev controls -------------------------------------------------------
  setPaused(v) { this._paused = v; }
  setIntensity(v) { this._intensityUser = vfxClamp01(v); }
  setSpawnRateMultiplier(v) { this._spawnRateMul = Math.max(0, v); }
  setTurbulenceOverride(v) { this._turbulenceOverride = v; }
  setWidthMultiplier(v) { this._widthMul = Math.max(0.2, v); }
  clear() {
    for (const ch of this._channels) ch.pool.forEachActive(p => this._recycle(ch, p));
  }

  /**
   * Legacy generic duck-type hook — Scene.applyQuality() only calls this as a
   * fallback for systems with no applyQuality() of their own (see vfx-scene.js).
   * Kept as a safe no-op for that fallback path; the real, richer quality entry
   * point is applyQuality() below, which Scene now calls preferentially.
   */
  setMaxActive(_n) { /* intentionally inert — see applyQuality() */ }

  /**
   * The real, engine-driven quality entry point (M2 hardening item 6) — called
   * automatically by Scene.applyQuality() whenever Engine's QualityManager
   * resolves a new preset (manual selection, the AUTO ladder stepping, or
   * reduced-motion), with no dependency on any demo-page polling loop.
   * @param {{name:string, reducedMotion?:boolean}} preset
   */
  applyQuality(preset) {
    const budget = preset.reducedMotion
      ? VFX.FOUNTAIN_QUALITY_BUDGETS.reducedMotion
      : (VFX.FOUNTAIN_QUALITY_BUDGETS[preset.name] || this.budget);
    this.setQualityBudget(budget);
  }

  setQualityBudget(budget) {
    this.budget = budget;
    for (const ch of this._channels) {
      ch.maxActive = Math.max(2, Math.round(budget.maxActive * ch.share));
    }
    this.trailPool.setMaxPoints(budget.trailLength || this.trailPool.maxPoints);
    if (!budget.trailsEnabled) this._releaseAllTrails();
  }

  /** Releases every currently-active trail (and clears the owning particle's
   * reference to it) when a quality change disables trails. Without this, a
   * particle's stale `p.trail` pointer could keep writing into a Trail instance
   * the pool has since handed to a different particle (M2 hardening item 7). */
  _releaseAllTrails() {
    for (const ch of this._channels) {
      if (!ch.isHeart) continue;
      ch.pool.forEachActive(p => {
        if (p.trail) { this.trailPool.release(p.trail); p.trail = null; }
      });
    }
  }

  // ---- responsive resize ---------------------------------------------------
  resize(width, height) {
    this.width = width;
    this.height = height;
    // Positions are recomputed from normalized pathT every tick (see _advanceParticle),
    // so nothing needs to be re-baked here — this is the actual fix for the M1
    // "spawn zones aren't resize-proportional" limitation.
  }

  // ---- main update ----------------------------------------------------------
  /** @param {number} dt fixed-timestep seconds @param {number} t sim time @param {number} turbulence 0..1 */
  update(dt, t, turbulence) {
    if (this._paused) return; // complete freeze — see the _paused field doc above

    const effectiveTurbulence = this._turbulenceOverride ?? turbulence;
    this.source.update(t, this._gates.source * this._intensityUser);
    for (const ring of this.source.rings) ring.sprite.alpha *= this._gates.rings;

    for (const ch of this._channels) {
      const gate = this._gates[ch.gateKey] ?? 1;
      const densityMod = this._channelDensityModulation(ch, t);
      const rate = ch.baseSpawnRate * this._spawnRateMul * gate * this._intensityUser * densityMod;
      if (ch.pool.activeCount < ch.maxActive) {
        ch.spawnAccumulator += rate * dt;
        while (ch.spawnAccumulator >= 1 && ch.pool.activeCount < ch.maxActive) {
          this._spawnInChannel(ch, t);
          ch.spawnAccumulator -= 1;
        }
      } else {
        ch.spawnAccumulator = 0;
      }

      const dead = ch.deadScratch;
      dead.length = 0;
      ch.pool.forEachActive(p => {
        this._advanceParticle(p, dt, t, effectiveTurbulence);
        if (p.pathT > 1.6 || p.y < -this.height * 0.06) dead.push(p);
      });
      for (const p of dead) this._recycle(ch, p);
    }

    this.trailPool.redrawAll();
  }

  /**
   * Slow, subtle per-CHANNEL density variation over time — NOT lane weighting.
   * Renamed from _laneWeightBias, which was a misnomer: this modulates one
   * channel's overall spawn rate over time, it does not bias which of the 7 lanes
   * gets picked for an individual spawn (see VFX.pickWeightedLane in
   * vfx-fountain-types.js for that — M2 hardening item 5).
   */
  _channelDensityModulation(ch, t) {
    return 0.85 + 0.15 * (0.5 + 0.5 * this.flowField.noise2D(ch.name.length * 3.1, t * 0.04));
  }

  _recycle(channel, p) {
    if (p.trail) { this.trailPool.release(p.trail); p.trail = null; }
    channel.pool.release(p);
  }

  _spawnInChannel(channel, t) {
    // center/inner lanes spawn more often than far-outer lanes, matching a
    // natural fountain's denser core (M2 hardening item 5).
    const laneIndex = VFX.pickWeightedLane(() => this._rngLane.next());
    this._laneUsage[laneIndex] = (this._laneUsage[laneIndex] || 0) + 1;
    const p = channel.pool.acquire();
    if (!p) { this._droppedSpawnCount++; return; }

    const depthCfg = channel.depth || VFX.FOUNTAIN_DEPTH_LAYERS.midground;
    const life = vfxLerp(2.2, 3.4, this._rngSpawn.next()) / depthCfg.speedMul;
    const pathSpeed = 1 / (life * 0.82); // reaches pathT=1 slightly before life ends, then fades in overshoot

    let baseScale, tint, rotationSpeed, shimmerSpeed, shimmerPhase, hasTrail = false, texture = null, trailColor = 0xffffff;
    if (channel.isHeart) {
      const sizeCat = this._rngSize.weightedPick(VFX_SIZE_WEIGHTS);
      const range = VFX.FOUNTAIN_SIZE_CATEGORIES[sizeCat];
      const px = vfxLerp(range.min, range.max, this._rngSize.next());
      const variant = this._rngVariant.pick(VFX_HEART_VARIANTS);
      // each spawn picks its OWN cached texture for the chosen variant+size — a
      // HERO heart gets HERO's own baked texture (never upscaling MEDIUM's), and
      // scale below is always <=1 relative to that texture's own baked max, so no
      // category ever renders past its native baked resolution (M2 hardening
      // item 11, "HERO must not upscale a MEDIUM texture").
      texture = this._heartTextureCache[variant][sizeCat];
      baseScale = (px / range.max) * depthCfg.scaleMul;
      // tint stays white: color already comes from the baked texture's dark/base/
      // light facets. Tinting on top would multiply over that gradient and wash
      // it toward whatever tint color was picked, destroying the intended
      // light/base/dark relationship (M2 hardening item 11, the actual prior bug —
      // texture and tint were previously picked from two INDEPENDENT random
      // draws, so a violet-baked heart could get a pink tint multiplied over it).
      tint = 0xffffff;
      trailColor = VFX.FOUNTAIN_HEART_COLORS[variant].base; // trails are untextured Graphics — they need a real color
      rotationSpeed = vfxLerp(-0.4, 0.4, this._rngRotation.next());
      shimmerSpeed = vfxLerp(1.2, 2.4, this._rngShimmer.next());
      shimmerPhase = this._rngShimmer.next() * Math.PI * 2;
      hasTrail = !!channel.trailEligible && this.budget.trailsEnabled && this._rngTrail.chance(this.budget.trailChance);
    } else {
      baseScale = vfxLerp(0.5, 1.1, this._rngSize.next()) * depthCfg.scaleMul * (channel.kind === 'dust' ? 0.4 : 1);
      tint = 0xffffff;
      rotationSpeed = channel.kind === 'star' ? vfxLerp(-1.5, 1.5, this._rngRotation.next()) : 0;
      shimmerSpeed = 0;
      shimmerPhase = 0;
    }

    p.reset({
      x: 0, y: 0, vx: 0, vy: 0,
      life,
      scale: baseScale,
      alpha: depthCfg.alphaMul * vfxLerp(0.85, 1, this._rngSpawn.next()),
      tint,
      lane: laneIndex,
      rotation: this._rngRotation.next() * Math.PI * 2,
      rotationSpeed,
      shimmerSpeed,
      shimmerPhase,
      hasTrail,
      kind: channel.kind,
      additive: channel.additive,
      texture
    });
    p.laneIndex = laneIndex;
    p.pathT = 0;
    p.pathSpeed = pathSpeed;
    p.noiseSeed = this._rngSpawn.next() * 1000;
    p.trail = null;
    if (hasTrail) {
      p.trail = this.trailPool.acquire({ tint: trailColor, alpha: 0.5 * depthCfg.glowMul, width: baseScale * 6, color: trailColor });
    }
  }

  _advanceParticle(p, dt, t, turbulence) {
    p.integrate(dt); // age += dt, and rotation += rotationSpeed*dt via subclass override
    p.pathT += p.pathSpeed * dt;

    const lane = VFX.FLOW_LANES[p.laneIndex];
    const [p0, p1, p2, p3] = lane.points;
    const clampedT = Math.min(1, p.pathT);
    const point = VFX.bezierPointInto(this._scratchPoint, p0, p1, p2, p3, clampedT);
    let nx = point.x, ny = point.y;

    if (p.pathT > 1) {
      const tangentPoint = VFX.bezierPointInto(this._scratchTangent, p0, p1, p2, p3, 0.97);
      const dx = point.x - tangentPoint.x, dy = point.y - tangentPoint.y;
      const overshoot = (p.pathT - 1) * 10;
      nx = point.x + dx * overshoot;
      ny = point.y + dy * overshoot;
    }

    // seeded smooth-noise side drift (normalized units, small)
    const drift = this.flowField.noise2D(p.laneIndex * 5.1 + 0.5, t * 0.35 + p.noiseSeed) * 0.018 * turbulence;
    nx = 0.5 + (nx - 0.5) * this._widthMul + drift;

    p.x = nx * this.width;
    p.y = ny * this.height;

    // fade near the top boundary (topFadeY .. removedY), independent of pathT overshoot math
    const g = VFX.FOUNTAIN_GEOMETRY;
    const fadeStart = g.topFadeY * this.height;
    const fadeEnd = g.removedY * this.height;
    let edgeFade = 1;
    if (p.y < fadeStart) edgeFade = vfxClamp01((p.y - fadeEnd) / (fadeStart - fadeEnd));

    p.syncSprite(); // applies the fade-in/hold/fade-out scale+alpha curve
    p.sprite.alpha *= edgeFade;

    // scale shimmer via seeded noise, multiplied onto (not replacing) the fade curve
    // syncSprite() just applied, so hearts still grow in on spawn and shrink on despawn
    const shimmerNoise = this.flowField.noise2D(p.noiseSeed + 3.7, t * 0.5);
    const shimmerMul = 1 + shimmerNoise * 0.06;
    p.sprite.scale.set(p.sprite.scale.x * shimmerMul);

    if (p.trail) p.trail.pushPoint(p.x, p.y);
  }

  // ---- diagnostics ----------------------------------------------------------
  get activeCount() {
    return this._channels.reduce((sum, ch) => sum + ch.pool.activeCount, 0);
  }

  get poolUsage() {
    const totalCap = this._channels.reduce((s, ch) => s + ch.pool.capacity, 0);
    return totalCap ? this.activeCount / totalCap : 0;
  }

  diagnostics() {
    const byType = {};
    for (const ch of this._channels) byType[ch.name] = ch.pool.activeCount;
    const byDepth = { background: 0, midground: 0, foreground: 0 };
    for (const ch of this._channels) if (ch.depthKey) byDepth[ch.depthKey] += ch.pool.activeCount;
    return {
      totalActive: this.activeCount,
      byType,
      byDepth,
      trailCount: this.trailPool.activeCount,
      trailCapacity: this.trailPool.capacity,
      laneUsage: this._laneUsage.slice(),
      droppedSpawnCount: this._droppedSpawnCount + this.trailPool.droppedSpawnCount,
      sourceIntensity: +(this._gates.source * this._intensityUser).toFixed(2),
      textureCount: this.registry.textureCount,
      textureMemoryBytes: this.registry.estimateMemoryBytes()
    };
  }

  destroy() {
    this._entranceTimeline?.kill();
    for (const ch of this._channels) ch.pool.destroy();
    this.trailPool.destroy();
    this.source.destroy();
    this.container.destroy({ children: true });
  }
};
