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

## Bild och avatar

`assets/guardian-emblem/emerald.png` är en 1024 × 1024 PNG med riktig alfa.
Bildgenereringens inritade rutbakgrund frilades med rembg och ImageMagick;
omgivningen och avatarhålet har kontrollerats mot ljus och mörk bakgrund.
Guld, vita fjädrar och de gröna kristallerna behåller den godkända formen.
Den rörliga auran ritas separat i CSS och följer samma fasklocka som emblemet.

Avataren ligger bakom konstverket. Dess cirkel mäts mot bildens proportioner i
`VyraGuardianModels.EMERALD` och går något under ringens kant, så en besökares foto
fyller hålet utan att täcka guld eller kristaller. Namn och text är dynamiska och
är inte inbakade i bilden.

## Kod och verifiering

`guardian-emblem-models.js` kompletterar renderare, panel och katalog; CSS ligger
i motsvarande syskonfil. Båda laddas genom `media.js`. Inga ändringar i
`studio.js`, eventkontraktet eller Guardian-sessionens kö krävs.

`tests/guardian-emblem-models.test.js` provar modellbyte, äldre sparade widgetar,
katalogens riktiga miniatyr, live-avatar/namn och fasordning. Browserproven i
`tests/browser/guardian-emblem.browser.test.js` kontrollerar att bilden laddas,
att avatarhålet är runt och transparent, att alla fyra faser syns i rätt ordning
och att reducerad rörelse verkligen stänger av animationerna.
