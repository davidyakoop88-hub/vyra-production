# Premium Widget Design System — Specification

Roadmap Phase 4. This document is written **before** `premium-widget-core.js` implements it —
every constant named below is the one the code actually uses (checked by direct reference
while writing this document, not aspirational). If the implementation ever needs to diverge
from this spec, update this file in the same commit.

## Scope and relationship to the Recognition Card

This is a **separate, additive system** from `recognition-card.js`/`recognition-card.css`
(the Roadmap Phase 1-3 engine's join/like/share/follow/gift cards). Nothing here modifies,
imports from, or depends on those files, and nothing there depends on this. Both systems may
render on the same overlay page simultaneously without conflict (different root class names,
different z-index bands — see "Depth layers" below). The Recognition Card remains the
lightweight, high-frequency, low-decoration presentation layer (every join/like/follow/share
+ ordinary gifts); the Premium Widget system is the deliberately higher-production-value layer
for gifts/rankings/MVP/match moments where the extra visual weight is earned by the moment's
importance (built out across Phases 5-9).

## Design canvas and dimensions

Primary design canvas: **1080×1920 (9:16, portrait)** — this is what a TikTok LIVE Studio
browser source actually renders at. Every widget is authored against this canvas first, then
verified unmodified (via responsive units, not canvas-specific hacks) at 1920×1080 (16:9) and
1080×1080 (square).

Widgets are **not** full-canvas — each is a self-contained, fixed-max-width composition
positioned within the canvas's own safe zone (see below), sized in real CSS px with a
`min(px, vw)` clamp identical in spirit to `recognition-card.css`'s own
`width: min(var(--vyra-rec-w), 92vw)` convention. Per-family footprint (bounding box at
default/medium tier, before responsive clamping):

| Family | Width | Approx. height | Notes |
|---|---|---|---|
| Crystal Halo | 320px | ~170px | Faceted panel, avatar + overlapping gift orb |
| Royal Crown | 360px | ~200px | Asymmetric crest, crown glyph adds ~24px top overflow |
| Legendary Portal | 380px | ~260px | Portal rings + pedestal add real vertical height |
| Elite Minimal | 260px | ~92px | Slim horizontal bar |

## Safe zones

- Horizontal: minimum 16px from either canvas edge (`clamp` to `92vw` max width, same
  convention as `recognition-card.css`).
- Vertical, bottom: TikTok LIVE's own chrome (comment box, gift bar, share/heart icons)
  occupies roughly the bottom 12-15% of a real portrait stream. Widgets must not render lower
  than **82% of viewport height** from the top (i.e. `bottom` anchoring keeps at least 18vh of
  clearance) — implemented as `--pw-safe-bottom: 18vh` in `premium-widget-tokens.css`.
  Landscape/square anchor the same way but the percentage matters less since there's no
  TikTok-specific chrome to avoid in an OBS-only landscape scene.
- Vertical, top: minimum 6vh (matches `recognition-card.css`'s `padding: 5vh 16px` convention,
  rounded up slightly since portal/crown families have taller silhouettes).

## Typography scale

Reuses the exact scale already proven in `recognition-card.css` (do not invent a second one):

| Token | Size | Weight | Use |
|---|---|---|---|
| `--pw-font-eyebrow` | 11px | 700 | Small uppercase label ("GIFT", "TOP GIFTER", "MVP") — Latin-authored strings only, never user text |
| `--pw-font-title` | 17px (Elite Minimal: 15px) | 700 | Display name (when `text.showDisplayName` is true) |
| `--pw-font-subtitle` | 13px | 500-600 | Secondary line (amount/coins phrasing) |
| `--pw-font-badge` | 12-13px | 700 | Pill badges (coin/amount) |

Font stack: system font stack only (`-apple-system, BlinkMacSystemFont, "Segoe UI", Inter,
Roboto, Helvetica, Arial, sans-serif`) — identical to `recognition-card.css`, no external font
load, so emoji/non-Latin text renders using the OS's own font fallback chain with zero extra
work. Display name text is **never** forced `text-transform: uppercase` (that's reserved for
the fixed eyebrow label) since uppercasing breaks or looks wrong for many non-Latin scripts.

## Animation timings

Per-tier defaults (overridable per instance via `model.timing.{enterMs,holdMs,exitMs}`):

| Tier | enterMs (total) | holdMs (default) | exitMs |
|---|---|---|---|
| small | 650 | 3200 | 260 |
| medium | 850 | 4200 | 320 |
| legendary | 1150 | 6000 | 420 |

`enterMs` is the **total** of a family's own internal enter sub-phases (not every family uses
the same sub-phase split — Legendary Portal's rings-then-avatar-then-text staged entry
naturally takes the full budget; Elite Minimal's flat fade/slide uses a single phase well
under budget). All timers are generation-guarded `setTimeout` calls exactly like
`recognition-card.js`'s `scheduleTimer`/`clearAllTimers`/`pendingTimers` pattern — no
`setInterval`, no `requestAnimationFrame` loop anywhere in `premium-widget-core.js`.

