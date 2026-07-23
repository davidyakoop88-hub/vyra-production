// vfx-demo.js — DEV-ONLY demo scene for Milestone 1. Only runs when ?vfxdemo=1 is
// in the URL (this file is only even loaded in that case — see the loader in
// media.js). Exists purely to verify the engine's architecture and movement
// quality: simple glowing circles, five flow lanes, controlled upward fountain
// movement, smooth left/right turbulence, pooling, transparent output. No hearts,
// avatars, presets, or live-event wiring — that's a later milestone.
(function () {
  function mount() {
    if (window.VFX_DEMO) return; // already mounted

    const mountEl = document.createElement('div');
    mountEl.id = 'vfx-demo-root';
    Object.assign(mountEl.style, { position: 'fixed', inset: '0', zIndex: 100000, pointerEvents: 'none' });
    document.body.appendChild(mountEl);

    const engine = new VFX.Engine({ mountEl, quality: VFX.QualityMode.AUTO, debug: true });

    const w = engine.renderer.width;
    const h = engine.renderer.height;
    const flowField = new VFX.FlowField(1234, 5, { x: 0, width: w });
    const texture = engine.textures.getGlowCircle('demo-dot', 18);
    const spawnZone = VFX.SpawnZone.line(w * 0.12, w * 0.88, h - 24);

    const system = new VFX.ParticleSystem({
      texture,
      spawnZone,
      flowField,
      capacity: VFX.QUALITY_PRESETS[VFX.QualityMode.ULTRA].maxParticles,
      spawnRate: 40,
      life: { min: 2.2, max: 3.4 },
      scale: { min: 0.5, max: 1.15 },
      speed: { min: 140, max: 240 },
      tints: [0xb13cff, 0xff4da6, 0x60a5fa, 0xffe14d, 0xffffff]
    });

    const scene = engine.createScene('demo-fountain');
    scene.addLayer('fountain');
    scene.addSystem('fountain', system);
    scene.applyQuality(engine.quality.resolve());

    engine.setActiveScene('demo-fountain');
    engine.start();

    window.VFX_DEMO = { engine, scene, system, mountEl, unmount };
    console.log('[VFX demo] mounted —', engine.diagnostics);
  }

  function unmount() {
    if (!window.VFX_DEMO) return;
    window.VFX_DEMO.engine.destroy();
    window.VFX_DEMO.mountEl.remove();
    window.VFX_DEMO = null;
    console.log('[VFX demo] unmounted');
  }

  window.VFX_DEMO_MOUNT = mount;
  window.VFX_DEMO_UNMOUNT = unmount;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
