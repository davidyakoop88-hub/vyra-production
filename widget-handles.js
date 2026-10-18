/* HANDTAG PA ALLA SIDOR — atta lagen, en agare.
 *
 * VARFOR EN EGEN MODUL OCH INTE 30 RENDERARE: `class="resize-handle"` sands ut pa 30 stallen i
 * sex filer (media.js 19, premium-final.js 3, custom-widgets.js 3, standalone-widgets.js 3,
 * gift-fireworks.js 1, last-x-alerts.js 1). Att duplicera markup atta ganger dar vore 240 kopior
 * att halla synkade. Fyra panelbyggare laddas dessutom dynamiskt av media.js, sa ett statiskt
 * skript kan aldrig bli sist i kedjan — DOM-injektion efter render plus MutationObserver pa #view
 * ar samma monster som layout-format.js och vyra-historik.js redan anvander.
 *
 * SYDOSTRA HORNET RITAS AV RENDERARNA (`.resize-handle`) och binds av VyraResize i media.js
 * respektive custom-widgets.js — men BADA delegerar sjalva draget hit (starta()), sa att alla
 * atta handtag raknar med samma geometri. Vi markter det med data-vyra-handle="se".
 *
 * FAKTORERNA AR UPPMATTA, INTE HARLEDDA (2026-08-13, riktig Chrome):
 *   `zoom: w.widgetScale` multiplicerar bade rect-bredden (280 -> 420 vid 1.5) OCH `left`/`top`
 *   (w.x=60 gav +30 px vid 1.5). Kanvasens transform skalar allt ytterligare, och
 *   getEditorCanvasScale() laser bade scale() och matrix() ratt.
 *
 * INGEN STRACKNING (beslut 2026-10-18; ersatter beslutet 2026-08-13 om strackning).
 *   Forr skrev over/under-handtaget `w.widgetScaleY` (0.3-4) och widgeten ritades med
 *   transform:scaleY — oavsett proportionslaset. Granskningen 2026-10-18 matte att 173 av 173
 *   katalogmodeller kunde fa skilda X/Y-skalor; Top Like Voltage fick scaleY(0.8) med laset PA,
 *   Guardian i sandningen scaleY(0.3). Nu galler, per storleksklass (VyraTransform.klass):
 *
 *     fast   (allt utom egen text/media) — ALLA atta handtag skalar hela kompositionen
 *            LIKFORMIGT via w.widgetScale, med eller utan las. Sidhandtagen haller motsatt kant
 *            och mitten av andra axeln stilla, hornen motsatt horn, en roterad widget sin mitt.
 *            Vanster/hoger andrar alltsa inte langre w.width: matt 2026-10-18 (220 nycklar,
 *            bredd x1.4) ovalade det Guardians aura. Bredden finns kvar i panelens Bredd-falt
 *            som en avsiktlig layoutandring.
 *     text   egen text — riktig bredd och hojd (texten radbryts), aldrig skala per axel.
 *     media  egen bild/video — riktig bredd och hojd; innehallet passas in eller beskars med
 *            object-fit enligt panelens "Anpassning". Aldrig strackning.
 *
 *   For text och media respekterar VARJE handtag proportionslaset (w.aspectLocked): ett
 *   sidhandtag andrar da bada matten, ett horn foljer den axel som rort sig mest.
 *   widgetScaleY skrivs aldrig. Sparade varden migreras bort i vyra-rotation.js.
 */
