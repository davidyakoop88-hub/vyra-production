// recognition-queue.js — Recognition Engine, Priority Queue (Steg 5).
// Takes MergedEvent in (from recognition-merge.js), holds it as a QueueItem, hands MergedEvent
// back out in priority order. No DOM, no UI, no animation, no Controller, no timers
// (setTimeout/setInterval) — expiration is only ever checked lazily, on peek()/dequeueNext()/
// a full-queue enqueue(), exactly like recognition-merge.js's flushExpired() is checked on
// demand rather than on a background timer.
// Depends on recognition-types.js (RECOGNITION_EVENT_KINDS, the QueueItem contract) and
// recognition-rules.js (priority.base, priority.giftThresholds, expirationMs, queue.maxLength).
// Silent unless a caller opts into dev-mode logging the same way recognition-merge.js /
// recognition-normalizer.js do (?recognitiondebug=1 in the browser, always-on under Node).
(function (root) {
  'use strict';

  var Types = root.VyraRecognitionTypes || {};
  var Rules = root.VyraRecognitionRules || {};
  var VALID_KINDS = Types.RECOGNITION_EVENT_KINDS || ['join', 'follow', 'share', 'like', 'gift'];
  var PRIORITY_BASE = (Rules.priority && Rules.priority.base) || { join: 20, like: 40, share: 60, follow: 70, giftSmall: 75, giftMedium: 85, giftLarge: 95 };
  var GIFT_THRESHOLDS = (Rules.priority && Rules.priority.giftThresholds) || { small: 100, medium: 1000 };
  var EXPIRATION_MS = Rules.expirationMs || { join: 10000, like: 15000, share: 30000, follow: 60000, gift: 90000 };
  var MAX_LENGTH = (Rules.queue && Rules.queue.maxLength) || 30;

  // ---- state ------------------------------------------------------------------
  // In-memory only, scoped to this module's closure — clear() resets all of it, nothing here
  // is persisted to localStorage/disk (matches recognition-merge.js's own scope decision).

  var items = [];          // QueueItem[], unsorted storage — sorted only on read
  var sequenceCounter = 0;
  var paused = false;
  var subscribers = [];    // fn(notification) listeners

  var stats = {
    enqueued: 0,
    dequeued: 0,
    dropped: 0,
    replaced: 0,
    expired: 0,
    rejected: 0
  };

  // ---- public API ---------------------------------------------------------------

  /**
   * @param {import('./recognition-types.js').MergedEvent} mergedEvent
   * @returns {{status:'enqueued'|'dropped'|'replaced'|'rejected', event?:import('./recognition-types.js').MergedEvent, replacedEvent?:import('./recognition-types.js').MergedEvent, reason?:string}}
   */
  function enqueue(mergedEvent) {
    try {
      return enqueueInternal(mergedEvent);
    } catch (err) {
      stats.rejected += 1;
      logDebug('enqueue() threw, treated as rejected: ' + safeString(err && err.message));
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  function enqueueInternal(mergedEvent) {
    var validation = validateMergedEvent(mergedEvent);
    if (!validation.ok) {
      stats.rejected += 1;
      logDebug('rejected: ' + validation.reason);
      return { status: 'rejected', reason: validation.reason };
    }

    var enqueuedAt = Date.now();
    sequenceCounter += 1;
    var candidate = {
      event: deepClone(mergedEvent),
      priority: computePriority(mergedEvent),
      enqueuedAt: enqueuedAt,
      expiresAt: computeExpiresAt(mergedEvent, enqueuedAt),
      sequence: sequenceCounter
    };

    if (items.length >= MAX_LENGTH) {
      // 1. try removing expired events first — this alone may free up room.
      removeExpired(enqueuedAt);
    }

    if (items.length < MAX_LENGTH) {
      items.push(candidate);
      stats.enqueued += 1;
      notify('enqueue', { item: deepClone(candidate) });
      return { status: 'enqueued', event: deepClone(candidate.event) };
    }

    // 2. still full: replace the lowest-priority item only if the candidate strictly
    // outranks it. Equal priority keeps the older item and drops the candidate — this is also
    // exactly why a join (priority 20, the lowest value in the whole table) can never displace
    // anything: no other kind's priority is ever lower than join's, so join never wins this
    // comparison, while a gift (75/85/95) reliably outranks a join it finds sitting at the
    // bottom of a full queue.
    var lowest = findLowestPriorityItem();
    if (lowest && candidate.priority > lowest.priority) {
      removeItemBySequence(lowest.sequence);
      items.push(candidate);
      stats.enqueued += 1;
      stats.replaced += 1;
      notify('replace', { item: deepClone(candidate), replacedItem: deepClone(lowest) });
      return { status: 'replaced', event: deepClone(candidate.event), replacedEvent: deepClone(lowest.event) };
    }

    stats.dropped += 1;
    var reason = 'queue full, candidate priority (' + candidate.priority + ') does not exceed the lowest pending item\'s priority';
    notify('drop', { item: deepClone(candidate), reason: reason });
    return { status: 'dropped', reason: reason };
  }

  /**
   * @param {number} [now]
   * @returns {?import('./recognition-types.js').MergedEvent}
   */
  function dequeueNext(now) {
    if (paused) return null; // "utan att ta bort något" — no expiry sweep runs while paused either
    var effectiveNow = resolveNow(now);
    removeExpired(effectiveNow);
    var sorted = getSortedItems();
    if (!sorted.length) return null;
    var top = sorted[0];
    removeItemBySequence(top.sequence);
    stats.dequeued += 1;
    notify('dequeue', { item: deepClone(top) });
    return deepClone(top.event);
  }

  /**
   * @param {number} [now]
   * @returns {?import('./recognition-types.js').MergedEvent}
   */
  function peek(now) {
    var effectiveNow = resolveNow(now);
    removeExpired(effectiveNow); // unaffected by pause — "peek ska fortfarande kunna visa nasta event"
    var sorted = getSortedItems();
    if (!sorted.length) return null;
    return deepClone(sorted[0].event);
  }

  function size() {
    return items.length;
  }

  function clear() {
    items = [];
    sequenceCounter = 0;
    paused = false;
    stats.enqueued = 0;
    stats.dequeued = 0;
    stats.dropped = 0;
    stats.replaced = 0;
    stats.expired = 0;
    stats.rejected = 0;
    notify('clear', {});
  }

  function pause() {
    if (paused) return;
    paused = true;
    notify('pause', {});
  }

  function resume() {
    if (!paused) return;
    paused = false;
    notify('resume', {});
  }

  function isPaused() {
    return paused;
  }

  function getItems() {
    return getSortedItems().map(deepClone);
  }

  function getStats() {
    return {
      enqueued: stats.enqueued,
      dequeued: stats.dequeued,
      dropped: stats.dropped,
      replaced: stats.replaced,
      expired: stats.expired,
      rejected: stats.rejected,
      length: items.length,
      paused: paused
    };
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function unsubscribe() {};
    subscribers.push(fn);
    return function unsubscribe() {
      var idx = subscribers.indexOf(fn);
      if (idx !== -1) subscribers.splice(idx, 1);
    };
  }

  // ---- priority / expiration ---------------------------------------------------------

  function computePriority(event) {
    if (event.kind === 'gift') {
      var coins = (typeof event.coins === 'number' && isFinite(event.coins)) ? event.coins : 0;
      if (coins >= GIFT_THRESHOLDS.medium) return PRIORITY_BASE.giftLarge;
      if (coins >= GIFT_THRESHOLDS.small) return PRIORITY_BASE.giftMedium;
      return PRIORITY_BASE.giftSmall;
    }
    var base = PRIORITY_BASE[event.kind];
    return typeof base === 'number' ? base : 0;
  }

  function computeExpiresAt(event, enqueuedAt) {
    var windowMs = EXPIRATION_MS[event.kind];
    if (typeof windowMs !== 'number' || !isFinite(windowMs)) windowMs = 0;
    var base = (typeof event.timestamp === 'number' && isFinite(event.timestamp)) ? event.timestamp : enqueuedAt;
    return base + windowMs;
  }

  // ---- internal item management ---------------------------------------------------------

  function getSortedItems() {
    return items.slice().sort(function (a, b) {
      if (b.priority !== a.priority) return b.priority - a.priority; // higher priority first
      return a.sequence - b.sequence; // lower sequence (older) first — deterministic FIFO tie-break
    });
  }

  function findLowestPriorityItem() {
    var lowest = null;
    items.forEach(function (item) {
      if (!lowest
        || item.priority < lowest.priority
        || (item.priority === lowest.priority && item.sequence < lowest.sequence)) {
        lowest = item;
      }
    });
    return lowest;
  }

  // Deliberate, decision-based removal by matched sequence — never a blind array-shift.
  function removeItemBySequence(sequence) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].sequence === sequence) {
        items.splice(i, 1);
        return;
      }
    }
  }

  function removeExpired(now) {
    var stillValid = [];
    var removed = [];
    items.forEach(function (item) {
      if (now >= item.expiresAt) removed.push(item); else stillValid.push(item);
    });
    if (!removed.length) return 0;
    items = stillValid;
    removed.forEach(function (item) {
      stats.expired += 1;
      notify('expire', { item: deepClone(item) });
    });
    return removed.length;
  }

  function resolveNow(now) {
    return (typeof now === 'number' && isFinite(now)) ? now : Date.now();
  }

  // ---- validation ---------------------------------------------------------------

  function validateMergedEvent(value) {
    if (!value || typeof value !== 'object') return { ok: false, reason: 'not an object' };
    if (typeof value.id !== 'string' || value.id.trim() === '') return { ok: false, reason: 'missing/invalid id' };
    if (VALID_KINDS.indexOf(value.kind) === -1) return { ok: false, reason: 'unknown kind: ' + safeString(value.kind) };

    var actor = value.actor;
    if (!actor || typeof actor !== 'object') return { ok: false, reason: 'missing actor' };
    if (typeof actor.id !== 'string' || actor.id === '') return { ok: false, reason: 'missing actor.id' };
    if (typeof actor.username !== 'string') return { ok: false, reason: 'actor.username must be a string' };
    if (typeof actor.displayName !== 'string' || actor.displayName === '') return { ok: false, reason: 'missing actor.displayName' };
    if (actor.avatarUrl !== null && typeof actor.avatarUrl !== 'string') return { ok: false, reason: 'actor.avatarUrl must be string or null' };

    if (value.kind === 'gift' && value.gift === null) return { ok: false, reason: 'gift kind requires gift data' };
    if (value.gift !== null) {
      var gift = value.gift;
      if (!gift || typeof gift !== 'object') return { ok: false, reason: 'gift must be an object or null' };
      if (typeof gift.id !== 'string' || gift.id === '') return { ok: false, reason: 'missing gift.id' };
      if (typeof gift.name !== 'string' || gift.name === '') return { ok: false, reason: 'missing gift.name' };
      if (gift.imageUrl !== null && typeof gift.imageUrl !== 'string') return { ok: false, reason: 'gift.imageUrl must be string or null' };
    }

    if (typeof value.count !== 'number' || !isFinite(value.count)) return { ok: false, reason: 'count must be a finite number' };
    if (typeof value.coins !== 'number' || !isFinite(value.coins)) return { ok: false, reason: 'coins must be a finite number' };
    if (typeof value.timestamp !== 'number' || !isFinite(value.timestamp)) return { ok: false, reason: 'timestamp must be a finite number' };
    if (typeof value.mergeKey !== 'string' || value.mergeKey === '') return { ok: false, reason: 'missing mergeKey' };

    if (typeof value.mergedCount !== 'number' || !isFinite(value.mergedCount)) return { ok: false, reason: 'mergedCount must be a finite number' };
    if (typeof value.firstSeen !== 'number' || !isFinite(value.firstSeen)) return { ok: false, reason: 'firstSeen must be a finite number' };
    if (typeof value.lastSeen !== 'number' || !isFinite(value.lastSeen)) return { ok: false, reason: 'lastSeen must be a finite number' };
    if (!Array.isArray(value.sourceEventIds)) return { ok: false, reason: 'sourceEventIds must be an array' };

    return { ok: true };
  }

  // ---- notifications ---------------------------------------------------------

  function notify(type, detail) {
    var payload = Object.assign({ type: type }, detail || {});
    subscribers.slice().forEach(function (fn) {
      try {
        fn(deepClone(payload));
      } catch (err) {
        logDebug('subscriber threw: ' + safeString(err && err.message));
      }
    });
  }

  // ---- helpers ---------------------------------------------------------------

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeString(value) {
    if (value === null || value === undefined) return String(value);
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch (err) { return String(value); }
  }

  function isDevMode() {
    if (typeof window === 'undefined') return true; // Node / verification context
    try {
      return !!(window.location && /(^|[?&])recognitiondebug=1(&|$)/.test(window.location.search || ''));
    } catch (err) {
      return false;
    }
  }

  function logDebug(message) {
    if (!isDevMode()) return;
    try { console.debug('[recognition-queue] ' + message); } catch (err) { /* no-op */ }
  }

  root.VyraRecognitionQueue = Object.freeze({
    enqueue: enqueue,
    dequeueNext: dequeueNext,
    peek: peek,
    size: size,
    clear: clear,
    pause: pause,
    resume: resume,
    isPaused: isPaused,
    getItems: getItems,
    getStats: getStats,
    subscribe: subscribe
  });
})(typeof window !== 'undefined' ? window : globalThis);
