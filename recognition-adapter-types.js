// recognition-adapter-types.js — Recognition Engine, generic live-event adapter contracts
// (Roadmap Phase 3). No DOM access, no timers, no side effects beyond registering
// window.VyraRecognitionAdapterTypes. Every provider adapter (TikTok, or any future platform)
// speaks this contract; nothing in this file or in recognition-adapter.js may contain
// TikTok-specific (or any other single-provider) field names, payload shapes, or logic — that
// belongs in a provider-specific file such as the future tiktok-live-adapter.js (Phase 4).
(function (root) {
  'use strict';

  var ADAPTER_CONNECTION_STATES = Object.freeze([
    'idle', 'connecting', 'connected', 'disconnecting', 'disconnected', 'error'
  ]);

  var canonical = {
    ADAPTER_CONNECTION_STATES: ADAPTER_CONNECTION_STATES
  };

  var existing = root.VyraRecognitionAdapterTypes;
  var next = (existing && typeof existing === 'object')
    ? Object.assign({}, existing, canonical)
    : canonical;

  root.VyraRecognitionAdapterTypes = Object.freeze(next);
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * @typedef {'idle'|'connecting'|'connected'|'disconnecting'|'disconnected'|'error'} AdapterConnectionState
 * One of window.VyraRecognitionAdapterTypes.ADAPTER_CONNECTION_STATES.
 */

/**
 * The ONE shape every raw provider event is wrapped into before any subscriber ever sees it.
 * `payload` is intentionally opaque here — the generic adapter never interprets or reshapes
 * it; turning `payload` into a NormalizedEvent is the job of a provider-specific normalizer
 * (e.g. the future tiktok-live-normalizer.js) living downstream of this contract.
 * @typedef {Object} AdapterEventEnvelope
 * @property {string} provider
 * @property {string} providerEvent
 * @property {number} receivedAt
 * @property {*} payload
 * @property {?string} connectionId
 */

/**
 * Explicit, bounded, cancellable reconnect policy — opt-in per adapter instance. When
 * `enabled` is false (the default), an unexpected disconnect never triggers automatic
 * reconnection; the caller must call connect() again itself.
 * @typedef {Object} AdapterReconnectPolicy
 * @property {boolean} enabled
 * @property {number} baseDelayMs
 * @property {number} maxDelayMs
 * @property {number} maxAttempts
 */

/**
 * Return value of an adapter instance's getState() — always a deep copy.
 * @typedef {Object} AdapterState
 * @property {string} provider
 * @property {?string} connectionId
 * @property {AdapterConnectionState} connectionState
 * @property {boolean} connected
 * @property {?string} lastError
 * @property {?number} lastConnectedAt
 * @property {?number} lastDisconnectedAt
 * @property {number} reconnectAttempt
 * @property {boolean} reconnectScheduled
 * @property {boolean} destroyed
 */

/**
 * Return value of an adapter instance's getStats() — always a deep copy.
 * @typedef {Object} AdapterStats
 * @property {number} connectAttempts
 * @property {number} connectSuccesses
 * @property {number} connectFailures
 * @property {number} disconnects
 * @property {number} eventsReceived
 * @property {number} eventsRejected
 * @property {number} errors
 * @property {number} reconnectsScheduled
 * @property {number} reconnectsAttempted
 */

/**
 * Payload handed to an adapter instance's subscribers.
 * @typedef {Object} AdapterNotification
 * @property {'connect-attempt'|'connected'|'connect-failed'|'disconnect'|'disconnected'|'error'|'event'|'reconnect-scheduled'|'reconnect-attempt'|'destroy'} type
 * @property {number} timestamp
 * @property {?AdapterEventEnvelope} [envelope]
 * @property {?string} [reason]
 */

/**
 * The context object passed to a registered provider's connect(context, options). The
 * provider calls these to report activity back to its owning adapter instance — it never
 * touches the adapter instance's public API or any UI/Runtime code directly.
 * @typedef {Object} AdapterProviderContext
 * @property {function(string, *, number=): void} emit - (providerEvent, payload, now?)
 * @property {function(string): void} reportError
 * @property {function(): void} reportUnexpectedDisconnect
 */

/**
 * The contract a registered provider factory must implement. `registerProvider(name, factory)`
 * stores `factory`; `create(name, options)` calls `factory(options)` once to obtain this
 * object, which the adapter instance then drives via its own connect()/disconnect().
 * @typedef {Object} AdapterProviderImpl
 * @property {function(AdapterProviderContext): (void|Promise)} connect
 * @property {function(): (void|Promise)} disconnect
 */
