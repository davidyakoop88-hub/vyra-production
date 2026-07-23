// vfx-debug-overlay.js — dev-only DOM text HUD (not a rendered particle, so it
// doesn't violate the "no DOM particles" rule — this is diagnostics chrome, not
// visual effect content) showing FPS, active particle count, pool usage, and the
// resolved quality mode. Updated at most a few times a second to stay cheap.
window.VFX = window.VFX || {};

VFX.DebugOverlay = class DebugOverlay {
  /** @param {VFX.Engine} engine */
  constructor(engine) {
    this.engine = engine;
    this.el = document.createElement('div');
    this.el.className = 'vfx-debug-overlay';
    Object.assign(this.el.style, {
      position: 'fixed', top: '8px', left: '8px', zIndex: 999999,
      font: '11px/1.5 monospace', color: '#9be9a8', background: 'rgba(8,5,13,.75)',
      border: '1px solid rgba(155,233,168,.3)', borderRadius: '6px', padding: '6px 10px',
      pointerEvents: 'none', whiteSpace: 'pre'
    });
    document.body.appendChild(this.el);
    this._lastUpdate = 0;
    this._updateIntervalMs = 250;
  }

  update() {
    const now = performance.now();
    if (now - this._lastUpdate < this._updateIntervalMs) return;
    this._lastUpdate = now;
    const d = this.engine.diagnostics;
    const scene = this.engine.activeScene;
    const poolLines = scene
      ? scene.getSystems().map(({ system }, i) =>
          `  sys${i}: ${system.activeCount}/${system.pool.capacity} (${(system.poolUsage * 100).toFixed(0)}%)`)
        .join('\n')
      : '  (no active scene)';
    this.el.textContent =
      `VFX ENGINE — dev\n` +
      `fps: ${d.fps}  frame: ${d.avgFrameMs.toFixed?.(1) ?? d.avgFrameMs}ms\n` +
      `quality: ${d.quality}${d.reducedMotion ? ' (reduced-motion)' : ''}\n` +
      `active particles: ${d.activeParticles}\n` +
      poolLines;
  }

  destroy() {
    this.el.remove();
  }
};
