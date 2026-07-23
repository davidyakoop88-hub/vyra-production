// recognition-normalizer.js — Recognition Engine, Event Normalizer (Steg 3).
// Pure function: RecognitionRawEvent -> NormalizedEvent | null. TikTok-agnostic once past
// this file — every later pipeline stage (Filter, Merge, Queue, Controller, Card) only ever
// sees the NormalizedEvent shape from recognition-types.js, never a raw field like giftName
// or profileImage directly. No queueing, merging, filtering, UI, or animation happens here.
(function (root) {
  'use strict';

  var Types = root.VyraRecognitionTypes || {};
  var DEFAULT_DISPLAY_NAME = Types.DEFAULT_DISPLAY_NAME || 'Guest';
  var DEFAULT_COUNT = typeof Types.DEFAULT_COUNT === 'number' ? Types.DEFAULT_COUNT : 1;
  var DEFAULT_COINS = typeof Types.DEFAULT_COINS === 'number' ? Types.DEFAULT_COINS : 0;

  // Raw event.type variants recognized in this version, mapped to the canonical kind.
  var TYPE_ALIASES = {
    join: ['join', 'joined', 'member', 'enter', 'viewer_join'],
    follow: ['follow', 'followed', 'follower'],
    share: ['share', 'shared'],
    like: ['like', 'likes', 'like_burst'],
    gift: ['gift', 'gifts', 'present']
  };

  var TYPE_LOOKUP = buildTypeLookup(TYPE_ALIASES);

  var localIdCounter = 0;

  /**
   * @param {import('./recognition-types.js').RecognitionRawEvent} rawEvent
   * @returns {?import('./recognition-types.js').NormalizedEvent}
   */
  function normalize(rawEvent) {
    try {
      return normalizeInternal(rawEvent);
    } catch (err) {
      logRejected('unexpected error: ' + safeString(err && err.message));
      return null;
    }
  }

  function normalizeInternal(rawEvent) {
    if (!rawEvent || typeof rawEvent !== 'object') {
      logRejected('rawEvent is not an object (' + safeString(rawEvent) + ')');
      return null;
    }

    var kind = mapKind(rawEvent.type);
    if (!kind) {
      logRejected('unknown or missing type: ' + safeString(rawEvent.type));
      return null;
    }

    var actorId = firstPresentIdentifier([rawEvent.userId, rawEvent.username]) || fallbackActorId(rawEvent);
    var username = typeof rawEvent.username === 'string' ? rawEvent.username : '';
    var displayName = firstNonEmptyString([rawEvent.name, rawEvent.username]) || DEFAULT_DISPLAY_NAME;
    var avatarUrl = firstNonEmptyString([rawEvent.avatarUrl, rawEvent.profileImage]);

    var gift = null;
    if (kind === 'gift') {
      var giftName = firstNonEmptyString([rawEvent.giftName]) || 'Unknown Gift';
      var giftId = firstPresentIdentifier([rawEvent.giftId]) || stableIdFromString('gift-name:' + giftName);
      var giftImageUrl = firstNonEmptyString([rawEvent.giftImage]);
      gift = { id: giftId, name: giftName, imageUrl: giftImageUrl || null };
    }

    var count = toPositiveInt(rawEvent.count, DEFAULT_COUNT);
    var coins = toNonNegativeNumber(rawEvent.coins, DEFAULT_COINS);
    var timestamp = toValidTimestamp(rawEvent.timestamp);
    var id = firstPresentIdentifier([rawEvent.id]) || generateLocalId();

    var mergeKey = kind === 'gift'
      ? ('gift:' + actorId + ':' + gift.id)
      : (kind + ':' + actorId);

    return {
      id: id,
      kind: kind,
      actor: {
        id: actorId,
        username: username,
        displayName: displayName,
        avatarUrl: avatarUrl || null
      },
      gift: gift,
      count: count,
      coins: coins,
      timestamp: timestamp,
      mergeKey: mergeKey
    };
  }

  // ---- type mapping ---------------------------------------------------------

  function buildTypeLookup(aliasTable) {
    var lookup = {};
    Object.keys(aliasTable).forEach(function (kind) {
      aliasTable[kind].forEach(function (alias) {
        lookup[alias] = kind;
      });
    });
    return lookup;
  }

  function mapKind(rawType) {
    if (typeof rawType !== 'string') return null;
    var key = rawType.trim().toLowerCase();
    if (!key) return null;
    return Object.prototype.hasOwnProperty.call(TYPE_LOOKUP, key) ? TYPE_LOOKUP[key] : null;
  }

  // ---- field helpers ---------------------------------------------------------

  // For purely textual fields (name, username-as-text, avatarUrl, profileImage, giftName,
  // giftImage) — the real event source always sends these as strings.
  function firstNonEmptyString(candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var value = candidates[i];
      if (typeof value === 'string' && value.trim() !== '') return value;
    }
    return null;
  }

  // For identifier-like fields (id, userId, giftId) — server.ps1/local-server.js emit some of
  // these (e.g. the top-level event id, built from DateTimeOffset.ToUnixTimeMilliseconds()) as
  // numbers, not strings, so a plain string-only check would silently discard a real id and
  // regenerate one needlessly. Accepts a finite number too, coerced to its string form.
  function firstPresentIdentifier(candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var value = candidates[i];
      if (typeof value === 'string' && value.trim() !== '') return value;
      if (typeof value === 'number' && isFinite(value)) return String(value);
    }
    return null;
  }

  function coerceNumber(value) {
    if (typeof value === 'number') return isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
      var parsed = Number(value);
      return isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function toPositiveInt(value, fallback) {
    var n = coerceNumber(value);
    if (n === null) return fallback;
    n = Math.trunc(n);
    return n < 1 ? 1 : n;
  }

  function toNonNegativeNumber(value, fallback) {
    var n = coerceNumber(value);
    if (n === null) return fallback;
    return n < 0 ? 0 : n;
  }

  function toValidTimestamp(value) {
    var n = coerceNumber(value);
    return n !== null ? n : Date.now();
  }

  // Deterministic given the same raw event's own fields — not globally unique, but stable
  // for repeated normalization of the same (or an equivalent) raw event.
  function fallbackActorId(rawEvent) {
    var seed = 'actor:' + safeString(rawEvent.name) + ':' + safeString(rawEvent.type) + ':' + safeString(rawEvent.timestamp);
    return stableIdFromString(seed);
  }

  function stableIdFromString(str) {
    var hash = 5381;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0; // djb2
    }
    return 'stable' + Math.abs(hash).toString(36);
  }

  function generateLocalId() {
    localIdCounter += 1;
    return 'rec_' + Date.now().toString(36) + '_' + localIdCounter.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
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

  function logRejected(reason) {
    if (!isDevMode()) return;
    try { console.debug('[recognition-normalizer] rejected: ' + reason); } catch (err) { /* no-op */ }
  }

  root.VyraRecognitionNormalizer = Object.freeze({ normalize: normalize });
})(typeof window !== 'undefined' ? window : globalThis);
