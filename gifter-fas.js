// gifter-fas.js — kopplar fyrafasmotorn till Gifter Level Ups koreograferade modeller.
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
// EN DEKORATOR, EN WRAPPER, N MODELLER
// Filen dekorerade fran borjan exakt en modell (risingtier) och vaktade med en boolesk flagga
// `__vyraFas`. Den vakten gjorde det omojligt for en andra koreografifil att installera sig
// — den hade sett en redan dekorerad trigger och avstatt. Nio modeller hade darfor krävt nio
// filer med var sin flagga, alltsa nio wrappers ovanpa varandra pa samma trigger.
// I stallet ligger modellerna i en TABELL harunder och wrappern slar upp ratt post per widget.
// Lagerantalet ar och forblir ETT, oavsett hur manga modeller som koreograferas.
// `VyraGifterFas.lager()` mater det, sa provet kan bevisa saken i stallet for att lita pa den.
//
// VARFOR ORIGINALETS TIMRAR AVBRYTS
// Originalet satter sjalv box._gifterTimer och box._gifterExitTimer och rensar dem vid
// omtandning — de ar dess egna avbrottshandtag. Later vi dem sta far vi TVA tidslinjer pa
// samma element: originalets (gifterDuration + gifterExitDuration) och motorns
// (anticipation + enter + hold + exit). Originalets ar kortare och hade rivit widgeten mitt i
// upplosningsfasen. Dekoratorn avbryter dem och later motorn aga hela forloppet.
(function (root) {
  'use strict';

  // Semver pa wrappern i stallet for en boolesk flagga, sa en framtida uppgradering kan se
  // VILKEN version som redan sitter pa triggern och inte bara ATT nagon gor det.
  var VERSION = '2.0.0';

  var DECODE_TIMEOUT_MS = 500;

  /* MODELLTABELLEN.
     En post per koreograferad modell. Allt som skiljer modeller at bor ligga HAR — wrappern
     nedanfor ar medvetet modelloberoende. Falten:
       modell        layoutnyckeln i w.gifterLayout (och i katalognyckeln)
       passar(w)     avgor om en widget hor till posten
       tider         motorns faslangder. hold ingar ALDRIG — den lases ur widgetens
                     gifterDuration vid varje tandning, samma monster som kowrapparna.
       decodeAnkare  CSS-valjare till det portratt fas 2 ska vanta in. null = ingen bildgrind.
                     OBS: `.gifter-bottom-profile` ar slackt av en BASREGEL (studio.css:202)
                     i alla modeller utom `number` — ankaret maste peka pa nagot som syns.
       vokabular     klassnamnen motorn satter/tar bort for den har widgetfamiljen.
     Tiderna ar Davids, uppmatta mot referensbilderna. */
  function arLayout(modell) {
    return function (w) {
      // Renderaren defaultar till 'profile' (media.js:578, `w.gifterLayout||'profile'`), sa en
      // widget utan satt layout ar en profile-widget. Samma default har, annars skulle en
      // framtida profile-post aldrig traffa dem.
      return !!w && w.type === 'templateGifterLevel' &&
             (w.gifterLayout || 'profile') === modell;
    };
  }

  var VOKABULAR_GIFTER = { aktivKlass: 'gifter-active', exitKlass: 'gifter-exit' };

  var MODELLER = [
    {
      modell: 'risingtier',
      passar: arLayout('risingtier'),
      tider: { anticipationMs: 500, enterMs: 900, exitMs: 600 },
      decodeAnkare: '.gifter-orbit img',
      decodeTimeoutMs: DECODE_TIMEOUT_MS,
      vokabular: VOKABULAR_GIFTER,
    },
    {
      // Fall och nedslag — inversen av risingtiers uppatstigande, samma dramaturgi.
      // Samma portratt (.gifter-orbit img, uppmatt 86x86) som risingtier, sa ankaret flyttar
      // ordagrant. Prov 8d vaktar att det ankaret faktiskt syns.
      modell: 'stack',
      passar: arLayout('stack'),
      tider: { anticipationMs: 500, enterMs: 900, exitMs: 600 },
      decodeAnkare: '.gifter-orbit img',
      decodeTimeoutMs: DECODE_TIMEOUT_MS,
      vokabular: VOKABULAR_GIFTER,
    },
    {
      // IRIS. Modellen heter reveal och motorns fas 2 heter oppna — portrattet ar SLUTET och
      // oppnas. Har ar decode-grinden inte kosmetik utan sjalva premissen: irisen far aldrig
      // oppnas mot en oavkodad bild, for da avslojar den ett tomt hal dar ansiktet ska vara.
      // Prov 9f vaktar bade formen (stangd i fas 1, oppen i fas 3) och grinden.
      modell: 'reveal',
      passar: arLayout('reveal'),
      tider: { anticipationMs: 500, enterMs: 900, exitMs: 600 },
      decodeAnkare: '.gifter-orbit img',
      /* 900, INTE standardens 500 — och det ar hela skalet till att taket ar ett falt per modell.
         Motorn vantar pa BADA, ljusfasen och bilden, och racknar ihop dem (widget-fas.js:173-183):
             max(anticipationMs, min(avkodningstid, decodeTimeoutMs))
         Med ett tak pa 500 mot en ljusfas pa 500 kan grinden ALDRIG bli den bindande faktorn —
         uppbyggnaden tacker redan hela avkodningsfonstret, och fas 2 startar pa 500 ms oavsett
         om bilden finns. Uppmatt: irisen oppnade vid 542 ms mot en bild som avkodades vid 730 ms.
         For de andra modellerna ar det harmlost (de fade:ar in ett portratt som annu ar tomt),
         men reveal AVSLOJAR det — irisen oppnas mot ett hal dar ansiktet ska vara.
         900 ms lyfter taket over ljusfasen sa grinden faktiskt kan halla. Prov 9f-C vaktar det.
         Ovriga modeller behaller 500. */
      decodeTimeoutMs: 900,
      vokabular: VOKABULAR_GIFTER,
    },
  ];

  /* Forsta traffen vinner. En passar() som kastar far aldrig sanka hela uppslaget — samma
     hallning som kon har i runtime-controls.js:65. */
  function koreografiFor(w) {
    for (var i = 0; i < MODELLER.length; i++) {
      try { if (MODELLER[i].passar(w)) return MODELLER[i] }
      catch (e) {
        try {
          root.console && console.warn('[gifter-fas] passar() kastade for modell "' +
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
    root.clearTimeout(box._gifterTimer);
    root.clearTimeout(box._gifterExitTimer);
    box._gifterTimer = null;
    box._gifterExitTimer = null;

    var hold = Math.max(0, (Number(w.gifterDuration) || 6) * 1000);

    root.VyraFas.kor(box, {
      aktivKlass: k.vokabular.aktivKlass,
      exitKlass: k.vokabular.exitKlass,
      timing: {
        anticipationMs: k.tider.anticipationMs,
        enterMs: k.tider.enterMs,
        holdMs: hold,
        exitMs: k.tider.exitMs,
      },
      // Fas 2 avslojar portrattet. Utan grinden oppnas ramen mot en tom cirkel nar bilden
      // inte hunnit avkodas — motorn vantar pa bade uppbyggnaden och bilden, med tak.
      bild: k.decodeAnkare ? box.querySelector(k.decodeAnkare) : null,
      decodeTimeoutMs: k.decodeTimeoutMs || DECODE_TIMEOUT_MS,
    });
  }

  var dekorationer = 0;
  /* Referens till DEN WRAPPER VI SJALVA satte. Lagerantalet kan INTE mätas fran
     window.triggerGifterLevelUp: runtime-controls.js lagger sin kowrapper ovanpa oss vid
     500/2200 ms och pa `load`, och den exponerar ingen väg tillbaka till sin inre funktion.
     Utifran ser triggern darfor ut att sakna vart lager helt. Vi raknar var egen kedja. */
  var vartWrapper = null;

  function dekorera() {
    /* Vakten maste vara VART EGET minne, inte en inspektion av window.triggerGifterLevelUp.
       Kon (runtime-controls.js) lagger sin wrapper ovanpa oss vid 500/2200 ms och pa `load`,
       och den bar inte vara flaggor. En vakt som bara tittar pa det aktuella vardet ser da en
       "odekorerad" trigger och lagger ETT LAGER TILL — ovanpa kon, alltsa utanfor den.
       Hallet fanns aven med den gamla booleska `__vyraFas`-vakten. Det utloses aldrig i drift,
       for forsta forsoket lyckas alltid och aterforsoken registreras darfor aldrig — men det
       ar en latent fälla som prov 7f nu haller stangd. */
    if (vartWrapper) return false;
    var original = root.triggerGifterLevelUp;
    if (typeof original !== 'function' || original.__vyraFasVersion) return false;

    var wrapped = function (event) {
      var svar = original.apply(this, arguments);
      try {
        // `state` ar en top-level `let` i media.js och ligger DARFOR ALDRIG pa window — den
        // delas mellan klassiska skript som en fri identifierare. Det ar precis sa
        // runtime-controls.js laser den (`state.widgets.find(...)`), och `root.state` ar
        // undefined. typeof-vakten later filen laddas aven dar media.js saknas.
        var alla = (typeof state !== 'undefined' && state && state.widgets) ? state.widgets : [];
        for (var i = 0; i < alla.length; i++) {
          var k = koreografiFor(alla[i]);
          if (k) koreografera(alla[i], k);
        }
      } catch (e) {
        // Koreografin far aldrig sanka sjalva alerten. Originalet har redan kort.
        try { root.console && console.warn('[gifter-fas] koreografin foll: ' + (e && e.message || e)) } catch (_) {}
      }
      return svar;
    };
    wrapped.__vyraFasVersion = VERSION;
    wrapped.__vyraFasInre = original;              // kedjan sa lager() kan raknas
    root.triggerGifterLevelUp = wrapped;
    vartWrapper = wrapped;
    dekorationer++;
    return true;
  }

  // media.js tilldelar window.triggerGifterLevelUp vid parsning, sa den finns nar den har
  // filen kors. Forsoken darefter ar en sakerhet om laddordningen nagonsin andras — och
  // versionsflaggan gor att vi aldrig lagger tva lager pa varandra.
  if (!dekorera()) {
    root.setTimeout(dekorera, 0);
    root.setTimeout(dekorera, 200);
    root.addEventListener('load', dekorera);
  }

  /* PUBLICERING TILL ALERTKON.
     Kon behover veta att en koreograferad widget tar langre tid an sin visningstid — annars
     slapper den fram nasta alert mitt i hyllnings- och upplosningsfasen (uppmatt: 2036 ms mot
     ett sekvensslut vid 4052 ms). Kon far dock inte kanna till nagra widgettyper, sa
     koreografin publicerar sig sjalv i stallet. hold ingar INTE — den laser kon redan ur
     gifterDuration. EN POST PER MODELL, for tiderna kan skilja sig at mellan modeller och kon
     slar upp med passar(). Idempotent per modell: en dubbelladdad fil far inte registrera sig
     tva ganger och dubbla tiderna. */
  root.VyraFasKoreografi = root.VyraFasKoreografi || [];
  MODELLER.forEach(function (k) {
    var kalla = 'gifter-fas:' + k.modell;
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

  root.VyraGifterFas = {
    VERSION: VERSION,
    dekorera: dekorera,
    modeller: MODELLER.map(function (k) { return k.modell }),
    tider: function (modell) {
      for (var i = 0; i < MODELLER.length; i++)
        if (MODELLER[i].modell === modell) return MODELLER[i].tider;
      return null;
    },
    // Antal wrappers VI har lagt pa triggern. Ska vara 1 oavsett antal modeller — det ar hela
    // poangen med tabellen, och prov 7f bevisar det. Raknas fran var egen wrapper, inte fran
    // window.triggerGifterLevelUp, eftersom kon ligger ovanpa oss och inte gar att ga bakat genom.
    lager: function () {
      var n = 0, f = vartWrapper;
      while (f && f.__vyraFasVersion) { n++; f = f.__vyraFasInre }
      return n;
    },
    dekorationer: function () { return dekorationer },
    wrapperVersion: function () { return vartWrapper && vartWrapper.__vyraFasVersion },
  };
})(typeof window !== 'undefined' ? window : this);
