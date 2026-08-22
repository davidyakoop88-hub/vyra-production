'use strict';
// SÄNDNINGSIDENTITET — en auktoritativ sessionsmodell på servern.
//
// PROBLEMET, uppmätt 2026-08-22: ingenting i systemet vet när en NY TikTok-sändning börjar.
//   · bryggan har inget live:start — den postar /api/connect vid VARJE lyckad anslutning
//     (bridge.js:527), alltså även vid varje återanslutning
//   · den posten går till SERVER = http://127.0.0.1:4173 (bridge.js:39), desktopens lokala
//     server — molnet får bara enskilda events
//   · `roomId` finns inte i server/*.js och inte i cleanEvent:s vitlista (event-bus.js:13)
//
// EMPIRIN, uppmätt 2026-08-22 med en skrivskyddad sond (inga lyssnare, inga sparade händelser):
//   LIVE 1  15:33:10–15:44:44 CEST   roomId 7676848357138664214
//   LIVE 2  16:26:37                 roomId 7676861956443147030
//   Samma konto, samma dag, samma deployment. Två sändningar gav TVÅ roomId.
//
// VAD EMPIRIN INTE SÄGER. n = 2. Båda sändningarna hade EN anslutning var, så roomId:s stabilitet
// GENOM en återanslutning är fortfarande omätt. Och ingenting i två observationer utesluter att
// TikTok återanvänder ett roomId senare. Modellen får därför inte lova mer än mätningen bär:
// den partiella unika nyckeln nedan gäller BARA öppna sessioner.
//
// DEN HÄR FILEN PROVAR IDENTITETEN OCH DESS GARANTIER, inte nollställningens innehåll.
// En nollställning som utlöses av fel signal är värre än ingen alls — den raderar siffror mitt i
// en pågående sändning.
//
// VARFÖR POSTGRES OCH INTE EN ATTRAPP: hela poängen är ATOMICITET. Två statusbesked som kommer
// samtidigt ska ge exakt EN session, och det är en garanti databasen ger — inte koden. En attrapp
// hade svarat ja på vad koden än gjorde, och provet hade blivit en spegel i stället för en vakt.
const test = require('node:test'), assert = require('node:assert/strict');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Sessionsmodellen är oprövad tills TEST_DATABASE_URL '
    + 'pekar på en engångsdatabas — och atomiciteten går inte att prova mot en attrapp.';
const prov = (namn, fn) => test(`session: ${namn}`, { timeout: 30000, skip: BLOCKED }, fn);
if (!BLOCKED) process.env.DATABASE_URL = DB_URL;

// Modulen finns ännu inte. Proven är röda tills den byggs — det är avsikten.
let skapaStreamSessions = null;
try { ({ skapaStreamSessions } = require('../stream-sessions.js')) } catch (_) {}

const WS = '11111111-1111-4111-8111-111111111111';
const RUM_1 = '7676848357138664214';   // LIVE 1, uppmätt
const RUM_2 = '7676861956443147030';   // LIVE 2, uppmätt

async function rigg() {
  assert.ok(skapaStreamSessions,
    'server/stream-sessions.js finns inte än — modulen som äger sessionsbeslutet');
  const { pool } = require('../db.js');
  const sessioner = skapaStreamSessions({ pool });
  // Ordningen följer främmande nycklar: pekare och kvitton före sessionerna.
  await pool.query('DELETE FROM stream_session_pointer WHERE workspace_id=$1', [WS]);
  await pool.query('DELETE FROM stream_event_outbox WHERE workspace_id=$1', [WS]);
  await pool.query(
    'DELETE FROM stream_session_reset WHERE session_id IN (SELECT id FROM stream_sessions WHERE workspace_id=$1)',
    [WS]);
  await pool.query('DELETE FROM stream_sessions WHERE workspace_id=$1', [WS]);
  return { sessioner, pool };
}

const pekaren = (pool) => pool.query(
  'SELECT session_id FROM stream_session_pointer WHERE workspace_id=$1', [WS])
  .then(r => r.rows[0] ? r.rows[0].session_id : null);

const rader = (pool) => pool.query(
  'SELECT id, room_id, started_at, ended_at, end_reason FROM stream_sessions '
  + 'WHERE workspace_id=$1 ORDER BY started_at', [WS]).then(r => r.rows);

