// DUKENS GRÄNS — så att en widget aldrig kan TAPPAS BORT ur bildrutan, och så att den som
// ändå har försvunnit SYNS i editorn.
//
// BAKGRUND, uppmätt 2026-09-19: Davids layout hade Top Gift på x=-16 och Top Like på x=688
// i en duk som är 432 bred — 256 px bortom kanten. Editorn lät honom dra dit och sa
// ingenting, så widgetarna fanns kvar i datan men syntes aldrig i OBS eller TikTok LIVE
// Studio. Samma mönster fanns i bandet från sändningen 2026-09-18 (Top Gift x=736,
// Battle MVP y=768).
//
// REGELN AR FRI PLACERING MED EN SYNLIG DEL sedan 2026-09-26. Davids ord: "om jag vill gora
// den stor widget och lite hamnar utanfor den ska inte vara problem, men att man stoppar
// widget flytta vart man vill ar problem". En widget far alltsa dras, goras storre an duken och
// hamna delvis utanfor - det enda som stoppas ar att den forsvinner: minst MIN_SYNLIG px av den
// (eller hela, om den ar mindre) ligger alltid kvar pa duken i bada leder, sa den gar att se och
// ta tag i igen. Top Like pa x=688 (2026-09-19) hade inte gatt att dra dit.
//
// FORE DET (2026-09-20 till 09-26) var regeln FULL INNESLUTNING: hela boxen skulle rymmas.
// Den stoppade widgetar vid kanten och krympte dem som var storre an duken, och det var just
// det som gjorde att widgetar inte gick att placera dar man ville.
//
// VAGARNA IN: draget (haktaDrag) och panelens X/Y-falt (klampFalt) haller kvar en synlig del.
// Resize-handtagen (widget-handles.js) och Bredd-faltet har ingen ovre grans. "Flytta in"
// (flyttaInAlla) flyttar bara in widgetar som forsvunnit, och katalogen (passaInNya) ger en
// NYSKAPAD widget ett lage som ryms helt - tills anvandaren sjalv tar i den.
//
// DUKENS MÅTT LÄSES UR DOM:EN, aldrig hårdkodat. `.editor-shell .canvas` har
// `width:var(--layout-width,432px)` (studio.css:570) och layout-format.js skriver om
// variabeln vid formatbyte. En hårdkodad 432:a hade tyst gett fel gräns för `widescreen`.
// offsetWidth är LAYOUTstorlek och påverkas inte av zoomens CSS-transform.
//
// VI RÖR ALDRIG BEFINTLIGA LÄGEN VID INLÄSNING. En engångsflytt av redan sparade widgetar
// hade skrivit om kundens layout bakom ryggen på hen — samma klass av fel som
// mount-migreringarna. Gränsen gäller det användaren gör härifrån och framåt.
(function (root) {
  'use strict';

  var STANDARD = { bredd: 432, hojd: 768 };
  var MIN_KVAR = 8;               // en rutnätsruta, samma mått som snappens rutnät
  var MIN_SYNLIG = 48;            // så mycket av en widget som alltid ligger kvar på duken

  function duken() {
    try {
      var c = document.querySelector('.editor-shell .canvas') || document.querySelector('.canvas');
      if (c && c.offsetWidth > 0 && c.offsetHeight > 0) {
        return { bredd: c.offsetWidth, hojd: c.offsetHeight };
      }
    } catch (e) {}
    return { bredd: STANDARD.bredd, hojd: STANDARD.hojd };
  }

  // WIDGETENS EGEN NEDSKALNING MASTE RAKNAS MED.
  //
  // UPPMATT 2026-09-21 i Davids egen layout, i riktig Chrome:
  //   Top Gift      offsetWidth 340  syns 119  =>  kom hogst till x 92 av 432
  //   Top Likes     offsetWidth 382  syns 226  =>  kom hogst till x 50
  //   Top Streak    offsetWidth 220  syns  77  =>  kom hogst till x 212
  //   Gifter Level  offsetWidth 270  syns 216  =>  kom hogst till x 162
  // Widgetarna satter `zoom:${w.widgetScale||1}` som INLINE-stil (se vyraTopLike i studio.js
  // och syskonrenderarna). `zoom` skalar bade storleken OCH offseten, men `offsetWidth` ar
  // LAYOUTmattet och kanner inte av den. Inneslutningen reserverade darfor upp till tre
  // ganger widgetens synliga bredd, och hela hogra delen av duken blev omojlig att nA.
  // Davids ord 2026-09-21: "den duken som visar pa layout ska man kunna placera widget dar
  // hela duken".
  //
  // LOSNINGEN AR ETT KOORDINATBYTE, INTE EN LOSARE GRANS. `x` och `width` lever i widgetens
  // EGET oskalade rum (style.left = x px, som zoom sedan krymper). Uttrycker man duken i
  // samma rum - dukens matt delat med skalan - blir jamforelsen `x + width <= duk/skala`
  // exakt rätt, och regeln "hela widgeten ska synas" haller precis som forut. For en
  // oskalad widget (zoom 1) ar det identiskt med den gamla berakningen.
  function skalanFor(el) {
    try {
      if (!el || typeof getComputedStyle !== 'function') return 1;
      var z = getComputedStyle(el).zoom;              // 'normal' i webblasare utan stod
      var s = parseFloat(z);
      return Number.isFinite(s) && s > 0 ? s : 1;
    } catch (e) { return 1; }
  }

  // Dukens matt uttryckta i widgetens eget rum. Ren rakning, sa den gar att prova utan DOM.
  function dukIWidgetens(dukMatt, skala) {
    var d = dukMatt || duken();
    var s = Number.isFinite(skala) && skala > 0 ? skala : 1;
    return { bredd: d.bredd / s, hojd: d.hojd / s };
  }

  // Dukens matt for ETT element, med dess egen nedskalning inraknad.
  function dukFor(el, dukMatt) {
    return dukIWidgetens(dukMatt || duken(), skalanFor(el));
  }

  // EN SYNLIG DEL KVAR, INTE HELA WIDGETEN. Laget far ga sa langt at vanster/uppat att bara
  // `synlig` px av widgeten ar kvar pa duken, och lika langt at hoger/nedat. En widget storre
  // an duken far darmed ocksa ett fritt lage. `synlig` ar i widgetens eget rum (MIN_SYNLIG delat
  // med skalan, se klampElement), sa en nedskalad widget behaller lika manga SYNLIGA pixlar.
  // Okand storlek: origo-reserven, 0 till duk minus en rutnatsruta.
  function klampEtt(varde, dukMatt, storlek, synlig) {
    if (!Number.isFinite(varde)) return 0;
    if (!(Number.isFinite(storlek) && storlek > 0)) {
      return Math.min(Math.max(0, varde), Math.max(0, dukMatt - MIN_KVAR));
    }
    var m = Math.min(Number.isFinite(synlig) && synlig > 0 ? synlig : MIN_SYNLIG, storlek);
    var r = Math.min(Math.max(m - storlek, varde), dukMatt - m);
    return r === 0 ? 0 : r;                                   // aldrig -0 i layouten
  }

  function klamp(vanster, topp, dukMatt, storlek, synlig) {
    var d = dukMatt || duken(), st = storlek || {};
    return { vanster: klampEtt(vanster, d.bredd, st.bredd, synlig),
      topp: klampEtt(topp, d.hojd, st.hojd, synlig) };
  }

  // Sant nar for lite av widgeten syns for att den ska ga att hitta: mindre an `synlig` px
  // (eller hela, om den ar mindre) ligger pa duken i nagon led. Det ar det enda som markeras
  // och raknas - en widget som bara sticker ut delvis ar ett val, inte ett fel.
  function forsvunnen(vanster, topp, bredd, hojd, dukMatt, synlig) {
    var d = dukMatt || duken(), b = bredd || 0, h = hojd || 0;
    var s = Number.isFinite(synlig) && synlig > 0 ? synlig : MIN_SYNLIG;
    var iX = Math.min(vanster + b, d.bredd) - Math.max(vanster, 0);
    var iY = Math.min(topp + h, d.hojd) - Math.max(topp, 0);
    return iX < Math.min(s, b) - 1 || iY < Math.min(s, h) - 1 || vanster >= d.bredd || topp >= d.hojd;
  }

  // Widgetens egen MIN_SYNLIG, i dess eget rum.
  function synligFor(el) { return MIN_SYNLIG / skalanFor(el); }

  // Sant när widgeten sticker ut ur duken — åt något håll. Flyttar ingenting; används av
  // markeringen så att den som redan står fel går att se utan att layouten skrivs om.
  function stickerUt(vanster, topp, bredd, hojd, dukMatt) {
    var d = dukMatt || duken();
    return vanster < 0 || topp < 0 ||
      vanster + (bredd || 0) > d.bredd || topp + (hojd || 0) > d.hojd;
  }

  // ---- MARKERINGEN -----------------------------------------------------------------------
  // ALDRIG I SÄNDNINGEN. overlay-output är OBS/TikTok-utdata; en markering där hade stått
  // mitt i bilden för tittarna. Samma regel som lankraden i #264 och felrutan i #470.
  function iEditorn() {
    try {
      return !document.documentElement.classList.contains('overlay-output');
    } catch (e) { return false; }
  }

  function markera() {
    if (!iEditorn()) return 0;
    var d = duken(), antal = 0;
    try {
      document.querySelectorAll('.editor-shell .canvas .widget[data-id]').forEach(function (el) {
        var ut = forsvunnen(parseInt(el.style.left, 10), parseInt(el.style.top, 10),
          el.offsetWidth, el.offsetHeight, dukFor(el, d), synligFor(el));
        if (ut) { el.dataset.utanforDuken = '1'; antal++; }
        else delete el.dataset.utanforDuken;
      });
    } catch (e) {}
    return antal;
  }

  // ---- RÄKNAREN --------------------------------------------------------------------------
  // Markeringen ensam räcker inte: en widget som ligger HELT utanför duken har sin markering
  // också utanför, och då syns varningen lika lite som widgeten. Uppmätt på Davids egen
  // layout — Top Like på x=688 låg utanför hela redigeringsytan. Räknaren sitter i
  // verktygsraden och syns oavsett var widgeten hamnat.
  //
  // Verktygsraden är redan dold i overlay-utdata (studio.css:257), så räknaren kan fysiskt
  // inte hamna i sändningen.
  function rakna() {
    if (!iEditorn()) return [];
    var d = duken(), ute = [];
    try {
      document.querySelectorAll('.editor-shell .canvas .widget[data-id]').forEach(function (el) {
        if (forsvunnen(parseInt(el.style.left, 10), parseInt(el.style.top, 10),
          el.offsetWidth, el.offsetHeight, dukFor(el, d), synligFor(el))) ute.push(el.dataset.id);
      });
    } catch (e) {}
    return ute;
  }

  // KNAPPEN flyttar in de widgetar som FORSVUNNIT - hela widgeten nar den far plats, annars
  // till kanten. Storleken rors inte: en widget storre an duken ar ett val. Ångra fungerar:
  // save() noterar i VyraHistorik före skrivningen.
  function flyttaInAlla() { return flyttaIn(null); }

  // `urval` ar en lista med id:n (de nyskapade, passaInNya) eller null (knappen). Bara de tva
  // kommer hit - en inlast layout gor det aldrig, se huvudet. De nyskapade far ett lage som
  // ryms HELT och krymps till dukens bredd om de ar bredare; knappen ror bara de forsvunna.
  function flyttaIn(urval) {
    if (!iEditorn()) return 0;
    var d = duken(), flyttade = 0;
    try {
      // `state` och `save` deklareras med const/let i studio.js och hamnar darfor ALDRIG pa
      // window — de ligger i den globala LEXIKALA miljon, som delas mellan skript. Darfor
      // bara namnet, inte root.state. Uppmatt: root.state var undefined och knappen gjorde
      // ingenting alls.
      var lager = (typeof state !== 'undefined') ? state : null;
      if (!lager || !Array.isArray(lager.widgets)) return 0;
      document.querySelectorAll('.editor-shell .canvas .widget[data-id]').forEach(function (el) {
        if (urval && urval.indexOf(el.dataset.id) < 0) return;
        var w = lager.widgets.filter(function (x) { return x.id === el.dataset.id })[0];
        if (!w) return;
        var x = parseInt(el.style.left, 10), y = parseInt(el.style.top, 10);
        var dw = dukFor(el, d);
        if (urval ? !stickerUt(x, y, el.offsetWidth, el.offsetHeight, dw)
                  : !forsvunnen(x, y, el.offsetWidth, el.offsetHeight, dw, synligFor(el))) return;
        // En NY widget bredare an duken (Glove Snipe 760, Like Fountain 620 i katalogen) far
        // dukens bredd som start. Bara `width` rors - hojden foljer innehallet.
        if (urval && el.offsetWidth > dw.bredd && Number.isFinite(Number(w.width))) w.width = dw.bredd;
        w.x = Math.min(Math.max(0, x), Math.max(0, dw.bredd - Math.min(el.offsetWidth, dw.bredd)));
        w.y = Math.min(Math.max(0, y), Math.max(0, dw.hojd - el.offsetHeight));
        flyttade++;
      });
      if (flyttade && typeof save === 'function') save();
      if (flyttade && typeof render === 'function') render();
    } catch (e) {}
    return flyttade;
  }

  // BANDEROLL OVANFOR DUKEN, INTE I VERKTYGSRADEN. Uppmatt vid 1280 px fonsterbredd:
  // verktygsraden har 538 px synligt at nio knappar och spillde over med 6 px REDAN utan den
  // har knappen — det ar darfor FORMAT, Mobil och Angra skriver over varandra dar. Varje
  // forsok att placera varningen i raden gav antingen en 54 px bred olaslig knapp eller en
  // knapp pa x=1026 som kravde att man rullade i sidled for att se den. En varning far inte
  // behova letas fram. Arbetsytan ovanfor duken har plats, och ar dessutom dar felet finns.
  function raknare() {
    if (!iEditorn()) return;
    var rad = document.querySelector('.editor-shell .workarea');
    if (!rad) return;
    var ute = rakna();
    var knapp = rad.querySelector('[data-grans-raknare]');
    if (!ute.length) { if (knapp) knapp.remove(); return; }
    if (!knapp) {
      knapp = document.createElement('button');
      knapp.type = 'button';
      knapp.dataset.gransRaknare = '1';
      knapp.onclick = flyttaInAlla;
      rad.prepend(knapp);
    }
    // Banderollen gar over hela arbetsytans bredd, sa hela meningen far plats. I
    // verktygsraden maste den kortas till '3 utanfor bild' for att over huvud taget rymmas.
    knapp.textContent = '⚠ ' + ute.length +
      (ute.length === 1 ? ' widget ligger' : ' widgetar ligger') +
      ' utanför bildrutan och syns inte i sändningen — klicka för att flytta in';
    knapp.title = 'Ångra fungerar om placeringen inte blir som du tänkt.';
  }

  // ---- NYA WIDGETAR RYMS FRÅN FÖRSTA STUND ----------------------------------------------
  // UPPMATT 2026-09-26 med hela katalogen (124 kort) i en riktig webblasare: 39 skapades med en
  // del utanfor duken, och 17 av dem var bredare an hela duken - Glove Snipe 760, Like Fountain
  // 620, Gift Campaign 608, Last-X 500 i en 432-ruta. Varje fynd ledde till en egen rattning av
  // en enskild widgets standardmatt, och nasta widget hade samma fel. Davids ord: "varje gang vi
  // ska testa en widget och blir det fel". Regeln ligger darfor HAR, en gang for alla: en widget
  // som just skapats ur katalogen far samma behandling som knappen "flytta in" ger, automatiskt.
  //
  // BARA NYA. Varje katalogknapp skapar sin widget med VyraWidgets.create, sa det ar dar vi ser
  // att en widget ar ny. En layout som laddas (sparad, fran molnet, en scen) skapas aldrig dar -
  // den ror vi inte, samma regel som i huvudet.
  //
  // BILDERNA AVGOR STORLEKEN. Manga widgetar far sin hojd forst nar ramens bild laddats (Goal
  // Tower var 48 px hog i stallet for 708), sa passningen gors om nar en bild eller video i den
  // nya widgeten laddas, under NY_FONSTER_MS. Den flyttar bara nagot som sticker ut.
  var NY_FONSTER_MS = 15000, nya = {}, iPassning = false;

  function passaInNya() {
    if (iPassning || !iEditorn()) return 0;
    // Fonstret raknas fran forsta gangen widgeten STAR PA DUKEN, inte fran skapandet: katalogen
    // ligger i en egen vy, och den som valjer en widget och tittar pa layouten en minut senare
    // ska fa samma passning.
    var nu = Date.now(), ids = [];
    Object.keys(nya).forEach(function (id) {
      var el = document.querySelector('.editor-shell .canvas .widget[data-id="' + id + '"]');
      if (!el) return;
      if (!nya[id]) nya[id] = nu;
      if (nu - nya[id] > NY_FONSTER_MS) delete nya[id]; else ids.push(id);
    });
    if (!ids.length) return 0;
    iPassning = true;
    try {
      ids.forEach(function (id) {
        var el = document.querySelector('.editor-shell .canvas .widget[data-id="' + id + '"]');
        if (!el) return;
        el.querySelectorAll('img,video').forEach(function (m) {
          if (m.__grans) return;
          m.__grans = 1;
          var igen = function () { requestAnimationFrame(passaInNya); };
          m.addEventListener(m.tagName === 'VIDEO' ? 'loadedmetadata' : 'load', igen, { once: true });
        });
      });
      return flyttaIn(ids);
    } catch (e) { return 0; } finally { iPassning = false; }
  }

  // ANVANDAREN BESTAMMER OVER PASSNINGEN. Sa fort widgeten tas i - drag, handtag eller ett
  // falt i panelen - slutar passningen for den. Annars hade den krympt tillbaka en widget som
  // anvandaren just gjort storre an duken med flit.
  function slappNy(id) { if (id && id in nya) delete nya[id]; }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('pointerdown', function (e) {
      try {
        var el = e.target && e.target.closest && e.target.closest('.editor-shell .canvas .widget[data-id]');
        if (el) slappNy(el.dataset.id);
      } catch (x) {}
    }, true);
    ['input', 'change'].forEach(function (typ) {
      document.addEventListener(typ, function (e) {
        try {
          if (e.target && e.target.closest && e.target.closest('.properties') && typeof selected !== 'undefined') slappNy(selected);
        } catch (x) {}
      }, true);
    });
  }

  function markeraNy(w) {
    // 0 = inte sedd pa duken an. Forhandsbilderna i katalogen skapar ocksa widgetar som aldrig
    // hamnar pa duken; de far inte vaxa listan utan gräns.
    try {
      if (w && w.id) {
        var ids = Object.keys(nya);
        if (ids.length > 300) ids.slice(0, 150).forEach(function (id) { delete nya[id]; });
        nya[w.id] = 0;
      }
    } catch (e) {}
    return w;
  }

  // ---- KROKEN I DRAGET -------------------------------------------------------------------
  // studio.js ar minifierad handkod och far enligt husregeln (domaner.json, studio-core)
  // ALDRIG andras direkt — den monkey-patchas fran syskonfil. Draget sitter som
  // el.onpointermove/onpointerup, satta av bind(), sa vi lindar dem efter varje bind().
  //
  // ORDNINGEN AR OLIKA I DE TVA: i move skriver originalet style.left, sa vi klamper EFTER.
  // I up LASER originalet style.left och skriver w.x, sa vi klamper FORE — annars sparas
  // det oklampade laget och widgeten hoppar tillbaka forst vid nasta ritning.
  function klampElement(el) {
    var k = klamp(parseInt(el.style.left, 10), parseInt(el.style.top, 10), dukFor(el),
      { bredd: el.offsetWidth, hojd: el.offsetHeight }, synligFor(el));
    el.style.left = k.vanster + 'px';
    el.style.top = k.topp + 'px';
  }

  function haktaDrag() {
    if (!iEditorn()) return 0;
    var antal = 0;
    try {
      document.querySelectorAll('.editor-shell .canvas .widget[data-id]').forEach(function (el) {
        // Markeringen sitter pa FUNKTIONEN, inte pa elementet: bind() satter om handlerarna
        // varje gang den kors, sa en flagga pa elementet hade fatt oss att hoppa over en
        // nod vars krok just skrivits over — och klampen hade tyst forsvunnit.
        var move = el.onpointermove, up = el.onpointerup, avbryt = el.onpointercancel;
        if (typeof move === 'function' && !move.__grans) {
          var nyMove = function (e) { var r = move.call(this, e); klampElement(el); return r; };
          nyMove.__grans = 1; el.onpointermove = nyMove; antal++;
        }
        if (typeof up === 'function' && !up.__grans) {
          var nyUp = function (e) { klampElement(el); return up.call(this, e); };
          nyUp.__grans = 1; el.onpointerup = nyUp;
        }
        if (typeof avbryt === 'function' && !avbryt.__grans) {
          var nyAv = function (e) { klampElement(el); return avbryt.call(this, e); };
          nyAv.__grans = 1; el.onpointercancel = nyAv;
        }
      });
    } catch (e) {}
    return antal;
  }

  function klampFalt(e) {
    var falt = e.target;
    if (!falt || !iEditorn() || typeof state === 'undefined' || typeof selected === 'undefined') return;
    if (falt.id !== 'propX' && falt.id !== 'propY' && falt.id !== 'propWidth') return;
    var w = (state.widgets || []).filter(function (x) { return x.id === selected })[0];
    var el = w && document.querySelector('.editor-shell .canvas .widget[data-id="' + w.id + '"]');
    if (!w || !el) return;
    var d = dukFor(el), v = Number(falt.value);
    if (!Number.isFinite(v)) return;
    var ny = v;
    if (falt.id === 'propWidth') ny = Math.max(60, v);                // storre an duken ar tillatet
    if (falt.id === 'propX') ny = Math.round(klampEtt(v, d.bredd, el.offsetWidth, synligFor(el)));
    if (falt.id === 'propY') ny = Math.round(klampEtt(v, d.hojd, el.offsetHeight, synligFor(el)));
    if (ny !== v) falt.value = ny;
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('change', klampFalt, true);
  }

  var api = {
    klamp: klamp, klampEtt: klampEtt, duken: duken, stickerUt: stickerUt, forsvunnen: forsvunnen,
    dukIWidgetens: dukIWidgetens, skalanFor: skalanFor, dukFor: dukFor,
    markera: markera, rakna: rakna, flyttaInAlla: flyttaInAlla, flyttaIn: flyttaIn, raknare: raknare,
    passaInNya: passaInNya, markeraNy: markeraNy, NY_FONSTER_MS: NY_FONSTER_MS,
    haktaDrag: haktaDrag,
    MIN_KVAR: MIN_KVAR, MIN_SYNLIG: MIN_SYNLIG, STANDARD: STANDARD
  };

  if (typeof module === 'object' && module.exports) { module.exports = api; return; }

  root.VyraGrans = api;

  // Markeringen och räknaren körs efter varje render. render() byter ut noderna, så en klass
  // satt en gång hade försvunnit vid nästa ritning.
  if (typeof root.render === 'function') {
    var forra = root.render;
    root.render = function () {
      var r = forra.apply(this, arguments);
      passaInNya(); markera(); raknare();
      return r;
    };
  }

  // Varje katalogknapp gar genom VyraWidgets.create - det ar dar en ny widget syns.
  if (root.VyraWidgets && typeof root.VyraWidgets.create === 'function' && !root.VyraWidgets.create.__grans) {
    var skapa = root.VyraWidgets.create;
    var nyCreate = function () { return markeraNy(skapa.apply(this, arguments)); };
    nyCreate.__grans = 1;
    root.VyraWidgets.create = nyCreate;
  }

  // Draget krokas efter varje bind(), samma monster som syskonfilerna anvander.
  if (typeof bind === 'function') {
    var forraBind = bind;
    bind = function () { var r = forraBind.apply(this, arguments); haktaDrag(); return r; };
  }
})(typeof window !== 'undefined' ? window : globalThis);
