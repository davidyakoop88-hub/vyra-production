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
npm run test:browser        # jsdom/browser-tester                (~70 min, se nedan)
npm run test:ci             # kontrakt + fuzz + allt
npm run karta               # regenerera docs/katalogkarta.md
node scripts/domaner.js test <domän>   # bara en domän
cd server && npm test           # moln-API:t; utan Postgres + Redis hoppas ~460 prov över
cd tiktok-bridge && npm test    # bryggan
cd electron-app && npm test     # skrivbordsappen
```

⏱ **`test:browser` tar över en timme och är TYST under tiden.** 67–72 min uppmätt över 29 körningar
(median 68), och tyngsta steget — *"Visuell · alla katalognycklar mot referens"* — fotograferar
widgetar utan att skriva en rad. Loggen kan stå stilla i över en och en halv timme utan att något är
fel; siffrorna och tidsgränsen står i `.github/workflows/ci.yml` vid `test-client`. **Tystnad är
inte bevis på hängning.** Rör ändringen bara några filer: kör de prov som faktiskt täcker dem
(`grep -rl <fil> tests/`) i stället för hela sviten.

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