// ---- 1 · KRAV 2 --------------------------------------------------------------------------------
prov('första roomId skapar en session och sätter pekaren', async () => {
  const { sessioner, pool } = await rigg();
  const ut = await sessioner.startaLive({ workspaceId: WS, roomId: RUM_1 });
  assert.equal(ut.created, true, 'första sändningen ska skapa en session');
  assert.equal(ut.session.roomId, RUM_1);
  assert.equal(await pekaren(pool), ut.session.id,
    'pekaren ska peka på den nya sessionen — annars vet ingen vad som är live nu');
});

// ---- 2 · KRAV 1 --------------------------------------------------------------------------------
prov('samma AKTIVA roomId är alltid en återanslutning, aldrig en ny session', async () => {
  const { sessioner, pool } = await rigg();
  const forsta = await sessioner.startaLive({ workspaceId: WS, roomId: RUM_1 });
  // Bryggan postar vid VARJE lyckad anslutning. Fem återanslutningar är fem besked.
  for (let i = 0; i < 5; i++) {
    const igen = await sessioner.startaLive({ workspaceId: WS, roomId: RUM_1 });
    assert.equal(igen.created, false, 'återanslutning ' + (i + 1) + ' skapade en NY session');
    assert.equal(igen.session.id, forsta.session.id, 'sessions-id bytte vid återanslutning');
  }
  assert.equal((await rader(pool)).length, 1, 'fler än en rad för samma aktiva rum');
});

// ---- 3 · KRAV 2 + 4 ----------------------------------------------------------------------------
prov('nytt roomId skapar nästa session, stänger den förra och flyttar pekaren', async () => {
  const { sessioner, pool } = await rigg();
  const ett = await sessioner.startaLive({ workspaceId: WS, roomId: RUM_1 });
  const tva = await sessioner.startaLive({ workspaceId: WS, roomId: RUM_2 });
  assert.equal(tva.created, true);
  assert.notEqual(tva.session.id, ett.session.id);
  const alla = await rader(pool);
  assert.equal(alla.length, 2);
  const gammal = alla.find(r => r.room_id === RUM_1);
  assert.ok(gammal.ended_at, 'föregående session lämnades öppen — två öppna sändningar samtidigt');
  assert.equal(gammal.end_reason, 'ersatt');
  assert.equal(await pekaren(pool), tva.session.id, 'pekaren följde inte med till nya sessionen');
});

// ---- 4 · KRAV 3 --------------------------------------------------------------------------------
prov('INGEN global unik nyckel: ett stängt rum får förekomma igen', async () => {
  const { sessioner, pool } = await rigg();
  const ett = await sessioner.startaLive({ workspaceId: WS, roomId: RUM_1 });
  await sessioner.avslutaLive({ workspaceId: WS, sessionId: ett.session.id, reason: 'bridge' });
  // Bortom karenstiden är ett återanvänt roomId en NY sändning, inte ett försenat besked.
  // Två observationer räcker inte för att lova att TikTok aldrig återanvänder ett rum, så
  // en permanent UNIQUE(workspace_id, room_id) hade gjort bryggan omstartsoduglig den dagen
  // det händer. Den unika nyckeln gäller därför bara ÖPPNA sessioner.
  const igen = await sessioner.startaLive({
    workspaceId: WS, roomId: RUM_1, observedAt: new Date(Date.now() + 24 * 3600e3).toISOString() });
  assert.equal(igen.created, true, 'ett återanvänt rum efter karenstiden måste kunna bli ny session');
  assert.notEqual(igen.session.id, ett.session.id);
  assert.equal((await rader(pool)).filter(r => r.room_id === RUM_1).length, 2);
});

// ---- 5 · KRAV 7 --------------------------------------------------------------------------------
prov('ett försenat besked om ett AVSLUTAT rum återaktiverar det aldrig', async () => {
  const { sessioner, pool } = await rigg();
  const ett = await sessioner.startaLive({ workspaceId: WS, roomId: RUM_1 });
  const tva = await sessioner.startaLive({ workspaceId: WS, roomId: RUM_2 });
  // Bryggan hann posta en gång till för det gamla rummet innan den märkte bytet.
  const sent = await sessioner.startaLive({ workspaceId: WS, roomId: RUM_1 });
  assert.equal(sent.created, false);
  assert.equal(sent.stale, true, 'det försenade beskedet märktes inte som föråldrat');
  assert.equal(sent.session.id, ett.session.id, 'fel session pekades ut');
  const gammal = (await rader(pool)).find(r => r.id === ett.session.id);
  assert.ok(gammal.ended_at, 'den avslutade sessionen öppnades igen');
  assert.equal(await pekaren(pool), tva.session.id, 'pekaren rycktes tillbaka till förra sändningen');
});

