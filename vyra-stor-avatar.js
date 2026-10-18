// vyra-stor-avatar.js — skarpa profilbilder i sändningen.
//
// UPPMÄTT 2026-10-11 (Davids ord: "mina widget ser suddiga i tiktok"): 18 046 av 18 147 avatarer i
// gifter_totals är 72×72 px (`~tplv-tiktok-shrink:72:72.webp`). Det är vad TikTok skickar med varje
// gåvo- och like-event. Våra designer ritar fotot i 145 px (Top Like-raden i 1080×1920) och upp till
// ~500 px (streak-flippen, podiet) — en 72-pixelsbild förstorad två till sju gånger. Text, ramar
// och konstverk är skarpa; det är fotot som är suddigt. URL:en går inte att skriva om till en större
// variant: den är signerad, 720:720 och 1080:1080 ger 403.
//
// Det som går: den PUBLIKA profilsidan har avatarLarger (1080×1080), och servern har redan
// /api/tiktok-profile (server/tiktok-profil.js, byggd för Fan Level 50) som hämtar den. Så den här
// modulen slår upp de personer som faktiskt syns — gåvogivare först, sedan följare/delare, sist
// likare — en i taget med fyra sekunders mellanrum (rutten tillåter 20/min per IP), och byter ut
// den lilla bilden överallt den hunnit ritas.
//
// TRE STÄLLEN bär bilden, och alla tre byts:
//   1. DOM: <img src> och background-image som pekar på den lilla URL:en.
//   2. state.widgets[].profileImage (Top Gift/Top Streak skriver dit — live-leaderboard.js och
//      gift-event-images.js), så att nästa render() ritar den stora. Bara i minnet, aldrig save().
//   3. Modulernas egna register (live-leaderboard.js totals, playground-widgets.js S.users) via
//      CustomEvent 'vyra-stor-avatar' {username, liten, stor}.
// Dessutom byts fältet i varje SENARE event från samma person redan i ingest() (live-client.js
// anropar forbattra), så repaints och nya widgetar får den stora direkt.
//
// Testevent (__test/__simulerad) slås aldrig upp — Lina och Jokero finns inte på TikTok.
(function () {
  'use strict';
  const LITEN = /~tplv-(tiktok-shrink|tiktokx-cropcenter):(\d+):(\d+)/;
  const TROSKEL = 300;                       // under 300 px är bilden värd ett uppslag
  const NAMN = /^[A-Za-z0-9._]{2,24}$/;      // samma regel som servern (SSRF-skydd)
  const konfig = { gap: 4000, max: 400 };    // ms mellan uppslag, uppslag per sidladdning
  const cache = new Map();                   // username(lower) -> stor url, '' = gav inget
  const koade = new Set();
  const ko = [];
  let timer = null, pagar = false, senast = 0, antal = 0;

  function arLiten(url) { const m = LITEN.exec(String(url || '')); return !!m && Number(m[2]) < TROSKEL; }
  function prio(e) {
    const t = String(e.type || e.event || '').toLowerCase();
    if (t.includes('gift')) return 0;
    if (t.includes('follow') || t.includes('share') || t.includes('subscribe')) return 1;
    return 2;
  }

  // Synkront: byter fältet om den stora redan är känd, annars köar ett uppslag. Returnerar eventet.
  function forbattra(e) {
    if (!e || typeof e !== 'object' || e.__test || e.__simulerad) return e;
    const u = String(e.username || e.uniqueId || '');
    if (!NAMN.test(u)) return e;
    const k = u.toLowerCase(), bild = e.profileImage || e.avatar || '';
    const stor = cache.get(k);
    if (stor) { e.profileImage = stor; if (e.avatar) e.avatar = stor; return e; }
    if (stor === '' || !bild || !arLiten(bild)) return e;
    koa(u, bild, prio(e));
    return e;
  }

  function koa(u, liten, p) {
    const k = u.toLowerCase();
    if (koade.has(k) || cache.has(k) || antal >= konfig.max) return;
    koade.add(k);
    ko.push({ u, k, liten, p, t: Date.now() });
    ko.sort((a, b) => a.p - b.p || a.t - b.t);
    tick();
  }
  function tick() {
    if (timer || pagar || !ko.length) return;
    const vanta = senast ? Math.max(0, konfig.gap - (Date.now() - senast)) : 0;
    timer = setTimeout(() => { timer = null; kor(); }, vanta);
  }
  async function kor() {
    const j = ko.shift();
    if (!j) return;
    pagar = true; antal++; senast = Date.now();
    let stor = '';
    try {
      const r = await fetch('/api/tiktok-profile?username=' + encodeURIComponent(j.u), { cache: 'no-store' });
      const d = r && r.ok ? await r.json() : null;
      const a = d && d.ok && typeof d.avatar === 'string' ? d.avatar : '';
      if (/^https:\/\//.test(a) && !arLiten(a)) stor = a;
    } catch (_) { stor = ''; }
    cache.set(j.k, stor);
    koade.delete(j.k);
    pagar = false;
    if (stor) byt(j.u, j.liten, stor);
    tick();
  }

  function byt(username, liten, stor) {
    if (typeof document !== 'undefined') {
      document.querySelectorAll('img').forEach(img => { if (img.getAttribute('src') === liten) img.src = stor; });
      document.querySelectorAll('[style*="url("]').forEach(el => {
        const bg = el.style.backgroundImage;
        if (bg && bg.indexOf(liten) !== -1) el.style.backgroundImage = bg.split(liten).join(stor);
      });
    }
    try {
      if (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) {
        // INGEN save(). Bilden ar livedata: DOM ar redan patchad ovan och state andras i minnet, sa
        // nasta render() ritar den stora. En save() har gav i overlayn en ny konfiguration och en
        // hel omritning per bildbyte — widgetar som blinkade mitt i sandningen (uppmatt 2026-10-18).
        for (const w of state.widgets) if (w && w.profileImage === liten) w.profileImage = stor;
      }
    } catch (_) {}
    try { dispatchEvent(new CustomEvent('vyra-stor-avatar', { detail: { username, liten, stor } })); } catch (_) {}
  }

  window.VyraStorAvatar = {
    forbattra, arLiten, byt,
    status: () => ({ ko: ko.length, antal, cache: cache.size, pagar }),
    // Bara för prov: kortare mellanrum och tom cache.
    _konfig(o) { Object.assign(konfig, o || {}); },
    _nollstall() { cache.clear(); koade.clear(); ko.length = 0; if (timer) clearTimeout(timer); timer = null; pagar = false; senast = 0; antal = 0; }
  };
})();
