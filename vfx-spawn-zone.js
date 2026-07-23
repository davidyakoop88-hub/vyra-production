// vfx-spawn-zone.js — where new particles come from. v1 ships a horizontal line
// zone (fountain base) and a rect zone (general area fill); both yield a spawn
// point plus an optional lane assignment so a ParticleSystem can hand the result
// straight to FlowField-aware particles.
window.VFX = window.VFX || {};

VFX.SpawnZone = class SpawnZone {
  /** @param {(rand: () => number) => {x:number,y:number}} pointFn */
  constructor(pointFn) {
    this._pointFn = pointFn;
  }

  point(rand = Math.random) { return this._pointFn(rand); }

  static line(x0, x1, y) {
    return new VFX.SpawnZone(rand => ({ x: x0 + (x1 - x0) * rand(), y }));
  }

  static rect(x, y, width, height) {
    return new VFX.SpawnZone(rand => ({ x: x + width * rand(), y: y + height * rand() }));
  }

  static point(x, y) {
    return new VFX.SpawnZone(() => ({ x, y }));
  }
};
