// vfx-scene.js — a self-contained composition: named z-ordered layers, each holding
// one or more ParticleSystems. Owns exactly one PIXI.Container (added to the
// engine's stage on mount, removed on unmount) so a scene can be swapped in/out
// without tearing down the renderer itself.
window.VFX = window.VFX || {};

VFX.Scene = class Scene {
  constructor(name) {
    this.name = name;
    this.root = new PIXI.Container();
    this._layers = new Map(); // name -> PIXI.Container
    this._systems = []; // { system, layer }
    this.mounted = false;
    this._destroyed = false;
    // set by a caller (e.g. the fountain demo) to opt this scene's systems out of
    // Engine's generic tickSkip mechanism — see vfx-engine.js _fixedUpdate and
    // vfx-fountain-demo.js for why (M2 hardening item 3).
    this.fixedRateOnly = false;
  }

  /** @returns {PIXI.Container} */
  addLayer(name, zIndex = this._layers.size) {
    if (this._destroyed) throw new Error(`[VFX] Scene "${this.name}" is destroyed`);
    if (this._layers.has(name)) return this._layers.get(name);
    const layer = new PIXI.Container();
    layer.zIndex = zIndex;
    this.root.sortableChildren = true;
    this.root.addChild(layer);
    this._layers.set(name, layer);
    return layer;
  }

  /** @param {VFX.ParticleSystem} system */
  addSystem(layerName, system) {
    if (this._destroyed) throw new Error(`[VFX] Scene "${this.name}" is destroyed`);
    const layer = this._layers.get(layerName) || this.addLayer(layerName);
    layer.addChild(system.container);
    this._systems.push({ system, layer });
    return system;
  }

  mount(stage) {
    if (this._destroyed) throw new Error(`[VFX] Scene "${this.name}" is destroyed`);
    if (this.mounted) return;
    stage.addChild(this.root);
    this.mounted = true;
  }

  unmount() {
    if (!this.mounted) return;
    this.root.parent?.removeChild(this.root);
    this.mounted = false;
  }

  /** @param {number} dt fixed-timestep seconds @param {number} t sim time @param {number} turbulence */
  update(dt, t, turbulence) {
    if (this._destroyed) return;
    for (const { system } of this._systems) system.update(dt, t, turbulence);
  }

  /** Prefers a system's own applyQuality(preset) (the full resolved preset, e.g.
   * FountainEmitter's domain-specific budget mapping) and falls back to the
   * older, generic setMaxActive(preset.maxParticles) for systems (like M1's plain
   * VFX.ParticleSystem) that only implement that narrower interface. This is what
   * makes quality changes fully engine-driven for systems that need more than a
   * single particle-cap number (M2 hardening item 6).
   * @param {{maxParticles:number, name:string}} preset */
  applyQuality(preset) {
    if (this._destroyed) return;
    for (const { system } of this._systems) {
      if (typeof system.applyQuality === 'function') system.applyQuality(preset);
      else system.setMaxActive(preset.maxParticles);
    }
  }

  /** Forwards a real logical-pixel resize to every system that implements
   * resize(width,height) — e.g. FountainEmitter (M2 hardening item 2). */
  resize(width, height) {
    if (this._destroyed) return;
    for (const { system } of this._systems) {
      if (typeof system.resize === 'function') system.resize(width, height);
    }
  }

  /** @returns {{system: VFX.ParticleSystem, layer: PIXI.Container}[]} read-only view for diagnostics */
  getSystems() { return this._systems; }

  get totalActiveCount() {
    return this._systems.reduce((sum, { system }) => sum + system.activeCount, 0);
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.unmount();
    for (const { system, layer } of this._systems) {
      // detach the system's own container from its layer BEFORE the system
      // destroys it, and destroy layers separately below with children:false —
      // otherwise root.destroy({children:true}) would recurse into a subtree the
      // system has already torn down (M2 hardening item 14: double-destroy risk).
      if (system.container?.parent === layer) layer.removeChild(system.container);
      system.destroy();
    }
    this._systems.length = 0;
    for (const layer of this._layers.values()) layer.destroy({ children: true });
    this._layers.clear();
    this.root.destroy({ children: false });
  }
};
