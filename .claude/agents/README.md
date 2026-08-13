# Agentkartan

En agent per doman. Varje fil i repot har exakt en agare, och `.claude/domaner.json` ar
sanningen om vem det ar. Agentfilerna har beskriver *hur* varje doman ska behandlas.

## Hitta ratt agent

```bash
node scripts/domaner.js agare media.js      # vem ager den har filen?
node scripts/domaner.js lista               # alla domaner
node scripts/domaner.js visa widgets        # allt om en doman
```

## Domanerna

| Doman | Agent | Ansvar |
|---|---|---|
| `studio-core` | `vyra-studio-core` | SPA-skalet: state, vyer, render/bind, navigation, zoom, snapp, historik |
| `widgets` | `vyra-widgets` | Widgetkatalogen: renderare, fabrik, defaults, kort, alla widgetfamiljer |
| `ui-design` | `vyra-ui-design` | Tokens, typografi, farger, premiumutseende, gemensam CSS |
| `action-event` | `vyra-action-event` | Actions, events, tio scener, timers, media, simulator, poang |
| `overlay` | `vyra-overlay` | OBS-utgangen: transparens, scenlankar, atkomst, sanering |
| `live` | `vyra-live` | Handelseflodet in: polling, dedupe, routing, leaderboards |
| `recognition` | `vyra-recognition` | Recognition-pipelinen: normalizer, merge, ko, controller, kort |
| `vfx` | `vyra-vfx` | Partikelmotorn pa Pixi/GSAP, fontaner, Gift Fireworks |
| `goals` | `vyra-goals` | Mal fran widget till databas: klient, runtime, ingest, SSE, metrik |
| `konto` | `vyra-konto` | Inloggning, MFA, sessionsisolering, tokenvalv, support |
| `betalning` | `vyra-betalning` | Stripe, prenumerationer, entitlements, trial |
| `moln` | `vyra-moln` | Molnsynk, konflikter, media, backup, export mellan datorer |
| `integrationer` | `vyra-integrationer` | TTS, ljud, Spotify, OBS, chatbot |
| `server-api` | `vyra-server` | Node-API:t: rutter, handelsebuss, SSE, kapacitet, statistik |
| `tiktok-bridge` | `vyra-bridge` | Riktig TikTok LIVE: anslutning, proxy, normalisering |
| `desktop` | `vyra-desktop` | Electron-appen, uppdateringar, Windows-installeraren |
| `assets` | `vyra-assets` | Bilder, ramar, videor, ljud, teman, Blender-verktyg |
| `test-qa` | `vyra-test` | Testriggen: harnesses, fixtures, mock-backend, Playwright |
| `prestanda` | `vyra-prestanda` | Latens, lasttester, artefaktbudget, fore/efter-siffror |
| `drift` | `vyra-drift` | Docker, Caddy, CI, slapportar, backup, utrullning |
| `docs` | `vyra-docs` | Arkitektur, roadmap, tech-debt, katalogkarta, domankarta |

## Regler som galler alla agenter

1. **Hall dig inom ditt agarskap.** Behover du en andring i en annan doman: sag vad som
   behovs och lamna over, andra inte sjalv.
2. **Kor domanens tester innan du sager att du ar klar** -
   `node scripts/domaner.js test <doman>`.
3. **En andring i taget.** Bevara befintliga funktioner. Inga stora omskrivningar av
   fungerande delar pa eget initiativ.
4. **Mat nar det ar en prestandafraga** - `node scripts/domaner.js matt <doman>`, och alltid
   mot en baslinje.
5. **Aldrig hemligheter i frontendfiler.**
6. **Flyttar du filer**: uppdatera `.claude/domaner.json` i samma andring. `tests/domankarta.test.js`
   faller annars.

## Lagga till en ny doman

1. Lagg posten i `.claude/domaner.json` (`id`, `namn`, `agent`, `syfte`, `filer`, `tester`,
   `matning`, `risker`).
2. Skapa `.claude/agents/<agent>.md` med samma `name` som `agent`-faltet.
3. Lagg raden i tabellen ovan.
4. Kor `node scripts/domaner.js luckor` och `node --test tests/domankarta.test.js`.
