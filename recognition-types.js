// recognition-types.js — Recognition Engine, shared data contracts (Steg 3).
// No DOM access, no timers, no side effects beyond registering window.VyraRecognitionTypes.
// Every other Recognition Engine file (normalizer, filter, merge, queue, card-mapper, card,
// controller, adapter) reads its shared vocabulary from here. This file has no dependency on
// any other Recognition Engine file, and nothing here depends on media.js or any widget.
(function (root) {
  'use strict';

  var RECOGNITION_EVENT_KINDS = Object.freeze(['join', 'follow', 'share', 'like', 'gift']);

  var canonical = {
    RECOGNITION_EVENT_KINDS: RECOGNITION_EVENT_KINDS,
    DEFAULT_DISPLAY_NAME: 'Guest',
    DEFAULT_COUNT: 1,
    DEFAULT_COINS: 0
  };

  // If this file is loaded twice (or a future file pre-registers a compatible partial
  // namespace before this one runs), merge rather than clobber — the canonical fields
  // defined above always win since this file is their source of truth.
  var existing = root.VyraRecognitionTypes;
  var next = (existing && typeof existing === 'object')
    ? Object.assign({}, existing, canonical)
    : canonical;

  root.VyraRecognitionTypes = Object.freeze(next);
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * @typedef {'join'|'follow'|'share'|'like'|'gift'} RecognitionEventKind
 * One of window.VyraRecognitionTypes.RECOGNITION_EVENT_KINDS.
 */

/**
 * Shape read at the TikTok Event Adapter boundary (the Adapter itself is not implemented in
 * this step). Still close to the raw server/TikTok event shape — every field is optional
 * because the real event source (server.ps1 / electron-app/local-server.js / tiktok-bridge)
 * does not guarantee any of them are present, and some real fields (id, timestamp, userId)
 * may arrive as numbers rather than strings.
 * @typedef {Object} RecognitionRawEvent
 * @property {string|number} [id]
 * @property {string} [type]
 * @property {string} [username]
 * @property {string} [name]
 * @property {string} [profileImage]
 * @property {string} [avatarUrl]
 * @property {string|number} [giftId]
 * @property {string} [giftName]
 * @property {string} [giftImage]
 * @property {number|string} [coins]
 * @property {number|string} [count]
 * @property {number|string} [timestamp]
 * @property {string|number} [userId]
 */

/**
 * @typedef {Object} NormalizedEventActor
 * @property {string} id
 * @property {string} username
 * @property {string} displayName
 * @property {?string} avatarUrl
 */

/**
 * @typedef {Object} NormalizedEventGift
 * @property {string} id
 * @property {string} name
 * @property {?string} imageUrl
 */

/**
 * Canonical, TikTok-agnostic shape produced by recognition-normalizer.js. Every later
 * pipeline stage (Filter, Merge, Queue, Controller, Card) reads only this shape — never a
 * RecognitionRawEvent, and never a TikTok/server field name directly.
 * @typedef {Object} NormalizedEvent
 * @property {string} id
 * @property {RecognitionEventKind} kind
 * @property {NormalizedEventActor} actor
 * @property {?NormalizedEventGift} gift
 * @property {number} count
 * @property {number} coins
 * @property {number} timestamp
 * @property {string} mergeKey
 */

/**
 * Output of recognition-merge.js (Steg 4). Same fields as NormalizedEvent plus aggregate
 * bookkeeping — this is the ONE shape used for both a lone event (join/follow/share, or a
 * like/gift that never merged with anything else) and a genuinely merged combo. Every later
 * stage (Queue, Controller, Card) reads only this shape.
 * @typedef {Object} MergedEvent
 * @property {string} id
 * @property {RecognitionEventKind} kind
 * @property {NormalizedEventActor} actor
 * @property {?NormalizedEventGift} gift
 * @property {number} count
 * @property {number} coins
 * @property {number} timestamp
 * @property {string} mergeKey
 * @property {number} mergedCount
 * @property {number} firstSeen
 * @property {number} lastSeen
 * @property {string[]} sourceEventIds
 */

/**
 * Internal item shape held by recognition-queue.js (Steg 5). peek()/dequeueNext() unwrap this
 * down to its plain `event` for callers — only getItems() exposes the full QueueItem, for
 * introspection/debugging.
 * @typedef {Object} QueueItem
 * @property {MergedEvent} event
 * @property {number} priority
 * @property {number} enqueuedAt
 * @property {number} expiresAt
 * @property {number} sequence
 */

/**
 * @typedef {'idle'|'presenting'|'paused'|'stopped'} ControllerStatus
 */

/**
 * The single active recognition moment held by recognition-controller.js (Steg 6). `status`
 * is `'presenting'` while active; completeCurrent()/skipCurrent() and tick()'s own
 * auto-completion hand out a copy with `status` set to `'completed'`/`'skipped'` instead —
 * the field always reflects what actually happened to that particular presentation.
 * @typedef {Object} CurrentPresentation
 * @property {string} id
 * @property {MergedEvent} event
 * @property {number} startedAt
 * @property {number} durationMs
 * @property {number} endsAt
 * @property {'presenting'|'completed'|'skipped'} status
 */

/**
 * Payload handed to recognition-controller.js subscribers.
 * @typedef {Object} ControllerNotification
 * @property {'start'|'stop'|'pause'|'resume'|'presentation-start'|'presentation-complete'|'presentation-skip'|'clear'} type
 * @property {number} timestamp
 * @property {CurrentPresentation} [presentation]
 * @property {string} [reason]
 * @property {*} [result]
 */

/**
 * @typedef {Object} CardModelActor
 * @property {string} id
 * @property {string} username
 * @property {string} displayName
 * @property {?string} avatarUrl
 * @property {string} initials
 */

/**
 * @typedef {Object} CardModelGift
 * @property {string} id
 * @property {string} name
 * @property {?string} imageUrl
 * @property {'small'|'medium'|'large'} tier
 */

/**
 * @typedef {Object} CardModelContent
 * @property {string} eyebrow
 * @property {string} title
 * @property {string} subtitle
 * @property {?string} countLabel
 * @property {?string} coinLabel
 */

/**
 * @typedef {Object} CardModelMetadata
 * @property {string} sourceEventId
 * @property {?string} presentationId
 * @property {number} timestamp
 * @property {?number} durationMs
 * @property {number} count
 * @property {number} coins
 * @property {number} mergedCount
 */

/**
 * Output of recognition-card-mapper.js (Steg 7) — the ONE shape recognition-card.js will ever
 * render. Plain text only everywhere (no HTML/markup) so the Card component can safely treat
 * every string field as text content, never innerHTML.
 * @typedef {Object} CardModel
 * @property {string} id
 * @property {RecognitionEventKind} kind
 * @property {string} variant
 * @property {CardModelActor} actor
 * @property {?CardModelGift} gift
 * @property {CardModelContent} content
 * @property {{ariaLabel: string}} accessibility
 * @property {CardModelMetadata} metadata
 */

/**
 * @typedef {'unmounted'|'idle'|'entering'|'visible'|'exiting'|'destroyed'} CardUIPhase
 */

/**
 * Return value of recognition-card.js's getState() (Steg 8) — always a deep copy, never the
 * live internal object.
 * @typedef {Object} CardUIState
 * @property {boolean} mounted
 * @property {boolean} visible
 * @property {CardUIPhase} phase
 * @property {?CardModel} currentModel
 */

/**
 * Payload handed to recognition-card.js subscribers.
 * @typedef {Object} CardUINotification
 * @property {'mount'|'show'|'replace'|'update'|'enter-complete'|'hide'|'exit-complete'|'destroy'|'error'} type
 * @property {number} timestamp
 * @property {CardModel} [model]
 * @property {string} [reason]
 */

/**
 * @typedef {'unmounted'|'stopped'|'idle'|'presenting'|'paused'|'destroyed'} RuntimeStatus
 */

/**
 * Return value of recognition-runtime.js's getState() (Steg 9) — always a deep copy. The
 * merge/queue/controller/card fields are each that module's own getStats()/getState() output
 * at the moment of the call, also deep-copied — Runtime exposes no live/mutable references.
 * @typedef {Object} RuntimeState
 * @property {boolean} mounted
 * @property {boolean} running
 * @property {boolean} paused
 * @property {boolean} destroyed
 * @property {RuntimeStatus} status
 * @property {Object} merge
 * @property {Object} queue
 * @property {Object} controller
 * @property {Object} card
 */

/**
 * Payload handed to recognition-runtime.js subscribers.
 * @typedef {Object} RuntimeNotification
 * @property {'mount'|'start'|'stop'|'pause'|'resume'|'push'|'merge-pending'|'enqueue'|'presentation-start'|'presentation-complete'|'presentation-skip'|'card-show'|'card-hide'|'flush'|'clear'|'destroy'|'error'} type
 * @property {number} timestamp
 * @property {Object} [event]
 * @property {Object} [presentation]
 * @property {CardModel} [model]
 * @property {string} [reason]
 */
