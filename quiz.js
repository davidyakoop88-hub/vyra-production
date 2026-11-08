// quiz.js — QUIZ (David 2026-11-07, sparad prototyp "Quiz"). En egen widgettyp, templateQuiz, med tre designer:
// Frågerad, Spelkort och Quiz Show. Tre startpaket (Allmänbildning, Sport, Gaming) med källor, plus egna frågor.
//
// GRATIS ANMÄLAN. Alla som svarar A, B eller C i chatten är med. Prototypens gåvokrav byggs INTE: en gåva som
// villkor för att få delta kan bryta mot TikToks LIVE-regler, och det ska kontrolleras innan det övervägs.
// Inga priser och inga utbetalningar.
//
// EN MODERATOR STARTAR OMGÅNGEN med !quiz i chatten (eller streamern med ▶ i studion, bara studion). Sedan går
// frågorna av sig själva: svarsfönster (standard 20 s), rättning och paus (standard 6 s), till slutställningen.
// Ett svar per tittare och fråga — det första räknas, och poängen nycklas på userId.
//
// SAMMA RESULTAT I VARJE OBS-KÄLLA. Tidslinjen räknas från startkommandots tidsstämpel (servertid) och varje svar
// bedöms på sin egen tidsstämpel — inte på när en viss webbläsare råkade få det. Svarsalternativens ordning är
// bestämd av ett frö (frågans id + omgångens start), aldrig Math.random. Läget överlever en omladdning.
(function () {
  'use strict';
  if (typeof wh !== 'function' || window.VyraQuiz) return;

  const TYP = 'templateQuiz';
  const OVERLAY = (() => { try { return document.documentElement.classList.contains('overlay-output') || new URLSearchParams(location.search).has('overlay'); } catch (_) { return false; } })();
  const DESIGNER = [['fragerad', 'Frågerad', 'Smal rad med turkos kant'], ['spelkort', 'Spelkort', 'Ljust kort som en spelbiljett'], ['quizshow', 'Quiz Show', 'Blå tv-studio med runda svar']];
  const DESIGN = Object.fromEntries(DESIGNER.map(d => [d[0], d]));
  const FARSKT_MS = 15000, LAGRING = 'vyra-quiz-', BOKSTAVER = ['A', 'B', 'C'];
  // Prototypens tre startpaket, med källorna ordagrant.
  const PAKET = {
    allman: { namn: 'Allmänbildning', fragor: [
      ['g1', 'Vilken planet kallas den röda planeten?', ['Venus', 'Mars', 'Jupiter'], 1, 'https://science.nasa.gov/mars/facts/'],
      ['g2', 'Vilken är solsystemets största planet?', ['Jorden', 'Saturnus', 'Jupiter'], 2, 'https://science.nasa.gov/jupiter/'],
      ['g3', 'Hur många sidor har en hexagon?', ['Fem', 'Sex', 'Åtta'], 1, 'Matematisk definition: hexagon är en sexhörning.']] },
    sport: { namn: 'Sport', fragor: [
      ['s1', 'Hur många spelare får ett lag högst ha på planen i vanlig elvamannafotboll?', ['Nio', 'Elva', 'Tretton'], 1, 'https://www.theifab.com/laws/latest/the-players/'],
      ['s2', 'Hur många spelare per lag är på planen i vanlig 5 mot 5-basket?', ['Fem', 'Sex', 'Sju'], 0, 'https://about.fiba.basketball/en/our-sport/official-basketball-rules'],
      ['s3', 'Vilken av dessa sporter spelas med en basketboll?', ['Badminton', 'Basket', 'Ishockey'], 1, 'https://about.fiba.basketball/en/our-sport/official-basketball-rules']] },
    gaming: { namn: 'Gaming', fragor: [
      ['v1', 'Vad heter Marios bror?', ['Wario', 'Toad', 'Luigi'], 2, 'https://mario.nintendo.com/ca/characters/'],
      ['v2', 'Vilken typ har Pikachu i Pokémon-spelen?', ['Eld', 'Elektrisk', 'Vatten'], 1, 'https://www.pokemon.com/uk/pokedex/pikachu'],
      ['v3', 'Vilken Minecraft-varelse är känd för att explodera?', ['Creeper', 'Ko', 'Bybo'], 0, 'https://www.minecraft.net/en-us/article/meet-creeper']] }
  };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const klamp = (v, min, max, f) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : f; };
  const norm = s => String(s == null ? '' : s).normalize('NFC').trim().replace(/^[!#]+/, '').replace(/\s+/g, ' ').toLocaleUpperCase('sv-SE');
  const design = w => DESIGN[w && w.qzDesign] ? w.qzDesign : 'fragerad';
  const tider = w => ({ svar: klamp(w && w.qzTid, 10, 60, 20) * 1000, paus: klamp(w && w.qzPaus, 3, 30, 6) * 1000 });

  // ---------- ren logik (provas utan DOM i tests/quiz.test.js) ----------
  // Egna frågor: en per rad, "Fråga | svar A | svar B | svar C | rätt bokstav".
  function egnaFragor(text) {
    return String(text || '').split(/\r?\n/).map((rad, i) => rad.split('|').map(x => x.trim())).map((d, i) => {
      if (d.length < 5) return null;
      const ratt = BOKSTAVER.indexOf(norm(d[4]));
      if (ratt < 0 || !d[0] || !d[1] || !d[2] || !d[3]) return null;
      return ['e' + i, d[0].slice(0, 140), [d[1], d[2], d[3]].map(x => x.slice(0, 60)), ratt, ''];
    }).filter(Boolean).slice(0, 50);
  }
  function fragor(w) {
    const egna = egnaFragor(w && w.qzEgna);
    if (w && w.qzPaket === 'egna') return egna;
    const p = PAKET[w && w.qzPaket] || PAKET.allman;
    return p.fragor.slice(0, klamp(w && w.qzAntal, 1, 10, p.fragor.length));
  }
  function fro(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function slump(f) { let a = f >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // Svarsalternativen i en bestämd ordning för just den här omgången. Returnerar [{text, ratt}] i visningsordning.
  function alternativ(fraga, start) {
    const r = slump(fro(fraga[0] + '#' + start)), ordning = [0, 1, 2];
    for (let i = 2; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ordning[i], ordning[j]] = [ordning[j], ordning[i]]; }
    return ordning.map(k => ({ text: fraga[2][k], ratt: k === fraga[3] }));
  }
  // Var i tidslinjen är vi? { fas: 'vila'|'fraga'|'svar'|'slut', i, kvar } — bara ur start och klockan.
  function fas(w, start, nu) {
    if (!start) return { fas: 'vila', i: -1, kvar: 0 };
    const n = fragor(w).length, t = tider(w), varv = t.svar + t.paus, gatt = nu - start;
    if (gatt < 0) return { fas: 'vila', i: -1, kvar: 0 };
    const i = Math.floor(gatt / varv);
    if (i >= n) return { fas: 'slut', i: n - 1, kvar: 0 };
    const inne = gatt - i * varv;
    return inne < t.svar ? { fas: 'fraga', i, kvar: Math.ceil((t.svar - inne) / 1000) } : { fas: 'svar', i, kvar: 0 };
  }
  // Vad en chattrad betyder: { start } (moderatorns !quiz), { svar: 0..2 } eller null.
  function tolka(e) {
    const text = norm(e && (e.comment || e.text || ''));
    if (!text) return null;
    if ((e.isModerator || e.isHost) && /^(QUIZ|STARTA QUIZ)$/.test(text)) return { start: true };
    const k = BOKSTAVER.indexOf(text);
    return k >= 0 ? { svar: k } : null;
  }

  // ---------- läget per widget ----------
  const LAGE = new Map();   // id → { start, svar: {i: {uid: k}}, namn: {uid: namn} }
  const widgetar = () => { try { return (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) ? state.widgets.filter(w => w && w.type === TYP) : []; } catch (_) { return []; } };
  function lage(w) {
    const id = String(w.id);
    let s = LAGE.get(id);
    if (!s) {
      s = { start: 0, svar: {}, namn: {} };
      try { const sp = JSON.parse(localStorage.getItem(LAGRING + id) || 'null'); if (sp && Number.isFinite(sp.start)) { s.start = sp.start; s.svar = sp.svar || {}; s.namn = sp.namn || {}; } } catch (_) {}
      LAGE.set(id, s);
    }
    return s;
  }
  function spara(w) { const s = LAGE.get(String(w.id)); if (!s) return; try { localStorage.setItem(LAGRING + w.id, JSON.stringify(s)); } catch (_) {} }
  // Poängen: frågor som är rättade (fas svar/slut efter dem), rätt svar ger qzPoang.
  function poang(w, nu) {
    const s = lage(w), f = fas(w, s.start, nu), lista = fragor(w), p = klamp(w.qzPoang, 1, 1000, 100), ut = {};
    for (let i = 0; i < lista.length; i++) {
      const rattad = f.fas === 'slut' || i < f.i || (i === f.i && f.fas === 'svar');
      if (!rattad) break;
      const alt = alternativ(lista[i], s.start), rattK = alt.findIndex(a => a.ratt);
      for (const [uid, k] of Object.entries(s.svar[i] || {})) if (k === rattK) ut[uid] = (ut[uid] || 0) + p;
    }
    return Object.entries(ut).map(([uid, p]) => ({ uid, namn: s.namn[uid] || 'Tittare', p })).sort((a, b) => b.p - a.p || a.namn.localeCompare(b.namn, 'sv'));
  }
  function starta(w, at) { const s = lage(w); s.start = Number(at) || Date.now(); s.svar = {}; s.namn = {}; spara(w); ritaOm(); }
  function nollstall(w) { const s = lage(w); s.start = 0; s.svar = {}; s.namn = {}; spara(w); ritaOm(); }
  // En chattrad mot en widget, bedömd på radens egen tid. Returnerar vad som hände.
  function hantera(w, e, nu) {
    const t = tolka(e), at = Number(e && e.at) || nu || Date.now();
    if (!t) return null;
    if (t.start) { const f = fas(w, lage(w).start, at); if (f.fas === 'fraga' || f.fas === 'svar') return null; starta(w, at); return 'start'; }
    const s = lage(w), f = fas(w, s.start, at);
    if (f.fas !== 'fraga') return null;
    const uid = String(e.userId || e.username || '');
    if (!uid) return null;
    const svar = s.svar[f.i] || (s.svar[f.i] = {});
    if (uid in svar) return 'redan';
    svar[uid] = t.svar;
    s.namn[uid] = String(e.nickname || e.username || 'Tittare').slice(0, 40);
    spara(w);
    return 'svar';
  }
  const ritaOm = () => { try { if (typeof render === 'function') render(); } catch (_) {} };

  // ---------- render ----------
  let STILLA = false;
  const oldWh = wh;
  wh = function (w) {
    if (!w || w.type !== TYP) return oldWh(w);
    const s = lage(w), nu = Date.now(), lista = fragor(w);
    let f = STILLA ? { fas: 'fraga', i: 0, kvar: tider(w).svar / 1000 } : fas(w, s.start, nu);
    const visa = f.fas === 'vila' ? (OVERLAY ? null : { fas: 'vila', i: 0 }) : f;
    const valt = !OVERLAY && typeof selected !== 'undefined' && selected === w.id;
    const skala = klamp(w.widgetScale, 0.1, 5, 1) * (klamp(w.width, 180, 900, 300) / 300);
    const kropp = (() => {
      if (!lista.length) return '<div class="qz-fraga">Inga frågor ännu</div><div class="qz-tips">Välj ett paket eller skriv egna frågor i panelen.</div>';
      if (!visa) return '';
      if (visa.fas === 'slut') {
        const topp = poang(w, nu).slice(0, 3);
        return `<div class="qz-fraga">Slutställning</div>` + (topp.length ? `<ol class="qz-topp">${topp.map(t => `<li><span>${esc(t.namn)}</span><b>${t.p}</b></li>`).join('')}</ol>` : '<div class="qz-tips">Ingen svarade rätt den här gången.</div>');
      }
      const fr = lista[Math.max(0, visa.i)], alt = alternativ(fr, s.start || 0), rattad = visa.fas === 'svar';
      const antal = Object.keys(s.svar[visa.i] || {}).length;
      return `<div class="qz-fraga">${esc(fr[1])}</div><div class="qz-alt">${alt.map((a, k) => `<div class="qz-rad${rattad ? (a.ratt ? ' qz-ratt' : ' qz-fel') : ''}"><b>${BOKSTAVER[k]}</b><span>${esc(a.text)}</span></div>`).join('')}</div>`
        + `<div class="qz-tips">${visa.fas === 'vila' ? 'En moderator skriver !quiz i chatten för att starta' : rattad ? 'Rätt svar: ' + BOKSTAVER[alt.findIndex(a => a.ratt)] : 'Skriv A, B eller C · ett svar per person'}${visa.fas !== 'vila' ? ' · ' + antal + ' svar' : ''}</div>`;
    })();
    const topp = visa && visa.fas !== 'slut' && visa.fas !== 'vila' ? poang(w, nu).slice(0, 1) : [];
    return `<div class="widget vyra-quiz qz-${design(w)}${visa ? '' : ' qz-dold'}${valt ? ' selected' : ''}" data-id="${esc(w.id)}" style="left:${Number(w.x) || 0}px;top:${Number(w.y) || 0}px;zoom:${skala.toFixed(3)};z-index:${Number(w.layer) || 1}">`
      + `<div class="qz-kort"><div class="qz-topprad"><span>${visa && visa.fas !== 'slut' && visa.fas !== 'vila' ? 'FRÅGA ' + (visa.i + 1) + ' / ' + lista.length : esc(String(w.qzRubrik == null ? 'QUIZ' : w.qzRubrik).slice(0, 24) || 'QUIZ')}</span>`
      + `<span class="qz-klocka">${visa && visa.fas === 'fraga' ? visa.kvar + ' s' : visa && visa.fas === 'svar' ? 'RÄTTNING' : visa && visa.fas === 'slut' ? 'KLART' : 'SVARA I CHATTEN'}</span></div>`
      + kropp + (topp.length ? `<div class="qz-ledare">Leder: ${esc(topp[0].namn)} · ${topp[0].p}</div>` : '') + `</div>`
      + (valt ? '<span class="resize-handle">↘</span>' : '') + '</div>';
  };
  // Klockan: rita om varje sekund medan en omgång pågår (bara då).
  let senastFas = '';
  setInterval(() => {
    if (STILLA) return;
    const nu = Date.now();
    const aktiv = widgetar().filter(w => !w.hidden && lage(w).start && fas(w, lage(w).start, nu).fas !== 'vila');
    const nyckel = aktiv.map(w => { const f = fas(w, lage(w).start, nu); return w.id + f.fas + f.i + f.kvar; }).join('|');
    if (nyckel !== senastFas) { senastFas = nyckel; if (aktiv.length) ritaOm(); }
  }, 500);

  // ---------- chatten ----------
  window.addEventListener('vyra-live-event', ev => {
    const e = ev && ev.detail;
    if (!e) return;
    const typ = String(e.type || '').toLowerCase();
    if (typ !== 'chat' && typ !== 'chatcommand') return;
    const at = Number(e.at || (e.timestamp && Date.parse(e.timestamp)));
    if (Number.isFinite(at) && at > 0 && Date.now() - at > FARSKT_MS) return;
    for (const w of widgetar()) if (!w.hidden) { try { if (hantera(w, e, Date.now())) ritaOm(); } catch (_) {} }
  });

  // ---------- panelen ----------
  const oldProps = props;
  props = function () {
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!w || w.type !== TYP) return oldProps();
    const lista = fragor(w), d = design(w);
    const paket = w.qzPaket === 'egna' ? 'egna' : PAKET[w.qzPaket] ? w.qzPaket : 'allman';
    return `<h3>QUIZ</h3><div class="template-badge">CHATTEN SVARAR A, B ELLER C · LIVE</div><div hidden><input id="pt" value="Quiz"><input id="pv" value=""></div>`
      + `<div class="property-group"><h4>FRÅGORNA</h4><label>Paket<select id="qzPaket">${Object.entries(PAKET).map(([k, p]) => `<option value="${k}"${k === paket ? ' selected' : ''}>${esc(p.namn)} · ${p.fragor.length} frågor</option>`).join('')}<option value="egna"${paket === 'egna' ? ' selected' : ''}>Egna frågor</option></select></label>`
      + `<label>Egna frågor (en per rad: Fråga | A | B | C | rätt bokstav)<textarea id="qzEgna" rows="4" placeholder="Vilken färg har himlen? | Grön | Blå | Röd | B">${esc(w.qzEgna || '')}</textarea></label>`
      + `<small>${lista.length} frågor i omgången.${paket !== 'egna' ? ' Källor finns för startpaketens frågor.' : ''}</small></div>`
      + `<div class="property-group"><h4>OMGÅNGEN</h4><label>Svarstid per fråga (sekunder)<input id="qzTid" type="number" min="10" max="60" value="${tider(w).svar / 1000}"></label>`
      + `<label>Paus efter rättningen (sekunder)<input id="qzPaus" type="number" min="3" max="30" value="${tider(w).paus / 1000}"></label>`
      + `<label>Poäng för rätt svar<input id="qzPoang" type="number" min="1" max="1000" value="${klamp(w.qzPoang, 1, 1000, 100)}"></label>`
      + `<small>En moderator startar med !quiz i chatten. Alla som svarar A, B eller C är med — ingen gåva krävs, inga priser. Ett svar per person och fråga; det första räknas.</small></div>`
      + `<div class="property-group"><h4>DESIGN</h4><label>Design<select id="qzDesign">${DESIGNER.map(x => `<option value="${x[0]}"${x[0] === d ? ' selected' : ''}>${esc(x[1])}</option>`).join('')}</select></label><label>Rubrik<input id="qzRubrik" maxlength="24" value="${esc(w.qzRubrik == null ? 'QUIZ' : w.qzRubrik)}"></label></div>`
      + `<div class="property-group"><h4>TESTA</h4><button type="button" id="qzStarta">▶ Starta här</button> <button type="button" id="qzTestsvar">Låt testtittare svara</button> <button type="button" id="qzNoll">Nollställ</button><small>Bara här i studion. I OBS startar en moderator med !quiz.</small></div>`
      + `<div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${Number(w.x) || 0}"></label><label>Y<input id="propY" type="number" value="${Number(w.y) || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${klamp(w.width, 180, 900, 300)}"></label><label>Lager<input id="propLayer" type="number" value="${Number(w.layer) || 1}"></label></div></div>`
      + `<button class="delete" id="del">Ta bort</button>`;
  };

  // ---------- katalogen ----------
  function katalog() {
    const cat = document.querySelector('.widget-catalog');
    if (!cat || cat.querySelector('[data-qz-skapa]')) return;
    const sek = document.createElement('section');
    sek.className = 'qz-katalog';
    sek.innerHTML = '<h4>QUIZ</h4>';
    DESIGNER.forEach(([id, namn, text]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.qzSkapa = id; b.dataset.catalogKey = 'catalog:vyrapaket:quiz:' + id;
      b.innerHTML = `<span><b>Quiz · ${esc(namn)}</b><small>${esc(text)}</small></span>`;
      b.onclick = () => {
        if (!window.VyraWidgets || typeof state === 'undefined') return;
        const w = window.VyraWidgets.create('catalog:vyrapaket:quiz:' + id);
        state.widgets.push(w); selected = w.id;
        if (typeof save === 'function') save(); ritaOm();
        if (typeof toast === 'function') toast('Quiz · ' + namn + ' tillagd');
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
    const satt = (falt, v) => { w[falt] = v; if (typeof save === 'function') save(); ritaOm(); };
    let el;
    if ((el = q('#qzPaket'))) el.onchange = e => satt('qzPaket', e.target.value === 'egna' || PAKET[e.target.value] ? e.target.value : 'allman');
    if ((el = q('#qzEgna'))) el.onchange = e => satt('qzEgna', String(e.target.value || '').slice(0, 10000));
    if ((el = q('#qzTid'))) el.onchange = e => satt('qzTid', klamp(Math.round(+e.target.value), 10, 60, 20));
    if ((el = q('#qzPaus'))) el.onchange = e => satt('qzPaus', klamp(Math.round(+e.target.value), 3, 30, 6));
    if ((el = q('#qzPoang'))) el.onchange = e => satt('qzPoang', klamp(Math.round(+e.target.value), 1, 1000, 100));
    if ((el = q('#qzDesign'))) el.onchange = e => satt('qzDesign', DESIGN[e.target.value] ? e.target.value : 'fragerad');
    if ((el = q('#qzRubrik'))) el.onchange = e => satt('qzRubrik', String(e.target.value || '').slice(0, 24));
    if ((el = q('#qzStarta'))) el.onclick = () => starta(w, Date.now());
    if ((el = q('#qzTestsvar'))) el.onclick = () => { ['A', 'B', 'C'].forEach((b, i) => hantera(w, { type: 'chat', userId: 'test-' + i, nickname: 'Testtittare ' + (i + 1), comment: b, at: Date.now() }, Date.now())); ritaOm(); };
    if ((el = q('#qzNoll'))) el.onclick = () => nollstall(w);
  };

  // Stillbild för pixelvakten: första frågan öppen, full tid kvar, inga svar.
  function stilla() { STILLA = true; for (const w of widgetar()) { const s = lage(w); s.start = 1; s.svar = {}; s.namn = {}; } ritaOm(); return document.querySelectorAll('.vyra-quiz').length; }

  window.VyraQuiz = Object.freeze({ typ: TYP, DESIGNER, PAKET, egnaFragor, fragor, alternativ, fas, tolka, hantera, poang, lage, starta, nollstall, stilla, _lage: LAGE });
  ritaOm();
})();
