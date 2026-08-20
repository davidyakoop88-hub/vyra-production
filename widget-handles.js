/* HANDTAG PA ALLA SIDOR — atta lagen, en agare.
 *
 * VARFOR EN EGEN MODUL OCH INTE 30 RENDERARE: `class="resize-handle"` sands ut pa 30 stallen i
 * sex filer (media.js 19, premium-final.js 3, custom-widgets.js 3, standalone-widgets.js 3,
 * gift-fireworks.js 1, last-x-alerts.js 1). Att duplicera markup atta ganger dar vore 240 kopior
 * att halla synkade. Fyra panelbyggare laddas dessutom dynamiskt av media.js, sa ett statiskt
 * skript kan aldrig bli sist i kedjan — DOM-injektion efter render plus MutationObserver pa #view
 * ar samma monster som layout-format.js och vyra-historik.js redan anvander.
 *
 * SYDOSTRA HORNET ROR VI INTE. Det agz av VyraResize.agare() i media.js:142 och av
 * custom-widgets.js for de tre egna typerna. Vi markter det bara med data-vyra-handle="se" sa
 * att alla atta gar att fraga efter likadant. Da fortsatter den enda beprovade resize-vagen att
 * fungera exakt som forut, och custom-widgets far behalla sitt handtag i fred.
 *
 * FAKTORERNA AR UPPMATTA, INTE HARLEDDA (2026-08-13, riktig Chrome):
 *   `zoom: w.widgetScale` multiplicerar bade rect-bredden (280 -> 420 vid 1.5) OCH `left`/`top`
 *   (w.x=60 gav +30 px vid 1.5). Kanvasens transform skalar allt ytterligare, och
 *   getEditorCanvasScale() laser bade scale() och matrix() ratt.
 *   Alltsa: widget-px = skarm-px / (kanvasskala * widgetScale). Bada maste med — glomd faktor
 *   var precis buggen i PR #158-#163, dar samma dragning gav 1.45 vid skala 1 och 1.56 vid 0.5.
 *
 * LODRAT ar `transform:scaleY()`, satt INLINE och bara nar strackning finns, efter Davids
 * beslut 2026-08-13. En CSS-regel pa `.widget` hade gett varenda widget en ny stacking
 * context aven vid scaleY(1) — inline satts den bara pa den som faktiskt ar strackt. Det
 * stracker text och grafik — det ar medvetet valt framfor att infora en riktig hojd i 30
 * renderare. Handtagen far invers scaleY sa att de inte blir avlanga med widgeten.
 */
