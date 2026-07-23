// vfx-particle-system.js — spawns, steers, and recycles a pool of BaseParticle
// instances into a PIXI.ParticleContainer (GPU-batched, one draw call for the whole
// system). Every pooled particle's sprite is added to the container exactly once,
// at prewarm time, and never removed again — recycling only toggles visibility, so
// there's no per-spawn addChild/removeChild churn.
window.VFX = window.VFX || {};

VFX.ParticleSystem = class ParticleSystem {
  /**
   * @param {Object} opts
   * @param {PIXI.Texture} opts.texture
   * @param {VFX.SpawnZone} opts.spawnZone
   * @param {VFX.FlowField} opts.flowField
   * @param {number} opts.capacity - pool size, sized for the highest quality mode in use
   * @param {number} [opts.spawnRate] - particles per second
   * @param {{min:number,max:number}} [opts.life]
   * @param {{min:number,max:number}} [opts.scale]
   * @param {{min:number,max:number}} [opts.speed] - upward speed, px/s
   * @param {number[]} [opts.tints]
   */
  constructor(opts) {
    this.flowField = opts.flowField;
    this.spawnZone = opts.spawnZone;
    this.spawnRate = opts.spawnRate ?? 20;
    this.life = opts.life ?? { min: 2.5, max: 4 };
    this.scale = opts.scale ?? { min: 0.5, max: 1 };
    this.speed = opts.speed ?? { min: 120, max: 220 };
    this.tints = opts.tints ?? [0xffffff];
    this.maxActive = opts.capacity;

    this.container = new PIXI.ParticleContainer(opts.capacity, {
      vertices: false, position: true, rotation: false, uvs: false, alpha: true, tint: true
    });

    this.pool = new VFX.ParticlePool(() => {
      const p = new VFX.BaseParticle(opts.texture);
      this.container.addChild(p.sprite);
      return p;
    }, opts.capacity);

    this._spawnAccumulator = 0;
    this._laneCursor = 0;
    this._rand = Math.random;
  }

  setMaxActive(n) { this.maxActive = Math.min(n, this.pool.capacity); }

  _spawnOne(t) {
    const point = this.spawnZone.point(this._rand);
    const lane = this.flowField.laneCount > 0 ? this._laneCursor % this.flowField.laneCount : 0;
    this._laneCursor++;
    const p = this.pool.acquire();
    if (!p) return; // pool exhausted — dropped, not queued (bounded by design)
    const speed = this.speed.min + this._rand() * (this.speed.max - this.speed.min);
    p.reset({
      x: point.x,
      y: point.y,
      vx: 0,
      vy: -speed,
      life: this.life.min + this._rand() * (this.life.max - this.life.min),
      scale: this.scale.min + this._rand() * (this.scale.max - this.scale.min),
      alpha: 0.85 + this._rand() * 0.15,
      tint: this.tints[Math.floor(this._rand() * this.tints.length)],
      lane
    });
  }

  /** @param {number} dt fixed-timestep seconds @param {number} t sim time seconds @param {number} turbulence 0..1 */
  update(dt, t, turbulence = 1) {
    if (this.pool.activeCount < this.maxActive) {
      this._spawnAccumulator += this.spawnRate * dt;
      while (this._spawnAccumulator >= 1 && this.pool.activeCount < this.maxActive) {
        this._spawnOne(t);
        this._spawnAccumulator -= 1;
      }
    }

    const dead = [];
    this.pool.forEachActive(p => {
      p.vx += this.flowField.steer(p, t, turbulence) * dt;
      p.vx *= 0.98; // damping so lane-pull + noise settle instead of oscillating forever
      p.integrate(dt);
      p.syncSprite();
      if (p.isDead) dead.push(p);
    });
    for (const p of dead) this.pool.release(p);
  }

  get activeCount() { return this.pool.activeCount; }
  get poolUsage() { return this.pool.usageRatio; }

  destroy() {
    this.pool.destroy();
    this.container.destroy({ children: true });
  }
};
