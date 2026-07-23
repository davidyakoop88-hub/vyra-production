# VYRA Handoff

This file is always kept ready so another engineer or AI session can pick up the VYRA
build-out with zero prior context. Read this first, then `VYRA_PROJECT_STATE.md` (current
snapshot), then `VYRA_MASTER_ROADMAP.md` (full phase list), then `VYRA_ARCHITECTURE.md`
(how the system fits together) as needed.

## What VYRA is

A local-first (today), build-free, static HTML/JS/CSS application for TikTok LIVE creators —
an overlay/widget studio plus (in progress) a deterministic Recognition Engine and VFX Engine,
packaged as a Windows desktop app via Electron and also runnable via a tiny PowerShell dev
server (`server.ps1`, port 4173). See `VYRA_ARCHITECTURE.md` for full detail, including a
documented, unresolved conflict between this local-first architecture and the roadmap's later
multi-tenant SaaS phases.

## Repository

`davidyakoop88-hub/-VYRA-source-code`, branch `feature/vyra-vfx-engine`.
Working directory in this environment:
`C:\Users\A\Desktop\vyra\VYRA-source-code-2026-07-14`

## How to run it locally

```
# Option A: PowerShell dev server (fastest for iteration)
powershell -File server.ps1
# then open http://127.0.0.1:4173/studio.html

# Option B: Electron packaged app
cd electron-app
npm install
npm start

# Optional: real TikTok LIVE bridge (separate process)
cd tiktok-bridge
npm install
node bridge.js <tiktok_username_without_@>
```

## How to run the only existing automated tests

```
node -e "require('./recognition-types.js');require('./recognition-rules.js');require('./recognition-normalizer.js');require('./recognition-merge.js');require('./recognition-queue.js');require('./recognition-controller.js');require('./recognition-card-mapper.js');require('./recognition-card.js');require('./recognition-runtime.js');require('./recognition-adapter-types.js');require('./recognition-adapter.js');require('./recognition-verify.js').run().then(r=>console.log(r.filter(x=>x.pass).length+'/'+r.length))"
```
Expected: `262/262` as of the latest commit on this branch. Or open
`recognition-verify.html` via the dev server and read `#summary`.

## What's done

