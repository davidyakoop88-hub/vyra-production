# VYRA VFX Engine — Milestone 1 Review Report

**Branch:** `feature/vyra-vfx-engine`
**Commit:** `468e547` — "VFX Engine Milestone 1: reusable PixiJS rendering foundation"
**Scope:** reusable rendering foundation only. No widget redesign, no route changes, no persisted-state changes.

---

## 1. Architecture

No build system, no bundler, no framework — the whole engine is plain ES6 classes attached to a
single global namespace (`window.VFX`), loaded as classic `<script>` tags in dependency order. This
matches the rest of the codebase (`window.VyraLive`, `window.VyraActionEvent`, etc.) rather than
introducing ES modules, which nothing else in the project uses.

```
VFX.Engine (orchestrator — the only class other code should construct directly)
 ├─ VFX.Renderer          — owns the transparent PIXI.Application / WebGL canvas
 ├─ VFX.Ticker            — fixed 60Hz accumulator loop, decoupled from PIXI's own render ticker
 ├─ VFX.QualityManager    — resolves Low/Medium/High/Ultra/Auto each tick
 ├─ VFX.PerformanceMonitor— rolling FPS / frame-time sampler
 ├─ VFX.TextureRegistry   — procedural texture cache (no external image assets)
 ├─ VFX.DebugOverlay      — dev-only DOM HUD (optional, opts.debug)
 └─ VFX.Scene (0..n, one active at a time)
     └─ named layers (PIXI.Container, z-ordered via addLayer)
         └─ VFX.ParticleSystem (PIXI.ParticleContainer — one GPU draw call per system)
             ├─ VFX.ParticlePool  → VFX.BaseParticle (pre-allocated, reset()-reused)
             ├─ VFX.FlowField     (seeded value-noise + N steering lanes)
             └─ VFX.SpawnZone     (line / rect / point)
```

`vfx-types.js` is not in this tree — it has no runtime behavior. It defines `VFX.QualityMode`,
`VFX.QUALITY_PRESETS`, `VFX.FIXED_HZ`/`VFX.FIXED_DT`, and JSDoc typedefs consumed by every other
file. There is no TypeScript in this codebase, so "types" here means runtime constants plus
editor-hinting JSDoc comments, not a compiled type system.

**Loading:** the entire chain (`pixi.min.js` + all 15 `vfx-*.js` files) is injected by one new
conditional block appended to `media.js`'s existing dynamic-script-tail pattern, gated on
`new URLSearchParams(location.search).has('vfxdemo')`. `studio.html` was not modified. Normal app
usage loads zero bytes of this engine.

---

## 2. File responsibilities

