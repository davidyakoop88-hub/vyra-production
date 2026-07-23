// recognition-merge.js — Recognition Engine, Merge Engine (Steg 4).
// Takes NormalizedEvent in, returns/emits MergedEvent out. No DOM, no UI, no queueing, no
// animation — that is Priority Queue / Recognition Controller / Recognition Card's job later.
// Depends on recognition-types.js (RECOGNITION_EVENT_KINDS, the MergedEvent contract) and
// recognition-rules.js (mergeWindowMs, dedupeWindowMs). Silent unless a caller opts into
// dev-mode logging the same way recognition-normalizer.js does (?recognitiondebug=1 in the
// browser, always-on under Node) — no console output in a normal production run.
(function (root) {
  'use strict';

  var Types = root.VyraRecognitionTypes || {};
  var Rules = root.VyraRecognitionRules || {};
  var VALID_KINDS = Types.RECOGNITION_EVENT_KINDS || ['join', 'follow', 'share', 'like', 'gift'];
  var MERGE_WINDOW_MS = Rules.mergeWindowMs || { like: 1500, gift: 1500 };
  var DEDUPE_WINDOW_MS = Rules.dedupeWindowMs || { join: Infinity, follow: 5000, share: 5000 };

  // ---- state ------------------------------------------------------------------
  // Everything below is in-memory only, scoped to this module's closure. clear() resets all
  // of it; nothing here is persisted to localStorage/disk (Steg 4 does not require it — the
  // engine only needs to remember "the current live session", not survive a reload).

  var pendingByMergeKey = new Map();   // mergeKey -> in-progress like/gift aggregate
  var joinSeenActors = new Set();      // actor.id already given a join this session
  var dedupeLastSeenByMergeKey = new Map(); // mergeKey (follow:x / share:x) -> last accepted timestamp
  var seenEventIds = new Set();        // NormalizedEvent.id already processed, any kind
  var subscribers = [];                // fn(MergedEvent) listeners
  var localIdCounter = 0;

  // "pending" is deliberately NOT tracked here as an incremented/decremented counter — it has
  // to shrink on every path that removes an entry from pendingByMergeKey (flushExpired(), the
  // "expired aggregate replaced by a fresh one" branch in handleMergeable(), and any future
  // removal path), and a separate counter drifts the moment one of those paths forgets to
  // decrement it. getStats() instead reads pendingByMergeKey.size directly (see below), which
  // can never be out of sync with the actual map.
  var stats = {
    received: 0,
    merged: 0,
    emitted: 0,
    duplicates: 0,
    rejected: 0
  };

  // ---- public API ---------------------------------------------------------------

  /**
   * @param {import('./recognition-types.js').NormalizedEvent} normalizedEvent
   * @returns {{status:'pending'|'merged'|'emitted'|'duplicate'|'rejected', event?:import('./recognition-types.js').MergedEvent, reason?:string}}
   */
  function push(normalizedEvent) {
    stats.received += 1;
    try {
      return pushInternal(normalizedEvent);
    } catch (err) {
      stats.rejected += 1;
      logDebug('push() threw, treated as rejected: ' + safeString(err && err.message));
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  function pushInternal(normalizedEvent) {
    var validation = validateNormalizedEvent(normalizedEvent);
    if (!validation.ok) {
      stats.rejected += 1;
      logDebug('rejected: ' + validation.reason);
      return { status: 'rejected', reason: validation.reason };
    }

    // Global, kind-agnostic guard: the exact same source event id must never be counted twice,
    // regardless of which kind it belongs to (join/follow/share included, not just gift/like).
    if (seenEventIds.has(normalizedEvent.id)) {
      stats.duplicates += 1;
      logDebug('duplicate source event id: ' + normalizedEvent.id);
      return { status: 'duplicate', reason: 'duplicate source event id: ' + normalizedEvent.id };
    }
    seenEventIds.add(normalizedEvent.id);

    switch (normalizedEvent.kind) {
      case 'join': return handleJoin(normalizedEvent);
      case 'follow': return handleDedupeImmediate(normalizedEvent, 'follow');
      case 'share': return handleDedupeImmediate(normalizedEvent, 'share');
      case 'like': return handleMergeable(normalizedEvent, 'like');
      case 'gift': return handleMergeable(normalizedEvent, 'gift');
      default:
        stats.rejected += 1;
        return { status: 'rejected', reason: 'unknown kind: ' + safeString(normalizedEvent.kind) };
    }
  }

  /**
   * @param {number} [now]
   * @returns {import('./recognition-types.js').MergedEvent[]} aggregates emitted by this call
   */
  function flushExpired(now) {
    var effectiveNow = (typeof now === 'number' && isFinite(now)) ? now : Date.now();
    var emittedList = [];
    pendingByMergeKey.forEach(function (aggregate, mergeKey) {
      var windowMs = MERGE_WINDOW_MS[aggregate.kind];
      if (typeof windowMs !== 'number' || !isFinite(windowMs)) return;
      if (effectiveNow - aggregate.lastSeen >= windowMs) {
        emitAggregate(aggregate);
        emittedList.push(deepClone(aggregate));
        pendingByMergeKey.delete(mergeKey);
      }
    });
    return emittedList;
  }

  // clear(): discards pending aggregates WITHOUT emitting them (explicitly the safest choice
  // per spec — "clear ska kasta bort pending utan emission"), resets every dedupe/session Set,
  // and zeroes every stats counter.
  function clear() {
    pendingByMergeKey.clear();
    joinSeenActors.clear();
    dedupeLastSeenByMergeKey.clear();
    seenEventIds.clear();
    stats.received = 0;
    stats.merged = 0;
    stats.emitted = 0;
    stats.duplicates = 0;
    stats.rejected = 0;
  }

  function getPending() {
    var out = [];
    pendingByMergeKey.forEach(function (aggregate) { out.push(deepClone(aggregate)); });
    return out;
  }

  function getStats() {
    return {
      received: stats.received,
      pending: pendingByMergeKey.size,
      merged: stats.merged,
      emitted: stats.emitted,
      duplicates: stats.duplicates,
      rejected: stats.rejected
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

  // ---- join / follow / share (no merge window — accepted immediately or deduped) -----------

  function handleJoin(event) {
    if (joinSeenActors.has(event.actor.id)) {
      stats.duplicates += 1;
      return { status: 'duplicate', reason: 'join already seen this session for actor ' + event.actor.id };
    }
    joinSeenActors.add(event.actor.id);
    return emitImmediate(event, 'join');
  }

  function handleDedupeImmediate(event, kind) {
    var windowMs = DEDUPE_WINDOW_MS[kind];
    var lastSeenAt = dedupeLastSeenByMergeKey.get(event.mergeKey);
    if (lastSeenAt !== undefined && withinWindow(event.timestamp, lastSeenAt, windowMs)) {
      stats.duplicates += 1;
      return { status: 'duplicate', reason: kind + ' duplicate within dedupe window for ' + event.mergeKey };
    }
    dedupeLastSeenByMergeKey.set(event.mergeKey, event.timestamp);
    return emitImmediate(event, kind);
  }

  function emitImmediate(event, kind) {
    var merged = createSingleEventAggregate(event, kind);
    emitAggregate(merged);
    return { status: 'emitted', event: deepClone(merged) };
  }

  // ---- like / gift (merge window, pending aggregates) ---------------------------------

  function handleMergeable(event, kind) {
    var windowMs = MERGE_WINDOW_MS[kind];
    var pending = pendingByMergeKey.get(event.mergeKey);

    if (!pending) {
      var created = createSingleEventAggregate(event, kind);
      pendingByMergeKey.set(event.mergeKey, created);
      return { status: 'pending', event: deepClone(created) };
    }

    if (withinWindow(event.timestamp, pending.lastSeen, windowMs)) {
      mergeEventIntoAggregate(pending, event);
      stats.merged += 1;
      return { status: 'merged', event: deepClone(pending) };
    }

    // Merge window has elapsed for the existing aggregate: emit it, then start a fresh one for
    // the just-arrived event — "1. föregående aggregat ska emitteras, 2. ett nytt pending
    // aggregat ska skapas", both as part of this single push() call.
    emitAggregate(pending);
    pendingByMergeKey.delete(event.mergeKey);
    var fresh = createSingleEventAggregate(event, kind);
    pendingByMergeKey.set(event.mergeKey, fresh);
    return { status: 'pending', event: deepClone(fresh) };
  }

  function createSingleEventAggregate(event, kind) {
    return {
      id: generateLocalId(),
      kind: kind,
      actor: {
        id: event.actor.id,
        username: event.actor.username,
        displayName: event.actor.displayName,
        avatarUrl: event.actor.avatarUrl
      },
      gift: event.gift ? { id: event.gift.id, name: event.gift.name, imageUrl: event.gift.imageUrl } : null,
      count: event.count,
      coins: event.coins,
      timestamp: event.timestamp,
      mergeKey: event.mergeKey,
      mergedCount: 1,
      firstSeen: event.timestamp,
      lastSeen: event.timestamp,
      sourceEventIds: [event.id]
    };
  }

  function mergeEventIntoAggregate(aggregate, event) {
    aggregate.count += event.count;
    aggregate.coins += event.coins;
    aggregate.lastSeen = Math.max(aggregate.lastSeen, event.timestamp);
    aggregate.timestamp = aggregate.lastSeen;
    aggregate.mergedCount += 1;
    if (aggregate.sourceEventIds.indexOf(event.id) === -1) aggregate.sourceEventIds.push(event.id);
    if (isMoreCompleteText(event.actor.displayName, aggregate.actor.displayName)) {
      aggregate.actor.displayName = event.actor.displayName;
    }
    if (isMoreCompleteText(event.actor.avatarUrl, aggregate.actor.avatarUrl)) {
      aggregate.actor.avatarUrl = event.actor.avatarUrl;
    }
  }

  function emitAggregate(aggregate) {
    stats.emitted += 1;
    notifySubscribers(aggregate);
  }

  function notifySubscribers(mergedEvent) {
    subscribers.slice().forEach(function (fn) {
      try {
        fn(deepClone(mergedEvent));
      } catch (err) {
        logDebug('subscriber threw: ' + safeString(err && err.message));
      }
    });
  }

  // ---- validation ---------------------------------------------------------------

  function validateNormalizedEvent(value) {
    if (!value || typeof value !== 'object') return { ok: false, reason: 'not an object' };
    if (typeof value.id !== 'string' || value.id.trim() === '') return { ok: false, reason: 'missing/invalid id' };
    if (VALID_KINDS.indexOf(value.kind) === -1) return { ok: false, reason: 'unknown kind: ' + safeString(value.kind) };

    var actor = value.actor;
    if (!actor || typeof actor !== 'object') return { ok: false, reason: 'missing actor' };
    if (typeof actor.id !== 'string' || actor.id === '') return { ok: false, reason: 'missing actor.id' };
    if (typeof actor.username !== 'string') return { ok: false, reason: 'actor.username must be a string' };
    if (typeof actor.displayName !== 'string' || actor.displayName === '') return { ok: false, reason: 'missing actor.displayName' };
    if (actor.avatarUrl !== null && typeof actor.avatarUrl !== 'string') return { ok: false, reason: 'actor.avatarUrl must be string or null' };

    if (value.kind === 'gift' && value.gift === null) return { ok: false, reason: 'gift kind requires a non-null gift' };
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

    return { ok: true };
  }

  // ---- helpers ---------------------------------------------------------------

  // true when the two timestamps are close enough to count as "the same burst" for the given
  // window. Infinity (join's dedupeWindowMs) always resolves true here, which is why join
  // itself never routes through this helper — its own session Set is the real guard.
  function withinWindow(a, b, windowMs) {
    if (typeof windowMs !== 'number') return false;
    if (windowMs === Infinity) return true;
    return Math.abs(a - b) < windowMs;
  }

  function isMoreCompleteText(nextValue, currentValue) {
    var nextOk = typeof nextValue === 'string' && nextValue.trim() !== '';
    if (!nextOk) return false;
    var currentOk = typeof currentValue === 'string' && currentValue.trim() !== '';
    if (!currentOk) return true;
    return nextValue.length > currentValue.length;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function generateLocalId() {
    localIdCounter += 1;
    return 'mrg_' + Date.now().toString(36) + '_' + localIdCounter.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
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
    try { console.debug('[recognition-merge] ' + message); } catch (err) { /* no-op */ }
  }

  root.VyraRecognitionMerge = Object.freeze({
    push: push,
    flushExpired: flushExpired,
    clear: clear,
    getPending: getPending,
    getStats: getStats,
    subscribe: subscribe
  });
})(typeof window !== 'undefined' ? window : globalThis);
