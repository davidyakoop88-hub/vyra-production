// vfx-flow-field.js — seeded smooth (value) noise for organic turbulence, plus a
// small set of vertical "lanes" particles are softly steered toward. Deterministic:
// the same seed always produces the same field, so a scene's motion is reproducible.
window.VFX = window.VFX || {};

function vfxMulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function vfxSmoothstep(t) { return t * t * (3 - 2 * t); }

VFX.FlowField = class FlowField {
  /**
   * @param {number} seed
   * @param {number} laneCount
   * @param {{x:number,width:number}} bounds - horizontal extent lanes are spread over
   * @param {number} [latticeSize] - resolution of the value-noise lattice
   */
  constructor(seed, laneCount, bounds, latticeSize = 32) {
    this.seed = seed >>> 0;
    this.laneCount = Math.max(1, laneCount);
    this.bounds = bounds;
    this.latticeSize = latticeSize;

    const rand = vfxMulberry32(this.seed);
    this._lattice = new Float32Array(latticeSize * latticeSize);
    for (let i = 0; i < this._lattice.length; i++) this._lattice[i] = rand() * 2 - 1;

    this._laneX = [];
    const step = bounds.width / (this.laneCount + 1);
    for (let i = 0; i < this.laneCount; i++) this._laneX.push(bounds.x + step * (i + 1));
  }

  laneCenterX(laneIndex) {
    return this._laneX[((laneIndex % this.laneCount) + this.laneCount) % this.laneCount];
  }

  randomLane(rand = Math.random) {
    return Math.floor(rand() * this.laneCount);
  }

  _latticeValue(ix, iy) {
    const n = this.latticeSize;
    const wrappedX = ((ix % n) + n) % n;
    const wrappedY = ((iy % n) + n) % n;
    return this._lattice[wrappedY * n + wrappedX];
  }

  /** Smooth 2D value noise in [-1, 1] at continuous coordinates (x, y). */
  noise2D(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = vfxSmoothstep(x - x0), fy = vfxSmoothstep(y - y0);
    const v00 = this._latticeValue(x0, y0);
    const v10 = this._latticeValue(x0 + 1, y0);
    const v01 = this._latticeValue(x0, y0 + 1);
    const v11 = this._latticeValue(x0 + 1, y0 + 1);
    const a = v00 + (v10 - v00) * fx;
    const b = v01 + (v11 - v01) * fx;
    return a + (b - a) * fy;
  }

  /**
   * Horizontal steering acceleration for a particle: blends a soft pull toward its
   * lane center with left/right turbulence sampled from the noise field over time.
   * @returns {number} px/s^2, apply directly to particle.vx
   */
  steer(particle, t, turbulenceStrength = 1) {
    const laneX = this.laneCenterX(particle.lane);
    const pull = (laneX - particle.x) * 1.8;
    const n = this.noise2D(particle.y * 0.01, t * 0.35 + particle.lane * 17.3);
    const turbulence = n * 90 * turbulenceStrength;
    return pull + turbulence;
  }
};
