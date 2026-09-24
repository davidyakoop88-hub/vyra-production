# Rankingdesignerna — de gamla är pensionerade

**Gjort 2026-09-24**, på Davids begäran: *"ta bort de gamla helt och hållet, att de inte kommer
tillbaka"*. Kvar finns bara de sex designerna från ranking-sixpack (Voltage, Basic v2, Prism vertikal,
Prism horisontal, Celestial, Royal Rose). De ritas av `ranking-sixpack.js`, och samma design används
för Top Like, Top Coins och Top Points.

| Familj | Pensionerad | Sparad widget ritas som |
|---|---|---|
| Top Like | Clean Bar, Soft Stack, Side Rank | Voltage |
| Top Like | Mini Podium | Prism horisontal |
| Top Points | Stil 1 · Lista (`clean`), Stil 4 · Neon (`neon`) | Voltage |
| Top Points | Stil 2 · Tre i mitten (`center`), Stil 3 · Podium (`podium`) | Prism horisontal |

Top Coins Halo och Signal Orbit berördes inte. De syntes inte på Davids bilder.

## Var de är borta

- **Katalogen.** Top Likes "VYRA ORIGINAL"-sektion är en tom, dold markör (`approved-rankings.js`).
  Den finns kvar bara för att `media.js:s` `topLikeCatalogBind` annars bygger om de gamla knapparna
  vid varje render. Top Points egen sektion byggs inte alls (`toppoints-v2.js`). Den tomma rubriken
  "VYRA TOP RANKING" från `media.js` döljs (`ranking-sixpack.js`).
- **Designväljarna i panelen.** Top Likes temaväljare läser `VYRA_TOPLIKE_STYLES`
  (`toplike-design.js`), som bara listar de sex. Top Points designknappar filtrerar bort de fyra.
- **Fabriken.** `widget-factory.js` bygger aldrig en ny widget med en pensionerad design. En gammal
  nyckel som `catalog:toplike:clean-bar` eller `catalog:ranking:templateTopPoints:podium` skapar
  närmaste nya design, så inget gammalt val sparas i state eller i molnet.
- **Kartan och den visuella vakten.** De åtta nycklarna är borta ur `docs/katalogkarta.md`,
  referensbilderna är raderade och manifestet har 105 bilder.

## Profilramarna finns kvar

Top Likes ramväljare med 53 profilramar står kvar (Davids beslut). Väljer streamern en ram ersätter den
designens egen ram, i `ranking-sixpack.js` (`profilram`). Den använder samma fil och samma uppmätta
geometri (`vyraFrameGeom`) som den gamla `media.js`-motorn.

- Ramens utstick bortom avataren (`--ram-ut`) läggs på grannarna, aldrig på avataren: avståndet
  mellan raderna växer, och i sidled knuffas namn och värde med `translate`. Fotot flyttar sig alltså
  inte, och widgeten blir inte bredare (`tests/browser/ram-ror-inte-bildmatt`). I raddesignerna
  hamnar namnet under ramen, och grannramarna får mötas i sidled.
- Rangbrickor och glöd tar ramens accent (`vyraFrameAccent`, "siffror matchar ramarna").

Proven finns i `tests/browser/ram-radavstand-vaxer-inte.browser.test.js` och `ram-ror-inte-bildmatt.browser.test.js`.

## Varför sparade widgetar inte skrivs om

En widget som redan är sparad med en gammal design pekas om **vid rendering**, i
`ranking-sixpack.js` (`PENSION`), och widgetobjektet muteras aldrig. Det är samma skyddsnät som
`topgift-pension.js` använder, och det följer regeln i `toplike-studio.js`: *lägg aldrig tillbaka en
klientdriven migrering som skriver till molnet vid mount*. Därför ser streamern aldrig den gamla
designen, varken i studion eller i OBS, fast det gamla värdet står kvar i den sparade layouten.
Värdet skrivs över första gången streamern själv väljer en design.

Detsamma gäller en Top Like- eller Top Points-widget **utan** design, och en Top Like med något av de
ännu äldre skinnen som tidigare föll tillbaka på Clean Bar. Alla ritas som Voltage, så det gamla kan
inte komma tillbaka den vägen heller.

## Vad som finns kvar i koden, och varför

- **Presets och CSS** för de gamla designerna (`toplike-design.js` defaults, `toplike-studio.css`,
  `toppoints-v2.css`, `toppoints-v2.js` DESIGNS). Ingenting når dem längre, eftersom
  `ranking-sixpack.js` tar bort familjernas designklasser från roten. De är kvar för att en
  borttagning skulle röra ett hundratal regler och prov utan att ändra en enda pixel. De kan städas
  bort i en egen ändring.
- **Vitlistan `LIKE_SKINS`** i `approved-rankings.js` har kvar de fyra, så att en sparad widget
  renderas och sedan pekas om, i stället för att tappa sitt skinn.

`tests/ranking-sixpack.test.js` vaktar pensioneringen. Varje pensionerad och saknad design ska ritas
som sin ersättare, fabriken får aldrig spara en gammal design, och Top Coins Halo ska vara orörd.