See `VYRA_PROJECT_STATE.md` → "Completed systems". In short: the full widget/theme catalog,
the design-system migration, the VFX Engine (M1/M2/hardening/visual QA), the full Recognition
Engine including the standalone Recognition Runtime (Roadmap Phase 1, commit `540eaac`),
Runtime Hardening (Phase 2, commit `f022cf0`), the Generic Live Event Adapter Contract (Phase
3, commit `e670003`), and — under the **2026-07-22 re-prioritized roadmap** (premium widget
system, not TikTok/SaaS, is now the near-term goal; see `VYRA_MASTER_ROADMAP.md`) — the
**Premium Widget Design System** (Phase 4, commit `61bc455`: `premium-widget-core.js`,
`premium-widget-tokens.css`, `premium-widget-assets.js`, `premium-widget-demo.html`,
`docs/PREMIUM_WIDGET_SPEC.md`, plus a same-day refinement commit differentiating each
family's entrance/hold/exit animation language — see `docs/PREMIUM_WIDGET_SPEC.md` → "Per-family
animation language"). A separate, additive rendering system from `recognition-card.js` — 4
visually distinct widget families (Crystal Halo, Royal Crown, Legendary Portal, Elite
Minimal), see `VYRA_ARCHITECTURE.md` §10. Note: pixel screenshots could not be captured in
this session's environment (tool timeout, unrelated to the widget code) — visual QA relied on
DOM/geometry/computed-style inspection instead, disclosed as a gap in `VYRA_PROJECT_STATE.md`.
Also done: **Premium Gift Widget** (Phase 5, commit — see `VYRA_PROJECT_STATE.md`:
`premium-gift-widget.js`, `premium-gift-widget-demo.html`,
`docs/PREMIUM_GIFT_WIDGET_SPEC.md`). Priority-queue presentation router (small/medium/large/
legendary tiers, preemption, streak-update-in-place, 20-item capped queue) that calls Phase
4's `window.VyraPremiumWidget` to render — never renders DOM itself. **Documented decision**:
gift events do not flow through `recognition-runtime.js`, to avoid any risk to the
262/262-passing Recognition Engine suite (full reasoning in the spec file's "Integration
decision" section). `recognition-runtime.js`/`recognition-card.js` untouched.

## What's next

`VYRA_PROJECT_STATE.md` → "Exact next action": **Phase 6 — Top Gifter Widget**. Session-based
gift ranking display on the Phase 4 visual families, with its own ranking engine separate
from Card Mapper — decide whether it shares Phase 5's presentation queue or needs its own
(likely its own, since Top Gifter is persistent, not a transient preemptable presentation).

**Full new phase order** (see `VYRA_MASTER_ROADMAP.md` for details): Phase 4 Premium Widget
Design System (done) → 5 Premium Gift Widget (done) → 6 Top Gifter Widget → 7 MVP Reveal Widget → 8
Natural Like Fountain → 9 Match Widgets (X2/X3/Glove/Booster) → 10 Premium Widget Overlay
Integration → 11 TikTok LIVE Adapter → 12 OBS/TikTok LIVE Studio Validation. Billing,
analytics, campaigns, AI, account/workspace, and general SaaS expansion are explicitly
deferred — do not start any of that without the user re-prioritizing it again.

## Rules this project follows (do not violate these when continuing)

1. Inspect before assuming any file/API/function/dependency exists.
2. Preserve working functionality; don't rewrite stable systems without a concrete reason
   (e.g. `studio.js` is intentionally minified/untouched — sibling files monkey-patch
   `render`/`bind`/`props`/`wh` instead of editing it directly).
3. Small, separately-committed, separately-tested milestones. One phase per commit, using
   the exact conventional-commit message specified for that phase in the original roadmap
   prompt (see `VYRA_MASTER_ROADMAP.md` for the phase list).
4. No TikTok-specific code inside generic Recognition/VFX modules — TikTok logic is isolated
   to `tiktok-bridge/`, and (once built) `tiktok-live-adapter.js`.
5. Deterministic state machines, not hidden timers — the Recognition pipeline in particular
   has zero internal `setInterval`/`setTimeout`/`requestAnimationFrame` except
   `recognition-card.js`'s own animation-phase timers.
6. Sanitize all untrusted text (`textContent`, never `innerHTML`, for user-controlled
   strings) and all external URLs (`sanitizeImageUrl()` pattern in `recognition-card.js`) —
   this bar is met in the new Recognition pipeline; the legacy widget layer (`media.js` and
   friends) is not yet audited/remediated to this bar (flagged in `VYRA_PROJECT_STATE.md`).
7. Overlay output must keep working as an OBS/TikTok Studio browser source — never let
   editor-only interactivity leak into `?overlay=1` mode.
8. Never claim something works without actually testing it (Node + browser + manual demo
   where relevant).

## Known open decisions (raise with the user, don't decide unilaterally)

1. Local-first vs. hosted multi-tenant SaaS backend — blocks Phase 14 onward. See
   `VYRA_ARCHITECTURE.md` §9.
2. Where lint/test tooling should live, given no root `package.json` exists today — affects
   how literally Phase 22's "run lint" step can be executed.
3. Whether to extend the existing `action-event.js`/`sound-alerts.js` systems (Phases 12/13)
   or replace them — audit first, per working rule #4.

## Continuation prompt

If starting a fresh session to continue this work, paste:

> Continue the VYRA roadmap from `docs/VYRA_PROJECT_STATE.md` → "Exact next action". Read
> `docs/VYRA_MASTER_ROADMAP.md`, `docs/VYRA_ARCHITECTURE.md`, and `docs/VYRA_HANDOFF.md`
> first. Do not assume any file/API exists — verify against the actual repository at
> `C:\Users\A\Desktop\vyra\VYRA-source-code-2026-07-14` on branch `feature/vyra-vfx-engine`.
> Follow the working rules listed in `VYRA_HANDOFF.md`. Note the 2026-07-22
> re-prioritization: the near-term roadmap is the premium widget system (Phases 4-12), not
> TikTok/SaaS work — do not start billing/analytics/campaigns/AI/accounts/workspaces without
> the user re-prioritizing again. Complete Phase 6 (Top Gifter Widget), building on
> `premium-widget-core.js` from Phase 4 and following `premium-gift-widget.js`'s established
> conventions from Phase 5, run manual verification, commit with message
> `feat(widgets): add top gifter widget`, update the project-management docs, then continue to
> Phase 7.
