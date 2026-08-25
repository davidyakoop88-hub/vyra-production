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
| `server/index.js:279` | maskinrutt → `503` | rutten aktiv (maskintoken krävs) |
| `server/index.js:421` | maskinrutt → `503` | rutten aktiv |
| `server/index.js:523` | utkorgsworkern **startas inte alls** — ingen timer, ingen pollning, inget claim | workern pollar |
| `server/stream-sessions.js:13` | `AKTIVERAD()` false | true |

**tiktok-manager (bryggan)** — ett lässite, `tiktok-bridge/bridge.js:223`:
`pa: VYRA_SANDNINGSIDENTITET === '1' && !!(CLOUD && WORKSPACE && INGEST_TOKEN)` — fail-closed på
**alla fyra** villkoren.

Klienten är passiv: saknas `session`-fältet skriver `live-session-client.js` ingenting alls — ingen
signal, ingen `sessionStorage`-skrivning, ingen reset.

---

## 1. Ordningen — servern FÖRE bryggan

**Servern måste vara på först.** Med bryggan på och servern av svarar maskinrutterna `503`; bryggans
kontrakt gör `400 → exit 65` och bounded `401 → exit 78`, och **managern spärrar kontot för sin
livstid**. Återställning kräver då en ny serviceprocess via omdeploy — inte bara en flaggändring.
Fel ordning är alltså inte "lite fel", det är en spärr som kostar en omdeploy.

### Steg 1 — servern (vyra-production)

1. Sätt `VYRA_SANDNINGSIDENTITET=1` i Railway på **vyra-production**.
2. Invänta att tjänsten går ACTIVE.
3. Mät, i denna ordning:
   - `GET /api/overlay-access/<token>` på vyralive.app → `session`-fältet ska nu **finnas**
     och vara `null` (ingen LIVE pågår). Att fältet finns och är `null` är hela poängen:
     klienten kan skilja "av" från "på men tyst".
   - Maskinrutterna utan token → fortsatt `401` (inte `503`). `503` betyder att flaggan inte tog.
   - Serverloggen: workerns driftrad `[utkorg-worker]` ska dyka upp. Ingen rad = workern startade inte.
   - Postgres via Railway **Database → Data**-flikens SELECT-ruta: sessionsmodellens 6 tabeller
     fortfarande 0 rader (inget har hänt än — bryggan är av).
4. **Stoppvillkor:** något av ovan avviker → gå till rollback R1 innan bryggan rörs.

### Steg 2 — bryggan (tiktok-manager), tidigast efter en ren mätning i steg 1

1. Kontrollera först att `VYRA_CLOUD_URL`, `VYRA_WORKSPACE` och `VYRA_INGEST_TOKEN` alla är satta —
   annars är grinden fail-closed och flaggan gör ingenting (tyst, ser ut som en lyckad aktivering).
2. Sätt `VYRA_SANDNINGSIDENTITET=1` på **tiktok-manager**.
3. Mät under **en riktig LIVE**:
   - bryggloggen: `live-runs` och `live-sessions` ska få träffar; `randomUUID`-körningsid satt.
   - **exit 86 / 65 / 78 får inte förekomma.** 86 = stale (avlöst brygga), 65 = 400, 78 = 401 —
     alla tre är fatala och spärrar kontot.
   - Postgres: `bridge_runs` och `stream_sessions` får rader; `stream_session_pointer` pekar rätt.
   - En OBS-källa som öppnas **mitt i** sändningen ska få `session: {sessionId,startedAt}` i
     bootstrapsvaret — det är uppstartsluckan, hela syftet med #270.
   - Målwidgeten ska visa serverns resetvärde **utan reload**, och `baseline`/`target` ska vara oförändrade.
   - `VyraPoints` (`vyra-points-v1`) och viewer levels **orörda** — de väntar på produktbeslut.

---

## 2. Rollback

**R1 — servern.** Ta bort `VYRA_SANDNINGSIDENTITET` (eller sätt till något annat än `1`) på
vyra-production. Effekt är omedelbar vid omstart: `session`-fältet försvinner ur bootstrapsvaret,
maskinrutterna går till `503`, workern startar inte. Klienten faller tillbaka till dormant av sig själv.

**R2 — bryggan.** Ta bort flaggan på tiktok-manager. Bryggan återgår till exakt gamla
reconnect/backoff-beteendet (5-8-18-59 s). Verifierat vid #269-mergen.

**R3 — kontospärr efter exit 86/65/78.** En flaggändring räcker **inte**. Managern håller kontot
blockerat för sin livstid → **omdeploy av tiktok-manager** krävs. Räkna med det, planera inte en
aktivering strax före en viktig sändning.

**Rollbackordning är omvänd mot aktivering: bryggan av först, sedan servern.** Servern av med
bryggan på ger `503` → exit 65/78 → R3.

**Schemat rullas INTE tillbaka.** Migreringen är additiv och bevisat allt-eller-inget
(`migrering-atomicitet.test.js`); den får ligga kvar även vid kodrollback. Rör den inte.

**Data:** en rollback lämnar rader i sessionsmodellens tabeller. De är inerta när flaggan är av.
Radera dem inte reflexmässigt — de är bevismaterial om något gick fel.

---

## 3. Det som INTE ingår

- Ingen ändring av `VYRA_CLOUD_URL`, `VYRA_INGEST_TOKEN`, `VYRA_WORKSPACE`, `DATABASE_URL` eller någon
  RAILWAY_*-variabel.
- Ingen kodändring, ingen deploy av ny kod — bara en miljövariabel per tjänst.
- `VyraPoints` nollställs inte. Produktbeslut kvarstår.

---

## 4. Kända fällor vid mätningen

- **Railway-loggfiltret gallrar inte raderna visuellt** — varken i deploy-panen eller Log Explorer.
  Använd nedladdningsknappen, men den exporterar **bara inladdade rader**: kontrollera tidsspannet i filen.
- **Data-flikens SELECT-ruta är pålitligast för DB-bevis** — kräver ingen CLI.
- Railway-panelen kan vägra rendera i en dold Chrome-flik (bara "Home" i a11y-trädet). Ladda om senare.
- `gh run list --commit` fungerar inte i denna gh-version (tom lista) — filtrera på `headSha` via `--branch`.

---

## 5. Godkännandepunkter

1. [ ] Planen granskad av David.
2. [ ] Steg 1 (servern) godkänt — separat.
3. [ ] Steg 1 mätt rent innan steg 2 ens övervägs.
4. [ ] Steg 2 (bryggan) godkänt — separat, och inte före en viktig sändning.

Ingen av punkterna är avbockad. Flaggan är avstängd på båda tjänsterna.
