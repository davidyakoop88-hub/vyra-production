(() => {
  // EN FÖRARE FÖR AUTOMATIONEN (§15 i docs/tech-debt.md).
  //
  // live-client.js:131 kör handleEvent i VARJE flik som tar emot ett live-event, och studio.html
  // ?overlay=1 är samma sida — alltså kör varje scenlänk sin egen kopia. Uppmätt 2026-08-17 med
  // studion plus två scenlänkar mot ett delat lager, EN gåva à 100 poäng:
  //
  //   avdrag: 3      fyrverkeriet i scen 1 spelade: 3 ganger (kon hade tre poster)
  //
  // Tittaren betalade tre gånger och såg samma effekt tre gånger. Fixen är inte att flytta
  // avdraget igen utan att bestämma vilken flik som KÖR automationen. Resten tiger och tar emot
  // uppspelningen via localStorage['vyra-action-run'], den brygga action-runtime.js redan lyssnar
  // på — den bar redan trafiken, det var just därför spelningarna blev tre.
  //
  // NIVÅ 1 ÄR STUDION HÄR, och det är en medveten skillnad mot rösten. Automationen vill ha den
  // flik som äger layouten: den kan skriva de skyddade nycklarna via writeActive
  // (session-state.js:138, :284) och är den streamern faktiskt tittar på. Actions routas ändå till
  // rätt scen av allowed(), så uppspelningen hamnar i OBS oavsett vem som kör. Rösten har motsatt
  // behov och därför motsatt prioritet — se vyra-tal.js.
  //
  // NIVÅ 2 ÄR INGET ARTIGHETSUNDANTAG. En streamer som startar OBS före Studion förväntar sig att
  // tittarnas effekter fungerar direkt; utan den vore varje uppsättning utan öppen studio död.
  //
  // Själva elektionen bor i vyra-masterval.js, eftersom rösten behöver exakt samma mekanism med
  // omvänd prioritet. Två hjärtslagsnycklar, en implementation.
  const val = window.VyraMasterval?.skapa?.({
    nyckel: 'vyra-automation-master',
    // studio-committed sätts bara när session-state har en committad projektion, och högst en
    // flik kan äga den åt gången. Nivå 1 kan därför aldrig vara två.
    minNiva: () => (window.VyraSessionState?.mode?.() === 'studio-committed' ? 1 : 2),
  });

  // Saknas fabriken (laddningsfel, cacheskev) kör varje flik som före §15a. Hellre ett
  // dubbelavdrag än en svart overlay — samma fail-open som resten av kedjan.
  window.VyraAutomationMaster = val || {
    arMaster: () => true, farKora: () => true, pulsa: () => Promise.resolve(),
    tabId: 'utan-masterval', nyckel: 'vyra-automation-master', TTL: 6000,
  };
})();
