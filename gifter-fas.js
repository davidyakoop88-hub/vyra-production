// gifter-fas.js — koreografin för Gifter Level Up, en fas i taget.
//
// FYRFASPORTENS ART-FIL (PR B, beslut 2026-08-19). Mekaniken bor i widget-fas.js — samma fabrik
// som driver Fan Level Up. Här bor det Gifter-specifika: registret FASER, tiderna, modellernas
// dokumentation och de fem konfigurationspunkterna. Designerna kommer ur wt-g-arkivets nio
// koreografier (arkiv/gifter-fyrfasmotorn-wtg) som STORYBOARD — CSS:en är nyskriven mot mains
// markup, aldrig porterad: wt-g:s CSS var skriven mot ett träd som divergerat 226 filer, och
// dess sekventiella form krockade med mains parallella delays. Mains exit per modell
// (.gifter-exit, gl-descend-familjen) behålls — porten gäller entrén.
//
// VAD EN FAS ÄR, VARFÖR KLOCKAN ÄR BYTBAR, HUR KOPPLINGEN SITTER INNANFÖR ALERTKÖN — allt det
// är fabrikens kontrakt, dokumenterat i widget-fas.js och vaktat av tests/widget-fas.test.js.
// G1–G3 i tests/gifter-fas.test.js håller den här familjen sluten på samma sätt som F1–F3
// håller Fans: varje koreografi hör till en känd modell, en okänd modell får ingen fas alls,
// och varje sekvens ryms i gifterDuration-reglagets golv (2 s, media.js min="2").
(function (root) {
  'use strict';

  const PREFIX = 'gifter-fas-';
  const KORTASTE_VISNING = 2000;

  // REGISTRET. En modell utan post spelar som förut — med mains befintliga entré. Modellerna
  // byggs en i taget med godkänd byggplan per modell; en halvfärdig fas är sämre än ingen.
  //
  // risingtier · STIGNINGEN. Uppmätt på main 2026-08-19 (scratchpad/mat-risingtier.json) före
  // bygget: hela avläsningen — badge, rubrik, namn, meddelande, porträtt — stod på opacitet
  // 1,00 vid 40 ms medan stapeln klättrade; widgeten berättade slutet före början. Och trappan
  // syntes aldrig: gd-2/gd-3 låg stilla på sin designade vila (0,28-ekolagren ur #198:s
  // formspråk) eftersom det statiska !important slog keyframen — Fan-läxan i gifterform.
  //
  //   fas 1 · strålar         340 ms   pilarna stiger, streaken laddar, trappan tänds NEDIFRÅN
  //                                    mot designens vila (gd-3 → 0,28 · gd-2 → 0,28 · gd-1 → 1)
  //   fas 2 · materialisering 360 ms   porträttet materialiseras, nivåbadgen stämplas
  //   fas 3 · avläsning       340 ms   rubrik, namn och meddelande stiger in i läsordning
  //
  // Totalt 1040 ms — samma storleksordning som Fan-modellerna, för att två alerts ur samma
  // familj ska kännas som samma app. Exit och idle (gOrb, heartSpark) är mains egna, orörda.
  // profile · RISE & POP. Uppmätt på main 2026-08-19 (scratchpad/mat-profile.json) före bygget:
  // profile är mains nakna DEFAULTMODELL — vid 40 ms stod allt på sina vilovärden (opacitet 1,00,
  // ekolagren 0,28) utan en enda entréanimation; widgeten snäppte på. Eftersom renderaren
  // defaultar till profile (media.js gifterLevelHtml, `w.gifterLayout||'profile'`) är det här
  // entrén varje användare får som aldrig öppnar modellväljaren — därför medvetet den lugnaste
  // av nio (wt-g-storyboarden 'Classic Rise & Pop'): ringen glimmar, kroppen stiger som en
  // enhet, namnet fram, brickan i en pop.
  //
  //   fas 1 · glimt     400 ms   ringen tonar upp ensam till 0,35 — porträttet ÄRVER
  //                              medaljongens opacitet och släcks ALDRIG självt (wt-g:s
  //                              G1-läxa: profile TONAR IN porträttet, avslöjar det inte)
  //   fas 2 · stigning  480 ms   kroppen — medaljong, diamantrad, rubrik, meddelande —
  //                              stiger som EN kropp; namnet och brickan väntar
  //   fas 3 · pop       340 ms   namnet fram i kort egen resa, brickan poppar ÖVER 1
  //
  // Totalt 1220 ms. Exit finns inte för profile på main och porten gäller entrén — widgeten
  // lämnar som förut. Idlen (heartSpark-gnistorna) är mains egen, orörd.
  // number · RÄKNEVERKET. Uppmätt på main 2026-08-20 (scratchpad/mat-number.json): allt stod
  // på vilovärdena vid 40 ms — MEN siffran hade redan sin egen koreografi (`.gifter-big-level`
  // dämpad till 0,85 av xform-old, gifter-land i slutet). gifterTransform (media.js) äger den
  // mekaniken sedan länge: gamla siffran 0–450, burst 450–750, BYTET vid 750, land till 1250.
  //
  // VI DUPLICERAR DEN INTE — vi ramar in den, och tiderna möts exakt:
  //   fas 1 · ratt       460 ms   ringen och den GAMLA siffran ÄR anticipationen. Number är
  //                               därför ENDA modellen vars fas 1 inte är en tom scen; allt
  //                               annat väntar släckt.
  //   fas 2 · montering  480 ms   bytet vid 750 ligger 290 ms in i fasen. Först DÄREFTER
  //                               monteras diamantraden och rubriken (väg A), sedan badgen,
  //                               namnet, texten och bottenavataren (väg B).
  //   fas 3 · avlasning  340 ms   sista raderna landar.
  //
  // Totalt 1280 ms. `.gifter-bottom-profile` är modellens enda porträtt och syns BARA här —
  // fas 1 släcker föräldern, aldrig bilden själv (profile-läxan, prov Db).
  const FASER = {
    number: [
      { namn: 'ratt', ms: 460 },
      { namn: 'montering', ms: 480 },
      { namn: 'avlasning', ms: 340 },
    ],
    profile: [
      { namn: 'glimt', ms: 400 },
      { namn: 'stigning', ms: 480 },
      { namn: 'pop', ms: 340 },
    ],
    risingtier: [
      { namn: 'stralar', ms: 340 },
      { namn: 'materialisering', ms: 360 },
      { namn: 'avlasning', ms: 340 },
    ],
  };

  // De fem Gifter-punkterna, samlade på ETT ställe. layoutPrefix speglar renderarens
  // gifter-layout-<modell>-klasser (media.js gifterLevelHtml); _gifterTimer är spåret
  // triggern lämnar per tänd låda (media.js:599 sätter det); triggerGifterLevelUp är namnet
  // kopplingen lindar sig runt, INNANFÖR alertkön (runtime-controls byter ut den ~500 ms
  // efter start — arten laddas statiskt före det, precis som fan).
  const motor = root.VyraWidgetFas.skapa({
    prefix: PREFIX,
    kortasteVisning: KORTASTE_VISNING,
    faser: FASER,
    layoutPrefix: 'gifter-layout-',
    selector: '.gifter-level-up',
    aktivKlass: 'gifter-active',
    timerFalt: '_gifterTimer',
    triggerNamn: 'triggerGifterLevelUp',
  });

  root.VyraGifterFas = motor;
})(window);