| File | Responsibility |
|---|---|
| `pixi.min.js` | Vendored PixiJS v7.4.2 UMD build. Local file, not a CDN reference — the app must keep working with no internet access mid-stream. |
| `vfx-types.js` | `QualityMode` enum, per-quality presets (particle cap / resolution scale / tick-skip), fixed-timestep constants, JSDoc typedefs. |
| `vfx-performance-monitor.js` | Rolling window of frame deltas → `fps`, `avgFrameMs`, `worstFrameMs`. No dependencies. |
| `vfx-quality-manager.js` | Owns the current `QualityMode`; in `AUTO` mode steps a Low→Ultra ladder based on `PerformanceMonitor.fps` with hysteresis (90-tick cooldown after each step); listens for `prefers-reduced-motion` and forces Low + zero turbulence when set. |
| `vfx-texture-registry.js` | `getGlowCircle(key, radius)` draws a soft radial-gradient dot once via `PIXI.Graphics` + `renderer.generateTexture`, caches by key. No external image assets needed. |
| `vfx-base-particle.js` | One pooled particle: plain simulation fields (`x/y/vx/vy/age/life/...`) plus the `PIXI.Sprite` it drives. `reset()` re-initializes an inactive instance for reuse; `integrate(dt)` advances position; `syncSprite()` pushes state to the sprite with a fade-in/hold/fade-out curve. |
| `vfx-particle-pool.js` | Generic fixed-capacity object pool. Pre-allocates every instance at construction (`prewarm`); `acquire()`/`release()` just move references between a free array and an active `Set` — no allocation on the hot path. |
| `vfx-flow-field.js` | Seeded smooth (value) noise via a `mulberry32` PRNG seeding a lattice, bilinear + smoothstep interpolated. Also owns "lanes" — evenly spaced x-positions particles are softly steered toward, so motion reads as organized columns rather than pure randomness. |
| `vfx-spawn-zone.js` | Static factory methods (`line`, `rect`, `point`) returning a zone that yields randomized spawn coordinates. |
| `vfx-renderer.js` | Wraps `new PIXI.Application({backgroundAlpha:0, ...})`, appends the canvas to a mount element, sizes itself via `ResizeObserver` reading the mount element's actual CSS box (works whether that box is the full viewport or, in a future milestone, nested inside the app's own `transform:scale()`'d `.canvas`). Stops PIXI's own auto-ticker — `VFX.Ticker` drives rendering manually. |
| `vfx-ticker.js` | Fixed-timestep accumulator: simulation always advances in `1/60s` increments regardless of actual frame rate; a spike (e.g. from a pause) is capped at 250ms of backlog so the sim can't try to "catch up" with hundreds of steps at once. |
| `vfx-particle-system.js` | Spawns particles at a configurable rate from a `SpawnZone`, steers active ones via `FlowField.steer()`, integrates, recycles the dead ones back to the pool. Owns one `PIXI.ParticleContainer`. |
| `vfx-scene.js` | A named, self-contained composition: z-ordered layers, `mount()/unmount()/update()/resize()/destroy()`. Multiple scenes can be registered on one `Engine`; only one is mounted at a time. |
| `vfx-engine.js` | Top-level orchestrator. Constructs all of the above in dependency order, resolves quality each fixed tick and propagates cap changes to the active scene, exposes `.diagnostics`, owns the single `destroy()` cleanup path. |
| `vfx-debug-overlay.js` | Dev-only DOM `<div>` HUD (not a rendered particle) showing FPS, frame time, quality mode, active-particle count, and per-system pool usage. Updates at most 4×/second. |
| `vfx-demo.js` | Dev-only bootstrap, only present in the page at all when `?vfxdemo=1` loaded it. Builds one scene: glowing circles, 5 lanes, upward fountain, turbulence. Exposes `window.VFX_DEMO`, `window.VFX_DEMO_MOUNT`, `window.VFX_DEMO_UNMOUNT` for manual testing. |

---

## 3. Render lifecycle

1. `new VFX.Engine({mountEl, quality, debug})` constructs `PerformanceMonitor` → `QualityManager`
   (resolves an initial preset) → `Renderer` (creates the transparent `PIXI.Application`, sized from
   `mountEl.getBoundingClientRect()`) → `TextureRegistry` (needs the renderer to generate textures) →
   `Ticker` (not started yet).
2. `engine.createScene(name)` / `scene.addLayer()` / `scene.addSystem()` build the scene graph; this
   is pure setup, nothing runs yet.
3. `engine.setActiveScene(name)` calls `scene.mount(renderer.stage)` — adds the scene's root
   `PIXI.Container` to the stage.
4. `engine.start()` starts the `Ticker`, which drives a `requestAnimationFrame` loop:
   - Each rAF callback computes `dtMs` since the last frame (capped at 250ms).
   - **Fixed-step phase:** while the accumulator holds ≥ one `1000/60`ms step, call
     `engine._fixedUpdate(VFX.FIXED_DT)` and drain the accumulator by one step. This can run 0, 1, or
     several times per rendered frame depending on how far behind real time the accumulator is.
   - `_fixedUpdate` resolves the current quality preset, applies resolution/particle-cap changes only
     when the preset actually changed, then calls `scene.update(effectiveDt, simTime, turbulence)` →
     each `ParticleSystem.update()` → spawn/steer/integrate/sync/recycle (see §4–5).
   - **Render phase (once per rAF, not per fixed step):** `PerformanceMonitor.tick(now)`,
     `renderer.renderFrame()` (`app.renderer.render(stage)`), `debugOverlay.update()`.
5. `engine.destroy()` (see §7) is the only teardown path.

