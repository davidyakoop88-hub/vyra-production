# Renderkedjan — hur `wh`, `props` och `bind` staplas

**Senast verifierad:** 2026-09-17 mot `origin/main` @ `ec0074f` (hela auditen, block 2–4)
**Metod:** källäsning + mätning i riktig Chromium (Playwright)

`studio.js` är minifierad handkod och ändras aldrig direkt. Allt nytt beteende
**monkey-patchar** globala funktioner från en syskonfil. Det är projektets
centrala mekanism, och den som orsakar de flesta svårhittade felen.

Mekanismen har **två former**, och skillnaden mellan dem avgör vad som överlever när
en senare fil tar över en widget. Båda beskrivs nedan — stapling i §1–§4, överskrivning
i §5.

Det här dokumentet förklarar mekaniken, körordningen, och hur man spårar en död
kodväg. Vem som äger vilken fil står i `.claude/domaner.json` — inte här.

---

## 1. Mönstret

```js
const foregaende = wh;                  // fånga den nuvarande kedjan
wh = function (w) {                     // ersätt den
  let html = foregaende(w);             // anropa det du fångade
  if (w.type !== 'minWidget') return html;
  return html.replace('…', '…');        // och lägg på ditt eget
};
```

**Fem** staplade kedjor finns — inte fyra, som det stått här tidigare:

| Kedja | Bygger | Omslag (uppmätt 2026-09-17) |
|---|---|---|
| `wh` | Widgetens HTML | **36** |
| `props` | Egenskapspanelen | **38** |
| `bind` | Händelsekopplingar | **92** |
| `send` | Testknappens live-simulering | **4** (alla i `media.js`) |
| `render` | Hela vyn | (ingår i ovanstående) |

`media.js` ensam bär 24 av de 36 `wh`-omslagen.

`send` kedjas på exakt samma sätt (`const föregående=send;send=function(){föregående();…}`)
och alla fyra omslagen gör det korrekt. Den står med här för att den inte ska komma som
en överraskning, inte för att den är trasig.

---

## 2. KÖRORDNINGEN ÄR OMVÄND MOT LADDNINGSORDNINGEN

**Den sist definierade funktionen körs först.**

Laddar `studio.html` filerna A, B, C i den ordningen, så gäller:

```
Anropet går:      C  →  B  →  A  →  studio.js basversion
Efterbehandling:  A  →  B  →  C
```

C fångade B, som fångade A. Alltså anropar C först B, som anropar A. Men C:s
egen `.replace()` körs **sist**, på HTML som alla tre producerat.

Det ger två helt olika sorters beroende, och de går åt olika håll:

- **Vad du får in** (`w`) kommer från den som definierades **efter** dig.
- **Vad du ändrar i utdata** läggs ovanpå det alla definierade **före** dig gjort.

Laddningsordningen i `studio.html` (44 skript) och i skript-svansen i `media.js`
är därför bärande logik, inte en detalj.

---

## 3. Två sätt en kedja går sönder

### Mönster A — indata är redan omskriven

Ett omslag som muterar widgeten innan det delegerar gör varje tidigare definierat
omslag blint för det ursprungliga värdet.

**Bekräftat exempel — `media.js:345`:**

```js
wh = function (w) {
  return professionalFrameResetWh(
    ['templateTopGift','templateTopStreak','templateTopLike'].includes(w.type)
      ? { ...w, profileFrame: 'none' }        // <- skriver om indata
      : w);
};
```

`media.js:344` är definierad **före** och läser `w.profileFrame`:

```js
html.replaceAll('<img style=', '<img class="profile-frame frame-' + (w.profileFrame || 'none') + '" style=');
```

Rad 345 körs först och sätter alltid `'none'` för Top Like. Uttrycket
`(w.profileFrame || 'none')` på rad 344 kan därför **bara någonsin ge
`frame-none`**. Det ser ut att göra något. Det gör det inte.

**Bekräftat exempel 2 — `media.js:512`:** Top Coins och Top Points återanvänder
Top Likes renderare genom att skriva om `type` till `templateTopLike` innan de
delegerar. **8 av de 9 omslag som definieras före rad 512 läser `w.type`** och
ser alltså inte den riktiga typen. Det är avsiktligt och fungerar — men ett nytt
omslag som placeras mellan rad 345 och 512 och specialbehandlar `templateTopLike`
kommer tyst att träffa Top Coins och Top Points också.

### Mönster B — strängkoppling mellan filer

Ett omslag som söker efter en literal som en **annan fil** skrev är kopplat till
den filens exakta utdata. Ändras literalen slutar matchningen — tyst, för
`String.replace()` på en icke-träff returnerar strängen oförändrad. Inget fel,
ingen varning, ingenting i konsolen.

25 sådana ersättningar finns i `wh`-kedjan. De delar upp sig i tre klasser, från
farligast till minst farlig:

| Klass | Exempel | Varför |
|---|---|---|
| **UI-text** | *(ingen kvar i repot)* | Etiketter redigeras ofta — stavfel, omformulering, nya val |
| **Cachebust** | *(ingen kvar i repot)* | Cachebustar bumpas rutinmässigt |
| **Struktur** | `'<div class="'`, `'style="'` | Robust så länge markupen inte ordnas om |

Cachebust-klassen hade **en** medlem: `toplike-studio.js` lagade ramarnas sökväg genom att
matcha literalen `.png?v=2` som `media.js` skrev. En rutinmässig bump där hade tyst tagit
bort 19 av 53 ramar. Den är borttagen — `media.js` slår numera upp filnamnet i
`VYRA_FRAME_FILES`, och `tests/browser/toplike-ramar-laddar.browser.test.js` vaktar att
sökvägen byggs rätt från början i stället för att lagas i efterhand.

