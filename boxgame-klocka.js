// boxgame-klocka.js — BOXGAME-KLOCKA: rondtimer med alert och ljud (Davids playground "boxgame-clock",
// överlämnad 2026-10-25). En egen widgettyp, templateBoxgameClock.
//
// EN TIMER, TVÅ SKÄRMAR. Studion styr (start, paus, återställ, rondlängd) och OBS-länken visar. OBS är
// en annan webbläsare, så det enda som delas är widgetens fält i state, som når overlayn via molnet
// (cloud-sync.js → SSE-signal → overlay-config-sync.js, ungefär 2,5–3,5 s). Därför sparas aldrig en
// räknare som tickar, utan ett ABSOLUT SLUT (`boxSlut`, epoch-ms, se nu() nedan). Båda skärmarna
// räknar fram samma sekund ur det, oavsett när ändringen kom fram eller om OBS laddades om mitt i ronden.
//   boxKor   true medan ronden går (även efter noll — då är den slut, inte pausad)
//   boxSlut  epoch-ms när ronden når noll (bara meningsfull när boxKor)
//   boxKvarMs  tid kvar när ronden står still (pausad eller återställd)
//
// LJUDET SPELAS EN GÅNG. Bara overlayn spelar ljud (studion är tyst, utom Provlyssna), och bara den
// första synliga Boxgame-klockan på sidan. Sifferutropen är ett enda röstklipp (Jack Sterling, ett ord
// per sekund: TWENTY vid 0 s … ONE vid 19 s, var och ett 0,04 s efter hel sekund) som spelas i
// skivor; slutklockan är designens tre slag (0, 0,48 och 0,96 s). Båda schemaläggs i AudioContext på
// exakt den sekund siffran byts, inte när nästa tick råkar komma.
(function () {
  'use strict';
  if (typeof wh !== 'function' || window.VyraBoxgame) return;

  const TYP = 'templateBoxgameClock';
  const OVERLAY = new URLSearchParams(location.search).has('overlay');
  const ROST_URL = 'assets/sounds/boxgame/nedrakning-jack.mp3';
  const KLOCKA_URL = 'assets/sounds/boxgame/slutklocka.mp3';
  const SLUTALERT_MS = 3200;            // TIME'S UP! tonas bort på 3,2 s (designens end-title)
  // DATORNS KLOCKA, INTE SERVERNS. Skattkistan räknar mot VyraLive.serverNu(), men den uppskattningen
  // förfinas i hopp (live-client.js mäter mot Date-headern, 1 s upplösning): uppmätt 2026-10-25 svängde
  // den 1,3 s på 16 s, och klockan visade 12 → 11 → 12 med sifferutrop som hoppades över. Varje flik
  // uppskattar dessutom för sig, så studion och OBS kunde skilja en hel sekund. Datorns klocka går
  // jämnt, och studion och OBS sitter nästan alltid på samma dator — då visar de exakt samma sekund.
  // Två datorer med internettid skiljer bråkdelar av en sekund.
  const nu = () => Date.now();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const klamp = (v, min, max, f) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : f; };
  const minuter = w => klamp(w.boxMinuter, 1, 120, 5);
  const rondMs = w => minuter(w) * 60000;

  // ---------- läget, räknat ur fälten och klockan ----------
  function lage(w, t = nu()) {
    const helRond = rondMs(w);
    if (w.boxKor && Number(w.boxSlut) > 0) {
      const kvarMs = Math.max(0, w.boxSlut - t);
      return { kor: kvarMs > 0, slut: kvarMs === 0, kvarMs, helRond, sedanSlut: t - w.boxSlut };
    }
    const kvarMs = klamp(w.boxKvarMs, 0, helRond, helRond);
    return { kor: false, slut: false, kvarMs, helRond, sedanSlut: Infinity };
  }
  const sekunder = l => Math.ceil(l.kvarMs / 1000);
  const tidText = s => s <= 20 ? String(s).padStart(2, '0') : String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');

  // ---------- markup ----------
  // Allt som byts per sekund ritas av visa() nedan, både vid render() och av tickern, så första
  // bildrutan och alla följande är samma funktion.
  function klockHtml(w) {
    return `<section class="bgx-klocka"><div class="bgx-topp"><span class="bgx-lampa"></span>BOXGAME<span class="bgx-rond">ROUND • ${String(klamp(w.boxRond, 1, 99, 1)).padStart(2, '0')}</span></div>`
      + `<div class="bgx-tid" role="timer" aria-label="Tid kvar"></div><div class="bgx-domare"></div><div class="bgx-status"></div>`
      + `<div class="bgx-spar"><div></div></div><div class="bgx-botten"><span class="bgx-motto"></span><span class="bgx-lage"></span></div></section>`;
  }
  const oldWh = wh;
  wh = function (w) {
    if (!w || w.type !== TYP) return oldWh(w);
    const width = klamp(w.width, 200, 900, 340);
    const valt = typeof selected !== 'undefined' && selected === w.id;
    const utanKlocka = w.boxVisaKlocka === false;
    const html = `<div class="widget vyra-boxgame${utanKlocka ? ' bgx-bara-alert' : ''}${valt ? ' selected' : ''}" data-id="${esc(w.id)}" `
      + `style="left:${Number(w.x) || 0}px;top:${Number(w.y) || 0}px;width:${width}px;--bgx-z:${(width / 340).toFixed(3)};--bgx-alert:${klamp(w.boxAlertSkala, 40, 300, 100) / 100}">`
      + `${utanKlocka ? '' : klockHtml(w)}<div class="bgx-alertlager" aria-live="off"></div>${valt ? '<span class="resize-handle">↘</span>' : ''}</div>`;
    return html;
  };

  // visa(): skriver det som hör till just nu i en rot. Skriver bara det som ändrats — en identisk
  // skrivning är också en DOM-mutation, och flera observatörer (aktivering, livepatchar) lyssnar.
  function visa(rot, w, t = nu()) {
    const l = lage(w, t), s = sekunder(l), skarp = s <= 20 && s > 0;
    const alertNyckel = l.kor && s > 0 && s <= 10 ? 'n' + s : l.slut && l.sedanSlut < SLUTALERT_MS ? 'slut' : '';
    const minne = rot.__bgx || (rot.__bgx = {});
    const satt = (sel, txt) => { const el = rot.querySelector(sel); if (el && el.textContent !== txt) el.textContent = txt; };
    const klass = (k, pa) => { if (rot.classList.contains(k) !== pa) rot.classList.toggle(k, pa); };
    klass('bgx-skarp', skarp); klass('bgx-klar', s === 0); klass('bgx-alert-pa', !!alertNyckel);
    satt('.bgx-tid', tidText(s));
    satt('.bgx-status', s === 0 ? 'KNOCKOUT' : s <= 10 && l.kor ? 'Referee counting…' : l.kor ? (s <= 20 ? 'Slutspurten är igång' : 'Ronden pågår') : l.kvarMs < l.helRond ? 'Pausad' : 'Redo för nästa rond');
    satt('.bgx-motto', skarp ? 'FINAL SECONDS' : s === 0 ? 'TIME IS UP' : 'FIGHT FOR EVERY SECOND');
    satt('.bgx-lage', l.kor ? 'LIVE' : s === 0 ? 'FINISHED' : 'STANDBY');
    const domare = rot.querySelector('.bgx-domare');
    if (domare) {
      const d = s <= 10 && s > 0 ? String(s) : '';
      if (minne.domare !== d) { minne.domare = d; domare.innerHTML = d ? `<div class="bgx-domarrad">REFEREE COUNT <b>${d}</b></div>` : ''; }
    }
    const spar = rot.querySelector('.bgx-spar>div');
    if (spar) { const b = Math.min(100, l.kvarMs / l.helRond * 100).toFixed(1) + '%'; if (spar.style.width !== b) spar.style.width = b; }
    // Alerten byggs om när siffran byts, så designens slaganimation startar om för varje sekund.
    if (minne.alert !== alertNyckel) {
      minne.alert = alertNyckel;
      const lager = rot.querySelector('.bgx-alertlager');
      if (lager) lager.innerHTML = alertNyckel === 'slut'
        ? '<div class="bgx-slutalert"><span class="bgx-kicker">ROUND OVER</span><strong>TIME’S<br>UP!</strong></div>'
        : alertNyckel ? `<div class="bgx-nedalert"><span class="bgx-kicker">FINAL COUNTDOWN</span><strong>${s}</strong><span class="bgx-rad">MAKE IT COUNT</span></div>`
        : (!OVERLAY && rot.classList.contains('bgx-bara-alert') ? '<div class="bgx-vila">Alerten visas under sista 10 sekunderna</div>' : '');
    }
    return l;
  }

  // ---------- ljud (bara i overlayn, bara den första synliga klockan) ----------
  let ctx = null;
  const buffertar = {};
  function ljudCtx() {
    if (!ctx) { const K = window.AudioContext || window.webkitAudioContext; if (!K) return null; ctx = new K(); }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (_) {} }
    return ctx;
  }
  function buffert(url) {
    if (buffertar[url]) return buffertar[url];
    const c = ljudCtx();
    buffertar[url] = c ? fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.arrayBuffer(); })
      .then(b => new Promise((ok, fel) => c.decodeAudioData(b, ok, fel))).catch(e => { delete buffertar[url]; throw e; }) : Promise.reject(new Error('ingen AudioContext'));
    return buffertar[url];
  }
  const schemalagt = new Map();          // nyckel → { kalla, slutar }
  function spela(url, nar, offset, langd, volym, nyckel) {
    if (schemalagt.has(nyckel)) return;
    schemalagt.set(nyckel, { kalla: null, slutar: nar + (langd || 3) * 1000 + 500 });
    buffert(url).then(b => {
      const post = schemalagt.get(nyckel); if (!post) return;
      const c = ljudCtx(); if (!c) return;
      const fordrojning = (nar - nu()) / 1000;
      if (fordrojning < -0.15) { schemalagt.delete(nyckel); return; }   // för sent — tyst hellre än i otakt
      const k = c.createBufferSource(), g = c.createGain();
      k.buffer = b; g.gain.value = volym; k.connect(g); g.connect(c.destination);
      k.start(c.currentTime + Math.max(0, fordrojning), offset || 0, langd || undefined);
      post.kalla = k;
      k.onended = () => { try { k.disconnect(); g.disconnect(); } catch (_) {} };
    }).catch(() => schemalagt.delete(nyckel));
  }
  function tystaUtom(behall) {
    for (const [nyckel, post] of schemalagt) {
      if (behall(nyckel) && post.slutar > nu()) continue;
      if (post.kalla) { try { post.kalla.stop(); } catch (_) {} }
      schemalagt.delete(nyckel);
    }
  }
  // Schemalägger det som ska höras inom kort: sifferutropen när siffran byts och slutklockan vid noll.
  // Nyckeln bär boxSlut, så en paus eller ny rond (nytt boxSlut) tystar det som redan låg i kö.
  function ljudFor(w, l) {
    const prefix = `${w.id}:${w.boxSlut}:`;
    if (!l.kor && !l.slut) return tystaUtom(() => false);   // pausad eller återställd: tyst direkt
    tystaUtom(k => k.startsWith(prefix));                    // allt från en tidigare rond tystas
    if (l.slut && l.sedanSlut > 400) return;                 // slutklockan får ringa ut, inget nytt
    const t = nu(), volym = klamp(w.boxVolym, 0, 100, 70) / 100, fran = w.boxRostFran === 20 ? 20 : 10;
    if (volym <= 0) return;
    for (let n = 0; n <= fran; n++) {
      const nar = w.boxSlut - n * 1000, fram = nar - t;
      if (fram > 400 || fram < -120) continue;
      if (n === 0) { if (w.boxKlocka !== false) spela(KLOCKA_URL, nar, 0, 0, volym, prefix + 'klocka'); }
      else if (w.boxRost !== false) spela(ROST_URL, nar, 20 - n, 0.98, volym, prefix + n);
    }
  }

  // ---------- tickern ----------
  function ljudagare() {
    if (!OVERLAY || typeof state === 'undefined' || !state || !Array.isArray(state.widgets)) return null;
    return state.widgets.find(w => w && w.type === TYP && !w.hidden && document.querySelector(`.vyra-boxgame[data-id="${w.id}"]:not(.widget-hidden)`)) || null;
  }
  function tick() {
    if (typeof state === 'undefined' || !state || !Array.isArray(state.widgets)) return;
    const t = nu();
    document.querySelectorAll('.vyra-boxgame[data-id]').forEach(rot => {
      const w = state.widgets.find(x => x && x.id === rot.dataset.id && x.type === TYP);
      if (w) visa(rot, w, t);
    });
    if (OVERLAY) {
      const agare = ljudagare();
      if (agare) ljudFor(agare, lage(agare, t)); else if (schemalagt.size) tystaUtom(() => false);
    } else panelTid();
  }
  setInterval(tick, 50);

  // ---------- studions styrning ----------
  function styr(w, vad) {
    const t = nu(), l = lage(w, t);
    if (vad === 'start') {
      // Efter noll, eller med en tom rond, börjar en ny rond.
      const kvar = l.slut || l.kvarMs <= 0 ? rondMs(w) : l.kvarMs;
      Object.assign(w, { boxKor: true, boxSlut: t + kvar, boxKvarMs: kvar });
    } else if (vad === 'paus') {
      Object.assign(w, { boxKor: false, boxKvarMs: l.kvarMs, boxSlut: 0 });
    } else if (vad === 'nollstall') {
      Object.assign(w, { boxKor: false, boxKvarMs: rondMs(w), boxSlut: 0 });
    } else if (vad === 'prov10' || vad === 'prov20') {
      const s = vad === 'prov10' ? 10 : 20;
      Object.assign(w, { boxKor: true, boxSlut: t + s * 1000 + 300, boxKvarMs: s * 1000 });
    }
    const sparat = typeof save === 'function' ? save() : null;
    // Ett knapptryck skickas direkt. Annars väntar molnsynken på tickern (≤ 1 s) och debouncen
    // (1,8 s, byggd för reglage som dras), och OBS reagerade uppmätt 2026-10-29 först 2,75 s efter
    // Start — klockan hoppade då rakt till 4:57. push() läser localStorage, och save() skriver dit
    // ASYNKRONT (Web Locks i session-state.js): en push direkt efter save() skickade uppmätt det
    // gamla läget. Därför väntar den på sparningen. Är en skrivning redan ute svarar push() 'busy'
    // och den vanliga debouncen tar ändringen som förut.
    Promise.resolve(sparat).then(() => window.VyraCloudSync?.push?.()).catch(() => {});
    if (typeof render === 'function') render();
  }
  function knappText(w) {
    const l = lage(w);
    return l.kor ? 'Pausa' : l.slut ? 'Starta ny rond' : l.kvarMs < l.helRond ? 'Fortsätt' : 'Starta ronden';
  }
  function panelTid() {
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!w || w.type !== TYP) return;
    const el = document.querySelector('#bgxPanelTid'), knapp = document.querySelector('#bgxStart');
    const s = sekunder(lage(w)), txt = tidText(s);
    if (el && el.textContent !== txt) el.textContent = txt;
    const k = knappText(w);
    if (knapp && knapp.textContent !== k) knapp.textContent = k;
  }
  // Provlyssna: spelar tre, två, ett och slutklockan HÄR, så att volymen går att prova utan OBS.
  // Det enda ljudet studion någonsin spelar, och bara på knapptryck.
  function provlyssna(w) {
    const t = nu() + 250, volym = klamp(w.boxVolym, 0, 100, 70) / 100, id = 'prov' + t;
    [3, 2, 1].forEach((n, i) => { if (w.boxRost !== false) spela(ROST_URL, t + i * 1000, 20 - n, 0.98, volym, id + n); });
    if (w.boxKlocka !== false) spela(KLOCKA_URL, t + 3000, 0, 0, volym, id + 'k');
  }

  const oldProps = props;
  props = function () {
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!w || w.type !== TYP) return oldProps();
    const l = lage(w), igang = l.kor;
    return `<h3>BOXGAME-KLOCKA</h3><div class="template-badge">RONDTIMER · ALERT MED LJUD</div><div hidden><input id="pt" value="Boxgame-klocka"><input id="pv" value=""></div>`
      + `<div class="property-group bgx-panel"><h4>RONDEN</h4><div class="bgx-paneltid" id="bgxPanelTid">${tidText(sekunder(l))}</div>`
      + `<div class="bgx-knappar"><button type="button" id="bgxStart" class="bgx-primar">${knappText(w)}</button><button type="button" id="bgxNollstall">Återställ</button></div>`
      + `<label>Rondlängd (minuter)<input id="bgxMinuter" type="number" min="1" max="120" value="${minuter(w)}"${igang ? ' disabled' : ''}></label>`
      + `<label>Rond nummer<input id="bgxRond" type="number" min="1" max="99" value="${klamp(w.boxRond, 1, 99, 1)}"></label>`
      + `<small>OBS-länken följer ronden. Start, paus och återställ syns där efter några sekunder, och båda visar samma sekund.</small></div>`
      + `<div class="property-group"><h4>LJUD</h4><label>Volym <span class="bgx-varde">${klamp(w.boxVolym, 0, 100, 70)}%</span><input id="bgxVolym" type="range" min="0" max="100" value="${klamp(w.boxVolym, 0, 100, 70)}"></label>`
      + `<label><input id="bgxRost" type="checkbox"${w.boxRost === false ? '' : ' checked'}> Engelska sifferutrop</label>`
      + `<label>Läs upp<select id="bgxRostFran"><option value="10"${w.boxRostFran === 20 ? '' : ' selected'}>Sista 10 sekunderna</option><option value="20"${w.boxRostFran === 20 ? ' selected' : ''}>Sista 20 sekunderna</option></select></label>`
      + `<label><input id="bgxKlocka" type="checkbox"${w.boxKlocka === false ? '' : ' checked'}> Slutklocka vid noll (tre slag)</label>`
      + `<small>Ljudet spelas bara i OBS-länken, inte här i studion — så hörs det en gång.</small>`
      + `<button type="button" id="bgxProvlyssna">▶ Provlyssna här</button></div>`
      + `<div class="property-group"><h4>TEST</h4><button type="button" id="bgxProv10">▶ Testa sista 10 sekunderna</button><button type="button" id="bgxProv20">▶ Testa sista 20 sekunderna</button>`
      + `<small>Ersätter den pågående ronden, även i OBS. Tryck Återställ efteråt för din rondlängd.</small></div>`
      + `<div class="property-group"><h4>DESIGN</h4><label><input id="bgxVisaKlocka" type="checkbox"${w.boxVisaKlocka === false ? '' : ' checked'}> Visa klockan (av = bara alerten)</label>`
      + `<label>Alertens storlek (%)<input id="bgxAlertSkala" type="number" min="40" max="300" value="${klamp(w.boxAlertSkala, 40, 300, 100)}"></label></div>`
      + `<div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x || 0}"></label><label>Y<input id="propY" type="number" value="${w.y || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${w.width || 340}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer || 1}"></label></div></div><button class="delete" id="del">Ta bort</button>`;
  };

  function katalogKnapp() {
    const cat = document.querySelector('.widget-catalog');
    if (!cat || cat.querySelector('[data-bgx-skapa]')) return;
    const sek = document.createElement('section');
    sek.className = 'bgx-katalog';
    sek.innerHTML = '<h4>BOXGAME</h4>';
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.bgxSkapa = '1'; b.dataset.catalogKey = 'catalog:boxgame';
    b.innerHTML = `<i class="vyra-pro-icon">◷</i><span><b>Boxgame-klocka</b><small>Rondtimer · 10→1-alert · sifferutrop och slutklocka</small></span>`;
    b.onclick = () => {
      if (!window.VyraWidgets || typeof state === 'undefined') return;
      const w = window.VyraWidgets.create('catalog:boxgame');
      state.widgets.push(w); selected = w.id;
      if (typeof save === 'function') save(); if (typeof render === 'function') render();
      if (typeof toast === 'function') toast('Boxgame-klocka skapad');
    };
    sek.append(b); cat.append(sek);
  }

  const oldBind = bind;
  bind = function () {
    oldBind();
    if (typeof view === 'undefined' || (view !== 'editor' && view !== 'overlay')) return;
    katalogKnapp();
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!w || w.type !== TYP) return;
    const pa = (id, ev, fn) => { const el = document.querySelector(id); if (el) el[ev] = fn; };
    const satt = (falt, v, ritaOm = true) => { w[falt] = v; if (typeof save === 'function') save(); if (ritaOm && typeof render === 'function') render(); };
    pa('#bgxStart', 'onclick', () => styr(w, lage(w).kor ? 'paus' : 'start'));
    pa('#bgxNollstall', 'onclick', () => styr(w, 'nollstall'));
    pa('#bgxProv10', 'onclick', () => styr(w, 'prov10'));
    pa('#bgxProv20', 'onclick', () => styr(w, 'prov20'));
    pa('#bgxProvlyssna', 'onclick', () => provlyssna(w));
    pa('#bgxMinuter', 'onchange', e => {
      const m = klamp(Math.round(+e.target.value), 1, 120, 5);
      // Står ronden still följer tiden kvar med den nya längden, som i playgrounden.
      Object.assign(w, { boxMinuter: m, boxKvarMs: m * 60000, boxKor: false, boxSlut: 0 });
      if (typeof save === 'function') save(); if (typeof render === 'function') render();
    });
    pa('#bgxRond', 'onchange', e => satt('boxRond', klamp(Math.round(+e.target.value), 1, 99, 1)));
    pa('#bgxVolym', 'oninput', e => {
      const v = klamp(Math.round(+e.target.value), 0, 100, 70);
      const etikett = document.querySelector('.bgx-varde'); if (etikett) etikett.textContent = v + '%';
      satt('boxVolym', v, false);
    });
    pa('#bgxRost', 'onchange', e => satt('boxRost', e.target.checked));
    pa('#bgxRostFran', 'onchange', e => satt('boxRostFran', +e.target.value === 20 ? 20 : 10));
    pa('#bgxKlocka', 'onchange', e => satt('boxKlocka', e.target.checked));
    pa('#bgxVisaKlocka', 'onchange', e => satt('boxVisaKlocka', e.target.checked));
    pa('#bgxAlertSkala', 'onchange', e => satt('boxAlertSkala', klamp(Math.round(+e.target.value), 40, 300, 100)));
  };

  window.VyraBoxgame = Object.freeze({ typ: TYP, lage, visa, styr, tidText, ljudagare, SLUTALERT_MS });
  try { if (typeof render === 'function') render(); } catch (_) {}
})();
