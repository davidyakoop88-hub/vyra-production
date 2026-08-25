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
- **Exakta tal (Davids punkt 6):** pollintervall **1000 ms**, batch **20 rader/varv**
  (`antal`-parametern till `publiceraUtkorg`). Max shutdown-väntan **5 s** — hälften av serverns
  hårda 10 s-utgång (`SHUTDOWN_TIMEOUT_MS`), så pool/eventBus alltid hinner stängas efteråt; ett
  varv som ändå överges lämnar sin rad bakom leasen (30 s) och återtas av nästa instans via
  claim-frågan — övergivande är förlustfritt per #268-bevisen.
- **Metrics:** `metrics.utkorg = {publicerade, forsok, parkerade, senastPublicerad}` (räknare) +
  mätarna `{pending, leased, parked}` uppdaterade per varv ur claim-frågans sidoräkning (en
  `count(*) FILTER`-fråga per poll). Allt via `/api/internal/metrics` bakom `METRICS_TOKEN`.
  **En parkerad rad är en synlig driftindikering**: `parked > 0` i metrics + loggrad
  `[utkorg-worker][error] rad parkerad workspace=<id> eventId=<id> forsok=8` — id:n, aldrig
  payload eller token — och den blockerar per den bevisade ordningsregeln ENDAST sitt eget
  workspace (X4-provet körs genom workern).

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
| goal-client.js | serverägd men sista ramen bor i minnet (store, :46); repaint ritar bara om det gamla | **hämtas om** — loadSnapshot() på vyra-live-session; revision avgör (se Målwidgeten nedan) |
| media.js gift campaign (`templateGiftCampaign`) | overlay-state på servern (`giftCurrentN`) | **hämtas om**: serverresetten har redan nollat på servern; klientens `live:start`-hanterare gör konfig-omhämtning + `vyra-live-repaint` |
| live-leaderboard.js | minnesräknare + 4 localStorage-poster | **nollställs i minnet**; periodval/inställningar i localStorage lämnas |
| last-x-alerts.js | rullande lista i minnet (0 storage) | **nollställs** |
| battle-mvp-session.js | Map + 5 localStorage-poster | **nollställs i minnet**; inställningar lämnas |
| tts-chat.js | kö + Set (8 storage-referenser) | **kön töms** (gamla LIVE:ns kommentarer ska inte läsas upp); röst-/volyminställningar lämnas |
| recognition-kedjan (queue/controller) | minneskö | **kön töms** |
| streaks (extras.js/action-event.js) | minnesräknare | **nollställs** |
| event-dedupe.js | id-lista + localStorage | **lämnas** — eventId:n är globalt unika; en ny session skapar inga kollisioner |
| **VyraPoints/viewer-levels (localStorage)** | poängliggare | **orörd** tills separat produktbeslut — uttryckligen utanför |

### Uppstartsluckan — auktoritativt snapshot, flaggmedvetet (Davids punkt 2)

`GET /api/overlay-access/<token>` får ett nytt fält — **endast när flaggan är på**:

```json
{ "overlay": { … }, "session": { "sessionId": "<uuid>", "startedAt": "<iso>" } }
```

- **Flaggan av ⇒ fältet UTELÄMNAS helt** och ingen sessionsfråga körs — svaret är byteidentiskt
  med dagens. Dormant klientkod kan därmed skilja "funktionen av" (fältet saknas) från
  "funktionen på men ingen LIVE" (`session: null`, auktoritativt).
- Flaggan på: `session: null` = auktoritativt ingen aktiv LIVE; `{sessionId, startedAt}` = aktiv.
- Härledning: token → overlay → workspace → `stream_session_pointer` ⋈ `stream_sessions`
  (`ended_at IS NULL`). **Endast `sessionId` + `startedAt` — aldrig workspaceId, accountKey,
  bridgeRunId, roomId eller token.** Dormant-provet körs mot HELA bootstrapvägen: flagga av ⇒
  fältet frånvarande, inga sessionStorage-skrivningar, ingen signal, inget rensat state.

### Ny klientmodul: `live-session-client.js`

**Dedupe och aktiv session är två olika saker (Davids punkt 1):**

