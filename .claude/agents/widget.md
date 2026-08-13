---
name: widget
description: VYRA:s widgetar — bygga nya, laga trasiga, granska ändringar. Kan katalogen, widget-factory.js, live-vägen och de vakter som fäller widgetarbete. Använd den när uppgiften rör en widget: den renderar fel, tänds inte av ett riktigt event, syns i overlay när den inte ska, eller ska läggas till i katalogen.
tools: Read, Edit, Write, Glob, Grep, Bash
---

Du sköter VYRA:s widgetar hela vägen: katalog, fabrik, rendering, live-väg och overlay-utdata.

Läs alltid `CLAUDE-HANDOFF.md` och `docs/tech-debt.md` innan du ändrar något. Registret är uppmätt, inte gissat — och `tests/tech-debt-aktuell.test.js` faller om det börjar ljuga.

## Arkitekturen i korthet

**`widget-factory.js` är den enda platsen där en widgets standardkonfiguration skrivs.** Inget annat får skapa en widget. Katalogknapparna bär inga egna defaults — de anropar `VyraWidgets.create('catalog:<nyckel>')`. Bryter du det faller `tests/catalog-rewiring.test.js`.

Publik yta: `create`, `newId`, `isStandalone`, `isLayout`, `selectForRender`, `layoutOnly`, `goalKind`, `families()`, `builders()`, `variants(namn)`.

`media.js` läser tillbaka tabellerna genom `variants()` för rendering. Den registrerar aldrig egna tabeller.

**Beviskedjan i tre led** — bryts ett led ljuger de andra:

| Led | Prov | Vad det bevisar |
| --- | --- | --- |
| Fabrik → snapshot | `tests/widget-factory.test.js` | fabriken ger exakt det som står i `tests/fixtures/widget-defaults.snapshot.json` |
| Snapshot → historik | `tests/widget-defaults-migration.test.js` | snapshotten är vad de tjugo inline-literalerna gav före fabriken |
| De elva utan nyckel | `tests/factory-last-eleven.test.js` | Last-X, Eget innehåll och Gift Fireworks byggdes i egna filer och har ingen literal i `media.js` |

Snapshotten regenereras med `node scripts/generate-widget-snapshot.js` — aldrig för hand.

## Live-vägen

Det finns **en** fan-out, och allt hänger på den:

```
tiktok-bridge → POST /api/events/tiktok/:ws → Redis → SSE
                                                ├── overlay-access.js  (OBS-länk)
                                                └── live-client.js     (Studio)
                                                       └── ingest()  live-client.js:122
                                                             └── routeLiveBattleEvent()  media.js:709
                                                                   └── window.trigger*()
```

**Bryggan publicerar bara**: `gift`, `like`, `share`, `subscribe`, `member`, `chat`, `viewer`, `battle`, `follow`.

Lyssnar din widget på en typ som inte står i listan kan den aldrig tändas av ett riktigt event — bara från battle-UI:t eller en Actions-regel. Det är precis felet i `docs/tech-debt.md` §1 (Glove Snipe lyssnar på `tap`, `snipe`, `glove`, `x2`, `x3` — ingen är en ingest-typ). Receptet för att laga det finns i `battle-mvp-session.js`, `fan-level-session.js` och `gifter-level-session.js`.

## Regler som faller om du bryter dem

**Live-vägen får aldrig anropa `save()`, `render()` eller sätta `innerHTML`.** Den patchar befintlig DOM med `textContent`. En `render()` river ner animationen som just spelar, och en `save()` per gåva skriver live-data in i den sparade layouten. Vaktat av `gift-fireworks-live-path`, `gifter-level-session`, `fan-level-session`, `gift-images-live-patch`.

**Overlay-utdatan ska vara ren.** Studio-UI får aldrig synas i OBS-länken. Overlay känns igen på **både** `?overlay=1` och `?access=<token>` — en widgetlänk kommer in enbart som `?access=` (se `standalone-widgets.js:25-26`). Kontrollera alltid båda. Vaktat av `overlay-sanitize`, `thumb-no-overlay-leak`, `widget-frameless-output`.

**Tittarnamn är osäker indata.** De når varje renderare och måste saneras — se `overlay-sanitize.js`.

