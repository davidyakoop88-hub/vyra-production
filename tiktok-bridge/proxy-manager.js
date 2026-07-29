// Rotates outbound HTTP(S) proxies for the TikTok connection so a single IP isn't hammering
// TikTok's endpoints on every (re)connect — useful once you're running enough bridges/rooms that
// TikTok starts rate-limiting or blocking a shared IP (see bridge.js's PROXY_LIST wiring).
//
// PROXY_LIST format (comma-separated, no spaces required around commas):
//   http://user:pass@ip:port,http://user:pass@ip2:port2
//
// If PROXY_LIST is empty/unset, the manager is simply disabled (`enabled()` is false, `next()`
// always returns null) — bridge.js falls back to connecting with no proxy at all, i.e. dev mode.
'use strict';

const FAILED_RETRY_MS = 10 * 60 * 1000; // a failed proxy is retried automatically after 10 minutes

function parseProxyList(raw) {
  return String(raw || '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
}

// `now` is injectable (defaults to the real clock) so tests can control the 10-minute revival
// window deterministically instead of waiting on real time.
function createProxyManager(rawList = process.env.PROXY_LIST, now = () => Date.now()) {
  const proxies = parseProxyList(rawList).map(url => ({ url, failed: false, failedAt: null }));
  let cursor = -1;

  function reviveExpired() {
    const at = now();
    for (const p of proxies) {
      if (p.failed && at - p.failedAt >= FAILED_RETRY_MS) {
        p.failed = false;
        p.failedAt = null;
      }
    }
  }

  function enabled() {
    return proxies.length > 0;
  }

  // Round-robins to the next non-failed proxy, one call per TikTok connection attempt (bridge.js
  // calls this at the top of connect() — including every reconnect, so a retry never hammers the
  // same proxy twice in a row while others are available). Returns null when there's no proxy
  // list at all (dev mode) or when every proxy is currently marked failed.
  function next() {
    if (!enabled()) return null;
    reviveExpired();
    for (let i = 0; i < proxies.length; i++) {
      cursor = (cursor + 1) % proxies.length;
      if (!proxies[cursor].failed) return proxies[cursor].url;
    }
    return null;
  }

  function markFailed(url) {
    const proxy = proxies.find(p => p.url === url);
    if (proxy) { proxy.failed = true; proxy.failedAt = now(); }
  }

  function stats() {
    reviveExpired();
    const failed = proxies.filter(p => p.failed).length;
    return { total: proxies.length, active: proxies.length - failed, failed };
  }

  return { enabled, next, markFailed, stats };
}

module.exports = { createProxyManager, parseProxyList, FAILED_RETRY_MS };
