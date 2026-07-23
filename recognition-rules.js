// recognition-rules.js — Recognition Engine, pure configuration (Steg 4 + 5 + 6 + 7 + 8).
// No logic, no DOM, no timers, no side effects beyond registering window.VyraRecognitionRules.
// Consumed by recognition-merge.js, recognition-queue.js, recognition-controller.js,
// recognition-card-mapper.js and recognition-card.js (and later Filter) — never mutated at
// runtime; the whole tree is frozen below.
(function (root) {
  'use strict';

  // join has no time-based dedupe window: a duplicate join is only possible again once the
  // Recognition session itself is reset via VyraRecognitionMerge.clear() (see that file's
  // joinSeenActors Set). dedupeWindowMs's contract everywhere else is "a numeric millisecond
  // width the merge engine compares an elapsed time against" — rather than inventing a second,
  // undocumented mechanism just for join (e.g. a separate boolean/string flag the merge engine
  // would need special-case branching for), Infinity keeps join inside that exact same
  // "elapsed < window" comparison and simply never resolves true until clear() empties the
  // seen-set out from under it. This is the "clear implementation for join sessions" this file
  // is responsible for choosing and documenting.
  var JOIN_DEDUPE_IS_SESSION_SCOPED = Infinity;

  var canonical = {
    mergeWindowMs: Object.freeze({
      like: 1500,
      gift: 1500
    }),
    dedupeWindowMs: Object.freeze({
      join: JOIN_DEDUPE_IS_SESSION_SCOPED,
      follow: 5000,
      share: 5000
    }),

    // recognition-queue.js's base priorities. Gift has three tiers instead of one flat value —
    // see giftThresholds below for how a MergedEvent's coins value picks one of them.
    priority: Object.freeze({
      base: Object.freeze({
        join: 20,
        like: 40,
        share: 60,
        follow: 70,
        giftSmall: 75,
        giftMedium: 85,
        giftLarge: 95
      }),
      // small: coins < 100, medium: 100 <= coins < 1000, large: coins >= 1000.
      giftThresholds: Object.freeze({
        small: 100,
        medium: 1000
      })
    }),

    // recognition-queue.js's per-kind expiration window in ms, applied against
    // event.timestamp (falling back to enqueuedAt) to compute a QueueItem's expiresAt.
    expirationMs: Object.freeze({
      join: 10000,
      like: 15000,
      share: 30000,
      follow: 60000,
      gift: 90000
    }),

    queue: Object.freeze({
      maxLength: 30
    }),

    // recognition-controller.js's per-kind presentation duration in ms — how long a
    // CurrentPresentation stays active before tick() auto-completes it. Gift tiers reuse the
    // exact same priority.giftThresholds above (documented requirement: Controller classifies
    // gifts identically to Queue), so no separate gift threshold set exists here.
    presentationMs: Object.freeze({
      join: 2500,
      like: 3000,
      share: 3500,
      follow: 4000,
      giftSmall: 4500,
      giftMedium: 5500,
      giftLarge: 7000
    }),

    // recognition-card-mapper.js's like-variant boundaries: count < wave -> 'like-pulse',
    // wave <= count < storm -> 'like-wave', count >= storm -> 'like-storm'. Gift variants reuse
    // priority.giftThresholds above instead of a second set defined here — same "don't
    // duplicate magic boundaries across files" rule this file already follows for gifts.
    likeVariantThresholds: Object.freeze({
      wave: 100,
      storm: 1000
    }),

    // recognition-card.js's UI animation phase durations in ms — purely visual timing, not to
    // be confused with presentationMs above (how long Controller keeps an event "current" —
    // Card never decides that itself). Values chosen within the spec's required ranges:
    // anticipation 80-140, reveal 280-420, settle 180-300, exit 220-320.
    cardTimingMs: Object.freeze({
      anticipation: 110,
      reveal: 340,
      settle: 220,
      exit: 260
    })
  };

  var existing = root.VyraRecognitionRules;
  var next = (existing && typeof existing === 'object')
    ? Object.assign({}, existing, canonical)
    : canonical;

  root.VyraRecognitionRules = Object.freeze(next);
})(typeof window !== 'undefined' ? window : globalThis);