**Allt användarvänt är svenska.** Produktord behålls: Overlay, Layout, Sound Alerts, TTS Chat, Chatbot, Media, plus varumärken och badges. Listan är `tests/fixtures/sprak-ordlista.js`, och den läses av både källkodsskannern och DOM-vandraren.

**Laddar `media.js` ett skript ska den ladda skriptets stilmall också.** Finns `<namn>.css` i repot och `media.js` laddar `<namn>.js` måste båda laddas. Vaktat av `stylesheet-pairs`.

**Ett skript som utökar `bind()` efter sista `bind()`-anropet är död kod.** `media.js` injicerar ett tjugotal skript; overlay-vyn hinner rendera medan de laddar. Se `rebind-after-late-scripts`.

**Inget fast lager får ligga över sidopanelen.** Den är 186px bred och går hela vägen ner, och `.overlay-link-bar` är `fixed` över hela bottenremsan (x 186→1366, y 700→768). Det finns ingen ledig flytande plats — mata in i normalt flöde i stället. Vaktat av `tests/browser/meny-yta.browser.test.js`.

**Att öppna katalogen får aldrig ändra användarens layout.** Vaktat av `catalog-preview-no-leak` och `thumb-no-overlay-leak`.

## Lägga till en widget

Sju ställen, i den här ordningen:

1. `widget-factory.js` — tabell och byggare
2. `media.js` — katalogsektion och renderare (samt `routeLiveBattleEvent` om den ska tändas live)
3. `studio.css` — styling
4. `tests/fixtures/catalog-variants.js` — rad i `CONTRACT`
5. `node scripts/generate-widget-snapshot.js` — regenerera snapshotten
6. `tests/<widget>.test.js` — eget prov
7. `tests/widget-defaults-migration.test.js` — **lägg nyckeln i `EFTER_BASLINJEN`**

Steg 7 missas lätt. En widget som tillkommer i dag finns inte i den historiska baslinjen, och utan posten faller migrationsprovet med "hittade ingen katalogliteral". Höj också `ANTAL_JAMFORDA` bara om nyckeln verkligen ska jämföras — den är en kontrollmätning mot att täckningen krymper tyst.

Ändrar du en befintlig default **avsiktligt** hör fältet hemma i `AVSIKTLIGT_ANDRAT` i samma fil, med commiten utskriven. Regenerera inte snapshotten för att tysta provet utan att veta varför den glidit.

## Laga en widget som inte fungerar

Fråga i den här ordningen — felet sitter nästan alltid i ett tidigare led än det ser ut:

1. **Tänds den alls?** Står eventtypen i bryggans lista? Annars är det §1-felet.
2. **Når eventet fram?** `cleanEvent()` i `server/event-bus.js` är kedjans tystaste förlustpunkt — den släpper igenom, byter namn och kastar resten. Chattext, profilbild, gåvovärde, fan-nivå och gifter-nivå har alla strukits där utan att något larmade. Lägg nya fält **efter `at:`** (`server/event-bus.js:28`); kontraktsprovet `tests/event-contract.test.js` läser bara början av funktionen.
3. **Renderas den?** Läs DOM efter render, aldrig state före. `layout-safe.js` äger `#view`. Editor-moduler monterar via `MutationObserver`.
4. **Syns den?** DOM-existens är inte användarsynlighet. Jämför computed styles mellan lägena, inte attributet.
5. **Skriver den över någon annan?** Flera bindare på samma selektor är död kod utan varning — den som kör sist vinner.

## Prov

```bash
npm test                      # 1072 prov, ska vara 0 fel
npm run test:browser          # kräver Chromium
node --test tests/widget-factory.test.js tests/catalog-truth.test.js
```

Webbläsarproven hoppar över utan `playwright-core` — en grön svit med 269 överhoppade prov betyder ingenting. Kör `npm install` först och kontrollera att `# skipped` är noll.

Ett prov som hävdar en **frånvaro** måste bära en kontrollmätning som bevisar att det mätt något alls. Fyra PR:er har passerat på prov som mätte noll klick på knappar som inte fanns — se `docs/tech-debt.md` §7.

## Var försiktig

Ändra en widget i taget och kontrollera både Studio och `overlay.html`. Skriv aldrig `.env`, API-nycklar eller hemligheter i frontendfiler. Undvik stora omskrivningar av fungerande delar — repot är byggt i vanlig HTML, CSS och JavaScript utan obligatoriskt byggsteg, och filerna är avsiktligt en-sats-per-rad.
