'use strict';
// MOLNETS FÄLTNAMN, PÅ ETT ENDA STÄLLE.
//
// Molnkedjan och widgetarna är oense om två fältnamn: molnet skickar `profileUrl` och `value`,
// widgetarna läser `profileImage` och `coins`. Översättningen måste därför ske på vägen in — och
// den skedde fram till 2026-09-06 i TVÅ kopior, en i live-client.js och en i
// public/widgets/base-widget.js, för att de fristående OBS-sidorna aldrig laddar live-client.js.
//
// DÄRFÖR FINNS DEN HÄR FILEN: NFKC-fixen (#342, `fc5235b`) lades i den ena kopian och nådde
// aldrig den andra. Buggen var alltså lagad i Studions overlay-utdata och kvar på de fristående
// widgetlänkarna — samma produkt, samma sändning, olika svar beroende på vilken länk streamern
// råkat kopiera. Det upptäcktes först vid en kartläggning av hela datavägen, inte av ett prov.
//
// REGELN HÄRIFRÅN: en ändring av hur ett molnfält översätts görs HÄR, aldrig i en konsument.
// tests/molnfalt-en-kalla.test.js faller om någon återinför en egen kopia.
//
// Filen laddas som ett vanligt skript (repot har inget byggsteg) och följer samma UMD-form som
// tiktok-event-adapter.js: en global för webbläsaren, module.exports för proven.
(function (root) {
  // Dekorativa Unicode-alfabet ("𝓙𝓸𝓴𝓮𝓻𝓸", "𝕁𝕠𝕜𝕖𝕣𝕠") är egna Unicode-tecken i de matematiska
  // alfabeten (U+1D400–1D7FF) och liknande block, och få gränssnittstypsnitt täcker dem.
  // Resultatet i overlayen är rutor: namnet blir oläsligt.
  //
  // NFKC är gjort för precis det här och viker ihop kompatibilitetsvarianter till sina vanliga
  // bokstäver. UPPMÄTT över sjutton stilar från de vanliga "fancy text"-generatorerna: femton
  // faller tillbaka till vanlig text. Kvar blir små kapitäler (ᴀ) och upp-och-ner (ɐ), som ligger
  // i Latin Extended och som de flesta typsnitt faktiskt HAR — de var alltså aldrig rutorna.
  //
  // TRE SAKER DEN INTE GÖR, och alla tre är skälet till att den är säker att köra på allt:
  //   * ett vanligt namn är oförändrat — 'Jokero' in, 'Jokero' ut
  //   * arabiska, thai, japanska och emoji lämnas i fred; det är riktiga skriftspråk, inte dekoration
  //   * BARA visningsnamnet rörs, aldrig `username`. Handtaget är IDENTITETEN — allt nycklas på det,
  //     och normaliserade man det skulle två personer vars namn viks lika bli en enda. Den
  //     skillnaden gjordes uttrycklig i battle-mvp-session.js 2026-09-05 och gäller här av samma skäl.
  function plattaNamn(v) {
    const s = String(v == null ? '' : v);
    if (!s) return s;
    const platt = s.normalize('NFKC');
    // NFKC tar aldrig bort tecken, men en tom rad tillbaka vore värre än ett oläsligt namn.
    return platt.trim() ? platt : s;
  }

  // Typvakten kommer från base-widget.js-kopian och behålls: de fristående sidorna får sitt event
  // ur postMessage och localStorage, där ett trasigt värde är fullt möjligt. live-client.js
  // anropar alltid med ett objekt, så vakten kostar den ingenting.
  function normalizeCloudFields(e) {
    if (!e || typeof e !== 'object') return e;
    if (e.profileImage == null && e.profileUrl) e.profileImage = e.profileUrl;
    if (e.coins == null && e.value != null) e.coins = e.value;
    if (e.name != null) e.name = plattaNamn(e.name);
    return e;
  }

  const api = Object.freeze({ plattaNamn, normalizeCloudFields });
  root.VyraCloudFields = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
