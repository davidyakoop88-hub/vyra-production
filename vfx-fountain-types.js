// vfx-fountain-types.js — constants and lane geometry for the Milestone 2 fountain
// emitter. Fixes the Milestone 1 limitation where spawn zones were fixed absolute
// pixels: everything here is normalized (0..1 across width, 0=top/1=bottom across
// height) and re-evaluated against the current canvas size, so it stays correct on
// resize and across aspect ratios.
window.VFX = window.VFX || {};

VFX.FOUNTAIN_GEOMETRY = Object.freeze({
  sourceX: 0.50,
  sourceY: 0.93,
  bottomHalfWidth: 0.11 / 2,   // avg of the 0.08–0.14 bottom-width range
  middleHalfWidth: 0.33 / 2,   // avg of the 0.26–0.40 middle-width range
  upperHalfWidth: 0.51 / 2,    // avg of the 0.42–0.60 upper-width range
  topFadeY: 0.12,
  removedY: -0.05
});

/** Cubic bezier evaluation, t in [0,1]. Points are {x,y} in normalized space.
 * Allocates a fresh {x,y} — fine for one-off callers (e.g. the debug panel's lane
 * drawing) but NOT for the per-particle hot path; use bezierPointInto for that. */
VFX.bezierPoint = function (p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y
  };
};

/**
 * Allocation-free cubic bezier evaluation — writes into a caller-owned `out`
 * ({x,y}) and returns it, instead of allocating a new object every call.
 * FountainEmitter keeps one reusable scratch object per call site and calls this
 * every tick for every active particle (up to ~600 at Ultra x 60Hz) — the plain
 * allocating VFX.bezierPoint would mean tens of thousands of short-lived object
 * allocations per second there.
 */
VFX.bezierPointInto = function (out, p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  out.x = a * p0.x + b * p1.x + c * p2.x + d * p3.x;
  out.y = a * p0.y + b * p1.y + c * p2.y + d * p3.y;
  return out;
};

/**
 * Seven lanes, spread symmetrically around center. `spread` is the signed fraction
 * of the fan's max half-width this lane reaches at the top (−1 = full left,
 * +1 = full right). Outer lanes get a larger spread and a more pronounced bezier
 * bulge (arc); inner/center lanes stay closer to a straight vertical path.
 */
VFX.FLOW_LANES = (function () {
  const g = VFX.FOUNTAIN_GEOMETRY;
  const defs = [
    { name: 'far-left', spread: -1.00, bulge: 1.00 },
    { name: 'outer-left', spread: -0.70, bulge: 0.85 },
    { name: 'inner-left', spread: -0.35, bulge: 0.55 },
    { name: 'center', spread: 0.00, bulge: 0.15 },
    { name: 'inner-right', spread: 0.35, bulge: 0.55 },
    { name: 'outer-right', spread: 0.70, bulge: 0.85 },
    { name: 'far-right', spread: 1.00, bulge: 1.00 }
  ];
  const p0 = { x: g.sourceX, y: g.sourceY };
  return defs.map((d, i) => {
    const p1 = { x: g.sourceX + d.spread * g.bottomHalfWidth * 0.6 * d.bulge, y: g.sourceY - (g.sourceY - g.topFadeY) * 0.25 };
    const p2 = { x: g.sourceX + d.spread * g.middleHalfWidth * 1.1 * d.bulge, y: g.sourceY - (g.sourceY - g.topFadeY) * 0.65 };
    const p3 = { x: g.sourceX + d.spread * g.upperHalfWidth, y: g.topFadeY };
    return { index: i, name: d.name, spread: d.spread, points: [p0, p1, p2, p3] };
  });
})();

/**
 * Per-lane spawn-frequency weights — center/inner lanes spawn more often than far
 * outer lanes, matching a natural fountain's denser core (M2 hardening item 5).
 * Derived from |spread| (0 at center, 1 at the far edges): weight = 1 - 0.55*|spread|,
 * so center = 1.0, far outer = 0.45 (center is ~2.2x more likely than an outer lane).
 */
VFX.LANE_SPAWN_WEIGHTS = VFX.FLOW_LANES.map(lane => 1 - 0.55 * Math.abs(lane.spread));