## Per-family animation language

Added in the Phase 4 refinement pass (2026-07-22). The JS-level `enterMs`/`holdMs`/`exitMs`
scheduling above is shared, but each family drives it through a **genuinely different CSS
mechanism** — not the same keyframes with different durations. All of this lives in
`premium-widget-tokens.css`; `premium-widget-core.js` was not changed for this pass (it only
ever toggles the same four phase classes — `vyra-pw-phase-anticipation` /
`-reveal` / `-settled` / `-exit` — every family-specific behavior below is pure CSS reacting
to those classes plus the family class already on the widget root).

| Family | Entrance | Hold (idle) | Exit |
|---|---|---|---|
| **Crystal Halo** | "Soft refractive assembly" — panel scales in from 1.08× fully blurred (10px) to sharp, like condensing out of mist; a single diagonal light shimmer sweeps once across the glass (`::after` gradient sweep, `vyra-pw-crystal-shimmer`); the widget's own particle layer doubles as **crystal segments** that fly in from six distinct origin directions (`--pw-seg-x/-y` per particle) and converge on the composition (`vyra-pw-crystal-segment-in`) | Gentle breathing glow — `.vyra-pw-glow` pulses opacity/scale on a slow 4400ms loop (`vyra-pw-crystal-breathe`) | "Dissolves into light fragments" — the same particles scatter back out along their own origin direction while the panel blurs and fades (`vyra-pw-crystal-segment-out` + panel blur/scale) |
| **Royal Crown** | "Rise and lock" — the whole frame rises from `translateY(46px)` with a firm, no-bounce deceleration (no blur, unlike Crystal Halo); the crown glyph drops from above with visible weight — a brief `scaleY(.88)` compress-on-landing "thud" (`vyra-pw-crown-land`), not a playful bounce | A single slow gold light sweep plays once across the frame border, ~400ms after settling (`vyra-pw-crown-sweep`, `::after` on `.vyra-pw-crown-frame`) — one-shot, not looping | "Frame retracts cleanly" — `scaleY(.7)` collapse toward the bottom edge, no blur, no dispersal — a mechanical retraction, not a dissolve |
| **Legendary Portal** | Cinematic, staged, three sequential sub-animations for "stronger layered depth than other families": portal rings scale/fade in first (`vyra-pw-portal-ring-in`, 0ms), the avatar pops in second with overshoot (`vyra-pw-portal-avatar-pop`, +160ms delay), the text rises in last (`vyra-pw-portal-text-rise`, +420ms delay) | "Controlled energy" — rings pulse+rotate subtly on a 3600ms loop (`vyra-pw-portal-ring-pulse`) while the particle layer becomes slow-drifting "energy motes" with staggered per-particle delays (`vyra-pw-portal-energy-drift`) | "Portal closes around the composition" — avatar+text collapse first (`vyra-pw-portal-content-fade`, 160ms), rings close in 60ms later (`vyra-pw-portal-ring-close`) — sequenced so the portal visibly closes *after* the composition has already left, not everything fading together |
| **Elite Minimal** | A `clip-path` **wipe** (`inset(0 100% 0 0 round 999px)` → `inset(0 0 0 0 round 999px)`) — a fundamentally different mechanism from the other three (no transform, no scale, no blur, no keyframes at all) | **Deliberately nearly static** — no idle animation whatsoever, matching the "minimal footprint, dislikes large overlays" brief; the only family with zero hold-phase motion | Quick compact `translateX(16px)` slide + fade — intentionally simpler than the entrance (no wipe on exit) |