(function () {
  'use strict';

  var RIKTNINGAR = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  var MIN_SKALA = 0.2, MAX_SKALA = 4;                 // samma golv/tak som ranking-sixpack och spellayout ritar
  var MIN_BREDD = 60, MIN_HOJD = 40;
  var observer = null;
  var pagaende = null;

  function tal(v, reserv) { return (typeof v === 'number' && isFinite(v)) ? v : reserv; }

  function valdWidget() {
    if (typeof state === 'undefined' || typeof selected === 'undefined') return null;
    if (!state || !state.widgets) return null;
    for (var i = 0; i < state.widgets.length; i++) {
      if (state.widgets[i].id === selected) return state.widgets[i];
    }
    return null;
  }

  function klass(w) {
    if (window.VyraTransform && typeof window.VyraTransform.klass === 'function') return window.VyraTransform.klass(w);
    if (w && w.type === 'templateCustomText') return 'text';
    if (w && (w.type === 'templateCustomImage' || w.type === 'templateCustomVideo' || w.type === 'video')) return 'media';
    return 'fast';
  }

  function kanvasSkala() {
    var k = (typeof getEditorCanvasScale === 'function') ? getEditorCanvasScale() : 1;
    return (k > 0 && isFinite(k)) ? k : 1;
  }

  function zoomFor(el) {
    if (window.VyraTransform && typeof window.VyraTransform.zoomFor === 'function') return window.VyraTransform.zoomFor(el);
    var iz = parseFloat(el && el.style && el.style.zoom);
    return iz > 0 ? iz : 1;
  }

  // HANDTAGEN HAR SAMMA STORLEK I VARJE SKALA (verifieringen 2026-10-18). De ligger inuti roten, som
  // bar `zoom: widgetScale`, sa vid Storlek 50 % var n-handtaget 6 px hogt och svart att greppa, och
  // vid 200 % hamnade de innanfor ramen. En motzoom (1/z) pa varje handtag haller dem i skarmens px:
  // uppmatt i Chrome vid 0.5/1/2 — samma 26x11 och 14x14, med mitten pa ramens kant (+-0,5 px).
  //
  // Top Coins Halo/Signal Orbit skalar med en transform (--tc-scale) i stället för zoom, och den
  // skalar handtagen lika mycket: uppmätt 2026-10-19 var n-handtaget 13x5,5 vid Storlek 50 % och
  // 39x16,5 vid 150 %. Motzoomen räknar därför med rotens transformskala också (VyraTransform.cssSkala).
  function motzooma(widget) {
    if (!widget) return;
    var T = window.VyraTransform;
    var z = zoomMal(widget) * (T && typeof T.cssSkala === 'function' ? T.cssSkala(widget) : 1);
    var v = Math.abs(z - 1) < 0.0005 ? '' : String(Math.round(1 / z * 10000) / 10000);
    var h = widget.querySelectorAll(':scope > .vyra-handle, :scope > .resize-handle');
    for (var i = 0; i < h.length; i++) if (h[i].style.zoom !== v) h[i].style.zoom = v;
  }
  function zoomMal(el) {
    var iz = parseFloat(el && el.style && el.style.zoom);
    return iz > 0 ? iz : zoomFor(el);
  }

  // ---- REN RAKNING (provas utan DOM i tests/storlek-likformig.test.js) -----------------------

  // Fast komposition: en enda skalfaktor ur draget. start.visBredd/visHojd ar widgetens synliga
  // matt i skarm-px och dx/dy pekarens rorelse i widgetens egna axlar, ocksa i skarm-px — kvoten
  // ar darfor oberoende av kanvasskalan (samma dragning i dukens matt ger samma skala vid 1 och 0.5).
  function nySkala(riktning, start, dx, dy) {
    var vb = start.visBredd > 0 ? start.visBredd : 1, vh = start.visHojd > 0 ? start.visHojd : 1;
    var gx = (riktning.indexOf('w') >= 0 ? -dx : riktning.indexOf('e') >= 0 ? dx : 0) / vb;
    var gy = (riktning.indexOf('n') >= 0 ? -dy : riktning.indexOf('s') >= 0 ? dy : 0) / vh;
    var harX = /[ew]/.test(riktning), harY = /[ns]/.test(riktning);
    var vaxt = harX && harY ? (Math.abs(gx) >= Math.abs(gy) ? gx : gy) : harX ? gx : gy;
    var s0 = start.skala > 0 ? start.skala : 1;
    // Golvet och taket far aldrig tvinga ett hopp: en migrerad Guardian kan sta pa 0.19.
    var golv = Math.min(MIN_SKALA, s0), tak = Math.max(MAX_SKALA, s0);
    return Math.round(Math.max(golv, Math.min(tak, s0 * (1 + vaxt))) * 1000) / 1000;
  }

  // Egen text/media: riktig bredd och hojd. dx/dy i widget-px. Med las foljer det andra mattet
  // kvoten; ett horn styrs av den axel som rort sig mest. Returnerar ocksa hur langt vanster-
  // och overkanten ska flyttas sa att motsatt kant/horn star still.
  function nyLada(riktning, start, dx, dy, las, kvot) {
    var b = start.bredd, h = start.hojd;
    var harX = /[ew]/.test(riktning), harY = /[ns]/.test(riktning);
    var nb = harX ? b + (riktning.indexOf('w') >= 0 ? -dx : dx) : b;
    var nh = harY ? h + (riktning.indexOf('n') >= 0 ? -dy : dy) : h;
    nb = Math.max(MIN_BREDD, nb);
    nh = Math.max(MIN_HOJD, nh);
    if (las && kvot > 0) {
      var styrX = harX && (!harY || Math.abs(nb / b - 1) >= Math.abs(nh / h - 1));
      if (styrX) nh = nb / kvot; else nb = nh * kvot;
      if (nb < MIN_BREDD) { nb = MIN_BREDD; nh = nb / kvot; }
      if (nh < MIN_HOJD) { nh = MIN_HOJD; nb = nh * kvot; }
    }
    nb = Math.round(nb); nh = Math.round(nh);
    return {
      bredd: nb, hojd: nh,
      dx: riktning.indexOf('w') >= 0 ? b - nb : 0,
      dy: riktning.indexOf('n') >= 0 ? h - nh : 0
    };
  }

  // ---- DRAGET ---------------------------------------------------------------------------------

  // Startar ett drag fran handtaget `el` i riktningen. Anropas av de sju handtagen har och av
  // sydostra hornets bindare i media.js och custom-widgets.js.
  function starta(el, riktning, e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }   // annars startar widgetdraget i studio.js
    var w = valdWidget();
    var widget = el && el.closest('.widget');
    if (!w || !widget) return;

    var k = klass(w);
    var T = window.VyraTransform;
    var kanvas = kanvasSkala();
    var rot = tal(w.rotation, 0);
    var roterad = Math.abs(rot) >= 0.01;
    var rect = widget.getBoundingClientRect();
    var zoom = k === 'fast' ? zoomFor(widget) : 1;
    // offsetmatten ar orroterade (bbox blaser upp rect for roterade widgets — steg 6-vakten)
    var start = {
      x: e ? e.clientX : 0, y: e ? e.clientY : 0,
      wx: tal(w.x, 0), wy: tal(w.y, 0),
      skala: tal(w.widgetScale, 1) > 0 ? tal(w.widgetScale, 1) : 1,
      bredd: w.width || widget.offsetWidth || 300,
      hojd: w.height || widget.offsetHeight || 200,
      visBredd: (roterad || !rect.width) ? widget.offsetWidth * zoom * kanvas : rect.width,
      visHojd: (roterad || !rect.height) ? widget.offsetHeight * zoom * kanvas : rect.height,
      // Ankaret i dukens egna px ur lådan (VyraTransform.ankareLada) — inte ur skärmens rect, som
      // en zoom-transition, ett lägesbyte vid släppet och en entréanimation alla flyttar.
      ankare: !T ? null : T.ankareLada ? T.ankareLada(widget, riktning, roterad) : T.ankarpunkt(rect, riktning, roterad)
    };
    if (k === 'fast' && T && T.tystna) T.tystna(widget);
    var las = w.aspectLocked === true;
    var kvot = tal(w.aspectRatio, 0) > 0 ? w.aspectRatio : start.bredd / start.hojd;
    if (e && el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (_) {} }
    pagaende = { el: el, riktning: riktning };

    function flytta(ev) {
      var dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      // Under rotation pekar handtagen inte langs skarmaxlarna: vid 90 grader ligger
      // e-handtaget nedat. Pekardeltat kontraroteras till widgetlokala axlar innan
      // riktningsmatten — annars beter sig e/w/n/s sidledes vid 90 och inverterat vid 180.
      if (roterad) {
        var rad = -rot * Math.PI / 180, c = Math.cos(rad), sn = Math.sin(rad);
        var rdx = dx * c - dy * sn, rdy = dx * sn + dy * c;
        dx = rdx; dy = rdy;
      }

      if (k === 'fast') {
        var ny = nySkala(riktning, start, dx, dy);
        if (T) {
          T.satSkala(w, widget, ny);
          if (T.hallLada) T.hallLada(w, widget, start.ankare, riktning, roterad);
          else T.forankra(w, widget, start.ankare, riktning, roterad, kanvas);
          motzooma(widget);
        } else {
          w.widgetScale = ny;
          widget.style.zoom = ny;
        }
        return;
      }

      // text/media: riktiga matt. Ingen zoom pa dem, sa widget-px = skarm-px / kanvasskala.
      var g = nyLada(riktning, start, dx / kanvas, dy / kanvas, las, kvot);
      w.width = g.bredd;
      w.height = g.hojd;
      w.x = start.wx + g.dx;
      w.y = start.wy + g.dy;
      widget.style.width = g.bredd + 'px';
      widget.style.height = g.hojd + 'px';
      widget.style.left = w.x + 'px';
      widget.style.top = w.y + 'px';
    }

    function slapp() {
      el.removeEventListener('pointermove', flytta);
      el.removeEventListener('pointerup', slapp);
      el.removeEventListener('pointercancel', slapp);
      pagaende = null;
      if (typeof render === 'function') render();
      // EFTER render: läsbarhetslägena (level-lasbar.js lv-kompakt, ranking-sixpack.js rk6-kompakt)
      // väljer layout i renderaren, alltså först här. Lådan kan då ha fått en annan höjd än under
      // draget, och utan den här andra förankringen flyttade motsatt kant sig (Top Like basic-v2
      // n-handtaget: underkanten 89 px). Samma ankare, mätt mot den nya noden.
      if (k === 'fast' && T && T.hallLada && start.ankare) {
        var ny = document.querySelector('.editor-shell .canvas .widget[data-id="' + String(w.id).replace(/"/g, '') + '"]')
              || (T.nodFor ? T.nodFor(w) : null);
        if (ny) T.hallLada(w, ny, start.ankare, riktning, roterad);
      }
      if (typeof save === 'function') save();
    }

    el.addEventListener('pointermove', flytta);
    el.addEventListener('pointerup', slapp);
    el.addEventListener('pointercancel', slapp);
  }

  function editorVy() {
    return typeof view === 'undefined' || view === 'editor';
  }

  function bindHandtag(el, riktning) {
    el.addEventListener('pointerdown', function (e) { starta(el, riktning, e); });
  }

  // Rotationshandtaget: lollipopen ovanfor n. Vinkeln behover INTE kanvasskalan — likformig
  // scale bevarar vinklar, sa atan2 kring widgetens mitt ar zoominvariant by construction
  // (provet drar samma bana vid skala 1 och 0.5 och kraver samma grader). Under draget skrivs
  // ENDAST DOM via komposoren; save()+render() forst vid slapp — samma livscykel som ovriga
  // handtag. Shift = 15-graderssteg (omvant mot snappens Shift-av; namngivet i title-texten).
  function bindRotationsHandtag(el) {
    el.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
      e.preventDefault();
      var w = valdWidget();
      var widget = el.closest('.widget');
      if (!w || !widget) return;
      var rect = widget.getBoundingClientRect();
      // Mitten ur bbox ar rotationsinvariant nar origin ar center — samma punkt oavsett vinkel.
      var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      var startPekare = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
      var startRot = (typeof w.rotation === 'number' && isFinite(w.rotation)) ? w.rotation : 0;
      el.setPointerCapture(e.pointerId);
      pagaende = { el: el, riktning: 'rot' };

      function flytta(ev) {
        var nu = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
        var rot = startRot + (nu - startPekare);
        if (ev.shiftKey) rot = Math.round(rot / 15) * 15;
        rot = ((rot + 180) % 360 + 360) % 360 - 180;
        w.rotation = Math.round(rot * 10) / 10;
        if (window.VyraTransform) window.VyraTransform.applicera(w, widget);
      }
      function slapp() {
        el.removeEventListener('pointermove', flytta);
        el.removeEventListener('pointerup', slapp);
        el.removeEventListener('pointercancel', slapp);
        pagaende = null;
        if (typeof save === 'function') save();
        if (typeof render === 'function') render();
      }
      el.addEventListener('pointermove', flytta);
      el.addEventListener('pointerup', slapp);
      el.addEventListener('pointercancel', slapp);
    });
  }

  function synka() {
    if (!editorVy()) { stadaAlla(); return; }
    var widget = document.querySelector('.editor-shell .widget.selected')
              || document.querySelector('.widget.selected');

    // handtag som hamnat pa fel element (eller kvar efter avmarkering) ska bort
    var gamla = document.querySelectorAll('.vyra-handle');
    for (var g = 0; g < gamla.length; g++) {
      if (!widget || gamla[g].parentElement !== widget) gamla[g].remove();
    }
    if (!widget) return;
    var w = valdWidget();
    if (!w) return;

    var befintligt = widget.querySelector(':scope > .resize-handle');
    if (befintligt) befintligt.setAttribute('data-vyra-handle', 'se');

    for (var i = 0; i < RIKTNINGAR.length; i++) {
      var r = RIKTNINGAR[i];
      if (r === 'se' && befintligt) continue;                        // renderaren ritar det
      if (widget.querySelector(':scope > [data-vyra-handle="' + r + '"]')) continue;
      var h = document.createElement('span');
      h.className = 'vyra-handle vyra-handle-' + r;
      h.setAttribute('data-vyra-handle', r);
      h.setAttribute('aria-hidden', 'true');
      bindHandtag(h, r);
      widget.appendChild(h);
    }

    if (!widget.querySelector(':scope > [data-vyra-handle="rot"]')) {
      var rh = document.createElement('span');
      rh.className = 'vyra-handle vyra-handle-rot';
      rh.setAttribute('data-vyra-handle', 'rot');
      rh.setAttribute('aria-hidden', 'true');
      rh.title = 'Rotera (Shift = 15°-steg)';
      bindRotationsHandtag(rh);
      widget.appendChild(rh);
    }

    if (window.VyraTransform) window.VyraTransform.applicera(w, widget);
    motzooma(widget);
  }

  function stadaAlla() {
    var alla = document.querySelectorAll('.vyra-handle');
    for (var i = 0; i < alla.length; i++) alla[i].remove();
  }

  function start() {
    var vy = document.querySelector('#view');
    if (!vy) return;
    if (observer) observer.disconnect();
    observer = new MutationObserver(function () { synka(); });
    observer.observe(vy, { childList: true, subtree: true });
    synka();
  }

  // Kontraktet §4: allt stangs och nollstalls nar sessionen tar slut.
  window.addEventListener('vyra-session-ended', function () {
    if (observer) { observer.disconnect(); observer = null; }
    pagaende = null;
    stadaAlla();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
  // #view kan bytas ut av layout-safe.js — koppla om nar den dyker upp igen
  var vakt = setInterval(function () {
    var vy = document.querySelector('#view');
    if (vy && (!observer || !vy.isConnected)) start();
  }, 1500);
  window.addEventListener('vyra-session-ended', function () { clearInterval(vakt); });

  window.VyraHandtag = {
    synka: synka, riktningar: RIKTNINGAR.slice(), starta: starta, klass: klass, motzooma: motzooma,
    nySkala: nySkala, nyLada: nyLada, MIN_SKALA: MIN_SKALA, MAX_SKALA: MAX_SKALA
  };
})();