/**
 * Weighted lane pick favoring center/inner lanes per VFX.LANE_SPAWN_WEIGHTS.
 * @param {() => number} randFn returns a value in [0,1)
 * @returns {number} lane index into VFX.FLOW_LANES
 */
VFX.pickWeightedLane = function (randFn) {
  let total = 0;
  for (const w of VFX.LANE_SPAWN_WEIGHTS) total += w;
  let r = randFn() * total, acc = 0;
  for (let i = 0; i < VFX.LANE_SPAWN_WEIGHTS.length; i++) {
    acc += VFX.LANE_SPAWN_WEIGHTS[i];
    if (r <= acc) return i;
  }
  return VFX.LANE_SPAWN_WEIGHTS.length - 1;
};

VFX.FOUNTAIN_SIZE_CATEGORIES = Object.freeze({
  TINY: { min: 10, max: 18 },
  SMALL: { min: 18, max: 34 },
  MEDIUM: { min: 34, max: 58 },
  HERO: { min: 58, max: 96 }
});

VFX.FOUNTAIN_HEART_COLORS = Object.freeze({
  violet: { base: 0xa855f7, light: 0xe9d5ff, dark: 0x5b21b6 },
  pink: { base: 0xff3b9d, light: 0xffe4f1, dark: 0x9d174d },
  blue: { base: 0x38bdf8, light: 0xd6f3ff, dark: 0x1e40af },
  gold: { base: 0xfbbf24, light: 0xfff7cc, dark: 0x92400e }
});

/** BACKGROUND / MIDGROUND / FOREGROUND depth-layer tuning. */
VFX.FOUNTAIN_DEPTH_LAYERS = Object.freeze({
  background: { populationShare: 0.30, scaleMul: 0.55, alphaMul: 0.5, speedMul: 0.75, glowMul: 0.4, zIndex: 0 },
  midground: { populationShare: 0.55, scaleMul: 1.0, alphaMul: 0.85, speedMul: 1.0, glowMul: 0.8, zIndex: 1 },
  foreground: { populationShare: 0.15, scaleMul: 1.35, alphaMul: 1.0, speedMul: 1.15, glowMul: 1.2, zIndex: 2 }
});

/**
 * Fountain-specific quality budgets. Distinct from VFX.QUALITY_PRESETS (M1, generic
 * engine-wide caps) because this emitter has domain-specific knobs (trails, sparkle
 * density, texture resolution) a generic particle system doesn't know about.
 * Starting points only — see VYRA_VFX_ENGINE_M2_REPORT.md §"Quality budgets" for the
 * measured, adjusted values.
 */
VFX.FOUNTAIN_QUALITY_BUDGETS = {
  low: { maxActive: 120, trailsEnabled: false, trailChance: 0, sparkleDensity: 0.5, textureScale: 0.75, bloomStrength: 0.5, depthParticles: false },
  medium: { maxActive: 220, trailsEnabled: true, trailChance: 0.08, trailLength: 4, sparkleDensity: 0.8, textureScale: 1, bloomStrength: 0.75, depthParticles: true },
  high: { maxActive: 380, trailsEnabled: true, trailChance: 0.16, trailLength: 6, sparkleDensity: 1, textureScale: 1, bloomStrength: 1, depthParticles: true },
  ultra: { maxActive: 600, trailsEnabled: true, trailChance: 0.24, trailLength: 8, sparkleDensity: 1.2, textureScale: Math.min(2, window.devicePixelRatio || 1), bloomStrength: 1.25, depthParticles: true },
  /**
   * Dedicated reduced-motion configuration (M2 hardening item 13) — distinct from
   * plain `low`, not just an alias for it. Engine-level turbulence is already forced
   * to 0 for reduced-motion (see QualityManager.resolve()), which zeroes the
   * fountain's own drift/shimmer noise "for free" via the turbulence parameter
   * update() already receives; this budget additionally cuts particle count well
   * below `low` and removes trails/hero-scale variety entirely, so a
   * reduced-motion viewer sees a calm, mostly-static-looking trickle rather than a
   * merely-cheaper version of the full fountain.
   */
  reducedMotion: { maxActive: 60, trailsEnabled: false, trailChance: 0, sparkleDensity: 0.3, textureScale: 0.75, bloomStrength: 0.4, depthParticles: false }
};
