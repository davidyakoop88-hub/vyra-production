(function () {
  'use strict';
  // VyraTransform — transformens ENDA skrivare på widgetroten.
  //
  // Rotation och lodrät sträckning måste komponeras av EN hand: två skrivare på samma
  // transform-property klobbrar varandra tyst (den som skrev sist vinner), och en
  // neutralisering som inte matchar specificiteten förlorar lika tyst. Därför äger den här
  // modulen `transform` på varje widgetrot, och widget-handles.js (sträckningens gamla ägare)
  // delegerar hit.
  //
  // Formen är `rotate(θdeg) scaleY(sy)` med transform-origin CENTER (Davids beslut 2026-08-18:
  // widgeten roterar runt sin mitt som i varje designverktyg; n/s-handtagens kompensation är
  // omhärledd för det i widget-handles.js). !important av uppmätt skäl: inline utan den gav
  // beräknad identitetsmatris — någon regel vann kaskaden (widget-handles.js-mätningen).
  //
  // NEUTRALLÄGE = FRÅNVARO. Rotation 0/saknas och sy≈1 ⇒ propertyn tas bort helt, så orörda
  // layouter är pixelidentiska med före den här modulen — och widgets vars design animerar
  // transform på ROTEN behåller sina animationer så länge de inte roteras/sträcks (inline
  // !important vinner annars över CSS-animationen; koreografin ligger med flit på barnen
  // sedan Gifter/Fan-arbetet).
  //
  // LÄKNINGEN: sträckningen applicerades förr bara på `.widget.selected` (widget-handles
  // synka()) — i sändningen är inget valt, så widgetScaleY nådde ALDRIG OBS. Den här modulen
  // applicerar på ALLA widgets efter varje render, i både editor och overlay (beslutat med
  // öppna ögon: redan sträckta layouter börjar visa sträckningen i sändning).
  //
  // Defensivt mot molnet: servern validerar bara widgets-id, så rotationsvärdet kan komma
  // korrupt — allt som inte är ett ändligt tal behandlas som 0, aldrig krasch.

  function vinkel(w) {
    return (typeof w.rotation === 'number' && isFinite(w.rotation)) ? w.rotation : 0;
  }
  function strackning(w) {
    return (typeof w.widgetScaleY === 'number' && isFinite(w.widgetScaleY) && w.widgetScaleY > 0)
      ? w.widgetScaleY : 1;
  }

  function applicera(w, el) {
    if (!w || !el || !el.style) return;
    var rot = vinkel(w), sy = strackning(w);
    if (Math.abs(rot) < 0.01 && Math.abs(sy - 1) < 0.005) {
      if (el.style.getPropertyValue('transform')) el.style.removeProperty('transform');
      if (el.style.getPropertyValue('transform-origin')) el.style.removeProperty('transform-origin');
      return;
    }
    var t = 'rotate(' + rot + 'deg) scaleY(' + sy + ')';
    // Skriv bara vid faktisk ändring — observern nedan ska inte mata sig själv, och en
    // omskrivning av samma värde är en gratis style-invalidering per render.
    if (el.style.getPropertyValue('transform') !== t) el.style.setProperty('transform', t, 'important');
    if (el.style.getPropertyValue('transform-origin') !== 'center') el.style.setProperty('transform-origin', 'center', 'important');
  }

  function appliceraAlla() {
    if (typeof state === 'undefined' || !state || !Array.isArray(state.widgets)) return;
    for (var i = 0; i < state.widgets.length; i++) {
      var w = state.widgets[i];
      if (!w || w.id == null) continue;
      var el = document.querySelector('.canvas [data-id="' + String(w.id).replace(/"/g, '') + '"]');
      if (el) applicera(w, el);
    }
  }

  window.VyraTransform = { applicera: applicera, appliceraAlla: appliceraAlla };

  // ---- Panelfaltet: injiceras efter Hojd-faltet i den RENDERADE panelen (tech-debt paragraf 9:
  // dynamiskt laddade panelbyggare hamnar alltid utanpa ett statiskt skripts props-wrap, sa
  // faltet far ALDRIG skrivas in i props()-strangarna). oninput ar en ren stilpatch via
  // komposoren — vyraLivePatch byter outerHTML och PR #221:s kontrakt ar att textfalt inte
  // river vyn. onchange gar genom save-tratten. Fokusvakten ar proportioner-lardomen:
  // ror inte DOM nar ratt falt redan star ratt.
  function injiceraFalt() {
    if (typeof view === 'undefined' || view !== 'editor') return;
    if (typeof liveWidget !== 'function' || typeof selected === 'undefined') return;
    var w = liveWidget(selected);
    if (!w) return;
    var varde = (typeof w.rotation === 'number' && isFinite(w.rotation)) ? w.rotation : 0;
    var falt = document.getElementById('propRotation');
    if (falt) {
      if (document.activeElement !== falt && falt.value !== String(varde)) falt.value = varde;
      return;
    }
    var ankare = document.querySelector('label[data-aspect-source]');
    if (!ankare) {
      var wFalt = document.getElementById('propWidth');
      ankare = wFalt && (wFalt.closest('label') || wFalt.parentElement);
    }
    if (!ankare) return;
    ankare.insertAdjacentHTML('afterend',
      '<label data-rotation-falt>Rotation (\u00b0)<input id="propRotation" type="number" step="1" min="-180" max="180" value="' + varde + '"></label>');
    falt = document.getElementById('propRotation');
    falt.oninput = function () {
      var v = parseFloat(falt.value);
      if (!isFinite(v)) return;
      var el = document.querySelector('.canvas [data-id="' + String(w.id).replace(/"/g, '') + '"]');
      if (el) applicera({ rotation: v, widgetScaleY: w.widgetScaleY }, el);
    };
    falt.onchange = function () {
      var v = parseFloat(falt.value);
      w.rotation = isFinite(v) ? Math.max(-180, Math.min(180, Math.round(v * 10) / 10)) : 0;
      if (typeof save === 'function') save();
      if (typeof vyraRenderKeepingPanel === 'function') vyraRenderKeepingPanel();
      else if (typeof render === 'function') render();
    };
  }

  // Post-render-applicering utan editor-grind: samma målare når editorn och sändningen
  // (overlay.html är en redirect till studio.html?overlay=1 med samma render-kedja).
  // childList-observation ser inte style-skrivningarna ovan, så ingen loop. Projektioner
  // byter statens INNEHÅLL utan DOM-ändring — därför även sessionssignalerna
  // (scenbakgrund-lärdomen: OBS-vägen projicerar efter sidladdning).
  new MutationObserver(function () { appliceraAlla(); injiceraFalt(); }).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('vyra-session-state', appliceraAlla);
  addEventListener('vyra-session-state-saved', appliceraAlla);
  appliceraAlla();
})();