// ---- 6 · KRAV 5 + 7 ----------------------------------------------------------------------------
prov('två SAMTIDIGA besked för samma rum ger exakt en session', async () => {
  const { sessioner, pool } = await rigg();
  const svar = await Promise.all([
    sessioner.startaLive({ workspaceId: WS, roomId: RUM_1 }),
    sessioner.startaLive({ workspaceId: WS, roomId: RUM_1 }),
    sessioner.startaLive({ workspaceId: WS, roomId: RUM_1 }),
  ]);
  const ider = [...new Set(svar.map(s => s.session.id))];
  assert.equal(ider.length, 1, 'samtidiga besked gav ' + ider.length + ' sessioner');
  assert.equal(svar.filter(s => s.created).length, 1, 'mer än ett svar påstod sig ha skapat sessionen');
  assert.equal((await rader(pool)).length, 1);
});

// ---- 7 · KRAV 5 --------------------------------------------------------------------------------
prov('två SAMTIDIGA besked om OLIKA rum ger en enda vinnare och en enda pekare', async () => {
  const { sessioner, pool } = await rigg();
  await Promise.all([
    sessioner.startaLive({ workspaceId: WS, roomId: RUM_1 }),
    sessioner.startaLive({ workspaceId: WS, roomId: RUM_2 }),
  ]);
  const alla = await rader(pool);
  const oppna = alla.filter(r => !r.ended_at);
  assert.equal(oppna.length, 1, 'sessionsbytet var inte låst: ' + oppna.length + ' öppna sessioner');
  assert.equal(await pekaren(pool), oppna[0].id, 'pekaren pekar inte på den enda öppna sessionen');
});

// ---- 8 · KRAV 6 --------------------------------------------------------------------------------
prov('nollställning är idempotent per internt session_id', async () => {
  const { sessioner, pool } = await rigg();
  const ett = await sessioner.startaLive({ workspaceId: WS, roomId: RUM_1 });
  const a = await sessioner.markeraNollstalld({ sessionId: ett.session.id, scope: 'goals' });
  const b = await sessioner.markeraNollstalld({ sessionId: ett.session.id, scope: 'goals' });
  const c = await sessioner.markeraNollstalld({ sessionId: ett.session.id, scope: 'goals' });
  assert.equal(a, true, 'första nollställningen ska rapportera att den utfördes');
  assert.equal(b, false, 'andra försöket nollställde igen — mitt i sändningen');
  assert.equal(c, false);
  const kvitton = await pool.query(
    'SELECT count(*)::int AS n FROM stream_session_reset WHERE session_id=$1 AND scope=$2',
    [ett.session.id, 'goals']);
  assert.equal(kvitton.rows[0].n, 1);
  // Ett annat område för SAMMA session är en egen nollställning, inte en dubblett.
  assert.equal(await sessioner.markeraNollstalld({ sessionId: ett.session.id, scope: 'leaderboard' }), true);
});

// ---- 9 · KRAV 8 --------------------------------------------------------------------------------
prov('outbox-raden skrivs i SAMMA transaktion som sessionen', async () => {
  const { sessioner, pool } = await rigg();
  const ett = await sessioner.startaLive({ workspaceId: WS, roomId: RUM_1 });
  const ut = await pool.query(
    'SELECT event_id, topic, payload, published_at FROM stream_event_outbox '
    + 'WHERE workspace_id=$1 ORDER BY id', [WS]);
  assert.equal(ut.rowCount, 1, 'sessionen skapades utan att någon händelse lades i utkorgen');
  assert.equal(ut.rows[0].topic, 'live:start');
  assert.equal(ut.rows[0].payload.sessionId, ett.session.id);
  assert.equal(ut.rows[0].payload.roomId, RUM_1);
  assert.equal(ut.rows[0].published_at, null,
    'raden markerades publicerad inne i transaktionen — då kan en rollback ljuga bort en händelse');
});

