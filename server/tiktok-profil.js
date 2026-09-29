'use strict';
// TikTok-profiluppslag: hamtar visningsnamn + avatar fran den PUBLIKA profilsidan.
// Serverside eftersom klienten inte kan hamta tiktok.com direkt (CORS). Injicerad fetch + now for
// testbarhet, precis som server/musik.js. Beror INTE det delade event-kontraktet — det har ar en
// egen liten uppslags-respons som studio-widgeten (Fan Level 50) konsumerar direkt.
//
// Bygger pa TikToks publika sida, inte ett officiellt API: kan sluta funka om TikTok andrar sidan
// eller blockar server-IP:t. Darfor cache + timeout, och fel lacker aldrig upstream-detaljer.

function createTikTokProfil({ fetch = globalThis.fetch, now = Date.now } = {}) {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
  const cache = new Map();              // username(lower) -> { t, data }
  const TTL_MS = 10 * 60 * 1000;        // samma profil slas inte upp om och om inom 10 min
  const MAX_CACHE = 500;

  const normalisera = raw => { let u = String(raw || '').trim(); if (u.startsWith('@')) u = u.slice(1); return u; };
  // TikTok-namn: 2–24 tecken, a–z 0–9 . _ — skydd mot url-injektion/SSRF.
  const giltig = u => /^[A-Za-z0-9._]{2,24}$/.test(u);
  const kapa = (s, n = 80) => String(s == null ? '' : s).slice(0, n);

  function parsa(html, username) {
    let nickname = null, avatar = null;
    const m = String(html || '').match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (m) {
      try {
        const j = JSON.parse(m[1]);
        const scope = j && j.__DEFAULT_SCOPE__;
        const ui = scope && scope['webapp.user-detail'] && scope['webapp.user-detail'].userInfo && scope['webapp.user-detail'].userInfo.user;
        if (ui) { nickname = ui.nickname || null; avatar = ui.avatarLarger || ui.avatarMedium || ui.avatarThumb || null; }
      } catch (_) { /* trasig JSON — fall vidare till og:-taggar */ }
    }
    if (!nickname) { const og = String(html || '').match(/<meta property="og:title" content="([^"]*)"/); if (og) nickname = og[1].replace(/\s*\(@[^)]*\)\s*on TikTok.*/i, '').trim() || null; }
    if (!avatar) { const oi = String(html || '').match(/<meta property="og:image" content="([^"]*)"/); if (oi) avatar = oi[1] || null; }
    // Avataren maste vara en https-url, annars raknas den inte (skrapskydd mot skrap-fel).
    if (avatar && !/^https:\/\//i.test(avatar)) avatar = null;
    return { username, nickname: kapa(nickname || username), avatar: avatar || '' };
  }

  async function hamta(rawUsername) {
    const username = normalisera(rawUsername);
    if (!username) throw Object.assign(new Error('anvandarnamn saknas'), { status: 400 });
    if (!giltig(username)) throw Object.assign(new Error('ogiltigt anvandarnamn'), { status: 400 });

    const key = username.toLowerCase(), t = now();
    const c = cache.get(key);
    if (c && (t - c.t) < TTL_MS) return { ...c.data, cached: true };

    let r;
    try {
      r = await fetch('https://www.tiktok.com/@' + encodeURIComponent(username), {
        headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(8000), redirect: 'follow'
      });
    } catch (_) { throw Object.assign(new Error('kunde inte na TikTok'), { status: 503 }); }
    if (r.status === 404) throw Object.assign(new Error('profilen finns inte'), { status: 404 });
    if (!r.ok) throw Object.assign(new Error('TikTok svarade ' + r.status), { status: 502 });

    const html = await r.text();
    const data = parsa(html, username);
    if (!data.avatar) throw Object.assign(new Error('hittade ingen profil for @' + username), { status: 404 });

    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(key, { t, data });
    return { ...data, cached: false };
  }

  return { hamta, parsa, normalisera, giltig };
}

module.exports = { createTikTokProfil };
