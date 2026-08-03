// One browser source must handle each event exactly once, and it has three ways of receiving the
// same one: the /api/events history fetch, the SSE stream, and — for battle events — a cross-tab
// localStorage route. Nothing checked, so the overlap was counted twice, and because record() writes
// into localStorage day buckets that survive reloads, a desktop reload used to add the entire
// rolling buffer to Today/Week/Month all over again.
//
// The gate is deliberately per browsing context. Two OBS browser sources are two independent
// counters and both must see the event; deduplicating globally would leave one of them showing
// nothing. sessionStorage is exactly that scope — per tab, surviving reload, not shared.
//
// It is also per stream. A tab keeps its sessionStorage when the streamer switches overlay or
// workspace, and the new stream's Redis ids start wherever its own stream does — so a shared key
// would carry the old high-water into a stream that has never seen it and drop everything as stale.
//
// Above all it fails open. Storage that throws, a corrupt payload, a stream that was recreated
// underneath us: every one of those degrades to "count a duplicate", never to "show nothing". A
// blind overlay produces no error anywhere; it just stops moving in front of an audience.
(function (root) {
  'use strict';

  const RING = 512;
  // Redis stream ids are "<milliseconds>-<sequence>" and are monotonic per workspace, so they get a
  // high-water mark: one comparison, no memory. Every other id shape — the bridge's own event key, a
  // UUID, anything a future producer invents — is a set membership test. Comparing those
  // lexicographically would silently drop half the traffic from any producer whose ids do not sort.
  const STREAM_ID = /^(\d+)-(\d+)$/;
  // A recreated stream (Redis flushed, workspace re-provisioned) starts below the stored high-water,
  // and every event then looks stale. After this many consecutive rejects the gate concludes the
  // stream is not the one it remembers and follows the new one. High enough that ordinary replay
  // after a reconnect — bounded by the server at 250 events — cannot reach it.
  const STALE_RUN_BEFORE_RESET = 100;

  // The namespace never contains a credential. A workspace or overlay id is not one and is used
  // verbatim, which keeps the stored key readable while debugging. An access token is, so it is
  // reduced to a FNV-1a digest first: not reversible, stable for the same token, and different for
  // different tokens. It is not collision-resistant in the cryptographic sense, and it does not have
  // to be — a collision would mean two overlays sharing a counter, not a token being recovered.
  function namespace(seed, options) {
    const raw = seed === undefined || seed === null ? '' : String(seed);
    if (!raw) return 'anon';
    if (options && options.sensitive === false) return raw;
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < raw.length; i += 1) {
      const c = raw.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
    }
    return 'h' + h1.toString(36) + h2.toString(36);
  }

  // Storage access itself throws in a browser with storage disabled, so even reading the property is
  // wrapped. A gate with no usable storage still deduplicates in memory for the life of the page.
  function safeGet(storage, key) {
    try { return storage && typeof storage.getItem === 'function' ? storage.getItem(key) : null }
    catch (_) { return null }
  }
  function safeSet(storage, key, value) {
    try { if (storage && typeof storage.setItem === 'function') storage.setItem(key, value) }
    catch (_) {}
  }

  function create(storage, keyPrefix, ns) {
    const key = String(keyPrefix || 'vyra-seen-events') + ':' + (ns || 'anon');
    let high = null;       // [milliseconds, sequence] of the newest stream id handled
    let ids = [];          // ring of non-stream ids, newest last
    let seen = new Set();
    let staleRun = 0;

    try {
      const saved = JSON.parse(safeGet(storage, key) || '{}');
      if (saved && Array.isArray(saved.ids)) {
        ids = saved.ids.filter(id => typeof id === 'string').slice(-RING);
        seen = new Set(ids);
      }
      if (saved && Array.isArray(saved.high) && saved.high.length === 2) {
        const ms = Number(saved.high[0]), seq = Number(saved.high[1]);
        if (Number.isFinite(ms) && Number.isFinite(seq)) high = [ms, seq];
      }
    } catch (_) {
      // Corrupt payload: remember nothing rather than refuse everything.
    }

    function persist() { safeSet(storage, key, JSON.stringify({ ids, high })); }

    // true  = this event has not been handled in this source yet; process it.
    // false = already handled; drop it before any consumer sees it.
    function accept(id) {
      // No usable id — missing, empty, or a falsy malformed value such as 0 or false. It cannot be
      // deduplicated, and collapsing every id-less event onto one key would drop all but the first,
      // which is worse than counting a duplicate. Always handled.
      const raw = id ? String(id) : '';
      if (!raw) return true;

      const stream = STREAM_ID.exec(raw);
      if (stream) {
        const ms = Number(stream[1]), seq = Number(stream[2]);
        // Numeric, not string: '9-0' is older than '10-0', which a string compare gets backwards.
        if (high && (ms < high[0] || (ms === high[0] && seq <= high[1]))) {
          staleRun += 1;
          if (staleRun < STALE_RUN_BEFORE_RESET) return false;
          // Everything we are being sent is older than what we remember: this is a different stream.
          high = null;
        }
        staleRun = 0;
        high = [ms, seq];
        persist();
        return true;
      }

      if (seen.has(raw)) return false;
      seen.add(raw);
      ids.push(raw);
      // The ring and the set are one structure: an id dropped from the ring has to leave the set as
      // well, or memory grows without bound behind a cap that looks like it is working.
      if (ids.length > RING) ids.splice(0, ids.length - RING).forEach(old => seen.delete(old));
      persist();
      return true;
    }

    return { accept, namespace: ns, size: () => seen.size };
  }

  root.VyraDedupe = { create, namespace, RING };

  if (typeof module === 'object' && module.exports) module.exports = root.VyraDedupe;
})(typeof window !== 'undefined' ? window : globalThis);
