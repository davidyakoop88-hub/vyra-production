# Guardian · Grön aura

Tillägg till guldmodellens fyra praktsteg. `guardianModel: 'emerald'` väljer den
godkända ramen med hjorthuvud, guldkrona, vita fjädrar, smaragder och grön aura.
Saknat eller okänt modellvärde behåller guldmodellen.

- Katalog: `catalog:guardianemblem:model:emerald`.
- Inställningar: Guardian Emblem → Utseende → Modell → Grön aura.
- Modellbytet bevarar namn, egen text, guldets praktsteg och widgetens bredd.
- Samma live-trigger fyller `ge-avatar` och `ge-namn` med besökarens data.
- Samma fasklocka: ljus 600 ms, öppning 1200 ms, hyllning 3500 ms, utgång 800 ms.
- Rörelserna begränsas när besökaren valt reducerad rörelse.

## Kvar före leverans

**Utkast – inte redo att publicera.** Bilden måste friläggas och sparas med riktig
alfa som `assets/guardian-emblem/emerald.png`. Bildverktygets två försök gav en
inritad rutig bakgrund i en RGB-fil. Den filen är inte ett godkänt overlay-material
och har därför inte lagts in i repot. Geometrin i `VyraGuardianModels.EMERALD` är
preliminär och ska mätas mot den färdiga bilden.

Kontrollera sedan avatarens placering och alla fyra faser mot ljus och mörk
bakgrund. Uppdatera katalogkartan och visuella referenser med repots ordinarie
verktyg när bilden är färdig. Befintlig produktion har inte ändrats.

## Kod och verifiering

`guardian-emblem-models.js` kompletterar renderare, panel och katalog; CSS ligger
i motsvarande syskonfil. Båda laddas genom `media.js`. Inga ändringar i
`studio.js`, eventkontraktet eller Guardian-sessionens kö krävs.

`tests/guardian-emblem-models.test.js` provar modellbyte, äldre sparade widgetar,
katalogens riktiga miniatyr, live-avatar/namn och fasordning. Dessa DOM-prov
ersätter inte kontrollen av bildens alfa och visuella placering.
