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
// en gammal timer kan aldrig fyra in i nästa kommando, och !stopp lämnar ingenting kvar som tänds
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
  // AVATARERNA. Varje modell är en egen mapp med samma sju filnamn. Nr 1 är originalet från
  // 2026-11-06 och förblir standard, så befintliga widgetar ser ut som förut. Nr 2 (Codex, 2026-11-08):
  // helkropp, 360 x 530 = samma proportioner som avatarlådan 180 x 265. En ny avatar = en ny mapp och
  // en rad här — ta aldrig bort en gammal, widgetar i molnet pekar på den.
  const FILER = { vila: 'vyra-avatar-idle.png', dance: 'vyra-avatar-flow-dance-v2.webm', dance2: 'vyra-avatar-flow-dance2.webm',
    dance3: 'vyra-avatar-flow-dance3.webm', wave: 'vyra-avatar-flow-wave.webm', glove: 'vyra-avatar-flow-glove.webm', fira: 'vyra-avatar-flow-fira-v2.webm' };
  // Varje avatar är en EGEN widget i katalogen med egen nyckel (David 2026-11-08: "jag vill varje avatar
  // ska vara för sig själv") — inget avatarval i panelen. En ny avatar = en ny mapp, en rad här och en
  // gren i widget-factory.js vyrapaket.
  const MODELLER = Object.freeze({
    // extra: klipp som bara den här avataren har. Kickboxningen (OpenArt, 2026-11-10) är ritad på en
    // bredare yta, 580 x 640, så att sparken får plats utan att avataren krymper: samma höjd och fotlinje
    // som de andra klippen. chattavatar.css ger dess video motsvarande bredare låda.
    nr1: Object.freeze({ namn: 'Avatar 1', kort: 'Chattavatar', nyckel: 'catalog:vyrapaket:chattavatar', mapp: 'assets/chattavatar/',
      extra: Object.freeze({ kick: 'vyra-avatar-flow-kickboxning.webm', dance4: 'vyra-avatar-flow-dance4.webm' }) }),
    nr2: Object.freeze({ namn: 'Avatar 2 · helkropp', kort: 'Chattavatar 2 · helkropp', nyckel: 'catalog:vyrapaket:chattavatar:2', mapp: 'assets/chattavatar/nr2/' })
  });
  const STANDARD_MODELL = 'nr1';
  const modell = w => (w && Object.prototype.hasOwnProperty.call(MODELLER, w.caModell) ? w.caModell : STANDARD_MODELL);
  function filerFor(m) {
    const mapp = (MODELLER[m] || MODELLER[STANDARD_MODELL]).mapp;
    const klipp = {};
    for (const k of Object.keys(FILER)) if (k !== 'vila') klipp[k] = mapp + FILER[k];
    const extra = (MODELLER[m] || MODELLER[STANDARD_MODELL]).extra || {};
    for (const k of Object.keys(extra)) klipp[k] = mapp + extra[k];
    return Object.freeze({ vila: mapp + FILER.vila, klipp: Object.freeze(klipp) });
  }
  const VILA = filerFor(STANDARD_MODELL).vila;
  const KLIPP = filerFor(STANDARD_MODELL).klipp;
  // Har den här avataren klippet? Ett kommando för ett klipp som modellen saknar (!k på avatar 2) gör ingenting.
  const harKlipp = (m, k) => Object.prototype.hasOwnProperty.call(filerFor(m).klipp, k);
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
  // Viloläget: vad avataren gör när ingen skriver. Se M.vilaNasta.
  const vilaLage = w => M.vilaLage(w && w.caVila);
  const vilaSek = w => M.vilaSek(w && w.caVilaSek);
  const vilaText = w => M.tvatta(w && w.caVilaText, M.VILA_MAX_TEXT);

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
        spelar: null, klipp: null, videoSyns: false, sidor: [], sida: 0, bubbla: false, tap: false, status: 'Vilar',
        senast: Date.now(), vilaN: 0, modell: modell(widget(id)) };
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
      v.preload = OVERLAY ? 'auto' : 'metadata'; v.src = filerFor(t.modell).klipp[nyckel]; v.dataset.klipp = nyckel;
      t.videor.set(nyckel, v);
    }
    return v;
  }

  // Lägger in videonoderna och läget i den aktuella lådan. Körs efter varje render(), som bygger om
  // DOM:en, och efter varje lägesbyte.
  // Byt avatar: det som spelas stoppas och den gamla modellens videor släpps, så att nästa klipp
  // laddas ur den nya mappen. Kön behålls.
  function bytModell(t, m) {
    if (t.modell === m) return;
    t.modell = m;                // först: stoppa() anropar applicera(), som annars bytte igen
    t.serial++; rensaTimrar(t);
    t.videor.forEach(v => { v.onended = v.onerror = v.onpause = null; try { v.pause(); v.removeAttribute('src'); v.load(); } catch (_) {} v.remove(); });
    t.videor.clear(); t.trasiga.clear();
    stoppa(t, false);
  }

  function applicera(t) {
    const w = widget(t.id);
    if (w && t.modell !== modell(w)) { bytModell(t, modell(w)); return; }
    const rot = rotFor(t.id); if (!rot) return;
    const vard = rot.querySelector('.ca-vard');
    if (vard) {
      if (OVERLAY) Object.keys(filerFor(t.modell).klipp).forEach(k => { if (!t.trasiga.has(k)) videoFor(t, k); });
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

  // Avbryter det som spelas. tomKo: töm även kön (!stopp, ny sändning, dold widget).
  function stoppa(t, tomKo) {
    t.serial++; rensaTimrar(t);
    t.videor.forEach(v => { v.onended = v.onerror = v.onpause = null; try { v.pause(); } catch (_) {} });
    t.spelar = null; t.klipp = null; t.videoSyns = false; t.sidor = []; t.sida = 0; t.bubbla = false; t.tap = false;
    if (tomKo) t.ko.tom();
    t.status = 'Vilar'; t.senast = Date.now();   // !stopp: viloläget väntar en hel period innan det tar vid igen
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
    t.spelar = item; t.status = k.etikett; t.senast = Date.now();
    // Bubblan: delar om två rader, 4 s var. Inget visas under en dans (bubbeltext ger '').
    const text = M.bubbeltext(item);
    t.sidor = text ? M.sidor(text, matt, TEXT_B) : []; t.sida = 0; t.bubbla = t.sidor.length > 0;
    let textKlar = !t.bubbla, klippKlar = false;
    const klart = () => { if (textKlar && klippKlar) avsluta(t); };
    for (let i = 1; i < t.sidor.length; i++) planera(t, () => { t.sida = i; applicera(t); }, i * M.SIDA_MS);
    if (t.bubbla) planera(t, () => { textKlar = true; t.bubbla = false; applicera(t); klart(); }, t.sidor.length * M.SIDA_MS);

    if (k.klipp && !harKlipp(t.modell, k.klipp) && k.dans) { klippKlar = true; klart(); return; }
    const nyckel = k.klipp && !t.trasiga.has(k.klipp) && harKlipp(t.modell, k.klipp) ? k.klipp : null;
    if (!nyckel) {
      // Tap tap och !säg har inget klipp; ett trasigt klipp visar texten utan rörelse.
      t.tap = item.key === '!tap' || !!k.tap;
      if (t.tap) planera(t, () => { t.tap = false; klippKlar = true; applicera(t); klart(); }, TAP_MS);
      else if (k.dans) planera(t, () => { klippKlar = true; klart(); }, 0);
      else klippKlar = true;
      applicera(t); klart();
      return;
    }
    const v = videoFor(t, nyckel);
    t.klipp = nyckel; t.videoSyns = false;
    t.tap = !!k.tap;          // uppmaningen: tap-hjärtat pulserar medan avataren vinkar
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
    t.videoSyns = false; t.bubbla = false; t.tap = false; t.status = 'Vilar'; t.senast = Date.now();
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
    if (item.key === '!stopp') { stoppa(t, true); return 'stoppad'; }
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

  // VILOLÄGET (David 2026-11-08: "nu om ingen skriver något står den still"). Bara i OBS. När
  // inget har spelats och kön är tom i vilaSek sekunder läggs nästa vilorörelse i kön — en dans
  // eller en uppmaning att tappa på skärmen. Klockan räknas från när det senaste slutade, så ett
  // kommando från chatten skjuter alltid upp nästa vilorörelse. Ett riktigt kommando går före:
  // vilorörelsen köas bara när kön är tom, och !stopp stoppar den som vilken annan som helst.
  function vila(t, w) {
    if (!OVERLAY || !w || w.hidden || t.spelar || t.ko.antal || !rotFor(t.id)) return;
    const nu = Date.now();
    if (nu - t.senast < vilaSek(w) * 1000) return;
    t.senast = nu;
    const item = M.vilaNasta(vilaLage(w), t.vilaN, vilaText(w));
    if (!item) return;
    t.vilaN++;
    lagg(t, item);
  }

  // Borttagen eller dold widget: stoppa och släpp klippen, så att inga timrar eller videor lever kvar.
  const tickare = setInterval(() => {
    try {
      LIVE.forEach((t, id) => {
        const w = widget(id);
        if (!w) { stoppa(t, true); t.videor.forEach(v => { try { v.removeAttribute('src'); v.load(); } catch (_) {} v.remove(); }); LIVE.delete(id); return; }
        if (OVERLAY && w.hidden && (t.spelar || t.ko.antal)) stoppa(t, true);
        vila(t, w);
      });
      // En widget som syns i OBS men ännu inte fått någon händelse har inget läge än: skapa det, så
      // att viloläget börjar räkna från första bildrutan.
      if (OVERLAY) widgetar().forEach(w => { if (!w.hidden && !LIVE.has(w.id) && rotFor(w.id)) till(w.id); });
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
      + `<div class="ca-scen"><div class="ca-avatar"><img class="ca-vila" src="${esc(filerFor(modell(w)).vila)}" alt="" draggable="false"><div class="ca-vard"></div></div>`
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
  const TESTER = [['!d1', 'Dans 1'], ['!d2', 'Dans 2'], ['!d3', 'Dans 3'], ['!d4', 'Dans 4', 'dance4'], ['!k', 'Kickboxning', 'kick'], ['!t', 'Tap tap'], ['!g', 'Handske'], ['!f', 'Fira'], ['!hej', 'Hej']];
  const oldProps = props;
  props = function () {
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!w || w.type !== TYP) return oldProps();
    return `<h3>${esc(MODELLER[modell(w)].kort.toUpperCase())}</h3><div class="template-badge">${esc(MODELLER[modell(w)].namn.toUpperCase())} · STYRS FRÅN CHATTEN</div><div hidden><input id="pt" value="${NAMN}"><input id="pv" value=""></div>`
      + `<div class="property-group"><h4>VEM FÅR STYRA</h4><label>Kommandon<select id="caPublik">`
      + `<option value="mod"${publik(w) === 'mod' ? ' selected' : ''}>Bara du och dina moderatorer</option>`
      + `<option value="alla"${publik(w) === 'alla' ? ' selected' : ''}>Tittare får också dansa (!d1 !d2 !d3 !t)</option></select></label>`
      + `<small>Moderatorer: !d1 !d2 !d3 dans${harKlipp(modell(w), 'dance4') ? ' · !d4 dans 4' : ''}${harKlipp(modell(w), 'kick') ? ' · !k kickboxning' : ''} · !t tap tap · !g handske · !f fira (eller !f egen text) · !hej namn · !s meddelande (eller !säg) · !stopp. `
      + `Tittare har 20 s väntetid var och 8 s mellan två tittare. Högst ${M.MAX_KO} kommandon väntar i kön.</small></div>`
      + `<div class="property-group"><h4>AUTOMATISKT</h4>`
      + `<label><input id="caHalsa" type="checkbox"${halsa(w) ? ' checked' : ''}> Hälsa medlemmar välkomna: nya prenumeranter och fanklubbsmedlemmar som kommer in</label>`
      + `<label><input id="caTacka" type="checkbox"${tacka(w) ? ' checked' : ''}> Tacka nya följare (högst var 10:e sekund)</label>`
      + `<small>Samma person hälsas högst en gång per tio minuter. Hälsningar tar aldrig mer än två platser i kön.</small></div>`
      + `<div class="property-group"><h4>NÄR INGEN SKRIVER</h4><label>Avataren<select id="caVila">`
      + [['bada', 'Dansar och ber om tap, varannan gång'], ['dans', 'Dansar'], ['tap', 'Ber tittarna tappa på skärmen'], ['av', 'Står still']]
        .map(([v, n]) => `<option value="${v}"${vilaLage(w) === v ? ' selected' : ''}>${n}</option>`).join('')
      + `</select></label><label>Hur ofta<select id="caVilaSek">`
      + M.VILA_SEK.map(s => `<option value="${s}"${vilaSek(w) === s ? ' selected' : ''}>Efter ${s} s utan kommandon</option>`).join('')
      + `</select></label><label>Text när den ber om tap<input id="caVilaText" maxlength="${M.VILA_MAX_TEXT}" value="${esc(vilaText(w))}" placeholder="${esc(M.KOMMANDON.uppmaning.text)}"></label>`
      + `<small>Bara i OBS. Ett kommando från chatten går alltid före och skjuter upp nästa.</small></div>`
      + `<div class="property-group ca-panel"><h4>TESTA</h4><small>Spelas bara här i studion, aldrig i OBS.</small>`
      + `<div class="ca-knappar">${TESTER.filter(([, , kl]) => !kl || harKlipp(modell(w), kl)).map(([c, n]) => `<button type="button" data-ca-testa="${esc(c)}">${esc(n)}</button>`).join('')}</div>`
      + `<label>Eget meddelande<input id="caText" maxlength="${M.MAX_TEXT}" placeholder="Skriv ett meddelande"></label>`
      + `<div class="ca-knappar"><button type="button" id="caUppmaning">▶ Be om tap</button><button type="button" id="caSag">▶ Säg</button><button type="button" id="caStopp">■ Stopp</button></div></div>`
      + `<div class="property-group"><h4>POSITION & STORLEK</h4><button type="button" id="caStorlek">Samma storlek som paketet</button><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x || 0}"></label><label>Y<input id="propY" type="number" value="${w.y || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${w.width || STANDARD_B}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer || 1}"></label></div></div><button class="delete" id="del">Ta bort</button>`;
  };

  // ---------- katalogen ----------
  function katalog() {
    const cat = document.querySelector('.widget-catalog');
    if (!cat || cat.querySelector('[data-ca-skapa]')) return;
    const sek = document.createElement('section');
    sek.className = 'ca-katalog';
    sek.innerHTML = '<h4>CHATTAVATAR</h4>';
    // Ett kort per avatar, var och en med sin egen nyckel och sin egen vilobild.
    for (const [m, info] of Object.entries(MODELLER)) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.caSkapa = m; b.dataset.catalogKey = info.nyckel;
      b.innerHTML = `<img class="ca-katalogbild" src="${esc(filerFor(m).vila)}" alt="" loading="lazy"><span><b>${esc(info.kort)}</b><small>Din avatar dansar, hälsar och pratar när moderatorerna skriver i chatten</small></span>`;
      b.onclick = () => {
        if (!window.VyraWidgets || typeof state === 'undefined') return;
        const w = window.VyraWidgets.create(info.nyckel);
        state.widgets.push(w); selected = w.id;
        if (typeof save === 'function') save(); if (typeof render === 'function') render();
        if (typeof toast === 'function') toast(info.kort + ' tillagd');
      };
      sek.append(b);
    }
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
    if (el('#caVila')) el('#caVila').onchange = e => satt('caVila', M.vilaLage(e.target.value));
    if (el('#caVilaSek')) el('#caVilaSek').onchange = e => satt('caVilaSek', M.vilaSek(e.target.value));
    if (el('#caVilaText')) el('#caVilaText').oninput = e => satt('caVilaText', M.tvatta(e.target.value, M.VILA_MAX_TEXT));
    if (el('#caUppmaning')) el('#caUppmaning').onclick = () => lagg(till(w.id), { key: 'uppmaning', namn: vilaText(w), kalla: 'test' });
    document.querySelectorAll('[data-ca-testa]').forEach(b => b.onclick = () => testa(w, b.dataset.caTesta));
    if (el('#caSag')) el('#caSag').onclick = () => { const v = el('#caText') ? el('#caText').value : ''; if (testa(w, '!säg ' + v) === 'okänt' && typeof toast === 'function') toast('Skriv ett meddelande först'); };
    if (el('#caStopp')) el('#caStopp').onclick = () => stoppa(till(w.id), true);
    if (el('#caStorlek')) el('#caStorlek').onclick = () => { w.width = STANDARD_B; if (typeof save === 'function') save(); if (typeof render === 'function') render(); };
  };

  window.VyraChattavatar = Object.freeze({ typ: TYP, namn: NAMN, KLIPP, VILA, MODELLER, STANDARD_MODELL, filerFor, SCEN_B, SCEN_H, STANDARD_B, TEXT_B, testa, hantera, _live: LIVE, _till: till, _stoppa: stoppa, _vila: vila });
  try { if (typeof render === 'function') render(); } catch (_) {}
})();
