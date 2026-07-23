// recognition-card.js — Recognition Engine, Recognition Card UI (Steg 8).
// Renders a CardModel (from recognition-card-mapper.js) as the exclusive on-screen overlay
// component. This is the ONLY Recognition Engine file that touches the DOM or uses timers —
// every earlier stage (Normalizer/Merge/Queue/Controller/Card Mapper) is deliberately DOM-free
// and timer-free; this file is where that discipline pays off, and where it ends.
// Depends on window.VyraRecognitionRules (cardTimingMs) and, optionally,
// window.VyraRecognitionCardMapper.validateCardModel (reused rather than re-implemented —
// falls back to a minimal shape check if the Mapper isn't loaded). No dependency on Queue,
// Controller, Merge, or Normalizer at all — this file only ever consumes a CardModel.
// Card never decides how long an event stays visible — that's the Controller's job via
// durationMs on the presentation it hands to whatever wires Controller -> Mapper -> Card
// together (not implemented in this step). Card only ever manages enter / visible / exit.
(function (root) {
  'use strict';

  var Rules = root.VyraRecognitionRules || {};
  var TIMING = Rules.cardTimingMs || { anticipation: 110, reveal: 340, settle: 220, exit: 260 };
  var PARTICLE_COUNT = 6;

  // ---- state ------------------------------------------------------------------

  var rootEl = null;
  var cardEl = null;
  var mounted = false;
  var visible = false;
  var phase = 'unmounted';
  var currentModel = null;
  var generation = 0;
  var pendingTimers = new Set();
  var subscribers = [];

  // ---- public API ---------------------------------------------------------------

  /**
   * @param {HTMLElement|string} target
   * @param {Object} [options]
   * @returns {{status:'mounted'|'rejected', reason?:string}}
   */
  function mount(target, options) {
    try {
      return mountInternal(target, options);
    } catch (err) {
      notify('error', { reason: 'mount() threw: ' + safeString(err && err.message) });
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  function mountInternal(target) {
    if (typeof document === 'undefined') {
      return { status: 'rejected', reason: 'no DOM available in this environment' };
    }
    if (mounted) {
      return { status: 'mounted' }; // "upprepad mount ska vara saker" — idempotent, single root
    }
    var container = resolveTarget(target);
    if (!container) {
      return { status: 'rejected', reason: 'invalid mount target' };
    }
    rootEl = document.createElement('div');
    rootEl.className = 'vyra-recognition-root';
    container.appendChild(rootEl);
    mounted = true;
    phase = 'idle';
    notify('mount', {});
    return { status: 'mounted' };
  }

  /**
   * @param {*} cardModel
   * @param {Object} [options]
   * @returns {{status:'shown'|'replaced'|'rejected', reason?:string}}
   */
  function show(cardModel, options) {
    try {
      return showInternal(cardModel, options);
    } catch (err) {
      notify('error', { reason: 'show() threw: ' + safeString(err && err.message) });
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  function showInternal(cardModel) {
    if (!mounted || !rootEl) return { status: 'rejected', reason: 'not mounted' };
    var validation = validateModelForShow(cardModel);
    if (!validation.ok) return { status: 'rejected', reason: validation.reason };

    var wasActive = phase === 'entering' || phase === 'visible' || phase === 'exiting';
    var previousEl = cardEl;

    generation += 1;
    var myGeneration = generation;
    clearAllTimers();

    var newEl = buildCardElement(cardModel);
    rootEl.appendChild(newEl);
    cardEl = newEl;
    currentModel = deepClone(cardModel);
    phase = 'entering';
    visible = true;

    // controlled replace: the previous card gets its own exit animation and is only removed
    // once that finishes — never yanked out instantly, and never left stacked indefinitely.
    if (wasActive && previousEl && previousEl.parentNode === rootEl) {
      retireElement(previousEl, myGeneration, {});
    }

    runEnterSequence(newEl, myGeneration);

    var status = wasActive ? 'replaced' : 'shown';
    notify(wasActive ? 'replace' : 'show', { model: deepClone(cardModel) });
    return { status: status };
  }

  /**
   * @param {string} [reason]
   * @returns {{status:'hidden'|'rejected', reason?:string}}
   */
  function hide(reason) {
    try {
      return hideInternal(reason);
    } catch (err) {
      notify('error', { reason: 'hide() threw: ' + safeString(err && err.message) });
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  function hideInternal(reason) {
    if (!mounted) return { status: 'rejected', reason: 'not mounted' };
    if (phase === 'idle' || phase === 'unmounted' || phase === 'destroyed' || phase === 'exiting') {
      return { status: 'hidden' }; // "upprepad hide ska vara saker" — nothing active, safe no-op
    }

    generation += 1;
    var myGeneration = generation;
    clearAllTimers();
    phase = 'exiting';

    var el = cardEl;
    if (el) {
      retireElement(el, myGeneration, {
        onComplete: function () {
          if (cardEl === el) cardEl = null;
          finalizeHidden(reason);
        }
      });
    } else {
      finalizeHidden(reason);
    }

    notify('hide', { reason: reason });
    return { status: 'hidden' };
  }

  function finalizeHidden(reason) {
    phase = 'idle';
    visible = false;
    currentModel = null;
    notify('exit-complete', { reason: reason });
  }

  /**
   * @param {*} cardModel
   * @returns {{status:'updated'|'rejected', reason?:string}}
   */
  function update(cardModel) {
    try {
      return updateInternal(cardModel);
    } catch (err) {
      notify('error', { reason: 'update() threw: ' + safeString(err && err.message) });
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  function updateInternal(cardModel) {
    if (!mounted || !cardEl || (phase !== 'visible' && phase !== 'entering')) {
      return { status: 'rejected', reason: 'no active card to update' };
    }
    var validation = validateModelForShow(cardModel);
    if (!validation.ok) return { status: 'rejected', reason: validation.reason };

    applyModelToExistingElement(cardEl, cardModel);
    currentModel = deepClone(cardModel);
    notify('update', { model: deepClone(cardModel) });
    return { status: 'updated' };
  }

  /**
   * @returns {{status:'destroyed'}}
   */
  function destroy() {
    try {
      clearAllTimers();
      generation += 1;
      if (rootEl && rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
      rootEl = null;
      cardEl = null;
      mounted = false;
      visible = false;
      phase = 'destroyed';
      currentModel = null;
      notify('destroy', {});
      subscribers = []; // "ta bort listeners" — drop all subscriptions after notifying them
      return { status: 'destroyed' };
    } catch (err) {
      logDebug('destroy() threw: ' + safeString(err && err.message));
      return { status: 'destroyed' };
    }
  }

  function getState() {
    return deepClone({
      mounted: mounted,
      visible: visible,
      phase: phase,
      currentModel: currentModel
    });
  }

  function getElement() {
    return rootEl;
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function unsubscribe() {};
    subscribers.push(fn);
    return function unsubscribe() {
      var idx = subscribers.indexOf(fn);
      if (idx !== -1) subscribers.splice(idx, 1);
    };
  }

  // ---- internal: mount target resolution ---------------------------------------------------

  function resolveTarget(target) {
    if (target && typeof target === 'object' && target.nodeType === 1) return target;
    if (typeof target === 'string') {
      try {
        return document.querySelector(target) || null;
      } catch (err) {
        return null;
      }
    }
    return null;
  }

  // ---- internal: validation ---------------------------------------------------

  function validateModelForShow(model) {
    var globalObj = typeof window !== 'undefined' ? window : globalThis;
    var mapperNs = globalObj.VyraRecognitionCardMapper;
    if (mapperNs && typeof mapperNs.validateCardModel === 'function') {
      try {
        var result = mapperNs.validateCardModel(model);
        if (result && typeof result.valid === 'boolean') {
          return { ok: result.valid, reason: result.valid ? '' : (result.errors || []).join('; ') };
        }
      } catch (err) { /* fall through to the minimal check below */ }
    }
    if (!model || typeof model !== 'object') return { ok: false, reason: 'not an object' };
    if (typeof model.id !== 'string' || !model.id) return { ok: false, reason: 'missing id' };
    if (!model.content || typeof model.content.title !== 'string' || !model.content.title) return { ok: false, reason: 'missing content.title' };
    if (!model.actor || typeof model.actor.initials !== 'string' || !model.actor.initials) return { ok: false, reason: 'missing actor.initials' };
    if (!model.accessibility || typeof model.accessibility.ariaLabel !== 'string' || !model.accessibility.ariaLabel) return { ok: false, reason: 'missing accessibility.ariaLabel' };
    return { ok: true, reason: '' };
  }

  // ---- internal: DOM construction ---------------------------------------------------
  //
  // Layer order (spec): 1 ambient glow, 2 main glass shell, 3 accent rail, 4 avatar frame,
  // 5 gift image frame (when relevant), 6 text content, 7 count/coin badge,
  // 8 decorative particles/highlights. Every layer is its own element, never canvas/WebGL.
  // All user-supplied text goes through .textContent, never innerHTML.

  function buildCardElement(model) {
    var article = document.createElement('article');
    article.className = 'vyra-recognition-card vyra-recognition-kind-' + model.kind + ' vyra-recognition-variant-' + model.variant;
    article.setAttribute('role', 'status');
    article.setAttribute('aria-live', 'polite');
    article.setAttribute('aria-label', model.accessibility.ariaLabel);

    // layer 1: ambient glow
    var glow = document.createElement('div');
    glow.className = 'vyra-recognition-layer vyra-recognition-glow';
    article.appendChild(glow);

    // layer 2: main glass shell (holds layers 3, 4, 5, 6, 7)
    var shell = document.createElement('div');
    shell.className = 'vyra-recognition-layer vyra-recognition-shell';
    article.appendChild(shell);

    // layer 3: accent rail
    var rail = document.createElement('div');
    rail.className = 'vyra-recognition-layer vyra-recognition-rail';
    shell.appendChild(rail);

    // layers 4 + 5: avatar frame + gift frame, grouped in a media row
    var media = document.createElement('div');
    media.className = 'vyra-recognition-layer vyra-recognition-media';
    shell.appendChild(media);

    var avatarFrame = buildAvatarFrame(model.actor);
    media.appendChild(avatarFrame.el);

    var giftFrame = null;
    if (model.kind === 'gift' && model.gift) {
      giftFrame = buildGiftFrame(model.gift);
      media.appendChild(giftFrame.el);
    }

    // layer 6: text content
    var textBlock = document.createElement('div');
    textBlock.className = 'vyra-recognition-layer vyra-recognition-text';
    var eyebrowEl = document.createElement('span');
    eyebrowEl.className = 'vyra-recognition-eyebrow';
    eyebrowEl.textContent = model.content.eyebrow;
    var titleEl = document.createElement('span');
    titleEl.className = 'vyra-recognition-title';
    titleEl.textContent = model.content.title;
    var subtitleEl = document.createElement('span');
    subtitleEl.className = 'vyra-recognition-subtitle';
    subtitleEl.textContent = model.content.subtitle;
    textBlock.appendChild(eyebrowEl);
    textBlock.appendChild(titleEl);
    textBlock.appendChild(subtitleEl);
    shell.appendChild(textBlock);

    // layer 7: count/coin badge
    var badge = document.createElement('div');
    badge.className = 'vyra-recognition-layer vyra-recognition-badge';
    var countEl = document.createElement('span');
    countEl.className = 'vyra-recognition-count-label';
    var coinEl = document.createElement('span');
    coinEl.className = 'vyra-recognition-coin-label';
    badge.appendChild(countEl);
    badge.appendChild(coinEl);
    shell.appendChild(badge);
    updateBadge(countEl, coinEl, model.content);

    // layer 8: decorative particles/highlights — fixed count and fixed per-index class, so the
    // same CardModel always produces the exact same structure (no per-render randomness).
    var particles = document.createElement('div');
    particles.className = 'vyra-recognition-layer vyra-recognition-particles';
    for (var i = 0; i < PARTICLE_COUNT; i++) {
      var particle = document.createElement('span');
      particle.className = 'vyra-recognition-particle vyra-recognition-particle-' + i;
      particles.appendChild(particle);
    }
    article.appendChild(particles);

    article.vyraRefs = {
      eyebrowEl: eyebrowEl,
      titleEl: titleEl,
      subtitleEl: subtitleEl,
      countEl: countEl,
      coinEl: coinEl,
      avatarFrame: avatarFrame,
      giftFrame: giftFrame
    };

    return article;
  }

  function buildAvatarFrame(actor) {
    var frame = document.createElement('div');
    frame.className = 'vyra-recognition-avatar-frame';

    var initialsEl = document.createElement('span');
    initialsEl.className = 'vyra-recognition-avatar-initials';
    initialsEl.textContent = actor.initials;
    frame.appendChild(initialsEl);

    var imgEl = null;
    var safeUrl = sanitizeImageUrl(actor.avatarUrl);
    if (safeUrl) {
      imgEl = document.createElement('img');
      imgEl.className = 'vyra-recognition-avatar-img';
      imgEl.alt = '';
      imgEl.decoding = 'async';
      imgEl.referrerPolicy = 'no-referrer';
      imgEl.onerror = function () {
        frame.classList.add('vyra-recognition-avatar-fallback');
        if (imgEl && imgEl.parentNode) imgEl.parentNode.removeChild(imgEl);
      };
      imgEl.src = safeUrl;
      frame.appendChild(imgEl);
    } else {
      frame.classList.add('vyra-recognition-avatar-fallback');
    }

    return { el: frame, imgEl: imgEl, initialsEl: initialsEl };
  }

  function buildGiftFrame(gift) {
    var frame = document.createElement('div');
    frame.className = 'vyra-recognition-gift-frame';

    var fallbackEl = document.createElement('span');
    fallbackEl.className = 'vyra-recognition-gift-fallback-symbol';
    fallbackEl.textContent = '✦'; // a plain decorative glyph, set via textContent — not markup
    frame.appendChild(fallbackEl);

    var imgEl = null;
    var safeUrl = sanitizeImageUrl(gift.imageUrl);
    if (safeUrl) {
      imgEl = document.createElement('img');
      imgEl.className = 'vyra-recognition-gift-img';
      imgEl.alt = '';
      imgEl.decoding = 'async';
      imgEl.referrerPolicy = 'no-referrer';
      imgEl.onerror = function () {
        frame.classList.add('vyra-recognition-gift-fallback');
        if (imgEl && imgEl.parentNode) imgEl.parentNode.removeChild(imgEl);
      };
      imgEl.src = safeUrl;
      frame.appendChild(imgEl);
    } else {
      frame.classList.add('vyra-recognition-gift-fallback');
    }

    return { el: frame, imgEl: imgEl };
  }

  function updateBadge(countEl, coinEl, content) {
    if (content.countLabel) {
      countEl.textContent = content.countLabel;
      countEl.hidden = false;
    } else {
      countEl.textContent = '';
      countEl.hidden = true;
    }
    if (content.coinLabel) {
      coinEl.textContent = content.coinLabel;
      coinEl.hidden = false;
    } else {
      coinEl.textContent = '';
      coinEl.hidden = true;
    }
  }

  function applyModelToExistingElement(el, model) {
    var refs = el.vyraRefs;
    if (!refs) return;
    refs.eyebrowEl.textContent = model.content.eyebrow;
    refs.titleEl.textContent = model.content.title;
    refs.subtitleEl.textContent = model.content.subtitle;
    updateBadge(refs.countEl, refs.coinEl, model.content);
    refs.avatarFrame.initialsEl.textContent = model.actor.initials;

    var newAvatarUrl = sanitizeImageUrl(model.actor.avatarUrl);
    if (newAvatarUrl && refs.avatarFrame.imgEl && refs.avatarFrame.imgEl.src !== newAvatarUrl) {
      refs.avatarFrame.imgEl.src = newAvatarUrl;
    }
    if (model.kind === 'gift' && model.gift && refs.giftFrame) {
      var newGiftUrl = sanitizeImageUrl(model.gift.imageUrl);
      if (newGiftUrl && refs.giftFrame.imgEl && refs.giftFrame.imgEl.src !== newGiftUrl) {
        refs.giftFrame.imgEl.src = newGiftUrl;
      }
    }
    el.setAttribute('aria-label', model.accessibility.ariaLabel);
  }

  // Only http:, https:, data:image: and blob: are ever assigned to img.src — anything else
  // (including javascript:) is treated as absent, per spec.
  function sanitizeImageUrl(url) {
    if (typeof url !== 'string') return null;
    var trimmed = url.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^data:image\//i.test(trimmed)) return trimmed;
    if (/^blob:/i.test(trimmed)) return trimmed;
    return null;
  }

  // ---- internal: animation sequencing (generation-guarded timers) ---------------------------

  function getPhaseDurations() {
    if (prefersReducedMotion()) {
      return { anticipation: 0, reveal: 16, settle: 0, exit: 16 };
    }
    return { anticipation: TIMING.anticipation, reveal: TIMING.reveal, settle: TIMING.settle, exit: TIMING.exit };
  }

  function prefersReducedMotion() {
    try {
      return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (err) {
      return false;
    }
  }

  function runEnterSequence(el, gen) {
    var durations = getPhaseDurations();
    el.classList.add('vyra-recognition-phase-anticipation');

    scheduleTimer(function () {
      if (!isCurrentGeneration(gen)) return;
      el.classList.remove('vyra-recognition-phase-anticipation');
      el.classList.add('vyra-recognition-phase-reveal');
    }, durations.anticipation, gen);

    scheduleTimer(function () {
      if (!isCurrentGeneration(gen)) return;
      el.classList.remove('vyra-recognition-phase-reveal');
      el.classList.add('vyra-recognition-phase-settle');
    }, durations.anticipation + durations.reveal, gen);

    scheduleTimer(function () {
      if (!isCurrentGeneration(gen)) return;
      el.classList.remove('vyra-recognition-phase-settle');
      el.classList.add('vyra-recognition-phase-settled');
      phase = 'visible';
      notify('enter-complete', { model: currentModel ? deepClone(currentModel) : undefined });
    }, durations.anticipation + durations.reveal + durations.settle, gen);
  }

  // Starts the exit animation on a specific element and removes it from the DOM once finished.
  // Used both by hide() (which also finalizes global state via options.onComplete) and by
  // show()'s replace path (which just needs the previous element retired, nothing else).
  function retireElement(el, gen, options) {
    options = options || {};
    var durations = getPhaseDurations();
    el.classList.add('vyra-recognition-phase-exit');
    scheduleTimer(function () {
      if (!isCurrentGeneration(gen)) return;
      if (el.parentNode) el.parentNode.removeChild(el);
      if (options.onComplete) options.onComplete();
    }, durations.exit, gen);
  }

  function scheduleTimer(fn, delayMs, gen) {
    var timerId = setTimeout(function () {
      pendingTimers.delete(timerId);
      if (gen !== generation) return; // stale — a newer show()/hide()/destroy() has since happened
      fn();
    }, delayMs);
    pendingTimers.add(timerId);
    return timerId;
  }

  function clearAllTimers() {
    pendingTimers.forEach(function (id) { clearTimeout(id); });
    pendingTimers.clear();
  }

  function isCurrentGeneration(gen) {
    return gen === generation;
  }

  // ---- notifications ---------------------------------------------------------

  function notify(type, detail) {
    var payload = Object.assign({ type: type, timestamp: Date.now() }, detail || {});
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
    try { console.debug('[recognition-card] ' + message); } catch (err) { /* no-op */ }
  }

  root.VyraRecognitionCard = Object.freeze({
    mount: mount,
    show: show,
    hide: hide,
    update: update,
    destroy: destroy,
    getState: getState,
    getElement: getElement,
    subscribe: subscribe
  });
})(typeof window !== 'undefined' ? window : globalThis);
