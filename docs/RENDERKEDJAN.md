# Renderkedjan — hur `wh`, `props` och `bind` staplas

**Senast verifierad:** 2026-09-17 mot `origin/main` @ `5439096`
**Metod:** källäsning + mätning i riktig Chromium (Playwright)

`studio.js` är minifierad handkod och ändras aldrig direkt. Allt nytt beteende
**monkey-patchar** fyra globala funktioner från en syskonfil. Det är projektets
centrala mekanism, och den som orsakar de flesta svårhittade felen.

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

Fyra kedjor finns:

| Kedja | Bygger | Omslag (uppmätt 2026-09-17) |
|---|---|---|
| `wh` | Widgetens HTML | **36** |
| `props` | Egenskapspanelen | **38** |
| `bind` | Händelsekopplingar | **92** |
| `render` | Hela vyn | (ingår i ovanstående) |

`media.js` ensam bär 24 av de 36 `wh`-omslagen.

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
| **UI-text** | `'7 MODELLER'`, `'Liggande · 4 på rad'` | Etiketter redigeras ofta — stavfel, omformulering, nya val |
| **Cachebust** | `'…/${id}.png?v=2'` | Cachebustar bumpas rutinmässigt |
| **Struktur** | `'<div class="'`, `'style="'` | Robust så länge markupen inte ordnas om |

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

## 5. Regler

- **Lägg aldrig till ett omslag utan att veta vad som körs efter det.** Din
  indata kan redan vara omskriven.
- **Matcha aldrig på UI-text.** Den redigeras. Matcha på `id`, `data-`-attribut
  eller klassnamn.
- **Matcha aldrig på en cachebust.** Bumpar någon den försvinner din ändring tyst.
- **Muterar du `w` innan du delegerar — skriv en kommentar om vad som blir
  blint.** Rad 345 och 512 har det; följ dem.
- **Ett omslag som lagar en annan fils utdata är ett plåster.** Laga källan i
  stället när du kan, och ta bort plåstret i samma ändring.

---

## Relaterat

- `CLAUDE.md` — arbetsordning och domänmodell
- `.claude/domaner.json` — vem äger vilken fil (`node scripts/domaner.js agare <fil>`)
- `docs/HANDELSEKARTA.md` — händelserna som driver kedjan
- `docs/VYRA_ARCHITECTURE.md` — systemets form i stort
