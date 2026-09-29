# VYRA — arbetsordning

VYRA är en byggstegsfri webbapp (vanlig HTML/CSS/JS) för TikTok Live och OBS: en
overlay-studio med widgets, Action & Event, scener och transparent overlay-output. Runt den
finns ett moln-API (`server/`), en TikTok-brygga (`tiktok-bridge/`) och en Electron-app
(`electron-app/`).

Ingångar: `index.html` (publik sida), `studio.html` (appen), `overlay.html` → `studio.html?overlay=1`
(OBS-utgången).

## Repot är uppdelat i domäner — en domän, en ägare, en agent

`.claude/domaner.json` är sanningen om vem som äger vad. Varje fil i repotroten har exakt en
ägare. `tests/domankarta.test.js` ser till att det förblir sant.

```bash
node scripts/domaner.js lista            # alla 21 domäner med agent, filantal, testantal
node scripts/domaner.js agare media.js   # vem äger den här filen?
node scripts/domaner.js visa widgets     # syfte, filer, tester, mätningar, risker
node scripts/domaner.js test widgets     # kör bara den domänens tester
node scripts/domaner.js matt vfx         # storlek, största filer, egna mätningar
node scripts/domaner.js luckor           # filer utan ägare eller med två ägare
```

Agenterna ligger i `.claude/agents/` — en per domän, med domänens regler, tester och gränser.
Tabellen över alla domäner finns i `.claude/agents/README.md`.

Slash-kommandon: `/fixa <uppgift>`, `/byt <del>`, `/mat <domän>`, `/agare <fil>`,
`/david` — överlämningen: var arbetet står, vad som är bevisat och vad som står på tur.

## Så arbetar vi

1. **Hitta ägaren först.** Ta reda på vilken domän ändringen tillhör innan du rör en fil, och
   lämna över till den domänens agent.
2. **En ändring i taget.** Bevara befintliga funktioner. Inga stora omskrivningar av
   fungerande delar på eget initiativ.
3. **Kör domänens tester innan något kallas klart.**
4. **Mät istället för att gissa** när frågan är prestanda — alltid mot en baslinje.
5. **Uppdatera kartan i samma ändring** när filer tillkommer, flyttas eller försvinner.

## Regler som gäller hela repot

- `studio.js` är minifierad handkod. Ändra den aldrig direkt — nya beteenden monkey-patchar
  `render`/`bind`/`props`/`wh` från en syskonfil, laddad via skript-svansen i `media.js`.
- Studio och overlay är samma sida i två lägen. En dold widget ska finnas kvar i lagret men
  aldrig renderas i overlay-output, och overlayen har transparent bakgrund utan studio-chrome.
- Action skapas först; Event väljer sedan vilken Action som triggas och i vilken scen. Varje
  scen har egen overlay-länk och egen online/offline-status.
- Händelsekontraktet delas mellan `tiktok-bridge/`, `server/` och klienten. Ändra aldrig ett
  fältnamn ensidigt.
- Aldrig `.env`, API-nycklar eller hemligheter i frontendfiler.
- Svenska i UI-text (`tests/sprak-vakt.test.js` vaktar det).

## Testkommandon

**Installera först — fyra paket, fyra egna `node_modules`.** Repot är inte en workspace: roten,
`server/`, `tiktok-bridge/` och `electron-app/` har varsin `package.json` och varsitt lås. Saknas
ett av dem faller den sviten med `Cannot find module`, och CI är **grön för exakt samma kod**
eftersom den kör `npm ci` i alla fyra.

```bash
npm ci && (cd server && npm ci) && (cd tiktok-bridge && npm ci) && (cd electron-app && npm ci)
```

