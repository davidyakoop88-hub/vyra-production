// vfx-fountain-debug.js — dev-only extended HUD + controls for the fountain demo.
// Separate from VFX.DebugOverlay (Milestone 1's simple text HUD, still used
// unchanged by the ?vfxdemo=1 demo) — this is fountain-specific diagnostics and
// interactive controls, and must never be reachable outside ?vfxdemo=2.
window.VFX = window.VFX || {};

VFX.FountainDebugPanel = class FountainDebugPanel {
  /**
   * @param {VFX.Engine} engine
   * @param {VFX.FountainEmitter} emitter
   */
  constructor(engine, emitter) {
    this.engine = engine;
    this.emitter = emitter;
    this._lastUpdate = 0;

    this.lanePathLayer = new PIXI.Graphics();
    this.lanePathLayer.visible = false;
    emitter.container.addChild(this.lanePathLayer);

    this._buildDom();
    this._wireControls();
  }

  _buildDom() {
    this.statsEl = document.createElement('div');
    this.statsEl.className = 'vfx-fountain-debug-stats';
    Object.assign(this.statsEl.style, {
      position: 'fixed', top: '8px', left: '8px', zIndex: 999999,
      font: '10.5px/1.5 monospace', color: '#c9e9ff', background: 'rgba(8,5,13,.8)',
      border: '1px solid rgba(155,200,233,.3)', borderRadius: '6px', padding: '8px 10px',
      pointerEvents: 'none', whiteSpace: 'pre', maxWidth: '280px'
    });
    document.body.appendChild(this.statsEl);

    this.controlsEl = document.createElement('div');
    this.controlsEl.className = 'vfx-fountain-debug-controls';
    Object.assign(this.controlsEl.style, {
      position: 'fixed', top: '8px', right: '8px', zIndex: 999999,
      font: '11px/1.6 monospace', color: '#e9d5ff', background: 'rgba(8,5,13,.85)',
      border: '1px solid rgba(200,155,255,.3)', borderRadius: '8px', padding: '10px 12px',
      width: '210px'
    });
    this.controlsEl.innerHTML = `
      <div style="font-weight:bold;margin-bottom:6px">FOUNTAIN — dev controls</div>
      <button id="vfxfd-pause" style="width:100%;margin-bottom:4px">⏸ Pause</button>
      <button id="vfxfd-replay" style="width:100%;margin-bottom:8px">▶ Replay entrance</button>
      <label>Intensity <span id="vfxfd-intensity-v">1.0</span><input id="vfxfd-intensity" type="range" min="0" max="1" step="0.05" value="1" style="width:100%"></label>
      <label>Spawn rate <span id="vfxfd-spawnrate-v">1.0</span><input id="vfxfd-spawnrate" type="range" min="0" max="2" step="0.1" value="1" style="width:100%"></label>
      <label>Turbulence <span id="vfxfd-turbulence-v">auto</span><input id="vfxfd-turbulence" type="range" min="0" max="1" step="0.05" value="1" style="width:100%"></label>
      <label>Width <span id="vfxfd-width-v">1.0</span><input id="vfxfd-width" type="range" min="0.3" max="1.6" step="0.05" value="1" style="width:100%"></label>
      <label>Quality
        <select id="vfxfd-quality" style="width:100%">
          <option value="auto">auto</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high" selected>high</option>
          <option value="ultra">ultra</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:6px;margin-top:6px">
        <input id="vfxfd-lanes" type="checkbox"> show lane paths + zones
      </label>
      <button id="vfxfd-clear" style="width:100%;margin-top:8px">🗑 Clear scene</button>
    `;
    document.body.appendChild(this.controlsEl);
  }

  _wireControls() {
    const $ = id => this.controlsEl.querySelector('#' + id);
    $('vfxfd-pause').onclick = () => {
      this._pausedState = !this._pausedState;
      this.emitter.setPaused(this._pausedState);
      $('vfxfd-pause').textContent = this._pausedState ? '▶ Resume' : '⏸ Pause';
    };
    $('vfxfd-replay').onclick = () => this.emitter.playEntrance();
    $('vfxfd-intensity').oninput = e => { this.emitter.setIntensity(+e.target.value); $('vfxfd-intensity-v').textContent = (+e.target.value).toFixed(2); };
    $('vfxfd-spawnrate').oninput = e => { this.emitter.setSpawnRateMultiplier(+e.target.value); $('vfxfd-spawnrate-v').textContent = (+e.target.value).toFixed(2); };
    $('vfxfd-turbulence').oninput = e => { this.emitter.setTurbulenceOverride(+e.target.value); $('vfxfd-turbulence-v').textContent = (+e.target.value).toFixed(2); };
    $('vfxfd-width').oninput = e => { this.emitter.setWidthMultiplier(+e.target.value); $('vfxfd-width-v').textContent = (+e.target.value).toFixed(2); };
    $('vfxfd-quality').onchange = e => {
      const val = e.target.value;
      // just tell the engine's QualityManager what mode to use — no direct
      // emitter.setQualityBudget() call needed. Engine's own _fixedUpdate loop
      // detects the resolved preset changed on the next tick and calls
      // emitter.applyQuality() automatically via Scene.applyQuality() (M2
      // hardening item 6: quality changes are fully engine-driven).
      this.engine.quality.setMode(val === 'auto' ? VFX.QualityMode.AUTO : val);
    };
    $('vfxfd-lanes').onchange = e => {
      this.lanePathLayer.visible = e.target.checked;
      if (e.target.checked) this._drawLanes();
    };
    $('vfxfd-clear').onclick = () => this.emitter.clear();
  }

  /** Draws the 7 bezier lanes, the source spawn point/zone, and the fade/removal
   * boundary lines — all debug-only overlay geometry gated behind the single
   * "show lane paths + zones" checkbox. Visual QA aid only, never drawn outside
   * ?vfxdemo=2's dev controls. */
  _drawLanes() {
    const g = this.lanePathLayer;
    g.clear();
    const w = this.emitter.width, h = this.emitter.height;
    const geo = VFX.FOUNTAIN_GEOMETRY;

    const colors = [0xff5f5f, 0xff9f4d, 0xffe14d, 0xffffff, 0x7dd3fc, 0xa78bfa, 0xff8fd8];
    for (const lane of VFX.FLOW_LANES) {
      g.lineStyle(1.5, colors[lane.index % colors.length], 0.5);
      const [p0, p1, p2, p3] = lane.points;
      const toPx = p => ({ x: p.x * w, y: p.y * h });
      const a = toPx(p0), b = toPx(p1), c = toPx(p2), d = toPx(p3);
      g.moveTo(a.x, a.y);
      g.bezierCurveTo(b.x, b.y, c.x, c.y, d.x, d.y);
    }

    // source spawn point/zone — every particle's pathT=0 origin, radius sized to
    // the bottom-of-fan half-width so it reads as "the zone lanes fan out from"
    const sx = geo.sourceX * w, sy = geo.sourceY * h;
    const spawnR = geo.bottomHalfWidth * w;
    g.lineStyle(2, 0x39ff8f, 0.8);
    g.drawCircle(sx, sy, spawnR);
    g.lineStyle(1, 0x39ff8f, 0.4);
    g.drawCircle(sx, sy, spawnR * 2);

    // fade-start and full-removal boundary lines (dashed, horizontal)
    this._dashedHLine(g, geo.topFadeY * h, w, 0xffd23f, 0.7, 'fade start');
    this._dashedHLine(g, geo.removedY * h, w, 0xff3f6a, 0.7, 'removed');
  }

  _dashedHLine(g, y, width, color, alpha, _label) {
    g.lineStyle(1.5, color, alpha);
    const dash = 10, gap = 6;
    for (let x = 0; x < width; x += dash + gap) {
      g.moveTo(x, y);
      g.lineTo(Math.min(x + dash, width), y);
    }
  }

  update() {
    const now = performance.now();
    if (now - this._lastUpdate < 250) return;
    this._lastUpdate = now;
    if (this.lanePathLayer.visible) this._drawLanes();

    const d = this.emitter.diagnostics();
    const eng = this.engine.diagnostics;
    const typeLines = Object.entries(d.byType).map(([k, v]) => `  ${k}: ${v}`).join('\n');
    this.statsEl.textContent =
      `FOUNTAIN — dev\n` +
      `fps: ${eng.fps}  frame: ${eng.avgFrameMs.toFixed(1)}ms  quality: ${eng.quality}${eng.reducedMotion ? ' (reduced-motion)' : ''}\n` +
      `active: ${d.totalActive}  bg:${d.byDepth.background} mid:${d.byDepth.midground} fg:${d.byDepth.foreground}\n` +
      `by type:\n${typeLines}\n` +
      `trails: ${d.trailCount}/${d.trailCapacity}\n` +
      `source intensity: ${d.sourceIntensity}\n` +
      `lane usage: [${d.laneUsage.join(',')}]\n` +
      `textures: ${d.textureCount} (~${(d.textureMemoryBytes / 1024 / 1024).toFixed(2)}MB)\n` +
      `dropped spawns: ${d.droppedSpawnCount}`;
  }

  destroy() {
    this.statsEl.remove();
    this.controlsEl.remove();
    // remove from the emitter's container before destroying so this is safe
    // regardless of whether emitter.destroy() runs before or after this call
    this.lanePathLayer.parent?.removeChild(this.lanePathLayer);
    this.lanePathLayer.destroy();
  }
};
