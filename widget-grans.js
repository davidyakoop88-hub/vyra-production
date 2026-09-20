// DUKENS GRÄNS — så att en widget aldrig kan dras bort ur bildrutan, och så att den som
// ändå sticker ut SYNS i editorn.
//
// BAKGRUND, uppmätt 2026-09-19: Davids layout hade Top Gift på x=-16 och Top Like på x=688
// i en duk som är 432 bred — 256 px bortom kanten. Editorn lät honom dra dit och sa
// ingenting, så widgetarna fanns kvar i datan men syntes aldrig i OBS eller TikTok LIVE
// Studio. Samma mönster fanns i bandet från sändningen 2026-09-18 (Top Gift x=736,
// Battle MVP y=768).
//
// REGELN AR FULL INNESLUTNING sedan 2026-09-20: hela widgetens box ska rymmas pa duken.
// Davids ord: "den ytan man lagger widget den ska man se". Den forsta versionen (#472) nojde
// sig med att origo lag kvar med 8 px marginal, for att inte bryta kant-mot-kant-snappen i
// snapp.browser.test.js prov 4 - men den regeln lat Gift Fireworks sta pa 540 px bredd i hans
// 432 px ruta: synlig i editorn (contain:paint klipper), avklippt i sandningen. Snapp-riggen
// anvander numera widgetar sma nog att tva ryms, sa snappen provas dar den ar synlig.
//
// FYRA VAGAR IN, ALLA KLAMPADE: draget (haktaDrag), resize-handtagen (widget-handles.js),
// panelens X/Y/Bredd-falt (klampFalt, capture-lyssnare fore media.js:81) och "flytta in"
// (flyttaInAlla, som ocksa krymper en widget bredare an duken). Origo-regeln finns kvar som
// reserv nar storleken ar okand. INTE klampad: proportionslasets hojdfalt (vyra-proportioner.js
// satt()) kan fortfarande skriva en bredd via kvoten - markeringen fangar det, "flytta in"
// rattar det.
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

  function duken() {
    try {
      var c = document.querySelector('.editor-shell .canvas') || document.querySelector('.canvas');
      if (c && c.offsetWidth > 0 && c.offsetHeight > 0) {
        return { bredd: c.offsetWidth, hojd: c.offsetHeight };
      }
    } catch (e) {}
    return { bredd: STANDARD.bredd, hojd: STANDARD.hojd };
  }

  // HELA WIDGETEN SKA RYMMAS. Davids ord 2026-09-20: "den ytan man lagger widget den ska man
  // se". Origo-regeln (8 px kvar) lat en widget sticka ut till storsta delen, och i hans layout
  // lag Gift Fireworks pa 540 px bredd i en 432 px ruta - synlig i editorn, avklippt i
  // sandningen. Nu klamps laget sa att widgetens hela box ligger inne pa duken.
  // AR WIDGETEN STORRE AN DUKEN kan den inte rymmas; da gar origo till 0 och bredden far
  // hanteras av flyttaInAlla() eller resize-klampen i widget-handles.js.
  function klampEtt(varde, dukMatt, storlek) {
    if (!Number.isFinite(varde)) return 0;
    var tak = Number.isFinite(storlek) && storlek > 0 ? dukMatt - storlek : dukMatt - MIN_KVAR;
    return Math.min(Math.max(0, varde), Math.max(0, tak));
  }

  function klamp(vanster, topp, dukMatt, storlek) {
    var d = dukMatt || duken(), st = storlek || {};
    return { vanster: klampEtt(vanster, d.bredd, st.bredd), topp: klampEtt(topp, d.hojd, st.hojd) };
  }

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
        var ut = stickerUt(parseInt(el.style.left, 10), parseInt(el.style.top, 10),
          el.offsetWidth, el.offsetHeight, d);
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
        if (stickerUt(parseInt(el.style.left, 10), parseInt(el.style.top, 10),
          el.offsetWidth, el.offsetHeight, d)) ute.push(el.dataset.id);
      });
    } catch (e) {}
    return ute;
  }

  // Flyttar in HELA widgeten när den får plats, annars till kanten. Det är en STARKARE
  // regel än dragets gräns, och det är med flit: här har användaren bett om det med ett
  // klick. Draget får inte göra samma sak — se resonemanget om kant-mot-kant-snappen ovan.
  // Ångra fungerar: save() noterar i VyraHistorik före skrivningen.
  function flyttaInAlla() {
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
        var w = lager.widgets.filter(function (x) { return x.id === el.dataset.id })[0];
        if (!w) return;
        var x = parseInt(el.style.left, 10), y = parseInt(el.style.top, 10);
        if (!stickerUt(x, y, el.offsetWidth, el.offsetHeight, d)) return;
        // Bredare an duken (Gift Fireworks 540, Glove Snipe 760 i Davids layout): att flytta
        // origo hjalper inte, den sticker ut anda. Da krymps bredden till dukens. Bara
        // `width` rors - hojden foljer innehallet.
        if (el.offsetWidth > d.bredd && Number.isFinite(Number(w.width))) w.width = d.bredd;
        w.x = Math.min(Math.max(0, x), Math.max(0, d.bredd - Math.min(el.offsetWidth, d.bredd)));
        w.y = Math.min(Math.max(0, y), Math.max(0, d.hojd - el.offsetHeight));
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

  // ---- KROKEN I DRAGET -------------------------------------------------------------------
  // studio.js ar minifierad handkod och far enligt husregeln (domaner.json, studio-core)
  // ALDRIG andras direkt — den monkey-patchas fran syskonfil. Draget sitter som
  // el.onpointermove/onpointerup, satta av bind(), sa vi lindar dem efter varje bind().
  //
  // ORDNINGEN AR OLIKA I DE TVA: i move skriver originalet style.left, sa vi klamper EFTER.
  // I up LASER originalet style.left och skriver w.x, sa vi klamper FORE — annars sparas
  // det oklampade laget och widgeten hoppar tillbaka forst vid nasta ritning.
  function klampElement(el) {
    var k = klamp(parseInt(el.style.left, 10), parseInt(el.style.top, 10), null,
      { bredd: el.offsetWidth, hojd: el.offsetHeight });
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
    var d = duken(), v = Number(falt.value);
    if (!Number.isFinite(v)) return;
    var ny = v;
    if (falt.id === 'propWidth') ny = Math.max(60, Math.min(v, d.bredd - (w.x || 0)));
    if (falt.id === 'propX') ny = klampEtt(v, d.bredd, Math.min(el.offsetWidth, d.bredd));
    if (falt.id === 'propY') ny = klampEtt(v, d.hojd, el.offsetHeight);
    if (ny !== v) falt.value = ny;
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('change', klampFalt, true);
  }

  var api = {
    klamp: klamp, klampEtt: klampEtt, duken: duken, stickerUt: stickerUt,
    markera: markera, rakna: rakna, flyttaInAlla: flyttaInAlla, raknare: raknare,
    haktaDrag: haktaDrag,
    MIN_KVAR: MIN_KVAR, STANDARD: STANDARD
  };

  if (typeof module === 'object' && module.exports) { module.exports = api; return; }

  root.VyraGrans = api;

  // Markeringen och räknaren körs efter varje render. render() byter ut noderna, så en klass
  // satt en gång hade försvunnit vid nästa ritning.
  if (typeof root.render === 'function') {
    var forra = root.render;
    root.render = function () {
      var r = forra.apply(this, arguments);
      markera(); raknare();
      return r;
    };
  }

  // Draget krokas efter varje bind(), samma monster som syskonfilerna anvander.
  if (typeof bind === 'function') {
    var forraBind = bind;
    bind = function () { var r = forraBind.apply(this, arguments); haktaDrag(); return r; };
  }
})(typeof window !== 'undefined' ? window : globalThis);
