# Top Gift — så gallras designerna säkert

Top Gift har **40 designer**. Det är för många, och de ska bli färre. Det här dokumentet säger hur
en design tas bort utan att någons sändning ser fel ut.

Allt som står som **uppmätt** är läst ur koden 2026-09-23.

---

## 1. Var de bor

Alla fyra grupperna ligger i **en** tabell: `variants` i `widget-factory.js`. Det gör en
borttagning till en dataändring, inte en kodändring.

| Grupp | Nyckel i `variants` | Antal |
|---|---|---|
| Premium | `topgift.premium` | 21 |
| Extra | `topgift.extra` | 8 |
| Ramar | `topgift.frame` | 7 |
| Klassiska | `topgift.theme` | 4 |

Ramarna har dessutom konst i `assets/topgift-frames/<namn>.png`, och varje design har en
referensbild i `tests/visual/referenser/topgift_*.png`.

## 2. Fällan: renderaren är inte den du tror

`premium-final.js:18` **skriver över** `vyraTopGift` helt:

```js
vyraTopGift=function(w){if(w.giftFrame)return klassiskTopGift(w);
  let style=w.theme||'royal';
  return `<div class="widget vyra-topgift premium-topgift topgift-${style}…`}
```

Den i `media.js` ser ut som originalet men betjänar bara ramgrenen, via `klassiskTopGift`. Den som
ändrar fel fil tror att ingenting hände.

## 3. Tre utgångar, och två av dem är tysta

| Väg | Vad som händer med en borttagen design |
|---|---|
| Katalogen skapar en ny | `pick()` **kastar**: *"Okänd premiumdesign … giltiga: …"* |
| Sparad widget **med** ram | `GIFT_FRAMES[w.giftFrame]` → undefined → faller till premiumgrenen, **ser annorlunda ut** |
| Sparad widget **utan** ram | klassen `topgift-<borttagen>` utan CSS → **struktur utan skinn** |

De två sista kraschar inte. De ser bara fel ut nästa gång någon laddar sin overlay — och det kan
vara mitt i en sändning. Det är hela risken med en gallring, och den är tyst.

## 4. Skyddsnätet: `topgift-pension.js`

Modulen pekar om en pensionerad design till en vi valt åt den, **innan** renderaren ser den. Den
laddas i premiumbunten direkt efter `premium-final.js`, alltså efter den renderare som faktiskt kör.

- **Tabellen är tom i dag, med flit.** Skyddsnätet byggdes före gallringen — annars hade den första
  borttagningen varit den som inte skyddades.
- **Den muterar inte widgeten.** Renderaren får en kopia. Streamerns val står kvar orört, så en
  design som tas tillbaka dyker upp igen av sig själv, och en felaktig pensionering går att ångra
  utan att någons data gått förlorad.
- **Den följer en kedja.** Pensioneras `a` till `b` och `b` senare till `c` hamnar en gammal `a`
  på `c`.
- **En orörd widget går rakt igenom**, utan objektkopia — det är det vanliga fallet, och det kör i
  varje bildruta.

## 5. Att pensionera en design — checklistan

1. **En rad i `topgift-pension.js`:** `'dark-raven': 'luna-mist'`.
2. **Ur `variants` i `widget-factory.js`** — annars går den fortfarande att välja, och streamerns
   nya val pekas om direkt efter att hon gjort det. Det vore värre än att inte gallra alls.
3. **CSS-reglerna** för designen.
4. **Referensbilden** `tests/visual/referenser/topgift_<nyckel>.png` och dess nyckel i vakten.
   Blir den kvar faller vakten på en nyckel som inte längre finns.
5. **Ramkonsten** `assets/topgift-frames/<namn>.png` — bara för ramar.
6. **Cachebust** på `widget-factory.js`, premiumbuntens `version` och `studio.css`. En borttagning
   kräver samma bumpning som ett tillägg; en cachad fil hade fortsatt erbjuda designen.

`tests/topgift-pension.test.js` (P1–P10) håller listan ärlig: varje pensionering måste peka på en
design som finns, ingen design får vara både levande och pensionerad, standardtemat `royal` får
aldrig pensioneras utan att defaulten i `premium-final.js` ändras i samma andetag, och inga cykler.

## 6. När aliaset kan tas bort

Efter en release eller två, när ingen rimligen har kvar en sparad layout med det gamla namnet. Då
tas raden ur `topgift-pension.js` och P2 slutar bry sig om namnet.
