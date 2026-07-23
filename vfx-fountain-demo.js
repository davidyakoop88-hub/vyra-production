// vfx-fountain-demo.js — Milestone 2 dev-only demo. Only present in the page at all
// when ?vfxdemo=2 loaded it (see the loader in media.js). Builds a full
// VFX.FountainEmitter — crystal hearts, sparkles, trails, layered depth, the source
// portal, entrance sequence — with the extended debug panel. The original
// Milestone 1 simple demo (?vfxdemo=1, vfx-demo.js) is untouched and still works as
// a regression baseline.
(function () {
  function mount() {
    if (window.VFX_FOUNTAIN_DEMO) return;

    const mountEl = document.createElement('div');
    mountEl.id = 'vfx-fountain-demo-root';
    Object.assign(mountEl.style, { position: 'fixed', inset: '0', zIndex: 100000, pointerEvents: 'none' });
    document.body.appendChild(mountEl);

    const engine = new VFX.Engine({ mountEl, quality: VFX.QualityMode.AUTO, debug: false });

    // dev-only visual QA hook: ?vfxdemo=2&forceReducedMotion=1 forces the reduced-
    // motion path without needing a real OS accessibility setting change. Same
    // code path as a genuine prefers-reduced-motion match — see QualityManager.
    if (new URLSearchParams(location.search).get('forceReducedMotion') === '1') {
      engine.quality._reducedMotion = true;
    }

    const qualityName = engine.diagnostics.quality;
    const budget = VFX.FOUNTAIN_QUALITY_BUDGETS[qualityName] || VFX.FOUNTAIN_QUALITY_BUDGETS.high;

    const emitter = new VFX.FountainEmitter({
      textureRegistry: engine.textures,
      width: engine.renderer.width,
      height: engine.renderer.height,
      budget,
      seed: 20260721
    });

    const scene = engine.createScene('fountain-m2');
    scene.addLayer('fountain');
    scene.addSystem('fountain', emitter);
    // fountain's own FOUNTAIN_QUALITY_BUDGETS already scales particle count/effects
    // down at low quality — Engine's generic tickSkip (large effectiveDt jumps with
    // no render interpolation) would only add visible stutter on top of that, so
    // this scene opts out of it entirely (M2 hardening item 3).
    scene.fixedRateOnly = true;
    engine.setActiveScene('fountain-m2');

    const debugPanel = new VFX.FountainDebugPanel(engine, emitter);

    // Resize and quality propagation are now fully engine-driven — Renderer's
    // ResizeObserver -> Engine -> Scene.resize()/applyQuality() -> emitter (see
    // vfx-renderer.js, vfx-engine.js, vfx-scene.js — M2 hardening items 2 and 6).
    // This rAF loop exists ONLY to refresh the dev HUD (which self-throttles to
    // ~4Hz internally) — nothing functional depends on it anymore.
    const debugFrame = () => {
      if (!window.VFX_FOUNTAIN_DEMO) return;
      debugPanel.update();
      requestAnimationFrame(debugFrame);
    };
    requestAnimationFrame(debugFrame);

    engine.start();

    window.VFX_FOUNTAIN_DEMO = { engine, scene, emitter, debugPanel, mountEl, unmount };
    console.log('[VFX fountain demo] mounted —', engine.diagnostics, emitter.diagnostics());
  }

  function unmount() {
    if (!window.VFX_FOUNTAIN_DEMO) return;
    const { engine, debugPanel, mountEl } = window.VFX_FOUNTAIN_DEMO;
    window.VFX_FOUNTAIN_DEMO = null; // stop debugFrame's rAF loop first
    debugPanel.destroy();
    engine.destroy();
    mountEl.remove();
    console.log('[VFX fountain demo] unmounted');
  }

  window.VFX_FOUNTAIN_DEMO_MOUNT = mount;
  window.VFX_FOUNTAIN_DEMO_UNMOUNT = unmount;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
