# VYRA Architecture

Last audited: 2026-07-22, branch `feature/vyra-vfx-engine`. Updated same day to add §10
(Premium Widget Design System, Roadmap Phase 4).

This document describes the system **as it actually exists today**, verified by direct
inspection of the repository (not assumed). Where the long-term roadmap
(`VYRA_MASTER_ROADMAP.md`) requires capabilities that do not exist yet, that gap is called
out explicitly rather than silently assumed.

## 1. Application shape (confirmed)

VYRA today is a **static, build-free, single-tenant, local-first application**:

- No `package.json` at the repository root, no bundler, no framework, no `node_modules` for
  the frontend. Every `.js` file is loaded as a plain `<script>` tag or injected at runtime
  via `Promise.resolve().then(...)` script-tag insertion (see §4).
- Two Node subprojects exist, each with their own `package.json`:
  - `electron-app/` — packages the whole repo into a Windows desktop app
    (`electron-builder`, NSIS installer, produces `VYRA-Setup.exe`). Its `main.js` +
    `local-server.js` serve the exact same static files the PowerShell server does, so the
    app also runs standalone without Electron.
  - `tiktok-bridge/` — a standalone Node script (`bridge.js`) that depends on the unofficial
    `tiktok-live-connector` npm package. See §6.
- The primary dev server is `server.ps1`, a 23-line PowerShell `HttpListener` on
  `127.0.0.1:4173` that (a) serves static files from the repo root and (b) implements a tiny
  in-memory REST API (`/api/status`, `/api/connect`, `/api/disconnect`, `/api/events`
  GET/POST, `/api/state` GET/POST) with **no authentication of any kind** and a single global
  `$connection`/`$events` state (max 250 events, ring buffer).
- **No database.** All durable state is either `localStorage` (`vyra-state` key, read by the
  minified `studio.js`) or a single flat file `vyra-state-backup.json` written via
  `/api/state` POST. There is exactly one implicit "workspace" — the local machine.

## 2. Entry points

| File | Role |
|---|---|
| `index.html` | Marketing/landing page |
| `studio.html` | The entire dashboard/editor SPA shell — loads `studio.js` (minified, hand-written state/view/render/bind engine) plus ~30 sibling feature files injected by `media.js`'s script tail |
| `overlay.html` | Pure redirect shim: `location.replace('studio.html?overlay=1')` — the actual overlay renderer is `studio.html` itself in `?overlay=1` mode, not a separate app |
| `media.js` | The largest file (285 lines, but each line is long/minified-style); defines most widget renderers (`wh()`/`props()`/`bind()` per widget type), the `routeLiveBattleEvent` dispatcher, and the script-tail injection list that loads every sibling `*.js` feature file in dependency order |
| `live-client.js` | 10-line polling client: hits `GET /api/events?after=<lastId>` every 650ms, dispatches a `vyra-live-event` DOM CustomEvent, calls `routeLiveBattleEvent(e)` and `window.VyraActionEvent.handleEvent(...)` for each new event |
| `studio.js` | Minified core SPA engine: `state`, `view`, `render()`, `go()`, `bind()`, `save()`/`toast()`. Every sibling feature file monkey-patches `render`/`bind`/`props`/`wh` rather than editing this file directly (established, intentional convention — see prior session history) |

## 3. Event flow (today, pre-Recognition-Runtime integration)

```
tiktok-bridge/bridge.js  (real TikTok, via tiktok-live-connector)
        |  POST /api/events {type, username, name, profileImage, coins, count, ...}
        v
server.ps1  (in-memory ring buffer, id = timestamp-based)
        |  GET /api/events?after=<id>  (polled every 650ms)
        v
live-client.js  -> window.VyraLive, dispatches 'vyra-live-event', calls routeLiveBattleEvent(e)
        |
        +--> media.js: routeLiveBattleEvent(e)  -> legacy per-widget triggers (Like Fountain, Fan/Gifter Level Up, Battle MVP, etc.)
        +--> window.VyraActionEvent.handleEvent(type, payload)  -> Action & Event automation rules
```

