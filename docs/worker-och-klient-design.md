# Worker + klientens livesession-hantering — design (före kod)

Status: **design för godkännande.** Ingen kod. Ingen miljöflagga ändras; `VYRA_SANDNINGSIDENTITET`
förblir osatt. Servermodellen (#268) och bryggan (#269) ligger dormant på main och rörs inte i sak
— denna PR bygger de två sista blocken före aktiveringsbeslutet.

---

## Del A · Outbox-workern

### Uppmätt nuläge (main `0e3fbc0`)

| Fråga | Mätt svar |
|---|---|
| Var startas/stoppas bakgrundsprocesser? | Allt i `require.main===module`-blocket, index.js:509–510: `notificationWorker` (setInterval 30 s, `.unref()`), `startRuntimeMonitor`, `startCapacityMonitor`, `mediaCleanup` (15 min), `GoalRuntime.startAppliedDrain` (returnerar `{stop}`), `authCleanup` (1 h). Mönstret: en startfunktion som returnerar stopp, registrerad i shutdown. |
| Hur ägs EventBus? | Singleton `const eventBus = new EventBus(REDIS_URL)` index.js:25; exporteras; stängs i shutdown via `eventBus.close()`. |
| Graceful shutdown? | index.js:510: `shutdown(signal)` → stoppar monitorer/intervaller → `server.close(async ⇒ Promise.allSettled([pool.end(), eventBus.close(), mediaStorage.close()]))` → hård utgång efter `SHUTDOWN_TIMEOUT_MS` (10 s, unref:ad). |
| Health/metrics? | `/api/health` (byggd av `buildHealthStatus`), `/health/ready` (skrivprob), `/api/internal/metrics` bakom `METRICS_TOKEN`; `metrics`-objektet exporteras och fylls fält för fält. |
| Samtidiga instanser? | Railway kör 1 replica — men **deploy-överlapp ger två processer** tills nya är healthy (samma mätning som gav bryggans 409-design). Design måste tåla N instanser. |
| Publiceringsadapter? | Redan bevisad i #268: `publiceraUtkorg({sand, workerId, nu, logg, metric, antal})` äger claim (`FOR UPDATE SKIP LOCKED` + per-workspace-ordning + lease) och `publiceraTillBuss(eventBus, rad)` → `publishInternal` (event-bus.js:85). Workern är bara en **pulsgivare**. |

### Design: `server/stream-worker.js`

`startStreamWorker({pool, eventBus, metrics, logg, intervallMs=1000, antal=20})` → `{stop}`.

- **Flaggan:** startas i `require.main`-blocket **endast** när `process.env.VYRA_SANDNINGSIDENTITET === '1'`.
  Av ⇒ funktionen anropas aldrig: ingen timer, ingen pollning, inget claim, ingen Redis-publicering
  (flagga-av-smoken från #268 bevakar redan detta i CI: en planterad utkorgsrad förblir orörd).
- **Ingen överlappande loop:** självschemalagd `setTimeout`-kedja (inte `setInterval`) — nästa
  varv bokas först när det förra är klart; en `pagaende`-flagga är hängslen ovanpå.
- **Varvet:** anropar `publiceraUtkorg` med `sand: rad => publiceraTillBuss(eventBus, rad)` och
  `workerId = hostname+pid+slump`. Fler instanser är ofarliga per konstruktion: claim-frågan äger
  ägarskapet, ägarvillkoret skyddar varje skrivning, och en kraschad instans lämnar sin rad
  återtagbar när leasen (30 s) löper ut — allt redan mutationsbevisat i #268.
- **Fel stoppar aldrig servern:** varje varv i try/catch; Redis-/PG-fel loggas (`[utkorg-worker]`,
  aldrig payload eller token) och ger backoff 1→30 s på pollen; `publiceraUtkorg`s inre
  retry/park-semantik är orörd.
- **Shutdown:** `stop()` sätter stoppflaggan (inga nya varv/claims), väntar **begränsat**
  (min(5 s, kvarvarande shutdownbudget)) på pågående varv, och kopplas in i shutdown-kedjan FÖRE
  `pool.end()`/`eventBus.close()` i `server.close`-callbacken.
- **Metrics/logg:** räknare i `metrics.utkorg = {publicerade, forsok, parkerade, senastPublicerad}`
  — exponeras via `/api/internal/metrics` (bakom token). En parkering loggas som
  `[utkorg-worker][error] rad parkerad workspace=<id> eventId=<id> forsok=8` — id:n, aldrig payload.

### Prov (`server/test/stream-worker.test.js` — **eget steg i Postgres-jobbets explicita filnamnslista**)

1. Flagga av → `startStreamWorker` anropas aldrig från index.js (källkodsvakt + flagga-av-smoken
   utökas med en workerpuls-kontroll); modulen själv: `stop()` utan start är ofarlig.
2. Två workers (två `startStreamWorker` med olika workerId, injicerad klocka) publicerar aldrig
   samma rad: summan av `sand`-anrop per eventId = 1.
3. Shutdown mitt i publicering: långsam `sand` (kontrollerad promise) + `stop()` → varvet får
   göras klart, inget nytt claim, `stop()` löser inom budgeten.
4. Redis nere: `sand` kastar → raden får retry med backoff (via `publiceraUtkorg`s bevisade väg),
   servern/loopen lever, och när `sand` friskförklaras publiceras raden.
5. Utgången lease återtas: rad claimad av "kraschad" worker (lease_until i det förflutna via
   injicerad klocka) plockas av den levande.
6. end(old) publiceras före start(new) — ordningsvillkoret genom workerns puls (X-provens
   scenario, nu genom den riktiga loopen).
7. Poison/parkerad rad blockerar senare rader **endast i samma workspace**; andra workspaces
   fortsätter (befintligt X4-scenario genom workern).

---

## Del B · Klientens livesession-hantering

### Uppmätt nuläge — leveranskedjan finns redan

- Overlaybootstrap: `GET /api/overlay-access/<token>` → `{overlay:{id, state, version}}`
  (index.js:246, token-auth, endast GET). Klienten (overlay-access.js:16) hämtar, applicerar,
  öppnar `EventSource(/api/overlay-access/<token>/events/stream)`.
- SSE-filtret (goal-sse.js `sseChunk`): mål-ramar overlay-scopas, konfig-ramar likaså — men
  **varje `{event, streamId}`-post skickas som `event: live` till alla strömmar i workspacet**,
  och klientens `source.addEventListener('live', …) → VyraLive.ingest(event)` tar emot dem.
  `publishInternal` lägger internramarna på samma kanal ⇒ **`live:start`/`live:end` når redan
  varje OBS-källa och Studio-canvasen utan någon ny transport.**
- Konfig-omhämtning utan omladdning finns (`konfigSync` + `vyra-live-repaint`-signalen).

### Uppmätt statinventering och beslut per modul

| Modul | Uppmätt state | Beslut vid ny session |
|---|---|---|
| goal-client.js | serverägd (epoch/revision; absoluta frames; snapshot vid SSE-reopen) | **lämnas** — serverresetten (#268) äger detta; provet verifierar att epoch-bytet målar om |
| media.js gift campaign (`templateGiftCampaign`) | overlay-state på servern (`giftCurrentN`) | **hämtas om**: serverresetten har redan nollat på servern; klientens `live:start`-hanterare gör konfig-omhämtning + `vyra-live-repaint` |
| live-leaderboard.js | minnesräknare + 4 localStorage-poster | **nollställs i minnet**; periodval/inställningar i localStorage lämnas |
| last-x-alerts.js | rullande lista i minnet (0 storage) | **nollställs** |
| battle-mvp-session.js | Map + 5 localStorage-poster | **nollställs i minnet**; inställningar lämnas |
| tts-chat.js | kö + Set (8 storage-referenser) | **kön töms** (gamla LIVE:ns kommentarer ska inte läsas upp); röst-/volyminställningar lämnas |
| recognition-kedjan (queue/controller) | minneskö | **kön töms** |
| streaks (extras.js/action-event.js) | minnesräknare | **nollställs** |
| event-dedupe.js | id-lista + localStorage | **lämnas** — eventId:n är globalt unika; en ny session skapar inga kollisioner |
| **VyraPoints/viewer-levels (localStorage)** | poängliggare | **orörd** tills separat produktbeslut — uttryckligen utanför |

### Uppstartsluckan — auktoritativt snapshot

`GET /api/overlay-access/<token>` får ett nytt fält:

```json
{ "overlay": { … }, "session": { "sessionId": "<uuid>", "startedAt": "<iso>" } }
```

- `session` är `null` när ingen aktiv session finns (= alltid med flaggan av: tabellerna är tomma,
  fältet kostar en indexslagning mot pekaren).
- Härledning: token → overlay → workspace → `stream_session_pointer` ⋈ `stream_sessions`
  (`ended_at IS NULL`). **Endast `sessionId` + `startedAt` exponeras — aldrig workspaceId,
  accountKey, bridgeRunId, roomId eller token.** Samma fält i Studio-canvasens motsvarande
  bootstrap (cloud-sync-vägen) i en senare fas om det behövs; overlayn är den kritiska.

### Ny klientmodul: `live-session-client.js`

Äger EN sak: *vilken session har jag senast behandlat* — i **sessionStorage**
(`vyra-live-session-behandlad`), aldrig localStorage. sessionStorage är per browserkälla, så
olika OBS-källor och Studio-flikar kan aldrig blockera varandras reset.

Kontraktet (allt provat):

1. Bootstrap-snapshot **och** `live:start`-ram går genom samma funktion `behandla({sessionId,
   startedAt})`: nytt sessionId ⇒ (a) skriv sessionStorage, (b) `dispatchEvent(new CustomEvent(
   'vyra-live-session', {detail:{sessionId, startedAt}}))` — modulerna ovan lyssnar och nollställer
   sitt eget state, (c) konfig-omhämtning + `vyra-live-repaint`.
2. Samma sessionId igen (retry, SSE-replay, återanslutning till samma LIVE) ⇒ idempotent no-op.
3. Två SSE-ramar med olika transport-id (`id:`-raden) men samma `eventId` ⇒ en logisk behandling
   — dedupen är `sessionId`/`eventId`, aldrig streamId.
4. Reload efter start ⇒ snapshotet i bootstrap-svaret ger samma `behandla`-väg — eventet behövs
   inte.
5. `live:end` markerar bara "aktiv session avslutad" **om** dess sessionId matchar den behandlade
   — ett end(old) som anländer efter start(new) är en no-op (sessionId skiljer).
6. Ingen sidomladdning någonsin; transparent overlay och individuella `?widget=`-länkar berörs
   inte (signalen bär inget DOM; `VYRA_OVERLAY`-vakten och widgetfiltret är orörda — inga
   Studio-chrome- eller accessfält i overlay-output).
7. Utan snapshot-fält och utan livesession-ramar (= flaggan av) är modulen helt inert.

### Prov (körs i `npm test`-sviten + browserriggen)

- live-session-client enhetsprov: kontraktspunkterna 1–5 och 7 med fejkad sessionStorage/eventyta.
- Modullyssnarna: per modul ett prov att `vyra-live-session` tömmer exakt rätt state och inte rör
  inställningar/VyraPoints (mutationsbart: ta bort lyssnaren ⇒ provet faller).
- Snapshotrutten (Postgres-jobbet): fältets form, null-fallet, tokenfel exponerar inget,
  fältsvepning (aldrig workspaceId/roomId/accountKey/bridgeRunId), och att transparent
  overlay-/widgetlänk-render är byteidentisk utan aktiv session.
- Overlayläckagevakten (#264-metoden): `vyra-live-session` får inte montera något i DOM.

---

## Planerade filer

| Fil | Ändring |
|---|---|
| `server/stream-worker.js` | **ny** — pulsgivaren |
| `server/index.js` | flagg-gated workerstart + stop i shutdown; `session`-fältet i overlay-access-GET |
| `server/Dockerfile` | `stream-worker.js` i COPY-listan |
| `.github/workflows/goal-runtime-postgres.yml` | steget `Utkorgsworkern` + snapshotprovsteg |
| `server/test/stream-worker.test.js`, `server/test/overlay-session-snapshot.test.js` | **nya** |
| `live-session-client.js` | **ny** — sessionsdedupen och signalen |
| `overlay-access.js` | snapshot → `behandla(...)` vid bootstrap |
| `live-leaderboard.js`, `last-x-alerts.js`, `battle-mvp-session.js`, `tts-chat.js`, recognition-kedjan, `extras.js`, `media.js` | en `vyra-live-session`-lyssnare var som nollställer eget state |
| `tests/live-session-client.test.js` + per-modulprov | **nya** |
| `.claude/domaner.json` | nya filer till rätt domäner |

## Utrullningsordning

1. **Fas 1 (intern): workern** — rött → grönt → mutationer (claim-dubblering, shutdown-läcka,
   flagg-gaten, backoff). Dormant: startas inte utan flaggan.
2. **Fas 2 (intern): klienten + snapshotfältet** — rött → grönt → mutationer (dedupe bort,
   lyssnare bort, snapshotfält läcker). Inert: snapshot är null och inga ramar kommer med
   flaggan av.
3. PR:n squash-mergas **dormant** efter godkännande — beteendet i produktion är oförändrat,
   bevisat av flagga-av-proven.
4. **Aktiveringen är ett eget beslut**: `VYRA_SANDNINGSIDENTITET=1` på vyra-production (worker +
   maskinrutter) och tiktok-manager (bryggan), i den ordningen, med egen verifieringsrunda.

Ingen aktivering eller merge utan uttryckligt godkännande.
