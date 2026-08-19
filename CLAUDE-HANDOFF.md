# VYRA – projektöverlämning

> Arbetsordningen och domänindelningen står i `CLAUDE.md`. Där finns kartan över vem som äger
> vad (`.claude/domaner.json`), en agent per domän (`.claude/agents/`) och kommandona för att
> köra eller mäta en enskild domän (`node scripts/domaner.js`). Den här filen beskriver
> projektet självt.

## Projektet

VYRA är en lokal webbapp för TikTok Live/OBS med en overlay-studio, widgets, Action & Event, scener och transparent overlay-output. Projektet är byggt i vanlig HTML, CSS och JavaScript utan ett obligatoriskt byggsteg.

## Viktigaste sidorna

- `index.html` – publik startsida.
- `studio.html` – huvudappen och redigeraren.
- `overlay.html` – transparent output för OBS/TikTok Studio.

## Viktigaste kodfilerna

- `studio.js`, `studio.css` – studio, canvas, widgets och redigering.
- `media.js`, `extras.js` – widgetbibliotek och extra beteenden.
- `action-event.js`, `action-event-advanced.js`, `action-options.js` – Action & Event-gränssnittet.
- `action-runtime.js`, `action-scenes.js`, `action-media.js` – körning, upp till tio scener och media.
- `gift-fireworks.js`, `gift-fireworks.css` – Gift Fireworks.
- `profile-frames-premium.js`, `profile-frames-premium.css` – profilramar.
- `overview-premium.js`, `overview-premium.css` – översiktens premiumutseende.
- `live-client.js`, `studio-live.js` – live-/eventanslutning.
- `tiktok-bridge/` – fristående Node.js-tjänst som ansluter till en riktig TikTok LIVE-sändning (via det oofficiella biblioteket `tiktok-live-connector`, eftersom TikTok inte har någon publik API för detta) och vidarebefordrar gåvor/följare/likes/chatt till `server.ps1`:s `/api/events`. Se `ANSLUT-TIKTOK-LIVE.cmd`.
- `electron-app/` – paketerar hela appen som en riktig skrivbords-`.exe` (Electron): en splash-skärm medan `server.ps1` startas i bakgrunden, sedan ett eget appfönster utan webbläsarchrome mot `studio.html`. Bygg med `cd electron-app && npm run build` (kräver `npm install` första gången) → `electron-app/dist/VYRA-Setup.exe`. `STARTA-HEMSIDAN.cmd` kopierar den byggda filen till projektroten om den finns (bygger inte om automatiskt — det är ett manuellt steg).
- `vyra-state-sync.js` – exporterar och importerar hela Studio-state (localStorage) som en JSON-fil, så att scener, widgets och Action & Event kan flyttas mellan datorer. Fristående och laddad sist i `studio.html`; knapparna matas in i Installningar-vyn. Ritar inget i overlay-läge (`?overlay=1` eller `?access=`), och maskin-/workspace-bundna nycklar följer aldrig med i exporten.
- `setup-dator2.ps1` – sätter upp en andra dator: kontrollerar verktyg, fixar Git-PATH, klonar repot och installerar ECC-paketet för Claude Code.
- `assets/` – bilder, teman, presenter och andra resurser.

## Starta lokalt

På Windows kan `STARTA-HEMSIDAN.cmd` användas. Alternativt kan en lokal statisk server startas i projektmappen och `studio.html` öppnas. Projektet har senast använts på `http://127.0.0.1:4173/studio.html`.

Nedladdningsknapparna på `index.html` pekar på `VYRA-Setup.exe`, som byggs från `electron-app/` (se ovan) — inte en zip-fil.

För en riktig TikTok LIVE-anslutning (inte demoläge): kör `ANSLUT-TIKTOK-LIVE.cmd <ditt-tiktok-anvandarnamn>` samtidigt som servern körs. Kräver Node.js — en portabel version finns i `.tools/` (inte i git) och är redan lagd till i PATH.

Öppna inte bara `studio.html` via `file://` när funktioner behöver lokal lagring, media eller overlay-kommunikation.

## Läget just nu (2026-08-19)

Senaste arbetet står i `docs/VYRA_PROJECT_STATE.md`, checkpoint 40 överst. I korthet:

- **Guardian Emblem** (`templateGuardianEmblem`) är byggd och i produktion — fyra praktsteg, en PNG
  per steg plus en geometritabell, samma mönster som `'battlemvp.frame'`. Grafiken ligger i
  `assets/guardian-emblem/`, designen och alla mätvärden i `docs/referens/guardian-emblem.md`.
- **Hela widgetkatalogen är mätt i overlay-läge** — 181 nycklar, 133 synliga i vila, 48 som triggas
  och spelar färdigt, noll fel. Vaktat av `tests/browser/overlay-alla-widgets.browser.test.js`.
- **Bryggtriggern för Guardian är förberedd men inte aktiverad.** Sök `GUARDIAN — FORBEREDD` i
  `tiktok-bridge/bridge.js`. Den väntar på att en riktig sändning visar vilket TikTok-event som bär
  Guardian-status — se `docs/live-verifiering.md` punkt 6.

## Viktigt för fortsatt arbete

- Bevara befintliga funktioner och ändra en widget i taget.
- Studio och overlay delar tillstånd via webbläsarens lokala lagring och meddelanden mellan flikar.
- En dold widget ska finnas kvar i lagret men inte renderas i overlay-output.
- Action skapas först; Event väljer sedan vilken Action som ska triggas och i vilken scen.
- Varje scen har en separat overlay-länk och online/offline-status.
- Overlay-output ska ha transparent bakgrund. Studio-gränssnittet ska inte synas i OBS-länken.
- Lägg aldrig `.env`, API-nycklar eller hemligheter i frontendfiler.
- **En alert måste ha ett viloläge.** Utan `opacity:0` tills sin aktiveringsklass sätts ligger den
  kvar på skärmen hela sändningen i stället för att dyka upp när något händer. Testa alltid i
  `?overlay=1` och inte bara i editorn — de två lägena visar olika saker med flit.
- **En cachebust-sträng får inte namnge det den bustar.** Den ska svara på NÄR filen byttes, inte på
  VAD som låg i den; annars blir den ett arkeologiskt spår efter kod som tagits bort. Vaktat.
- **Sessionen kör i molnet och når varken din disk eller dina chattbilagor.** En fil når en Claude
  Code-session bara om den ligger i repot — inte via en sökväg på din dator, ett fil-ID eller en
  bilaga i ett GitHub-issue.

## Filer som inte ligger i kodarkivet

Avsiktligt utelämnade: `.env`, Git-historik, lokala verktyg/cachar, stora råvideor samt genererade rendersekvenser. De behövs inte för att läsa eller fortsätta utveckla koden. Kopiera dem separat om originalmedierna också ska flyttas.

## Bra första uppgift i Claude

Läs först `CLAUDE-HANDOFF.md`, `studio.html`, `studio.js`, `studio.css`, `media.js` och Action & Event-filerna. Kartlägg därefter beroendena innan du ändrar något. Gör små ändringar, kontrollera både Studio och `overlay.html`, och undvik stora omskrivningar av fungerande delar.
