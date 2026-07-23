// vfx-quality-manager.js — resolves the active quality preset. In 'auto' mode it
// steps quality up/down based on PerformanceMonitor's rolling FPS, with hysteresis
// so it doesn't oscillate at the boundary. Also forces LOW + disables turbulence
// when prefers-reduced-motion is set (requirement: reduced-motion support).
window.VFX = window.VFX || {};

VFX.QualityManager = class QualityManager {
  /** @param {VFX.PerformanceMonitor} performanceMonitor */
  constructor(performanceMonitor, initialMode = VFX.QualityMode.AUTO) {
    this.perf = performanceMonitor;
    this.mode = initialMode;
    this._autoLevel = 2; // index into LADDER, start at HIGH
    this._cooldown = 0;
    this._reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
    this._mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    this._onMqChange = e => { this._reducedMotion = e.matches; };
    this._mq?.addEventListener?.('change', this._onMqChange);
  }

  static LADDER = [VFX.QualityMode.LOW, VFX.QualityMode.MEDIUM, VFX.QualityMode.HIGH, VFX.QualityMode.ULTRA];

  get reducedMotion() { return this._reducedMotion; }

  setMode(mode) { this.mode = mode; }

  /** Resolved preset for the current frame — call every tick if mode is AUTO.
   * `reducedMotion` on the returned preset lets consumers (e.g. FountainEmitter)
   * pick a dedicated reduced-motion configuration instead of treating it as just
   * another name for `low` — see M2 hardening item 13. */
  resolve() {
    if (this._reducedMotion) return { name: VFX.QualityMode.LOW, ...VFX.QUALITY_PRESETS[VFX.QualityMode.LOW], turbulence: 0, reducedMotion: true };
    if (this.mode !== VFX.QualityMode.AUTO) {
      return { name: this.mode, ...VFX.QUALITY_PRESETS[this.mode], turbulence: 1, reducedMotion: false };
    }
    this._stepAuto();
    const name = QualityManager.LADDER[this._autoLevel];
    return { name, ...VFX.QUALITY_PRESETS[name], turbulence: 1, reducedMotion: false };
  }

  _stepAuto() {
    if (this._cooldown > 0) { this._cooldown--; return; }
    const fps = this.perf.fps;
    if (fps === 0) return; // not enough samples yet
    if (fps < 45 && this._autoLevel > 0) {
      this._autoLevel--;
      this._cooldown = 90; // ~1.5s at 60Hz before allowed to step again
    } else if (fps >= 58 && this._autoLevel < QualityManager.LADDER.length - 1) {
      this._autoLevel++;
      this._cooldown = 90;
    }
  }

  destroy() {
    this._mq?.removeEventListener?.('change', this._onMqChange);
  }
};
