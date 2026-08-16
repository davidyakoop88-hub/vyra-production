// fan-fas.js — kopplar fyrafasmotorn till Fan Level Ups koreograferade modeller.
//
// SYSTERFIL TILL gifter-fas.js, med samma kontrakt. Allt som star i den filens huvud galler
// har ocksa: dekorator i stallet for en rad i media.js, en wrapper oavsett antal modeller,
// tabellen agar skillnaderna, och originalets timrar avbryts sa vi inte far tva tidslinjer.
// Det som skiljer star nedan.
//
// TRE FAN-SPECIFIKA SAKER
//
//   1. FALTEN HETER ANNORLUNDA. Visningstiden ar `fanDuration`, inte `gifterDuration`, och
//      originalets avbrottshandtag ar box._fanTimer / box._fanExitTimer. En koreografi
//      kopierad utan att byta falt laser undefined och faller tillbaka pa ett fast varde —
//      prov 16b finns for exakt den fallan.
//
//   2. `hero` AR RENDERARENS DEFAULT (`w.fanLayout||'hero'`, media.js:546). arLayout()
//      defaultar darfor till 'hero', annars hade en widget utan uttryckligt val aldrig
//      traffat sin post. Samma losning som `profile` i gifter-fas.js.
//
//   3. ROTENS TRANSFORM AR LAST AV `!important`, och Fan har redan ett bevis pa vad det
//      innebar: `.fan-level-up.fan-active` satter bade `animation:fanAlertEnter .65s` OCH
//      `transform:translateY(0) scale(1)!important`. Viktiga deklarationer slar animationer,
//      sa entrens scale/translate har ALDRIG synts — uppmatt rot-transform genom hela
//      forloppet ar matrix(1,0,0,1,0,0), och bara `filter: blur` nar fram. All koreografi
//      laggs darfor pa BARNEN, precis som i Gifters `profile`.
(function (root) {
  'use strict';

  var VERSION = '1.0.0';

  var DECODE_TIMEOUT_MS = 500;

  /* MODELLTABELLEN. Faltens betydelse ar identisk med gifter-fas.js:
       modell        layoutnyckeln i w.fanLayout (och i katalognyckeln)
       passar(w)     avgor om en widget hor till posten
       tider         motorns faslangder. hold ingar ALDRIG — den lases ur widgetens
                     fanDuration vid varje tandning.
       decodeAnkare  CSS-valjare till den bild fas 2 ska vanta in. null = ingen bildgrind.
       vokabular     klassnamnen motorn satter/tar bort for den har widgetfamiljen. */
  function arLayout(modell) {
    return function (w) {
      // Renderaren defaultar till 'hero' (media.js:546), sa en widget utan satt layout ar en
      // hero-widget. Samma default har, annars traffar hero-posten dem aldrig.
      return !!w && w.type === 'templateFanLevel' &&
             (w.fanLayout || 'hero') === modell;
    };
  }

  var VOKABULAR_FAN = { aktivKlass: 'fan-active', exitKlass: 'fan-exit' };

  var MODELLER = [
    {
      // "Samlingen". hero ar den NAKNA basdesignen — noll egna CSS-regler, for att basen
      // `.fan-level-up` (18 regler) ar modellen. Men den ar inte stilla: hjartfiguren pulsar
      // REDAN FORE TANDNING (`fanLevelPop 2s` pa bilden, `fanRing 2s` pa dess ring, bada
      // infinita) precis som orbitlevels `gOrb`. Hjartat ar alltsa redan igang; alerten ar nar
      // ljuset nar det och resten SAMLAS under det.
      //
      // ANKARET ar `.fan-profile img` — anvandarens avatar. Hjartfiguren i `.fan-burst` ar en
      // STATISK dekorbild ur assets och duger inte som grind: den ar densamma vid varje alert
      // och sager ingenting om att det dynamiska innehallet hunnit fram.
      //
      // decodeTimeoutMs 900, inte standardens 500. Avataren halls MORK i fas 1 och stiger upp
      // i fas 2, alltsa avslojas den — och da ar ett tak pa 500 mot en ljusfas pa 500 en
      // strukturell no-op som inte skyddar nagot. (Jamfor orbitlevel, dar portrattet tonar in
      // redan i fas 1 och taket darfor med flit lamnades pa 500.)
      modell: 'hero',
      passar: arLayout('hero'),
      tider: { anticipationMs: 500, enterMs: 900, exitMs: 600 },
      decodeAnkare: '.fan-profile img',
      decodeTimeoutMs: 900,
      vokabular: VOKABULAR_FAN,
    },
    {
      // "Mottagandet". Stack har REDAN en komplett, staggrad entre — fsIconDrop (hjartat
      // faller fran -40px), fsPillPop (nivapillen poppar) och fsAvatarRise (avataren stiger).
      // Dramaturgin FALL -> POP -> STIGNING ar designens egen och bevaras. Problemet ar inte
      // formen utan KLOCKAN: hela sekvensen (0-650 ms) spelar i dag under anticipationsfasen,
      // som ska vara uppbyggnad och inte ankomst. Koreografin ATERANVANDER darfor keyframsen i
      // fas 2 i stallet for att skriva egna kopior. Prov 17g gor det till ett kontrakt.
      //
      // Ankaret ar avataren, som i hero: hjartfiguren i .fan-burst ar en statisk dekorbild.
      // decodeTimeoutMs 900 — avataren stiger upp SIST i sekvensen (480-800 ms i fas 2), sa en
      // oavkodad bild ger en tom cirkel i mottagandets slutbeat.
      modell: 'stack',
      passar: arLayout('stack'),
      tider: { anticipationMs: 500, enterMs: 900, exitMs: 600 },
      decodeAnkare: '.fan-profile img',
      decodeTimeoutMs: 900,
      vokabular: VOKABULAR_FAN,
    },
  ];

  /* Forsta traffen vinner. En passar() som kastar far aldrig sanka hela uppslaget. */
  function koreografiFor(w) {
    for (var i = 0; i < MODELLER.length; i++) {
      try { if (MODELLER[i].passar(w)) return MODELLER[i] }
      catch (e) {
        try {
          root.console && console.warn('[fan-fas] passar() kastade for modell "' +
            MODELLER[i].modell + '", hoppar over: ' + ((e && e.message) || e));
        } catch (_) {}
      }
    }
    return null;
  }

  function koreografera(w, k) {
    if (!root.VyraFas) return;                       // motorn inte laddad — gor ingenting
    var box = document.querySelector('[data-id="' + w.id + '"]');
    if (!box) return;

    // Originalets egen tidslinje avbryts sa den inte river widgeten mitt i upplosningen.
    // OBS _fanTimer/_fanExitTimer, inte _gifterTimer.
    root.clearTimeout(box._fanTimer);
    root.clearTimeout(box._fanExitTimer);
    box._fanTimer = null;
    box._fanExitTimer = null;

    // fanDuration, inte gifterDuration. Standard 6 s, samma som originalet i media.js.
    var hold = Math.max(0, (Number(w.fanDuration) || 6) * 1000);

    root.VyraFas.kor(box, {
      aktivKlass: k.vokabular.aktivKlass,
      exitKlass: k.vokabular.exitKlass,
      timing: {
        anticipationMs: k.tider.anticipationMs,
        enterMs: k.tider.enterMs,
        holdMs: hold,
        exitMs: k.tider.exitMs,
      },
      bild: k.decodeAnkare ? box.querySelector(k.decodeAnkare) : null,
      decodeTimeoutMs: k.decodeTimeoutMs || DECODE_TIMEOUT_MS,
    });
  }

  var dekorationer = 0;
  var vartWrapper = null;

  function dekorera() {
    /* Vakten ar VART EGET minne, inte en inspektion av window.triggerFanLevelUp: kon lagger
       sin wrapper ovanpa oss vid 500/2200 ms och pa `load` utan att bara vara flaggor, och en
       vakt som bara tittar pa det aktuella vardet hade da lagt ett andra lager UTANFOR kon. */
    if (vartWrapper) return false;
    var original = root.triggerFanLevelUp;
    if (typeof original !== 'function' || original.__vyraFasVersion) return false;

    var wrapped = function (event) {
      var svar = original.apply(this, arguments);
      try {
        // `state` ar en top-level `let` i media.js och ligger DARFOR ALDRIG pa window.
        var alla = (typeof state !== 'undefined' && state && state.widgets) ? state.widgets : [];
        for (var i = 0; i < alla.length; i++) {
          var k = koreografiFor(alla[i]);
          if (k) koreografera(alla[i], k);
        }
      } catch (e) {
        try { root.console && console.warn('[fan-fas] koreografin foll: ' + (e && e.message || e)) } catch (_) {}
      }
      return svar;
    };
    wrapped.__vyraFasVersion = VERSION;
    wrapped.__vyraFasInre = original;
    root.triggerFanLevelUp = wrapped;
    vartWrapper = wrapped;
    dekorationer++;
    return true;
  }

  if (!dekorera()) {
    root.setTimeout(dekorera, 0);
    root.setTimeout(dekorera, 200);
    root.addEventListener('load', dekorera);
  }

  /* PUBLICERING TILL ALERTKON. Kon kanner inga widgettyper — den slar upp generiskt i
     window.VyraFasKoreografi med passar(). `triggerFanLevelUp:[6000,7]` star redan i dess
     configs och visningstiden lases redan ur fanDuration, sa kon behover INTE roras.
     hold ingar darfor inte har heller. Idempotent per modell. */
  root.VyraFasKoreografi = root.VyraFasKoreografi || [];
  MODELLER.forEach(function (k) {
    var kalla = 'fan-fas:' + k.modell;
    if (root.VyraFasKoreografi.some(function (p) { return p && p.__kalla === kalla })) return;
    root.VyraFasKoreografi.push({
      __kalla: kalla,
      passar: k.passar,
      tider: {
        anticipationMs: k.tider.anticipationMs,
        enterMs: k.tider.enterMs,
        exitMs: k.tider.exitMs,
      },
    });
  });

  root.VyraFanFas = {
    VERSION: VERSION,
    dekorera: dekorera,
    modeller: MODELLER.map(function (k) { return k.modell }),
    tider: function (modell) {
      for (var i = 0; i < MODELLER.length; i++)
        if (MODELLER[i].modell === modell) return MODELLER[i].tider;
      return null;
    },
    ankare: function (modell) {
      for (var i = 0; i < MODELLER.length; i++)
        if (MODELLER[i].modell === modell) return MODELLER[i].decodeAnkare;
      return null;
    },
    decodeTak: function (modell) {
      for (var i = 0; i < MODELLER.length; i++)
        if (MODELLER[i].modell === modell)
          return MODELLER[i].decodeTimeoutMs || DECODE_TIMEOUT_MS;
      return null;
    },
    lager: function () {
      var n = 0, f = vartWrapper;
      while (f && f.__vyraFasVersion) { n++; f = f.__vyraFasInre }
      return n;
    },
    dekorationer: function () { return dekorationer },
    wrapperVersion: function () { return vartWrapper && vartWrapper.__vyraFasVersion },
  };
})(window);
