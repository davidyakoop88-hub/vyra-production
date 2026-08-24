# Bryggans sändningsidentitet — design (godkänd med korrigeringar 2026-08-24)

Status: **design godkänd av David med sex korrigeringar, inarbetade nedan.** Nästa steg: röda
prov, sedan implementation. Serverblocket (#268, mergat dormant som `53f8a71`) rörs inte.
Flaggan `VYRA_SANDNINGSIDENTITET` förblir osatt i alla miljöer.

## Uppmätt nuläge (2026-08-24, mot main `641be03`)

**1. Livscykelpunkterna** — allt bor i `bridge.js`:

| Händelse | Plats | I dag |
|---|---|---|
| Lyckad anslutning | `connection.connect().then(state)` bridge.js:519 | Första stället `state.roomId` finns; `postJson('/api/connect')` + `reportToParent('connected')` |
| Reconnect | `scheduleReconnect()` :312, matas från tre håll: `DISCONNECTED` :476, connect-katch :541, `STREAM_END` :432 | Backoff 1s→60s för evigt; ger aldrig upp |
| Paus/resume/suspend | `CONTROL_MESSAGE` action 1/2/4 :424 | Byter bara `sandningsLage`; ingen återanslutning, inget slut |
| Definitivt slut | `WebcastEvent.STREAM_END` :432 — **enda platsen** | Är i dag bara en reconnect-orsak; särskiljs inte från nätverksfel nedströms |

**2. Eventpostning** — `sendEvent()` :233: **ingen kö, ingen retry, ingen timeout, ingen
serialisering.** Molnpostningen är fire-and-forget `fetch(...).catch(logg)` :255 — ett misslyckat
event är borta (at-most-once), ordningen är HTTP-ankomstordning. Dedupe finns (2 min-fönster).

**3. Kan vanliga events skickas före ett accepterat start?** **Ja.** Lyssnarna kopplas i
`connect()` (:339–:474) *innan* `connection.connect()` resolvar (:519). Ingen grind finns.

**4. Hur stoppas en gammal process?** Endast SIGTERM från `connection-manager`. Vid
deploy-överlapp i Railway lever gamla containern tills den nya är healthy — två processer kan
tala för samma konto samtidigt, och ingenting tystar den gamla.

## Design

Ny syskonmodul **`tiktok-bridge/livscykel.js`** — ren logik, injicerbar
`fetch`/klocka/logg/`randomUUID`, fullt testbar utan socket. `bridge.js` får tunna anropspunkter.
`connection-manager.js` får **en** ändring: avlöst-spärren (§1).

### §1 · Stale är fail-stop — inte restart/backoff

Servern säger 409 på run-registrering eller `{stale:true}` på start/end ⇒ processen är
**permanent avlöst**: grinden går till `stale` (terminal), inga fler event- eller
livscykelanrop, och processen avslutar sig med **exitkod 86** (`AVLOST_EXIT`, exporterad
konstant).

`connection-manager` läser exitkoden i `child.on('exit', code => ...)`:
- kod 86 ⇒ kontot (via `accountKey`) läggs i en `generationsavlosta`-mängd **för managerns
  livstid**: `startBridge` vägrar med väntlisteorsak `stale-generation`, ingen backoff-timer,
  ingen respawn. Utan spärren: gammal process → stale → exit → respawn med nytt UUID → gör sig
  current → nya deploymentens process blir stale → flip-flop.
- Andra konton påverkas inte. En vanlig krasch/nätverksexit (andra koder) använder exakt dagens
  backoff. En **ny managerprocess** (= ny deployment) har en tom mängd och får starta kontot
  igen — det är hela poängen: den nya deploymenten är den som ska äga kontot.

Övriga fatala svar:
- **400 = kontraktsdefekt**, fatal: strukturerad error-logg + exitkod 65. Managern använder
  vanlig backoff (en 400 återkommer identiskt tills en deploy rättar kontraktet — och en deploy
  byter ändå manager), så felet är högljutt men självdämpat vid backoff-taket 5 min.
- **401 = bounded policy**: fem försök med 60 s mellanrum (~5 min). Därefter strukturerad
  error-logg + exitkod 78. Fel token kräver konfigurationsändring + omdeploy, och omdeployen
  byter manager; till dess ger managerns backoff en långsam, högljudd cykel — aldrig tyst.
- **503/nätfel/timeout/5xx**: retry på samma besked med bounded backoff 1s→60s (samma kurva som
  reconnect). Inget tappas, ordningen står.

### §2 · Grinden är en explicit tillståndsmaskin

Tillstånd: `disabled` · `registering` · `waiting-start` · `draining` · `open` · `ending` ·
`stale`.

- `disabled`: flaggan av — grinden är identitetsfunktionen, inget annat existerar (§6).
- `registering`: processtart → registreringen ligger som **kööbjekt #0**; moln-events buffras.
- `waiting-start`: start köat/skickas; moln-events buffras.
- `draining`: start **accepterat** (server-reset är då committad — samma transaktion, bevisat i
  #268). Bufferten töms i FIFO-ordning; **events som anländer under dräneringen läggs sist i
  samma FIFO** — ett nytt event kan strukturellt aldrig gå förbi ett äldre buffrat.
- `open`: bytet sker **atomiskt när kön är tom** (ett synkront avsnitt konstaterar tom kö och
  byter läge; JS-enkeltrådning gör att inget event kan smyga emellan). Därefter passerar events
  direkt.
- `ending`: se §4.
- `stale`: terminal (§1).

Prov kräver att servern ser start först och därefter eventen i exakt FIFO-ordning när events
anländer: före connect-resultatet, medan start-POST väntar, mitt under dräneringen, och precis
när kön blir tom.

### §3 · Ärlig eventleverans och buffertens tal

**Normal eventleverans är at-most-once i dag och förblir at-most-once i denna PR.** Ett
misslyckat/timeoutat moln-event är förlorat, precis som före ändringen — denna PR löser
ordningen runt start/end, inte generell eventreliabilitet. Det som skärps: moln-POST:ar får
`AbortSignal.timeout(10s)` (i dag saknas timeout helt) och förluster **räknas** i
flödesräknaren.

Startbufferten:
- **Konfigurerbar**: `VYRA_GRIND_BUFFERT`, default **500**.
- **Motivering, mätt — inte magiskt tal**: produktionsstatistiken (All time sedan 2026-08-08,
  "7 dagar med sändning") visar 351 986 likes, 2 633 gåvor. LIKE anländer batchat
  (`likeCount` per event, normalizer.js:81), chat/chatcommand går **inte** till molnet
  (`TILL_MOLNET` saknar dem), så molnvägens takt domineras av likes-batchar, viewer, member,
  follow, gift. Överslaget ger ~3–5 moln-events/s i normal sändning och ~20/s i topp (raid:
  member-våg + likes + gåvor). Grinden är normalt stängd < 1 s (en RTT + serverns transaktion),
  vilket ger buffertbehov ~5–20 events. 500 täcker ~25 s toppflöde — en hel backoff-omgång för
  ett start som måste göra retry. Vid längre serveravbrott svämmar **varje** ändligt tak över;
  därför är overflowpolicyn viktigare än talet.
- **Overflow = drop-oldest, aldrig tyst, aldrig fatal**: en strukturerad error-rad **en gång**
  per grindstängning (`[livscykel][error] grindbuffert full ...`) plus räknaren
  `gate-drop=N` i flödesräknaren varje minut. Motivering mot fatal stop: dagens baslinje
  förlorar samma events tyst vid varje misslyckad POST; att döda hela bryggprocessen (och därmed
  även den lokala desktop-strömmen) för att kontrollplanet var långsamt vore en regression för
  streamern vars overlay i dag hade fortsatt fungera. Drop-oldest därför att nyaste eventen är
  de overlayn behöver när grinden väl öppnar.

### §4 · End-ordningen

Vid `STREAM_END`:
1. Grinden går **omedelbart** till `ending` — inga nya vanliga events passerar (stragglers
   droppas och räknas).
2. **End köas omedelbart** i livscykel-FIFO:n och får sitt seq **nu** — så ett snabbt
   reconnect-start strukturellt hamnar *efter* endet i kön. Sändarslingan håller dock endet
   tills: bufferten är tömd **och** redan startade molnposter är avslutade (in-flight = 0 —
   ändligt tack vare 10s-timeouten, ingen nödlucka behövs).
3. Endet skickas; retry använder samma seq och body.
4. Först därefter går nästa besked (reconnect/ny-LIVE-start) vidare i FIFO:n.

Paus (action 1/4), vanlig `DISCONNECTED` och misslyckad connect skapar **aldrig** end. Prov
inkluderar långsam och timeoutad eventpost under `ending`.

### §5 · Livscykelkön och coalescing

Registreringen är strukturellt först (kööbjekt #0). Coalescing så att en övergång aldrig ger
flera logiska besked:
- **STREAM_END**: räknas en gång per anslutningsobjekt (flagga på anslutningens stängning);
  ett andra STREAM_END från samma anslutning ignoreras. Ett end köas inte heller om köns svans
  redan är ett end för samma roomId utan mellanliggande start.
- **Start**: `connect().then` fyrar en gång per anslutningsobjekt (mätt: `.then` på en promise).
  Defensivt coalescas ett start vars body (roomId) är identisk med köns svans utan
  mellanliggande end — flappande nät ger då retry på samma besked i stället för en växande kö,
  och servern behandlar upprepade start som reconnect ändå.
- Kön är därmed strukturellt bunden av växlingen start/end och kan inte växa obegränsat av
  duplicerade signaler.

### §6 · Flagga av — bevisat byte för byte

`process.env.VYRA_SANDNINGSIDENTITET === '1'`, läst en gång vid processtart. **Av** ⇒
noop-varianten: `moln()` gör exakt dagens fetch (samma URL `${CLOUD}/api/events/tiktok/${WS}`,
samma headers, samma `N.cloudEvent`-body). Provet jämför **URL, headers och body byte för byte**
mot dagens form och visar att: ingen UUID skapas (injicerad `randomUUID` räknas), ingen seq
räknas, ingen timer/kö/fatal-policy skapas, och `connection-manager` beter sig exakt som före
ändringen (`generationsavlosta` förblir tom när ingen exitkod 86 förekommer; alla befintliga
managerprov oförändrade).

### Loggdisciplin
Aldrig token, aldrig `Authorization`-headern, aldrig hela bodies. (`username`/`roomId`
förekommer redan i dagens loggrader — förbudet gäller hemligheter och kompletta payloads.)
Ett prov skannar uppsamlade loggrader efter tokensubsträngen och body-JSON.

## Provplan

`tiktok-bridge/test/livscykel.test.js` + `tiktok-bridge/test/livscykel-manager.test.js`
(sviten kör glob — ingen filnamnslistefälla):

1. **Flagga av** (§6): byteidentisk URL/headers/body, noll UUID/seq/timers, manager oförändrad.
2. UUID per process: behålls genom reconnect (samma instans), nytt vid ny instans.
3. seq 1,2,3 över start/end/start; retry efter timeout återanvänder samma seq+body verbatim.
4. Grindmaskinen (§2): events före connect-resultat / under väntande start-POST / mitt i
   dräneringen / precis vid tom kö — servern ser start först, sedan exakt FIFO-ordning.
5. Overflow (§3): exakt drop-oldest, strukturerad error en gång + räknare; konfigurerbart tak.
6. End-ordning (§4): STREAM_END stänger omedelbart, end köas med seq direkt men sänds efter
   dränering (även med långsam/timeoutad eventpost); exakt ett logiskt end, idempotent retry;
   snabbt reconnect-start hamnar efter endet.
7. Paus/disconnect/misslyckad connect ger aldrig end; dubbla STREAM_END coalescas (§5).
8. Nytt roomId utan processomstart → ny start, samma bridgeRunId, nästa seq.
9. 401 bounded (fem försök → exit 78), 503/nätfel bounded backoff, 400 → exit 65 —
   loggsvep utan token.
10. **Stale fail-stop** (§1): 409/stale → tystnad + exit 86; managern markerar kontot
    generationsavlöst, ingen timer/respawn, andra konton fortsätter, vanlig krasch använder
    befintlig backoff, ny managerinstans får starta kontot igen.

## Utanför denna PR
Ingen miljöflagga ändras, ingen worker, ingen klient, ingen merge utan uttryckligt godkännande.
