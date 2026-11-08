// energimatare.js — ENERGIMÄTAREN / HEALTH BAR (David 2026-11-07, sparad prototyp "Health Bar"). En egen
// widgettyp, templateEnergyBar: Vital, Arcade och Minimal, liggande eller stående (stående fylls uppåt).
//
// SKILLNADEN MOT MÅL (Goal). Ett mål räknar uppåt mot en siffra och stannar där. Energin lever: valda
// händelser fyller på, och den TÖMS hela tiden i en takt streamern väljer — tittarna måste hålla den uppe.
// Nivån är alltid 0–100 och tömningen räknas på väggklockan, så två OBS-källor visar samma nivå.
//
// REGLERNA ÄR STREAMERNS: poäng per 10 likes, per diamant (med tak per gåva), per delning, per följare och
// per chattmeddelande. Chatten har spamskydd: samma tittare räknas högst en gång per paus (standard 10 s).
// Bara färska livehändelser räknas (FARSKT_MS) — vid laddning spelar live-leaderboard upp kvällens gamla
// händelser, och de ska inte fylla mätaren igen. Testhändelser når inte overlayn (live-client.js).
//
// NIVÅN ÖVERLEVER EN OMLADDNING. OBS laddar om källor; utan minne hade mätaren hoppat till startnivån.
// localStorage per widget och flik, med tidpunkten: vid laddning dras tömningen för den tid som gått.
(function () {
  'use strict';
  if (typeof wh !== 'function' || window.VyraEnergimatare) return;

  const TYP = 'templateEnergyBar';
  const OVERLAY = (() => { try { return document.documentElement.classList.contains('overlay-output') || new URLSearchParams(location.search).has('overlay'); } catch (_) { return false; } })();
  const MODELLER = [['vital', 'Vital', 'Mjukt kort med jämn fyllning'], ['arcade', 'Arcade', 'Kantig, segmenterad mätare'], ['minimal', 'Minimal', 'Bara text och en tunn linje']];
  const MODELL = Object.fromEntries(MODELLER.map(m => [m[0], { id: m[0], namn: m[1], text: m[2] }]));
  const FARGER = [['#74ddb5', 'Mint'], ['#72d6ff', 'Isblå'], ['#be94f5', 'Lila'], ['#ff93bc', 'Rosa'], ['#f3ce79', 'Guld']];
  const FARSKT_MS = 15000, MAX_PER_GAVA = 50, LAGRING = 'vyra-energi-';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const klamp = (v, min, max, f) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : f; };
  const farg = v => /^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v) : '#74ddb5';
  const regler = w => ({
    start: klamp(w.emStart, 0, 100, 50),
    likes: klamp(w.emLikes, 0, 20, 1),          // poäng per 10 likes
    gavor: klamp(w.emGavor, 0, 10, 0.5),        // poäng per diamant, högst MAX_PER_GAVA per gåva
    delning: klamp(w.emDelning, 0, 50, 5),
    foljare: klamp(w.emFoljare, 0, 50, 5),
    chatt: klamp(w.emChatt, 0, 20, 0),
    chattPaus: klamp(w.emChattPaus, 0, 600, 10),
    tomning: klamp(w.emTomning, 0, 100, 6)       // poäng per minut
  });

  // ---------- ren logik (provas utan DOM i tests/energimatare.test.js) ----------
  function slag(e) {
    const t = String((e && (e.type || e.event)) || '').toLowerCase().replace(/[\s_-]/g, '');
    return t === 'likes' ? 'like' : t === 'chatcommand' ? 'chat' : t;
  }
  // Poängen en händelse ger under reglerna r. senast: { anv: ms } för chattens spamskydd (muteras).
  function poang(r, e, nu, senast) {
    const k = slag(e);
    if (k === 'like') return r.likes * Math.max(0, Number(e.count || e.likeCount || 1) || 0) / 10;
    if (k === 'gift') {
      const d = Math.max(0, Number(e.diamonds ?? e.coins ?? e.value ?? 0) || 0);
      return Math.min(MAX_PER_GAVA, r.gavor * d);
    }
    if (k === 'share') return r.delning;
    if (k === 'follow') return r.foljare;
    if (k === 'chat') {
      if (!r.chatt) return 0;
      const anv = String(e.userId || e.username || '');
      if (!anv) return 0;
      if (senast && senast[anv] && nu - senast[anv] < r.chattPaus * 1000) return 0;
      if (senast) senast[anv] = nu;
      return r.chatt;
    }
    return 0;
  }
  // Nivån efter tömning under dt millisekunder.
  const tomt = (niva, r, dt) => klamp(niva - r.tomning * Math.max(0, dt) / 60000, 0, 100, 0);
  function arFarsk(e, nu) {
    const at = Number(e && (e.at || (e.timestamp && Date.parse(e.timestamp))));
    return !(Number.isFinite(at) && at > 0 && nu - at > FARSKT_MS);
  }

  // ---------- läget per widget ----------
  const LAGE = new Map();   // id → { niva, at, senast }
  // STILLBILD FÖR PIXELVAKTEN (tests/helpers/katalognycklar.js REGI): tömningen ändrar nivån medan bilden
  // tas. stilla() låser varje mätare på sin startnivå, utan tömning och utan händelser.
  let STILLA = false;
  const widgetar = () => { try { return (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) ? state.widgets.filter(w => w && w.type === TYP) : []; } catch (_) { return []; } };
  function lage(w, nu = Date.now()) {
    const id = String(w.id);
    let s = LAGE.get(id);
    if (!s) {
      s = { niva: regler(w).start, at: nu, senast: {} };
      try { const sparat = JSON.parse(localStorage.getItem(LAGRING + id) || 'null'); if (sparat && Number.isFinite(sparat.niva) && Number.isFinite(sparat.at)) { s.niva = sparat.niva; s.at = sparat.at; } } catch (_) {}
      LAGE.set(id, s);
    }
    // Tömningen fram till nu, lat: samma resultat oavsett hur ofta den räknas.
    if (STILLA) { s.niva = regler(w).start; s.at = nu; return s; }
    s.niva = tomt(s.niva, regler(w), nu - s.at); s.at = nu;
    return s;
  }
  function spara(w) { const s = LAGE.get(String(w.id)); if (!s) return; try { localStorage.setItem(LAGRING + w.id, JSON.stringify({ niva: Math.round(s.niva * 100) / 100, at: s.at })); } catch (_) {} }
  function andra(w, delta) {
    const s = lage(w);
    s.niva = klamp(s.niva + delta, 0, 100, s.niva);
    spara(w); uppdatera(w);
    return s.niva;
  }
  function satt(w, niva) { const s = lage(w); s.niva = klamp(niva, 0, 100, s.niva); spara(w); uppdatera(w); }

  // ---------- render ----------
  function tips(w, niva) {
    if (niva <= 0) return 'Energin är slut';
    if (niva >= 100) return 'Full energi!';
    const r = regler(w), delar = [];
    if (r.likes) delar.push('likes'); if (r.gavor) delar.push('gåvor'); if (r.delning) delar.push('delningar');
    if (r.foljare) delar.push('följare'); if (r.chatt) delar.push('chatt');
    if (!delar.length) return 'Inga händelser fyller på';
    const text = delar.length === 1 ? delar[0] : delar.slice(0, -1).join(', ') + ' och ' + delar[delar.length - 1];
    return text.charAt(0).toUpperCase() + text.slice(1) + ' fyller på';
  }
  const oldWh = wh;
  wh = function (w) {
    if (!w || w.type !== TYP) return oldWh(w);
    const m = MODELL[w.emModell] ? w.emModell : 'vital', staende = w.emRiktning === 'staende';
    const niva = Math.round(lage(w).niva);
    const valt = !OVERLAY && typeof selected !== 'undefined' && selected === w.id;
    const skala = klamp(w.widgetScale, 0.1, 5, 1) * (klamp(w.width, 60, 900, staende ? 108 : 270) / (staende ? 108 : 270));
    const namn = String(w.emNamn == null ? 'LIVE-ENERGI' : w.emNamn).slice(0, 24) || 'LIVE-ENERGI';
    return `<div class="widget vyra-energi em-${m}${staende ? ' em-staende' : ''}${niva <= 0 ? ' em-tom' : ''}${valt ? ' selected' : ''}" data-id="${esc(w.id)}" `
      + `style="left:${Number(w.x) || 0}px;top:${Number(w.y) || 0}px;zoom:${skala.toFixed(3)};z-index:${Number(w.layer) || 1};--energi:${farg(w.emFarg)};--niva:${niva}%">`
      + `<div class="em-kort"><div class="em-huvud"><span class="em-namn" title="${esc(namn)}">${esc(namn)}</span><span class="em-varde">${niva}%</span></div>`
      + `<div class="em-spar" role="progressbar" aria-label="${esc(namn)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${niva}"><div class="em-fyll"></div></div>`
      + `<div class="em-tips">${esc(tips(w, niva))}</div></div>` + (valt ? '<span class="resize-handle">↘</span>' : '') + '</div>';
  };
  // Nivån byts på plats utan omritning av hela duken (tömningen tickar varje sekund).
  function uppdatera(w) {
    const rot = document.querySelector(`.vyra-energi[data-id="${String(w.id).replace(/["\\]/g, '\\$&')}"]`);
    if (!rot) return;
    const niva = Math.round(lage(w).niva);
    rot.style.setProperty('--niva', niva + '%');
    rot.classList.toggle('em-tom', niva <= 0);
    const v = rot.querySelector('.em-varde'); if (v) v.textContent = niva + '%';
    const s = rot.querySelector('.em-spar'); if (s) s.setAttribute('aria-valuenow', niva);
    const t = rot.querySelector('.em-tips'); if (t) t.textContent = tips(w, niva);
  }
  setInterval(() => { for (const w of widgetar()) { if (!w.hidden) uppdatera(w); } }, 1000);
  setInterval(() => { for (const w of widgetar()) spara(w); }, 5000);

  // ---------- livehändelserna ----------
  window.addEventListener('vyra-live-event', ev => {
    const e = ev && ev.detail, nu = Date.now();
    if (STILLA || !e || !arFarsk(e, nu)) return;
    for (const w of widgetar()) {
      if (w.hidden) continue;
      const s = lage(w, nu), p = poang(regler(w), e, nu, s.senast);
      if (p > 0) andra(w, p);
    }
  });

  // ---------- panelen ----------
  const tal = (id, etikett, v, min, max, steg = 1, hjalp = '') => `<label>${esc(etikett)}<input id="${id}" type="number" min="${min}" max="${max}" step="${steg}" value="${v}"></label>${hjalp ? `<small>${esc(hjalp)}</small>` : ''}`;
  const oldProps = props;
  props = function () {
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!w || w.type !== TYP) return oldProps();
    const r = regler(w), m = MODELL[w.emModell] ? w.emModell : 'vital', f = farg(w.emFarg);
    return `<h3>ENERGIMÄTARE</h3><div class="template-badge">FYLLS AV TITTARNA · TÖMS ÖVER TID</div><div hidden><input id="pt" value="Energimätare"><input id="pv" value=""></div>`
      + `<div class="property-group"><h4>MODELL</h4><label>Modell<select id="emModell">${MODELLER.map(x => `<option value="${x[0]}"${x[0] === m ? ' selected' : ''}>${esc(x[1])}</option>`).join('')}</select></label>`
      + `<label>Riktning<select id="emRiktning"><option value="liggande"${w.emRiktning !== 'staende' ? ' selected' : ''}>Liggande</option><option value="staende"${w.emRiktning === 'staende' ? ' selected' : ''}>Stående (fylls uppåt)</option></select></label>`
      + `<label>Namn<input id="emNamn" maxlength="24" value="${esc(w.emNamn == null ? 'LIVE-ENERGI' : w.emNamn)}"></label>`
      + `<div class="em-farger">${FARGER.map(([c, n]) => `<button type="button" data-em-farg="${c}" title="${esc(n)}" aria-pressed="${c.toLowerCase() === f.toLowerCase()}" style="background:${c}"></button>`).join('')}</div>`
      + `<label>Egen färg<input id="emFarg" type="color" value="${f}"></label></div>`
      + `<div class="property-group"><h4>VAD FYLLER PÅ?</h4>`
      + tal('emLikes', 'Poäng per 10 likes', r.likes, 0, 20, 0.5)
      + tal('emGavor', 'Poäng per diamant', r.gavor, 0, 10, 0.1, 'En gåva ger högst ' + MAX_PER_GAVA + ' poäng.')
      + tal('emDelning', 'Poäng per delning', r.delning, 0, 50)
      + tal('emFoljare', 'Poäng per ny följare', r.foljare, 0, 50)
      + tal('emChatt', 'Poäng per chattmeddelande', r.chatt, 0, 20, 0.5, '0 = chatten räknas inte.')
      + tal('emChattPaus', 'Spamskydd: sekunder per tittare', r.chattPaus, 0, 600, 1, 'Samma tittare räknas högst en gång under pausen.')
      + `</div><div class="property-group"><h4>TÖMNING</h4>`
      + tal('emTomning', 'Töms med (poäng per minut)', r.tomning, 0, 100, 0.5, '0 = töms aldrig.')
      + tal('emStart', 'Startnivå', r.start, 0, 100)
      + `<button type="button" id="emNollstall">Börja om från startnivån</button></div>`
      + `<div class="property-group"><h4>TESTA</h4><button type="button" data-em-test="10">+10</button> <button type="button" data-em-test="-20">−20</button> <button type="button" data-em-test="tom">Tom</button> <button type="button" data-em-test="full">Full</button><small>Bara här i studionfliken. OBS påverkas inte.</small></div>`
      + `<div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${Number(w.x) || 0}"></label><label>Y<input id="propY" type="number" value="${Number(w.y) || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${Number(w.width) || (w.emRiktning === 'staende' ? 108 : 270)}"></label><label>Lager<input id="propLayer" type="number" value="${Number(w.layer) || 1}"></label></div></div>`
      + `<button class="delete" id="del">Ta bort</button>`;
  };

  // ---------- katalogen ----------
  function katalog() {
    const cat = document.querySelector('.widget-catalog');
    if (!cat || cat.querySelector('[data-em-skapa]')) return;
    const sek = document.createElement('section');
    sek.className = 'em-katalog';
    sek.innerHTML = '<h4>ENERGIMÄTARE</h4>';
    MODELLER.forEach(([id, namn, text]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.emSkapa = id; b.dataset.catalogKey = 'catalog:vyrapaket:energi:' + id;
      b.innerHTML = `<span><b>${esc(namn)}</b><small>${esc(text)}</small></span>`;
      b.onclick = () => {
        if (!window.VyraWidgets || typeof state === 'undefined') return;
        const w = window.VyraWidgets.create('catalog:vyrapaket:energi:' + id);
        state.widgets.push(w); selected = w.id;
        if (typeof save === 'function') save(); if (typeof render === 'function') render();
        if (typeof toast === 'function') toast('Energimätare · ' + namn + ' tillagd');
      };
      sek.append(b);
    });
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
    const satta = (falt, v, ritaOm = true) => { w[falt] = v; if (typeof save === 'function') save(); if (ritaOm && typeof render === 'function') render(); else uppdatera(w); };
    let el;
    if ((el = q('#emModell'))) el.onchange = e => satta('emModell', MODELL[e.target.value] ? e.target.value : 'vital');
    if ((el = q('#emRiktning'))) el.onchange = e => { const st = e.target.value === 'staende'; w.width = st ? 108 : 270; satta('emRiktning', st ? 'staende' : 'liggande'); };
    if ((el = q('#emNamn'))) el.onchange = e => satta('emNamn', String(e.target.value || '').slice(0, 24));
    if ((el = q('#emFarg'))) el.oninput = e => satta('emFarg', farg(e.target.value));
    document.querySelectorAll('[data-em-farg]').forEach(b => { b.onclick = () => satta('emFarg', farg(b.dataset.emFarg)); });
    [['#emLikes', 'emLikes', 0, 20, 1], ['#emGavor', 'emGavor', 0, 10, 0.5], ['#emDelning', 'emDelning', 0, 50, 5], ['#emFoljare', 'emFoljare', 0, 50, 5],
      ['#emChatt', 'emChatt', 0, 20, 0], ['#emChattPaus', 'emChattPaus', 0, 600, 10], ['#emTomning', 'emTomning', 0, 100, 6], ['#emStart', 'emStart', 0, 100, 50]]
      .forEach(([sel, falt, min, max, std]) => { const f = q(sel); if (f) f.onchange = e => satta(falt, klamp(+e.target.value, min, max, std), false); });
    if ((el = q('#emNollstall'))) el.onclick = () => satt(w, regler(w).start);
    document.querySelectorAll('[data-em-test]').forEach(b => {
      b.onclick = () => { const v = b.dataset.emTest; if (v === 'tom') satt(w, 0); else if (v === 'full') satt(w, 100); else andra(w, Number(v)); };
    });
  };

  function stilla() { STILLA = true; for (const w of widgetar()) { lage(w); uppdatera(w); } return document.querySelectorAll('.vyra-energi').length; }
  window.VyraEnergimatare = Object.freeze({ typ: TYP, MODELLER, FARGER, regler, poang, tomt, arFarsk, slag, tips, lage, andra, satt, stilla, MAX_PER_GAVA, FARSKT_MS, _lage: LAGE });
  try { if (typeof render === 'function') render(); } catch (_) {}
})();