**UI-textklassen är tömd.** De fyra omslag som matchade på etiketter matchar nu ankare
som `media.js` sänder ut med flit: `data-jar-modeller` (gåvoburkens etikett),
`data-ge-prakt` och `data-ge-steg` (guardianpanelen). För kampanjens orientering behövdes
ingen ändring i `media.js` — `select#campaignOrientation` och `option[value]` fanns redan,
så omslaget matchade på texten i onödan.

Etiketten `'Liggande · 4 på rad'` står på **två** ställen — i panelen (`:558`) och i
katalogen (`:1031`). Det var därför textmatchning inte gick att vakta utan att nåla fast
antalet förekomster: ändrades bara panelens förblev provet grönt medan panelen tappade sin
ersättning. `tests/korsfilskopplingar.test.js` bygger numera panelen på riktigt och låter
DOM:en svara på om ersättningen landade. Varje koppling är mutationsprovad från båda håll:
ankaret borttaget ur `media.js`, och konsumentens matchning bruten.

---

## 4. Så spårar du en misstänkt död kodväg

1. **Hitta omslagets radnummer.**
   `grep -n "wh *= *function" *.js`

2. **Lista allt som definieras EFTER det i samma fil, och alla filer som laddas
   efter.** De kör före ditt omslag och kan ha skrivit om `w`.

3. **Sök efter mutationer av indata.**
   `grep -n "{\.\.\.w," media.js` — varje träff är ett fält som tidigare omslag
   inte längre ser i original.

4. **Mät i webbläsaren, läs inte bara koden.** Det här är inte valfritt: under
   den här auditen läste jag `media.js:352`, såg hårdkodat `.png`, drog
   slutsatsen att 19 ramar var trasiga — och mätningen visade att de laddade
   utmärkt, för en senare fil skrev om sökvägen. Källäsning ensam ger fel svar
   i en kedja med 36 lager.

   Mall: `tests/browser/toplike-ramar-laddar.browser.test.js`

5. **Mutationsprova varje vakt du skriver.** Bryt det du tror att vakten fångar
   och se den falla. En vakt som aldrig setts röd vet du ingenting om.

---

## 5. Den andra formen: en namngiven renderare skrivs över

En senare fil behöver inte lägga sig i kedjan alls. Den kan i stället **ersätta funktionen
som kedjan anropar**:

```js
// premium-final.js
vyraTopGift = function (w) { … };     // ingen `const föregående`, ingen delegering
```

| Funktion | Deklarerad i | Skrivs över av |
|---|---|---|
| `vyraTopGift` | `media.js` | `premium-final.js:39` |
| `vyraStreak` | `media.js` | `premium-final.js:36` |
| `socialGoalHtml` | `media.js` | `premium-final.js:41` |
| `battleMvpHtml` | `media.js` | `battle-mvp-celebrations.js:8` |
| `routeLiveBattleEvent` | `media.js` | `last-x-alerts.js:412` |
| `home` | `studio.js` | `overview-premium.js:1` |
| `go` | `studio.js` | `layout-safe.js:202` |
| `analytics` | `studio.js` | `stream-time-analytics.js:82` |
| `enhanceWidgetCatalog` | `extras.js` | `media.js:103` |

### Varför skillnaden mellan formerna spelar roll

**Formen avgör vad som överlever när en senare fil tar över en widgettyp.** Uppmätt under
auditen, på samma tre typer (`templateTopGift`, `templateTopStreak`, `templateSocialGoal`):

- `media.js`:s **props**-omslag byggde panelens HTML **inline**. När `premium-final.js:45`
  avslutade props-kedjan för de typerna blev de **onåbara** — fyra omslag och 29
  bindningar dödades tyst. De togs bort i PR #450.
- `media.js`:s **wh**-omslag anropar en **namngiven funktion**: `media.js:123` är bara
  `return w.type==='templateTopGift' ? vyraTopGift(w) : prototypeWh(w)`. Sen bindning gör
  att anropet automatiskt hamnar hos premiumversionen. De är därför **fullt levande**.

Samma fil, samma typer, motsatt utfall — av formen allena.

### Regeln

**Bygger du HTML inline i ett omslag är du sårbar för att någon avslutar kedjan efter dig.
Anropar du en namngiven renderare är du det inte.** Delegera till en namngiven funktion när
widgeten kan komma att få en premiumvariant.

Och: en överskrivning **syns inte** när du läser den fil som deklarerar funktionen. Sök
alltid på `<namn> *= *function` i hela repot innan du tror att du läst renderaren.

---

## 6. Regler

- **Lägg aldrig till ett omslag utan att veta vad som körs efter det.** Din
  indata kan redan vara omskriven.
- **Matcha aldrig på UI-text.** Den redigeras. Matcha på `id`, `data-`-attribut
  eller klassnamn.
- **Matcha aldrig på en cachebust.** Bumpar någon den försvinner din ändring tyst.
- **Muterar du `w` innan du delegerar — skriv en kommentar om vad som blir
  blint.** Rad 345 och 512 har det; följ dem.
- **En namngiven renderare kan vara överskriven av en annan fil.** Läs §5 innan du tror
  att du vet vilken implementation som körs.
- **Ett omslag som lagar en annan fils utdata är ett plåster.** Laga källan i
  stället när du kan, och ta bort plåstret i samma ändring.

---

---

## Relaterat

- `CLAUDE.md` — arbetsordning och domänmodell
- `.claude/domaner.json` — vem äger vilken fil (`node scripts/domaner.js agare <fil>`)
- `docs/HANDELSEKARTA.md` — händelserna som driver kedjan
- `docs/VYRA_ARCHITECTURE.md` — systemets form i stort
