# Guardian · Blå kristall och Grön aura

Två egna modeller kompletterar guldmodellens fyra praktsteg:

- `guardianModel: 'sapphire'` är den först godkända designen: vit hjort, stora
  guldhorn, guldkrona, vita fjädrar och blå kristaller. I panelen heter den **Blå kristall**.
- `guardianModel: 'emerald'` väljer ramen med smaragder och grön aura.
- Saknat eller okänt modellvärde behåller guldmodellen.

- Katalog: `catalog:guardianemblem:model:sapphire` och `catalog:guardianemblem:model:emerald`.
- Inställningar: Guardian Emblem → Utseende → Modell → Blå kristall / Grön aura.
- Modellbytet bevarar namn, reservprofilbild, egen text, guldets praktsteg och widgetens bredd.
- Samma live-trigger fyller `ge-avatar` och `ge-namn` med besökarens data.
- Om nästa besökare saknar profilbild används inställd reservbild eller ett tomt hål;
  föregående besökares foto får aldrig ligga kvar under ett nytt namn.
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
i motsvarande syskonfil. Båda laddas genom `media.js`. Triggern i `media.js` rensar
nu föregående besökares foto när nästa saknar bild. `studio.js`, eventkontraktet
och Guardian-sessionens kö är oförändrade.

`tests/guardian-emblem-models.test.js` provar modellbyte, äldre sparade widgetar,
katalogens riktiga miniatyr, live-avatar/namn och fasordning. Browserproven i
`tests/browser/guardian-emblem.browser.test.js` kontrollerar att bilden laddas,
att avatarhålet är runt och transparent, att alla fyra faser syns i rätt ordning
och att reducerad rörelse verkligen stänger av animationerna.


Originalets `sapphire.png` friläggs direkt ur den godkända hyllningsbilden; text,
bakgrund och avatarhål tas bort medan illustrationens egna pixlar bevaras.
Hålets cirkel mäts separat i `VyraGuardianModels.SAPPHIRE` eftersom originalets
ram har andra proportioner än Grön aura.

Browserproven kontrollerar dessutom båda modellerna vid 280, 400 och 560 px bredd:
profilbilden är rund, fyller hålet och ligger bakom guldringen; rubrik, namn och
egen text ryms utan överlappning. Ett separat prov öppnar den riktiga overlay-sidan
och skickar ett simulerat Guardian-event genom `routeLiveBattleEvent`. Det mäter
ärvd synlighet för foto/namn/text, alla fyra faser, helt släckt viloläge och rätt
profilbild för nästa besökare. Detta ersätter inte en riktig TikTok LIVE-sändning.
