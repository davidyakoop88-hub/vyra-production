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
    {
      // FORSTA LIGGANDE ARKETYPEN. Widgeten ar 300x156 och byggs med CSS grid och namngivna
      // areas, inte flex order. Rorelsen gar darfor I SIDLED: `.gifter-streak` (26x2, en
      // linear-gradient vid kolumngransen, tand BARA av sidebadge) sveper vanster -> hoger och
      // textkolumnen fods bakom den. Prov 10f vaktar bade svepet och ordningen.
      // Standardtaket 500 racker: sidebadge TONAR IN portrattet, den avslojar det inte som
      // reveal, sa grindens no-op mot en lika lang ljusfas ar harmlos har.
      modell: 'sidebadge',
      passar: arLayout('sidebadge'),
      tider: { anticipationMs: 500, enterMs: 900, exitMs: 600 },
      decodeAnkare: '.gifter-orbit img',
      decodeTimeoutMs: DECODE_TIMEOUT_MS,
      vokabular: VOKABULAR_GIFTER,
    },
    {
      // ANDRA LIGGANDE ARKETYPEN, men inte sidebadge med mer text. Tre kolumner i stallet for
      // tva: en EMBLEMRAD overst (diamant · portratt · bricka) och text i full bredd under.
      // `.gifter-streak` — sidebadges signatur — ar slackt har, sa svep-receptet flyttar inte.
      //
      // PREMISSEN: MYNTVANDNINGEN, och designen sager det sjalv. Animationsnamnen ar gl-flip,
      // gCoinFlipIn och gl-flip-reveal, och keyframen ar `perspective(500px) rotateY(0->360)`.
      //
      // decodeTimeoutMs 900 av EXAKT samma skal som reveal: portrattet sitter i ett mynt som
      // VANDER SIG och avslojar ansiktet. Med standardtaket 500 mot en lika lang ljusfas kan
      // grinden aldrig bli bindande (widget-fas.js:173-183), och myntet hade landat blankt.
      // Att designens egen gRevealFade vantar till 44 % innan portrattet tonas in visar att
      // den redan vet om att bilden behover tid. Prov 11f-C vaktar det.
      modell: 'flip',
      passar: arLayout('flip'),
      tider: { anticipationMs: 500, enterMs: 900, exitMs: 600 },
      decodeAnkare: '.gifter-orbit img',
      decodeTimeoutMs: 900,
      vokabular: VOKABULAR_GIFTER,
    },
    {
      // TREDJE LIGGANDE ARKETYPEN, och varken flip eller sidebadge. FYRA kolumner
      // ("diamond pulse avatar badge") med pulslinjen MELLAN gavan och personen.
      // Duo delar inte ett enda animationsnamn med flip — ingen risk for konkurrerande keyframes.
      //
      // PREMISSEN: PULSEN. Designens egna keyframes sager det: gl-trace ritar, gl-beat slar
      // (scaleY 1 -> 1,9 -> 0,75, en EKG-spik) och basregeln har clip-path:inset(0 100% 0 0),
      // alltsa en linje som ar helt bortklippt tills nagot ritar den.
      //
      // decodeTimeoutMs 900 som reveal och flip: portrattet SNAPPER IN nar pulsen nar det,
      // alltsa avslojas det. Uppmatt vid rod baslinje utan koreografi: portrattet var synligt
      // vid 15 ms medan bilden avkodades forst vid 730 ms. Grinden haller bara tillbaka fas 2,
      // sa portrattet maste dessutom vara DOLT i fas 1 — annars kan den inte skydda alls.
      modell: 'duo',
      passar: arLayout('duo'),
      tider: { anticipationMs: 500, enterMs: 900, exitMs: 600 },
      decodeAnkare: '.gifter-orbit img',
      decodeTimeoutMs: 900,
      vokabular: VOKABULAR_GIFTER,
    },
    {
      // "Classic Rise & Pop". Profile ar renderarens DEFAULT (media.js:578,
      // `w.gifterLayout||'profile'`) — alltsa den modell varje anvandare far som aldrig
      // oppnar modellvaljaren. Premissen ar darfor medvetet den lugnaste av nio: en mjuk men
      // snabb uppstigning av hela widgeten, sedan namnet fram, sedan brickan i en pop.
      //
      // OBS att posten tander koreografi pa varje gifter-widget UTAN uttrycklig layout.
      // arLayout() defaultar redan till 'profile' av precis det skalet.
      //
      // decodeTimeoutMs 500 (standard) av sidebadges skal: profile TONAR IN portrattet, det
      // avslojar det inte. Grinden blir da en strukturell no-op — uppbyggnaden pa 500 ms
      // tacker redan hela avkodningsfonstret — och det ar harmlost for en intoning.
      // Ett forsta forsok slackte dessutom portrattet i fas 1 "sa grinden har nagot att
      // skydda". Prov G1 fallde det: ett ankare pa opacity 0 ar inget ankare. Portrattet
      // arver nu ringens opacitet i stallet, och regeln "hall portrattet dolt i fas 1"
      // galler bara modeller som AVSLOJAR det (reveal, flip, duo).
      modell: 'profile',
      passar: arLayout('profile'),
      tider: { anticipationMs: 500, enterMs: 900, exitMs: 600 },
      decodeAnkare: '.gifter-orbit img',
      decodeTimeoutMs: DECODE_TIMEOUT_MS,
      vokabular: VOKABULAR_GIFTER,
    },
    {
      // "Rakneverket". Number ar den siffercentrerade modellen, och siffrans forvandling ar
      // REDAN koreograferad i JS: gifterTransform (media.js:589) later den gamla siffran sta
      // kvar 450 ms, bursten gar 450-750, och siffran byts MITT I bursten vid 750 ms.
      // Koreografin duplicerar inte det utan ramar in det — tiderna mots exakt: fas 1 ar
      // 0-500 ms (nastan precis den gamla siffrans beat) och bytet vid 750 ms ligger 250 ms
      // in i fas 2, vilket ar dar monteringen av resten borjar.
      // Number ar darfor ENDA modellen vars fas 1 inte ar en tom scen: ringen och den gamla
      // siffran ar sjalva anticipationen. Prov 14f vaktar det.
      //
      // ANKARET ar bottenavataren, inte orbitbilden: `.gifter-orbit img` ar display:none i
      // number, och number ar samtidigt enda modellen dar `.gifter-bottom-profile` SYNS.
      //
      // decodeTimeoutMs 900, inte standardens 500. Bottenavataren ar modellens enda portratt
      // och sista beaten i monteringen — en oavkodad bild ger en tom cirkel i klimax. Ett tak
      // pa 500 kan dessutom aldrig bli bindande mot en ljusfas pa 500, sa grinden hade varit
      // en no-op och prov G3 hade hoppat over modellen.
      // KAND INTERAKTION: med ett bindande tak kan fas 2 skjutas fram till som mest 900 ms
      // medan gifterTransform gar pa sin EGEN klocka och byter siffra vid 750. Vid en mycket
      // langsam bild sker bytet alltsa strax fore monteringen i stallet for samtidigt. Det ar
      // acceptabelt — siffran ar synlig hela tiden — och 14f mater darfor bytet relativt
      // FASBYTET, inte relativt triggern.
      modell: 'number',
      passar: arLayout('number'),
      tider: { anticipationMs: 500, enterMs: 900, exitMs: 600 },
      decodeAnkare: '.gifter-bottom-profile img',
      decodeTimeoutMs: 900,
      vokabular: VOKABULAR_GIFTER,
    },
    {
      // "Banan" — den nionde och sista. Uppmatt FORE tandning kor ringen
      // (`.gifter-orbit > i:nth-child(1)`, display:block, egen opacitet 1) redan `gOrb` med
      // iteration-count infinite. Widgeten ar opacity:0/visibility:hidden, sa rorelsen ar
      // osynlig — men den startar aldrig om. Scenen snurrar alltsa redan; alerten ar
      // ogonblicket da medaljongen gar in i banan.
      //
      // decodeTimeoutMs ar standardens 500, INTE 900 som forst foreslogs. Premissen gor att
      // portrattet tonar in redan i FAS 1 tillsammans med scenen, och duos matning ar entydig:
      // grinden haller bara tillbaka fas 2, sa ett portratt som visas i fas 1 kan den inte
      // skydda alls. Ett hogre tak hade sett bra ut i tabellen utan att gora nagot. Grinden ar
      // en medveten no-op har, precis som pa sidebadge, och prov G1 vaktar anda att ankaret ar
      // ett synligt element. Foljden ar att G3 hoppar over orbitlevel — korrekt, inte ett hal.
      modell: 'orbitlevel',
      passar: arLayout('orbitlevel'),
      tider: { anticipationMs: 500, enterMs: 900, exitMs: 600 },
      decodeAnkare: '.gifter-orbit img',
      decodeTimeoutMs: DECODE_TIMEOUT_MS,
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
    /* Grinden har ALLTID slagit upp sitt ankare per modell (`bild:` i koreografera nedan) —
       det som saknades var en vag for proven att lasa VILKET element modellen sager sig vakta.
       Utan den kunde prov G1 bara konstatera att NAGON av de tva portrattkandidaterna syntes,
       och en modell som deklarerade fel av dem hade sluppit igenom med gron vakt medan fas 2
       oppnade mot en oavkodad bild. G3 anvander bada accessorerna for att visa att grinden
       faktiskt vantar pa det deklarerade elementet och inte pa nagot annat. */
    ankare: function (modell) {
      for (var i = 0; i < MODELLER.length; i++)
        if (MODELLER[i].modell === modell) return MODELLER[i].decodeAnkare;
      return null;
    },
    // Samma tak som koreografera anvander, inklusive fallbacken — annars kan ett prov rakna
    // pa ett annat varde an motorn far.
    decodeTak: function (modell) {
      for (var i = 0; i < MODELLER.length; i++)
        if (MODELLER[i].modell === modell)
          return MODELLER[i].decodeTimeoutMs || DECODE_TIMEOUT_MS;
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
