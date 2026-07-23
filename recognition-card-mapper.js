// recognition-card-mapper.js — Recognition Engine, Recognition Card Mapper (Steg 7).
// Takes a CurrentPresentation (from recognition-controller.js) or a plain MergedEvent and
// produces a deterministic, plain-text CardModel for recognition-card.js to render later.
// No DOM, no CSS, no UI, no animation, no timers, and no mutation of Queue/Controller state —
// this file only ever reads the input it's given and returns a brand-new object.
// Depends on window.VyraRecognitionTypes (RECOGNITION_EVENT_KINDS, DEFAULT_DISPLAY_NAME) and
// window.VyraRecognitionRules (priority.giftThresholds, likeVariantThresholds) — gift-tier
// boundaries are read from the exact same Rules object recognition-queue.js and
// recognition-controller.js already read, never a second, potentially-divergent copy.
// Silent unless a caller opts into dev-mode logging the same way every other Recognition
// Engine file does (?recognitiondebug=1 in the browser, always-on under Node).
(function (root) {
  'use strict';

  var Types = root.VyraRecognitionTypes || {};
  var Rules = root.VyraRecognitionRules || {};
  var VALID_KINDS = Types.RECOGNITION_EVENT_KINDS || ['join', 'follow', 'share', 'like', 'gift'];
  var DEFAULT_DISPLAY_NAME = Types.DEFAULT_DISPLAY_NAME || 'Guest';
  var GIFT_THRESHOLDS = (Rules.priority && Rules.priority.giftThresholds) || { small: 100, medium: 1000 };
  var LIKE_THRESHOLDS = Rules.likeVariantThresholds || { wave: 100, storm: 1000 };
  var MULTIPLY_SIGN = '×'; // ×

  var idCounter = 0;

  var stats = {
    mapped: 0,
    rejected: 0,
    join: 0,
    like: 0,
    share: 0,
    follow: 0,
    gift: 0,
    smallGift: 0,
    mediumGift: 0,
    largeGift: 0
  };

  // ---- public API ---------------------------------------------------------------

  /**
   * Accepts either a CurrentPresentation ({id, event, startedAt, durationMs, endsAt, status})
   * or a plain MergedEvent directly, auto-detecting which one it was given.
   * @param {*} input
   * @returns {{status:'mapped', model:import('./recognition-types.js').CardModel}|{status:'rejected', reason:string}}
   */
  function map(input) {
    try {
      if (isPresentationShape(input)) {
        return buildResult(input.event, { presentationId: input.id, durationMs: input.durationMs });
      }
      return buildResult(input, { presentationId: null, durationMs: null });
    } catch (err) {
      stats.rejected += 1;
      logDebug('map() threw, treated as rejected: ' + safeString(err && err.message));
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  /**
   * Explicit "I definitely have a MergedEvent" entry point — never treats its argument as a
   * CurrentPresentation, even if it happens to have similarly-named fields.
   * @param {*} event
   */
  function mapEvent(event) {
    try {
      return buildResult(event, { presentationId: null, durationMs: null });
    } catch (err) {
      stats.rejected += 1;
      logDebug('mapEvent() threw, treated as rejected: ' + safeString(err && err.message));
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  /**
   * @param {*} model
   * @returns {{valid: boolean, errors: string[]}}
   */
  function validateCardModel(model) {
    var errors = [];
    try {
      if (!model || typeof model !== 'object') {
        return { valid: false, errors: ['not an object'] };
      }
      if (typeof model.id !== 'string' || model.id.trim() === '') errors.push('missing id');
      if (VALID_KINDS.indexOf(model.kind) === -1) errors.push('invalid kind');
      if (typeof model.variant !== 'string' || model.variant.trim() === '') errors.push('missing variant');

      var actor = model.actor;
      if (!actor || typeof actor !== 'object') {
        errors.push('missing actor');
      } else {
        if (typeof actor.id !== 'string' || actor.id === '') errors.push('missing actor.id');
        if (typeof actor.username !== 'string') errors.push('actor.username must be a string');
        if (typeof actor.displayName !== 'string' || actor.displayName === '') errors.push('missing actor.displayName');
        if (actor.avatarUrl !== null && typeof actor.avatarUrl !== 'string') errors.push('actor.avatarUrl must be string or null');
        if (typeof actor.initials !== 'string' || actor.initials === '') errors.push('missing actor.initials');
      }

      if (model.gift !== null) {
        var gift = model.gift;
        if (!gift || typeof gift !== 'object') {
          errors.push('gift must be an object or null');
        } else {
          if (typeof gift.id !== 'string' || gift.id === '') errors.push('missing gift.id');
          if (typeof gift.name !== 'string' || gift.name === '') errors.push('missing gift.name');
          if (gift.imageUrl !== null && typeof gift.imageUrl !== 'string') errors.push('gift.imageUrl must be string or null');
          if (['small', 'medium', 'large'].indexOf(gift.tier) === -1) errors.push('invalid gift.tier');
        }
      }
      if (model.kind === 'gift' && model.gift === null) errors.push('gift kind requires non-null gift');
      if (model.kind !== 'gift' && model.gift !== null) errors.push('non-gift kind must have gift: null');

      var content = model.content;
      if (!content || typeof content !== 'object') {
        errors.push('missing content');
      } else {
        if (typeof content.eyebrow !== 'string') errors.push('content.eyebrow must be a string');
        if (typeof content.title !== 'string' || content.title === '') errors.push('missing content.title');
        if (typeof content.subtitle !== 'string') errors.push('content.subtitle must be a string');
        if (content.countLabel !== null && typeof content.countLabel !== 'string') errors.push('content.countLabel must be string or null');
        if (content.coinLabel !== null && typeof content.coinLabel !== 'string') errors.push('content.coinLabel must be string or null');
      }

      var accessibility = model.accessibility;
      if (!accessibility || typeof accessibility !== 'object' || typeof accessibility.ariaLabel !== 'string' || accessibility.ariaLabel === '') {
        errors.push('missing accessibility.ariaLabel');
      }

      var metadata = model.metadata;
      if (!metadata || typeof metadata !== 'object') {
        errors.push('missing metadata');
      } else {
        if (typeof metadata.sourceEventId !== 'string' || metadata.sourceEventId === '') errors.push('missing metadata.sourceEventId');
        if (metadata.presentationId !== null && typeof metadata.presentationId !== 'string') errors.push('metadata.presentationId must be string or null');
        if (typeof metadata.timestamp !== 'number' || !isFinite(metadata.timestamp)) errors.push('invalid metadata.timestamp');
        if (metadata.durationMs !== null && (typeof metadata.durationMs !== 'number' || !isFinite(metadata.durationMs))) errors.push('metadata.durationMs must be a finite number or null');
        if (typeof metadata.count !== 'number' || !isFinite(metadata.count)) errors.push('invalid metadata.count');
        if (typeof metadata.coins !== 'number' || !isFinite(metadata.coins)) errors.push('invalid metadata.coins');
        if (typeof metadata.mergedCount !== 'number' || !isFinite(metadata.mergedCount)) errors.push('invalid metadata.mergedCount');
      }

      return { valid: errors.length === 0, errors: errors };
    } catch (err) {
      return { valid: false, errors: ['unexpected error: ' + safeString(err && err.message)] };
    }
  }

  /**
   * @param {*} event
   * @returns {?string}
   */
  function getVariant(event) {
    try {
      if (!event || typeof event !== 'object') return null;
      var kind = event.kind;
      if (kind === 'join') return 'join-soft';
      if (kind === 'share') return 'share-signal';
      if (kind === 'follow') return 'follow-spotlight';
      if (kind === 'like') {
        var count = (typeof event.count === 'number' && isFinite(event.count)) ? event.count : 0;
        if (count >= LIKE_THRESHOLDS.storm) return 'like-storm';
        if (count >= LIKE_THRESHOLDS.wave) return 'like-wave';
        return 'like-pulse';
      }
      if (kind === 'gift') {
        var tier = getGiftTier(event);
        if (tier === 'large') return 'gift-legendary';
        if (tier === 'medium') return 'gift-crown';
        return 'gift-crystal';
      }
      return null;
    } catch (err) {
      logDebug('getVariant() threw: ' + safeString(err && err.message));
      return null;
    }
  }

  /**
   * @param {*} event
   * @returns {?('small'|'medium'|'large')}
   */
  function getGiftTier(event) {
    try {
      if (!event || typeof event !== 'object' || event.kind !== 'gift') return null;
      return giftTierFromCoins(event.coins);
    } catch (err) {
      logDebug('getGiftTier() threw: ' + safeString(err && err.message));
      return null;
    }
  }

  function getStats() {
    return {
      mapped: stats.mapped,
      rejected: stats.rejected,
      join: stats.join,
      like: stats.like,
      share: stats.share,
      follow: stats.follow,
      gift: stats.gift,
      smallGift: stats.smallGift,
      mediumGift: stats.mediumGift,
      largeGift: stats.largeGift
    };
  }

  function clearStats() {
    stats.mapped = 0;
    stats.rejected = 0;
    stats.join = 0;
    stats.like = 0;
    stats.share = 0;
    stats.follow = 0;
    stats.gift = 0;
    stats.smallGift = 0;
    stats.mediumGift = 0;
    stats.largeGift = 0;
  }

  // ---- internal: shape detection + core build ---------------------------------------------

  function isPresentationShape(value) {
    return !!value && typeof value === 'object'
      && value.event && typeof value.event === 'object'
      && typeof value.startedAt === 'number'
      && typeof value.endsAt === 'number'
      && typeof value.status === 'string';
  }

  function buildResult(rawEvent, extra) {
    var validation = validateForMapping(rawEvent);
    if (!validation.ok) {
      stats.rejected += 1;
      logDebug('rejected: ' + validation.reason);
      return { status: 'rejected', reason: validation.reason };
    }

    var kind = rawEvent.kind;
    var rawDisplayName = rawEvent.actor.displayName;
    var rawUsername = rawEvent.actor.username;
    var displayName = firstNonEmptyString([rawDisplayName, rawUsername]) || DEFAULT_DISPLAY_NAME;
    var username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
    var avatarUrl = firstNonEmptyString([rawEvent.actor.avatarUrl]) || null;
    var initials = computeInitials(rawDisplayName, rawUsername);

    var giftModel = null;
    if (kind === 'gift') {
      giftModel = {
        id: rawEvent.gift.id,
        name: rawEvent.gift.name.trim(),
        imageUrl: firstNonEmptyString([rawEvent.gift.imageUrl]) || null,
        tier: giftTierFromCoins(rawEvent.coins)
      };
    }

    var variant = getVariant(rawEvent);
    var content = buildContent(kind, displayName, rawEvent.count, rawEvent.coins, giftModel);
    var ariaLabel = buildAriaLabel(kind, displayName, rawEvent.count, rawEvent.coins, giftModel);
    var mergedCount = (typeof rawEvent.mergedCount === 'number' && isFinite(rawEvent.mergedCount)) ? rawEvent.mergedCount : 1;

    var model = {
      id: generateLocalId(),
      kind: kind,
      variant: variant,
      actor: {
        id: rawEvent.actor.id,
        username: username,
        displayName: displayName,
        avatarUrl: avatarUrl,
        initials: initials
      },
      gift: giftModel,
      content: content,
      accessibility: { ariaLabel: ariaLabel },
      metadata: {
        sourceEventId: rawEvent.id,
        presentationId: extra.presentationId,
        timestamp: rawEvent.timestamp,
        durationMs: extra.durationMs,
        count: rawEvent.count,
        coins: rawEvent.coins,
        mergedCount: mergedCount
      }
    };

    stats.mapped += 1;
    incrementKindStats(kind, giftModel && giftModel.tier);

    return { status: 'mapped', model: deepClone(model) };
  }

  function incrementKindStats(kind, giftTier) {
    if (kind === 'join') stats.join += 1;
    else if (kind === 'like') stats.like += 1;
    else if (kind === 'share') stats.share += 1;
    else if (kind === 'follow') stats.follow += 1;
    else if (kind === 'gift') {
      stats.gift += 1;
      if (giftTier === 'small') stats.smallGift += 1;
      else if (giftTier === 'medium') stats.mediumGift += 1;
      else if (giftTier === 'large') stats.largeGift += 1;
    }
  }

  // ---- internal: validation ---------------------------------------------------

  function validateForMapping(value) {
    if (!value || typeof value !== 'object') return { ok: false, reason: 'not an object' };
    if (typeof value.id !== 'string' || value.id.trim() === '') return { ok: false, reason: 'missing event.id' };
    if (VALID_KINDS.indexOf(value.kind) === -1) return { ok: false, reason: 'unknown kind: ' + safeString(value.kind) };

    var actor = value.actor;
    if (!actor || typeof actor !== 'object') return { ok: false, reason: 'missing actor' };
    if (typeof actor.id !== 'string' || actor.id.trim() === '') return { ok: false, reason: 'missing actor.id' };
    // displayName/username absence is intentionally NOT a rejection reason — resolved to
    // DEFAULT_DISPLAY_NAME ("Guest") later instead, per spec.

    if (typeof value.timestamp !== 'number' || !isFinite(value.timestamp)) return { ok: false, reason: 'invalid timestamp' };

    if (typeof value.count !== 'number' || !isFinite(value.count)) return { ok: false, reason: 'count must be a finite number' };
    if (value.count < 0) return { ok: false, reason: 'count must not be negative' };

    if (typeof value.coins !== 'number' || !isFinite(value.coins)) return { ok: false, reason: 'coins must be a finite number' };
    if (value.coins < 0) return { ok: false, reason: 'coins must not be negative' };

    if (value.kind === 'gift') {
      var gift = value.gift;
      if (!gift || typeof gift !== 'object') return { ok: false, reason: 'gift kind requires gift data' };
      if (typeof gift.id !== 'string' || gift.id.trim() === '') return { ok: false, reason: 'missing gift.id' };
      // "gift.name saknas pa gift-event -> event ska rejected, inte fa falskt namn"
      if (typeof gift.name !== 'string' || gift.name.trim() === '') return { ok: false, reason: 'missing gift.name' };
      if (gift.imageUrl !== undefined && gift.imageUrl !== null && typeof gift.imageUrl !== 'string') return { ok: false, reason: 'gift.imageUrl must be string or null' };
    }

    return { ok: true };
  }

  // ---- internal: text/content construction ---------------------------------------------

  function buildContent(kind, displayName, count, coins, giftModel) {
    if (kind === 'join') {
      return { eyebrow: 'WELCOME', title: displayName, subtitle: 'joined the live', countLabel: null, coinLabel: null };
    }
    if (kind === 'like') {
      var likeSubtitle = count === 1 ? 'sent a like' : 'sent likes';
      var likeCountLabel = count > 1 ? (MULTIPLY_SIGN + formatCount(count)) : null;
      return { eyebrow: 'LOVE', title: displayName, subtitle: likeSubtitle, countLabel: likeCountLabel, coinLabel: null };
    }
    if (kind === 'share') {
      var shareCountLabel = count > 1 ? (MULTIPLY_SIGN + formatCount(count)) : null;
      return { eyebrow: 'SHARE', title: displayName, subtitle: 'shared the live', countLabel: shareCountLabel, coinLabel: null };
    }
    if (kind === 'follow') {
      return { eyebrow: 'NEW FOLLOWER', title: displayName, subtitle: 'started following', countLabel: null, coinLabel: null };
    }
    // kind === 'gift' (the only remaining valid kind — unknown kinds are already rejected)
    var eyebrow = giftModel.tier === 'large' ? 'LEGENDARY GIFT' : giftModel.tier === 'medium' ? 'BIG GIFT' : 'GIFT';
    var giftCountLabel = count > 1 ? (MULTIPLY_SIGN + formatCount(count)) : null;
    var coinLabel = coins > 0 ? (formatCount(coins) + ' coins') : null;
    return { eyebrow: eyebrow, title: displayName, subtitle: giftModel.name, countLabel: giftCountLabel, coinLabel: coinLabel };
  }

  function buildAriaLabel(kind, displayName, count, coins, giftModel) {
    if (kind === 'join') return displayName + ' joined the live';
    if (kind === 'like') {
      var likeWord = count === 1 ? 'like' : 'likes';
      return displayName + ' sent ' + formatFullNumber(count) + ' ' + likeWord;
    }
    if (kind === 'share') return displayName + ' shared the live';
    if (kind === 'follow') return displayName + ' started following';
    // kind === 'gift'
    var giftUnitWord = count === 1 ? 'gift' : 'gifts';
    var label = displayName + ' sent ' + formatFullNumber(count) + ' ' + giftModel.name + ' ' + giftUnitWord;
    if (coins > 0) label += ' worth ' + formatFullNumber(coins) + ' coins';
    return label;
  }

  // ---- internal: initials ---------------------------------------------------

  function computeInitials(rawDisplayName, rawUsername) {
    var source = firstNonEmptyString([rawDisplayName, rawUsername]);
    if (!source) return '?';
    var words = source.trim().split(/\s+/).filter(function (w) { return w.length > 0; });
    if (!words.length) return '?';
    if (words.length === 1) {
      var single = words[0].charAt(0).toUpperCase();
      return single || '?';
    }
    var combined = (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
    return combined || '?';
  }

  // ---- internal: gift tier ---------------------------------------------------

  function giftTierFromCoins(coins) {
    var c = (typeof coins === 'number' && isFinite(coins)) ? coins : 0;
    if (c >= GIFT_THRESHOLDS.medium) return 'large';
    if (c >= GIFT_THRESHOLDS.small) return 'medium';
    return 'small';
  }

  // ---- internal: number formatting ---------------------------------------------------

  // Deterministic, locale-independent K/M abbreviation for countLabel/coinLabel. Truncates
  // (not rounds) to one decimal so a value like 999999 reads "999.9K", never rolling over into
  // "1000K"/"1M" early, and drops a trailing ".0" ("1000" -> "1K", not "1.0K").
  function formatCount(value) {
    var n = (typeof value === 'number' && isFinite(value)) ? value : 0;
    var sign = n < 0 ? '-' : '';
    var abs = Math.abs(n);
    if (abs < 1000) return sign + String(Math.round(abs));
    if (abs < 1000000) return sign + formatWithSuffix(abs / 1000, 'K');
    return sign + formatWithSuffix(abs / 1000000, 'M');
  }

  function formatWithSuffix(value, suffix) {
    var truncated = Math.floor(value * 10) / 10;
    return trimTrailingZero(truncated) + suffix;
  }

  function trimTrailingZero(value) {
    var text = value.toFixed(1);
    if (text.slice(-2) === '.0') text = text.slice(0, -2);
    return text;
  }

  // Full, unabbreviated, comma-grouped number for accessibility.ariaLabel — deliberately a
  // different formatter than formatCount() above, and just as locale-independent (no
  // toLocaleString()/Intl dependency).
  function formatFullNumber(value) {
    var n = (typeof value === 'number' && isFinite(value)) ? value : 0;
    var rounded = Math.round(n);
    var negative = rounded < 0;
    var digits = String(Math.abs(rounded));
    var withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (negative ? '-' : '') + withCommas;
  }

  // ---- helpers ---------------------------------------------------------------

  function firstNonEmptyString(candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var value = candidates[i];
      if (typeof value === 'string' && value.trim() !== '') return value.trim();
    }
    return null;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function generateLocalId() {
    idCounter += 1;
    return 'card_' + Date.now().toString(36) + '_' + idCounter.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
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
    try { console.debug('[recognition-card-mapper] ' + message); } catch (err) { /* no-op */ }
  }

  root.VyraRecognitionCardMapper = Object.freeze({
    map: map,
    mapEvent: mapEvent,
    validateCardModel: validateCardModel,
    getVariant: getVariant,
    getGiftTier: getGiftTier,
    getStats: getStats,
    clearStats: clearStats
  });
})(typeof window !== 'undefined' ? window : globalThis);