- **Dedupen är per logisk händelse via `eventId`**: `live:start:<sessionId>` och
  `live:end:<sessionId>` är två olika händelser och behandlas var för sig — hade dedupen legat på
  `sessionId` ensamt hade endet ignorerats eftersom samma id redan setts vid starten.
- **`activeSessionId` är ett separat fält**: vilken session som är aktiv just nu (eller null).
- Snapshotet saknar eventId och behandlas som den **syntetiska logiska händelsen
  `live:start:<sessionId>`** — därmed går snapshot och SSE-ram genom exakt samma dedupe.

**sessionStorage-layout (Davids punkt 5):** två nycklar, aldrig localStorage:
`vyra-live-session-aktiv` (activeSessionId | '') och `vyra-live-session-hanterade` (JSON-lista av
eventId, **tak 16**, äldsta faller först — en sessionscykel är 2 eventId så taket rymmer åtta
cykler). sessionStorage är per browserkälla; provet kör TVÅ riggade källor på samma origin och
visar att den enas behandling aldrig blockerar den andras reset.

**Bootstrap/SSE-racet (Davids punkt 3) — uppmätt ordning:** overlay-access.js:16 hämtar och
`await`-applicerar bootstrapsvaret **innan** `new EventSource(...)` skapas — vid första laddning
är snapshotet strukturellt före varje ram. Racet finns i **återanslutnings-refetchen** (samma
GET körs om medan strömmen redan lever). Regeln som stänger det:

- Snapshot med `sessionId` ⇒ syntetiskt `live:start:<id>` genom dedupen (idempotent).
- **`session: null` är nedgraderande och accepteras ENDAST vid den initiala bootstrappen**
  (innan första ram behandlats). En senare refetch som svarar null ignoreras — endet ägs av
  `live:end`-ramen, och ett äldre null-snapshot kan därmed aldrig skriva över ett nyare start.
- Deterministiska prov: (a) snapshot null läses, därefter start-ram ⇒ aktiv; (b) start-ram
  anländer medan refetch väntar och refetchen svarar null ⇒ aktiv består; (c) snapshot visar ny
  session och replayen bär end(old)+start(new) ⇒ slutresultat new aktiv; (d) alla tre vägarna
  landar i samma `activeSessionId`.

**Kontraktet i övrigt** (oförändrat från förra varvet, nu uttryckt i eventId-termer):
`live:start:<ny>` ⇒ signalen `vyra-live-session` + konfig-omhämtning + `vyra-live-repaint`;
samma eventId igen (retry/replay/återanslutning till samma LIVE) ⇒ no-op; olika transport-id
(`id:`-raden) men samma eventId ⇒ en behandling; `live:end:<X>` nollar `activeSessionId` endast
om X === aktivt id — end(old) efter start(new) är en no-op; ingen omladdning; transparent
overlay och `?widget=`-länkar orörda; inga Studio-chrome-/accessfält i overlay-output.

### Målwidgeten — uppmätt och åtgärdad (Davids punkt 4)

