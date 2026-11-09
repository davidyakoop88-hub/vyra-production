// ordjakten.js — ORDJAKTEN / WORD SCRAMBLE (David 2026-11-07, sparad prototyp "Ordjakten"). En egen widgettyp,
// templateWordHunt: ett ord med blandade bokstäver och en ledtråd. Tittarna skriver hela ordet i TikTok-chatten;
// den som först skriver rätt får poäng. Inga gåvokrav och inga priser.
//
// SAMMA VINNARE I VARJE OBS-KÄLLA. Varje källa räknar själv, men på samma händelseström i samma ordning (servern
// skickar den likadant till alla). Därför är bokstavsblandningen bestämd av ordet och rundan (ett frö, aldrig
// Math.random) och "först" är den första rätta chattraden i strömmen — inte klockan i en viss webbläsare.
//
// MODERATORERNA STYR I CHATTEN: !nästa (nytt ord) och !lösning (visa ordet, inga poäng). Bara chattrader med
// isModerator räknas, så kommandot når alla OBS-källor utan en egen servertransport. Efter ett löst eller visat
// ord kommer nästa automatiskt efter en paus (standard 8 s). Ordlistan börjar om när den tar slut.
//
// Poängen nycklas på tittarens userId (visningsnamn är inte unika). Läget överlever en omladdning (localStorage).
(function () {
  'use strict';
  if (typeof wh !== 'function' || window.VyraOrdjakten) return;

  const TYP = 'templateWordHunt';
  const OVERLAY = (() => { try { return document.documentElement.classList.contains('overlay-output') || new URLSearchParams(location.search).has('overlay'); } catch (_) { return false; } })();
  const FARSKT_MS = 15000, LAGRING = 'vyra-ordjakten-', MAX_ORD = 200;
  // Inbyggda ord: vardagliga svenska ord, 4–8 bokstäver, med en ledtråd.
  const ORD = [
    ['BANAN', 'En frukt'], ['KATT', 'Ett husdjur'], ['LAMPA', 'Lyser upp rummet'], ['CYKEL', 'Ett fordon med två hjul'],
    ['VINTER', 'En årstid'], ['GITARR', 'Ett instrument med strängar'], ['KAFFE', 'En varm dryck'], ['SOFFA', 'Man sitter i den framför tv:n'],
    ['PIZZA', 'Italiensk mat'], ['REGN', 'Faller från himlen'], ['MOLN', 'Vitt eller grått på himlen'], ['FOTBOLL', 'En sport med boll och mål'],
    ['TELEFON', 'Man ringer med den'], ['SNÖGUBBE', 'Byggs på vintern'], ['STRAND', 'Sand vid havet'], ['BIBLIOTEK', 'Fullt av böcker'],
    ['KANIN', 'Ett djur med långa öron'], ['JORDGUBBE', 'Ett rött bär'], ['TÅRTA', 'Äts på födelsedagar'], ['FJÄRIL', 'En insekt med färgglada vingar'],
    ['SKOLA', 'Där barn lär sig'], ['GLASS', 'Kall och söt'], ['MÅNE', 'Lyser på natten'], ['STJÄRNA', 'Blinkar på himlen'],
    ['PENNA', 'Man skriver med den'], ['SPEGEL', 'Man ser sig själv i den'], ['TRÄD', 'Har stam och blad'], ['BLOMMA', 'Växer i trädgården'],
    ['DATOR', 'Man spelar och arbetar på den'], ['MUSIK', 'Något man lyssnar på'], ['KUDDE', 'Man sover på den'], ['TOFFEL', 'Varm sko inomhus']
  ];

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const klamp = (v, min, max, f) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : f; };
  const norm = s => String(s == null ? '' : s).normalize('NFC').trim().replace(/^[!#]+/, '').replace(/\s+/g, ' ').toLocaleUpperCase('sv-SE');

  // ---------- ren logik (provas utan DOM i tests/ordjakten.test.js) ----------
  // Streamerns egna ord: en rad per ord, "ORD; ledtråd". Bara bokstäver (även åäö), 2–20 tecken.
  function egnaOrd(text) {
    return String(text || '').split(/\r?\n/).map(r => r.split(';')).map(([o, l]) => [norm(o), String(l || '').trim().slice(0, 60)])
      .filter(([o]) => /^[\p{L}]{2,20}$/u.test(o)).slice(0, MAX_ORD);
  }
  function ordlista(w) {
    const egna = egnaOrd(w && w.ojOrd);
    if (w && w.ojBaraEgna && egna.length) return egna;
    return egna.concat(ORD);
  }
  // Ett frö ur text (FNV-1a) och en liten deterministisk slumpgenerator (mulberry32).
  function fro(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function slump(f) { let a = f >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function blanda(ord, runda) {
    const b = Array.from(ord);
    if (b.length < 2) return ord;
    const r = slump(fro(ord + '#' + runda));
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    const ut = b.join('');
    return ut === ord ? b.slice(1).concat(b[0]).join('') : ut;
  }
  // En runda: vilket ord, vilken blandning.
  function runda(w, nr) {
    const lista = ordlista(w), [ord, ledtrad] = lista[((nr % lista.length) + lista.length) % lista.length];
    return { nr, ord, ledtrad, blandat: blanda(ord, nr) };
  }
  // Vad en chattrad betyder: 'ratt' (gissningen), 'nasta'/'losning' (moderator) eller null.
  function tolka(e, ord) {
    const text = norm(e && (e.comment || e.text || ''));
    if (!text) return null;
    const mod = !!(e.isModerator || e.isHost);
    if (mod && /^(NÄSTA|NASTA|NEXT)$/.test(text)) return 'nasta';
    if (mod && /^(LÖSNING|LOSNING|SOLUTION)$/.test(text)) return 'losning';
    return text === ord ? 'ratt' : null;
  }

  // ---------- läget per widget ----------
  const LAGE = new Map();   // id → { nr, lost: null | {namn, sjalv}, poang: {uid: {namn, p}}, timer }
  const widgetar = () => { try { return (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) ? state.widgets.filter(w => w && w.type === TYP) : []; } catch (_) { return []; } };
  const hitta = id => widgetar().find(w => String(w.id) === String(id)) || null;
  function lage(w) {
    const id = String(w.id);
    let s = LAGE.get(id);
    if (!s) {
      s = { nr: 0, lost: null, poang: {}, timer: 0 };
      try { const sp = JSON.parse(localStorage.getItem(LAGRING + id) || 'null'); if (sp && Number.isInteger(sp.nr)) { s.nr = sp.nr; s.lost = sp.lost || null; s.poang = sp.poang || {}; } } catch (_) {}
      LAGE.set(id, s);
      if (s.lost) planeraNasta(w);
    }
    return s;
  }
  function spara(w) { const s = LAGE.get(String(w.id)); if (!s) return; try { localStorage.setItem(LAGRING + w.id, JSON.stringify({ nr: s.nr, lost: s.lost, poang: s.poang })); } catch (_) {} }
  // I OBS RITAS BARA DEN HÄR WIDGETENS EGNA NODER OM — ALDRIG HELA LAYOUTEN (2026-11-09).
  // render() bygger om varje widget i layouten. Under en sändning rev det allt annat som just spelade
  // (uppmätt med Match 1 vs 1, som gjorde samma sak varje sekund: Battle MVP syntes 0,8 s i stället
  // för 10 s och Top Gifts gåvovideo kom aldrig igång). I overlayn finns ingen panel att bygga om, så
  // där skrivs widgetens egen nod om med wh() — samma mönster som triggerBattleMvp i media.js.
  // I studion är det render() som förut: där ska panelen och katalogen följa med.
  function ritaEgna() {
    if (typeof wh !== 'function') return false;
    const noder = [...document.querySelectorAll('.widget[data-id]')];
    let alla = true;
    for (const w of widgetar()) {
      if (w.hidden) continue;
      const mina = noder.filter(n => n.dataset.id === String(w.id));
      if (!mina.length) { alla = false; continue; }
      const html = wh(w);
      for (const n of mina) n.outerHTML = html;
    }
    return alla;
  }
  const ritaOm = () => { try { if (OVERLAY && ritaEgna()) return; if (typeof render === 'function') render(); } catch (_) {} };
  function planeraNasta(w) {
    const s = lage(w);
    clearTimeout(s.timer);
    s.timer = setTimeout(() => { const lw = hitta(w.id); if (lw) nasta(lw); }, klamp(w.ojPaus, 2, 60, 8) * 1000);
  }
  function nasta(w) { const s = lage(w); clearTimeout(s.timer); s.nr += 1; s.lost = null; spara(w); ritaOm(); }
  function losning(w) { const s = lage(w); if (s.lost) return; s.lost = { namn: '', sjalv: true }; spara(w); ritaOm(); planeraNasta(w); }
  function vinnare(w, uid, namn) {
    const s = lage(w);
    if (s.lost) return false;
    const p = klamp(w.ojPoang, 1, 1000, 100);
    const rad = s.poang[uid] || (s.poang[uid] = { namn, p: 0 });
    rad.namn = namn; rad.p += p;
    s.lost = { namn, sjalv: false, p };
    spara(w); ritaOm(); planeraNasta(w);
    return true;
  }
  function nollstall(w) { const s = lage(w); clearTimeout(s.timer); s.nr = 0; s.lost = null; s.poang = {}; spara(w); ritaOm(); }
  // En chattrad mot en widget. Returnerar vad som hände (för proven).
  function hantera(w, e) {
    const s = lage(w), r = runda(w, s.nr), vad = tolka(e, r.ord);
    if (vad === 'nasta') { nasta(w); return 'nasta'; }
    if (vad === 'losning') { losning(w); return 'losning'; }
    if (vad === 'ratt' && !s.lost) {
      const uid = String(e.userId || e.username || '');
      if (!uid) return null;
      const namn = String(e.nickname || e.username || 'Tittare').slice(0, 40);
      return vinnare(w, uid, namn) ? 'vinst' : null;
    }
    return null;
  }

  // ---------- render ----------
  const oldWh = wh;
  wh = function (w) {
    if (!w || w.type !== TYP) return oldWh(w);
    const s = lage(w), r = runda(w, s.nr), lista = ordlista(w);
    const valt = !OVERLAY && typeof selected !== 'undefined' && selected === w.id;
    const skala = klamp(w.widgetScale, 0.1, 5, 1) * (klamp(w.width, 160, 900, 300) / 300);
    const bokstaver = Array.from(s.lost ? r.ord : r.blandat).map(c => `<span class="oj-bokstav">${esc(c)}</span>`).join('');
    const topp = Object.values(s.poang).sort((a, b) => b.p - a.p).slice(0, klamp(w.ojTopp, 0, 5, 3));
    const besked = !s.lost ? '' : s.lost.sjalv ? `Lösning: ${esc(r.ord)} · inga poäng` : `${esc(s.lost.namn)} löste ordet! +${s.lost.p}`;
    return `<div class="widget vyra-ordjakten${s.lost ? ' oj-lost' : ''}${valt ? ' selected' : ''}" data-id="${esc(w.id)}" style="left:${Number(w.x) || 0}px;top:${Number(w.y) || 0}px;zoom:${skala.toFixed(3)};z-index:${Number(w.layer) || 1}">`
      + `<div class="oj-kort"><div class="oj-meta"><span>${esc(String(w.ojRubrik == null ? 'ORDJAKTEN' : w.ojRubrik).slice(0, 24) || 'ORDJAKTEN')}</span><span>${(s.nr % lista.length) + 1} / ${lista.length}</span></div>`
      + `<div class="oj-titel">${s.lost ? 'Ordet var' : 'Ordna bokstäverna'}</div><div class="oj-bokstaver${Array.from(r.ord).length > 7 ? ' oj-langt' : ''}">${bokstaver}</div>`
      + `<div class="oj-tips">${esc(r.ledtrad)}${r.ledtrad ? ' · ' : ''}${Array.from(r.ord).length} bokstäver</div>`
      + `<div class="oj-besked">${besked || 'Skriv hela ordet i chatten'}</div>`
      + (topp.length ? `<ol class="oj-topp">${topp.map(t => `<li><span>${esc(t.namn)}</span><b>${t.p}</b></li>`).join('')}</ol>` : '')
      + `</div>` + (valt ? '<span class="resize-handle">↘</span>' : '') + '</div>';
  };

  // ---------- chatten ----------
  window.addEventListener('vyra-live-event', ev => {
    const e = ev && ev.detail;
    if (!e || String(e.type || '').toLowerCase().replace(/[\s_-]/g, '') !== 'chat' && String(e.type || '').toLowerCase() !== 'chatcommand') return;
    const at = Number(e.at || (e.timestamp && Date.parse(e.timestamp)));
    if (Number.isFinite(at) && at > 0 && Date.now() - at > FARSKT_MS) return;
    for (const w of widgetar()) if (!w.hidden) { try { hantera(w, e); } catch (_) {} }
  });

  // ---------- panelen ----------
  const oldProps = props;
  props = function () {
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!w || w.type !== TYP) return oldProps();
    const egna = egnaOrd(w.ojOrd).length;
    return `<h3>ORDJAKTEN</h3><div class="template-badge">CHATTEN GISSAR · LIVE</div><div hidden><input id="pt" value="Ordjakten"><input id="pv" value=""></div>`
      + `<div class="property-group"><h4>ORDEN</h4><label>Egna ord (ett per rad: ORD; ledtråd)<textarea id="ojOrd" rows="5" placeholder="BANAN; En frukt">${esc(w.ojOrd || '')}</textarea></label>`
      + `<small>${egna ? egna + ' egna ord.' : 'Inga egna ord ännu.'} ${ORD.length} inbyggda svenska ord finns också.</small>`
      + `<label><input id="ojBaraEgna" type="checkbox"${w.ojBaraEgna ? ' checked' : ''}> Använd bara mina egna ord</label></div>`
      + `<div class="property-group"><h4>REGLER</h4><label>Poäng för rätt svar<input id="ojPoang" type="number" min="1" max="1000" value="${klamp(w.ojPoang, 1, 1000, 100)}"></label>`
      + `<label>Paus före nästa ord (sekunder)<input id="ojPaus" type="number" min="2" max="60" value="${klamp(w.ojPaus, 2, 60, 8)}"></label>`
      + `<label>Visa topplista (antal)<input id="ojTopp" type="number" min="0" max="5" value="${klamp(w.ojTopp, 0, 5, 3)}"></label>`
      + `<small>Först med hela ordet i chatten vinner. Moderatorer skriver !nästa för nytt ord och !lösning för att visa ordet. Inga gåvokrav, inga priser.</small></div>`
      + `<div class="property-group"><h4>TEXT</h4><label>Rubrik<input id="ojRubrik" maxlength="24" value="${esc(w.ojRubrik == null ? 'ORDJAKTEN' : w.ojRubrik)}"></label></div>`
      + `<div class="property-group"><h4>TESTA</h4><button type="button" id="ojTestaRatt">Låt en testtittare svara rätt</button> <button type="button" id="ojNasta">Nästa ord</button> <button type="button" id="ojLosning">Visa lösning</button> <button type="button" id="ojNoll">Börja om</button><small>Bara här i studion. OBS styrs av chatten.</small></div>`
      + `<div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${Number(w.x) || 0}"></label><label>Y<input id="propY" type="number" value="${Number(w.y) || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${klamp(w.width, 160, 900, 300)}"></label><label>Lager<input id="propLayer" type="number" value="${Number(w.layer) || 1}"></label></div></div>`
      + `<button class="delete" id="del">Ta bort</button>`;
  };

  // ---------- katalogen ----------
  function katalog() {
    const cat = document.querySelector('.widget-catalog');
    if (!cat || cat.querySelector('[data-oj-skapa]')) return;
    const sek = document.createElement('section');
    sek.className = 'oj-katalog';
    sek.innerHTML = '<h4>ORDJAKTEN</h4>';
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.ojSkapa = '1'; b.dataset.catalogKey = 'catalog:vyrapaket:ordjakten';
    b.innerHTML = '<span><b>Ordjakten</b><small>Chatten gissar det blandade ordet – först rätt får poäng</small></span>';
    b.onclick = () => {
      if (!window.VyraWidgets || typeof state === 'undefined') return;
      const w = window.VyraWidgets.create('catalog:vyrapaket:ordjakten');
      state.widgets.push(w); selected = w.id;
      if (typeof save === 'function') save(); ritaOm();
      if (typeof toast === 'function') toast('Ordjakten tillagd');
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
    const satt = (falt, v) => { w[falt] = v; if (typeof save === 'function') save(); ritaOm(); };
    let el;
    if ((el = q('#ojOrd'))) el.onchange = e => satt('ojOrd', String(e.target.value || '').slice(0, 8000));
    if ((el = q('#ojBaraEgna'))) el.onchange = e => satt('ojBaraEgna', e.target.checked);
    if ((el = q('#ojPoang'))) el.onchange = e => satt('ojPoang', klamp(Math.round(+e.target.value), 1, 1000, 100));
    if ((el = q('#ojPaus'))) el.onchange = e => satt('ojPaus', klamp(Math.round(+e.target.value), 2, 60, 8));
    if ((el = q('#ojTopp'))) el.onchange = e => satt('ojTopp', klamp(Math.round(+e.target.value), 0, 5, 3));
    if ((el = q('#ojRubrik'))) el.onchange = e => satt('ojRubrik', String(e.target.value || '').slice(0, 24));
    if ((el = q('#ojTestaRatt'))) el.onclick = () => { const r = runda(w, lage(w).nr); hantera(w, { type: 'chat', userId: 'test-1', username: 'testtittare', nickname: 'Testtittare', comment: r.ord }); };
    if ((el = q('#ojNasta'))) el.onclick = () => nasta(w);
    if ((el = q('#ojLosning'))) el.onclick = () => losning(w);
    if ((el = q('#ojNoll'))) el.onclick = () => nollstall(w);
  };

  // Stillbild för pixelvakten: första rundan, olöst, ingen topplista.
  function stilla() { for (const w of widgetar()) { const s = lage(w); clearTimeout(s.timer); s.nr = 0; s.lost = null; s.poang = {}; } ritaOm(); return document.querySelectorAll('.vyra-ordjakten').length; }

  window.VyraOrdjakten = Object.freeze({ typ: TYP, ORD, norm, egnaOrd, ordlista, blanda, runda, tolka, hantera, lage, nasta, losning, nollstall, stilla, _lage: LAGE });
  ritaOm();
})();
