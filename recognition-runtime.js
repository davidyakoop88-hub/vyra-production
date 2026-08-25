// recognition-runtime.js — Recognition Engine, Standalone Recognition Runtime (Steg 9).
// Wires the finished pipeline together into one working, TikTok-agnostic whole:
//   NormalizedEvent -> Merge Engine -> Priority Queue -> Presentation Controller
//                    -> Card Mapper -> Recognition Card
// Runtime owns no rules of its own — every threshold/timing value already lives in
// recognition-rules.js and is read by the module that needs it (Merge/Queue/Controller/
// Mapper/Card); Runtime only orchestrates calls between those five modules and reacts to their
// notifications. No TikTok code, no WebSocket, no fetch, no setInterval, no requestAnimationFrame
// loop — the only timers anywhere in this pipeline live inside recognition-card.js already, for
// its own enter/exit animation phases. tick(now) is the sole, explicit, externally-driven clock.
(function (root) {
  'use strict';

  // ---- dependencies ---------------------------------------------------------

  var merge = root.VyraRecognitionMerge;
  var queue = root.VyraRecognitionQueue;
  var controller = root.VyraRecognitionController;
  var mapper = root.VyraRecognitionCardMapper;
  var card = root.VyraRecognitionCard;

  // ---- state ------------------------------------------------------------------

  var mounted = false;
  var running = false;
  var paused = false;
  var destroyed = false;

  var mergeUnsubscribe = null;
  var controllerUnsubscribe = null;
  var subscribers = [];

  var currentSimNow = Date.now();
  var controllerHandlerGuard = false;
  var collectingEnqueueResults = null; // null, or an array while flush() is actively running

  var stats = {
    pushed: 0,
    pendingMerge: 0,
    merged: 0,
    queued: 0,
    presentationsStarted: 0,
    presentationsCompleted: 0,
    presentationsSkipped: 0,
    cardsMapped: 0,
    cardsRejected: 0,
    cardErrors: 0,
    flushes: 0,
    ticks: 0,
    cleared: 0,
    errors: 0
  };

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
      stats.errors += 1;
      notify('error', { reason: 'mount() threw: ' + safeString(err && err.message) }, currentSimNow);
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  function mountInternal(target) {
    if (destroyed) return { status: 'rejected', reason: 'destroyed' };
    if (mounted) return { status: 'mounted' }; // "upprepad mount ska vara saker"
    if (!card || typeof card.mount !== 'function') return { status: 'rejected', reason: 'Recognition Card is not available' };

    var result = card.mount(target);
    if (!result || result.status !== 'mounted') {
      return { status: 'rejected', reason: (result && result.reason) || 'card mount rejected' };
    }
    ensureWired();
    mounted = true;
    notify('mount', {}, currentSimNow);
    return { status: 'mounted' };
  }

  function start() {
    try {
      startInternal();
    } catch (err) {
      stats.errors += 1;
      logDebug('start() threw: ' + safeString(err && err.message));
    }
  }

  function startInternal() {
    if (destroyed) return;
    ensureWired();
    if (running) return; // idempotent
    running = true;
    try { controller.start(); } catch (err) { stats.errors += 1; }
    notify('start', {}, currentSimNow);
  }

  // "aktuellt kort far ligga kvar enligt Controller-semantiken" — stop() never touches Card,
  // Queue, or Merge directly; it only flips running=false (so tick() starts no-oping) and
  // forwards to controller.stop(), which itself already leaves `current` exactly as-is.
  function stop() {
    try {
      stopInternal();
    } catch (err) {
      stats.errors += 1;
      logDebug('stop() threw: ' + safeString(err && err.message));
    }
  }

  function stopInternal() {
    if (destroyed || !running) return;
    running = false;
    try { controller.stop(); } catch (err) { stats.errors += 1; }
    notify('stop', {}, currentSimNow);
  }

  function pause() {
    try {
      pauseInternal();
    } catch (err) {
      stats.errors += 1;
      logDebug('pause() threw: ' + safeString(err && err.message));
    }
  }

  function pauseInternal() {
    if (destroyed || !running || paused) return;
    paused = true;
    try { controller.pause(); } catch (err) { stats.errors += 1; }
    notify('pause', {}, currentSimNow);
  }

  function resume() {
    try {
      resumeInternal();
    } catch (err) {
      stats.errors += 1;
      logDebug('resume() threw: ' + safeString(err && err.message));
    }
  }

  function resumeInternal() {
    if (destroyed || !running || !paused) return;
    paused = false;
    try { controller.resume(); } catch (err) { stats.errors += 1; }
    notify('resume', {}, currentSimNow);
    // "starta inte automatiskt nasta event forran tick() kors" — no tick() call here.
  }

  /**
   * @param {*} normalizedEvent
   * @param {number} [now]
   * @returns {{status:'queued'|'pending-merge'|'rejected'|'stopped', event?:Object, reason?:string}}
   */
  function push(normalizedEvent, now) {
    try {
      return pushInternal(normalizedEvent, now);
    } catch (err) {
      stats.errors += 1;
      notify('error', { reason: 'push() threw: ' + safeString(err && err.message) }, currentSimNow);
      return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
    }
  }

  function pushInternal(normalizedEvent, now) {
    if (destroyed) return { status: 'rejected', reason: 'destroyed' };
    ensureWired();
    var effectiveNow = resolveNow(now);
    currentSimNow = effectiveNow;
    stats.pushed += 1;

    // "Runtime far ta emot events aven nar den ar stoppad" — the recommended, implemented
    // choice: push() always forwards to Merge/Queue regardless of running/paused. Only
    // presentation (Controller.tick()) is gated on `running`. The 'stopped' status stays part
    // of the documented contract but this implementation never returns it — see the report.
    if (!merge || typeof merge.push !== 'function') {
      return { status: 'rejected', reason: 'Merge Engine is not available' };
    }

    var mergeResult;
    try {
      mergeResult = merge.push(normalizedEvent);
    } catch (err) {
      stats.errors += 1;
      var threwReason = 'merge engine threw: ' + safeString(err && err.message);
      notify('push', { event: safeCloneInput(normalizedEvent), reason: threwReason }, effectiveNow);
      return { status: 'rejected', reason: threwReason };
    }

    if (!mergeResult) {
      notify('push', { event: safeCloneInput(normalizedEvent), reason: 'no merge engine result' }, effectiveNow);
      return { status: 'rejected', reason: 'no merge engine result' };
    }

    if (mergeResult.status === 'emitted') {
      // handleMergeEmission (the merge subscription) has already synchronously enqueued this
      // exact MergedEvent as a direct side effect of the merge.push() call above.
      stats.merged += 1;
      notify('push', { event: safeCloneInput(normalizedEvent), reason: 'queued' }, effectiveNow);
      return { status: 'queued', event: deepClone(mergeResult.event) };
    }

    if (mergeResult.status === 'pending' || mergeResult.status === 'merged') {
      stats.pendingMerge += 1;
      notify('push', { event: safeCloneInput(normalizedEvent), reason: 'pending-merge' }, effectiveNow);
      notify('merge-pending', { event: safeCloneInput(normalizedEvent) }, effectiveNow);
      return { status: 'pending-merge' };
    }

    // 'duplicate' or 'rejected' — the event goes no further, per "Merge Engine reject -> eventet
    // gar inte vidare".
    var rejectReason = mergeResult.reason || ('merge status: ' + mergeResult.status);
    notify('push', { event: safeCloneInput(normalizedEvent), reason: rejectReason }, effectiveNow);
    return { status: 'rejected', reason: rejectReason };
  }

  /**
   * @param {number} [now]
   */
  function tick(now) {
    try {
      tickInternal(now);
    } catch (err) {
      stats.errors += 1;
      logDebug('tick() threw, swallowed: ' + safeString(err && err.message));
    }
  }

  function tickInternal(now) {
    stats.ticks += 1;
    if (destroyed || !running) return; // "ingen ny presentation ska starta forran Runtime startas igen"
    ensureWired();
    var effectiveNow = resolveNow(now);
    currentSimNow = effectiveNow;

    // steps 1+2: flush expired Merge aggregates with this exact `now` — handleMergeEmission
    // (wired once, below) enqueues whatever comes out as a direct synchronous side effect of
    // this very call, so there is no separate manual "enqueue the flushed array" loop here
    // (that would double-enqueue the same aggregates the subscription already handled).
    if (merge && typeof merge.flushExpired === 'function') {
      try {
        merge.flushExpired(effectiveNow);
      } catch (err) {
        stats.errors += 1;
        notify('error', { reason: 'merge.flushExpired threw during tick: ' + safeString(err && err.message) }, effectiveNow);
      }
    }

    // step 3: drive Controller — its own tick() already guarantees at most one new
    // presentation starts, and that a same-tick completion never also starts the next one
    // (verified independently in Steg 6). Reacting to whatever it notifies (steps 4-7) happens
    // synchronously inside controller.tick() via handleControllerNotification, wired below.
    if (controller && typeof controller.tick === 'function') {
      try {
        controller.tick(effectiveNow);
      } catch (err) {
        stats.errors += 1;
        notify('error', { reason: 'controller.tick threw: ' + safeString(err && err.message) }, effectiveNow);
      }
    }
  }

  /**
   * @param {number} [now]
   * @returns {Object[]} deep copies of the Queue enqueue-result objects produced by this flush
   */
  function flush(now) {
    try {
      return flushInternal(now);
    } catch (err) {
      stats.errors += 1;
      notify('error', { reason: 'flush() threw: ' + safeString(err && err.message) }, currentSimNow);
      return [];
    }
  }

  function flushInternal(now) {
    if (destroyed) return [];
    ensureWired();
    var effectiveNow = resolveNow(now);
    currentSimNow = effectiveNow;
    stats.flushes += 1;

    if (!merge || typeof merge.flushExpired !== 'function') return [];

    var collected = [];
    collectingEnqueueResults = collected;
    try {
      merge.flushExpired(effectiveNow);
    } catch (err) {
      stats.errors += 1;
      notify('error', { reason: 'merge.flushExpired threw during flush: ' + safeString(err && err.message) }, effectiveNow);
    } finally {
      collectingEnqueueResults = null;
    }

    notify('flush', {}, effectiveNow);
    return collected; // already deep copies (see handleMergeEmission)
  }

  // "Ska atersalla hela Runtime: Merge Engine pending state, Priority Queue, Controller current
  // och stats, Card Mapper stats, Recognition Card aktivt UI." Runtime's OWN cumulative stats
  // (pushed/merged/queued/...) are lifetime counters and are deliberately NOT zeroed here —
  // only `stats.cleared` increments, recording that clear() was called again. See the report.
  function clear() {
    try {
      clearInternal();
    } catch (err) {
      stats.errors += 1;
      logDebug('clear() threw: ' + safeString(err && err.message));
    }
  }

  function clearInternal() {
    if (destroyed) return;
    ensureWired();
    // controller.clear() first — its own 'clear' notification (handled below via
    // handleControllerNotification) is what hides the Card in a controlled way, before Merge/
    // Queue/Mapper state (which Card/Controller no longer reference afterward) is wiped.
    if (controller && typeof controller.clear === 'function') {
      try { controller.clear(); } catch (err) { stats.errors += 1; }
    }
    if (merge && typeof merge.clear === 'function') {
      try { merge.clear(); } catch (err) { stats.errors += 1; }
    }
    if (queue && typeof queue.clear === 'function') {
      try { queue.clear(); } catch (err) { stats.errors += 1; }
    }
    if (mapper && typeof mapper.clearStats === 'function') {
      try { mapper.clearStats(); } catch (err) { stats.errors += 1; }
    }
    stats.cleared += 1;
    notify('clear', {}, currentSimNow);
  }

  function destroy() {
    try {
      destroyInternal();
    } catch (err) {
      logDebug('destroy() threw: ' + safeString(err && err.message));
    }
  }

  function destroyInternal() {
    if (destroyed) return; // "upprepad destroy ska vara saker"

    // unsubscribe first so the cleanup calls below never re-enter Runtime's own handlers.
    if (controllerUnsubscribe) { try { controllerUnsubscribe(); } catch (err) { /* ignore */ } }
    if (mergeUnsubscribe) { try { mergeUnsubscribe(); } catch (err) { /* ignore */ } }
    controllerUnsubscribe = null;
    mergeUnsubscribe = null;

    if (card && typeof card.destroy === 'function') {
      try { card.destroy(); } catch (err) { /* ignore */ }
    }
    if (merge && typeof merge.clear === 'function') {
      try { merge.clear(); } catch (err) { /* ignore */ }
    }
    if (queue && typeof queue.clear === 'function') {
      try { queue.clear(); } catch (err) { /* ignore */ }
    }
    if (controller && typeof controller.clear === 'function') {
      try { controller.clear(); } catch (err) { /* ignore */ }
    }

    destroyed = true;
    running = false;
    paused = false;
    mounted = false;
    notify('destroy', {}, currentSimNow);
    subscribers = []; // "rensa Runtime subscribers"
  }

  function getState() {
    return deepClone({
      mounted: mounted,
      running: running,
      paused: paused,
      destroyed: destroyed,
      status: computeStatus(),
      merge: safeCallStats(merge),
      queue: safeCallStats(queue),
      controller: safeCallGetState(controller),
      card: safeCallGetState(card)
    });
  }

  function getStats() {
    return {
      pushed: stats.pushed,
      pendingMerge: stats.pendingMerge,
      merged: stats.merged,
      queued: stats.queued,
      presentationsStarted: stats.presentationsStarted,
      presentationsCompleted: stats.presentationsCompleted,
      presentationsSkipped: stats.presentationsSkipped,
      cardsMapped: stats.cardsMapped,
      cardsRejected: stats.cardsRejected,
      cardErrors: stats.cardErrors,
      flushes: stats.flushes,
      ticks: stats.ticks,
      cleared: stats.cleared,
      errors: stats.errors,
      running: running,
      paused: paused,
      destroyed: destroyed
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

  // ---- internal: wiring to Merge / Controller -----------------------------------------------

  function ensureWired() {
    if (destroyed) return;
    if (!mergeUnsubscribe && merge && typeof merge.subscribe === 'function') {
      mergeUnsubscribe = merge.subscribe(handleMergeEmission);
    }
    if (!controllerUnsubscribe && controller && typeof controller.subscribe === 'function') {
      controllerUnsubscribe = controller.subscribe(handleControllerNotification);
    }
  }

  // Fires for every MergedEvent Merge Engine ever emits — immediate kinds (join/follow/share),
  // a window-expired aggregate silently retired during push()'s replace path, or anything
  // flushExpired() sweeps. This single handler is the entire "enqueue in Priority Queue" step,
  // covering both push()'s "Merge Engine direkt producerar ett MergedEvent" case and tick()'s/
  // flush()'s "Enqueue alla MergedEvents fran flush" case with one piece of code.
  function handleMergeEmission(mergedEvent) {
    if (!queue || typeof queue.enqueue !== 'function') return;
    var enqueueResult;
    try {
      enqueueResult = queue.enqueue(mergedEvent);
    } catch (err) {
      stats.errors += 1;
      notify('error', { reason: 'queue.enqueue threw: ' + safeString(err && err.message) }, currentSimNow);
      return;
    }
    if (enqueueResult && (enqueueResult.status === 'enqueued' || enqueueResult.status === 'replaced')) {
      stats.queued += 1;
      notify('enqueue', { event: deepClone(mergedEvent) }, currentSimNow);
    }
    // "Queue reject -> Controller paverkas inte" — a 'dropped'/'rejected' outcome here simply
    // means this aggregate never reaches the Queue; nothing else needs to react.
    if (collectingEnqueueResults) collectingEnqueueResults.push(deepClone(enqueueResult || { status: 'rejected', reason: 'no result' }));
  }

  // Fires for every notification Controller emits. Runtime only acts on the five types it
  // subscribes to conceptually (presentation-start/complete/skip, clear, stop); everything else
  // is ignored. `controllerHandlerGuard` prevents a notification triggered AS A DIRECT SIDE
  // EFFECT of handling an earlier one (e.g. calling controller.skipCurrent() from inside
  // presentation-start handling, which itself synchronously fires presentation-skip) from being
  // processed a second time through this same switch — the outer handler already did the
  // necessary work (see safeSkipCurrent), so the nested, re-entrant call is a deliberate no-op.
  function handleControllerNotification(notification) {
    if (controllerHandlerGuard) return;
    controllerHandlerGuard = true;
    try {
      switch (notification.type) {
        case 'presentation-start':
          handlePresentationStart(notification.presentation);
          break;
        case 'presentation-complete':
          stats.presentationsCompleted += 1;
          handleCardHide('completed');
          break;
        case 'presentation-skip':
          stats.presentationsSkipped += 1;
          handleCardHide(notification.reason || 'skipped');
          break;
        case 'clear':
          handleCardHide('clear');
          break;
        case 'stop':
          // "aktuellt kort far ligga kvar enligt Controller-semantiken" — no UI action here.
          break;
        default:
          break;
      }
    } catch (err) {
      stats.errors += 1;
      notify('error', { reason: 'controller notification handling threw: ' + safeString(err && err.message) }, currentSimNow);
    } finally {
      controllerHandlerGuard = false;
    }
  }

  function handlePresentationStart(presentation) {
    stats.presentationsStarted += 1;

    if (!mapper || typeof mapper.map !== 'function') {
      stats.errors += 1;
      stats.cardsRejected += 1;
      notify('error', { reason: 'Card Mapper is not available' }, currentSimNow);
      safeSkipCurrent('mapper-unavailable');
      return;
    }

    var mapped;
    try {
      mapped = mapper.map(presentation);
    } catch (err) {
      stats.errors += 1;
      stats.cardsRejected += 1;
      notify('error', { reason: 'mapper.map threw: ' + safeString(err && err.message) }, currentSimNow);
      safeSkipCurrent('mapper-error');
      return;
    }

    if (!mapped || mapped.status !== 'mapped') {
      // "Mapper reject -> rakna runtime error, skip current presentation pa ett sakert satt"
      stats.errors += 1;
      stats.cardsRejected += 1;
      notify('error', { reason: 'mapper rejected presentation: ' + safeString(mapped && mapped.reason) }, currentSimNow);
      safeSkipCurrent('mapper-rejected');
      return;
    }

    stats.cardsMapped += 1;
    notify('presentation-start', { presentation: deepClone(presentation), model: deepClone(mapped.model) }, currentSimNow);

    if (!card || typeof card.show !== 'function') {
      stats.errors += 1;
      stats.cardErrors += 1;
      notify('error', { reason: 'Recognition Card is not available' }, currentSimNow);
      safeSkipCurrent('card-unavailable');
      return;
    }

    var showResult;
    try {
      showResult = card.show(mapped.model);
    } catch (err) {
      stats.errors += 1;
      stats.cardErrors += 1;
      notify('error', { reason: 'card.show threw: ' + safeString(err && err.message) }, currentSimNow);
      safeSkipCurrent('card-error');
      return;
    }

    if (!showResult || (showResult.status !== 'shown' && showResult.status !== 'replaced')) {
      // "Card.show reject -> registrera error och skippa current sakert"
      stats.errors += 1;
      stats.cardErrors += 1;
      notify('error', { reason: 'card.show rejected: ' + safeString(showResult && showResult.reason) }, currentSimNow);
      safeSkipCurrent('card-rejected');
      return;
    }

    notify('card-show', { model: deepClone(mapped.model) }, currentSimNow);
  }

  // Used whenever a presentation must be abandoned safely (mapper/card unavailable, threw, or
  // rejected). Calls controller.skipCurrent() so Controller's own state/stats stay accurate,
  // AND directly hides the Card here rather than relying on the resulting (guard-suppressed)
  // nested presentation-skip notification — see handleControllerNotification's comment.
  function safeSkipCurrent(reason) {
    if (controller && typeof controller.skipCurrent === 'function') {
      try { controller.skipCurrent(reason); } catch (err) { stats.errors += 1; }
    }
    handleCardHide(reason);
  }

  function handleCardHide(reason) {
    if (!card || typeof card.hide !== 'function') return;
    try {
      card.hide(reason);
      notify('card-hide', { reason: reason }, currentSimNow);
    } catch (err) {
      stats.errors += 1;
      notify('error', { reason: 'card.hide threw: ' + safeString(err && err.message) }, currentSimNow);
    }
  }

  // ---- internal: state derivation ---------------------------------------------------

  function computeStatus() {
    if (destroyed) return 'destroyed';
    if (!mounted) return 'unmounted';
    if (!running) return 'stopped';
    if (paused) return 'paused';
    try {
      var controllerState = controller.getState();
      return controllerState && controllerState.status === 'presenting' ? 'presenting' : 'idle';
    } catch (err) {
      return 'idle';
    }
  }

  function safeCallStats(moduleNs) {
    try {
      return (moduleNs && typeof moduleNs.getStats === 'function') ? moduleNs.getStats() : {};
    } catch (err) {
      return {};
    }
  }

  function safeCallGetState(moduleNs) {
    try {
      return (moduleNs && typeof moduleNs.getState === 'function') ? moduleNs.getState() : {};
    } catch (err) {
      return {};
    }
  }

  // ---- notifications ---------------------------------------------------------

  function notify(type, detail, timestampOverride) {
    var timestamp = (typeof timestampOverride === 'number' && isFinite(timestampOverride)) ? timestampOverride : Date.now();
    var payload = Object.assign({ type: type, timestamp: timestamp }, detail || {});
    subscribers.slice().forEach(function (fn) {
      try {
        fn(deepClone(payload));
      } catch (err) {
        logDebug('subscriber threw: ' + safeString(err && err.message));
      }
    });
  }

  // ---- helpers ---------------------------------------------------------------

  function resolveNow(now) {
    return (typeof now === 'number' && isFinite(now)) ? now : Date.now();
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeCloneInput(value) {
    try { return deepClone(value); } catch (err) { return null; }
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
    try { console.debug('[recognition-runtime] ' + message); } catch (err) { /* no-op */ }
  }

  root.VyraRecognitionRuntime = Object.freeze({
    mount: mount,
    start: start,
    stop: stop,
    pause: pause,
    resume: resume,
    push: push,
    tick: tick,
    flush: flush,
    clear: clear,
    destroy: destroy,
    getState: getState,
    getStats: getStats,
    subscribe: subscribe
  });

  // NY SANDNING => koerna toms. clear() ar redan pipelinens egen nollstallning (controller, merge
  // och queue i den ordningen) och raknas i `stats.cleared` — inget nytt maskineri behovs. Ett kort
  // som byggts av den forra sandningens handelser far aldrig visas i den nya.
  if (root && typeof root.addEventListener === 'function') {
    root.addEventListener('vyra-live-session', function (event) {
      if (!event || !event.detail || event.detail.event !== 'live:start') return;
      try { clear() } catch (err) {}
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
