// chattavatar.js — CHATTAVATAR: streamerns avatar i OBS, styrd från TikTok-chatten (paketet "VYRA
// Chattavatar", Codex 2026-11-06, granskat och integrerat 2026-11-06). En egen widgettyp,
// templateChatAvatar. Reglerna — vem får styra, väntetider, kö, pratbubblans delar — bor i
// chattavatar-modell.js och provas där utan DOM.
//
// DAVIDS DESIGN (2026-11-06):
//   * avataren har samma storlek som i paketet: 180 x 265 i en källa där 1 px = 1 px i OBS. I VYRA:s
//     duk (432 bred, OBS 1080 bred) är det en widget 72 bred. Bredden går att ändra i panelen.
//   * pratbubblan sitter fast OVANFÖR huvudet, med en liten spets ned mot avataren — aldrig till
//     vänster, där TikTok-chatten ligger. Ingen glidning, bara mjuk toning.
//   * högst två rader i bubblan. Ett långt meddelande visas i sin helhet, i delar om 4 s efter
//     varandra, och hela texten hinner visas innan nästa kommando i kön börjar.
//   * ingen text medan avataren dansar.
//
// BARA OBS REAGERAR PÅ CHATTEN. Studion spelar bara ▶ Testa i panelen. Varje OBS-källa har sin egen
// kö; samma händelse två gånger, eller kvällens historik vid omladdning, spelar inget igen.
//
// TIMRARNA. Allt som väntar (bubblans nästa del, klippets vakt, utfarten) läggs med planera(), som
// minns timern och bär ett serienummer. stoppa() höjer numret och rensar alla timrar på en gång, så
// en gammal timer kan aldrig fyra in i nästa kommando, och #stopp lämnar ingenting kvar som tänds
// senare. En widget som tas bort eller döljs stoppas av tickern.
//
// TEXTEN SKRIVS MED textContent, aldrig som HTML. Namn och meddelanden kommer från tittare.
(function () {
  'use strict';
  if (typeof wh !== 'function' || window.VyraChattavatar) return;
  const M = window.VyraChattavatarModell;
  if (!M) { console.error('[VYRA] Chattavatar: chattavatar-modell.js saknas'); return; }

  const TYP = 'templateChatAvatar';
  const NAMN = 'Chattavatar';
  const OVERLAY = (typeof VYRA_OVERLAY !== 'undefined' && VYRA_OVERLAY) || /[?&]overlay(=|&|$)/.test(location.search);
  const MAPP = 'assets/chattavatar/';
  const VILA = MAPP + 'vyra-avatar-idle.png';
  const KLIPP = Object.freeze({
    dance: MAPP + 'vyra-avatar-flow-dance-v2.webm', dance2: MAPP + 'vyra-avatar-flow-dance2.webm', dance3: MAPP + 'vyra-avatar-flow-dance3.webm',
    wave: MAPP + 'vyra-avatar-flow-wave.webm', glove: MAPP + 'vyra-avatar-flow-glove.webm', fira: MAPP + 'vyra-avatar-flow-fira-v2.webm'
  });
  // Scenen i designmått: avataren 180 x 265 längst ned, plats för bubblan ovanför.
  const SCEN_B = 180, SCEN_H = 325, STANDARD_B = 72;
  // Bubblan är 168 bred med 12 px luft på var sida = 144. Mätningen görs mot 134: i OBS skalas texten
  // (duken 432 -> 1080, widgeten 72/180) och fetstil i liten grad blir inte exakt proportionell — i första
  // OBS-provet bröt en rad som mätts till 144 en tredje rad. Bubblan bryter dessutom aldrig själv
  // (white-space:pre i chattavatar.css): raderna är exakt de två som läggs här.
  const TEXT_B = 134;
  const TEXT_FONT = '800 18px system-ui, sans-serif';
  const TAP_MS = 4000, TONING_MS = 200, VAKT_EXTRA_MS = 4000;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const klamp = (v, min, max, f) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : f; };
  const publik = w => (w && w.caPublik === 'alla' ? 'alla' : 'mod');
  const halsa = w => !(w && w.caHalsa === false);
  const tacka = w => !(w && w.caTacka === false);

  // ---------- mätning av bubbeltexten ----------
  let mattDuk = null;
  function matt(text) {
    try {
      if (mattDuk === null) { const c = document.createElement('canvas').getContext('2d'); mattDuk = c || false; if (c) c.font = TEXT_FONT; }
    } catch (_) { mattDuk = false; }
    if (mattDuk) return mattDuk.measureText(text).width;
    return Array.from(text).length * 10;      // utan canvas (jsdom): ungefär 18 px fetstil
  }

  function serverNu() {
    try { const n = Number(window.VyraLive && window.VyraLive.serverNu && window.VyraLive.serverNu()); if (n > 0) return n; } catch (_) {}
    return Date.now();
  }
  function streamer() {
    try { const t = window.VyraLive && window.VyraLive.tillstand && window.VyraLive.tillstand(); return String(t && t.konto || ''); } catch (_) { return ''; }
  }

  // ---------- läget per widget i den här fliken ----------
  const LIVE = new Map();
  const widgetar = () => { try { return (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) ? state.widgets.filter(w => w && w.type === TYP) : []; } catch (_) { return []; } };
  const widget = id => widgetar().find(w => String(w.id) === String(id));
  const rotFor = id => document.querySelector(`.vyra-chattavatar[data-id="${String(id).replace(/["\\]/g, '\\$&')}"]`);

  function till(id) {
    let t = LIVE.get(id);
    if (!t) {
      t = { id, ko: M.skapaKo(), serial: 0, timers: new Set(), videor: new Map(), trasiga: new Set(),
        spelar: null, klipp: null, videoSyns: false, sidor: [], sida: 0, bubbla: false, tap: false, status: 'Vilar' };
      t.router = M.skapaRouter({
        nu: serverNu, streamer,
        publik: () => publik(widget(id)), halsa: () => halsa(widget(id)), tacka: () => tacka(widget(id))
      });
      LIVE.set(id, t);
    }
    return t;
  }
  function planera(t, fn, ms) {
    const s = t.serial;
    const h = setTimeout(() => { t.timers.delete(h); if (t.serial === s) fn(); }, Math.max(0, ms));
    t.timers.add(h);
    return h;
  }
  function rensaTimrar(t) { t.timers.forEach(h => clearTimeout(h)); t.timers.clear(); }

  function videoFor(t, nyckel) {
    let v = t.videor.get(nyckel);
    if (!v) {
      v = document.createElement('video');
      v.className = 'ca-klipp'; v.muted = true; v.defaultMuted = true; v.setAttribute('muted', '');
      v.playsInline = true; v.setAttribute('playsinline', ''); v.disablePictureInPicture = true;
      v.preload = OVERLAY ? 'auto' : 'metadata'; v.src = KLIPP[nyckel]; v.dataset.klipp = nyckel;
      t.videor.set(nyckel, v);
    }
    return v;
  }

  // Lägger in videonoderna och läget i den aktuella lådan. Körs efter varje render(), som bygger om
  // DOM:en, och efter varje lägesbyte.
  function applicera(t) {
    const rot = rotFor(t.id); if (!rot) return;
    const vard = rot.querySelector('.ca-vard');
    if (vard) {
      if (OVERLAY) Object.keys(KLIPP).forEach(k => { if (!t.trasiga.has(k)) videoFor(t, k); });
      t.videor.forEach(v => { if (v.parentNode !== vard) vard.append(v); v.classList.toggle('ca-pa', t.videoSyns && v.dataset.klipp === t.klipp); });
    }
    const vila = rot.querySelector('.ca-vila'); if (vila) vila.classList.toggle('ca-dold', t.videoSyns);
    const b = rot.querySelector('.ca-bubbla');
    if (b) {
      const text = t.bubbla ? (t.sidor[t.sida] || '') : '';
      if (text && b.textContent !== text) b.textContent = text;
      b.classList.toggle('ca-syns', !!text);
    }
    const tap = rot.querySelector('.ca-tap'); if (tap) tap.classList.toggle('ca-pa', t.tap);
    const s = rot.querySelector('.ca-status');
    if (s) s.textContent = t.status + (t.ko.antal ? ' · ' + t.ko.antal + ' i kö' : '');
  }

  // Avbryter det som spelas. tomKo: töm även kön (#stopp, ny sändning, dold widget).
  function stoppa(t, tomKo) {
    t.serial++; rensaTimrar(t);
    t.videor.forEach(v => { v.onended = v.onerror = v.onpause = null; try { v.pause(); } catch (_) {} });
    t.spelar = null; t.klipp = null; t.videoSyns = false; t.sidor = []; t.sida = 0; t.bubbla = false; t.tap = false;
    if (tomKo) t.ko.tom();
    t.status = 'Vilar';
    applicera(t);
  }

  function nasta(t) {
    if (t.spelar) return;
    const w = widget(t.id);
    if (!w || (OVERLAY && (w.hidden || !rotFor(t.id)))) return;
    const item = t.ko.ta();
    if (!item) { t.status = 'Vilar'; applicera(t); return; }
    spela(t, item);
  }

  function spela(t, item) {
    const k = M.KOMMANDON[item.key];
    t.serial++; rensaTimrar(t);
    const s = t.serial;
    t.spelar = item; t.status = k.etikett;
    // Bubblan: delar om två rader, 4 s var. Inget visas under en dans (bubbeltext ger '').
    const text = M.bubbeltext(item);
    t.sidor = text ? M.sidor(text, matt, TEXT_B) : []; t.sida = 0; t.bubbla = t.sidor.length > 0;
    let textKlar = !t.bubbla, klippKlar = false;
    const klart = () => { if (textKlar && klippKlar) avsluta(t); };
    for (let i = 1; i < t.sidor.length; i++) planera(t, () => { t.sida = i; applicera(t); }, i * M.SIDA_MS);
    if (t.bubbla) planera(t, () => { textKlar = true; t.bubbla = false; applicera(t); klart(); }, t.sidor.length * M.SIDA_MS);

    const nyckel = k.klipp && !t.trasiga.has(k.klipp) ? k.klipp : null;
    if (!nyckel) {
      // Tap tap och #säg har inget klipp; ett trasigt klipp visar texten utan rörelse.
      t.tap = item.key === '#tap';
      if (t.tap) planera(t, () => { t.tap = false; klippKlar = true; applicera(t); klart(); }, TAP_MS);
      else if (k.dans) planera(t, () => { klippKlar = true; klart(); }, 0);
      else klippKlar = true;
      applicera(t); klart();
      return;
    }
    const v = videoFor(t, nyckel);
    t.klipp = nyckel; t.videoSyns = false;
    applicera(t);
    const klippSlut = trasig => {
      if (t.serial !== s || klippKlar) return;
      klippKlar = true;
      if (trasig) t.trasiga.add(nyckel);
      t.videoSyns = false; applicera(t); klart();
    };
    v.onended = () => klippSlut(false);
    v.onerror = () => klippSlut(true);
    // En omritning kan flytta noden och pausa den mitt i klippet: fortsätt i stället för att börja om.
    v.onpause = () => { if (t.serial === s && !klippKlar && !v.ended && v.isConnected) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } };
    planera(t, () => klippSlut(false), (Number(v.duration) > 0 ? v.duration * 1000 : 8000) + VAKT_EXTRA_MS);
    try { v.currentTime = 0; } catch (_) {}
    if (v.preload !== 'auto') v.preload = 'auto';
    const p = v.play();
    const syns = () => { if (t.serial === s && !klippKlar) { t.videoSyns = true; applicera(t); } };
    if (p && p.then) p.then(syns, () => klippSlut(false)); else syns();
  }

  function avsluta(t) {
    // Text och klipp är klara: det som återstår (klippets vakt) behövs inte längre.
    rensaTimrar(t);
    const s = t.serial;
    t.videoSyns = false; t.bubbla = false; t.tap = false; t.status = 'Vilar';
    applicera(t);
    planera(t, () => {
      if (t.serial !== s) return;
      t.videor.forEach(v => { v.onended = v.onerror = v.onpause = null; try { v.pause(); } catch (_) {} });
      t.spelar = null; t.klipp = null;
      nasta(t);
    }, TONING_MS);
  }

  // Ett köobjekt från chatten, en automatisk hälsning eller ▶ Testa.
  function lagg(t, item) {
    if (!item) return 'okänt';
    if (item.key === '#stopp') { stoppa(t, true); return 'stoppad'; }
    const r = t.ko.lagg(item, t.spelar, Date.now());
    if (r === 'köad') nasta(t); else applicera(t);
    return r;
  }

  // ---------- kopplingen till liven ----------
  function hantera(e) {
    if (!OVERLAY || !e) return;
    widgetar().forEach(w => {
      if (w.hidden || !rotFor(w.id)) return;
      const t = till(w.id);
      const item = t.router.ta(e);
      if (item) lagg(t, item);
    });
  }
  window.addEventListener('vyra-live-event', ev => { try { hantera(ev && ev.detail); } catch (err) { console.warn('[VYRA] Chattavatar', err); } });
  // Ny sändning eller utloggning: kön och väntetiderna hör till den gamla.
  const nollstall = () => LIVE.forEach(t => { t.router.nollstall(); stoppa(t, true); });
  window.addEventListener('vyra-live-session', ev => { if (ev && ev.detail && ev.detail.event === 'live:start') nollstall(); });
  window.addEventListener('vyra-session-ended', nollstall);

  // Borttagen eller dold widget: stoppa och släpp klippen, så att inga timrar eller videor lever kvar.
  const tickare = setInterval(() => {
    try {
      LIVE.forEach((t, id) => {
        const w = widget(id);
        if (!w) { stoppa(t, true); t.videor.forEach(v => { try { v.removeAttribute('src'); v.load(); } catch (_) {} v.remove(); }); LIVE.delete(id); return; }
        if (OVERLAY && w.hidden && (t.spelar || t.ko.antal)) stoppa(t, true);
      });
    } catch (_) { clearInterval(tickare); }
  }, 1000);

  // ▶ Testa: spelar i DEN HÄR fliken, aldrig i OBS.
  function testa(w, text) {
    const k = M.tolka(text);
    if (!k) return 'okänt';
    return lagg(till(w.id), { key: k.key, namn: k.namn, kalla: 'test' });
  }

  // ---------- render ----------
  const oldWh = wh;
  wh = function (w) {
    if (!w || w.type !== TYP) return oldWh(w);
    if (OVERLAY && w.hidden) return '';
    const bredd = klamp(w.width, 40, 432, STANDARD_B), hojd = Math.round(bredd * SCEN_H / SCEN_B);
    const valt = typeof selected !== 'undefined' && selected === w.id;
    return `<div class="widget vyra-chattavatar${OVERLAY ? '' : ' ca-studio'}${valt ? ' selected' : ''}" data-id="${esc(w.id)}" `
      + `style="left:${Number(w.x) || 0}px;top:${Number(w.y) || 0}px;width:${bredd}px;height:${hojd}px;--ca-z:${(bredd / SCEN_B).toFixed(4)}">`
      + `<div class="ca-scen"><div class="ca-avatar"><img class="ca-vila" src="${VILA}" alt="" draggable="false"><div class="ca-vard"></div></div>`
      + `<div class="ca-bubbla" aria-live="polite"></div><div class="ca-tap" aria-hidden="true">♡</div></div>`
      + (OVERLAY ? '' : '<span class="ca-status"></span>')
      + (valt ? '<span class="resize-handle">↘</span>' : '') + '</div>';
  };
  const kopplaAlla = () => { LIVE.forEach(t => applicera(t)); if (OVERLAY) widgetar().forEach(w => { if (!w.hidden && rotFor(w.id)) applicera(till(w.id)); }); };
  const oldRender = render;
  render = function () {
    const ut = oldRender.apply(this, arguments);
    try { kopplaAlla(); } catch (err) { console.warn('[VYRA] Chattavatar: koppla', err); }
    return ut;
  };
  try {
    new MutationObserver(lista => {
      for (const m of lista) for (const n of m.addedNodes) {
        if (n.nodeType === 1 && (n.matches?.('.vyra-chattavatar') || n.querySelector?.('.vyra-chattavatar'))) { kopplaAlla(); return; }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}

  // ---------- panelen ----------
  const TESTER = [['#d1', 'Dans 1'], ['#d2', 'Dans 2'], ['#d3', 'Dans 3'], ['#t', 'Tap tap'], ['#g', 'Handske'], ['#f', 'Fira'], ['#hej', 'Hej']];
  const oldProps = props;
  props = function () {
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!w || w.type !== TYP) return oldProps();
    return `<h3>CHATTAVATAR</h3><div class="template-badge">AVATAR · STYRS FRÅN CHATTEN</div><div hidden><input id="pt" value="${NAMN}"><input id="pv" value=""></div>`
      + `<div class="property-group"><h4>VEM FÅR STYRA</h4><label>Kommandon<select id="caPublik">`
      + `<option value="mod"${publik(w) === 'mod' ? ' selected' : ''}>Bara du och dina moderatorer</option>`
      + `<option value="alla"${publik(w) === 'alla' ? ' selected' : ''}>Tittare får också dansa (#d1 #d2 #d3 #t)</option></select></label>`
      + `<small>Moderatorer: #d1 #d2 #d3 dans · #t tap tap · #g handske · #f fira (eller #f egen text) · #hej namn · #säg meddelande · #stopp. `
      + `Tittare har 20 s väntetid var och 8 s mellan två tittare. Högst ${M.MAX_KO} kommandon väntar i kön.</small></div>`
      + `<div class="property-group"><h4>AUTOMATISKT</h4>`
      + `<label><input id="caHalsa" type="checkbox"${halsa(w) ? ' checked' : ''}> Hälsa fanklubbsmedlemmar välkomna när de kommer in</label>`
      + `<label><input id="caTacka" type="checkbox"${tacka(w) ? ' checked' : ''}> Tacka nya följare (högst var 10:e sekund)</label>`
      + `<small>Samma person hälsas högst en gång per tio minuter. Hälsningar tar aldrig mer än två platser i kön.</small></div>`
      + `<div class="property-group ca-panel"><h4>TESTA</h4><small>Spelas bara här i studion, aldrig i OBS.</small>`
      + `<div class="ca-knappar">${TESTER.map(([c, n]) => `<button type="button" data-ca-testa="${esc(c)}">${esc(n)}</button>`).join('')}</div>`
      + `<label>Eget meddelande<input id="caText" maxlength="${M.MAX_TEXT}" placeholder="Skriv ett meddelande"></label>`
      + `<div class="ca-knappar"><button type="button" id="caSag">▶ Säg</button><button type="button" id="caStopp">■ Stopp</button></div></div>`
      + `<div class="property-group"><h4>POSITION & STORLEK</h4><button type="button" id="caStorlek">Samma storlek som paketet</button><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x || 0}"></label><label>Y<input id="propY" type="number" value="${w.y || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${w.width || STANDARD_B}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer || 1}"></label></div></div><button class="delete" id="del">Ta bort</button>`;
  };

  // ---------- katalogen ----------
  function katalog() {
    const cat = document.querySelector('.widget-catalog');
    if (!cat || cat.querySelector('[data-ca-skapa]')) return;
    const sek = document.createElement('section');
    sek.className = 'ca-katalog';
    sek.innerHTML = '<h4>CHATTAVATAR</h4>';
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.caSkapa = '1'; b.dataset.catalogKey = 'catalog:vyrapaket:chattavatar';
    b.innerHTML = `<img class="ca-katalogbild" src="${VILA}" alt="" loading="lazy"><span><b>${NAMN}</b><small>Din avatar dansar, hälsar och pratar när moderatorerna skriver i chatten</small></span>`;
    b.onclick = () => {
      if (!window.VyraWidgets || typeof state === 'undefined') return;
      const w = window.VyraWidgets.create('catalog:vyrapaket:chattavatar');
      state.widgets.push(w); selected = w.id;
      if (typeof save === 'function') save(); if (typeof render === 'function') render();
      if (typeof toast === 'function') toast(NAMN + ' tillagd');
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
    const satt = (falt, v) => { w[falt] = v; if (typeof save === 'function') save(); };
    const el = id => document.querySelector(id);
    if (el('#caPublik')) el('#caPublik').onchange = e => satt('caPublik', e.target.value === 'alla' ? 'alla' : 'mod');
    if (el('#caHalsa')) el('#caHalsa').onchange = e => satt('caHalsa', !!e.target.checked);
    if (el('#caTacka')) el('#caTacka').onchange = e => satt('caTacka', !!e.target.checked);
    document.querySelectorAll('[data-ca-testa]').forEach(b => b.onclick = () => testa(w, b.dataset.caTesta));
    if (el('#caSag')) el('#caSag').onclick = () => { const v = el('#caText') ? el('#caText').value : ''; if (testa(w, '#säg ' + v) === 'okänt' && typeof toast === 'function') toast('Skriv ett meddelande först'); };
    if (el('#caStopp')) el('#caStopp').onclick = () => stoppa(till(w.id), true);
    if (el('#caStorlek')) el('#caStorlek').onclick = () => { w.width = STANDARD_B; if (typeof save === 'function') save(); if (typeof render === 'function') render(); };
  };

  window.VyraChattavatar = Object.freeze({ typ: TYP, namn: NAMN, KLIPP, VILA, SCEN_B, SCEN_H, STANDARD_B, TEXT_B, testa, hantera, _live: LIVE, _till: till, _stoppa: stoppa });
  try { if (typeof render === 'function') render(); } catch (_) {}
})();
