// vfx-engine.js — top-level orchestrator and the module other code is meant to talk
// to. Owns the renderer, fixed-timestep ticker, quality/performance monitors, the
// procedural texture cache, and a registry of Scenes. destroy() tears every one of
// those down in dependency order — this is the single cleanup path the "mount/
// unmount" and "no leaked listeners/contexts" requirements are verified against.
window.VFX = window.VFX || {};

VFX.Engine = class Engine {
  /** @param {VFX.VfxEngineOptions} opts */
  constructor(opts) {
    if (!opts?.mountEl) throw new Error('[VFX] Engine requires opts.mountEl');
    this.mountEl = opts.mountEl;

    this.perf = new VFX.PerformanceMonitor();
    this.quality = new VFX.QualityManager(this.perf, opts.quality || VFX.QualityMode.AUTO);
    const initialPreset = this.quality.resolve();

    this.renderer = new VFX.Renderer(this.mountEl, {
      resolutionScale: initialPreset.resolutionScale,
      onResize: (w, h) => this._handleResize(w, h)
    });
    this.textures = new VFX.TextureRegistry(this.renderer.app.renderer);

    this.scenes = new Map();
    this.activeScene = null;
    this._currentPreset = initialPreset;
    this._skipCounter = 0;

    this.debug = opts.debug ? new VFX.DebugOverlay(this) : null;

    this.ticker = new VFX.Ticker(
      dt => this._fixedUpdate(dt),
      (_alpha, now) => this._render(now)
    );

    this._destroyed = false;
  }

  createScene(name) {
    if (this._destroyed) throw new Error('[VFX] Engine is destroyed');
    if (this.scenes.has(name)) throw new Error(`[VFX] Scene "${name}" already exists — destroy it first or choose a different name`);
    const scene = new VFX.Scene(name);
    this.scenes.set(name, scene);
    return scene;
  }

  setActiveScene(name) {
    if (this._destroyed) throw new Error('[VFX] Engine is destroyed');
    if (this.activeScene?.name === name) return; // already active — avoid a pointless unmount/remount
    const scene = this.scenes.get(name);
    if (!scene) throw new Error(`[VFX] Unknown scene "${name}" — call createScene() first`);
    if (this.activeScene) this.activeScene.unmount();
    scene.mount(this.renderer.stage);
    this.activeScene = scene;
    // apply the current quality preset immediately rather than waiting for the
    // next quality *change* — a freshly mounted scene should never render even one
    // frame at the wrong budget (M2 hardening item 15).
    scene.applyQuality(this._currentPreset);
  }

  start() {
    if (this._destroyed) return;
    this.ticker.start();
  }
  stop() { this.ticker.stop(); }

  _handleResize(width, height) {
    // Renderer -> Engine -> active Scene -> every resizable system (M2 hardening
    // item 2). Logical (CSS-pixel) dimensions only — see vfx-renderer.js.
    this.activeScene?.resize(width, height);
  }

  _fixedUpdate(dt) {
    const preset = this.quality.resolve();
    if (preset.name !== this._currentPreset.name) {
      this.renderer.setResolutionScale(preset.resolutionScale);
      this.activeScene?.applyQuality?.(preset);
    }
    this._currentPreset = preset;

    const scene = this.activeScene;
    if (!scene) return;

    if (scene.fixedRateOnly) {
      // opts out of tickSkip entirely (M2 hardening item 3) — tickSkip skips fixed
      // ticks and replays the backlog as one large effectiveDt jump, which is
      // visible stutter for a system with no render interpolation. Scenes that set
      // this (currently the M2 fountain demo) rely on their own quality budget to
      // scale cost down instead.
      scene.update(dt, this.ticker.simTime, preset.turbulence);
      return;
    }

    this._skipCounter++;
    if (this._skipCounter % preset.tickSkip !== 0) return;
    const effectiveDt = dt * preset.tickSkip;

    scene.update(effectiveDt, this.ticker.simTime, preset.turbulence);
  }

  _render(now) {
    this.perf.tick(now);
    this.renderer.renderFrame();
    this.debug?.update();
  }

  get diagnostics() {
    return {
      fps: this.perf.fps,
      avgFrameMs: this.perf.avgFrameMs,
      quality: this._currentPreset.name,
      activeParticles: this.activeScene?.totalActiveCount ?? 0,
      reducedMotion: this.quality.reducedMotion
    };
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.ticker.destroy();
    this.debug?.destroy();
    for (const scene of this.scenes.values()) scene.destroy();
    this.scenes.clear();
    this.activeScene = null;
    this.textures.destroy();
    this.quality.destroy();
    this.renderer.destroy();
  }
};
