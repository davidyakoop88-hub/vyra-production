// gifter-fas.js — kopplar fyrafasmotorn till Gifter Level Up, modell `risingtier`.
//
// VARFOR EN DEKORATOR OCH INTE EN RAD I media.js
// Samma monster som sessionsfilerna: media.js ror vi inte. Dekoratorn lagger sig runt
// window.triggerGifterLevelUp, later originalet gora sitt (innehallspatchning och
// gifter-active precis som idag) och tar sedan over tidslinjen.
//
// ORDNINGEN AR KRITISK. runtime-controls.js installerar sina kowrappers vid 500 ms, 2200 ms
// och pa `load`, och fangar da det som ligger i window.triggerGifterLevelUp just da. Den har
// filen laddas statiskt fran studio.html direkt efter media.js och hinner alltsa fore.
// Resultatet blir ratt lagerordning:
//     VyraAlertQueue  ->  denna dekorator  ->  media.js originaltrigger
// Tvartom hade koreografin kort UTANFOR kon och kunnat overlappa andra alerts — exakt den
// bugg som just stangdes for Glove Snipe.
//
// VARFOR ORIGINALETS TIMRAR AVBRYTS
// Originalet satter sjalv box._gifterTimer och box._gifterExitTimer och rensar dem vid
// omtandning — de ar dess egna avbrottshandtag. Later vi dem sta far vi TVA tidslinjer pa
// samma element: originalets (gifterDuration + gifterExitDuration) och motorns
// (500 + 900 + hold + 600). Originalets ar kortare och hade rivit widgeten mitt i
// upplosningsfasen. Dekoratorn avbryter dem och later motorn aga hela forloppet.
(function (root) {
  'use strict';

  var MODELL = 'risingtier';

  // Tiderna ar Davids, uppmatta mot referensbilderna. hold ar ALDRIG fast — den lases ur
  // widgetens egen gifterDuration, samma monster som kowrapparna anvander.
  var LJUS_MS = 500;
  var OPPNA_MS = 900;
  var UPPLOSNING_MS = 600;
  var DECODE_TIMEOUT_MS = 500;

  function harRisingtier(w) {
    return w && w.type === 'templateGifterLevel' && (w.gifterLayout || '') === MODELL;
  }

  function koreografera(w) {
    if (!root.VyraFas) return;                       // motorn inte laddad — gor ingenting
    var box = document.querySelector('[data-id="' + w.id + '"]');
    if (!box) return;

    // Originalets egen tidslinje avbryts sa den inte river widgeten mitt i upplosningen.
    root.clearTimeout(box._gifterTimer);
    root.clearTimeout(box._gifterExitTimer);
    box._gifterTimer = null;
    box._gifterExitTimer = null;

    var hold = Math.max(0, (Number(w.gifterDuration) || 6) * 1000);

    root.VyraFas.kor(box, {
      aktivKlass: 'gifter-active',
      exitKlass: 'gifter-exit',
      timing: {
        anticipationMs: LJUS_MS,
        enterMs: OPPNA_MS,
        holdMs: hold,
        exitMs: UPPLOSNING_MS,
      },
      // Fas 2 oppnar ramen och avslojar portrattet. Utan grinden oppnas den mot en tom
      // cirkel nar bilden inte hunnit avkodas — motorn vantar pa bade uppbyggnaden och
      // bilden, med 500 ms tak.
      bild: box.querySelector('.gifter-orbit img'),
      decodeTimeoutMs: DECODE_TIMEOUT_MS,
    });
  }

  function dekorera() {
    var original = root.triggerGifterLevelUp;
    if (typeof original !== 'function' || original.__vyraFas) return false;

    var wrapped = function (event) {
      var svar = original.apply(this, arguments);
      try {
        // `state` ar en top-level `let` i media.js och ligger DARFOR ALDRIG pa window — den
        // delas mellan klassiska skript som en fri identifierare. Det ar precis sa
        // runtime-controls.js laser den (`state.widgets.find(...)`), och `root.state` ar
        // undefined. typeof-vakten later filen laddas aven dar media.js saknas.
        var alla = (typeof state !== 'undefined' && state && state.widgets) ? state.widgets : [];
        var traffar = alla.filter(harRisingtier);
        for (var i = 0; i < traffar.length; i++) koreografera(traffar[i]);
      } catch (e) {
        // Koreografin far aldrig sanka sjalva alerten. Originalet har redan kort.
        try { root.console && console.warn('[gifter-fas] koreografin foll: ' + (e && e.message || e)) } catch (_) {}
      }
      return svar;
    };
    wrapped.__vyraFas = true;
    root.triggerGifterLevelUp = wrapped;
    return true;
  }

  // media.js tilldelar window.triggerGifterLevelUp vid parsning, sa den finns nar den har
  // filen kors. Forsoken darefter ar en sakerhet om laddordningen nagonsin andras — och
  // __vyraFas-flaggan gor att vi aldrig lagger tva lager pa varandra.
  if (!dekorera()) {
    root.setTimeout(dekorera, 0);
    root.setTimeout(dekorera, 200);
    root.addEventListener('load', dekorera);
  }

  /* PUBLICERING TILL ALERTKON.
     Kon behover veta att den har widgeten tar langre tid an sin visningstid — annars slapper
     den fram nasta alert mitt i hyllnings- och upplosningsfasen (uppmatt: 2036 ms mot ett
     sekvensslut vid 4052 ms). Kon far dock inte kanna till nagra widgettyper, sa koreografin
     publicerar sig sjalv i stallet. hold ingar INTE — den laser kon redan ur gifterDuration.
     Idempotent: en dubbelladdad fil far inte registrera sig tva ganger och dubbla tiderna. */
  root.VyraFasKoreografi = root.VyraFasKoreografi || [];
  if (!root.VyraFasKoreografi.some(function (k) { return k && k.__kalla === 'gifter-fas' })) {
    root.VyraFasKoreografi.push({
      __kalla: 'gifter-fas',
      passar: harRisingtier,
      tider: { anticipationMs: LJUS_MS, enterMs: OPPNA_MS, exitMs: UPPLOSNING_MS },
    });
  }

  root.VyraGifterFas = { dekorera: dekorera, MODELL: MODELL,
                         tider: { LJUS_MS: LJUS_MS, OPPNA_MS: OPPNA_MS, UPPLOSNING_MS: UPPLOSNING_MS } };
})(typeof window !== 'undefined' ? window : this);
