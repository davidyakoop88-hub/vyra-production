# Aktiverings- och rollbackplan · VYRA_SANDNINGSIDENTITET

Status vid skrivande: **koden är helt utrullad och dormant** på main `7d0d195` (#268 server, #269 brygga,
#270 worker+klient, #272 härdning). Flaggan är **osatt på båda tjänsterna** — verifierat 2026-08-25.
Planen är inte utförd. Den kräver Davids uttryckliga godkännande per steg.

---

## 0. Vad flaggan faktiskt styr

Flaggan läses som **exakt strängen `'1'`**. Allt annat — `true`, `ja`, `on`, tomt, osatt — är AV.

**vyra-production (servern)** — fyra lässiten:

| Plats | Beteende med flaggan AV | Med flaggan PÅ |
|---|---|---|
| `server/index.js:260` | `session`-fältet **saknas** i bootstrapsvaret, sessionsfrågan körs aldrig | `session: {sessionId,startedAt}` eller `null` |
| `server/index.js:279` | maskinrutt → `503` | rutten aktiv |
| `server/index.js:421` | reopen-rutt → `503` | rutten aktiv |
| `server/index.js:523` | utkorgsworkern **startas inte alls** — ingen timer, ingen pollning, inget claim | workern pollar |
| `server/stream-sessions.js:13` | `AKTIVERAD()` false | true |

**tiktok-manager (bryggan)** — ett lässite, `tiktok-bridge/bridge.js:223`:
`pa: VYRA_SANDNINGSIDENTITET === '1' && !!(CLOUD && WORKSPACE && INGEST_TOKEN)` — fail-closed på
**alla fyra** villkoren. Miljövariablerna är `VYRA_CLOUD_URL`, **`VYRA_WORKSPACE_ID`** och
`VYRA_INGEST_TOKEN` (`bridge.js:14,16,43`).

Klienten är passiv: saknas `session`-fältet skriver `live-session-client.js` ingenting alls — ingen
signal, ingen `sessionStorage`-skrivning, ingen reset.

---

## 1. Ordningen — servern FÖRE bryggan

**Varför, korrekt formulerat.** `503` är **inte** fatalt. `livscykel.js:29` är uttrycklig:
*503/nätfel/5xx är ALDRIG fatala — bounded backoff 1 s → 60 s på samma besked, för evigt.* De fatala
exitkoderna kommer från **andra** svar:

| Kod | Utlöses av | Innebörd |
|---|---|---|
| `86` AVLOST_EXIT | `409` på registreringen, eller `stale:true` på start/end | en nyare process har tagit över |
| `65` KONTRAKT_EXIT | `400` | bryggan själv är defekt, retry är meningslös |
| `78` KONFIG_EXIT | `401` efter bounded policy (5 försök à 60 s) | fel ingest-nyckel |

Servern ska ändå aktiveras först, men av ett annat skäl än "fatal spärr": med bryggan på och servern
av **väntar och buffrar** bryggan. Startbufferten är begränsad — `VYRA_GRIND_BUFFERT`, default 500 —
och vid tak släpps **äldsta** event (`livscykel.js:109`, uttrycklig dataförlust som räknas som
gate-drop). Ett långt fönster med servern av är alltså inte ofarligt: det är tyst dataförlust i
bufferten, inte en krasch.

### Steg 1 — servern (vyra-production)

1. Sätt `VYRA_SANDNINGSIDENTITET=1` i Railway på **vyra-production**.
2. Invänta att tjänsten går ACTIVE.
3. Mät, i denna ordning:

   **a) Bootstrapsvaret.** `GET /api/overlay-access/<token>` → `session`-fältet ska nu **finnas** och
   vara `null` (ingen LIVE pågår). Att fältet finns och är `null` är hela poängen: klienten kan skilja
   "av" från "på men tyst".

   **b) Maskinrutten — trestegssond.** Ett anrop utan token duger **inte** som bevis: `maskinAuth`
   körs **före** flaggkontrollen (`index.js:278` före `:279`), så `401` kommer oavsett flaggläge.
   Sonden måste därför vara:

   | Anrop | Förväntat med flaggan PÅ | Med flaggan AV |
   |---|---|---|
   | `POST /api/live-runs` **utan** token | `401` | `401` (säger ingenting) |
   | `POST /api/live-runs` med **korrekt** token och tom/ogiltig body | **`400`** | **`503`** |

   Det är `400`-mot-`503` som skiljer lägena. Med tom body faller anropet på
   `Ogiltigt tiktokUsername` (`kontonyckel('')` → `""`) och returnerar **innan någon skrivning sker**.

   **c) Kontrollera att sonden inte skrev något.** Via Railway **Database → Data** → SELECT:
   `bridge_runs`, `bridge_accounts`, `stream_sessions`, `stream_session_pointer`, `stream_event_outbox`
   ska alla ha **0 rader**. En rad här betyder att sonden gick längre än avsett — stoppa.

   **d) Workern.** **Vänta inte på någon startrad i loggen — den finns inte.** En frisk, tom worker
   loggar ingenting: enda `[utkorg-worker]`-raderna är `[error]`-rader (parkerad rad, fallet varv), och
   första varvet sätter bara vattenmärket *utan att logga* (`stream-worker.js:80`). Workern verifieras
   först efter den första riktiga starten i steg 2, genom att `live:start`-raden i `stream_event_outbox`
   får `published_at` satt.

4. **Stoppvillkor:** avviker a, b eller c → rollback R1 innan bryggan rörs.

### Steg 2 — bryggan (tiktok-manager), tidigast efter en ren mätning i steg 1

1. Kontrollera först att `VYRA_CLOUD_URL`, **`VYRA_WORKSPACE_ID`** och `VYRA_INGEST_TOKEN` alla är
   satta — annars är grinden fail-closed och flaggan gör ingenting, tyst.
