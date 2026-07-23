// recognition-adapter.js — Recognition Engine, generic live event adapter contract (Roadmap
// Phase 3). Provides a provider-agnostic connect/disconnect/event-envelope boundary that a
// future provider-specific file (e.g. tiktok-live-adapter.js, Phase 4) plugs into via
// registerProvider(). Nothing in this file knows about TikTok, Twitch, YouTube, or any other
// single platform — it only knows about "a provider" as an opaque, registered factory.
//
// Unlike the rest of the Recognition Engine (one shared singleton per file), this module is a
// FACTORY: create() returns a brand-new, independent adapter instance every call, since a real
// application may need more than one live connection at once (or, in tests, many disposable
// instances). Each instance owns its own state closure — nothing is shared between instances
// except the module-level provider registry.
//
// This file never touches the DOM, never references window.VyraRecognitionRuntime or
// window.VyraRecognitionCard, and never interprets a provider's raw event payload — turning a
// payload into a NormalizedEvent and pushing it into the Recognition Runtime is the caller's
// job (demonstrated only in recognition-adapter-demo.html's own script, not in this file).
//
// The one timer this file uses is a single, explicit, cancellable setTimeout per adapter
// instance for its own bounded-backoff reconnect policy (opt-in, disabled by default) — this
// is a real async-I/O concern (bounded reconnection), not a hidden render/animation loop, and
// is always stored in `reconnectTimer` so cancelReconnect()/disconnect()/destroy() can clear it.
(function (root) {
  'use strict';

  var providers = {}; // name -> factory(options) => AdapterProviderImpl

  // ---- module-level API ---------------------------------------------------------

  function registerProvider(name, factory) {
    if (typeof name !== 'string' || name.length === 0 || typeof factory !== 'function') return false;
    providers[name] = factory;
    return true;
  }

  function getProviders() {
    return Object.keys(providers);
  }

  function create(providerName, options) {
    if (typeof providerName !== 'string' || providerName.length === 0) return null;
    var factory = providers[providerName];
    if (typeof factory !== 'function') return null;

    var providerImpl;
    try {
      providerImpl = factory(options || {});
    } catch (err) {
      return null; // a throwing factory means the provider itself is misconfigured — no instance
    }
    if (!providerImpl || typeof providerImpl.connect !== 'function' || typeof providerImpl.disconnect !== 'function') {
      return null;
    }

    return createInstance(providerName, providerImpl, options || {});
  }

  // ---- instance factory ---------------------------------------------------------

  function createInstance(providerName, providerImpl, options) {
    var connectionState = 'idle';
    var connectionId = null;
    var lastError = null;
    var lastConnectedAt = null;
    var lastDisconnectedAt = null;
    var reconnectAttempt = 0;
    var reconnectTimer = null;
    var destroyed = false;
    var subscribers = [];
    var connectGeneration = 0; // invalidates stale async connect()/disconnect() callbacks after destroy/reconnect

    var reconnectPolicy = normalizeReconnectPolicy(options.reconnect);

    var stats = {
      connectAttempts: 0,
      connectSuccesses: 0,
      connectFailures: 0,
      disconnects: 0,
      eventsReceived: 0,
      eventsRejected: 0,
      errors: 0,
      reconnectsScheduled: 0,
      reconnectsAttempted: 0
    };

    function connect() {
      try {
        return connectInternal();
      } catch (err) {
        stats.errors += 1;
        notify('error', { reason: 'connect() threw: ' + safeString(err && err.message) });
        return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
      }
    }

    function connectInternal() {
      if (destroyed) return { status: 'rejected', reason: 'destroyed' };
      if (connectionState === 'connected') return { status: 'already-connected' };
      if (connectionState === 'connecting') return { status: 'already-connecting' };

      cancelReconnectTimer();
      connectionState = 'connecting';
      connectionId = generateLocalId('conn');
      lastError = null;
      stats.connectAttempts += 1;
      var myGeneration = ++connectGeneration;
      notify('connect-attempt', { reason: providerName });

      var context = {
        emit: function (providerEvent, payload, now) {
          if (myGeneration !== connectGeneration) return; // stale provider, ignore
          handleProviderEvent(providerEvent, payload, now);
        },
        reportError: function (message) {
          if (myGeneration !== connectGeneration) return;
          handleProviderError(message);
        },
        reportUnexpectedDisconnect: function () {
          if (myGeneration !== connectGeneration) return;
          handleUnexpectedDisconnect();
        }
      };

      var result;
      try {
        result = providerImpl.connect(context);
      } catch (err) {
        markConnectFailure('provider connect() threw: ' + safeString(err && err.message), myGeneration);
        return { status: 'connecting' };
      }

      if (result && typeof result.then === 'function') {
        result.then(
          function () { if (myGeneration === connectGeneration) markConnectSuccess(myGeneration); },
          function (err) { markConnectFailure('provider connect() rejected: ' + safeString(err && err.message), myGeneration); }
        );
      } else {
        markConnectSuccess(myGeneration);
      }

      return { status: 'connecting' };
    }

    function markConnectSuccess(generation) {
      if (generation !== connectGeneration || destroyed) return;
      connectionState = 'connected';
      lastConnectedAt = Date.now();
      reconnectAttempt = 0;
      stats.connectSuccesses += 1;
      notify('connected', {});
    }

    function markConnectFailure(reason, generation) {
      if (generation !== connectGeneration || destroyed) return;
      connectionState = 'error';
      lastError = reason;
      stats.connectFailures += 1;
      stats.errors += 1;
      notify('connect-failed', { reason: reason });
      scheduleReconnect();
    }

    function disconnect() {
      try {
        return disconnectInternal();
      } catch (err) {
        stats.errors += 1;
        notify('error', { reason: 'disconnect() threw: ' + safeString(err && err.message) });
        return { status: 'rejected', reason: 'unexpected error: ' + safeString(err && err.message) };
      }
    }

    function disconnectInternal() {
      if (destroyed) return { status: 'rejected', reason: 'destroyed' };
      cancelReconnectTimer();
      reconnectAttempt = 0; // a manual disconnect() always resets the backoff sequence
      connectGeneration += 1; // invalidate any in-flight connect() callbacks

      if (connectionState === 'idle' || connectionState === 'disconnected') {
        return { status: 'already-disconnected' };
      }

      connectionState = 'disconnecting';
      try { providerImpl.disconnect(); } catch (err) { stats.errors += 1; }
      connectionState = 'disconnected';
      lastDisconnectedAt = Date.now();
      stats.disconnects += 1;
      notify('disconnect', { reason: 'manual' });
      notify('disconnected', { reason: 'manual' });
      return { status: 'disconnected' };
    }

    function isConnected() {
      return connectionState === 'connected';
    }

    function handleProviderEvent(providerEvent, payload, now) {
      if (typeof providerEvent !== 'string' || providerEvent.length === 0) {
        stats.eventsRejected += 1;
        notify('error', { reason: 'malformed provider event: providerEvent must be a non-empty string' });
        return;
      }
      stats.eventsReceived += 1;
      var envelope = {
        provider: providerName,
        providerEvent: providerEvent,
        receivedAt: resolveNow(now),
        payload: safeCloneInput(payload),
        connectionId: connectionId
      };
      notify('event', { envelope: envelope });
    }

    function handleProviderError(message) {
      stats.errors += 1;
      lastError = safeString(message);
      notify('error', { reason: lastError });
    }

    function handleUnexpectedDisconnect() {
      if (destroyed || connectionState === 'disconnected' || connectionState === 'idle') return;
      connectionState = 'disconnected';
      lastDisconnectedAt = Date.now();
      stats.disconnects += 1;
      notify('disconnect', { reason: 'unexpected' });
      notify('disconnected', { reason: 'unexpected' });
      scheduleReconnect();
    }

    function scheduleReconnect() {
      if (destroyed || !reconnectPolicy.enabled) return;
      if (reconnectAttempt >= reconnectPolicy.maxAttempts) return;
      var delay = Math.min(reconnectPolicy.baseDelayMs * Math.pow(2, reconnectAttempt), reconnectPolicy.maxDelayMs);
      stats.reconnectsScheduled += 1;
      notify('reconnect-scheduled', { reason: 'attempt ' + (reconnectAttempt + 1) + ' in ' + delay + 'ms' });
      reconnectTimer = setTimeout(function () {
        reconnectTimer = null;
        if (destroyed) return;
        reconnectAttempt += 1;
        stats.reconnectsAttempted += 1;
        notify('reconnect-attempt', { reason: 'attempt ' + reconnectAttempt });
        connect();
      }, delay);
    }

    function cancelReconnectTimer() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function destroy() {
      try {
        destroyInternal();
      } catch (err) {
        logDebug('destroy() threw: ' + safeString(err && err.message));
      }
    }

    function destroyInternal() {
      if (destroyed) return; // repeated destroy is safe
      cancelReconnectTimer();
      connectGeneration += 1;
      if (connectionState === 'connected' || connectionState === 'connecting' || connectionState === 'disconnecting') {
        try { providerImpl.disconnect(); } catch (err) { /* ignore */ }
      }
      destroyed = true;
      connectionState = 'disconnected';
      notify('destroy', {});
      subscribers = [];
    }

    function getState() {
      return deepClone({
        provider: providerName,
        connectionId: connectionId,
        connectionState: connectionState,
        connected: isConnected(),
        lastError: lastError,
        lastConnectedAt: lastConnectedAt,
        lastDisconnectedAt: lastDisconnectedAt,
        reconnectAttempt: reconnectAttempt,
        reconnectScheduled: !!reconnectTimer,
        destroyed: destroyed
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

    return Object.freeze({
      connect: connect,
      disconnect: disconnect,
      isConnected: isConnected,
      getState: getState,
      getStats: getStats,
      subscribe: subscribe,
      destroy: destroy
    });
  }

  // ---- shared helpers ---------------------------------------------------------

  var localIdCounter = 0;
  function generateLocalId(prefix) {
    localIdCounter += 1;
    return prefix + '_' + Date.now().toString(36) + '_' + localIdCounter.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function normalizeReconnectPolicy(policy) {
    var p = (policy && typeof policy === 'object') ? policy : {};
    return {
      enabled: !!p.enabled,
      baseDelayMs: (typeof p.baseDelayMs === 'number' && p.baseDelayMs > 0) ? p.baseDelayMs : 1000,
      maxDelayMs: (typeof p.maxDelayMs === 'number' && p.maxDelayMs > 0) ? p.maxDelayMs : 30000,
      maxAttempts: (typeof p.maxAttempts === 'number' && p.maxAttempts >= 0) ? p.maxAttempts : 5
    };
  }

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
    try { console.debug('[recognition-adapter] ' + message); } catch (err) { /* no-op */ }
  }

  root.VyraRecognitionAdapter = Object.freeze({
    create: create,
    registerProvider: registerProvider,
    getProviders: getProviders
  });
})(typeof window !== 'undefined' ? window : globalThis);
