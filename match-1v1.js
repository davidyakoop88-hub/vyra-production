// match-1v1.js — MATCH 1 VS 1 (David 2026-11-07, sparade "Matchwidgets", godkänd version med poängcirklar). En egen
// widgettyp, templateMatchDuel: två cirklar med profil och poäng, VS i mitten, en stapel och "X leder" / "X vinner".
//
// BARA 1 VS 1 ÄR BYGGT. 2 vs 2, alla mot alla och "bara motståndarna" kräver per-deltagare-poäng som bryggan inte
// skickar idag (LINK_MIC_ARMIES per person och anchorsInfo vidarebefordras inte). De byggs när sådana matcher är
// inspelade och normaliserade. Det automatiska lägesvalet finns därför inte heller än.
//
// RIKTIG DATA: bryggans `battle`-händelse — scoreUs, scoreThem, winsUs/winsThem (vinstsviten), remainingSec och
// battleStatus (uppmätt: battle_started / battle_finished, docs/live-verifiering.md punkt 2). Motståndarens namn
// och profilbild skickas inte, så sidorna heter "Du" och "Motståndare" (båda går att byta) med initialer — inga
// påhittade profiler och inga "Lag Rosa/Blå"-etiketter.
//
// I OBS syns widgeten bara under en match. Slutresultatet står kvar en stund (standard 10 s) och tonas sedan bort.
// Tystnar battle-händelserna utan slutbesked döljs den efter 30 s.
(function () {
  'use strict';
  if (typeof wh !== 'function' || window.VyraMatch1v1) return;

  const TYP = 'templateMatchDuel';
  const OVERLAY = (() => { try { return document.documentElement.classList.contains('overlay-output') || new URLSearchParams(location.search).has('overlay'); } catch (_) { return false; } })();
  const TYST_MS = 30000;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const klamp = (v, min, max, f) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : f; };
  const fmt = n => Math.max(0, Math.round(Number(n) || 0)).toLocaleString('sv-SE');
  const initialer = s => (Array.from(String(s || '').trim()).slice(0, 2).join('') || '?').toLocaleUpperCase('sv');
  const namnVi = w => String(w && w.mdVi != null ? w.mdVi : 'Du').slice(0, 20) || 'Du';
  const namnDe = w => String(w && w.mdDe != null ? w.mdDe : 'Motståndare').slice(0, 20) || 'Motståndare';

  // ---------- ren logik (provas i tests/match-1v1.test.js) ----------
  const MATCH = { aktiv: false, slut: false, vi: 0, de: 0, segrarVi: null, segrarDe: null, kvar: null, kvarAt: 0, senast: 0, slutAt: 0, id: '' };
  function arBattle(e) {
    const t = String(e && (e.type || e.event) || '').toLowerCase();
    return t === 'battle' || (e && (e.scoreUs != null || e.scoreThem != null) && /battle/.test(t));
  }
  // Tar emot en battle-händelse. Returnerar matchens läge (för proven).
  function ta(e, nu = Date.now()) {
    if (!e || !arBattle(e)) return MATCH;
    const status = String(e.battleStatus || '').toLowerCase();
    if (e.battleId && MATCH.id && String(e.battleId) !== MATCH.id && MATCH.slut) Object.assign(MATCH, { vi: 0, de: 0, segrarVi: null, segrarDe: null, kvar: null });
    if (e.battleId) MATCH.id = String(e.battleId);
    if (status === 'battle_started' || (!MATCH.aktiv && !/finish|end/.test(status))) { if (MATCH.slut) Object.assign(MATCH, { vi: 0, de: 0 }); MATCH.aktiv = true; MATCH.slut = false; }
    if (e.scoreUs != null) MATCH.vi = Math.max(0, Number(e.scoreUs) || 0);
    if (e.scoreThem != null) MATCH.de = Math.max(0, Number(e.scoreThem) || 0);
    if (e.winsUs != null) MATCH.segrarVi = Number(e.winsUs) || 0;
    if (e.winsThem != null) MATCH.segrarDe = Number(e.winsThem) || 0;
    if (e.remainingSec != null && Number.isFinite(Number(e.remainingSec))) { MATCH.kvar = Math.max(0, Number(e.remainingSec)); MATCH.kvarAt = nu; }
    if (/finish|end/.test(status)) { MATCH.slut = true; MATCH.slutAt = nu; MATCH.kvar = 0; }
    MATCH.senast = nu;
    return MATCH;
  }
  // Ska widgeten synas just nu, och i vilket läge? 'match' | 'slut' | null
  function lage(w, nu = Date.now()) {
    if (MATCH.slut) return nu - MATCH.slutAt < klamp(w && w.mdSlutSek, 3, 60, 10) * 1000 ? 'slut' : null;
    if (MATCH.aktiv) return nu - MATCH.senast < TYST_MS ? 'match' : null;
    return null;
  }
  function text(w, slut) {
    const a = MATCH.vi, b = MATCH.de;
    if (a === b) return (slut ? 'SLUT · ' : '') + 'Oavgjort';
    return (slut ? 'SLUT · ' : '') + (a > b ? namnVi(w) : namnDe(w)) + (slut ? ' vinner' : ' leder');
  }
  function klocka(nu) {
    if (MATCH.kvar == null) return '';
    const s = Math.max(0, Math.round(MATCH.kvar - (nu - MATCH.kvarAt) / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  // ---------- render ----------
  let STILLA = false;
  const oldWh = wh;
  wh = function (w) {
    if (!w || w.type !== TYP) return oldWh(w);
    const nu = Date.now(), l = STILLA ? 'match' : lage(w, nu);
    const visa = l || (OVERLAY ? null : 'exempel');
    const ex = visa === 'exempel' || STILLA;
    const a = ex ? 1240 : MATCH.vi, b = ex ? 860 : MATCH.de;
    const leder = a === b ? '' : a > b ? 'vi' : 'de';
    const andel = a + b ? a / (a + b) * 100 : 50;
    const valt = !OVERLAY && typeof selected !== 'undefined' && selected === w.id;
    const skala = klamp(w.widgetScale, 0.1, 5, 1) * (klamp(w.width, 160, 900, 320) / 320);
    const sida = (namn, poang, segrar, ar) => `<div class="md-sida${leder === ar ? ' md-leder' : ''}"><div class="md-person"><div class="md-avatar" aria-hidden="true">${esc(initialer(namn))}</div><div class="md-namn">${esc(namn)}</div></div>`
      + `<div class="md-poang">${fmt(poang)}</div>${segrar != null && segrar > 0 ? `<div class="md-svit">${segrar} ${segrar === 1 ? 'vinst' : 'vinster'} i rad</div>` : ''}</div>`;
    const caption = ex ? (OVERLAY ? text(w, false) : 'Exempel · visas i OBS under en match') : text(w, l === 'slut');
    const tid = ex ? '4:12' : klocka(nu);
    return `<div class="widget vyra-match${visa ? '' : ' md-dold'}${l === 'slut' ? ' md-slut' : ''}${valt ? ' selected' : ''}" data-id="${esc(w.id)}" style="left:${Number(w.x) || 0}px;top:${Number(w.y) || 0}px;zoom:${skala.toFixed(3)};z-index:${Number(w.layer) || 1}">`
      + `<div class="md-kort"><div class="md-duell">${sida(namnVi(w), a, ex ? 1 : MATCH.segrarVi, 'vi')}<div class="md-vs">VS${tid ? `<small>${esc(tid)}</small>` : ''}</div>${sida(namnDe(w), b, ex ? 0 : MATCH.segrarDe, 'de')}</div>`
      + `<div class="md-stapel"><div class="md-fyll" style="width:${andel.toFixed(1)}%"></div></div><div class="md-text">${esc(caption)}</div></div>`
      + (valt ? '<span class="resize-handle">↘</span>' : '') + '</div>';
  };
  // Klockan och uttoningen: rita om varje sekund under en match.
  setInterval(() => { if (STILLA) return; if (MATCH.aktiv || MATCH.slut) { try { if (typeof render === 'function') render(); } catch (_) {} } }, 1000);

  // ---------- livehändelserna ----------
  window.addEventListener('vyra-live-event', ev => {
    const e = ev && ev.detail;
    if (!e || !arBattle(e)) return;
    ta(e);
    try { if (typeof render === 'function') render(); } catch (_) {}
  });

  // ---------- panelen ----------
  const oldProps = props;
  props = function () {
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!w || w.type !== TYP) return oldProps();
    return `<h3>MATCH 1 VS 1</h3><div class="template-badge">TIKTOK-MATCH · LIVE</div><div hidden><input id="pt" value="Match 1 vs 1"><input id="pv" value=""></div>`
      + `<div class="property-group"><h4>SIDORNA</h4><label>Din sida<input id="mdVi" maxlength="20" value="${esc(namnVi(w))}"></label><label>Motståndaren<input id="mdDe" maxlength="20" value="${esc(namnDe(w))}"></label>`
      + `<small>Poäng, vinstsvit och tid kommer från TikToks match. TikTok skickar inte motståndarens namn eller profilbild, därför visas initialer.</small></div>`
      + `<div class="property-group"><h4>EFTER MATCHEN</h4><label>Visa slutresultatet i (sekunder)<input id="mdSlutSek" type="number" min="3" max="60" value="${klamp(w.mdSlutSek, 3, 60, 10)}"></label>`
      + `<small>I OBS syns widgeten bara under en match. Bara 1 vs 1 finns än — 2 vs 2 och alla mot alla kommer när de matcherna är inspelade.</small></div>`
      + `<div class="property-group"><h4>TESTA</h4><button type="button" id="mdTesta">▶ Spela en testmatch här</button><small>Bara här i studion. OBS påverkas inte.</small></div>`
      + `<div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${Number(w.x) || 0}"></label><label>Y<input id="propY" type="number" value="${Number(w.y) || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${klamp(w.width, 160, 900, 320)}"></label><label>Lager<input id="propLayer" type="number" value="${Number(w.layer) || 1}"></label></div></div>`
      + `<button class="delete" id="del">Ta bort</button>`;
  };

  // ---------- katalogen ----------
  function katalog() {
    const cat = document.querySelector('.widget-catalog');
    if (!cat || cat.querySelector('[data-md-skapa]')) return;
    const sek = document.createElement('section');
    sek.className = 'md-katalog';
    sek.innerHTML = '<h4>MATCH</h4>';
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.mdSkapa = '1'; b.dataset.catalogKey = 'catalog:vyrapaket:match:1v1';
    b.innerHTML = '<span><b>Match 1 vs 1</b><small>Poängcirklar, stapel och vem som leder — TikToks egen match</small></span>';
    b.onclick = () => {
      if (!window.VyraWidgets || typeof state === 'undefined') return;
      const w = window.VyraWidgets.create('catalog:vyrapaket:match:1v1');
      state.widgets.push(w); selected = w.id;
      if (typeof save === 'function') save(); if (typeof render === 'function') render();
      if (typeof toast === 'function') toast('Match 1 vs 1 tillagd');
    };
    sek.append(b);
    cat.append(sek);
  }

  const oldBind = bind;
  bind = function () {
    oldBind();
    if (typeof view === 'undefined' || (view !== 'editor' && view !== 'overlay')) return;
    katalog();
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!w || w.type !== TYP) return;
    const q = s => document.querySelector(s);
    const satt = (falt, v) => { w[falt] = v; if (typeof save === 'function') save(); if (typeof render === 'function') render(); };
    let el;
    if ((el = q('#mdVi'))) el.onchange = e => satt('mdVi', String(e.target.value || '').slice(0, 20));
    if ((el = q('#mdDe'))) el.onchange = e => satt('mdDe', String(e.target.value || '').slice(0, 20));
    if ((el = q('#mdSlutSek'))) el.onchange = e => satt('mdSlutSek', klamp(Math.round(+e.target.value), 3, 60, 10));
    if ((el = q('#mdTesta'))) el.onclick = () => {
      const id = 'test-' + Date.now();
      [[0, 0, 0, 'battle_started'], [1500, 320, 180], [3000, 880, 940], [4500, 1640, 1210], [6000, 1640, 1210, 'battle_finished']]
        .forEach(([ms, vi, de, st]) => setTimeout(() => { ta({ type: 'battle', battleId: id, scoreUs: vi, scoreThem: de, remainingSec: 300 - ms / 1000, battleStatus: st || '' }); if (typeof render === 'function') render(); }, ms));
    };
  };

  function stilla() { STILLA = true; try { if (typeof render === 'function') render(); } catch (_) {} return document.querySelectorAll('.vyra-match').length; }
  function nollstall() { Object.assign(MATCH, { aktiv: false, slut: false, vi: 0, de: 0, segrarVi: null, segrarDe: null, kvar: null, kvarAt: 0, senast: 0, slutAt: 0, id: '' }); }
  window.VyraMatch1v1 = Object.freeze({ typ: TYP, ta, lage, text, klocka, stilla, nollstall, _match: MATCH });
  try { if (typeof render === 'function') render(); } catch (_) {}
})();