2. Sätt `VYRA_SANDNINGSIDENTITET=1` på **tiktok-manager**.
3. Mät under **en riktig LIVE**:
   - bryggloggen: `live-runs` och `live-sessions` får träffar; `randomUUID`-körningsid satt.
   - `bridge_runs` och `stream_sessions` får rader; `stream_session_pointer` pekar på den nya sessionen.
   - **Workerbeviset:** `live:start`-raden i `stream_event_outbox` får `published_at` satt.
   - En OBS-källa som öppnas **mitt i** sändningen får `session: {sessionId,startedAt}` i
     bootstrapsvaret — uppstartsluckan, hela syftet med #270.
   - Målwidgeten visar serverns resetvärde **utan reload**; `baseline` och `target` oförändrade.
   - `VyraPoints` (`vyra-points-v1`) och viewer levels **orörda**.

### Steg 3 — slutet av livscykeln (avsluta test-LIVE:n och mät)

Aktiveringen är inte verifierad förrän sändningen har avslutats. Mät efter avslut:

| Kontroll | Förväntat | Var |
|---|---|---|
| Sessionen stängd | `stream_sessions.ended_at` satt, `end_reason` satt | `stream-sessions.js:472` |
| Pekaren nollad | `stream_session_pointer.session_id` = `NULL` | `:487` |
| Slutbeskedet publicerat | rad `live:end:<sessionId>` i `stream_event_outbox` med `published_at` satt | `:432-436` |
| **Klienten kvar inloggad** | ingen utloggning, SSE-strömmen intakt | signalen är `vyra-live-session`; `vyra-session-ended` betyder UTLOGGNING och får aldrig fyras |
| Nästa LIVE | **nytt** `sessionId`, ny pekarrad | |
| Mål | `baseline` och `target` **oförändrade** över hela cykeln | visat värde är `baseline+progress` |

Kör hellre två LIVE efter varandra — en enda bevisar inte att nästa session får eget id.

---

## 2. Rollback

**R1 — servern.** Ta bort `VYRA_SANDNINGSIDENTITET` (eller sätt till annat än `1`) på vyra-production.
Vid omstart: `session`-fältet försvinner ur bootstrapsvaret, maskinrutterna går till `503`, workern
startar inte. Klienten faller tillbaka till dormant av sig själv.

**R2 — bryggan.** Ta bort flaggan på tiktok-manager. Bryggan återgår till exakt gamla
reconnect/backoff-beteendet (5-8-18-59 s). Verifierat vid #269-mergen.

**R3 — kontospärr efter exit 65/78 (eller 86 på den aktiva instansen).** En flaggändring räcker inte:
managern håller kontot blockerat för sin livstid → **omdeploy av tiktok-manager** krävs.

**Rollbackordningen är omvänd mot aktiveringen: bryggan av först, sedan servern.** Servern av med
bryggan på ger `503` → inte fatalt, men bryggan buffrar och tappar äldsta event vid tak.

**Schemat rullas INTE tillbaka.** Migreringen är additiv och bevisat allt-eller-inget
(`migrering-atomicitet.test.js`); den får ligga kvar även vid kodrollback.

**Data:** en rollback lämnar rader i sessionsmodellens tabeller. De är inerta när flaggan är av.
Radera dem inte reflexmässigt — de är bevismaterial.

---

## 3. Stoppvillkor — och när exit 86 *inte* är ett

`65` och `78` är alltid stoppvillkor.

**`86` (stale/avlöst) ska bedömas efter vilken instans som råkade ut för det.** Under en
deployväxling kör två processer kort samtidigt; att den **utgående gamla** instansen får `stale` och
avslutar med `86` är **avsett beteende** — det är precis den avlösning modellen är byggd för. Stoppa
alltså inte aktiveringen på ett `86` som hör till den gamla instansen.

`86` **är** ett stoppvillkor när det drabbar den **aktiva, nya** deploymenten — då har något annat
tagit över kontot, och sändningen ägs inte av den process som borde äga den.

Avgör alltid vilken deployment raden kommer från innan `86` bokförs som fel.

---

## 4. Det som INTE ingår

- Ingen ändring av `VYRA_CLOUD_URL`, `VYRA_INGEST_TOKEN`, `VYRA_WORKSPACE_ID`, `DATABASE_URL` eller
  någon `RAILWAY_*`-variabel.
- Ingen kodändring, ingen deploy av ny kod — bara en miljövariabel per tjänst.
- `VyraPoints` nollställs inte. Produktbeslut kvarstår.

---

## 5. Kända fällor vid mätningen

- **Railway-loggfiltret gallrar inte raderna visuellt** — varken i deploy-panen eller Log Explorer.
  Använd nedladdningsknappen, men den exporterar **bara inladdade rader**: kontrollera tidsspannet i filen.
- **Data-flikens SELECT-ruta är pålitligast för DB-bevis** — kräver ingen CLI.
- Railway-panelen kan vägra rendera i en dold Chrome-flik (bara "Home" i a11y-trädet). Ladda om senare.
- `gh run list --commit` fungerar inte i denna gh-version (tom lista) — filtrera på `headSha` via `--branch`.

---

## 6. Godkännandepunkter

1. [ ] Planen granskad av David.
2. [ ] Steg 1 (servern) godkänt — separat.
3. [ ] Steg 1 mätt rent (a–c) innan steg 2 ens övervägs.
4. [ ] Steg 2 (bryggan) godkänt — separat.
5. [ ] Steg 3 (livscykelns slut) mätt innan aktiveringen kallas verifierad.

Ingen av punkterna är avbockad. Flaggan är avstängd på båda tjänsterna.
