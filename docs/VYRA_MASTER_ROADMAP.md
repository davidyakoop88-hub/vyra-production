# VYRA Master Roadmap

This is the authoritative, living list of every major system in the VYRA build-out, in
execution order. Update the **Status**, **Related commits**, and **Known risks** columns as
work lands — do not let this file drift out of date. See `VYRA_PROJECT_STATE.md` for the
current snapshot (branch, latest commit, blockers, exact next action) and
`VYRA_ARCHITECTURE.md` for how the pieces fit together.

**2026-07-22 re-prioritization**: the product goal for the current build-out is the premium
live overlay widget system, not general SaaS expansion. Phases 4-12 below were re-sequenced
around that goal (Premium Widget Design System → Premium Gift Widget → Top Gifter → MVP
Reveal → Like Fountain → Match Widgets → Overlay Integration → TikTok Adapter → OBS/TikTok
Studio Validation). Billing, analytics, campaigns, AI, account/workspace systems, and general
SaaS expansion are explicitly **out of scope** for this pass — their acceptance criteria are
preserved read-only in the "Deferred" section at the bottom so the work isn't lost, but none
of it should be started until the user explicitly re-prioritizes it.

Status legend: `done` / `in-progress` / `not-started` / `blocked`.

| # | Phase | Status | Depends on | Acceptance criteria | Related commits | Known risks |
|---|---|---|---|---|---|---|
| 0 | Repository audit | done | — | Baseline recorded in `VYRA_PROJECT_STATE.md`; no unrelated fixes made during audit | (docs only) | Audit was grep-based/targeted, not an exhaustive per-file manual read — deeper issues may surface later |
| 1 | Standalone Recognition Runtime | done | Recognition Steg 1-8 (Types/Rules/Normalizer/Merge/Queue/Controller/Mapper/Card) | 242/242 automated cases pass (Node+browser); manual demo pass covers join/like-burst/mixed-priority/stress/pause-resume/stop/clear/destroy; zero console errors; media.js/studio.html untouched | `540eaac` | None currently open |
| 2 | Runtime hardening | done | Phase 1 | 500-mixed-event stress test passes; repeated start/stop and mount/clear cycles leave no leaked subscriptions/state; `?recognitiondebug=1` diagnostics mode exists and is provably inert without the flag; `docs/recognition-runtime-report.md` written | `f022cf0` | No defects found; JS-heap-level leak profiling not available in this environment — deferred to a later performance audit |
| 3 | Generic live event adapter contract | done | Phase 2 | `recognition-adapter.js`/`recognition-adapter-types.js` define a provider-agnostic connect/disconnect/event-envelope contract; zero TikTok-specific logic inside it; adapter demo shows a fake provider driving the Recognition Runtime end-to-end | `e670003` | Contract is a factory (multiple independent instances), unlike every other Recognition Engine singleton — intentional, since more than one live connection may exist at once |
| 4 | Premium Widget Design System | in-progress | Phase 1 (Recognition Runtime, for later integration); existing `recognition-card.css`/design-tokens.css conventions | Shared foundation (`premium-widget-core.js`, `premium-widget-tokens.css`, `premium-widget-assets.js`, `premium-widget-demo.html`, `docs/PREMIUM_WIDGET_SPEC.md`) supports 4 visually distinct families (Crystal Halo, Royal Crown, Legendary Portal, Elite Minimal) with genuinely different silhouettes, not recolored rectangles; manual visual QA at 1080×1920/1920×1080/1080×1080 | (this session) | Does not replace or modify `recognition-card.js`/`recognition-card.css` — a separate, additive system |
| 5 | Premium Gift Widget | done | Phase 4 | Real gift-triggered widget built on the Phase 4 foundation, all 4 families usable for real gift tiers, replaces nothing existing (additive) | (Phase 5 commit, see `VYRA_PROJECT_STATE.md`) | Gift events do not flow through `recognition-runtime.js`/`recognition-card.js` by design (documented integration decision in `docs/PREMIUM_GIFT_WIDGET_SPEC.md`) — a future phase may want a real dispatcher that routes by kind at the adapter/normalizer boundary rather than each caller choosing manually |
| 6 | Top Gifter Widget | not-started | Phase 4 | Session-based gift ranking display (time window, total coins/gifts, streak info), built on Phase 4 visual families, separate ranking engine from Card Mapper | — | Must not require showing the gift name; profile+gift imagery as one composition, not two separate elements |
| 7 | MVP Reveal Widget | not-started | Phase 4, Phase 6 (ranking data) | Match/session-winner final reveal, distinct from Top Gifter, cannot be starved by low-priority recognition traffic | — | Needs its own priority lane, not a normal Recognition Queue item |
| 8 | Natural Like Fountain | not-started | Phase 4 (visual conventions), existing VFX Engine (M1/M2, done) | Organic, non-robotic rising-hearts fountain, reduced-motion + low-perf modes, fixed particle budget, resize-safe | — | Existing `media.js` Like Fountain is pure CSS-loop — this phase decides reuse vs. rebuild after inspecting it first (rule #4) |
| 9 | Match Widgets: X2, X3, Glove, Booster | not-started | Phase 4, Phase 7 (MVP for match-end interplay) | x2/x3/glove/booster as semantic, configurable visual events; documented priority policy against gift/recognition traffic; idempotent duplicate updates | — | Legacy Battle MVP/boost-pack widgets in `media.js` already establish visual precedent — reuse conventions, don't duplicate an incompatible second system |
| 10 | Premium Widget Overlay Integration | not-started | Phases 4-9 | All premium widgets mountable together in one overlay instance without z-index collisions, duplicate animation loops, or click-blocking layers; responsive across 9:16/16:9/square | — | Must coordinate with the existing `vfx-ticker.js` single-owner ticker rather than introducing a second animation loop |
| 11 | TikTok LIVE Adapter | not-started | Phase 3 (adapter contract); existing `tiktok-bridge/bridge.js` transport | Real or simulated TikTok events flow through Normalizer → Recognition Runtime, never touching widgets directly; gift streaks don't double-count; simulation mode works without a live session | — | `tiktok-live-connector` is an **unofficial** library — no official TikTok API exists; document this limitation prominently |
| 12 | OBS and TikTok LIVE Studio Validation | not-started | Phases 4-11 | All premium widgets verified as real OBS/TikTok LIVE Studio browser sources: transparent background, correct dimensions, no click-blocking, refresh/cache behavior documented | — | No dedicated tokenized browser-source route exists yet (`overlay.html` is a bare redirect) — validate against the existing `studio.html?overlay=1` mode as-is unless this phase determines a real gap |

## Next recommended task

**Phase 4 — Premium Widget Design System** (in progress this session). See
`VYRA_PROJECT_STATE.md` → "Exact next action" for the specific work items and current status.
**Phase 6 — Top Gifter Widget** is next. Phase 5 (Premium Gift Widget) is done.

## Open decisions requiring the user (not resolved unilaterally)

1. **Local-first vs. hosted multi-tenant SaaS** — deferred along with the Account/Workspace
   phase (see "Deferred" section below); not relevant to Phases 4-12.
2. **Lint/test tooling location** — no root `package.json` exists; relevant only once a
   release-preparation pass is back in scope.
3. **Legacy automation/sound systems** (`action-event.js` family, `sound-alerts.js`) already
   exist — relevant only once Automation/Sound phases are back in scope.
4. **Like Fountain reuse vs. rebuild** (Phase 8) — the existing `media.js` implementation is
   pure CSS; a decision on whether to extend it or build a new JS-driven version on the Phase
   4 foundation should be made when Phase 8 starts, after inspecting it directly.

## Deferred — out of scope for this pass (preserved for later reference)

These were part of an earlier, broader roadmap draft. They are **not** being worked on now
per the user's explicit 2026-07-22 instruction ("Do not start billing, analytics, campaigns,
AI, account systems, workspace systems, or general SaaS expansion"). Content is kept verbatim
so no acceptance-criteria work is lost — do not start any of these without the user
explicitly re-prioritizing them.

| Phase | Depends on | Acceptance criteria | Known risks |
|---|---|---|---|
| Overlay Runtime (generic layer coordinator beyond the premium widgets) | Recognition Runtime, VFX Engine | `window.VyraOverlayRuntime` coordinates layers with one owner per animation loop; no duplicate mounts; responsive across 9:16/16:9/square/custom | Must not introduce a second competing animation loop alongside `vfx-ticker.js` |
| Overlay Editor | Overlay Runtime | Layer list, visibility/lock toggles, drag/resize/snap/align, safe-area viz, device presets, undo/redo, browser-source URL generation | Existing `studio.html?overlay=1` mode and editor mode share one page — must not let editor-only listeners leak into overlay-output mode |
| Browser-source delivery (dedicated tokenized route) | Overlay Editor | Dedicated `overlay.html`/`/overlay/:overlayId` entry serving transparent, tokenized, sanitized overlay output; invalid overlay IDs rejected | Today `overlay.html` is a bare redirect with zero ID/token concept — greenfield |
| Gift Campaigns | Recognition Runtime | Campaign CRUD, progress/contributor ranking, milestone + completion events, campaign-specific VFX | Do not assume TikTok exposes scheduling via API |
| Actions and Event Automation | Recognition Runtime, TikTok adapter | Trigger/action engine with schema validation, cooldowns, loop protection, execution logs, no `eval`/user JS execution | `action-event.js`/`action-runtime.js`/`action-scenes.js` already exist — audit before extending vs. replacing |
| Sound Engine | Actions and Event Automation | Library, volume/mute, per-event mapping, cooldown, overlap limit, autoplay-safe, OBS-compatible | `sound-alerts.js` already exists — audit before building a second system |
| Account/Workspace/Data model | Product decision (local-first vs. hosted SaaS) | Formal models for user/workspace/overlay/campaign/etc. with IDs, ownership, versioning, server-side authorization | **Architecture conflict documented, not resolved** — today's app is local-first with no backend/database/auth; see `VYRA_ARCHITECTURE.md` §9 |
| Dashboard and navigation (SaaS-scale) | Account/Workspace model | Professional sidebar, responsive, accessible, no click-blocking overlay, loading/empty/error states | `studio.html`'s existing nav already works — extend via the established monkey-patch convention, don't rewrite `studio.js` |
| Analytics | Account/Workspace model (for persisted history) | Session/joins/follows/shares/likes/gifts/coins/unique-gifters/top-gifters/etc. with clear provider-vs-derived data labeling | No analytics pipeline exists today — greenfield |
| AI features | Analytics (session data to summarize) | Optional, isolated, non-critical-path AI helpers with graceful failure, rate limits, no secret leakage | Must never sit on the critical overlay render path |
| Performance and reliability audit | All runtime-bearing phases | 30-min simulated session, 10k raw events, high like volume, disconnect/reconnect, overlay reload all pass without leaks/freezes; `docs/performance-report.md` written | Phase 0's baseline findings (setInterval/rAF/listener-cleanup inventory) get individually resolved here |
| Security review | All phases | `docs/security-review.md` documents tested protections and remaining risks (never claims "fully secure") | Legacy `innerHTML` usage flagged in Phase 0 baseline is the primary known input |
| Accessibility and responsive QA | Dashboard, Overlay Editor | Keyboard nav, focus visibility, ARIA, contrast, reduced motion, screen-reader announcements, long names, non-Latin text, emoji | Recognition Card already ships `role="status"`/`aria-live="polite"` — extend that bar, don't introduce a lower one |
| Release preparation | Substantially all phases | README + install/dev/OBS/TikTok/deployment/troubleshooting docs, `.env.example` with no real secrets | No `.env`/secrets exist in the repo today |
| Final acceptance test | All phases | Clean-checkout install → lint → unit → integration → build → full manual walkthrough all pass | No lint config/root `package.json` exists today |
