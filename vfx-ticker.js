// vfx-ticker.js — fixed-timestep accumulator loop. Simulation always advances in
// VFX.FIXED_DT increments regardless of actual frame rate, so particle motion is
// deterministic and doesn't change speed on slow machines; rendering still happens
// once per rAF (delta-time-safe: a huge dt spike, e.g. from an OS-level pause or a
// full render() teardown pause elsewhere in the app, is capped so the sim can't try
// to "catch up" with hundreds of steps at once — it just drops the excess time).
window.VFX = window.VFX || {};

VFX.Ticker = class Ticker {
  /**
   * @param {(fixedDt: number) => void} onFixedUpdate - simulation step
   * @param {(alpha: number) => void} onRender - render step; alpha is interpolation
   *   fraction between the last two fixed steps, for optional sub-step smoothing
   */
  constructor(onFixedUpdate, onRender) {
    this._onFixedUpdate = onFixedUpdate;
    this._onRender = onRender;
    this._raf = null;
    this._lastTime = null;
    this._accumulator = 0;
    this._maxCatchUpMs = 250; // drop anything beyond ~15 fixed steps of backlog
    this.running = false;
    this.simTime = 0;
    this.stepCount = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._lastTime = null;
    this._accumulator = 0;
    const loop = now => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      this._frame(now);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _frame(now) {
    if (this._lastTime == null) { this._lastTime = now; return; }
    let dtMs = now - this._lastTime;
    this._lastTime = now;
    if (dtMs > this._maxCatchUpMs) dtMs = this._maxCatchUpMs;

    this._accumulator += dtMs;
    const stepMs = VFX.FIXED_DT * 1000;
    while (this._accumulator >= stepMs) {
      this._onFixedUpdate(VFX.FIXED_DT);
      this._accumulator -= stepMs;
      this.simTime += VFX.FIXED_DT;
      this.stepCount++;
    }
    const alpha = this._accumulator / stepMs;
    this._onRender(alpha, now);
  }

  stop() {
    this.running = false;
    if (this._raf != null) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  destroy() { this.stop(); }
};