Det kostade en kväll 2026-09-15 innan någon läste felmeddelandet: tre prov i bryggan och sex i
skrivbordsappen rapporterades som "kända fel" när de bara var oinstallerade paket (#425). Ett prov
som är rött lokalt och grönt i CI lär en att sluta lita på rött — och nästa gång det faller av ett
**riktigt** skäl går det obemärkt förbi. Kontrollera alltså `node_modules` innan ett lokalt fel
antas vara ett fel i koden.

```bash
npm test                    # alla node-tester i roten            (~4 min)
npm run test:browser        # jsdom/browser-tester                (~42 min, se nedan)
npm run test:browser:skarva -- 1 4   # bara del 1 av 4 — det CI kör, ~10 min
npm run test:skript         # scripts/test/ — källvakter mot server/index.js m.fl.
npm run test:ci             # kontrakt + fuzz + allt
npm run karta               # regenerera docs/katalogkarta.md
node scripts/domaner.js test <domän>   # bara en domän
cd server && npm test           # moln-API:t; utan Postgres + Redis hoppas ~460 prov över
cd tiktok-bridge && npm test    # bryggan
cd electron-app && npm test     # skrivbordsappen
```

⚠️ **`npm test` täcker bara `tests/`.** `scripts/test/` körs av `test:skript` och innehåller
källvakter som läser `server/index.js` och andra filer och pinnar exakta rader — de faller alltså av
en omdöpning som inte ändrar något beteende. De körs i CI (`test-client`), så en ändring i en
vaktad fil kan vara grön lokalt och röd i CI utan att något är fel i koden. `npm run test:ci` kör
allt: kontrakt, fuzz, `tests/`, `scripts/test/` och browser-sviten.

⏱ **`test:browser` tar drygt 40 minuter och är TYST under tiden.** Loggen kan stå stilla länge utan
att något är fel. **Tystnad är inte bevis på hängning.** Rör ändringen bara några filer: kör de prov
som faktiskt täcker dem (`grep -rl <fil> tests/`) i stället för hela sviten.

Stycket ovan sa tidigare att sviten tar över en timme och att tyngsta steget var *"Visuell · alla
katalognycklar mot referens"*. **Bägge var fel.** Uppmätt 2026-09-23 i körning 1bcc763e, hela
`test-client` 70 min 28 s:

| steg | tid |
|---|---|
| `npm ci` + kontrakt + fuzz + `npm test` + skript | 1 min 31 s |
| **`test:browser`** | **57 min 44 s** — 82 % av jobbet |
| pinnad Chromium + `test:visual:rigg` + `test:visual` | 9 min 24 s |
| coverage | 1 min 44 s |

Den visuella vakten var alltså åtta minuter, inte tyngsta steget — fel med en faktor sju. Och de tre
snabba sviterna, där de flesta fel fångas, låg **bakom** båda: ett stavfel i en kontraktsfil tog
sjuttio minuter att få veta om.

Därför kör `test-client` numera som **tre parallella jobb**: node-sviterna svarar på ~4 min,
`test-client-webblasare` skarvar `test:browser` i fyra delar (`scripts/browser-skarva.js`, packade
efter uppmätt vikt i `tests/browser-tider.json`), och `test-visuell` kör pixelvakten odelad — den
har nolltolerans och tål inte att bilderna jämförs på flera maskiner. Väggklockan är ~10 min i
stället för 70. `tests/browser-skarvning.test.js` vaktar att delarna täcker katalogen exakt en gång.

## Inför en riktig sändning

`docs/live-verifiering.md` listar det som **inte går att avgöra utan en riktig TikTok LIVE-match** —
fyra ställen i battle-kedjan där koden idag gissar, med exakt vad som ska läsas av i loggen och i
konsolen. Läs den före sändningen, fyll i den efteråt.

## Läs vidare

- `docs/VYRA_PROJECT_STATE.md` — **börja här.** Senaste checkpointen överst säger var arbetet
  står, vilka invarianter som inte får brytas och vad nästa steg är
- `docs/VYRA_ARCHITECTURE.md` — hur systemet faktiskt ser ut idag, med utskrivna gap
- `docs/katalogkarta.md` — genererad sanning om widgetkatalogen
- `docs/VYRA_MASTER_ROADMAP.md` — vad som är planerat, och i vilken ordning
- `docs/tech-debt.md` — känd skuld
- `CLAUDE-HANDOFF.md` — projektöverlämningen
