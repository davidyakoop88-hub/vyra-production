# VYRA VFX Engine — Milestone 2 Hardening Report

**Branch:** `feature/vyra-vfx-engine` (unmerged, per instruction — not merged to `main`)
**Implementation commit:** `310995d` — *fix(vfx): Milestone 2 hardening pass — 15 correctness/perf fixes*
**Base:** `e88f825` (M2 report) on top of `9558cdc` (M2 implementation)
**Scope:** Fixes only. No Milestone 3 work (avatars, live TikTok events, presets, production Like Fountain integration) was started, per instruction.

This report documents the 15 blockers from the M2 review, the fix applied for each, and the exact verification evidence gathered. Every claim below was checked by running the engine (manual ticker stepping, a real 10-simulated-minute stability run, and a live run in the freshly rebuilt Electron app) — none is based on "it compiles."

---

## 1. `Renderer.setResolutionScale()` — physical/logical pixel corruption

**Bug:** `resize(this.app.renderer.width, this.app.renderer.height)` fed *physical* (resolution-multiplied) backing-buffer pixels back into `resize()`, which interprets its arguments as *logical* pixels. Each quality transition compounded the error.

**Fix** (`vfx-renderer.js`): read `renderer.screen.width/height` (logical) **before** mutating `.resolution`, then `resize()` with those preserved logical values. Never reads `.width`/`.height` (physical) at all now.

**Measured, before vs. after** (same DPR/scale sequence — `[1,0.75] [1,1] [1.5,0.75] [1.5,1] [2,0.75] [2,1] [2,2]` — replayed against a real `PIXI.Application`, starting logical width 1265px):

| Step | dpr,scale | Old buggy `screen.width` | New fixed `screen.width` |
|---|---|---|---|
| 1 | 1, 0.75 | 1265.33 | 1265.33 |
| 2 | 1, 1 | 949 | 1265 |
| 3 | 1.5, 0.75 | 949.33 | 1264.89 |
| 4 | 1.5, 1 | 1068 | 1264.67 |
| 5 | 2, 0.75 | 1602 | 1264.67 |
| 6 | 2, 1 | 2403 | 1264.5 |
| 7 | 2, 2 | **4806** | 1264.5 |

Old: logical width drifts from 1265px to **4806px (3.8x)** after 7 transitions. New: bounded to sub-pixel drift (≤0.83px), which is inherent floating-point rounding in PixiJS's own integer-physical-pixel `resize()` math (`round(w·resolution)/resolution ≠ w` exactly) — not something any implementation can eliminate, and three orders of magnitude smaller than the original bug.

**DPR 1 / 1.5 / 2 repeated-transition test** (real `VFX.Renderer` instance, `Object.defineProperty(window,'devicePixelRatio',...)` override): ran the full LOW→MEDIUM→HIGH→ULTRA resolutionScale sequence at each DPR; logical size stayed bounded and non-compounding at every DPR (see table above — the "new fixed" column *is* this test, run consecutively across all three DPRs without resetting).

---

## 2. Resize propagation

