'use strict';
// SÄNDNINGSIDENTITET — en auktoritativ sessionsmodell på servern.
//
// PROBLEMET, uppmätt 2026-08-22: ingenting i systemet vet när en NY TikTok-sändning börjar.
//   · bryggan har inget live:start — den postar /api/connect vid VARJE lyckad anslutning
//     (bridge.js:527), alltså även vid varje återanslutning
//   · den posten går till SERVER = http://127.0.0.1:4173 (bridge.js:39), desktopens lokala
//     server — molnet får bara enskilda events
//   · `roomId` finns inte i server/*.js och inte i cleanEvent:s vitlista (event-bus.js:13),
//     så molnvägens webbläsare vet aldrig vilken sändning ett event tillhör
//
// Följden är att räknare, mål och topplistor bär med sig förra sändningens siffror in i nästa.
//
// DEN HÄR FILEN PROVAR BARA IDENTITETEN, inte nollställningen. Nollställningen är ett eget block
// och får inte byggas förrän identiteten är bevisad — en nollställning som utlöses av fel signal
// är värre än ingen alls, för den raderar siffror mitt i en pågående sändning.
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
const nu = (ms) => new Date(1756000000000 + ms).toISOString();

async function rigg() {
  assert.ok(skapaStreamSessions,
    'server/stream-sessions.js finns inte än — modulen som äger sessionsbeslutet');
  const { pool } = require('../db.js');
  const sessioner = skapaStreamSessions({ query: (sql, params) => pool.query(sql, params) });
  await pool.query('DELETE FROM stream_sessions WHERE workspace_id=$1', [WS]);
  return sessioner;
}

// ---- 1 -----------------------------------------------------------------------------------------
prov('första roomId skapar en session', async () => {
  const s = await rigg();
  const ut = await s.rapporteraStatus(
    { workspaceId: WS, username: 'provaren', roomId: 'R-1', state: 'live', connectedAt: nu(0) });
  assert.equal(ut.skapad, true, 'första statusbeskedet skapade ingen session');
  assert.ok(ut.session.id, 'sessionen saknar id');
  assert.equal(ut.session.roomId, 'R-1');
});

// ---- 2 -----------------------------------------------------------------------------------------
prov('samma roomId flera gånger skapar bara EN session', async () => {
  // DET VIKTIGASTE SKYDDET. Bryggan postar status vid varje lyckad anslutning, och en sändning på
  // några timmar återansluter många gånger. Skapade varje besked en ny session skulle en
  // nollställning i nästa block radera siffrorna mitt i sändningen — värre än buggen vi lagar.
  const s = await rigg();
  const ett = await s.rapporteraStatus(
    { workspaceId: WS, username: 'provaren', roomId: 'R-1', state: 'live', connectedAt: nu(0) });
  const tva = await s.rapporteraStatus(
    { workspaceId: WS, username: 'provaren', roomId: 'R-1', state: 'live', connectedAt: nu(60000) });
  const tre = await s.rapporteraStatus(
    { workspaceId: WS, username: 'provaren', roomId: 'R-1', state: 'live', connectedAt: nu(120000) });
  assert.equal(ett.skapad, true);
  assert.equal(tva.skapad, false, 'en återanslutning skapade en ny session');
  assert.equal(tre.skapad, false, 'en tredje anslutning skapade en ny session');
  assert.equal(tva.session.id, ett.session.id, 'sessionens id ändrades vid återanslutning');
  assert.equal(tre.session.id, ett.session.id);
});

// ---- 3 -----------------------------------------------------------------------------------------
prov('nytt roomId skapar nästa session', async () => {
  const s = await rigg();
  const gammal = await s.rapporteraStatus(
    { workspaceId: WS, username: 'provaren', roomId: 'R-1', state: 'live', connectedAt: nu(0) });
  const ny = await s.rapporteraStatus(
    { workspaceId: WS, username: 'provaren', roomId: 'R-2', state: 'live', connectedAt: nu(3600000) });
  assert.equal(ny.skapad, true, 'ett nytt rum skapade ingen ny session');
  assert.notEqual(ny.session.id, gammal.session.id);
  const aktiv = await s.aktivSession(WS);
  assert.equal(aktiv.roomId, 'R-2', 'den aktiva sessionen pekar inte på det nya rummet');
});

