# DAVID — överlämningen

Läs det här först, hela vägen, innan du rör en fil. Det är en överlämning mellan två sessioner:
det som står här är mätt, och det som inte står här är inte mätt.

## Var arbetet står

**Gren:** `guard/visuell-regression` · **PR:** #235, utkast · **Repo:** `davidyakoop88-hub/vyra-production`

En **visuell regressionsvakt** är byggd. Den bygger varje katalognyckel i riktigt overlay-läge,
väcker den om den är en alert, ställer den still, fotograferar den med transparent bakgrund och
jämför **pixel för pixel** mot en incheckad referensbild.

| | |
|---|---|
| Katalognycklar totalt | 181 |
| Jämförs pixel för pixel | **166** |
| Undantagna, var och en med en uppmätt orsak | 15 |
| Referensbilder incheckade | `tests/visual/referenser/`, 12 MB |
| Tagna på | `Google Chrome for Testing 151.0.7922.34` (chromium-1234) |
| Node-sviten | 1318/1318 |
| Browser-sviten | 481/481 |

## Det viktigaste att förstå innan du provar något

**Vakten går inte att köra lokalt, och det är meningen.** Referensbilderna gäller bara på exakt den
Chromium-build `package-lock.json` pinnar. Vakten läser manifestets versionssträng och vägrar
jämföra mot en annan build — annars hade den skyllt 166 fel på widgetarna när det i själva verket
var webbläsaren som bytts. `npm run test:visual` på en vanlig maskin ska alltså vägra. Allt provande
sker i CI, ~20–30 minuter per varv.

**Referenser skapas bara på ett ställe:** `.github/workflows/visuell-referenser.yml`. Kör den från
Actions med en motivering, eller pusha en commit vars meddelande innehåller `[referenser]`. Jobbet
fotograferar i tre webbläsarsessioner, kastar den första som uppvärmning, skriver bara det som
session 2 och 3 reproducerar identiskt, kör vakten mot resultatet, och committar först då.

**`VYRA_VISUELL_MOTIV` är obligatorisk** och hamnar i `historik.md`. En referens som går att byta
utan eftertanke är ingen vakt: nästa gång provet faller är den snabbaste vägen till grönt att skriva
om bilden, och då har ett larm bytts mot en tystnad.

## Tre uppgifter, i den här ordningen

### 1. Beslut: höj tröskeln från 1 till 6 av 255

Vakten föll i sin första riktiga körning på tre nycklar — alla mikroskopiska:

| Nyckel | Pixlar | Största kanalskillnad |
|---|---|---|
| `catalog:lastx:badge` | 1 av 196500 | 2 av 255 |
| `catalog:lastx:stack` | 6 av 212925 | 6 av 255 |
| `catalog:topstreak:frame:crystal-spire` | 1 av 114600 | 5 av 255 |

Referensjobbet krävde att session 2 och 3 var **exakt** identiska, och det var de för alla 166. Men
en fjärde session, i ett annat jobb på en annan löpare, skiljer sig på enstaka pixlar. Tröskeln
1/255 kalibrerades på en enda observation och var för snäv.

**Gör så här:** höj `KANALTROSKEL` i `tests/helpers/visuell.js` till 6, uppdatera kontrollprovet i
`tests/visual/visuell-regression.browser.test.js` så att det fäller vid 7 i stället för 2, skriv
mätningen ovan som skälet i koden, pusha och bekräfta att CI blir grön.

Tröskeln är **ingen procenttolerans** — skillnaden är hela poängen. En procenttolerans är en budget
som ett riktigt fel kan gömma sig i. Den här säger att färger inom 6/255 är samma färg, och det
finns ingen budget: en enda pixel som skiljer 7 fäller provet.

### 2. Mutationsprov: faller vakten när en widget ändras?

Ändra en CSS-regel som bara ett fåtal nycklar använder — `border-color` i `.topgift-sakura` i
`studio.css` är ett bra val. Pusha. Verifiera i CI att **exakt** de nycklar som använder regeln
faller, med diffbild och siffror, och att de övriga förblir gröna. Återställ sedan.

Den andra halvan är minst lika viktig som den första: en vakt som fäller allt är lika värdelös som
en som inte fäller något.

### 3. Mutationsprov: är det jämförelsen som fångar det?

Mutera `JAMFOR` i `tests/helpers/visuell.js` åt båda hållen:

- alltid "olika" → **alla 166** ska falla (bevisar att varje nyckel verkligen jämförs, ingen hoppas över tyst)
- alltid "identisk" + en verklig CSS-ändring → provet ska bli **grönt** (bevisar att det är jämförelsen som fångar ändringen, inte något annat)