**Fix:** `VFX.Renderer` now takes an `onResize(width, height)` callback, fired from `_applySize()` only on a genuine box-size change (never from `setResolutionScale()`, which by design doesn't change logical size). `VFX.Engine._handleResize()` forwards to `activeScene.resize(w, h)`. `VFX.Scene.resize()` forwards to every system implementing `.resize()`. `FountainEmitter.resize()` (unchanged) applies it.

**Verified:**
- Direct chain test: called `renderer._applySize(rect.width, rect.height)` with a resized mount box (1080×1920) → `engine.renderer.width/height` **and** `emitter.width/height` both updated to 1080×1920 in the same call, confirming the full chain wires correctly end to end.
- Portrait/landscape/square construction test (below) confirms `FountainEmitter` always ends up sized to match `Renderer` at mount time.
- **Caveat, honestly reported:** the Claude Browser pane's `resize_window` tool changes `window.innerWidth/innerHeight` but does **not** trigger a real `ResizeObserver` callback in this environment — confirmed with a bare, non-VFX `ResizeObserver` attached to a `position:fixed` div, which also never fired across a real viewport resize in the same pane. This is an automated-test-harness limitation (documented previously in the M1/M2 reports for `requestAnimationFrame` throttling on backgrounded tabs), not a code defect — `ResizeObserver` dispatch itself is standard, unmodified browser platform behavior my change doesn't touch. I was not able to trigger a genuine OS-level window resize against the real installed app in this session (Windows-MCP's window-management tools reported "no windows found" / a parameter-validation bug on `window_size`, see Unresolved Risks). The propagation *code path* is proven correct by direct invocation; a live resize-drag test against the packaged app is the one item in this list I could not personally re-confirm this pass and is flagged below.

---

## 3. Fixed-timestep render interpolation vs. tickSkip

**Decision:** removed tickSkip for fountain scenes rather than implementing render interpolation. Interpolation would require storing prev/current transforms per particle across every particle type (`BaseParticle`, `CrystalHeartParticle`, `SparkleParticle`) — a much larger blast radius for a widget whose own quality budgets (item 6) already scale particle count/effects down. `VFX.Scene` gained a `fixedRateOnly` flag; when set (the fountain demo sets it), `Engine._fixedUpdate()` always calls `scene.update(dt, ...)` with the real fixed `dt`, skipping the tickSkip/`effectiveDt` branch entirely. M1's simple demo does **not** set this flag and retains its original tickSkip behavior unchanged — confirmed via regression test (below).

---

## 4. Seeded RNG streams

**Fix:** new `vfx-rng.js` (`VFX.Rng`, mulberry32-based, plus `VFX.hashSeed`/`VFX.createRng` for deriving independent named sub-streams from one base seed). `FountainEmitter` now owns 7 named streams — `_rngSpawn`, `_rngLane`, `_rngVariant`, `_rngSize`, `_rngRotation`, `_rngShimmer`, `_rngTrail` — replacing every `Math.random()` call in the spawn path. `SparkleParticle.reset()` and `CrystalHeartParticle.reset()` no longer call `Math.random()` internally for rotation/shimmerPhase — both now consume values the emitter passes in. `FountainSource`'s ray/spark decorative phase offsets (construction-time, not per-spawn, so outside the item's explicit bullet list but still "Math.random use in the fountain path") were also moved to a seeded stream so a given emitter seed reproduces the source portal's decoration too.

**Verified:** `grep -rn "Math.random"` across `vfx-*.js` shows zero remaining calls in `vfx-fountain-emitter.js`, `vfx-crystal-heart-particle.js`, `vfx-sparkle-particle.js`, `vfx-fountain-source.js`. Remaining `Math.random` defaults in `vfx-spawn-zone.js`/`vfx-flow-field.js`/`vfx-particle-system.js` are M1's own generic-demo infrastructure, never invoked by the fountain (which uses its own bezier motion model, not `SpawnZone`/`ParticleSystem`) — left untouched, out of scope.

---

## 5. Weighted lane selection

**Fix:** `VFX.LANE_SPAWN_WEIGHTS` (`vfx-fountain-types.js`) derives a weight per lane from `1 - 0.55·|spread|` (center=1.0, far-outer=0.45), and `VFX.pickWeightedLane(randFn)` does a weighted pick. `_spawnInChannel` now calls `VFX.pickWeightedLane(() => this._rngLane.next())` instead of a uniform `Math.floor(rand()*7)`. The old `_laneWeightBias` (which modulates one channel's spawn rate over time — not lane choice at all) is renamed `_channelDensityModulation` with a doc comment explaining the distinction.

**Measured** (300-tick run, entrance forced complete, real emitter): lane usage `[16, 22, 30, 33, 36, 23, 14]` for lanes `[far-left, outer-left, inner-left, center, inner-right, outer-right, far-right]` — the three center/inner lanes (30, 33, 36) are the top cluster, the two far-outer lanes (16, 14) are the lowest, matching the intended bias (statistical noise at this sample size explains inner-right(36) slightly edging center(33), not a bug). Re-confirmed in the live real-app run: `[18,6,16,19,15,9,3]` at low sample count, same qualitative shape (far lanes lowest).

---

## 6. Engine-driven quality changes

**Fix:** `FountainEmitter.applyQuality(preset)` maps `preset.name` → `VFX.FOUNTAIN_QUALITY_BUDGETS[name]` (or the dedicated `reducedMotion` budget) and calls `setQualityBudget()`. `VFX.Scene.applyQuality(preset)` now prefers a system's own `applyQuality(preset)` over the old generic `setMaxActive(preset.maxParticles)` fallback (kept for M1-style systems). `vfx-fountain-demo.js` no longer polls `engine.diagnostics.quality` or calls `emitter.setQualityBudget()` at all — the debug panel's quality `<select>` now only calls `engine.quality.setMode(...)`.

**Measured** (driven entirely through `engine.quality.setMode(...)`, zero direct emitter calls from the test):

| Requested | Resolved | `emitter.budget.maxActive` | Matches `FOUNTAIN_QUALITY_BUDGETS` | Channel Σ`maxActive` | `trailPool.maxPoints` | trails enabled |
|---|---|---|---|---|---|---|
| low | low | 120 | ✅ | 120 | 8→ (n/a, disabled) | false |
| medium | medium | 220 | ✅ | 220 | 4 | true |
| high | high | 380 | ✅ | 381 | 6 | true |
| ultra | ultra | 600 | ✅ | 602 | 8 | true |
| auto | ultra (ladder settled here) | 600 | n/a (auto) | 602 | 8 | true |

Channel-sum rounding drift (381/602 vs 380/600) matches the same ~0.2% rounding tolerance already documented and accepted in the original M2 report — unchanged by this pass.

---

## 7. TrailPool quality updates

**Fix:** `Trail` now stores points in a fixed `Float32Array` ring buffer sized to Ultra's `trailLength` ceiling (see item 9); `setMaxPoints(n)` just changes how many of the most-recent ring entries `redraw()` reads — no data movement needed. `TrailPool.setMaxPoints(n)` calls `pool.forEachAll(t => t.setMaxPoints(n))` (new `ParticlePool.forEachAll`, iterates active **and** free items). `FountainEmitter.setQualityBudget()` calls `trailPool.setMaxPoints(...)` and, when the new budget disables trails, `_releaseAllTrails()` walks every active heart and releases+nulls its `p.trail` reference — preventing a stale pointer from writing into a Trail instance the pool has since handed to a different particle.

**Verified:** the quality-ladder table above shows `trailPool.maxPoints` correctly tracking each tier (8→4→6→8) and `trailsEnabled` correctly flipping `false` at `low`.

---

## 8. Pause semantics

**Decision:** implemented a **complete simulation pause** (chosen over renaming to `pauseSpawning` — a full freeze is what the debug panel's Pause button is actually for, and was no more code). `FountainEmitter.update()` now returns immediately at the top when `_paused` is true — nothing advances: no spawning, no particle integration, no trail redraw, no source-portal breathing/pulse.

**Measured:** captured full `emitter.diagnostics()` plus `source.glow.alpha` before pausing, stepped 120 ticks (2 sim seconds) while paused, captured again — **byte-identical** (`JSON.stringify(before) === JSON.stringify(after)` → `true`; `source.glow.alpha` unchanged to full float precision: `0.5384376917206087` both times). Resumed, stepped 60 more ticks, confirmed state changed again (active count 138→143, lane usage advanced) — proving pause isn't a permanent freeze, just a real toggle.

---

## 9. Hot-path allocations removed

- **Bezier sampling:** `VFX.bezierPointInto(out, p0,p1,p2,p3,t)` (`vfx-fountain-types.js`) writes into a caller-owned object. `FountainEmitter` keeps two reusable scratch objects (`_scratchPoint`, `_scratchTangent`) as instance fields, safe to share because each is fully read-and-discarded within one synchronous `_advanceParticle` call before the next particle's call reuses it.
- **Dead-particle arrays:** each channel gets a `deadScratch: []` at construction (in `_buildChannels`'s `mk()`); `update()` does `const dead = ch.deadScratch; dead.length = 0;` instead of `const dead = [];` every tick.
- **Trail ring buffer:** `Trail` stores points in a fixed `Float32Array(capacity*2)` with a write cursor (`_head`) and count (`_count`); `pushPoint()` never grows the array; `redraw()` reads the most-recent `min(maxPoints, count)` entries via modulo-indexed reads. No `push`/`splice` anywhere in the hot path.

**Verified indirectly:** the 10-simulated-minute Ultra stability run (item below) shows flat texture memory and a tight, non-drifting active-particle band across 36,000 ticks with zero dropped spawns — consistent with no accumulating GC pressure from the removed hot-path allocations. (JS heap sampling wasn't instrumented — see Unresolved Risks for what a full GC-profile pass would additionally confirm.)

---

## 10. `forcedRecycleCount` → `droppedSpawnCount`

Renamed throughout (`FountainEmitter._droppedSpawnCount`/`diagnostics().droppedSpawnCount`, `TrailPool._droppedSpawnCount`/`.droppedSpawnCount`, the debug HUD's `dropped spawns:` line) — nothing was ever actually being force-recycled; a full pool simply refuses the spawn. `grep` confirms no remaining references to the old name outside explanatory comments.

---

## 11. Crystal-heart texture/tint correctness

**The actual prior bug:** texture (baked once per pooled slot at *construction* time, always a random variant at fixed `MEDIUM` size) and tint (re-rolled independently on every `reset()`) came from two **uncorrelated** random draws — a violet-baked heart could get a pink tint multiplied over it, and every heart rendered at `MEDIUM`'s baked resolution regardless of its rolled size category (so a `HERO` heart, 58–96px, was always the `MEDIUM` texture stretched up past its native 58px bake).

**Fix:** all 16 variant×size textures (4 variants × 4 categories) are baked once in the constructor (`_heartTextureCache`). Each spawn now picks variant **and** size category together, looks up the matching cached texture, and assigns it via `CrystalHeartParticle.reset({texture, ...})` (new: `reset()` swaps `sprite.texture` before applying other props). `tint` is set to `0xffffff` for hearts — color comes entirely from the texture's own baked dark/base/light facets, so tinting can no longer wash over that gradient. Scale is always `px / range.max` (≤1 relative to the *chosen* category's own baked max) — a HERO heart now renders its own HERO-baked texture, never upscaling MEDIUM's.

**Verified:** live run shows genuine multi-colored hearts (violet and pink both visible in the same frame in the real-app screenshot) rendering correctly with visible internal light/dark faceting, matching the intended design; `_heartTextureCache` construction confirmed via `engine.textures.textureCount === 23` (16 hearts + ~7 sparkle/source textures) present from the very first frame, not growing later — no runtime bake hitches.

---

## 12. Trail profiling at Ultra

Measured directly (Ultra quality, spawn rate temporarily ×3 to stress trail count):

| Metric | Value |
|---|---|
| Active trails | 10 (of 216 pool capacity, 8-point ring capacity each) |
| `Trail.redrawAll()` avg CPU time | **0.0275 ms** |
| `Trail.redrawAll()` p99 | 0.10 ms |
| `Trail.redrawAll()` max (120 samples) | 0.30 ms |
| Engine avg frame time | 16.667 ms (steady 60 fps) |
| Engine fps | 60 |

**Draw calls — estimated, not measured** (no WebGL draw-call counter or `EXT_disjoint_timer_query` GPU-timing extension was wired into the engine; this is a genuine gap, not a number I'm fabricating): at 10 active trails, each trail's `PIXI.Graphics` is its own draw call (documented tradeoff, unchanged from M2) → ~10, plus up to 7 batched `ParticleContainer` draw calls (dust/bgSparkle/bgHeart/midSparkle/midHeart/fgHeart/fgStar), plus the source portal's ~17 plain sprites (glow+3 rings+5 rays+8 sparks), which PIXI's default batch renderer will merge into a handful of draw calls by shared texture/blend-mode — a reasoned estimate of **~20 draw calls** at typical steady-state trail counts (4–10 observed across the stability run). **GPU frame time was not measured** — no timer-query instrumentation exists in the engine; `redrawAll`'s CPU cost above (sub-0.1ms typical) strongly suggests trails are not the bottleneck at these counts, but a true GPU-side number would need `EXT_disjoint_timer_query_webgl2`, which is a real follow-up item, not something I'm claiming to have measured.

---

## 13. Dedicated reduced-motion configuration

**Fix:** new `VFX.FOUNTAIN_QUALITY_BUDGETS.reducedMotion` (`maxActive: 60`, well below plain `low`'s 120; trails disabled; `sparkleDensity: 0.3`) in `vfx-fountain-types.js`. `QualityManager.resolve()` now includes an explicit `reducedMotion: true/false` flag on every returned preset. `FountainEmitter.applyQuality()` checks that flag and picks the dedicated budget instead of falling through to `low`.

**Verified:** forced `engine.quality._reducedMotion = true`, stepped 60 ticks, confirmed `emitter.budget === VFX.FOUNTAIN_QUALITY_BUDGETS.reducedMotion` (identity match, not just equal values) and `emitter.budget.maxActive (60) !== FOUNTAIN_QUALITY_BUDGETS.low.maxActive (120)`.

**Not addressed this pass (flagged, not hidden):** the entrance timeline's easing (`back.out`, a slight overshoot) and the bezier lanes' outer-lane "bulge" arcs are shared, static geometry — a reduced-motion viewer still sees the same *shape* of motion, just fewer/smaller particles. A fuller reduced-motion pass (flatter entrance easing, reduced lane bulge) is a reasonable Milestone 3+ follow-up, not attempted here since the explicit ask was "a dedicated reduced-motion fountain configuration," which this delivers.

---

## 14. Destroy-ownership double-destroy risk

**Fix:** `VFX.Scene.destroy()` now explicitly detaches each system's container from its layer (`layer.removeChild(system.container)`) **before** calling `system.destroy()`, then destroys each layer container separately (`layer.destroy({children:true})` — safe, since each layer is empty by then), and finally destroys `root` with `{children:false}` (its children — the layers — were already destroyed individually, so recursing into them again is never attempted).

**Verified:** 5 consecutive mount→run(1s)→destroy cycles, each with genuinely active particles/trails/source elements present at the moment of destroy (28–30 active particles each cycle) — zero exceptions across all 5. This is the scenario that would have exercised any double-destroy path if one existed.

---

## 15. Engine/Scene/ParticlePool lifecycle hardening

- **`ParticlePool`**: `_destroyed` flag; `acquire()`/`release()` no-op safely after destroy; prewarm failures clean up partial state and rethrow a clear error; `release()` wraps a particle's own `deactivate()` in try/catch so a throwing particle can't corrupt pool bookkeeping; new `forEachAll(fn)`.
- **`Scene`**: `_destroyed` flag guarding `addLayer`/`addSystem`/`mount`/`update`/`applyQuality`/`resize`.
- **`Engine`**: `createScene()` throws on a duplicate name (previously silently leaked the old scene); `setActiveScene()` throws on an unknown name (previously silently blanked the screen) and no-ops if the requested scene is already active; a freshly mounted scene gets `applyQuality(this._currentPreset)` immediately, not on the next quality *change*; `start()`/`createScene()`/`setActiveScene()` all guard against post-`destroy()` use.

**Verified**, all via direct exercise (not just code review):

| Check | Result |
|---|---|
| `createScene('fountain-m2')` when that name already exists | throws `Scene "fountain-m2" already exists — destroy it first or choose a different name` |
| `setActiveScene('does-not-exist')` | throws `Unknown scene "does-not-exist" — call createScene() first` |
| `engine.destroy()` | no error |
| `engine.destroy()` called a second time | safe no-op, no error |
| `engine.start()` after destroy | safe no-op, no error |
| `engine.createScene('x')` after destroy | throws `Engine is destroyed` |
| Pool exhaustion (spawn attempts far past pool capacity) | `pool.activeCount` never exceeds `pool.capacity` (182/182 held exactly); `droppedSpawnCount` incremented correctly (546, matching the exact number of attempts made against an already-full pool); zero exceptions |

---

## Additional verification run this pass

**10-simulated-minute Ultra stability run** (36,000 fixed ticks, chunked across 10 calls to avoid the test tool's execution-time limit, same methodology as M1/M2):

| Sim time | Active | Dropped spawns | Textures | Texture MB | Trails |
|---|---|---|---|---|---|
| 1 min | 134 | 0 | 23 | 2.39 | 7 |
| 2 min | 139 | 0 | 23 | 2.39 | 9 |
| 3 min | 135 | 0 | 23 | 2.39 | 4 |
| 4 min | 135 | 0 | 23 | 2.39 | 9 |
| 5 min | 137 | 0 | 23 | 2.39 | 5 |
| 6 min | 142 | 0 | 23 | 2.39 | 10 |
| 7 min | 143 | 0 | 23 | 2.39 | 8 |
| 8 min | 136 | 0 | 23 | 2.39 | 8 |
| 9 min | 141 | 0 | 23 | 2.39 | 8 |
| 10 min | 135 | 0 | 23 | 2.39 | 10 |

Active count stayed in a tight, non-drifting 134–143 band the entire run; texture count/memory perfectly flat (no leak); zero dropped spawns throughout. Wall time for the full run: 165.2s (test-harness overhead from synchronous tick-stepping, not representative of real playback speed).

**Portrait / landscape / square construction** (1080×1920, 1920×1080, 1080×1080): all three constructed and ran 180 ticks with zero errors; `renderer.width/height` and `emitter.width/height` matched the requested box exactly in every case.

**M1 regression check** (`?vfxdemo=1`, unmodified by this pass except for shared-file changes in `Engine`/`Scene`/`Renderer`/`ParticlePool`): mounted cleanly, zero console errors, 118 active particles after 300 ticks (consistent with the ~110 originally reported) — confirms the shared-file hardening didn't regress the M1 simple demo, which retains its original tickSkip behavior since it never sets `scene.fixedRateOnly`.

**Real installed app**: rebuilt via `npm run build` (electron-builder, succeeded), launched the freshly-built `dist2/win-unpacked/VYRA.exe` directly (see Unresolved Risks — the NSIS installer itself hung this session), opened `http://127.0.0.1:4173/studio.html?vfxdemo=2` in a separate real Edge window against the running app's own bundled server, and visually confirmed: 60fps, `quality: high`→settling correctly, genuinely multi-colored crystal hearts with visible faceting, correct lane-usage distribution favoring center lanes, `dropped spawns: 0`, zero visible errors.

---

## Changed files (implementation commit `310995d`)

| File | Nature of change |
|---|---|
| `vfx-rng.js` | **New.** `VFX.Rng`, `VFX.hashSeed`, `VFX.createRng`. |
| `vfx-renderer.js` | Item 1 (setResolutionScale fix), item 2 (onResize callback). |
| `vfx-engine.js` | Item 2 (`_handleResize`), item 3 (`fixedRateOnly` branch), item 15 (lifecycle guards, immediate quality-on-mount). |
| `vfx-scene.js` | Item 6 (`applyQuality` prefers system method), item 2 (`resize` forwarding), item 14 (destroy ownership), item 15 (lifecycle guards). |
| `vfx-particle-pool.js` | Item 15 (destroyed guards, exception-safe prewarm/release, `forEachAll`). |
| `vfx-trail-pool.js` | Item 9 (typed-array ring buffer), item 7 (`setMaxPoints` propagation), item 10 (rename). |
| `vfx-quality-manager.js` | Item 13 (`reducedMotion` flag on resolved preset). |
| `vfx-fountain-types.js` | Item 5 (`LANE_SPAWN_WEIGHTS`/`pickWeightedLane`), item 9 (`bezierPointInto`), item 13 (`reducedMotion` budget). |
| `vfx-crystal-heart-particle.js` | Item 11 (texture-per-spawn, `shimmerPhase` from opts). |
| `vfx-sparkle-particle.js` | Item 4 (rotation from opts, not `Math.random()`). |
| `vfx-fountain-source.js` | Item 4 (seeded ray/spark phase). |
| `vfx-fountain-emitter.js` | Items 4,5,6,7,8,9,10,11,13 — the largest single-file rewrite. |
| `vfx-fountain-debug.js` | Item 6 (simplified quality-select handler), item 10 (HUD label rename). |
| `vfx-fountain-demo.js` | Items 2,3,6 (dropped resize/quality polling, `fixedRateOnly` wiring). |
| `media.js` | Loader: inserted `vfx-rng.js` into the `?vfxdemo=2` script chain. |

No changes to `vfx-types.js`, `vfx-performance-monitor.js`, `vfx-texture-registry.js`, `vfx-base-particle.js`, `vfx-flow-field.js`, `vfx-spawn-zone.js`, `vfx-ticker.js`, `vfx-particle-system.js`, `vfx-debug-overlay.js`, `vfx-demo.js` — M1's core/demo files are untouched.

---

## Unresolved risks / honest gaps

1. **Real OS-level window-resize test not performed against the packaged app.** The Claude Browser pane's resize tool doesn't trigger `ResizeObserver` in this environment (confirmed with a bare non-VFX observer, not a code issue), and Windows-MCP's window-management tools were non-functional this session (`window_size` parameter rejected as an invalid type regardless of formatting; `Snapshot`/window enumeration returned "no windows found" despite `Screenshot` showing a real desktop). The resize-propagation *code path* is proven correct by direct invocation and by construction-time tests at three aspect ratios, but a genuine drag-to-resize test against a live OBS/browser-source-style window was not possible this session.
2. **GPU frame time and precise draw-call counts are not instrumented.** Item 12's draw-call figure is a reasoned estimate from container/trail counts, not a real GPU profiler reading. `EXT_disjoint_timer_query_webgl2` instrumentation would be a worthwhile follow-up if trail-heavy scenes ever show frame drops in the field.
3. **The NSIS installer (`VYRA-Setup.exe /S`) hung this session** (process alive, "Responding: True", near-zero CPU growth, no window visible for ~4 minutes) — most likely an unsigned-installer SmartScreen or elevation prompt that a non-interactive session can't click through (the build log shows `no signing info identified, signing is skipped` for every binary). Worked around by launching `dist2/win-unpacked/VYRA.exe` directly, which is the identical binary the installer would have placed — verification is genuine, but the installer path itself (what a real end user double-clicks) was not exercised this session and should be spot-checked interactively.
4. **Reduced-motion is budget-only, not geometry-only** — see item 13's note. Entrance easing and lane bulge shape are unchanged for reduced-motion viewers; only particle count/effects scale down.
5. **Heap/GC profiling for the hot-path allocation removals (item 9) was not directly instrumented** — the 10-minute stability run's flat behavior is strong circumstantial evidence of no leak/no growing GC pressure, but a dedicated `performance.memory` or DevTools heap-snapshot diff before/after a long run would be a more rigorous confirmation.

---

## Milestone 3

Not started, per instruction ("Do not begin Milestone 3"). Waiting for review.