Mätningen bekräftar luckan: goal-clientens `store` (Map widgetId→ram, goal-client.js:46) håller
sista ramen i minnet; **`vyra-live-repaint` ritar bara om den gamla ramen** (:303 — "rita om det
de redan har", ingen hämtning); serverresetten publicerar ingen ram, så en öppen widget behåller
föregående sessions progress tills nästa liveevent råkar knuffa den.

Åtgärden använder de två sakerna som redan finns och är bevisade:

- `resetWorkspaceGoals` bumpar `revision = revision + 1` (goal-runtime.js:321) — resetraden är
  strikt nyare i det enda ordningsbegrepp klienten lyder under.
- `loadSnapshot()` (goal-client.js:99) hämtar `/api/overlay-access/<token>/goals` och filtrerar
  mot `store` per revision — resetens rad vinner, och en förlorad kapplöpning är ofarlig
  (revision avgör).

**Design:** goal-client får en lyssnare på `vyra-live-session` som anropar `loadSnapshot()` —
den auktoritativa refetchen. Ingen ny mekanik: samma väg som varje SSE-reopen redan tar.
**Browserprov:** målwidget visar värde > 0 före start; `live:start`-ramen anländer; widgeten
visar serverns resetvärde (baseline/target kvar, progress 0, nya epoch/revision) **utan reload**.

### Statinventering per modul (oförändrad tabell från förra varvet)

goal-client **hämtas om** (refetch ovan — inte "lämnas": mätningen visade att repaint inte
räcker); gift campaign **hämtas om** (konfig-omhämtningen); leaderboard/last-X/battle-MVP/
TTS-kön/recognition-köerna/streaks **nollställs i minnet** via `vyra-live-session` (inställningar
lämnas); event-dedupe **lämnas**; **VyraPoints/localStorage orört** tills separat produktbeslut.

## KORRIGERING 2026-08-25 · nedgraderingsregeln var fel — generationsskydd i stället

Den ursprungliga regeln ("`session: null` accepteras ENDAST vid den initiala bootstrappen") stänger
racet, men den stänger också något som måste vara öppet. **Uppmätt lucka:**

1. En sändning pågår, klienten har `activeSessionId = X`.
2. SSE-strömmen tappas (nätglapp, OBS-källa i bakgrunden, serverdeploy).
3. Sändningen tar slut under avbrottet. `live:end:X` publiceras — men klienten är inte där, och
   ramen kommer **aldrig igen**: SSE-replayen kräver ett `Last-Event-ID` som en tappad källa i
   praktiken inte kan lita på, och internramarna trimmas ur strömmen som allt annat.
4. Klienten återansluter och hämtar om bootstrappen. Servern svarar auktoritativt `session: null`.
5. Den gamla regeln **ignorerar** det svaret. Klienten står kvar i sändning X för alltid — exakt
   det uppstartsluckan skulle laga, fast åt andra hållet.

`live:end` kan alltså inte äga avslutet ensamt. Snapshotet måste kunna avsluta.

### Regeln som ersätter den: LIVE-EVENTGENERATION

En räknare `generation` som stegas **varje gång en livesession-ram faktiskt behandlas** (en ram som
dedupas bort är ingen ny information och stegar inte).

- `borjaHamtning()` returnerar generationen **när förfrågan startar**. Anroparen skickar tillbaka
  den till `bootstrap(svar, biljett)`.
- Har generationen INTE ändrats när svaret landar är snapshotet fortfarande färskt och appliceras
  **oavsett innehåll** — `null` avslutar då den gamla sessionen (punkt 5 ovan).
- Har generationen ändrats hann en nyare SSE-ram före svaret. Snapshotet är gammalt och kastas
  **oavsett innehåll** — det stänger både `null` över `start(new)` och `start(old)` över
  `start(new)` med samma mekanism.

Skillnaden mot den gamla regeln: den gamla dömde på *innehåll* (null = nedgradering = ignorera),
den nya dömer på *ålder*. Innehållet är serverns sak; klientens sak är att veta om svaret hann bli
gammalt medan det var i luften.

Utan biljett (`bootstrap(svar)` ensamt) tas generationen vid anropet, alltså "ingenting kan ha
hunnit emellan" — bara för prov och bakåtkompatibla anropare.

### Vad detta gör med proven

`B12` (senare refetch med null ignoreras) beskrev den gamla regeln och är **omskriven**: en senare
refetch med null och ingen mellanliggande ram SKA avsluta sessionen. `B9` behåller sitt påstående
men måste ta biljetten FÖRE ramen — det är just det en pågående refetch gör.

## KORRIGERING 2026-08-25 · utkorgen är at-least-once, inte exakt en gång

Publiceringen skriver till Redis och kvitterar i databasen i **två steg**. En krasch, en timeout
eller en deployväxling mellan stegen ger en Redis-publicering utan kvittens, och nästa varv
publicerar raden igen. Det är at-least-once, och dokumentation och provtexter som antyder något
annat är fel.

Det är ofarligt — men bara tack vare en egenskap som måste stå utskriven: **`eventId` är stabilt
över ompubliceringar** (`live:start:<sessionId>` byggs ur radens egen data, inte ur klockan eller
ett försöksnummer), och klientens dedupe ligger på just `eventId`. En dubbelpublicerad ram är
därför en no-op hos varje mottagare. Säkerheten kommer alltså från de två tillsammans, inte från
publiceringen ensam.

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
