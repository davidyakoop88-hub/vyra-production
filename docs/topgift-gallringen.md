# Top Gift — så gallras designerna säkert

Top Gift hade **40 designer**. Det var för många. Det här dokumentet säger hur en design tas bort
utan att någons sändning ser fel ut, och vad som redan tagits bort.

**Gjort 2026-09-23**, på Davids begäran — *"för mycket och tråkigt design"*:

| Vad | Antal | Kvar |
|---|---|---|
| Ramgruppen `topgift.frame` | 7 | 33 |
| VYRA ORIGINAL: `topgift.theme` + `topgift.extra` | 12 | **21** |

### Elva av de tolv var dubbletter

Det viktigaste fyndet i hela gallringen, uppmätt innan något togs bort: `catalog:topgift:royal` och
`catalog:topgift:premium:royal` byggde widgetar med **exakt samma `theme`**. Och det är `theme` som
avgör skinnet — `premium-final.js` ritar `topgift-${w.theme||'royal'}`. Det enda som skilde var
förvald bredd (280 mot 340), rubriktext och accentfärg.

Katalogen visade alltså samma design två gånger. Elva av de tolv hade en premiumtvilling med samma
namn; den tolfte, `coronation`, var den enda där en design faktiskt försvann.

**Gamla nycklar leder vidare.** `catalog:topgift:royal` pekar nu på sin tvilling i premiumtabellen.
Det bryter inte mot fabrikens regel *"never quietly resolve to another design"* — det är inte en
annan design, det är samma skinn med andra förvalda mått. Ett namn utan tvilling kastar som förut.

**Skinnen är kvar i CSS:en.** Premiumdesignerna använder samma `topgift-<tema>`-klasser, så ingen
sparad widget ändrar utseende. Även `coronation` ritas som förut för den som redan har en — den går
bara inte att skapa längre.

Ett prov som fanns sedan tidigare ställde precis den här frågan: *"Skulle de ge samma sak vore den
ena familjen överflödig, och då är det bättre att veta det."* Det gjorde sitt jobb, och svaret blev
ja.

Allt som står som **uppmätt** är läst ur koden 2026-09-23.

---

## 1. Var de bor

Alla fyra grupperna ligger i **en** tabell: `variants` i `widget-factory.js`. Det gör en
borttagning till en dataändring, inte en kodändring.

| Grupp | Nyckel i `variants` | Antal |
|---|---|---|
| Premium | `topgift.premium` | 21 — allt som är kvar |
| ~~Ramar~~ | ~~`topgift.frame`~~ | **borttagna 2026-09-23** |
| ~~Extra~~ | ~~`topgift.extra`~~ | **borttagna 2026-09-23** |
| ~~Klassiska~~ | ~~`topgift.theme`~~ | **borttagna 2026-09-23** |

Varje design har en referensbild i `tests/visual/referenser/topgift_*.png`. Ramarna hade dessutom
konst i `assets/topgift-frames/` — den katalogen finns inte längre.

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

- **Skyddsnätet byggdes före gallringen** — annars hade den första borttagningen varit den som
  inte skyddades. Tabellen bär i dag de sju ramarna, var och en som en **avframning**: `giftFrame`
  töms och `theme` sätts till `royal`. En ram är nämligen en egen GREN i renderaren
  (`if (w.giftFrame) return klassiskTopGift(w)`), inte ett annat skinn på samma gren — en ram som
  pekats på ett temanamn hade fallit igenom ändå, men av en slump och inte av ett beslut.
- **Ramens accentfärg följer med**, men bara om streamern inte valt en egen. Den ramade grenen föll
  tillbaka på ramens färg; premiumgrenen faller tillbaka på guld. Utan den raden hade sju lila och
  rosa widgetar blivit gula.
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
