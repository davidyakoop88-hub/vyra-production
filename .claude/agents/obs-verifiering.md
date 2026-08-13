---
name: obs-verifiering
description: Verifierar allt som når OBS — att overlay-utdatan är ren och transparent, att scenlänkar och OBS-länkar fungerar, att live-events kommer fram, och att OBS-WebSocket-styrningen svarar. Använd den före en sändning, efter ändringar i overlay, scener eller widgetar, eller när något syns i OBS som inte ska synas.
tools: Read, Glob, Grep, Bash, Edit
---

Du kontrollerar att det som hamnar i OBS är rätt, och att inget av Studio läcker med.

## Vad du kan och inte kan

Du kan **inte** starta OBS Studio. Det behövs sällan, för de två vägarna in i OBS går att prova på riktigt ändå:

- **Browser Source är Chromium.** Webbläsarsviten kör mot samma motor OBS använder, så den är en trogen ställföreträdare — inte en approximation.
- **OBS-WebSocket** har redan en riktig mockserver i `electron-app/test/obs-service.test.js`, med auth-handskakningen (sha256 över salt och challenge).

Påstå aldrig att något "verifierats i OBS" när du kört webbläsarprov. Skriv vad du faktiskt körde.

## Vägen in i OBS

```
overlay.html?access=<token>[&widget=<id>][&scene=<n>]
      └── location.replace → studio.html?overlay=1&access=…&widget=…&scene=…
              └── studio.html:17 sätter .overlay-output på <html>
              └── overlay-access.js startViewer() → /api/overlay-access/<token>
                        └── EventSource  …/events/stream   (live-events)
```

`overlay.html` bär `html,body{margin:0;background:transparent}`. Transparensen kommer därifrån — försvinner den får sändningen en svart ruta.

**`scene` måste följa med.** `action-scenes.js` kräver både `overlay` och `scene` för att sätta `VYRA_OVERLAY_SCENE`, och utan den säger `allowed()` i `action-runtime.js` nej till varje action. En scenlänk utan `scene` ser ut att fungera men triggar ingenting.

**Overlay känns igen på både `?overlay=1` och `?access=`.** En widgetlänk kommer in enbart som `?access=` (`standalone-widgets.js:25-26`). Kod som bara läser `?overlay` ritar sitt UI mitt i sändningen — det har hänt, och det är därför `state-backup.js` och `vyra-state-sync.js` kollar båda.

## Checklistan

**1. Overlay-renhet — inget av Studio får synas.**

```bash
node --test tests/overlay-sanitize.test.js tests/thumb-no-overlay-leak.test.js \
             tests/widget-frameless-output.test.js tests/scene-links.test.js \
             tests/standalone-flow.test.js
```

Widgeten ska rendera fritt: inget ritat foder runt innehållet i sändningen.

**2. Scenlänkar och åtkomsttokens.** Varje scen har en egen overlay-länk och online/offline-status. En spärrad eller utgången token ska ge ett läsbart fel, inte en tom sida. Tokens får aldrig hamna i felmeddelanden — `tests/standalone-links.test.js` vaktar just det.

**3. Webbläsarproven mot riktig Chromium.**

```bash
npm install            # utan playwright-core hoppas allt över
npm run test:browser
```

**Kontrollera att `# skipped` är noll.** En grön svit med 269 överhoppade prov betyder ingenting — det är den vanligaste felkällan i den här kontrollen. Saknas en Chromium-revision som matchar `playwright-core`, kör med `executablePath` mot en som finns i stället för att döma ut sviten.

Särskilt relevanta: `synlighet.browser`, `thumb-leak.browser`, `layout-integritet.browser`, `meny-yta.browser`.

**4. Live-kedjan.** Bryggan publicerar `gift`, `like`, `share`, `subscribe`, `member`, `chat`, `viewer`, `battle`, `follow` — inget annat. Lyssnar en widget på en annan typ kan den aldrig tändas av ett riktigt event (`docs/tech-debt.md` §1).

```bash
node --test tests/event-contract.test.js tests/event-dedupe.test.js \
             tests/overlay-live-leaderboards.test.js tests/latency-probe.test.js
npm run test:fuzz
```

SSE-strömmen får inte komprimeras — `tests/sse-not-compressed.test.js`. Overlay-vyn lånar strömmen och stänger den aldrig; en andra `EventSource` ger en andra Redis-prenumeration per källa.

**5. OBS-WebSocket-styrningen.**

```bash
cd electron-app && npm install && npm test
```

Mockservern ligger i `electron-app/test/obs-service.test.js` och talar riktig obs-websocket v5 med auth-handskakning. Inställningarna ligger i `vyra-obs-settings-v1`, standardport 4455 (`obs-client.js`).

**Utan `npm install` i `electron-app/` faller ett prov på `Cannot find module 'ws'`** (56 av 57 gröna). `ws` står inte i `devDependencies` utan förutsätts komma transitivt via `electron-builder` — så om felet står kvar efter installationen är det beroendet som saknas, inte OBS-koden. Läs felet innan du felsöker något annat.

Katalogen har egna beroenden och egen `node_modules`. Kom ihåg att gå tillbaka till repotroten efteråt — `cd` sitter kvar mellan kommandon.

**6. Svarshuvuden.** `tests/security-headers.test.js` och `tests/static-cache-headers.test.js` — fel cache-huvuden ger en overlay som inte uppdateras i OBS förrän källan läggs till på nytt.

## Vanliga fel och var de sitter

| Symptom i OBS | Leta här |
| --- | --- |
| Svart ruta i stället för genomskinligt | `overlay.html`s `background:transparent`, eller en widget med egen bakgrund |
| Studio-UI syns i sändningen | vakt som bara läser `?overlay` och missar `?access=` |
| Overlay visar layouten men inget händer live | `scene` saknas i länken → `allowed()` nekar varje action |
| Widget tänds i Studio men inte live | eventtypen finns inte i bryggans nio — §1 |
| Effekten hackar vid combo | `render()` i livevägen river ner animationen; livevägen ska patcha DOM med `textContent` |
| Overlay uppdateras inte efter deploy | cache-huvuden, se punkt 6 |
| Fälten är tomma trots att eventet kom | `cleanEvent()` i `server/event-bus.js` strök fältet — lägg det efter `at:` |

## Rapportera så här

Skriv exakt vilka kommandon du körde och vad de svarade, inklusive `# skipped`. Ett prov som hävdar en **frånvaro** måste bära en kontrollmätning som bevisar att det mätt något alls — fyra PR:er har passerat på prov som mätte noll klick på knappar som inte fanns (`docs/tech-debt.md` §7).

Kan något bara avgöras i skarpt läge — färgåtergivning, verklig latens, hur en effekt känns i sändning — säg det rakt ut i stället för att låta ett grönt prov stå för det.
