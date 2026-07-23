// premium-gift-widget.js — Premium Gift Widget (Roadmap Phase 5).
// See docs/PREMIUM_GIFT_WIDGET_SPEC.md for the full spec, including the documented decision
// NOT to route gift events through window.VyraRecognitionRuntime.push() (see "Integration
// decision" there). This file never renders DOM itself — it decides which gift presentation
// should be active/queued and drives window.VyraPremiumWidget (Phase 4) to render it.
//
// No dependency on any recognition-*.js file. Priority ordinals and the family/tier mapping
// are owned locally (mirroring recognition-rules.js's ordinal-scale convention, not importing
// it — see the spec's reasoning). Every timer is generation-guarded exactly like
// premium-widget-core.js's own scheduleTimer/clearInstanceTimers pattern, scoped per active
// presentation. No setInterval, no requestAnimationFrame loop.
(function (root) {
  'use strict';

  var GIFT_TIERS = ['small', 'medium', 'large', 'legendary'];
  var SIZE_TIERS = ['small', 'medium', 'legendary']; // window.VyraPremiumWidget's own tier scale
  var FAMILIES = ['crystal-halo', 'royal-crown', 'legendary-portal', 'elite-minimal'];

  var PRIORITY = { small: 10, medium: 20, large: 30, legendary: 40 };

  var DEFAULT_FAMILY = {
    small: 'elite-minimal',
    medium: 'crystal-halo',
    large: 'royal-crown',
    legendary: 'legendary-portal'
  };

  var DEFAULT_SIZE_TIER = {
    small: 'small',
    medium: 'medium',
    large: 'legendary',
    legendary: 'legendary'
  };

  var QUEUE_MAX_LENGTH = 20;
  var DEFAULT_DURATION_MS = { small: 3200, medium: 4200, large: 5200, legendary: 6500 };

  // ---- module state ------------------------------------------------------------------

  var mounted = false;
  // Transient teardown flag only — true for the duration of destroy() itself so re-entrant
  // calls made from within a subscriber's synchronous notification handler are rejected, then
  // reset to false before destroy() returns. NOT a permanent "destroyed forever" flag —
  // mount()/show() work again immediately after destroy() returns, same documented deviation
  // from recognition-runtime.js's one-way destroy as premium-widget-core.js already has (see
  // docs/PREMIUM_GIFT_WIDGET_SPEC.md "Lifecycle").
  var destroyed = false;
  var subscribers = [];
  var active = null; // { id, model, generation, timers: Set }
  var queue = []; // array of { model, priority, sequence, enqueuedAt }
  var sequenceCounter = 0;
  var idCounter = 0;

  var stats = {
    received: 0,
    shown: 0,
    streakUpdated: 0,
    preempted: 0,
    queued: 0,
    dropped: 0,
    completed: 0,
    skipped: 0,
    cleared: 0,
    errors: 0
  };

  // ---- public API -----------------------------------------------------------------

  function mount(target) {
    try {
      if (destroyed) return { status: 'rejected', reason: 'destroyed' };
      mounted = true;
      notify('mount', {});
      return { status: 'mounted' };
    } catch (err) {
      stats.errors += 1;
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  /**
   * @param {Object} model — see docs/PREMIUM_GIFT_WIDGET_SPEC.md "Model".
   * @returns {{status:'shown'|'preempted-active'|'streak-updated'|'queued'|'dropped'|'rejected', id?:string, reason?:string}}
   */
  function show(model) {
    try {
      stats.received += 1;
      return showInternal(model);
    } catch (err) {
      stats.errors += 1;
      notify('error', { reason: 'show() threw: ' + safeString(err && err.message) });
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  function showInternal(model) {
    if (destroyed) return { status: 'rejected', reason: 'destroyed' };
    if (!mounted) return { status: 'rejected', reason: 'not mounted' };
    var Widget = root.VyraPremiumWidget;
    if (!Widget || typeof Widget.show !== 'function') {
      return { status: 'rejected', reason: 'window.VyraPremiumWidget is not available — mount it first' };
    }

    var validation = validateModel(model);
    if (!validation.ok) return { status: 'rejected', reason: validation.reason };
    var normalized = validation.model;
    var priority = PRIORITY[normalized.presentation.tier];

    // streak update: same non-null streakId as the currently active presentation
    if (active && normalized.gift.streakId && active.model.gift.streakId === normalized.gift.streakId) {
      return applyStreakUpdate(normalized);
    }

    if (!active) {
      activatePresentation(normalized);
      stats.shown += 1;
      notify('show', { id: normalized.id, tier: normalized.presentation.tier });
      return { status: 'shown', id: normalized.id };
    }

    var activePriority = PRIORITY[active.model.presentation.tier];
    if (priority > activePriority) {
      var preemptedId = active.id;
      finishActive('skipped', 'preempted');
      stats.preempted += 1;
      activatePresentation(normalized);
      stats.shown += 1;
      notify('preempt', { id: normalized.id, preemptedId: preemptedId, tier: normalized.presentation.tier });
      return { status: 'preempted-active', id: normalized.id };
    }

    var enqueueResult = enqueue(normalized, priority);
    if (enqueueResult.status === 'queued') {
      stats.queued += 1;
      notify('enqueue', { id: normalized.id, tier: normalized.presentation.tier });
      return { status: 'queued', id: normalized.id };
    }
    stats.dropped += 1;
    notify('drop', { id: normalized.id, reason: enqueueResult.reason });
    return { status: 'dropped', id: normalized.id, reason: enqueueResult.reason };
  }

  function applyStreakUpdate(normalized) {
    var Widget = root.VyraPremiumWidget;
    var merged = deepMerge(active.model, normalized);
    merged.id = active.id; // keep the same underlying Premium Widget instance id
    active.model = merged;
    var result = Widget.update(active.id, {
      user: merged.user,
      gift: { imageUrl: merged.gift.imageUrl, amount: merged.gift.repeatCount > 1 ? merged.gift.repeatCount : merged.gift.amount, coins: merged.gift.coins },
      text: { title: merged.presentation.title, subtitle: merged.presentation.subtitle, showDisplayName: merged.presentation.showDisplayName }
    });
    stats.streakUpdated += 1;
    notify('streak-update', { id: active.id, repeatCount: merged.gift.repeatCount });
    if (!result || result.status !== 'updated') {
      stats.errors += 1;
      notify('error', { reason: 'underlying update() rejected during streak update: ' + safeString(result && result.reason) });
    }
    return { status: 'streak-updated', id: active.id };
  }

  /**
   * @param {string} id
   * @param {string} [reason]
   */
  function hide(id, reason) {
    try {
      return hideInternal(id, reason);
    } catch (err) {
      stats.errors += 1;
      notify('error', { reason: 'hide() threw: ' + safeString(err && err.message) });
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  function hideInternal(id, reason) {
    if (destroyed) return { status: 'rejected', reason: 'destroyed' };
    if (active && active.id === id) {
      finishActive('skipped', reason || 'manual');
      stats.skipped += 1;
      advanceQueue();
      return { status: 'hidden' };
    }
    var idx = findQueueIndex(id);
    if (idx !== -1) {
      queue.splice(idx, 1);
      notify('dequeue-remove', { id: id, reason: reason || 'manual' });
      return { status: 'hidden' };
    }
    return { status: 'hidden' }; // nothing to do — safe no-op, matches Phase 4 convention
  }

  function update(id, partialModel) {
    try {
      if (destroyed) return { status: 'rejected', reason: 'destroyed' };
      if (!active || active.id !== id) return { status: 'rejected', reason: 'no such active presentation' };
      var merged = deepMerge(active.model, partialModel || {});
      var validation = validateModel(merged);
      if (!validation.ok) return { status: 'rejected', reason: validation.reason };
      active.model = validation.model;
      var Widget = root.VyraPremiumWidget;
      var result = Widget.update(id, {
        user: active.model.user,
        gift: { imageUrl: active.model.gift.imageUrl, amount: active.model.gift.amount, coins: active.model.gift.coins },
        text: { title: active.model.presentation.title, subtitle: active.model.presentation.subtitle, showDisplayName: active.model.presentation.showDisplayName }
      });
      notify('update', { id: id });
      return { status: (result && result.status === 'updated') ? 'updated' : 'rejected', reason: result && result.reason };
    } catch (err) {
      stats.errors += 1;
      notify('error', { reason: 'update() threw: ' + safeString(err && err.message) });
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  /**
   * @param {string} id
   */
  function complete(id) {
    try {
      if (destroyed) return { status: 'rejected', reason: 'destroyed' };
      if (!active || active.id !== id) return { status: 'rejected', reason: 'no such active presentation' };
      finishActive('completed', 'complete');
      stats.completed += 1;
      advanceQueue();
      return { status: 'completed' };
    } catch (err) {
      stats.errors += 1;
      notify('error', { reason: 'complete() threw: ' + safeString(err && err.message) });
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  /**
   * @param {string} id
   * @param {string} [reason]
   */
  function skip(id, reason) {
    try {
      if (destroyed) return { status: 'rejected', reason: 'destroyed' };
      if (active && active.id === id) {
        finishActive('skipped', reason || 'skip');
        stats.skipped += 1;
        advanceQueue();
        return { status: 'skipped' };
      }
      var idx = findQueueIndex(id);
      if (idx !== -1) {
        queue.splice(idx, 1);
        stats.skipped += 1;
        notify('dequeue-remove', { id: id, reason: reason || 'skip' });
        return { status: 'skipped' };
      }
      return { status: 'rejected', reason: 'no such presentation' };
    } catch (err) {
      stats.errors += 1;
      notify('error', { reason: 'skip() threw: ' + safeString(err && err.message) });
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  function clear() {
    try {
      if (destroyed) return;
      if (active) finishActive('skipped', 'clear');
      queue.forEach(function (item) { notify('dequeue-remove', { id: item.model.id, reason: 'clear' }); });
      queue = [];
      stats.cleared += 1;
      notify('clear', {});
    } catch (err) {
      stats.errors += 1;
    }
  }

  function destroy() {
    try {
      if (destroyed) return;
      if (active) {
        clearActiveTimers();
        try { root.VyraPremiumWidget && root.VyraPremiumWidget.hide(active.id); } catch (err) { /* ignore */ }
        active = null;
      }
      queue = [];
      destroyed = true;
      mounted = false;
      notify('destroy', {});
      subscribers = [];
      // Deliberately not permanent — see spec's Lifecycle section. mount()/show() work again
      // after this, matching premium-widget-core.js's own documented deviation.
      destroyed = false;
    } catch (err) {
      // swallow — destroy() must never throw
    }
  }

  function getState() {
    return deepClone({
      mounted: mounted,
      destroyed: destroyed,
      active: active ? { id: active.id, tier: active.model.presentation.tier, family: active.model.presentation.family, streakId: active.model.gift.streakId, repeatCount: active.model.gift.repeatCount } : null,
      queueLength: queue.length,
      queue: queue.map(function (item) { return { id: item.model.id, tier: item.model.presentation.tier, priority: item.priority, sequence: item.sequence }; })
    });
  }

  function getStats() {
    return deepClone(stats);
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function unsubscribe() {};
    subscribers.push(fn);
    return function unsubscribe() {
      var idx = subscribers.indexOf(fn);
      if (idx !== -1) subscribers.splice(idx, 1);
    };
  }

  // ---- internal: presentation lifecycle -------------------------------------------------

  function activatePresentation(model) {
    var Widget = root.VyraPremiumWidget;
    var sizeTier = resolveSizeTier(model.presentation.tier, model.presentation.intensity);
    var family = model.presentation.family || DEFAULT_FAMILY[model.presentation.tier];
    var durationMs = (typeof model.presentation.durationMs === 'number' && model.presentation.durationMs > 0)
      ? model.presentation.durationMs
      : DEFAULT_DURATION_MS[model.presentation.tier];

    var widgetModel = {
      id: model.id,
      family: family,
      tier: sizeTier,
      user: model.user,
      gift: {
        imageUrl: model.gift.imageUrl,
        amount: (model.gift.repeatCount && model.gift.repeatCount > 1) ? model.gift.repeatCount : model.gift.amount,
        coins: model.gift.coins
      },
      text: {
        title: model.presentation.title,
        subtitle: model.presentation.subtitle,
        showDisplayName: model.presentation.showDisplayName,
        showGiftName: model.presentation.showGiftName
      },
      timing: { holdMs: durationMs },
      accessibility: { announcement: model.accessibility.announcement }
    };

    var showResult = Widget.show(widgetModel);
    var instance = { id: model.id, model: model, generation: 0, timers: new Set() };
    active = instance;

    if (!showResult || (showResult.status !== 'shown' && showResult.status !== 'replaced')) {
      stats.errors += 1;
      notify('error', { reason: 'underlying show() rejected: ' + safeString(showResult && showResult.reason) });
      return;
    }

    scheduleTimer(instance, function () {
      if (active !== instance) return; // superseded
      finishActive('completed', 'timeout');
      stats.completed += 1;
      advanceQueue();
    }, durationMs);
  }

  function finishActive(outcome, reason) {
    if (!active) return;
    clearActiveTimers();
    try {
      if (root.VyraPremiumWidget && typeof root.VyraPremiumWidget.hide === 'function') {
        root.VyraPremiumWidget.hide(active.id, reason);
      }
    } catch (err) {
      stats.errors += 1;
    }
    notify(outcome === 'completed' ? 'complete' : 'skip', { id: active.id, reason: reason });
    active = null;
  }

  function advanceQueue() {
    if (active || queue.length === 0) return;
    queue.sort(compareQueueItems);
    var next = queue.shift();
    activatePresentation(next.model);
    stats.shown += 1;
    notify('show', { id: next.model.id, tier: next.model.presentation.tier, fromQueue: true });
  }

  function enqueue(model, priority) {
    if (queue.length >= QUEUE_MAX_LENGTH) {
      queue.sort(compareQueueItems);
      var lowest = queue[queue.length - 1];
      if (lowest && priority > lowest.priority) {
        queue.pop();
        notify('dequeue-remove', { id: lowest.model.id, reason: 'replaced' });
      } else {
        return { status: 'dropped', reason: 'queue full' };
      }
    }
    sequenceCounter += 1;
    queue.push({ model: model, priority: priority, sequence: sequenceCounter, enqueuedAt: Date.now() });
    return { status: 'queued' };
  }

  function compareQueueItems(a, b) {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.sequence - b.sequence;
  }

  function findQueueIndex(id) {
    for (var i = 0; i < queue.length; i++) {
      if (queue[i].model.id === id) return i;
    }
    return -1;
  }

  function resolveSizeTier(giftTier, intensity) {
    var base = DEFAULT_SIZE_TIER[giftTier];
    var idx = SIZE_TIERS.indexOf(base);
    if (intensity === 'high') idx = Math.min(idx + 1, SIZE_TIERS.length - 1);
    if (intensity === 'low') idx = Math.max(idx - 1, 0);
    return SIZE_TIERS[idx];
  }

  // ---- internal: timers (generation-guarded, per active presentation) -----------------

  function scheduleTimer(instance, fn, delayMs) {
    var gen = instance.generation;
    var timerId = setTimeout(function () {
      instance.timers.delete(timerId);
      if (gen !== instance.generation) return; // stale
      fn();
    }, delayMs);
    instance.timers.add(timerId);
    return timerId;
  }

  function clearActiveTimers() {
    if (!active) return;
    active.generation += 1;
    active.timers.forEach(function (id) { clearTimeout(id); });
    active.timers.clear();
  }

  // ---- model validation / normalization ---------------------------------------------

  function validateModel(model) {
    if (!model || typeof model !== 'object') return { ok: false, reason: 'model is not an object' };
    var presentation = (model.presentation && typeof model.presentation === 'object') ? model.presentation : {};
    if (GIFT_TIERS.indexOf(presentation.tier) === -1) return { ok: false, reason: 'unknown or missing presentation.tier: ' + safeString(presentation.tier) };
    if (presentation.family !== undefined && presentation.family !== null && FAMILIES.indexOf(presentation.family) === -1) {
      return { ok: false, reason: 'unknown presentation.family: ' + safeString(presentation.family) };
    }
    var intensity = ['low', 'normal', 'high'].indexOf(presentation.intensity) !== -1 ? presentation.intensity : 'normal';

    var user = (model.user && typeof model.user === 'object') ? model.user : {};
    var gift = (model.gift && typeof model.gift === 'object') ? model.gift : {};
    var accessibility = (model.accessibility && typeof model.accessibility === 'object') ? model.accessibility : {};

    var id = (typeof model.id === 'string' && model.id) ? model.id : generateId();

    var normalized = {
      id: id,
      eventId: safeString(model.eventId || ''),
      timestamp: (typeof model.timestamp === 'number' && isFinite(model.timestamp)) ? model.timestamp : Date.now(),
      user: {
        id: safeString(user.id || ''),
        displayName: safeString(user.displayName || 'Guest'),
        avatarUrl: (typeof user.avatarUrl === 'string') ? user.avatarUrl : null
      },
      gift: {
        id: safeString(gift.id || ''),
        imageUrl: (typeof gift.imageUrl === 'string') ? gift.imageUrl : null,
        amount: (typeof gift.amount === 'number' && isFinite(gift.amount) && gift.amount > 0) ? gift.amount : 0,
        coins: (typeof gift.coins === 'number' && isFinite(gift.coins) && gift.coins > 0) ? gift.coins : 0,
        repeatCount: (typeof gift.repeatCount === 'number' && isFinite(gift.repeatCount) && gift.repeatCount > 0) ? gift.repeatCount : 1,
        streakId: (typeof gift.streakId === 'string' && gift.streakId) ? gift.streakId : null
      },
      presentation: {
        tier: presentation.tier,
        family: presentation.family || null,
        showDisplayName: presentation.showDisplayName !== false,
        showGiftName: presentation.showGiftName === true,
        title: (typeof presentation.title === 'string') ? presentation.title : '',
        subtitle: (typeof presentation.subtitle === 'string') ? presentation.subtitle : '',
        durationMs: (typeof presentation.durationMs === 'number' && presentation.durationMs > 0) ? presentation.durationMs : null,
        intensity: intensity
      },
      accessibility: {
        announcement: (typeof accessibility.announcement === 'string' && accessibility.announcement) ? accessibility.announcement : null
      }
    };
    return { ok: true, model: normalized };
  }

  function deepMerge(base, partial) {
    var out = deepClone(base);
    Object.keys(partial || {}).forEach(function (key) {
      var value = partial[key];
      if (value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object') {
        Object.assign(out[key], value);
      } else if (value !== undefined) {
        out[key] = value;
      }
    });
    return out;
  }

  // ---- notifications ---------------------------------------------------------

  function notify(type, detail) {
    var payload = Object.assign({ type: type, timestamp: Date.now() }, detail || {});
    subscribers.slice().forEach(function (fn) {
      try { fn(deepClone(payload)); } catch (err) { /* isolate subscriber errors */ }
    });
  }

  // ---- helpers ---------------------------------------------------------------

  function generateId() {
    idCounter += 1;
    return 'pgw_' + Date.now().toString(36) + '_' + idCounter.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeString(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch (err) { return String(value); }
  }

  root.VyraPremiumGiftWidget = Object.freeze({
    mount: mount,
    show: show,
    hide: hide,
    update: update,
    complete: complete,
    skip: skip,
    clear: clear,
    destroy: destroy,
    getState: getState,
    getStats: getStats,
    subscribe: subscribe
  });
})(typeof window !== 'undefined' ? window : globalThis);
