# VYRA Test Plan

This describes how each layer of VYRA is (or will be) tested. Update this file as new test
surfaces are added — do not let it drift from what actually exists.

## 1. Unit tests (in place today)

- **Harness**: `recognition-verify.js` + `recognition-verify.html` — a from-scratch, dev-only
  harness (no Jest/Mocha/Vitest anywhere in the repo, confirmed by search). Runs identically
  under Node (`require(...).run().then(...)`) and in-browser (auto-run on page load).
- **Coverage today**: 242 cases across Normalizer (13), Merge (22 + 6 pending-stats),
  Queue (25), Controller (37), Card Mapper (49), Card (41), Runtime (49).
- **Run it**:
  ```
  node -e "require('./recognition-types.js');require('./recognition-rules.js');require('./recognition-normalizer.js');require('./recognition-merge.js');require('./recognition-queue.js');require('./recognition-controller.js');require('./recognition-card-mapper.js');require('./recognition-card.js');require('./recognition-runtime.js');require('./recognition-verify.js').run().then(r=>console.log(r.filter(x=>x.pass).length+'/'+r.length))"
  ```
  or open `recognition-verify.html` via the local server and read `#summary`.
- **Gaps**: no unit tests exist yet for the legacy widget layer (`media.js` and ~30 sibling
  feature files), for `server.ps1`, or for `tiktok-bridge/bridge.js`. Not required by any
  phase completed so far; will be needed once Phase 4 (TikTok adapter) and Phase 12
  (automation engine) land real logic worth unit-testing in isolation.

## 2. Integration tests

- **Today**: the Recognition Runtime demo (`recognition-runtime-demo.html`) is a manual
  integration-test surface — it exercises the full Merge→Queue→Controller→Mapper→Card chain
  with simulated time, not mocks. Verified this session (see `VYRA_PROJECT_STATE.md`).
- **Planned** (Phase 3/4): an adapter-to-runtime integration test — a fake/simulated provider
  driving real `NormalizedEvent`s through `recognition-adapter.js` into
  `window.VyraRecognitionRuntime`, confirming the Card is the only thing that ever renders,
  never a raw provider payload.
- **Planned** (Phase 5+): Overlay Runtime integration — Recognition Runtime + VFX Engine
  running together inside one overlay instance, confirmed non-interfering (no double
  animation loop, no z-index collisions).

## 3. Stress tests

Already run and passing (this session):
- 50-event mixed stress push through the Recognition Runtime demo — zero console errors,
  correct pending-merge/merged/queued counts.
- Like-burst-10 aggregation — confirmed `mergedCount:10`.

Planned (Phase 2 hardening, Phase 18 performance audit):
- 500-mixed-event Recognition Runtime stress test.
- Repeated start/stop cycles (leak check).
- Repeated mount/clear cycles (leak check).
- 1,000 VFX command stress test (Phase 8).
- 10,000 raw event ingestion (Phase 18).
- 30-minute simulated live session (Phase 18).
- Repeated gift streaks at high frequency (Phase 18).
- Network disconnect/reconnect storms (Phase 18, Phase 4).

## 4. Visual QA

- VFX Engine M2 visual QA already completed and documented: entrance sequence timing,
  portrait/landscape/square idle states, quality modes Low/Medium/High/Ultra,
  reduced-motion, fountain width variants, intensity 25/50/100%, lane-debug view — see
  `VYRA_VFX_ENGINE_M2_VISUAL_QA.md`.
- Recognition Card variants (`join-soft`, `like-pulse`, `like-wave`, `like-storm`,
  `share-signal`, `follow-spotlight`, `gift-crystal`, `gift-crown`, `gift-legendary`) —
  visually confirmed during Steg 8 (prior session), not re-screenshotted this pass; re-verify
  visually whenever Card Mapper's variant-selection rules change.
- Planned: overlay editor visual QA (Phase 6), browser-source output visual QA at real OBS/
  TikTok Studio resolutions (Phase 7).

## 5. Browser compatibility

- Verified so far only in the in-app preview browser (Chromium-based, via the Claude_Browser
  pane) and the packaged Electron app (Chromium via Electron's bundled runtime).
- Not yet tested: Firefox, Safari, or older Chromium versions that OBS/TikTok LIVE Studio's
  embedded browser sources might use internally. Flag before claiming full compatibility.

## 6. OBS Browser Source testing

Not yet performed as a dedicated test pass — planned for Phase 7 (Browser-source delivery)
once a real tokenized `overlay.html`/`/overlay/:overlayId` route exists. Must confirm:
- Transparent background actually transparent in OBS (not black).
- Correct dimensions at common OBS canvas sizes (1080x1920 portrait, 1920x1080 landscape).
- No click-blocking behavior (OBS browser sources are non-interactive anyway, but must not
  assume this — verify no editor-only JS runs in this mode).
- Refresh/cache behavior on OBS's "Refresh cache of current page" action.

## 7. TikTok LIVE Studio browser source testing

Same gaps as OBS — not yet performed, planned for Phase 7. TikTok LIVE Studio's embedded
browser may have stricter behavior around autoplay audio and transparency; must verify
separately from OBS, not assumed identical.

## 8. Failure and recovery scenarios

Verified this session (Recognition Runtime only):
- Destroy is idempotent; calling `destroy()` twice does not throw.
- Push after destroy returns a safe `rejected` result, never throws.
- Subscriber exceptions are isolated (a throwing subscriber does not stop other subscribers
  or corrupt runtime state) — covered by existing Merge/Queue/Controller/Runtime test cases.
- Mapper/Card rejection during `presentation-start` is contained (`safeSkipCurrent`), does
  not crash the Runtime.

Planned:
- TikTok bridge disconnect/reconnect behavior with bounded, cancellable backoff (Phase 4).
- Overlay reload mid-session (Phase 18).
- Hidden-tab behavior for VFX/animation loops (Phase 18).

## 9. How to add a new test today

Add a new case function to the relevant `run*Cases(results)` function in
`recognition-verify.js`, following the existing `runCase(name, fn)` thunk pattern (return a
deferred zero-arg function, not an already-executing Promise — required for the strict serial
execution chain `run()` uses). Use the `hasDom()` guard + soft-skip pattern for any
DOM-dependent case so the same file still runs cleanly under Node.
