// One browser source must handle each event exactly once, and it has three ways of receiving the
// same one: the /api/events history fetch, the SSE stream, and — for battle events — a cross-tab
// localStorage route. Nothing checked, so the overlap was counted twice, and because record() writes
// into localStorage day buckets that survive reloads, a desktop reload used to add the entire
// rolling buffer to Today/Week/Month all over again.
//
// The gate is deliberately per browsing context. Two OBS browser sources are two independent
// counters and both must see the event; deduplicating globally would leave one of them showing
// nothing. sessionStorage is exactly that scope — per tab, surviving reload, not shared.
(function (root) {
  'use strict';

  const RING = 512;
  // Redis stream ids are "<milliseconds>-<sequence>" and are monotonic per workspace, so they get a
  // high-water mark: one comparison, no memory. Every other id shape — the bridge's own event key, a
  // UUID, anything a future producer invents — is a set membership test. Comparing those
  // lexicographically would silently drop half the traffic from any producer whose ids do not sort.
  const STREAM_ID = /^(\d+)-(\d+)$/;

  function create(storage, key) {
    let high = null;       // [milliseconds, sequence] of the newest stream id handled
    let ids = [];          // ring of non-stream ids, newest last
    let seen = new Set();

    try {
      const saved = JSON.parse((storage && storage.getItem(key)) || '{}');
      if (Array.isArray(saved.ids)) { ids = saved.ids.slice(-RING); seen = new Set(ids); }
      if (Array.isArray(saved.high) && saved.high.length === 2) {
        const ms = Number(saved.high[0]), seq = Number(saved.high[1]);
        if (Number.isFinite(ms) && Number.isFinite(seq)) high = [ms, seq];
      }
    } catch (_) {
      // A corrupt or full store must never make a source blind: it falls back to remembering
      // nothing, which double-counts at worst. Refusing events would be silent data loss.
    }

    function persist() {
      try { storage.setItem(key, JSON.stringify({ ids, high })); } catch (_) {}
    }

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
        if (high && (ms < high[0] || (ms === high[0] && seq <= high[1]))) return false;
        high = [ms, seq];
        persist();
        return true;
      }

      if (seen.has(raw)) return false;
      seen.add(raw);
      ids.push(raw);
      if (ids.length > RING) ids.splice(0, ids.length - RING).forEach(old => seen.delete(old));
      persist();
      return true;
    }

    return { accept };
  }

  root.VyraDedupe = { create, RING };

  if (typeof module === 'object' && module.exports) module.exports = root.VyraDedupe;
})(typeof window !== 'undefined' ? window : globalThis);
