// SKATTKISTAN — TikToks ENVELOPE på overlayn, med nedräkning till öppningen.
//
// Mätt 2026-09-06 i en riktig sändning: 14 ENVELOPE, 100 diamanter delades ut och ingen widget såg
// dem. Roadmapen kallar en nedräkning på overlayn "det starkaste stanna kvar-verktyget TikTok har":
// den som ser att kistan öppnas om 40 sekunder stannar i 40 sekunder till.
//
// KEDJAN (samma ändring, 2026-09-27):
//   tiktok-bridge/normalizer.js envelopeFields  →  typen `envelope` med kistaId, oppnasAt (ms),
//   kistaDold, diamonds, count, username, profileImage  →  server/event-bus.js cleanEvent  →
//   live-client.js  →  `vyra-live-event`  →  den här filen.
//   Skrivbordsappen speglar samma sak (electron-app/tiktok-fields.js envelopeFields).
//
// TVÅ DESIGNER, valda i panelen (widgetens kistaDesign):
//   'kista'  en glödande kista med diamantsumma, stor nedräkning och avsändaren. Kistan skakar de
//            sista tio sekunderna och locket öppnas när tiden är ute.
//   'pill'   en smal rad: kista-ikon, diamanter och nedräkning.
//
// I SÄNDNINGEN syns widgeten bara medan en kista finns. Rutan finns kvar (samma mått) men är
// osynlig i vila, så den flyttar inget omkring sig när en kista dyker upp. I studion visas en
// förhandsbild i vila, så att den går att placera.
//
// HISTORIK. Gamla event spelas upp vid sidladdning genom samma `vyra-live-event`. En kista vars
// öppning redan passerat (plus tiden den visas öppen) ignoreras; en kista som fortfarande räknar
// ned visas med den tid som faktiskt är kvar — en omladdning mitt i en nedräkning är alltså rätt.
//
// studio.js rörs aldrig: wh/props/bind lindas härifrån. Filen laddas via skript-svansen i media.js.
(function (root) {
  'use strict';

  var KISTOR = {};            // kistaId -> { id, namn, bild, diamanter, personer, oppnasAt, dold, sedd, oppnadVid }
  var fryst = false;          // pixelvaktens regi: ingen klocka, fast tid kvar
  var FRYST_KVAR_MS = 42000;
  var UTAN_TID_MS = 30000;    // en kista utan öppningstid visas så här länge

  var arKista = function (w) { return !!w && w.type === 'templateTreasureChest'; };
  var widgetar = function () { try { return state.widgets.filter(arKista); } catch (e) { return []; } };
  var iOverlay = function () { try { return document.body.classList.contains('overlay-output') || new URLSearchParams(location.search).has('overlay'); } catch (e) { return false; } };
  var saker = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var sakerUrl = function (u) { u = String(u || ''); return /^(https?:\/\/|assets\/|data:image\/)/i.test(u) ? saker(u) : ''; };
  var nu = function () { return Date.now(); };
  var efterMs = function (w) { var s = Number(w && w.kistaEfterOppning); return (Number.isFinite(s) && s >= 0 ? Math.min(60, s) : 8) * 1000; };

  function tid(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sek = s % 60;
    var tva = function (n) { return (n < 10 ? '0' : '') + n; };
    return h ? h + ':' + tva(m) + ':' + tva(sek) : tva(m) + ':' + tva(sek);
  }
  function kort(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(Math.round(n));
  }

  // ---- KISTORNA (gemensamma för alla widgetar) ------------------------------------------------
  function ta(e, ogonblick) {
    if (!e || String(e.type || '').toLowerCase() !== 'envelope') return false;
    var id = String(e.kistaId || '');
    if (!id) return false;
    var t = ogonblick || nu(), oppnas = Number(e.oppnasAt) || 0, finns = KISTOR[id];
    if (e.kistaDold) {
      if (finns) { finns.dold = true; if (!finns.oppnadVid) finns.oppnadVid = t; }
      schemalagg(); return true;
    }
    // Historik: kistan öppnades för länge sedan. Visa den inte igen.
    var sedd = Number(e.at) || t;
    if (oppnas && oppnas + 60000 < t) return false;
    if (!oppnas && sedd + UTAN_TID_MS < t) return false;
    KISTOR[id] = {
      id: id, namn: String(e.name || e.username || ''), bild: String(e.profileImage || e.profileUrl || ''),
      diamanter: Number(e.diamonds) || Number(e.value) || 0, personer: Number(e.count) || 0,
      oppnasAt: oppnas, dold: false, sedd: finns ? finns.sedd : sedd, oppnadVid: 0
    };
    schemalagg(); return true;
  }
  // Den kista en widget ska visa: den som öppnas först bland dem som fortfarande lever.
  function aktuell(w, t) {
    var basta = null;
    Object.keys(KISTOR).forEach(function (id) {
      var k = KISTOR[id], slut = slutFor(k, w);
      if (t >= slut) return;
      if (!basta || (k.oppnasAt || Infinity) < (basta.oppnasAt || Infinity)) basta = k;
    });
    return basta;
  }
  function slutFor(k, w) {
    if (k.dold) return (k.oppnadVid || 0) + Math.min(efterMs(w), 3000);
    if (k.oppnasAt) return k.oppnasAt + efterMs(w);
    return k.sedd + UTAN_TID_MS;
  }
  function stadaKistor(t) {
    Object.keys(KISTOR).forEach(function (id) { if (t > slutFor(KISTOR[id], null) + 60000) delete KISTOR[id]; });
  }

  // ---- RITNING -------------------------------------------------------------------------------
  var KIST_SVG = function (klass, pfx) {
    pfx = 'sk' + String(pfx || '').replace(/[^a-z0-9]/gi, '');
    return '<svg class="' + klass + '" viewBox="0 0 200 170" aria-hidden="true">'
      + '<defs>'
      + '<linearGradient id="' + pfx + 'Tra" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a4a1c"/><stop offset="1" stop-color="#4a220b"/></linearGradient>'
      + '<linearGradient id="' + pfx + 'Guld" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1b0"/><stop offset=".45" stop-color="var(--sk,#ffc94d)"/><stop offset="1" stop-color="#9a6a10"/></linearGradient>'
      + '<radialGradient id="' + pfx + 'Sken" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="var(--sk,#ffc94d)" stop-opacity=".9"/><stop offset="1" stop-color="var(--sk,#ffc94d)" stop-opacity="0"/></radialGradient>'
      + '</defs>'
      + '<ellipse class="sk-sken" cx="100" cy="92" rx="96" ry="70" fill="url(#' + pfx + 'Sken)"/>'
      + '<g class="sk-stralar">' + [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '<path d="M100 84 L' + (40 + i * 20) + ' 6 L' + (48 + i * 20) + ' 6 Z" fill="var(--sk,#ffc94d)" opacity=".55"/>'; }).join('') + '</g>'
      + '<g class="sk-kropp">'
      + '<rect x="22" y="80" width="156" height="78" rx="10" fill="url(#' + pfx + 'Tra)"/>'
      + '<rect x="22" y="80" width="156" height="12" fill="url(#' + pfx + 'Guld)"/>'
      + '<rect x="40" y="80" width="14" height="78" fill="url(#' + pfx + 'Guld)"/><rect x="146" y="80" width="14" height="78" fill="url(#' + pfx + 'Guld)"/>'
      + '<rect x="22" y="150" width="156" height="8" rx="3" fill="url(#' + pfx + 'Guld)"/>'
      + '<rect x="86" y="92" width="28" height="32" rx="6" fill="url(#' + pfx + 'Guld)" stroke="#6b4608" stroke-width="2"/>'
      + '<circle cx="100" cy="104" r="4.5" fill="#3a2305"/><rect x="98" y="104" width="4" height="10" rx="2" fill="#3a2305"/>'
      + '</g>'
      + '<g class="sk-lock">'
      + '<path d="M22 84 V62 Q22 30 100 30 Q178 30 178 62 V84 Z" fill="url(#' + pfx + 'Tra)"/>'
      + '<path d="M22 84 V62 Q22 30 100 30 Q178 30 178 62 V84" fill="none" stroke="url(#' + pfx + 'Guld)" stroke-width="7"/>'
      + '<path d="M47 84 V56 Q47 38 54 36" fill="none" stroke="url(#' + pfx + 'Guld)" stroke-width="12"/><path d="M153 84 V56 Q153 38 146 36" fill="none" stroke="url(#' + pfx + 'Guld)" stroke-width="12"/>'
      + '<rect x="22" y="78" width="156" height="8" rx="3" fill="url(#' + pfx + 'Guld)"/>'
      + '</g>'
      + '<g class="sk-glans"><path d="M60 46 Q80 36 104 36" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="4" stroke-linecap="round"/></g>'
      + '</svg>';
  };

  function innehall(w, k, t, forhand) {
    var kvar = k.oppnasAt ? k.oppnasAt - t : NaN, oppen = k.dold || (k.oppnasAt && kvar <= 0);
    var klocka = oppen ? 'ÖPPNA NU!' : (k.oppnasAt ? tid(kvar) : 'SNART');
    var visaNamn = w.kistaVisaAvsandare !== false && k.namn;
    var avatar = visaNamn && sakerUrl(k.bild) ? '<img class="sk-avatar" src="' + sakerUrl(k.bild) + '" alt="">' : '';
    if ((w.kistaDesign || 'kista') === 'pill') {
      return '<div class="sk-pill">' + KIST_SVG('sk-ikon', w.id)
        + '<b class="sk-diamanter">💎 ' + saker(kort(k.diamanter)) + '</b>'
        + '<span class="sk-sep"></span>'
        + '<span class="sk-text">' + (oppen ? '' : 'öppnas ') + '<b class="sk-klocka">' + saker(klocka) + '</b></span>'
        + (avatar ? avatar : '') + '</div>';
    }
    return '<div class="sk-kort">'
      + '<small class="sk-rubrik">' + saker(w.kistaRubrik || 'SKATTKISTA') + '</small>'
      + KIST_SVG('sk-bild', w.id)
      + '<b class="sk-diamanter">💎 ' + saker(kort(k.diamanter)) + '</b>'
      + '<b class="sk-klocka">' + saker(klocka) + '</b>'
      + (visaNamn ? '<span class="sk-fran">' + avatar + '<span>från <b>' + saker(k.namn) + '</b>' + (k.personer ? ' · delas av ' + saker(kort(k.personer)) : '') + '</span></span>' : '')
      + (forhand ? '<em class="sk-forhand">Förhandsvisning · syns i sändningen när en kista kommer</em>' : '')
      + '</div>';
  }
  function klasser(k, t) {
    if (!k) return '';
    var kvar = k.oppnasAt ? k.oppnasAt - t : NaN, oppen = k.dold || (k.oppnasAt && kvar <= 0);
    return ' sk-aktiv' + (oppen ? ' sk-oppen' : (kvar <= 10000 ? ' sk-snart' : ''));
  }
  var FORHAND = { id: 'forhand', namn: 'Tittare', bild: 'assets/images/test-profile.svg', diamanter: 100, personer: 12, oppnasAt: 0, dold: false };

  function html(w) {
    var t = nu(), k = fryst ? FRYST_KISTA() : aktuell(w, t), forhand = !k && !iOverlay();
    var visa = k || (forhand ? Object.assign({}, FORHAND, { oppnasAt: t + FRYST_KVAR_MS }) : null);
    var design = (w.kistaDesign || 'kista') === 'pill' ? 'pill' : 'kista';
    var vald = typeof selected !== 'undefined' && selected === w.id;
    return '<div class="widget skattkista sk-' + design + klasser(k, fryst ? 0 : t) + (forhand ? ' sk-forhandsvisning' : '') + (vald ? ' selected' : '') + '" data-id="' + saker(w.id) + '"'
      + ' style="left:' + (w.x || 0) + 'px;top:' + (w.y || 0) + 'px;width:' + (w.width || (design === 'pill' ? 340 : 220)) + 'px;--sk:' + saker(w.kistaFarg || '#ffc94d') + ';zoom:' + (w.widgetScale || 1) + ';z-index:' + (w.layer || 1) + '">'
      + (visa ? innehall(w, visa, fryst ? 0 : t, forhand) : innehall(w, FORHAND, t, false))
      + (vald ? '<span class="resize-handle">↘</span>' : '') + '</div>';
  }
  var FRYST_KISTA = function () { return Object.assign({}, FORHAND, { id: 'fryst', oppnasAt: FRYST_KVAR_MS }); };

  // KLOCKAN. Bara texten och klasserna uppdateras — aldrig render(), som bygger om hela vyn.
  var timer = 0;
  function schemalagg() {
    if (timer || fryst) return;
    timer = setInterval(tick, 250);
    tick();
  }
  function tick() {
    var t = nu(), levande = false;
    stadaKistor(t);
    widgetar().forEach(function (w) {
      var el = document.querySelector('.widget.skattkista[data-id="' + (window.CSS && CSS.escape ? CSS.escape(w.id) : w.id) + '"]');
      if (!el) return;
      var k = aktuell(w, t);
      if (k) levande = true;
      var ska = 'widget skattkista sk-' + ((w.kistaDesign || 'kista') === 'pill' ? 'pill' : 'kista') + klasser(k, t)
        + (!k && !iOverlay() ? ' sk-forhandsvisning' : '') + (el.classList.contains('selected') ? ' selected' : '');
      // Byts kistan (eller försvinner) ritas innehållet om; annars bara klockan.
      if ((el.dataset.kista || '') !== (k ? k.id + (k.dold ? ':d' : '') : '')) {
        el.dataset.kista = k ? k.id + (k.dold ? ':d' : '') : '';
        var ny = document.createElement('div'); ny.innerHTML = html(w);
        var fresh = ny.firstElementChild; if (fresh) { el.innerHTML = fresh.innerHTML; }
      } else if (k) {
        var kvar = k.oppnasAt ? k.oppnasAt - t : NaN, oppen = k.dold || (k.oppnasAt && kvar <= 0);
        var text = oppen ? 'ÖPPNA NU!' : (k.oppnasAt ? tid(kvar) : 'SNART');
        el.querySelectorAll('.sk-klocka').forEach(function (b) { if (b.textContent !== text) b.textContent = text; });
        var pre = el.querySelector('.sk-pill .sk-text');
        if (pre && pre.firstChild && pre.firstChild.nodeType === 3) { var p = oppen ? '' : 'öppnas '; if (pre.firstChild.textContent !== p) pre.firstChild.textContent = p; }
      }
      if (el.className !== ska) el.className = ska;
    });
    if (!levande && !Object.keys(KISTOR).length && timer) { clearInterval(timer); timer = 0; }
  }

  root.addEventListener('vyra-live-event', function (ev) { if (!fryst) ta(ev && ev.detail); });

  // ---- RENDERING, PANEL OCH KATALOG (monkeypatch) ---------------------------------------------
  if (typeof wh === 'function') {
    var forraWh = wh;
    wh = function (w) { return arKista(w) ? html(w) : forraWh(w); };
  }
  if (typeof props === 'function') {
    var forraProps = props;
    props = function () {
      var w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
      if (!arKista(w)) return forraProps();
      var sek = function (rubrik, h) { return typeof pgSection === 'function' ? pgSection(rubrik, h, true) : '<div class="property-group"><h4>' + rubrik + '</h4>' + h + '</div>'; };
      var design = w.kistaDesign || 'kista';
      return '<h3>SKATTKISTA</h3><div class="template-badge">LIVE · NÄR TITTARE SKICKAR EN KISTA</div>'
        + '<div hidden><input id="pt" value="' + saker(w.title || '') + '"><input id="pv" value=""></div>'
        + sek('DESIGN', '<label>Design<select id="skDesign"><option value="kista"' + (design === 'kista' ? ' selected' : '') + '>Kista + stor nedräkning</option><option value="pill"' + (design === 'pill' ? ' selected' : '') + '>Kompakt rad</option></select></label>'
          + '<label>Färg<input id="skFarg" type="color" value="' + saker(w.kistaFarg || '#ffc94d') + '"></label>'
          + '<label>Rubrik<input id="skRubrik" maxlength="24" value="' + saker(w.kistaRubrik || 'SKATTKISTA') + '"></label>')
        + sek('INNEHÅLL', '<label class="switch-row">Visa avsändaren<input id="skAvsandare" type="checkbox"' + (w.kistaVisaAvsandare === false ? '' : ' checked') + '><i></i></label>'
          + '<label>Visas öppen i … sekunder<input id="skEfter" type="number" min="0" max="60" value="' + (Number.isFinite(Number(w.kistaEfterOppning)) ? Number(w.kistaEfterOppning) : 8) + '"></label>'
          + '<small>I sändningen syns widgeten bara medan en kista finns. Nedräkningen följer TikToks egen öppningstid.</small>')
        + sek('TESTA', '<button id="skTesta" type="button">▶ Testa kista (30 s)</button>')
        + sek('POSITION & STORLEK', '<div class="property-grid"><label>X<input id="propX" type="number" value="' + (w.x || 0) + '"></label><label>Y<input id="propY" type="number" value="' + (w.y || 0) + '"></label><label>Bredd<input id="propWidth" type="number" value="' + (w.width || 220) + '"></label><label>Lager<input id="propLayer" type="number" value="' + (w.layer || 1) + '"></label></div>')
        + '<button class="delete" id="del">Ta bort</button>';
    };
  }
  if (typeof bind === 'function') {
    var forraBind = bind;
    bind = function () {
      forraBind.apply(this, arguments);
      try { bindPanel(); bindKatalog(); } catch (e) {}
      if (Object.keys(KISTOR).length) schemalagg();
    };
  }
  function bindPanel() {
    if (typeof view === 'undefined' || view !== 'editor') return;
    var w = typeof liveWidget === 'function' ? liveWidget(selected) : null; if (!arKista(w)) return;
    var q = function (s) { return document.querySelector('.properties ' + s) || document.querySelector(s); };
    var spara = function () { if (typeof save === 'function') save(); if (typeof render === 'function') render(); if (typeof bind === 'function') bind(); };
    var el;
    // Namnet i lagerlistan följer designen så länge det är ett standardnamn (se latonskningar.js).
    if ((el = q('#skDesign'))) el.onchange = function (e) {
      w.kistaDesign = e.target.value === 'pill' ? 'pill' : 'kista'; w.width = w.kistaDesign === 'pill' ? 340 : 220;
      if (!w.title || w.title === 'Skattkista' || w.title === 'Skattkista · rad') w.title = w.kistaDesign === 'pill' ? 'Skattkista · rad' : 'Skattkista';
      spara();
    };
    if ((el = q('#skFarg'))) el.onchange = function (e) { w.kistaFarg = e.target.value; spara(); };
    if ((el = q('#skRubrik'))) el.onchange = function (e) { w.kistaRubrik = String(e.target.value || '').slice(0, 24); spara(); };
    if ((el = q('#skAvsandare'))) el.onchange = function (e) { w.kistaVisaAvsandare = e.target.checked; spara(); };
    if ((el = q('#skEfter'))) el.onchange = function (e) { w.kistaEfterOppning = Math.max(0, Math.min(60, Math.round(Number(e.target.value) || 0))); if (typeof save === 'function') save(); };
    if ((el = q('#skTesta'))) el.onclick = function () { testa(30); };
  }
  function testa(sek) {
    ta({ type: 'envelope', kistaId: 'test-' + nu(), name: 'Testtittare', profileImage: 'assets/images/test-profile.svg',
      diamonds: 100, count: 12, oppnasAt: nu() + sek * 1000, at: nu() });
  }
  var NYCKLAR = [
    ['catalog:skattkista:kista', 'Skattkista', 'Kista + stor nedräkning · live'],
    ['catalog:skattkista:pill', 'Skattkista · rad', 'Kompakt rad med nedräkning · live']
  ];
  function bindKatalog() {
    if (typeof view === 'undefined' || (view !== 'editor' && view !== 'overlay')) return;
    var katalog = document.querySelector('.widget-catalog');
    if (!katalog || katalog.querySelector('[data-skattkista]')) return;
    var sektion = document.createElement('section');
    sektion.dataset.skattkista = '1';
    sektion.innerHTML = '<h4>SKATTKISTA · LIVE</h4>';
    NYCKLAR.forEach(function (n) {
      var knapp = document.createElement('button');
      knapp.type = 'button'; knapp.dataset.catalogKey = n[0];
      knapp.innerHTML = '<i>💎</i><span><b>' + n[1] + '</b><small>' + n[2] + '</small></span>';
      knapp.onclick = function () {
        var w = root.VyraWidgets.create(n[0]);
        state.widgets.push(w); selected = w.id; if (typeof save === 'function') save(); if (typeof render === 'function') render();
        if (typeof toast === 'function') toast(n[1] + ' skapad');
      };
      sektion.appendChild(knapp);
    });
    katalog.appendChild(sektion);
  }

  // ---- STIL ----------------------------------------------------------------------------------
  if (!document.getElementById('sk-stil')) {
    var st = document.createElement('style'); st.id = 'sk-stil';
    st.textContent = [
      '.skattkista{position:absolute;background:transparent;color:#fff;font-family:inherit;pointer-events:auto}',
      '.overlay-output .skattkista:not(.sk-aktiv){visibility:hidden}',
      '.skattkista .sk-kort{display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center;padding:10px 8px 12px}',
      '.skattkista .sk-rubrik{font-size:11px;font-weight:800;letter-spacing:.24em;color:var(--sk);text-shadow:0 1px 6px #000c}',
      '.skattkista .sk-bild{width:78%;height:auto;overflow:visible;filter:drop-shadow(0 8px 14px #000a)}',
      '.skattkista .sk-sken{opacity:.55;transform-origin:100px 92px;transform-box:view-box}',
      '.skattkista .sk-fran b,.skattkista .sk-pill b,.skattkista .sk-text{display:inline}',
      '.skattkista .sk-rubrik{margin-bottom:6px}',
      '.skattkista .sk-stralar{opacity:0;transform-origin:100px 84px;transform-box:view-box;transition:opacity .4s}',
      '.skattkista .sk-lock{transform-origin:100px 84px;transform-box:view-box;transition:transform .5s cubic-bezier(.3,1.6,.5,1)}',
      '.skattkista .sk-diamanter{font-size:22px;font-weight:900;line-height:1.1;text-shadow:0 2px 8px #000d}',
      '.skattkista .sk-klocka{font-size:34px;font-weight:900;line-height:1;font-variant-numeric:tabular-nums;color:#fff;text-shadow:0 0 14px var(--sk),0 2px 6px #000e;letter-spacing:.02em}',
      '.skattkista .sk-fran{display:flex;align-items:center;gap:6px;margin-top:4px;font-size:12px;opacity:.92;text-shadow:0 1px 4px #000d;max-width:100%}',
      '.skattkista .sk-fran>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.skattkista .sk-fran span,.skattkista .sk-fran b{font-size:13px}',
      '.skattkista .sk-avatar{width:22px;height:22px;border-radius:50%;object-fit:cover;border:2px solid var(--sk);flex:none}',
      '.skattkista .sk-forhand{font-style:normal;font-size:10px;opacity:.6;margin-top:6px}',
      '.skattkista.sk-snart .sk-bild{animation:skSkak .5s ease-in-out infinite}',
      '.skattkista.sk-snart .sk-klocka{color:var(--sk)}',
      '.skattkista.sk-oppen .sk-lock{transform:rotate(-16deg) translate(-2px,-8px)}',
      '.skattkista.sk-oppen .sk-stralar{opacity:1;animation:skPuls 1.2s ease-in-out infinite}',
      '.skattkista.sk-oppen .sk-sken{animation:skPuls 1.2s ease-in-out infinite}',
      '.skattkista.sk-oppen .sk-klocka{font-size:28px;color:var(--sk)}',
      '.skattkista .sk-pill{display:flex;align-items:center;gap:8px;height:52px;padding:0 14px 0 8px;border-radius:26px;background:linear-gradient(90deg,#1b1206e6,#2a1b08d9);border:2px solid var(--sk);box-shadow:0 0 16px color-mix(in srgb,var(--sk),transparent 55%),0 6px 16px #0008;white-space:nowrap;overflow:hidden}',
      '.skattkista .sk-ikon{width:44px;height:38px;flex:none;overflow:visible}',
      '.skattkista .sk-pill .sk-diamanter{font-size:18px}',
      '.skattkista .sk-sep{width:1px;align-self:stretch;margin:12px 2px;background:color-mix(in srgb,var(--sk),transparent 50%)}',
      '.skattkista .sk-text{font-size:13px;opacity:.95;flex:none;white-space:nowrap}',
      '.skattkista .sk-pill .sk-avatar{margin-left:auto}',
      '.skattkista .sk-pill .sk-klocka{font-size:20px;vertical-align:-2px}',
      '.skattkista.sk-snart .sk-ikon{animation:skSkak .5s ease-in-out infinite}',
      '.skattkista .sk-pill .sk-avatar{width:30px;height:30px}',
      '@keyframes skSkak{0%,100%{transform:rotate(0)}25%{transform:rotate(-4deg)}75%{transform:rotate(4deg)}}',
      '@keyframes skPuls{0%,100%{opacity:.55}50%{opacity:1}}',
      '@media (prefers-reduced-motion:reduce){.skattkista *{animation:none!important;transition:none!important}}',
      '.skattkista.sk-fryst *{animation:none!important;transition:none!important}'
    ].join('');
    document.head.appendChild(st);
  }

  // ---- PROV OCH PIXELVAKTENS REGI ------------------------------------------------------------
  // stilla(): ingen klocka, en fast kista med 00:42 kvar och alla rörelser avstängda. Bilden är då
  // bestämd av koden, även i overlay-läget där widgeten annars är osynlig i vila.
  root.VyraSkattkista = {
    ta: function (e) { return ta(e); },
    testa: testa,
    tillstand: function (id) {
      var w = widgetar().filter(function (x) { return x.id === id; })[0]; if (!w) return null;
      var k = aktuell(w, nu()); return k ? { id: k.id, kvarMs: k.oppnasAt ? k.oppnasAt - nu() : null, dold: k.dold, diamanter: k.diamanter, namn: k.namn } : null;
    },
    rensa: function () { Object.keys(KISTOR).forEach(function (k) { delete KISTOR[k]; }); tick(); },
    stilla: function () {
      fryst = true; if (timer) { clearInterval(timer); timer = 0; }
      var n = 0;
      widgetar().forEach(function (w) {
        var el = document.querySelector('.widget.skattkista[data-id="' + w.id + '"]'); if (!el) return;
        var ny = document.createElement('div'); ny.innerHTML = html(w);
        var f = ny.firstElementChild; if (!f) return;
        el.className = f.className + ' sk-fryst'; el.innerHTML = f.innerHTML; n++;
      });
      return n;
    },
    tid: tid
  };
  if (typeof render === 'function' && typeof view !== 'undefined') { try { render(); bind(); } catch (e) {} }
})(typeof window !== 'undefined' ? window : globalThis);
