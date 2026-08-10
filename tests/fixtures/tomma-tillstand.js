'use strict';
// EN kalla for alla tomma tillstand i Studion (Etapp 4, PR B). Formeln ar beslutad
// 2026-08-09: [vad som saknas/varfor] + [konkret nasta handling] — Automatik-vyns stil.
//
// Varje tomt tillstand i DOM bar data-tom="nyckel". DOM-provet kraver att den taggade
// nodens normaliserade text ar EXAKT fixturens — sa ingen ny rost kan smyga in — och att
// varje vy visar exakt de nycklar som forvantas. Nodprovet kraver att varje text foljer
// formeln: minst tva delar atskilda av punkt eller tankstreck.
//
// 'monster' i stallet for 'text' nar strangen bar dynamiska tal; 'exempel' ar da det
// formelprovet granskar.
// 'handling' ar Etapp 6E: texten sager "Skapa den forsta" — da ska det ga att gora harifran.
//
// Handlingen ar ett SYSKON till [data-tom]-noden, aldrig ett barn. Rostprovet jamfor nodens
// normaliserade textContent EXAKT mot 'text' nedan, sa en knapp inuti noden hade fallt det.
// automatik-scenlank har burit sin knapp som syskon sedan Etapp 4 — det ar monstret.
//
// 'mal' ar den befintliga mekanismen i samma vy, uppmatt som narvarande och synlig 2026-08-09.
// Tillstand UTAN handling har inget att klicka pa: tts-logg och statistik-topp beskriver en
// konsekvens, statistik-basta-tid en troskel, och oversikt-puls/statistik-tillvaxt pekar pa
// skrivbordsappen som sedan #175 bor i sidhuvudet — fem utspridda knappar slar en hogt upp.
const TOMMA = {
  // Oversikt
  // FLERA ROSTER PA SAMMA NYCKEL. [data-alltime-note] byter text beroende pa lage, och
  // testmiljon ar alltid utloggad — sa vakten har bara nagonsin sett den forsta. De tre andra
  // fanns i koden fran borjan utan att nagon matning natt dem.
  //
  // 'text' ar den DOM-provet moter. 'varianter' ar de ovriga som formelprovet och kallvakten
  // kraver. 'laddar' ar undantaget: "Hamtar din historik…" ar ett OVERGANGSLAGE, inte ett tomt
  // tillstand, och har darfor varken tva delar eller en handling.
  'oversikt-historik': {
    text: 'Ingen historik att visa ännu. Logga in så hämtas dina gåvor, diamanter och likes.',
    varianter: [
      'Ingen historik ännu — den börjar byggas vid din nästa sändning.',
      'Ingen TikTok ansluten ännu. Historiken börjar när du sänder första gången.',
      'Kunde inte hämta historiken just nu. Siffrorna ovan är inte hela sanningen.',
    ],
    laddar: 'Hämtar din historik…',
    kalla: 'overview-premium.js',
  },
  'oversikt-puls': { text: 'Inga händelser ännu. Anslut VYRA Desktop så visas riktiga TikTok-händelser här direkt.' },
  // Overlay (wrapper: rubrik + rad — bada raknas in i texten)
  'overlay-tom': { text: 'Inga widgets ännu. Lägg till en från katalogen nedan så visas den här direkt.' },
  // Automatik (mallen)
  'automatik-scenlank': { text: 'Ingen säker OBS-länk ännu — scenen kan inte öppnas i OBS förrän du skapat en.' },
  'automatik-actions': { text: 'Inga Actions ännu. Skapa den första.',
    handling: { etikett: 'Skapa din första Action', mal: '#newAeAction' } },
  'automatik-events': { text: 'Inga Events ännu. Koppla ett event till en Action.',
    handling: { etikett: 'Koppla ditt första Event', mal: '#newAeEvent' } },
  'automatik-timers': { text: 'Inga timers ännu. Skapa en som kör en Action på schema.',
    handling: { etikett: 'Skapa din första timer', mal: '#newAeTimer' } },
  // TTS Chat
  'tts-special': { text: 'Inga specialanvändare tillagda. Lägg till en för egen röst eller blockering.',
    handling: { etikett: 'Lägg till användare', mal: '#ttsAddSpecial' } },
  'tts-logg': { text: 'Inget uppläst ännu. När chatten läses upp visas raderna här.' },
  // Handelser
  'handelser-tom': { text: 'Inga händelser ännu. Anslut TikTok LIVE så fylls historiken på här i realtid.',
    handling: { etikett: 'Anslut TikTok LIVE', mal: '.connect' } },
  // Statistik
  'statistik-tillvaxt': { text: 'Ingen livedata ännu. Gå live med VYRA Desktop så ritas din tillväxt här dag för dag.' },
  'statistik-topp': { text: 'Inga supportrar att visa ännu. Efter din första livesändning listas dina största gåvogivare här.' },
  'statistik-basta-tid': {
    monster: /^Behöver minst \d+ dagars livedata \(har \d+ just nu\)\. Sänd \d+ dagar i rad så räknar VYRA ut din bästa sändningstid\.$/,
    exempel: 'Behöver minst 3 dagars livedata (har 0 just nu). Sänd 3 dagar i rad så räknar VYRA ut din bästa sändningstid.',
  },
};

// Vilka tillstand varje vy ska visa i TOMT lage (lokal server utan inloggning/livedata).
const PER_VY = {
  home: ['oversikt-historik', 'oversikt-puls'],
  overlay: ['overlay-tom'],
  actions: ['automatik-scenlank', 'automatik-actions', 'automatik-events', 'automatik-timers'],
  ttsChat: ['tts-special', 'tts-logg'],
  events: ['handelser-tom'],
  analytics: ['statistik-tillvaxt', 'statistik-topp', 'statistik-basta-tid'],
};

module.exports = { TOMMA, PER_VY };