**The Recognition Engine (types/normalizer/rules/merge/queue/controller/mapper/card/runtime,
all built this session) is not yet wired into this flow.** It exists as a fully tested,
standalone pipeline (`recognition-runtime.js` and friends) with its own dev-only demo page,
but nothing in `live-client.js` or `media.js` calls
`window.VyraRecognitionRuntime.push(...)` yet. Wiring a real adapter between the raw
`/api/events` feed (or `tiktok-bridge`'s payload shape) and the Recognition Runtime is
**Phase 3/4 of the roadmap**, not yet done — see `VYRA_MASTER_ROADMAP.md`.

## 4. Recognition pipeline (built, standalone, tested)

```
NormalizedEvent -> Merge Engine -> Priority Queue -> Presentation Controller -> Card Mapper -> Recognition Card
```

Files: `recognition-types.js`, `recognition-rules.js`, `recognition-normalizer.js`,
`recognition-merge.js`, `recognition-queue.js`, `recognition-controller.js`,
`recognition-card-mapper.js`, `recognition-card.js`, `recognition-card.css`, and the
orchestrator `recognition-runtime.js`.

- Every file follows the same universal-module pattern:
  `(function (root) { 'use strict'; ... })(typeof window !== 'undefined' ? window : globalThis);`
  so the same file runs unmodified under a browser `<script>` tag or Node `require()`.
- No file in this pipeline owns a `setInterval`/`setTimeout`/`requestAnimationFrame` **except**
  `recognition-card.js`, which uses `setTimeout` only for its own enter/exit animation phases
  (generation-token guarded against stale callbacks). Confirmed by direct grep — the only
  other `setInterval`/`requestAnimationFrame` occurrences in these files are code comments
  documenting the rule, not real timer calls.
- `recognition-card.js` sanitizes every external image URL through a single
  `sanitizeImageUrl()` helper before use (avatar and gift images) and renders all
  user-controlled text via `textContent`, never `innerHTML` — confirmed by direct read.
- Dev-only test harness: `recognition-verify.js` (+ `recognition-verify.html`), 242 cases as
  of this audit, run two ways: `node -e "require(...).run().then(...)"` and the browser page's
  auto-run-on-load. **Never loaded by `media.js`/`studio.html`/production** — this is the
  project's own from-scratch harness; no test framework (Jest/Mocha/etc.) exists anywhere in
  the repo.
- `recognition-runtime.js` is the standalone orchestrator (see `VYRA_PROJECT_STATE.md` for its
  exact API) with its own dev demo, `recognition-runtime-demo.html`, that simulates time
  explicitly (no reliance on the real wall clock) so timing-sensitive behavior (merge
  windows, presentation durations, expirations) is deterministically testable.

## 5. VFX pipeline (built, standalone)

`vfx-types.js`, `vfx-performance-monitor.js`, `vfx-quality-manager.js`,
`vfx-texture-registry.js`, `vfx-base-particle.js`, `vfx-particle-pool.js`,
`vfx-flow-field.js`, `vfx-spawn-zone.js`, `vfx-renderer.js`, `vfx-ticker.js`,
`vfx-particle-system.js`, `vfx-scene.js`, `vfx-engine.js`, `vfx-debug-overlay.js`,
`vfx-fountain-*.js`, `vfx-crystal-heart-particle.js`, `vfx-sparkle-particle.js`,
`vfx-trail-pool.js`, `vfx-rng.js`. Built on a locally-vendored `pixi.min.js` (PixiJS) and
`gsap.min.js` (entrance timelines). One owning ticker (`vfx-ticker.js`) drives the whole
system — confirmed no second competing `requestAnimationFrame` loop exists among these files
(the earlier grep hit on `vfx-ticker.js`/`vfx-demo.js`/`vfx-fountain-demo.js` is the ticker's
own single, intentional owner, already hardened in the M2 hardening pass —
see `VYRA_VFX_ENGINE_M2_HARDENING_REPORT.md`).

Loaded conditionally via a `?vfxdemo=1`/`?vfxdemo=2` query flag in `media.js`'s script tail —
**not loaded in normal production widget rendering today**. Routing real semantic overlay
events (gift tiers, like bursts, MVP reveal, etc.) into this engine is Phase 8 of the roadmap,
not yet done.

## 6. External integrations

- **TikTok LIVE**: no official public API. `tiktok-bridge/bridge.js` uses the unofficial
  `tiktok-live-connector` npm package, run as a separate local Node process
  (`node bridge.js <username>`), and forwards normalized-ish payloads into `server.ps1`'s
  `/api/events` — the same endpoint the in-app "Testa gåva" demo button already posts to.
  This is the **existing, intended connection method** — Phase 4 (TikTok adapter) must
  build on this, not invent a new transport (per working rule #2/#18).
- No other external services are integrated today (no Spotify API keys, no payment
  processor, no analytics SDK, no AI API) despite UI pages existing for some of these
  (Chatbot, Spotify tabs) — those are local-only/placeholder today; verify before assuming
  any of them call a real external API.

## 7. Storage model (today)

- `localStorage['vyra-state']` — the entire widget/layout/flow configuration for the
  single implicit workspace, read/written synchronously by `studio.js`.
- `vyra-state-backup.json` — a flat-file mirror, written via `POST /api/state`, read via
  `GET /api/state`. No versioning, no migration mechanism, no schema validation.
- IndexedDB (`vyra-action-media` DB) — used by `action-media.js`/`action-runtime.js` for
  user-uploaded media blobs (audio/image/video for automation actions and custom widgets).
- **No accounts, no workspaces-as-a-concept, no per-user isolation, no server-side
  persistence, no auth tokens anywhere in the codebase.** This is the single biggest gap
  relative to the roadmap's later phases (14 onward) — see the conflict note below.

## 8. Security boundaries (today — see `docs/security-review.md` once Phase 19 runs)

- `server.ps1`'s static file handler path-traversal-guards via `GetFullPath` +
  `StartsWith($root)` — confirmed reasonable for its scope.
- No auth on any `/api/*` endpoint — anyone who can reach `127.0.0.1:4173` (i.e., anyone
  with local network/machine access) can post fake events, read/write state, or trigger
  connect/disconnect. Acceptable for a local single-user desktop app; **not** acceptable
  as-is for the SaaS/multi-tenant vision implied by Phases 14+.
- Recognition Card layer (`recognition-card.js`) already sanitizes external URLs and uses
  `textContent` — this is the one part of the codebase already built to the roadmap's
  security bar. The legacy widget layer (`media.js` and most sibling `*.js` files) renders
  many user-influenced strings via `innerHTML` template literals without escaping — a real,
  documented risk (see `VYRA_PROJECT_STATE.md` baseline findings), not yet remediated.

## 9. Known architecture conflict — flagged per working rule #18

The roadmap's later phases (14 — Account/Workspace/Data model, 15 — Dashboard navigation as
a "production" SaaS app, 16 — Analytics, 17 — AI features) describe a multi-tenant,
server-backed SaaS product with persisted accounts, ownership, and authorization boundaries.

The current, actually-shipping architecture is a **local, single-user, static, build-free
application** with no backend framework, no database, and no auth. Reconciling these is a
**product/technical decision, not an engineering detail** — it determines whether Phase 14
onward means:

(a) building a real backend service (Node/Express, or similar) + a database + hosted
    multi-tenant auth, a substantial new system alongside the existing local app, or
(b) keeping VYRA local-first per-creator (as it is today) and scoping "workspace"/"account"
    concepts to local profiles instead of a hosted multi-tenant system.

This document intentionally does not resolve that decision. Phases 0-13 (Recognition
Runtime, hardening, adapters, overlay runtime/editor/browser-source, VFX integration, Top
Gifter/MVP, match events, campaigns, automation, sound) are all buildable within the current
local-first architecture without resolving this conflict, and are sequenced first for that
reason. The conflict must be resolved before serious work starts on Phase 14.

## 10. Premium Widget Design System (Roadmap Phase 4, 2026-07-22)

A **separate, additive rendering system** from the Recognition Engine (§4), built for the
product's primary near-term goal: a premium live overlay widget system (Top Gifter, MVP
Reveal, Gift Widget, Match Widgets — Roadmap Phases 5-9). Files: `premium-widget-core.js`
(lifecycle engine), `premium-widget-tokens.css` (shared tokens + all 4 family/tier CSS),
`premium-widget-assets.js` (image sanitization, initials, hand-authored inline SVG glyphs),
`premium-widget-demo.html` (dev demo). Full spec: `docs/PREMIUM_WIDGET_SPEC.md`.

