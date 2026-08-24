# Bryggans sändningsidentitet — design (före kod)

Status: **design för godkännande**. Ingen implementation ännu. Serverblocket (#268, mergat
dormant som `53f8a71`) rörs inte. Flaggan `VYRA_SANDNINGSIDENTITET` förblir osatt i alla miljöer.

## Uppmätt nuläge (2026-08-24, mot main `641be03`)

**1. Livscykelpunkterna** — allt bor i `bridge.js`:

| Händelse | Plats | I dag |
|---|---|---|
| Lyckad anslutning | `connection.connect().then(state)` bridge.js:519 | Första stället `state.roomId` finns; `postJson('/api/connect')` + `reportToParent('connected')` |
| Reconnect | `scheduleReconnect()` :312, matas från tre håll: `DISCONNECTED` :476, connect-katch :541, `STREAM_END` :432 | Backoff 1s→60s för evigt; ger aldrig upp |
| Paus/resume/suspend | `CONTROL_MESSAGE` action 1/2/4 :424 | Byter bara `sandningsLage`; ingen återanslutning, inget slut |
| Definitivt slut | `WebcastEvent.STREAM_END` :432 — **enda platsen** | Är i dag bara en reconnect-orsak ('TikTok LIVE avslutades'); särskiljs inte från nätverksfel nedströms |

**2. Eventpostning** — `sendEvent()` :233: **ingen kö, ingen retry, ingen serialisering.**
Molnpostningen är fire-and-forget `fetch(...).catch(logg)` :255 utan timeout — ett misslyckat
event är borta (at-most-once), och ordningen mot molnet är HTTP-ankomstordning eftersom varje
event är en egen samtidig Promise. Dedupe finns (`recentEventKeys`, 2 min).

**3. Kan vanliga events skickas före ett accepterat start?** **Ja.** Lyssnarna kopplas i
`connect()` (:339–:474) *innan* `connection.connect()` resolvar (:519) — events kan fyras innan
`.then()` med roomId ens körts. Det finns ingen grind alls i dag.

**4. Hur stoppas en gammal process?** `connection-manager.js` kör en forkad process per
workspace, nycklad per *konto* (`accountKey` :52 — samma normalisering som serverns
`kontonyckel`). Stopp = SIGTERM via `stopBridge()`/`syncOnce()`. **Luckan:** vid deploy-överlapp i
Railway lever gamla containern tills den nya är healthy — två processer kan tala för samma konto
samtidigt, och ingenting i dag tystar den gamla. Det är exakt hålet serverns generationsmodell
finns för: den gamla processens `bridgeRunId` blir avlöst → 409/stale → **bryggan själv** ska
tystna.

## Design

Ny syskonmodul **`tiktok-bridge/livscykel.js`** — ren logik, injicerbar `fetch`/klocka/logg,
fullt testbar utan socket. `bridge.js` får tunna anropspunkter. `connection-manager.js` rörs inte.

### Flaggan — fail-closed
`process.env.VYRA_SANDNINGSIDENTITET === '1'`, läst en gång vid processtart. **Av** ⇒
`skapaLivscykel()` returnerar noop-varianten: varje metod är en synkron no-op och grinden är
identitetsfunktionen. Noll anrop till de tre rutterna, ingen `randomUUID`, ingen seq-logik,
ingen buffring — dagens eventflöde är oförändrat och provet bevisar byteidentiska bodies mot
mock-molnet.

### Körningsidentitet
- `bridgeRunId = crypto.randomUUID()` skapas **en gång per bryggprocess** (en process = ett
  konto i flottan), utanför `connect()` — nätverksåteranslutningar behåller det, processomstart
  ger nytt.
- Registreringen `POST /api/live-runs {tiktokUsername, bridgeRunId}` är **kööbjekt #0** i
  livscykelkön (nedan) — start/end står bakom den i FIFO:n och kan strukturellt inte skickas före
  en accepterad registrering.

### Livscykelkön — seq och retry
En FIFO av logiska statusbesked. En sändarslinga tar huvudet och POST:ar med backoff tills ett
definitivt svar kommer; först då skiftas kön.

- `seq` börjar på 1 och ökas **endast** när ett nytt logiskt besked läggs i kön. Retry efter
  timeout/förlorat svar återanvänder **exakt samma seq och body** (serverns seq-vakt gör replay
  till idempotent no-op). seq ökas aldrig för att ett HTTP-svar saknades.