// ---- 10 · KRAV 8 -------------------------------------------------------------------------------
prov('en krasch mellan commit och publicering tappar ingen händelse', async () => {
  const { sessioner, pool } = await rigg();
  const ett = await sessioner.startaLive({ workspaceId: WS, roomId: RUM_1 });
  // Kraschen simuleras genom att INGEN publicerare kört: raden ligger opublicerad kvar.
  const kvar = await pool.query(
    'SELECT event_id FROM stream_event_outbox WHERE workspace_id=$1 AND published_at IS NULL', [WS]);
  assert.equal(kvar.rowCount, 1, 'händelsen överlevde inte kraschen');
  // Publiceraren startar om och tar hand om den.
  const publicerade = [];
  const n = await sessioner.publiceraUtkorg({ workspaceId: WS, sand: async e => { publicerade.push(e) } });
  assert.equal(n, 1);
  assert.equal(publicerade[0].payload.sessionId, ett.session.id);
  // Andra varvet får inte skicka om den.
  assert.equal(await sessioner.publiceraUtkorg({ workspaceId: WS, sand: async () => {} }), 0,
    'en redan publicerad händelse skickades igen utan att konsumenten bad om det');
});

// ---- 11 · KRAV 7 -------------------------------------------------------------------------------
prov('dubblettleverans av samma händelse tillämpas bara en gång', async () => {
  const { sessioner, pool } = await rigg();
  await sessioner.startaLive({ workspaceId: WS, roomId: RUM_1 });
  const rad = (await pool.query(
    'SELECT event_id, payload FROM stream_event_outbox WHERE workspace_id=$1', [WS])).rows[0];
  // Utkorgen är at-least-once. Konsumenten måste därför vara idempotent på event_id, precis
  // som goal_event_apply redan är för målhändelser.
  const forsta = await sessioner.tillampaEnGang({ workspaceId: WS, eventId: rad.event_id });
  const andra = await sessioner.tillampaEnGang({ workspaceId: WS, eventId: rad.event_id });
  assert.equal(forsta, true);
  assert.equal(andra, false, 'samma händelse tillämpades två gånger — nollställning kan då köra om');
});

// ---- 12 · KRAV 10 ------------------------------------------------------------------------------
prov('ett sessionsbyte rör inte de tillstånd som ska bevaras', async () => {
  const { sessioner, pool } = await rigg();
  // Livstidssiffror och dygns-/tidsunderlag ska överleva varje sändningsbyte. Mätt 2026-08-22:
  // viewer_levels, gifter_totals, daily_totals och slot_totals har alla workspace-nycklar UTAN
  // sessionsbegrepp — de är per konto, dag respektive veckodag×timme, inte per sändning.
  await pool.query(
    'INSERT INTO viewer_levels(workspace_id,viewer_id,fan_level,gifter_level) VALUES($1,$2,7,9) '
    + 'ON CONFLICT (workspace_id,viewer_id) DO UPDATE SET fan_level=7', [WS, 'tittare-1']);
  await pool.query(
    'INSERT INTO daily_totals(workspace_id,tiktok_username,day,gifts,diamonds,likes) '
    + "VALUES($1,'jokero060',CURRENT_DATE,5,50,500) "
    + 'ON CONFLICT (workspace_id,tiktok_username,day) DO UPDATE SET gifts=5', [WS]);

  await sessioner.startaLive({ workspaceId: WS, roomId: RUM_1 });
  await sessioner.startaLive({ workspaceId: WS, roomId: RUM_2 });

  const niva = await pool.query(
    'SELECT fan_level FROM viewer_levels WHERE workspace_id=$1 AND viewer_id=$2', [WS, 'tittare-1']);
  assert.equal(niva.rows[0].fan_level, 7, 'tittarnivåerna nollställdes av ett sessionsbyte');
  const dag = await pool.query(
    'SELECT gifts FROM daily_totals WHERE workspace_id=$1 AND day=CURRENT_DATE', [WS]);
  assert.equal(Number(dag.rows[0].gifts), 5, 'dygnssiffrorna nollställdes av ett sessionsbyte');
});