Återställ efteråt.

**När alla tre är klara: ta PR #235 ur utkastläge.** Inte innan — tills mutationerna är gjorda är
det obevisat att vakten faktiskt kan falla.

## Vad som är undantaget, och varför

15 nycklar har ingen referens. Varje post i `UTAN_REFERENS` (`tests/helpers/katalognycklar.js`) bär
sin mätning:

| Undantag | Antal | Orsak |
|---|---|---|
| `catalog:custom:image` / `:video` | 2 | tomma behållare som väntar på användarens egen fil (0,4 % / 0,2 % målat) |
| `catalog:giftfireworks:` | 3 | partiklar på en Pixi-duk med egen ticker; duken är tom vid varje fast tidpunkt |
| `catalog:glovesnipe:` | 8 | effekten är H.264-video, och provets Chromium saknar kodeken |
| `catalog:likefountain` | 1 | ständig rörelse: 22 olika bildrutor på 12 s, ingen kom igen |
| `catalog:giftjar:heart` | 1 | **orsak inte fastställd** |

Ett undantag är ett hål i täckningen. Listan har ett tak i provet så att den ska göra ont att växa,
och varje ny post måste bära en **mätning**, inte ett "gick inte".

## Två saker ingen automat kan svara på

**Glove Snipe.** `canPlayType('video/mp4; codecs="avc1.42E01E")` svarar tomt i provets Chromium och
videon faller med `DEMUXER_ERROR_NO_SUPPORTED_STREAMS`. Chrome och OBS har kodeken, så mätningen
säger ingenting om huruvida de spelar där. Det är punkt 7 i `docs/live-verifiering.md`, att läsa av i
OBS före sändning.

**`catalog:giftjar:heart`.** Växlar på CI mellan exakt två renderingar: 115 av 87000 pixlar, alltid
inom exakt samma 232×34 px vid (13,254), alltid med kanalskillnad 18 — samma siffror i fyra
körningar. Lokalt är den helt stabil: tio ombyggnader gav en enda bild, två skilda sessioner gav 0 av
87000, hundra sekunders väntan ändrade ingenting. De övriga sex Gift Jar-varianterna reproducerar.
Bandet ligger vid burkens fyllnadsnivå, och en hypotes är att nivån speglar hopsamlat gåvotillstånd
från tidigare triggade alerts — men det är en **hypotes, inte en mätning**, och den står som en sådan.
Fyra CI-cykler lades på den innan den lades åt sidan.

## Fyra mätfel i riggen som redan är rättade — rör dem inte utan att läsa varför

| Fel | Hur det såg ut | Vad det var |
|---|---|---|
| Mätt före första bildrutan | 2 av 100 foton gav 221×221 och opacitet 0, olika nyckel varje gång | en CSS-animation skapas i bildrutans *update animations*-steg; dessförinnan är `getAnimations()` tom. 221 = 340 × 0,65 — `vyraAppear` på sin första bildruta |
| Pseudoelementen missades | 6 nycklar rörde sig efter frysningen; diffen var ett 302×6 px band | `getAnimations()` tar inte med `::before`/`::after` — bara `{subtree: true}` |
| Fryst utifrån en klassdriven koreografi | Guardian Emblem: 0 % målat vid alla nio tidpunkter, 66–82 % levande | JS-klockan byter fasklasser; att spola animationerna till en annan tidpunkt ger en omöjlig kombination. Löst via familjens egen utbytbara klocka, se `REGI` |
| Typsnitt som inte hunnit laddas | en textrad fick två utseenden, kanalskillnad 18 | glyferna skiljer sig **och** textbredden ändras, vilket förskjuter allt efter den → `document.fonts.ready` |

De två första är skrivna som **§12 och §13 i `docs/tech-debt.md`** — de gäller alla browserprov i
repot, inte bara den här vakten.

## Läs vidare

- `docs/VYRA_PROJECT_STATE.md` — checkpoint 41 överst, hela mätningen och alla sex CI-cyklerna
- `CLAUDE-HANDOFF.md` — avsnittet "Den visuella vakten"
- `tests/visual/referenser/README.md` — uppdateringsflödet och undantagstabellen
- `docs/tech-debt.md` §12 och §13

## Arbetsordningen som gäller

Ingen kod utan en röd baslinje först. Ingen fix utan en mätning som visar buggen. Ingen vakt utan ett
mutationsprov som visar att den kan falla. Ingen commit utan grön svit. Rapportera allt oväntat,
även det som inte passar in i bilden — särskilt det.
