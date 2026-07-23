// vfx-performance-monitor.js — rolling FPS/frame-time sampler, independent of any
// particular scene so QualityManager and VfxDebugOverlay can both read from one source.
window.VFX = window.VFX || {};

VFX.PerformanceMonitor = class PerformanceMonitor {
  constructor(sampleWindow = 60) {
    this.sampleWindow = sampleWindow;
    this._frameTimes = [];
    this._lastTime = null;
    this.fps = 0;
    this.avgFrameMs = 0;
    this.worstFrameMs = 0;
  }

  /** Call once per rendered frame with the current high-res timestamp (ms). */
  tick(now) {
    if (this._lastTime != null) {
      const dtMs = now - this._lastTime;
      this._frameTimes.push(dtMs);
      if (this._frameTimes.length > this.sampleWindow) this._frameTimes.shift();
      let sum = 0, worst = 0;
      for (const t of this._frameTimes) { sum += t; if (t > worst) worst = t; }
      this.avgFrameMs = sum / this._frameTimes.length;
      this.worstFrameMs = worst;
      this.fps = this.avgFrameMs > 0 ? Math.round(1000 / this.avgFrameMs) : 0;
    }
    this._lastTime = now;
  }

  reset() {
    this._frameTimes.length = 0;
    this._lastTime = null;
    this.fps = 0;
    this.avgFrameMs = 0;
    this.worstFrameMs = 0;
  }

  report() {
    return { fps: this.fps, avgFrameMs: +this.avgFrameMs.toFixed(2), worstFrameMs: +this.worstFrameMs.toFixed(2) };
  }
};