Reduced-motion handling: the existing wildcard rule (`.vyra-pw-widget * { animation-duration:
1ms !important; ... }`) already collapses every animation/transition above, including the new
infinite hold-phase loops (`animation-iteration-count: 1 !important` stops them looping). A
second, more targeted block was added specifically for the three families with custom
*anticipation*-phase overrides (Crystal Halo's blur+scale, Royal Crown's translateY, Elite
Minimal's clip-path) — the generic `.vyra-pw-phase-anticipation { transform:none; filter:none;
}` reset has lower CSS specificity than `.vyra-pw-family-X.vyra-pw-phase-anticipation` and
would never actually win against it, so equal-specificity override rules were added at the end
of the stylesheet (source order breaks the specificity tie) to guarantee no family ever starts
from an off-screen/blurred/clipped state under reduced motion, even for the ~1ms the
transition still technically runs.

**Verification note on timing**: this session's browser automation environment exhibits
significant (and variable, roughly 2×-10×) `setTimeout` throttling on backgrounded/inactive
tabs, which made precise mid-animation timing checks across multiple separate tool calls
unreliable (a check meant to land 750ms into an animation might land only 75ms of *real*
internal progress in). Verification instead used single, continuous, uninterrupted browser
scripts with generous real-time budgets to sample the full lifecycle end-to-end (confirmed:
opacity correctly reaches and holds at 1 through reveal→settled, phase classes transition
correctly, DOM is cleanly removed after exit) for one family end-to-end, plus **instant,
synchronous immediate-state checks** (which are not subject to timer throttling) for all four
families' anticipation-phase starting values, confirming each matches its coded, distinct
entrance state.

## Depth layers and z-index

| Layer | z-index (within widget) | Content |
|---|---|---|
| 0 | 0 | Ambient glow / background field |
| 1 | 1 | Family-specific back geometry (portal rings / crown crest / crystal facets / minimal has none) |
| 2 | 2 | Gift image composition |
| 3 | 3 | Avatar/profile composition (front-most focal point; overlaps gift in Crystal Halo/Legendary Portal by design) |
| 4 | 4 | Text content |
| 5 | 5 | Badges (amount/coins) |
| 6 | 6 | Decorative particles (bounded, performance-mode-gated) |

**Exception**: families whose composition intentionally overlaps the gift art onto the
avatar's edge (Crystal Halo's gift orb, Legendary Portal's pedestal near-edge) apply a local
`z-index` override on that one element so it renders above the avatar layer *at the overlap
point only* — documented inline in that family's own CSS block, not a change to the global
ordering for every other layer or family.

Root container: `.vyra-pw-root` is `position: fixed; inset: 0; pointer-events: none; z-index:
999998` — one below `.vyra-recognition-root`'s `999999`, so a Premium Widget never visually
fights the Recognition Card for top stacking if both happen to be mounted (Premium Widgets are
the rarer, more significant moment, but Recognition Card's high-frequency join/like traffic
should never be visually buried by a premium widget sitting on top of it indefinitely — the
Recognition Card wins ties). Individual widget instances stack via DOM order (later `show()`
calls append later, per family container `position: relative`), no per-instance z-index needed
beyond the root.

## Image cropping rules

- **Avatar**: always circular (`border-radius: 50%`), `object-fit: cover`,
  `object-position: center`. Never stretched, never cropped to a non-circular shape.
- **Gift image**: always `object-fit: contain` — never cropped. Sized per family/tier (44-84px
  depending on family and tier, documented in `premium-widget-tokens.css`). May be positioned
  to visually overlap the avatar composition (Crystal Halo, Legendary Portal) via absolute
  positioning/offset — the overlap is a **composition** choice, never achieved by cropping the
  gift art itself.

## Fallbacks

- **Missing avatar** (`user.avatarUrl` absent or fails `sanitizeImageUrl`): render initials
  (first 1-2 characters of `displayName`, uppercased) over a neutral gradient circle — the
  exact `<img>`-omitted-entirely technique `recognition-card.js` already uses (no broken-image
  icon ever appears, zero layout shift).
- **Missing gift image** (`gift.imageUrl` absent/invalid): render a small inline SVG gift-box
  glyph (from `premium-widget-assets.js`) in place of the image, same
  opacity-toggle-on-fallback-class technique as `recognition-card.css`'s
  `.vyra-recognition-gift-fallback-symbol`.
- **Long display names**: `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`,
  bounded to the text column's `max-width`.
- **Emoji / non-Latin text**: no special handling needed beyond the system font stack — system
  fonts render emoji and non-Latin scripts natively without extra code.

## Particle budgets and performance modes

- **Standard mode**: up to 6 decorative particles/accents per widget instance (same ceiling
  `recognition-card.js` already uses via `PARTICLE_COUNT = 6`), fixed count, fixed positions
  (no per-render randomization).
- **Low-performance mode** (`setPerformanceMode('low')`, module-level — applies to every
  future `show()` call, not per-instance): particles render count 0, `backdrop-filter`/`blur`
  glow effects are dropped from the applied class list, only opacity/transform enter-exit
  motion remains. This is a single shared setting (mirrors how `vfx-quality-manager.js`
  governs the whole VFX Engine, not per-particle-system) — documented, not hidden.
- **Reduced motion** (`prefers-reduced-motion: reduce`, detected the same way
  `recognition-card.js` does via `window.matchMedia`): all animation/transition durations
  collapse to ~1ms, idle/ambient looping animations (idle glow pulse, portal ring drift) are
  suppressed entirely — same contract as `recognition-card.css`'s existing
  `@media (prefers-reduced-motion: reduce)` block.

## Visual acceptance criteria (verified manually, not just by automated tests)

- Each family is immediately distinguishable by silhouette alone (no color-only differences).
- Circular profile images look intentional in every family (correctly sized ring/border per
  family's own visual language, not a generic circle dropped onto four different backgrounds).
- Gift imagery feels integrated rather than pasted beside the avatar (Crystal Halo's
  overlapping orb, Royal Crown's corner emblem, Legendary Portal's pedestal, Elite Minimal's
  inline accent — four different integration strategies, not one repeated layout).
- No mandatory gift-name label is present anywhere in any family's default rendering.
- The widget remains readable over both light and dark video backgrounds (verified via the
  existing dark-glass-panel + drop-shadow technique already proven in `recognition-card.css`).
- The widget does not occupy excessive portrait screen space (largest family, Legendary
  Portal, stays under ~14% of a 1920px-tall canvas's height).
- Entry animation establishes depth (scale/blur/translateY on entry, staged sub-phases for
  Legendary Portal specifically).
- Hold animation remains subtle (idle glow pulse only, no aggressive motion).
- Exit animation is controlled and clean (fade + small translate, matching
  `recognition-card.css`'s own exit phase).
- Replaying 100 times does not accumulate DOM nodes or listeners (single root element reused,
  generation-guarded timers, old card element removed before/as the new one is appended —
  same discipline as `recognition-card.js`'s `show()`).
- Missing images do not break the layout (verified fallback paths above).
- Reduced-motion mode removes nonessential movement (verified above).

## Public API (implemented by `premium-widget-core.js`)

```js
window.VyraPremiumWidget = {
  mount, show, hide, update, preview,
  setPerformanceMode, destroy, getState, subscribe
};
```

Model shape (`CardModel`-equivalent for this system):

```js
{
  id, family, tier,
  user: { id, displayName, avatarUrl },
  gift: { imageUrl, amount, coins },
  text: { title, subtitle, showDisplayName, showGiftName },
  timing: { enterMs, holdMs, exitMs },
  accessibility: { announcement }
}
```

`show()` renders via `role="status" aria-live="polite"` on the widget root (same accessibility
contract as Recognition Card) using `accessibility.announcement` as the accessible text when
provided, falling back to a generated announcement from `user.displayName`/`text.title`
otherwise. All user-controlled text (`displayName`, `text.title`, `text.subtitle`) is rendered
via `textContent` only — never `innerHTML` — and every image URL passes through the same
`sanitizeImageUrl()` allow-list (`https://`, `data:image/`, `blob:`) `recognition-card.js`
already uses, reimplemented identically in `premium-widget-assets.js` so this system has no
runtime dependency on the Recognition Engine files.

## `preview()` vs `show()`

`preview(model, options)` is a demo/editor-only convenience that calls the same internal
render path as `show()` but is explicitly documented as **not** intended for production event
flow — it exists so `premium-widget-demo.html` (and, later, an in-app widget editor) can
render a widget without going through a real presentation lifecycle. It does not skip any of
`show()`'s validation, sanitization, or cleanup guarantees.