(function () {
  'use strict';

  var RIKTNINGAR = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  var HORN = { nw: 1, ne: 1, sw: 1 };          // se agz av media.js
  var observer = null;
  var pagaende = null;

  function valdWidget() {
    if (typeof state === 'undefined' || typeof selected === 'undefined') return null;
    if (!state || !state.widgets) return null;
    for (var i = 0; i < state.widgets.length; i++) {
      if (state.widgets[i].id === selected) return state.widgets[i];
    }
    return null;
  }

  // skarm-px -> widget-px. Aldrig noll, annars delar vi sonder draget.
  function faktor(w) {
    var kanvas = (typeof getEditorCanvasScale === 'function') ? getEditorCanvasScale() : 1;
    if (!kanvas || !isFinite(kanvas)) kanvas = 1;
    var zoom = (w && w.widgetScale) || 1;
    return Math.max(0.01, kanvas * zoom);
  }


  // ROTEN AGS AV KOMPOSOREN (vyra-rotation.js): rotation och strackning maste skrivas av EN
  // hand, annars vinner den som skrev sist tyst. Har justeras bara HANDTAGEN — invers skala sa
  // att de inte blir avlanga med widgeten; de positioneras med left/top plus negativ marginal,
  // aldrig med translate, sa den transformen krockar inte med placeringen. !important-skalet
  // som en gang mattes har (inline utan !important forlorade kaskaden) lever vidare i
  // komposoren. `w` behovs sa aven rotationen foljer med under sjalva draget.
  function satStrackning(widget, sy, w) {
    var handtag = widget.querySelectorAll(':scope > [data-vyra-handle]');
    if (window.VyraTransform && w) window.VyraTransform.applicera(w, widget);
    var neutral = !sy || Math.abs(sy - 1) < 0.005;
    for (var i = 0; i < handtag.length; i++) handtag[i].style.transform = neutral ? '' : 'scaleY(' + (1 / sy) + ')';
  }

  function editorVy() {
    return typeof view === 'undefined' || view === 'editor';
  }

  function bindHandtag(el, riktning) {
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();                       // annars startar widgetdraget i studio.js
      var w = valdWidget();
      var widget = el.closest('.widget');
      if (!w || !widget) return;

      var f = faktor(w);
      var rect = widget.getBoundingClientRect();
      var start = {
        x: e.clientX, y: e.clientY,
        // offsetWidth ar orroterat (bbox blaser upp rect for roterade widgets — steg 6-vakten)
        bredd: w.width || widget.offsetWidth || Math.round(rect.width / f),
        wx: w.x || 0, wy: w.y || 0,
        skala: w.widgetScale || 1,
        skalaY: w.widgetScaleY || 1,
        rectHojd: rect.height || 1,
        rectBredd: rect.width || 1
      };
      el.setPointerCapture(e.pointerId);
      pagaende = { el: el, riktning: riktning };

      function flytta(ev) {
        var dx = ev.clientX - start.x, dy = ev.clientY - start.y;

        // Under rotation pekar handtagen inte langs skarmaxlarna: vid 90 grader ligger
        // e-handtaget nedat. Pekardeltat kontraroteras till widgetlokala axlar innan
        // riktningsmatten — annars beter sig e/w/n/s sidledes vid 90 och inverterat vid 180.
        var rot = (typeof w.rotation === 'number' && isFinite(w.rotation)) ? w.rotation : 0;
        if (rot) {
          var rad = -rot * Math.PI / 180, c = Math.cos(rad), sn = Math.sin(rad);
          var rdx = dx * c - dy * sn, rdy = dx * sn + dy * c;
          dx = rdx; dy = rdy;
        }

        if (riktning === 'e' || riktning === 'w') {
          var d = (riktning === 'e' ? dx : -dx) / f;
          var bredd = Math.max(60, Math.round(start.bredd + d));
          w.width = bredd;
          widget.style.width = bredd + 'px';
          if (riktning === 'w') {
            // hogerkanten ska sta stilla: flytta vansterkanten lika mycket som bredden vaxte
            w.x = Math.round(start.wx - (bredd - start.bredd));
            widget.style.left = w.x + 'px';
          }
        } else if (riktning === 'n' || riktning === 's') {
          var vaxt = (riktning === 's' ? dy : -dy);
          var ny = Math.max(0.3, Math.min(4, start.skalaY * (1 + vaxt / start.rectHojd)));
          w.widgetScaleY = Math.round(ny * 100) / 100;
          satStrackning(widget, w.widgetScaleY, w);
          // ORIGIN AR CENTER (komposoren): skalningen vaxer at BADA hallen, halften var.
          // Kontraktet ur #158-163 star kvar — ned haller overkanten stilla, upp haller
          // underkanten stilla — sa y kompenseras med HALVA okningen, at var sitt hall.
          // (Forr, med origin top left, vaxte allt nedat och bara n-draget kompenserade.)
          var okning = start.rectHojd * (w.widgetScaleY / start.skalaY - 1);
          w.y = Math.round(riktning === 's' ? start.wy + (okning / 2) / f
                                            : start.wy - (okning / 2) / f);
          widget.style.top = w.y + 'px';
        } else if (HORN[riktning]) {
          // likformig skalning, samma matematik som sydostra hornet i media.js:151
          var riktningX = (riktning === 'nw' || riktning === 'sw') ? -1 : 1;
          var kanvas = f / start.skala;
          var ns = start.skala + ((dx * riktningX) / kanvas) / Math.max(180, start.rectBredd / start.skala);
          w.widgetScale = Math.round(Math.max(0.35, Math.min(2.5, ns)) * 100) / 100;
          widget.style.zoom = w.widgetScale;
        }
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
      if (r === 'se' && befintligt) continue;                        // media.js ager det
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
      rh.title = 'Rotera (Shift = 15\u00b0-steg)';
      bindRotationsHandtag(rh);
      widget.appendChild(rh);
    }

    satStrackning(widget, w.widgetScaleY || 1, w);
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

  window.VyraHandtag = { synka: synka, riktningar: RIKTNINGAR.slice() };
})();
