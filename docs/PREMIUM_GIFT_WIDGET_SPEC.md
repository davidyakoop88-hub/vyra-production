# Premium Gift Widget — Specification

Roadmap Phase 5. Builds on the Phase 4 Premium Widget Design System
(`window.VyraPremiumWidget`, see `docs/PREMIUM_WIDGET_SPEC.md`) — this layer never renders
DOM itself, it only decides *which* gift presentation should be active and calls
`window.VyraPremiumWidget.show/hide/update` to render it. No duplicated rendering or
animation logic.

## Integration decision (documented, not silently assumed)

**Gift-kind events do not flow through `window.VyraRecognitionRuntime.push()`.** This was a
deliberate architecture choice, not an oversight — reasoning:

1. `recognition-runtime.js`/`recognition-card.js` are stable, fully-tested (262/262) Phase
   1-3 files. Routing gifts through Runtime's own `presentation-start` → `card.show()` call
   and then trying to *intercept* it to prevent Recognition Card from also rendering would
   require either editing that frozen, tested pipeline (risk to existing coverage) or a hacky
   show-then-immediately-hide race. Neither is acceptable for "keep join, follow, share and
   ordinary like recognition working" — the safest way to guarantee zero regression to an
   already-passing suite is to not touch it.
2. Gift-specific merge semantics (streak-ID-based updates, `repeatCount` accumulation) are
   **not the same shape** as Recognition Merge's generic `mergeKey`+time-window aggregation —
   reusing it would mean bending a generic mechanism to a specific case, the same anti-pattern
   the Recognition Engine itself avoids elsewhere.
3. Every other integration point *is* reused by convention (not by import): tier-priority
   ordering mirrors `recognition-rules.js`'s `priority.base` ordinal-scale idea, Elite
   Minimal/Crystal Halo/Royal Crown/Legendary Portal are the exact Phase 4 building blocks,
   and the whole file follows the established deepClone/safeString/notify/subscriber/
   generation-guarded-timer conventions from `recognition-runtime.js` and
   `premium-widget-core.js`.

