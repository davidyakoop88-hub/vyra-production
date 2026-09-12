// vfx-ticker.js — fixed-timestep accumulator loop. Simulation always advances in
// VFX.FIXED_DT increments regardless of actual frame rate, so particle motion is
// deterministic and doesn't change speed on slow machines; rendering still happens
// once per rAF (delta-time-safe: a huge dt spike, e.g. from an OS-level pause or a
// full render() teardown pause elsewhere in the app, is capped so the sim can't try
// to "catch up" with hundreds of steps at once — it just drops the excess time).
window.VFX = window.VFX || {};

if (!VFX.Ticker?.subscribe) {
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
    VFX.Ticker._instances.add(this);
    VFX.Ticker._ensureFrame();
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
    VFX.Ticker._instances.delete(this);
    VFX.Ticker._idle();
    this._raf = null;
  }

  destroy() { this.stop(); }
};

// All engine tickers and lightweight overlay subscriptions share one browser clock.
VFX.Ticker._instances = new Set();
VFX.Ticker._listeners = new Set();
VFX.Ticker._sharedRaf = null;
VFX.Ticker._ensureFrame = function () {
  if (this._sharedRaf !== null) return;
  this._sharedRaf = requestAnimationFrame(now => {
    this._sharedRaf = null;
    for (const ticker of this._instances) if (ticker.running) { try { ticker._frame(now); } catch (error) { console.error('[VFX] ticker frame failed',error); ticker.stop(); } }
    for (const render of this._listeners) { try { render(now); } catch (error) { console.error('[VFX] overlay frame failed',error); this._listeners.delete(render); } }
    if (this._instances.size || this._listeners.size) this._ensureFrame();
  });
};
VFX.Ticker._idle = function () {
  if (!this._instances.size && !this._listeners.size && this._sharedRaf !== null) {
    cancelAnimationFrame(this._sharedRaf); this._sharedRaf = null;
  }
};
VFX.Ticker.subscribe = function (render) {
  this._listeners.add(render); this._ensureFrame();
  return () => { this._listeners.delete(render); this._idle(); };
};

}
