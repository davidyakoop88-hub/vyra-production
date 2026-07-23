// recognition-controller.js — Recognition Engine, Recognition Controller (Steg 6).
// Sits between Priority Queue and Card Mapper/Recognition Card in the pipeline:
//   Merge Engine -> Priority Queue -> Recognition Controller -> Card Mapper -> Recognition Card
// Pulls finished MergedEvent from Queue.dequeueNext(), tracks exactly one active
// CurrentPresentation at a time, and notifies subscribers of lifecycle events. No DOM, no UI,
// no animation, no Card Mapper logic, and no timers (setTimeout/setInterval/
// requestAnimationFrame) anywhere — advancing state only ever happens inside tick(now), which
// callers are expected to invoke themselves (e.g. from a real rAF loop elsewhere, out of this
// file's scope).
// Depends on window.VyraRecognitionQueue (dequeueNext) and window.VyraRecognitionRules
// (presentationMs, priority.giftThresholds) — no direct dependency on Merge Engine at all.
// Silent unless a caller opts into dev-mode logging the same way every other Recognition
// Engine file does (?recognitiondebug=1 in the browser, always-on under Node).
(function (root) {
  'use strict';

  var Types = root.VyraRecognitionTypes || {};
  var Rules = root.VyraRecognitionRules || {};
  var VALID_KINDS = Types.RECOGNITION_EVENT_KINDS || ['join', 'follow', 'share', 'like', 'gift'];
  var PRESENTATION_MS = Rules.presentationMs || { join: 2500, like: 3000, share: 3500, follow: 4000, giftSmall: 4500, giftMedium: 5500, giftLarge: 7000 };
  var GIFT_THRESHOLDS = (Rules.priority && Rules.priority.giftThresholds) || { small: 100, medium: 1000 };

  // ---- state ------------------------------------------------------------------
  // In-memory only, scoped to this module's closure — matches recognition-merge.js and
  // recognition-queue.js's own scope decisions (no persistence, no survive-reload need).

  var running = false;
  var paused = false;
  var pausedAt = null;      // Date.now() at the moment pause() was called, or null
  var current = null;       // CurrentPresentation | null
  var subscribers = [];
  var presentationCounter = 0;

  var stats = {
    started: 0,
    completed: 0,
    skipped: 0,
    ticks: 0,
    errors: 0
  };

  // ---- public API ---------------------------------------------------------------

  function start() {
    if (running) return; // "upprepad start ska vara saker" — idempotent, no duplicate notify
    running = true;
    paused = false;
    pausedAt = null;
    notify('start', {});
  }

  // "current ska som standard ligga kvar men inte fortsatta" — stop() deliberately does not
  // touch `current` at all. A presentation already showing when stop() is called stays exactly
  // as it was; it simply never advances again because tick() no-ops while !running. This is a
  // deliberate design choice (not an oversight): stopping the Controller is meant to freeze
  // whatever is currently visible rather than yank it away, leaving that decision (e.g. clear()
  // or completeCurrent()) to the caller.
  function stop() {
    if (!running) return;
    running = false;
    notify('stop', {});
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
    if (!running || paused) return; // rule 2

    var effectiveNow = resolveNow(now);

    // rule 3: complete an expired current, then STOP for this call — the next event only
    // starts on a later, separate tick() call (see recognition-verify.js Controller test 7,
    // the deciding evidence for this "if / else-if", not "if / then also if", reading of the
    // spec's numbered steps).
    if (current && effectiveNow >= current.endsAt) {
      completeCurrentInternal(undefined, effectiveNow);
      return;
    }

    // rule 4 + 5: at most one new presentation starts per tick, and only when current is empty.
    if (!current) {
      startNextFromQueue(effectiveNow);
    }
  }

  /**
   * @param {*} [result]
   * @returns {?import('./recognition-types.js').CurrentPresentation}
   */
  function completeCurrent(result) {
    try {
      return completeCurrentInternal(result, Date.now());
    } catch (err) {
      stats.errors += 1;
      logDebug('completeCurrent() threw: ' + safeString(err && err.message));
      return null;
    }
  }

  /**
   * @param {string} [reason]
   * @returns {?import('./recognition-types.js').CurrentPresentation}
   */
  function skipCurrent(reason) {
    try {
      return skipCurrentInternal(reason, Date.now());
    } catch (err) {
      stats.errors += 1;
      logDebug('skipCurrent() threw: ' + safeString(err && err.message));
      return null;
    }
  }

  // "pausar inte Queue automatiskt" — no call to VyraRecognitionQueue.pause() here; that is a
  // separate, independent decision left to whatever composes Queue + Controller together.
  function pause() {
    if (paused) return;
    paused = true;
    pausedAt = Date.now();
    notify('pause', {});
  }

  // "justera endsAt med pausens langd sa att presentationen inte forkortas" — extends the
  // active presentation's endsAt by exactly how long pause() -> resume() took in real time, so
  // tick() sees the same remaining duration it would have if no pause had happened at all.
  function resume() {
    if (!paused) return;
    var resumedAt = Date.now();
    var pauseDurationMs = resumedAt - (typeof pausedAt === 'number' ? pausedAt : resumedAt);
    paused = false;
    pausedAt = null;
    if (current) current.endsAt += pauseDurationMs;
    notify('resume', {});
    // "om ingen current finns atergar state till idle" — automatic via computeStatus().
  }

  function isRunning() {
    return running;
  }

  function isPaused() {
    return paused;
  }

  function getCurrent() {
    return current ? deepClone(current) : null;
  }

  function getState() {
    return deepClone({
      status: computeStatus(),
      running: running,
      paused: paused,
      current: current
    });
  }

  function getStats() {
    return {
      started: stats.started,
      completed: stats.completed,
      skipped: stats.skipped,
      ticks: stats.ticks,
      errors: stats.errors,
      running: running,
      paused: paused,
      hasCurrent: current !== null
    };
  }

  // "rensar current, nollstaller controller-stats, ska inte tomma Priority Queue" — no call to
  // VyraRecognitionQueue.clear() anywhere in this function. Also resets paused/pausedAt so the
  // documented outcome ("state ska bli idle om Controller kor, annars stopped") is always
  // exactly one of those two values, never 'paused'.
  function clear() {
    current = null;
    paused = false;
    pausedAt = null;
    stats.started = 0;
    stats.completed = 0;
    stats.skipped = 0;
    stats.ticks = 0;
    stats.errors = 0;
    notify('clear', {});
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function unsubscribe() {};
    subscribers.push(fn);
    return function unsubscribe() {
      var idx = subscribers.indexOf(fn);
      if (idx !== -1) subscribers.splice(idx, 1);
    };
  }

  // ---- internal: presentation lifecycle ---------------------------------------------------

  function startNextFromQueue(now) {
    var queue = root.VyraRecognitionQueue;
    if (!queue || typeof queue.dequeueNext !== 'function') return; // no Queue available — nothing to do, never throw

    var nextEvent;
    try {
      nextEvent = queue.dequeueNext(now);
    } catch (err) {
      stats.errors += 1;
      logDebug('Queue.dequeueNext threw: ' + safeString(err && err.message));
      return;
    }

    if (!nextEvent) return; // "hantera null ... fran Queue utan att krascha"

    var validation = validateMergedEventShape(nextEvent);
    if (!validation.ok) {
      stats.errors += 1;
      logDebug('discarded invalid event from Queue: ' + validation.reason);
      return; // "okand event-kind ska inte startas"
    }

    var durationMs = computeDurationMs(nextEvent);
    if (typeof durationMs !== 'number' || !isFinite(durationMs) || durationMs <= 0) {
      stats.errors += 1;
      logDebug('computed non-positive/invalid durationMs for kind ' + safeString(nextEvent.kind) + ', event discarded');
      return;
    }

    presentationCounter += 1;
    var presentation = {
      id: generateLocalId(),
      event: deepClone(nextEvent),
      startedAt: now,
      durationMs: durationMs,
      endsAt: now + durationMs,
      status: 'presenting'
    };
    current = presentation;
    stats.started += 1;
    notify('presentation-start', { presentation: deepClone(presentation) }, now);
  }

  function completeCurrentInternal(result, now) {
    if (!current) return null;
    var finished = current;
    finished.status = 'completed';
    current = null;
    stats.completed += 1;
    var detail = { presentation: deepClone(finished) };
    if (result !== undefined) detail.result = result;
    notify('presentation-complete', detail, now);
    return deepClone(finished);
  }

  function skipCurrentInternal(reason, now) {
    if (!current) return null;
    var finished = current;
    finished.status = 'skipped';
    current = null;
    stats.skipped += 1;
    var detail = { presentation: deepClone(finished) };
    if (reason !== undefined) detail.reason = reason;
    notify('presentation-skip', detail, now);
    return deepClone(finished);
  }

  // ---- internal: duration / gift classification ---------------------------------------------

  // "gift-event ska klassificeras enligt samma giftgranser som Queue" — reads the exact same
  // Rules.priority.giftThresholds recognition-queue.js reads, rather than a second, potentially
  // divergent copy of the small/medium/large boundaries.
  function computeDurationMs(event) {
    if (event.kind === 'gift') {
      var coins = (typeof event.coins === 'number' && isFinite(event.coins)) ? event.coins : 0;
      if (coins >= GIFT_THRESHOLDS.medium) return PRESENTATION_MS.giftLarge;
      if (coins >= GIFT_THRESHOLDS.small) return PRESENTATION_MS.giftMedium;
      return PRESENTATION_MS.giftSmall;
    }
    var base = PRESENTATION_MS[event.kind];
    return typeof base === 'number' ? base : NaN;
  }

  function computeStatus() {
    if (!running) return 'stopped';
    if (paused) return 'paused';
    if (current) return 'presenting';
    return 'idle';
  }

  // ---- validation (mirrors recognition-queue.js's own MergedEvent shape check) ---------------

  function validateMergedEventShape(value) {
    if (!value || typeof value !== 'object') return { ok: false, reason: 'not an object' };
    if (typeof value.id !== 'string' || value.id.trim() === '') return { ok: false, reason: 'missing/invalid id' };
    if (VALID_KINDS.indexOf(value.kind) === -1) return { ok: false, reason: 'unknown kind: ' + safeString(value.kind) };

    var actor = value.actor;
    if (!actor || typeof actor !== 'object') return { ok: false, reason: 'missing actor' };
    if (typeof actor.id !== 'string' || actor.id === '') return { ok: false, reason: 'missing actor.id' };
    if (typeof actor.displayName !== 'string' || actor.displayName === '') return { ok: false, reason: 'missing actor.displayName' };

    if (value.kind === 'gift' && value.gift === null) return { ok: false, reason: 'gift kind requires gift data' };
    if (value.gift !== null && (typeof value.gift !== 'object')) return { ok: false, reason: 'gift must be an object or null' };

    if (typeof value.coins !== 'number' || !isFinite(value.coins)) return { ok: false, reason: 'coins must be a finite number' };
    if (typeof value.timestamp !== 'number' || !isFinite(value.timestamp)) return { ok: false, reason: 'timestamp must be a finite number' };
    if (typeof value.mergeKey !== 'string' || value.mergeKey === '') return { ok: false, reason: 'missing mergeKey' };

    return { ok: true };
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

  function generateLocalId() {
    return 'pres_' + Date.now().toString(36) + '_' + presentationCounter.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
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
    try { console.debug('[recognition-controller] ' + message); } catch (err) { /* no-op */ }
  }

  root.VyraRecognitionController = Object.freeze({
    start: start,
    stop: stop,
    tick: tick,
    completeCurrent: completeCurrent,
    skipCurrent: skipCurrent,
    pause: pause,
    resume: resume,
    isRunning: isRunning,
    isPaused: isPaused,
    getCurrent: getCurrent,
    getState: getState,
    getStats: getStats,
    clear: clear,
    subscribe: subscribe
  });
})(typeof window !== 'undefined' ? window : globalThis);
