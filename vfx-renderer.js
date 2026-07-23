// vfx-renderer.js — thin wrapper around a transparent PIXI.Application. Sizes itself
// to its mount element's actual CSS box via ResizeObserver, so it stays correct
// whether that box is the full viewport (dev demo) or a descendant of the app's own
// transform:scale()'d .canvas element (real overlay-mode widgets, later milestone) —
// clientWidth/clientHeight already reflect final layout size in both cases.
window.VFX = window.VFX || {};

VFX.Renderer = class Renderer {
  /**
   * @param {HTMLElement} mountEl
   * @param {{resolutionScale?: number, onResize?: (width:number, height:number) => void}} [opts]
   */
  constructor(mountEl, opts = {}) {
    if (typeof PIXI === 'undefined') throw new Error('[VFX] PixiJS not loaded — vendor pixi.min.js must load before vfx-renderer.js');
    this.mountEl = mountEl;
    this.resolutionScale = opts.resolutionScale || 1;
    this._onResize = opts.onResize || null;

    const rect = mountEl.getBoundingClientRect();
    this.app = new PIXI.Application({
      width: Math.max(1, Math.round(rect.width)) || 1,
      height: Math.max(1, Math.round(rect.height)) || 1,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: (window.devicePixelRatio || 1) * this.resolutionScale,
      powerPreference: 'low-power'
    });

    this.view = this.app.view;
    this.view.style.position = 'absolute';
    this.view.style.inset = '0';
    this.view.style.width = '100%';
    this.view.style.height = '100%';
    this.view.style.pointerEvents = 'none';
    mountEl.appendChild(this.view);

    this.stage = this.app.stage;
    // PIXI's own ticker drives *rendering*; simulation stepping is owned by VFX.Ticker
    // (fixed timestep) so we stop the auto-render loop and render manually each frame.
    this.app.ticker.autoStart = false;
    this.app.ticker.stop();

    this._resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) this._applySize(entry.contentRect.width, entry.contentRect.height);
    });
    this._resizeObserver.observe(mountEl);
  }

  _applySize(width, height) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === this.app.renderer.screen.width && h === this.app.renderer.screen.height) return;
    this.app.renderer.resize(w, h);
    // notify Engine (-> active Scene -> every resizable system) with LOGICAL
    // (CSS-pixel) dimensions — .width/.height below, never renderer.width/height
    // (physical backing-buffer pixels, resolution-multiplied) — M2 hardening item 2.
    this._onResize?.(this.width, this.height);
  }

  /**
   * Changes device-pixel density without touching logical (CSS-pixel) layout size.
   * Reads renderer.screen (logical) BEFORE mutating resolution, and resize() is
   * always called with those preserved logical dimensions — never with
   * renderer.width/height (physical, already resolution-multiplied). That was the
   * original bug (M2 hardening item 1): resize(renderer.width, renderer.height) fed
   * physical pixels back in as if they were logical ones, so every quality
   * transition corrupted the logical screen size by a factor of the *previous*
   * resolution. Logical size is unchanged by this method by design, so it does not
   * fire onResize — only _applySize (an actual CSS-box size change) does.
   */
  setResolutionScale(scale) {
    if (scale === this.resolutionScale) return;
    this.resolutionScale = scale;
    const logicalWidth = this.app.renderer.screen.width;
    const logicalHeight = this.app.renderer.screen.height;
    this.app.renderer.resolution = (window.devicePixelRatio || 1) * scale;
    this.app.renderer.resize(logicalWidth, logicalHeight);
  }

  // .screen is the logical (CSS-pixel) drawing area — the correct space for display-
  // object positioning. .width/.height on the renderer itself are physical backing-
  // buffer pixels (resolution-multiplied) and would misplace anything positioned by them.
  get width() { return this.app.renderer.screen.width; }
  get height() { return this.app.renderer.screen.height; }

  renderFrame() { this.app.renderer.render(this.stage); }

  destroy() {
    this._resizeObserver.disconnect();
    this.app.destroy(true, { children: true, texture: false, baseTexture: false });
    this.view.remove();
  }
};