// ---- 4 -----------------------------------------------------------------------------------------
prov('ett gammalt försenat besked återaktiverar INTE föregående session', async () => {
  // Nätet levererar inte i ordning, och bryggan kan startas om. Ett besked för R-1 som kommer fram
  // EFTER att R-2 börjat får inte flytta tillbaka den aktiva pekaren — då hade nästa event märkts
  // med fel sändning, och en nollställning hade uteblivit för hela den nya sändningen.
  const s = await rigg();
  await s.rapporteraStatus(
    { workspaceId: WS, username: 'provaren', roomId: 'R-1', state: 'live', connectedAt: nu(0) });
  const ny = await s.rapporteraStatus(
    { workspaceId: WS, username: 'provaren', roomId: 'R-2', state: 'live', connectedAt: nu(3600000) });

  const forsenad = await s.rapporteraStatus(
    { workspaceId: WS, username: 'provaren', roomId: 'R-1', state: 'live', connectedAt: nu(1000) });
  assert.equal(forsenad.skapad, false, 'det försenade beskedet skapade en session');

  const aktiv = await s.aktivSession(WS);
  assert.equal(aktiv.id, ny.session.id,
    'ett försenat besked för det GAMLA rummet gjorde den gamla sessionen aktiv igen');
  assert.equal(aktiv.roomId, 'R-2');
});

// ---- 5 -----------------------------------------------------------------------------------------
prov('två SAMTIDIGA besked för samma rum ger exakt en session', async () => {
  // Två bryggprocesser, eller en omstart mitt i, kan posta samtidigt. Garantin måste komma från
  // databasen — en kontroll i koden ("finns den redan?") har ett fönster mellan läsning och
  // skrivning där båda ser "nej".
  const s = await rigg();
  const [a, b] = await Promise.all([
    s.rapporteraStatus({ workspaceId: WS, username: 'provaren', roomId: 'R-9', state: 'live', connectedAt: nu(0) }),
    s.rapporteraStatus({ workspaceId: WS, username: 'provaren', roomId: 'R-9', state: 'live', connectedAt: nu(0) }),
  ]);
  assert.equal(a.session.id, b.session.id, 'de två beskeden gav olika sessioner');
  assert.equal([a.skapad, b.skapad].filter(Boolean).length, 1,
    'exakt ETT av de två samtidiga beskeden ska rapportera skapad=true — '
    + `fick ${JSON.stringify([a.skapad, b.skapad])}`);
});

// ---- 6 -----------------------------------------------------------------------------------------
prov('vanliga event märks med rätt sessions-id', async () => {
  // Beslutet ska fattas CENTRALT: bryggan skickar inget sessions-id, servern stämplar. Då kan en
  // klient inte hitta på ett, och alla widgets ser samma sanning.
  const s = await rigg();
  const ett = await s.rapporteraStatus(
    { workspaceId: WS, username: 'provaren', roomId: 'R-1', state: 'live', connectedAt: nu(0) });
  const marktEtt = await s.markEvent(WS, { type: 'gift', userId: 'u1' });
  assert.equal(marktEtt.sessionId, ett.session.id, 'eventet fick fel sessions-id');

  const tva = await s.rapporteraStatus(
    { workspaceId: WS, username: 'provaren', roomId: 'R-2', state: 'live', connectedAt: nu(3600000) });
  const marktTva = await s.markEvent(WS, { type: 'gift', userId: 'u1' });
  assert.equal(marktTva.sessionId, tva.session.id,
    'ett event efter sändningsbytet bar fortfarande den gamla sessionens id');
});

// ---- 7 -----------------------------------------------------------------------------------------
prov('paus och nätåteranslutning skapar ingen ny session', async () => {
  // Paus kommer som CONTROL_MESSAGE och postar aldrig status — den kan alltså inte skapa en
  // session. Det som DÄREMOT sker är att bryggan återansluter efteråt med samma rum, och det är
  // vad provet mäter. SSE-återanslutningen sker i webbläsaren och rör aldrig servern.
  const s = await rigg();
  const start = await s.rapporteraStatus(
    { workspaceId: WS, username: 'provaren', roomId: 'R-1', state: 'live', connectedAt: nu(0) });

  for (const t of [30000, 60000, 90000]) {
    const ut = await s.rapporteraStatus(
      { workspaceId: WS, username: 'provaren', roomId: 'R-1', state: 'live', connectedAt: nu(t) });
    assert.equal(ut.skapad, false, `återanslutningen vid ${t} ms skapade en ny session`);
  }
  const aktiv = await s.aktivSession(WS);
  assert.equal(aktiv.id, start.session.id, 'den aktiva sessionen byttes ut under sändningen');
});