**Practical effect**: the integration layer (demonstrated in
`premium-gift-widget-demo.html`, and to be wired for real in Phase 11's TikTok work) calls
`window.VyraPremiumGiftWidget.show(model)` directly for gift events, and separately still
calls `window.VyraRecognitionRuntime.push(normalizedEvent)` for join/follow/share/like events
exactly as before — a raw event is routed to **one** system or the other based on its kind,
never both. Recognition Card is untouched and keeps working exactly as it does today for
every non-gift kind (and would still work for gift-kind events too, if a caller chose to push
one into Runtime directly — this phase does not remove that capability, it simply is not the
path used for qualifying gifts going forward).

## Public API

```js
window.VyraPremiumGiftWidget = {
  mount, show, hide, update, complete, skip, clear, destroy, getState, getStats, subscribe
};
```

No `start`/`stop`/`pause`/`resume`/`tick` — unlike Recognition Runtime, this system is not
designed to run under simulated time; presentation timing is real-clock, generation-guarded
`setTimeout` (same stale-timer-safety pattern as `premium-widget-core.js`), scoped per active
presentation. `destroy()` tears down only this module's own state and any presentations *it*
created — it never calls `window.VyraPremiumWidget.destroy()`, since later phases (Top
Gifter, MVP Reveal) share that same underlying widget system and must not be torn down as a
side effect of this module's own lifecycle.

## Model

```js
{
  id, eventId, timestamp,
  user: { id, displayName, avatarUrl },
  gift: { id, imageUrl, amount, coins, repeatCount, streakId },
  presentation: { tier, family, showDisplayName, showGiftName, title, subtitle, durationMs, intensity },
  accessibility: { announcement }
}
```

- `id` is optional (auto-generated if absent, returned in the `show()` result) — same
  convention as `premium-widget-core.js`.
- `presentation.tier` — one of `'small'|'medium'|'large'|'legendary'` (rejected if invalid).
- `presentation.family` — optional override of the default family mapping below; if provided,
  must be one of the 4 Phase 4 family names or the model is rejected.
- `presentation.intensity` — optional, one of `'low'|'normal'|'high'` (default `'normal'`);
  nudges the underlying Premium Widget **size tier** (small/medium/legendary) up or down one
  step from the base gift-tier mapping, clamped to the valid range — a real, functional
  effect, not accepted-and-ignored.
- `gift.repeatCount` — when present and `> 1`, becomes the displayed `×N` badge value
  (reuses Phase 4's existing `gift.amount` badge rendering — no new UI needed).
- `gift.streakId` — when a new `show()` call's `gift.streakId` matches the **currently
  active** presentation's `gift.streakId` (both non-null), the call is treated as a **streak
  update**: the active presentation's content is updated in place via
  `window.VyraPremiumWidget.update(...)` — the entrance animation never restarts. This is
  exactly what Phase 4's `update()` was built for (see `PREMIUM_WIDGET_SPEC.md`'s own
  `update()` doc comment: "WITHOUT restarting the enter animation").
- **Gift name is never displayed** — the model has no `gift.name` field at all (matching
  Phase 4's own `CardModelGift`-equivalent shape), so "hidden by default" holds by
  construction, not by a runtime check that could be bypassed. `presentation.showGiftName` is
  accepted and validated for forward API compatibility but has no renderable effect today.

## Default family + size-tier mapping

| Gift tier | Family (unless overridden) | Base Premium Widget size tier |
|---|---|---|
| small | Elite Minimal | small |
| medium | Crystal Halo | medium |
| large | Royal Crown | legendary (bigger silhouette, still visually distinct from legendary-tier gifts via family) |
| legendary | Legendary Portal | legendary |

`intensity` nudges the size tier: `'high'` moves one step up (small→medium→legendary, capped
at legendary), `'low'` moves one step down (capped at small); `'normal'` leaves it as mapped
above.

## Priority and preemption policy

Local ordinal priority (this file owns it — no dependency on `recognition-rules.js`):
`small = 10, medium = 20, large = 30, legendary = 40`.

- A new gift with **higher priority** than the currently active presentation **preempts it
  immediately**: the active one is marked `skipped` (stats + notification), removed, and the
  new one becomes active right away — satisfies "large and legendary gifts may preempt
  lower-tier presentations."
- A new gift with **equal or lower priority** than the active one is **enqueued** (priority
  queue, highest priority first, FIFO within equal priority via a monotonic sequence number —
  same tie-break convention as `recognition-queue.js`).
- The queue is capped at **20 entries** (smaller than Recognition Queue's 30, since gift
  bursts are typically shorter-lived than the full recognition stream). When full, a new
  arrival replaces the **lowest-priority** queued entry only if its own priority is strictly
  higher (identical replace-only-if-better policy as `recognition-queue.js`); otherwise it is
  dropped. This directly satisfies "small gifts must not endlessly block more valuable
  gifts" — small-gift floods can fill the queue with small entries, but any large/legendary
  gift arriving later still either preempts the active slot or displaces a queued small entry.
- When the active presentation completes (`durationMs` elapses) or is explicitly
  `complete()`/`skip()`d, the highest-priority queued entry (if any) becomes active next.

## Lifecycle

- `mount(target)` — idempotent (matches Phase 4 convention), does **not** itself call
  `window.VyraPremiumWidget.mount()` — the caller is responsible for mounting the underlying
  Premium Widget system first (this module assumes it, and `show()` fails gracefully with a
  `rejected` result and a clear reason if the underlying system isn't mounted yet, rather than
  silently mounting something on the caller's behalf).
- `show(model)` → `{status:'shown'|'preempted-active'|'streak-updated'|'queued'|'dropped'|'rejected', id?, reason?}`.
- `complete(id)` / `skip(id, reason)` — explicit lifecycle control, both advance the queue.
- `clear()` — hides the active presentation and empties the queue (does not destroy the
  underlying `VyraPremiumWidget` mount).
- `destroy()` — hides everything this module owns, clears all internal state and timers, does
  **not** touch `window.VyraPremiumWidget`'s own mount/instances. Not permanent (same
  documented deviation as Phase 4's `premium-widget-core.js`) — `mount()`/`show()` work again
  after `destroy()`.

## Product rules carried over from the prompt (cross-check)

- Gift name hidden by default — satisfied by construction (no field to render).
- Avatar always circular — inherited unchanged from Phase 4.
- Gift art + avatar one composition — inherited unchanged from Phase 4 (this module never
  touches layout).
- Repeated gifts/streak updates update cleanly, no animation restart — see `gift.streakId`
  above.
- Large/legendary preempt lower tiers — see priority policy above.
- Small gifts don't endlessly block — see queue cap + replace policy above.
- Missing images use premium fallbacks — inherited unchanged from Phase 4 (initials/SVG
  glyph, never a broken `<img>`).
- Long names don't change widget silhouette — inherited unchanged from Phase 4 (verified in
  the Phase 4 refinement pass: fixed family width, `text-overflow:ellipsis`).
- No TikTok-specific payload fields — confirmed, model is fully generic.
- No unsafe HTML — this file never touches the DOM directly, only calls
  `window.VyraPremiumWidget`'s own (already-audited) API.
- No hidden timers conflicting with Recognition Controller — this module owns its own
  real-clock, generation-guarded timers for presentation duration/auto-advance, entirely
  separate from and never interacting with `recognition-controller.js`.
- Explicit lifecycle control remains available — `complete()`/`skip()`/`clear()` are all
  public, callable at any time regardless of the internal auto-advance timers.
- Cleanup is complete — every timer is generation-guarded and cleared on preemption/complete/
  skip/clear/destroy, mirroring `premium-widget-core.js`'s own proven discipline.