- **No dependency on the Recognition Engine** — different root class (`.vyra-pw-root` vs.
  `.vyra-recognition-root`), different z-index band (999998 vs. 999999, Recognition Card wins
  ties so high-frequency join/like traffic is never buried under a less-frequent premium
  widget), no shared selectors. Both systems can be mounted on the same overlay page
  simultaneously without collision — confirmed by construction, not yet tested with both
  actually mounted together (that's Roadmap Phase 10, Premium Widget Overlay Integration).
- **Architectural difference from Recognition Card**: Recognition Card is a single-current-card,
  replace-on-show model (one card visible at a time, queue-driven). Premium Widget supports
  **multiple concurrently visible instances**, keyed by `model.id`, tracked in a `Map` —
  necessary because later phases need a persistent Top Gifter widget and transient Gift Widget
  bursts on screen at the same time. `.vyra-pw-root` is `display:flex; flex-wrap:wrap` so
  multiple simultaneous instances lay out side-by-side automatically with no extra code.
- **Same timer-safety discipline as `recognition-card.js`**: every phase transition
  (anticipation → reveal → settled → exit → removed) is a single generation-guarded
  `setTimeout`, one generation counter + pending-timer `Set` **per instance** (not per-module,
  since multiple instances can be mid-animation independently). Zero `setInterval`, zero
  `requestAnimationFrame` loop.
- **One documented deviation from Recognition Card's contract**: `destroy()` is **not
  permanent** here — `mount()` may be called again afterward. This is deliberate (the system
  is expected to support editor-style repeated mount/destroy cycles in a future in-app widget
  editor), not an oversight; called out explicitly in both the spec and the code comment.
- **4 visually distinct families**, verified genuinely different silhouettes (not
  color-only variants) by direct geometry measurement at 1080×1920/1920×1080/1080×1080:
  Crystal Halo (faceted panel, gift orb overlapping the avatar edge), Royal Crown (asymmetric
  crest + crown glyph + separate corner gift emblem), Legendary Portal (concentric portal
  rings behind a centered avatar, gift resting on a pedestal, staged entry animation, tallest
  family at ~12% of a 1920px-tall canvas), Elite Minimal (slim pill, no glow/particles).
- **Verification methodology note**: automated screenshot capture (`computer{action:
  "screenshot"}`/`zoom`) was unavailable in this session's environment (consistent tool
  timeout regardless of viewport size) — visual QA at the three required resolutions was done
  via `getBoundingClientRect()`/`getComputedStyle()` geometry inspection instead (confirmed
  circular avatars, in-viewport bounds, safe-zone compliance, distinct per-family bounding
  boxes). This is a real, load-bearing verification (not automated unit tests), but it is not
  pixel-level visual review — flagged so a future session with working screenshot tooling can
  do a supplementary pixel-level pass before this system is considered fully visually signed
  off.
