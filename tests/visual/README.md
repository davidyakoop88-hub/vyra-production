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