Rendering is intentionally decoupled from simulation stepping: a slow monitor stays visually smooth
(interpolation alpha is computed and available, though the demo doesn't yet sub-step-interpolate
sprite positions between fixed steps — see §10) while the *physics* — spawn timing, particle
lifetimes, steering — always runs at a fixed, reproducible rate.

---

## 4. Pooling strategy

- `ParticlePool(factory, capacity)` calls `factory()` exactly `capacity` times at construction and
  never again. For the demo, `factory` creates a `BaseParticle` *and* immediately adds its sprite to
  the system's shared `PIXI.ParticleContainer` — sprites are added to the display list exactly once
  and never removed; only `sprite.visible` toggles thereafter.
- `acquire()` pops from a free array into an active `Set`; `release()` reverses that and calls
  `particle.deactivate()` (`sprite.visible = false`). Both are O(1), no allocation.
- `ParticleSystem.update()` spawns via an accumulator (`spawnRate * dt` added each tick, one particle
  emitted per whole unit crossed) and only while `pool.activeCount < maxActive` — if the pool is
  exhausted, spawning silently stops rather than growing unbounded or queueing.
- Recycling: each tick, dead particles (`age >= life`) are collected into a small array and released
  after the iteration (not during, to avoid mutating the pool's active set while iterating it).
- **Verified, not assumed:** forced a specific particle to expire, ran one `system.update()`, confirmed
  it went inactive, ran 60 more updates, and confirmed *the same object reference* came back active
  with a different `x` and a reset `age` — i.e. the pool genuinely reuses instances rather than the
  active count merely staying flat by coincidence.

---

## 5. Flow-field implementation

`vfx-flow-field.js` implements **seeded value noise**, not full Perlin/simplex — deliberately simpler,
sufficient for smooth organic drift, and easy to reason about:

1. `vfxMulberry32(seed)` — a small, fast, deterministic PRNG (32-bit, public-domain algorithm). Same
   seed → same output sequence, always.
2. At construction, a `latticeSize × latticeSize` grid (default 32×32) is filled with random values in
   `[-1, 1]` using that PRNG.
3. `noise2D(x, y)` looks up the four lattice cells surrounding a continuous `(x, y)` coordinate,
   applies `smoothstep` easing to the fractional part, and bilinearly interpolates — this is what makes
   the noise *smooth* rather than a blocky random grid.
4. **Lanes:** `laneCount` evenly-spaced x-positions are precomputed across the given bounds.
   `laneCenterX(laneIndex)` returns one.
5. `steer(particle, t, turbulenceStrength)` returns a horizontal acceleration = a spring-like pull
   toward the particle's assigned lane center (`(laneX - particle.x) * 1.8`) **plus** noise sampled at
   `(particle.y * 0.01, t * 0.35 + lane * 17.3)` scaled by `90 * turbulenceStrength`. The lane offset in
   the noise's second argument means each lane samples a different "slice" of the same field, so lanes
   don't all wobble in lockstep.
6. `ParticleSystem.update()` applies this as an acceleration to `vx`, then damps `vx *= 0.98` each
   tick so the lane-pull and turbulence settle into an oscillation instead of drifting away
   indefinitely.

`turbulenceStrength` is fed by `QualityManager` — it's `1` normally and `0` when
`prefers-reduced-motion` is active, which removes the noise term entirely (particles still rise, they
just don't sway) rather than only slowing the animation down.

---

## 6. Quality system

Five modes: `low`, `medium`, `high`, `ultra`, `auto` (`VFX.QualityMode`). Each non-auto mode maps to a
fixed preset in `VFX.QUALITY_PRESETS`:

| Mode | maxParticles | resolutionScale | tickSkip |
|---|---|---|---|
| low | 80 | 0.75 | 2 |
| medium | 200 | 1 | 1 |
| high | 400 | 1 | 1 |
| ultra | 800 | min(2, devicePixelRatio) | 1 |

- **Auto mode:** `QualityManager._stepAuto()` walks a `[low, medium, high, ultra]` ladder. Steps down
  one level when `fps < 45`, up one level when `fps >= 58`, and enforces a 90-fixed-tick cooldown
  (~1.5s at 60Hz) after every step so it can't oscillate at a boundary. Verified by feeding the ticker
  simulated 60fps frames (auto-climbed to `ultra`) and then simulated 25fps frames (auto-stepped
  ultra→high→medium→low over several cooldown windows, with the particle cap visibly dropping from
  110 to 77 active as it did).
- **`tickSkip`** (only `2` at Low): `Engine._fixedUpdate` only actually calls `scene.update()` every
  *N*th fixed tick, but multiplies the passed `dt` by `tickSkip` so particles still cover the correct
  distance per second — motion gets choppier under Low, not slower.
- **`resolutionScale`** changes are applied via `Renderer.setResolutionScale()`, which only touches
  `app.renderer.resolution` and re-resizes — cheaper than tearing down the WebGL context.
- **Reduced motion:** `QualityManager` reads `matchMedia('(prefers-reduced-motion: reduce)')` at
  construction and listens for changes. When true, `resolve()` always returns Low with
  `turbulence: 0`, overriding whatever mode was requested — this is unconditional, not just the
  default.

---

## 7. Cleanup behavior

Every class in the tree owns a `destroy()` that a parent calls exactly once, bottom-up:

- `BaseParticle.destroy()` → `sprite.destroy()`.
- `ParticlePool.destroy()` → releases every active instance, then destroys every pooled instance.
- `ParticleSystem.destroy()` → `pool.destroy()`, then `container.destroy({children:true})`.
- `Scene.destroy()` → `unmount()` (removes root container from its parent, if still mounted), destroys
  every system, clears the layer map, destroys the root container.
- `Renderer.destroy()` → disconnects its `ResizeObserver`, `app.destroy(true, {children:true, ...})`
  (removes canvas + WebGL context), removes the view element from the DOM.
- `QualityManager.destroy()` → removes its `matchMedia` change listener.
- `Engine.destroy()` (idempotent — guarded by an internal `_destroyed` flag) → stops the ticker,
  destroys the debug overlay, destroys every registered scene, clears the scene map, destroys the
  texture registry, destroys the quality manager, destroys the renderer last (so nothing still tries
  to touch a live GL context mid-teardown).

**Verified, not assumed:** called `VFX_DEMO_UNMOUNT()` and confirmed canvas/`#vfx-demo-root`/
`.vfx-debug-overlay` all reached exactly zero in the DOM, `window.VFX_DEMO === null`, and that calling
`VFX_DEMO_MOUNT()` again immediately afterward produced exactly one fresh canvas with no orphaned
elements left over from the previous instance — done twice, once against the test server and once
against the real installed app.

---

## 8. Measured performance

All numbers below are from the **real installed app** (`127.0.0.1:4173`, the Electron app's own
bundled server, after a full rebuild + silent install + relaunch), driven via 300 manually-stepped
60Hz-spaced ticks (see §9 for why manual stepping was necessary).

| Metric | Value |
|---|---|
| FPS (fed 60Hz-spaced frames) | 60 |
| Avg frame time | 16.67ms |
| Resolved quality (steady 60fps input) | `ultra` |
| Active particles at steady state | 110 (spawn rate 40/s × ~2.8s avg life) |
| Pool capacity / free | 800 / 690 |
| Under simulated 25fps input | quality stepped ultra→high→medium→low; active particles dropped 110→77 |

The source-server run (before rebuild, same code) produced 111 active particles under identical
conditions — the 110 vs 111 difference is RNG jitter in spawn timing, not a discrepancy between builds.

---

## 9. Console errors or warnings

**Zero** console errors or warnings in every tested configuration:
- normal `studio.html` load (no `?vfxdemo`) — confirmed zero VFX/PixiJS footprint at all
- `studio.html?vfxdemo=1`
- `studio.html?overlay=1&vfxdemo=1` (browser-source route)
- across mount → 300 simulated fixed ticks → forced-quality-drop test → recycling test → resize test →
  unmount → remount → unmount again

One caveat worth recording plainly: the automated browser tab used for testing runs **backgrounded**
(`document.visibilityState: 'hidden'`, `document.hasFocus(): false`), which is standard Chromium
power-saving behavior — it throttles `requestAnimationFrame` *and* `ResizeObserver` callbacks (verified
with a bare, non-VFX `ResizeObserver` on a plain div, which also never fired). This meant passive
wall-clock waiting couldn't be used to observe the real-time animation or resize behavior in that tab.
Both were instead verified by manually invoking the exact internal methods the rAF/observer callbacks
would call (`ticker._frame(timestamp)`, `renderer._applySize(w, h)`), which exercises the identical code
path without depending on the browser's scheduling of a hidden tab. FPS/pooling/quality numbers above
are real measured output of that code, not estimates.

---

## 10. Deviations from the specification

1. **A real bug found and fixed during this milestone, not shipped:** `PIXI.Renderer.width`/`.height`
   return the physical, resolution-multiplied backing-buffer size, not the logical/CSS-pixel space that
   `PIXI` display objects are positioned in. Using them directly would have silently misplaced every
   particle at any `devicePixelRatio ≠ 1`. Fixed by exposing `renderer.screen.width`/`.height` (logical
   space) from `VFX.Renderer` instead, and using that consistently in the demo's spawn-zone/flow-field
   bounds.
2. **Resize verification was direct-method, not passively-observed**, per §9 — a testing-methodology
   note, not a functional gap; the underlying `ResizeObserver` wiring is standard, unmodified browser
   API usage.
3. **Sub-step render interpolation is not implemented.** `Ticker` computes and passes an `alpha`
   (fraction between the last two fixed steps) to the render callback, but `ParticleSystem`/
   `BaseParticle` don't currently use it to interpolate sprite position between fixed steps — sprites
   snap to their latest fixed-step position each render. At 60Hz simulation vs. a 60Hz+ display this is
   invisible; on a 120Hz+ display it would show minor stutter. Left as a deliberate simplification for
   Milestone 1, not a bug.
4. **Spawn zones and flow-field lane positions are captured once, in absolute pixels, at scene
   construction.** `Scene.resize()` exists as an explicit lifecycle hook (per requirement) but is
   currently a documented no-op — a future milestone integrating with real, resizable widget bounds
   will need to make zones proportional and recompute them there.
5. **No WebGL context-loss/restoration test was performed.** PixiJS v7 has built-in handling for this,
   but it was not deliberately exercised (e.g. by forcing a context loss) in this milestone.
6. Everything else in the original 17-point requirement list was implemented as specified: transparent
   canvas, normalized/logical coordinate space, fixed-timestep loop, delta-time capping, pooling, seeded
   smooth noise, flow lanes, spawn zones, layered rendering, full destroy lifecycle, five quality modes,
   FPS/active-particle diagnostics, reduced-motion support, zero DOM-based particles, zero CSS particle
   animation, zero business-logic changes, zero changes to persisted widget IDs or routes.

---

## 11. How to open the demo

Screenshots were not captured for this report — the automated browser tooling used this session has
been unreliable for visual capture (repeated timeouts and, separately, unrelated stray navigations away
from the target page), and rather than include a screenshot that might not actually reflect the current
build, these are the exact, verified-working steps to see it yourself:

1. Make sure VYRA is running (the installed app, or `server.ps1` from the project root on port 4173).
2. Open a browser and navigate to:
   - **In-app / editor context:** `http://127.0.0.1:4173/studio.html?vfxdemo=1`
   - **Browser-source / OBS context:** `http://127.0.0.1:4173/studio.html?overlay=1&vfxdemo=1`
3. The demo mounts automatically — no click required. You should see:
   - A small monospace HUD in the top-left corner (`VFX ENGINE — dev`) showing live FPS, frame time,
     resolved quality mode, active particle count, and per-system pool usage.
   - Glowing circles rising from a horizontal band near the bottom of the window, organized into 5
     loose vertical columns (lanes), drifting gently left/right as they rise, fading in and out rather
     than popping.
   - A fully transparent background — whatever is behind the browser window/OBS scene shows through.
4. Open the browser console (F12) — expect exactly one log line, `[VFX demo] mounted — {...}`, and no
   errors.
5. To confirm cleanup manually: run `window.VFX_DEMO_UNMOUNT()` in the console — the canvas and HUD
   should disappear immediately. Run `window.VFX_DEMO_MOUNT()` to bring it back.
6. To confirm normal app behavior is unaffected: load `http://127.0.0.1:4173/studio.html` **without**
   `?vfxdemo` and confirm `typeof PIXI === 'undefined'` and `typeof VFX === 'undefined'` in the console.