- Svarshantering, fail-closed:
  - `2xx accepted/idempotent/reconnect` → skifta kön, nästa besked.
  - timeout / nätverksfel / 5xx / `503` (flaggan av på servern) → retry samma besked,
    backoff 1s→60s (samma kurva som reconnect). Inget tappas, ordningen står.
  - `401` → konfigurationsfel (tokenrotation/deploy): logga **utan token eller body**, långsam
    retry (60s). Tystnar aldrig tyst.
  - `409` på live-runs eller `stale: true` på sessions → **avlöst**: en nyare process äger
    kontot. Bryggan stänger grinden permanent (inga fler moln-events), tömmer inget mer ur kön
    och avslutar processen med felkod. Managerns backoff (5s→5min) dämpar flip-flop under
    deploy-överlapp; överlappfönstret är ändligt eftersom gamla containern SIGTERM:as när nya
    är healthy. Detta är svaret på mätpunkt 4: den gamla processen tystas av servern, inte bara
    av en signal.
  - `400` → kontraktsdefekt i bryggan själv: logga och avsluta processen (omstart ger ny körning
    och rent seq-utrymme). Aldrig tyst vidare.

### Livscykelhändelser (mappning mot de uppmätta punkterna)
- `connect().then(state)` :519 ⇒ köa **start** `{tiktokUsername, roomId, bridgeRunId, seq}` —
  *varje* lyckad anslutning, även återanslutning till samma LIVE; servern avgör reconnect kontra
  ny session (uppmätt kontrakt i #268).
- `STREAM_END` :432 ⇒ köa **end** med nästa seq, *före* `scheduleReconnect` — kön + retry säkrar
  leveransen även om anslutningen dör direkt efter. Reconnect-beteendet i övrigt är orört: går
  streamern live igen med nytt roomId ger `connect().then` en ny start med samma körning och
  nästa seq.
- Paus/resume/suspend (`CONTROL_MESSAGE` 1/2/4), `DISCONNECTED`, misslyckad connect ⇒ **inga**
  livscykelbesked. Endast `STREAM_END` ger end.
- Beskedens bodies är exakt maskinrutternas kontrakt — inga extra fält (nio förbjudna fält ger
  400 på servern, mätt i #268).

### Ordningsregeln — grinden
Gäller **endast molnvägen** i `sendEvent` (:255); den lokala desktop-posten är orörd.

- När ett start köas **stängs grinden** för kontots moln-events. Events buffras i en begränsad
  FIFO (tak 200; en gåvostorm på ~10 events/s ger ~20 s marginal — grinden är normalt öppen inom
  en RTT). Vid överflöd släpps äldsta eventet och **räknas högt** i flödesräknaren
  (`gate-drop=N`) — begränsat minne utan tysta tapp.
- När startet accepterats (server-reset är då committad — reset ligger i samma transaktion som
  sessionsskapandet, bevisat i #268) töms bufferten **i ordning**; events som anländer under
  tömningen ställer sig sist; först när bufferten är tom blir grinden genomsläpplig.
- Moln-event-POST:arna får `AbortSignal.timeout(10s)` (i dag saknar de timeout) och räknas som
  in-flight per LIVE. **End skickas först när bufferten är tom och in-flight = 0** — och eftersom
  varje in-flight nu garanterat avgörs inom timeouten är dräneringen ändlig utan nödlucka.
  Vanliga events förblir at-most-once precis som i dag; ett timeoutat event räknas i
  flödesräknaren.

### Loggdisciplin
Aldrig token, aldrig `Authorization`-headern, aldrig hela bodies. Loggraderna är på formen
`[livscykel] start seq=3 accepterad` / `[livscykel] 409 — avlöst, tystnar`. Ett prov skannar
uppsamlade loggrader efter tokensubsträngen och full-body-JSON.

## Provplan (`tiktok-bridge/test/livscykel.test.js` + integrationsfil; sviten kör glob — ingen filnamnslistefälla)

1. Flagga av → noll anrop till de tre rutterna, inga nya HTTP-anrop alls, byteidentiska
   event-bodies mot mock-molnet.
2. UUID behålls genom reconnect (samma modulinstans), nytt vid ny processinstans (ny modul).
3. seq 1, 2, 3 över start/end/start; retry efter timeout återanvänder samma seq och body,
   verbatim-jämfört i mock-servern.
4. Registrering före start (kööbjekt #0), start accepterat före första vanliga moln-eventet
   (mock-servern verifierar ankomstordning), buffert töms i ordning, överflöd räknas.
5. Paus (action 1/4), `DISCONNECTED` och misslyckad connect ger inget end.
6. `STREAM_END` ger exakt ett logiskt end; retry är idempotent (samma seq/body).
7. Nytt roomId utan processomstart → ny start, samma bridgeRunId, nästa seq.
8. 401/503 → kontrollerad retry med backoff; loggsvep visar noll tokenförekomster.
9. 409/stale → grinden stängd, inga fler event- eller livscykelanrop, processavslutssignal.
10. Loggsvepet (token, Authorization, bodies) över alla scenarier ovan.

## Utanför denna PR
Ingen miljöflagga ändras, ingen worker, ingen klient, ingen merge utan uttryckligt godkännande.
