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
const TOMMA = {
  // Oversikt
  'oversikt-historik': { text: 'Ingen historik att visa ännu. Logga in så hämtas dina gåvor, diamanter och likes.' },
  'oversikt-puls': { text: 'Inga händelser ännu. Anslut VYRA Desktop så visas riktiga TikTok-händelser här direkt.' },
  // Overlay (wrapper: rubrik + rad — bada raknas in i texten)
  'overlay-tom': { text: 'Inga widgets ännu. Lägg till en från katalogen nedan så visas den här direkt.' },
  // Automatik (mallen)
  'automatik-scenlank': { text: 'Ingen säker OBS-länk ännu — scenen kan inte öppnas i OBS förrän du skapat en.' },
  'automatik-actions': { text: 'Inga Actions ännu. Skapa den första.' },
  'automatik-events': { text: 'Inga Events ännu. Koppla ett event till en Action.' },
  'automatik-timers': { text: 'Inga timers ännu. Skapa en som kör en Action på schema.' },
  // TTS Chat
  'tts-special': { text: 'Inga specialanvändare tillagda. Lägg till en för egen röst eller blockering.' },
  'tts-logg': { text: 'Inget uppläst ännu. När chatten läses upp visas raderna här.' },
  // Handelser
  'handelser-tom': { text: 'Inga händelser ännu. Anslut TikTok LIVE så fylls historiken på här i realtid.' },
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
