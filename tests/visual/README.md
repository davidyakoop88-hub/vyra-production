# Visuell regressionsvakt


## Fas 3 och 4 — bevisen att vakten faktiskt vaktar (2026-08-20)

Vakten jämför mot incheckade referensbilder, och de gäller **bara** på den Chromium-build de togs
på. Två saker gick därför inte att bevisa med den: att jämföraren avgör utfallet, och att en
CSS-ändring fäller exakt de nycklar som använder regeln. Båda bevisen ligger nu i egna prov som
**inte behöver referensbilder** och därför kan köras var som helst.

| Fil | Vad den bevisar |
|---|---|
| `jamforaren-muterad.browser.test.js` | **Fas 4.** Jämföraren muteras åt båda hållen: en som alltid säger *identisk* släpper igenom en verklig färgändring (Fa), en som alltid säger *olika* fäller det den riktiga kallar identiskt (Fb), och en ändrad bildstorlek fångas före pixeljämförelsen (Fc). Utan de här kan V.JAMFOR tyst svara ja på allt medan 166 nycklar lyser grönt. |
| `css-andring-faller-ratt.browser.test.js` | **Fas 3.** En CSS-regel injiceras live: en widget som använder den ser annorlunda ut efteråt (Ga), en som inte gör det är oförändrad (Gb), och två foton utan ändring är identiska (Gc — kontrollmätningen som gör de andra två läsbara). |

Kör dem med `npm run test:visual:rigg`. I CI kör de **före** vakten: faller de, säger vaktens gröna
nycklar ingenting, och då är det riggen som är trasig — inte widgetarna.

### Varför fas 3 inte mäter mot referenserna
Författarens plan var att ändra en CSS-regel och läsa av vilka nycklar som faller mot referens‑
bilderna. Det beviset kan bara tas i CI och går inte att upprepa lokalt — vakten vägrar (med rätta)
jämföra på en annan binär. Provet ovan mäter i stället foto mot foto på samma binär, vilket bevisar
samma påstående och kan köras av vem som helst.


## ÖPPET FYND 2026-08-20: `ranking:templateTopPoints:neon` flackar på textrendering

Uppmätt, inte gissat. Referensjobbet kördes två gånger med några minuters mellanrum, båda på den
pinnade Chromium-builden i CI:

| Körning | Utfall för nyckeln |
|---|---|
| 32360904466 | **föll** — 1246 av 121800 px (1,02 %), inom 36×318 px vid (107,74), största kanalskillnad **255 av 255** |
| 32361868009 | **grön** mot exakt samma referensbild, som därför inte skrevs om |

Diffbilden (artefakten `visuella-diffar-referenser`) mättes pixel för pixel: **all text är markerad**
— de fem namnen och de fem poängtalen — medan avatarer, plattor och rangsiffror är identiska.
Kanalskillnad 255 på text och noll på allt annat betyder att glyferna renderats olika, inte att
något flyttats eller bytt färg.

Det är samma familj som riggfel 4 i vaktens egen dokumentation (*typsnitt som inte hunnit laddas*),
men här räcker inte `document.fonts.ready`: bilderna togs efter att den löst ut, i samma jobb, på
samma binär. Något gör att just den här widgetens text ibland ritas med ett annat typsnitt.

**Vad som INTE gjordes:** referensen skrevs inte om. En bild som skrivs om tills provet råkar bli
grönt döljer flackningen i stället för att stänga den, och nästa gång faller den igen. Nyckeln står
kvar i jämförelsen — faller den på nytt är det ett kvitto på att fyndet lever, inte en gåta.

**Nästa steg för den som tar tag i det:** logga `document.fonts.check()` för widgetens faktiska
typsnittsfamilj precis före fotograferingen och jämför de två utfallen. Hypotesen är att en
`@font-face` med `font-display: swap` hinner byta mellan mätningen och skärmdumpen — men det är en
hypotes, inte en mätning, och den står som en sådan.
