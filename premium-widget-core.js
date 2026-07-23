// premium-widget-core.js — Premium Widget Design System (Roadmap Phase 4).
// See docs/PREMIUM_WIDGET_SPEC.md for the full spec every constant/behavior here implements.
// A separate, additive system from the Recognition Engine (recognition-card.js etc.) — no
// dependency on it, no shared selectors, different root z-index band. Depends only on
// window.VyraPremiumWidgetAssets (premium-widget-assets.js) for image sanitization/fallback
// glyphs/initials, and on premium-widget-tokens.css for all visual styling — this file only
// ever builds DOM structure and toggles classes, it never writes a raw color/size value.
//
// Unlike recognition-card.js (single current card, replace-on-show), this system supports
// MULTIPLE concurrently visible widget instances, keyed by model.id — needed for later phases
// (Phase 6 Top Gifter can be persistent while Phase 5 Gift Widget bursts fire independently).
// Each instance owns its own generation counter + pending-timer Set, mirroring
// recognition-card.js's proven stale-timer-safety pattern, just one per instance instead of
// one for the whole module.
//
// No setInterval, no requestAnimationFrame loop anywhere in this file — every phase
// transition is a single generation-guarded setTimeout, exactly like recognition-card.js.
(function (root) {
  'use strict';

  var Assets = root.VyraPremiumWidgetAssets;
  var FAMILIES = ['crystal-halo', 'royal-crown', 'legendary-portal', 'elite-minimal'];
  var TIERS = ['small', 'medium', 'legendary'];

  var TIER_TIMING = {
    small: { enterMs: 650, holdMs: 3200, exitMs: 260 },
    medium: { enterMs: 850, holdMs: 4200, exitMs: 320 },
    legendary: { enterMs: 1150, holdMs: 6000, exitMs: 420 }
  };

  var PARTICLE_COUNT = 6;

  // ---- module state ------------------------------------------------------------------

  var mounted = false;
  var rootEl = null;
  var performanceMode = 'high'; // 'high' | 'low'
  var subscribers = [];
  var instances = new Map(); // id -> instance record
  var idCounter = 0;

  // ---- public API -----------------------------------------------------------------

  function mount(target) {
    try {
      return mountInternal(target);
    } catch (err) {
      notify('error', { reason: 'mount() threw: ' + safeString(err && err.message) });
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  function mountInternal(target) {
    if (typeof document === 'undefined') return { status: 'rejected', reason: 'no DOM available in this environment' };
    if (mounted) return { status: 'mounted' }; // idempotent, same convention as recognition-card.js
    var container = resolveTarget(target);
    if (!container) return { status: 'rejected', reason: 'invalid mount target' };
    rootEl = document.createElement('div');
    rootEl.className = 'vyra-pw-root';
    if (performanceMode === 'low') rootEl.classList.add('vyra-pw-perf-low');
    container.appendChild(rootEl);
    mounted = true;
    notify('mount', {});
    return { status: 'mounted' };
  }

  /**
   * @param {Object} model — see docs/PREMIUM_WIDGET_SPEC.md "Public API" for the full shape.
   * @param {Object} [options]
   * @returns {{status:'shown'|'replaced'|'rejected', id?:string, reason?:string}}
   */
  function show(model, options) {
    try {
      return showInternal(model, options || {});
    } catch (err) {
      notify('error', { reason: 'show() threw: ' + safeString(err && err.message) });
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  function showInternal(model, options) {
    if (!mounted || !rootEl) return { status: 'rejected', reason: 'not mounted' };
    var validation = validateModel(model);
    if (!validation.ok) return { status: 'rejected', reason: validation.reason };
    var normalized = validation.model;

    var existing = instances.get(normalized.id);
    var wasReplace = !!existing;
    if (existing) {
      clearInstanceTimers(existing);
      if (existing.el && existing.el.parentNode) existing.el.parentNode.removeChild(existing.el);
      instances.delete(normalized.id);
    }

    var el = buildWidgetElement(normalized);
    rootEl.appendChild(el);

    var instance = {
      id: normalized.id,
      el: el,
      model: normalized,
      phase: 'entering',
      generation: 0,
      timers: new Set()
    };
    instances.set(normalized.id, instance);

    runEnterHoldSequence(instance);
    notify(wasReplace ? 'replace' : 'show', { id: normalized.id, family: normalized.family, tier: normalized.tier });
    return { status: wasReplace ? 'replaced' : 'shown', id: normalized.id };
  }

  /**
   * @param {string} id
   * @param {string} [reason]
   * @returns {{status:'hidden'|'rejected', reason?:string}}
   */
  function hide(id, reason) {
    try {
      return hideInternal(id, reason);
    } catch (err) {
      notify('error', { reason: 'hide() threw: ' + safeString(err && err.message) });
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  function hideInternal(id, reason) {
    if (!mounted) return { status: 'rejected', reason: 'not mounted' };
    var instance = instances.get(id);
    if (!instance) return { status: 'hidden' }; // nothing to do — safe no-op, matches Card's idempotent hide()
    if (instance.phase === 'exiting') return { status: 'hidden' };
    beginExit(instance, reason || 'manual');
    return { status: 'hidden' };
  }

  /**
   * Merges a partial model into a currently-visible instance's content WITHOUT restarting the
   * enter animation — for live-updating fields (e.g. a running coin total) on a
   * longer-lived widget in a later phase. Never touches phase/timers.
   * @param {string} id
   * @param {Object} partialModel
   */
  function update(id, partialModel) {
    try {
      return updateInternal(id, partialModel);
    } catch (err) {
      notify('error', { reason: 'update() threw: ' + safeString(err && err.message) });
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  function updateInternal(id, partialModel) {
    var instance = instances.get(id);
    if (!instance) return { status: 'rejected', reason: 'no such instance' };
    var merged = deepMerge(instance.model, partialModel || {});
    var validation = validateModel(merged);
    if (!validation.ok) return { status: 'rejected', reason: validation.reason };
    instance.model = validation.model;
    applyContentInPlace(instance.el, instance.model);
    notify('update', { id: id });
    return { status: 'updated' };
  }

  /**
   * Demo/editor-only convenience — same render path and guarantees as show(), documented
   * separately so a caller can tell intent apart from a real event-driven presentation. See
   * docs/PREMIUM_WIDGET_SPEC.md "preview() vs show()".
   */
  function preview(model, options) {
    return show(model, options);
  }

  function setPerformanceMode(mode) {
    performanceMode = (mode === 'low') ? 'low' : 'high';
    if (rootEl) rootEl.classList.toggle('vyra-pw-perf-low', performanceMode === 'low');
    notify('performance-mode', { mode: performanceMode });
  }

  function destroy() {
    try {
      destroyInternal();
    } catch (err) {
      // swallow — destroy() must never throw
    }
  }

  function destroyInternal() {
    instances.forEach(function (instance) { clearInstanceTimers(instance); });
    instances.clear();
    if (rootEl && rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
    rootEl = null;
    mounted = false;
    notify('destroy', {});
    subscribers = [];
    // Deliberately NOT permanent (unlike recognition-card.js's one-way destroy) — mount() may
    // be called again afterward. This system is expected to support editor-style repeated
    // mount/destroy cycles (see docs/PREMIUM_WIDGET_SPEC.md), documented deviation.
  }

  function getState() {
    var list = [];
    instances.forEach(function (instance) {
      list.push({ id: instance.id, family: instance.model.family, tier: instance.model.tier, phase: instance.phase });
    });
    return deepClone({ mounted: mounted, performanceMode: performanceMode, instanceCount: instances.size, instances: list });
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function unsubscribe() {};
    subscribers.push(fn);
    return function unsubscribe() {
      var idx = subscribers.indexOf(fn);
      if (idx !== -1) subscribers.splice(idx, 1);
    };
  }

  // ---- model validation / normalization ---------------------------------------------

  function validateModel(model) {
    if (!model || typeof model !== 'object') return { ok: false, reason: 'model is not an object' };
    if (FAMILIES.indexOf(model.family) === -1) return { ok: false, reason: 'unknown family: ' + safeString(model.family) };
    var tier = TIERS.indexOf(model.tier) !== -1 ? model.tier : 'medium';
    var id = (typeof model.id === 'string' && model.id) ? model.id : generateId();
    var user = (model.user && typeof model.user === 'object') ? model.user : {};
    var gift = (model.gift && typeof model.gift === 'object') ? model.gift : {};
    var text = (model.text && typeof model.text === 'object') ? model.text : {};
    var timing = (model.timing && typeof model.timing === 'object') ? model.timing : {};
    var accessibility = (model.accessibility && typeof model.accessibility === 'object') ? model.accessibility : {};
    var defaults = TIER_TIMING[tier];

    var normalized = {
      id: id,
      family: model.family,
      tier: tier,
      user: {
        id: safeString(user.id || ''),
        displayName: safeString(user.displayName || 'Guest'),
        avatarUrl: (typeof user.avatarUrl === 'string') ? user.avatarUrl : null
      },
      gift: {
        imageUrl: (typeof gift.imageUrl === 'string') ? gift.imageUrl : null,
        amount: (typeof gift.amount === 'number' && isFinite(gift.amount) && gift.amount > 0) ? gift.amount : 0,
        coins: (typeof gift.coins === 'number' && isFinite(gift.coins) && gift.coins > 0) ? gift.coins : 0
      },
      text: {
        title: (typeof text.title === 'string') ? text.title : '',
        subtitle: (typeof text.subtitle === 'string') ? text.subtitle : '',
        showDisplayName: text.showDisplayName !== false,
        showGiftName: text.showGiftName === true
      },
      timing: {
        enterMs: (typeof timing.enterMs === 'number' && timing.enterMs >= 0) ? timing.enterMs : defaults.enterMs,
        holdMs: (typeof timing.holdMs === 'number' && timing.holdMs >= 0) ? timing.holdMs : defaults.holdMs,
        exitMs: (typeof timing.exitMs === 'number' && timing.exitMs >= 0) ? timing.exitMs : defaults.exitMs
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
      } else {
        out[key] = value;
      }
    });
    return out;
  }

  // ---- DOM construction ---------------------------------------------------------------

  function buildWidgetElement(model) {
    var el = document.createElement('div');
    el.className = 'vyra-pw-widget vyra-pw-family-' + model.family + ' vyra-pw-tier-' + model.tier;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', buildAnnouncement(model));

    switch (model.family) {
      case 'crystal-halo': buildCrystalHalo(el, model); break;
      case 'royal-crown': buildRoyalCrown(el, model); break;
      case 'legendary-portal': buildLegendaryPortal(el, model); break;
      case 'elite-minimal': buildEliteMinimal(el, model); break;
      default: break;
    }
    return el;
  }

  function buildAnnouncement(model) {
    if (model.accessibility.announcement) return model.accessibility.announcement;
    var name = model.text.showDisplayName ? model.user.displayName : 'Someone';
    if (model.family === 'elite-minimal') return name + (model.text.title ? ': ' + model.text.title : '');
    return name + (model.gift.amount > 1 ? ' sent ' + model.gift.amount + ' gifts' : ' sent a gift');
  }

  function buildAvatarFrameEl(model) {
    var frame = document.createElement('div');
    frame.className = 'vyra-pw-avatar-frame';
    var url = Assets.sanitizeImageUrl(model.user.avatarUrl);
    if (url) {
      var img = document.createElement('img');
      img.className = 'vyra-pw-avatar-img';
      img.alt = '';
      img.onerror = function () {
        frame.classList.add('vyra-pw-avatar-fallback');
        if (img.parentNode) img.parentNode.removeChild(img);
      };
      img.src = url;
      frame.appendChild(img);
    } else {
      frame.classList.add('vyra-pw-avatar-fallback');
    }
    var initials = document.createElement('span');
    initials.className = 'vyra-pw-avatar-initials';
    initials.textContent = Assets.initialsFromName(model.user.displayName);
    frame.appendChild(initials);
    return frame;
  }

  function buildGiftFrameEl(model) {
    var frame = document.createElement('div');
    frame.className = 'vyra-pw-gift-frame';
    var url = Assets.sanitizeImageUrl(model.gift.imageUrl);
    if (url) {
      var img = document.createElement('img');
      img.className = 'vyra-pw-gift-img';
      img.alt = '';
      img.onerror = function () {
        frame.classList.add('vyra-pw-gift-fallback');
        if (img.parentNode) img.parentNode.removeChild(img);
      };
      img.src = url;
      frame.appendChild(img);
    } else {
      frame.classList.add('vyra-pw-gift-fallback');
    }
    var glyphWrap = document.createElement('span');
    glyphWrap.className = 'vyra-pw-gift-fallback-glyph';
    // Static, hand-authored SVG string from premium-widget-assets.js (never user input) — the
    // one safe, deliberate innerHTML use in this file. No user-controlled data ever reaches it.
    glyphWrap.innerHTML = Assets.giftFallbackGlyphSvg();
    frame.appendChild(glyphWrap);
    return frame;
  }

  function buildTextBlock(model, options) {
    options = options || {};
    var wrap = document.createElement('div');
    wrap.className = 'vyra-pw-text';

    if (!options.noEyebrow) {
      var eyebrow = document.createElement('div');
      eyebrow.className = 'vyra-pw-eyebrow';
      eyebrow.textContent = options.eyebrowText || (model.tier === 'legendary' ? 'LEGENDARY GIFT' : 'GIFT');
      wrap.appendChild(eyebrow);
    }

    var titleText = model.text.showDisplayName ? (model.text.title || model.user.displayName) : model.text.title;
    if (titleText) {
      var title = document.createElement('div');
      title.className = 'vyra-pw-title';
      title.textContent = titleText;
      wrap.appendChild(title);
    }

    if (model.text.subtitle) {
      var subtitle = document.createElement('div');
      subtitle.className = 'vyra-pw-subtitle';
      subtitle.textContent = model.text.subtitle;
      wrap.appendChild(subtitle);
    }

    if (model.gift.amount > 0 || model.gift.coins > 0) {
      var badge = document.createElement('div');
      badge.className = 'vyra-pw-badge';
      var parts = [];
      if (model.gift.amount > 0) parts.push('×' + model.gift.amount);
      if (model.gift.coins > 0) parts.push(model.gift.coins.toLocaleString('en-US') + ' coins');
      badge.textContent = parts.join(' · ');
      wrap.appendChild(badge);
    }

    return wrap;
  }

  function buildParticles(count) {
    var wrap = document.createElement('div');
    wrap.className = 'vyra-pw-particles';
    for (var i = 0; i < count; i++) {
      var dot = document.createElement('span');
      dot.className = 'vyra-pw-particle vyra-pw-particle-' + i;
      wrap.appendChild(dot);
    }
    return wrap;
  }

  function buildCrystalHalo(el, model) {
    var glow = document.createElement('div'); glow.className = 'vyra-pw-glow';
    var panel = document.createElement('div'); panel.className = 'vyra-pw-crystal-panel';
    var facets = document.createElement('div'); facets.className = 'vyra-pw-crystal-facets';
    facets.innerHTML = Assets.crystalFacetSvg(); // static asset string, not user input
    var shell = document.createElement('div'); shell.className = 'vyra-pw-shell';
    var media = document.createElement('div'); media.className = 'vyra-pw-media';

    media.appendChild(buildAvatarFrameEl(model));
    media.appendChild(buildGiftFrameEl(model));
    shell.appendChild(media);
    shell.appendChild(buildTextBlock(model));
    panel.appendChild(facets);
    panel.appendChild(shell);
    el.appendChild(glow);
    el.appendChild(panel);
    el.appendChild(buildParticles(PARTICLE_COUNT));
  }

  function buildRoyalCrown(el, model) {
    var glow = document.createElement('div'); glow.className = 'vyra-pw-glow';
    var frame = document.createElement('div'); frame.className = 'vyra-pw-crown-frame';
    var glyph = document.createElement('div'); glyph.className = 'vyra-pw-crown-glyph';
    glyph.innerHTML = Assets.crownGlyphSvg(); // static asset string, not user input
    var shell = document.createElement('div'); shell.className = 'vyra-pw-shell';
    var media = document.createElement('div'); media.className = 'vyra-pw-media';

    media.appendChild(buildAvatarFrameEl(model));
    shell.appendChild(media);
    shell.appendChild(buildTextBlock(model, { eyebrowText: model.tier === 'legendary' ? 'ROYAL GIFT' : 'GIFT' }));
    frame.appendChild(glyph);
    frame.appendChild(shell);
    frame.appendChild(buildGiftFrameEl(model));
    el.appendChild(glow);
    el.appendChild(frame);
    el.appendChild(buildParticles(PARTICLE_COUNT));
  }

  function buildLegendaryPortal(el, model) {
    var glow = document.createElement('div'); glow.className = 'vyra-pw-glow';
    var stage = document.createElement('div'); stage.className = 'vyra-pw-portal-stage';
    var rings = document.createElement('div'); rings.className = 'vyra-pw-portal-rings';
    rings.innerHTML = Assets.portalRingSvg(); // static asset string, not user input
    var media = document.createElement('div'); media.className = 'vyra-pw-media';

    media.appendChild(buildAvatarFrameEl(model));
    stage.appendChild(rings);
    stage.appendChild(media);
    stage.appendChild(buildGiftFrameEl(model));
    stage.appendChild(buildTextBlock(model, { eyebrowText: 'LEGENDARY' }));
    el.appendChild(glow);
    el.appendChild(stage);
    el.appendChild(buildParticles(PARTICLE_COUNT));
  }

  function buildEliteMinimal(el, model) {
    var bar = document.createElement('div'); bar.className = 'vyra-pw-minimal-bar';
    bar.appendChild(buildAvatarFrameEl(model));
    bar.appendChild(buildTextBlock(model, { noEyebrow: true }));
    bar.appendChild(buildGiftFrameEl(model));
    el.appendChild(bar);
  }

  // update()'s in-place content refresh — rebuilds only the text/badge content, never the
  // avatar/gift image elements (those don't change on a live update in the intended use case),
  // never touches phase classes.
  function applyContentInPlace(el, model) {
    var oldText = el.querySelector('.vyra-pw-text');
    if (!oldText || !oldText.parentNode) return;
    var noEyebrow = model.family === 'elite-minimal';
    var newText = buildTextBlock(model, { noEyebrow: noEyebrow });
    oldText.parentNode.replaceChild(newText, oldText);
  }

  // ---- phase / timer engine (per instance) ---------------------------------------------

  function runEnterHoldSequence(instance) {
    var el = instance.el;
    var timing = instance.model.timing;
    var gen = instance.generation;

    el.classList.add('vyra-pw-phase-anticipation');

    scheduleTimer(instance, gen, function () {
      el.classList.remove('vyra-pw-phase-anticipation');
      el.classList.add('vyra-pw-phase-reveal');

      scheduleTimer(instance, gen, function () {
        el.classList.add('vyra-pw-phase-settled');
        instance.phase = 'visible';
        notify('show-complete', { id: instance.id });

        if (timing.holdMs > 0) {
          scheduleTimer(instance, gen, function () {
            beginExit(instance, 'timeout');
          }, timing.holdMs);
        }
      }, Math.max(16, timing.enterMs - 16));
    }, 16);
  }

  function beginExit(instance, reason) {
    if (instance.phase === 'exiting') return;
    instance.phase = 'exiting';
    var el = instance.el;
    var timing = instance.model.timing;
    var gen = instance.generation;

    el.classList.remove('vyra-pw-phase-reveal', 'vyra-pw-phase-settled');
    el.classList.add('vyra-pw-phase-exit');
    notify('hide', { id: instance.id, reason: reason });

    scheduleTimer(instance, gen, function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      instances.delete(instance.id);
      notify('hide-complete', { id: instance.id, reason: reason });
    }, timing.exitMs);
  }

  function scheduleTimer(instance, gen, fn, delayMs) {
    var timerId = setTimeout(function () {
      instance.timers.delete(timerId);
      if (gen !== instance.generation) return; // stale — superseded by a newer show() on this id
      fn();
    }, delayMs);
    instance.timers.add(timerId);
    return timerId;
  }

  function clearInstanceTimers(instance) {
    instance.generation += 1; // invalidate any in-flight callbacks for the old generation
    instance.timers.forEach(function (id) { clearTimeout(id); });
    instance.timers.clear();
  }

  // ---- notifications ---------------------------------------------------------

  function notify(type, detail) {
    var payload = Object.assign({ type: type, timestamp: Date.now() }, detail || {});
    subscribers.slice().forEach(function (fn) {
      try { fn(deepClone(payload)); } catch (err) { /* isolate subscriber errors, same as Recognition Engine */ }
    });
  }

  // ---- helpers ---------------------------------------------------------------

  function resolveTarget(target) {
    if (typeof target === 'string') return document.querySelector(target);
    if (target && target.nodeType === 1) return target;
    return null;
  }

  function generateId() {
    idCounter += 1;
    return 'pw_' + Date.now().toString(36) + '_' + idCounter.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeString(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch (err) { return String(value); }
  }

  root.VyraPremiumWidget = Object.freeze({
    mount: mount,
    show: show,
    hide: hide,
    update: update,
    preview: preview,
    setPerformanceMode: setPerformanceMode,
    destroy: destroy,
    getState: getState,
    subscribe: subscribe
  });
})(typeof window !== 'undefined' ? window : globalThis);
