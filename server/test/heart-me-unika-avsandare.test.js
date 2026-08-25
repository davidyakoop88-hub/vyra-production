'use strict';
// HEART ME GOAL — RÖDA PROV FÖRE IMPLEMENTATION.
//
// Produktkravet (docs/heart-me-goal-design.md): templateHeartGoal räknar UNIKA PERSONER som
// skickar gåvan Heart Me under aktuell LIVE. Högst +1 per avsändare och sessionId, oavsett hur
// många gåvor de skickar. Likes och andra gåvor ger +0. Samma person räknas igen nästa LIVE.
//
// Dagens beteende är fel mot kravet: goal-metrics.js mappar templateHeartGoal → 'likes'. Uppmätt
// i test-LIVE 2 (produktion): två unika Heart Me-avsändare, widgeten visade 48/50, progress
// slutade på 433 — allt från TikTok-likes.
//
// DEDUPEN ÄR EN PRIMÄRNYCKEL, INTE KOD. stream_gift_sender_apply(session_id, widget_id,
// sender_key) med INSERT ... ON CONFLICT DO NOTHING RETURNING: målet ökas bara när insert:en
// skapade en rad. Ingen läsning följd av skrivning, så två samtidiga gåvor från samma person kan
// inte båda räknas, och en processomstart ändrar ingenting eftersom liggaren bor i Postgres.
//
// SYNTETISKA VÄRDEN ÖVERALLT. Inga verkliga konto-, rums- eller användarnamn. Rums-id:n har
// samma 19-siffriga form som TikToks men är påhittade.
const test = require('node:test'), assert = require('node:assert/strict');
const { Pool } = require('pg');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. En unikhetsnyckel går inte att prova mot en attrapp.';

let H = null;
try { H = require('../heart-me-goal'); } catch {}

// Den namngivna existenskontrollen. Varje prov börjar här, så ett rött prov säger VAD som saknas
// i stället för att falla på en odefinierad referens långt in i riggen.
const finns = () => assert.ok(H && typeof H.applyGiftSenderEvent === 'function',
  'server/heart-me-goal.js finns inte än — modulen som äger unik-avsändardedupen');

const AGARE = 'hhhhhhhh-0000-4000-8000-000000000001';
const WS = 'hhhhhhhh-1111-4000-8000-000000000001';
const OVERLAY = 'hhhhhhhh-2222-4000-8000-000000000002';
const WIDGET = 'templateHeartGoal-prov-0001';

// Syntetiska gåvo-id:n. HEART_ME är den konfigurerade gåvan; ANNAN_GAVA ska aldrig räknas.
const HEART_ME = '9001';
const ANNAN_GAVA = '9002';

// Syntetiska rums-id:n, 19 siffror precis som de riktiga — men påhittade.
const RUM_1 = '7600000000000000001';
const RUM_2 = '7600000000000000002';

const A = 'provgivare_a', B = 'provgivare_b', C = 'provgivare_c';

let pool;
const prov = (namn, fn) => test('heart-me: ' + namn, { timeout: 30000, skip: BLOCKED }, fn);

let eventNr = 0;
const gava = (avsandare, giftId = HEART_ME, over = {}) => ({
  id: over.id || `hprov:${++eventNr}:${avsandare}`,
  type: 'gift', giftId, giftName: over.giftName || 'Heart Me',
  userId: over.userId || avsandare, username: over.username || avsandare,
  count: over.count || 1, value: over.value || 5
});

const like = (avsandare, count = 100) => ({
  id: `hprov:${++eventNr}:like:${avsandare}`,
  type: 'like', userId: avsandare, username: avsandare, count
});

// En sändning i taget. Skapar sessionen och pekar pekaren på den — samma väg som startaLive()
// använder, men riggen äger raderna och river dem själv.
let sessionNr = 0;
async function nySession(roomId) {
  const id = `hhhhhhhh-3333-4000-8000-00000000000${++sessionNr}`;
  await pool.query(
    `INSERT INTO stream_sessions (id, workspace_id, room_id, started_at)
     VALUES ($1,$2,$3, now()) ON CONFLICT (id) DO NOTHING`, [id, WS, roomId]);
  await pool.query(
    `INSERT INTO stream_session_pointer (workspace_id, session_id, updated_at)
     VALUES ($1,$2, now())
     ON CONFLICT (workspace_id) DO UPDATE SET session_id = EXCLUDED.session_id, updated_at = now()`,
    [WS, id]);
  return id;
}

const malvarde = async () => {
  const q = await pool.query(
    'SELECT baseline + progress AS visat, baseline, target, metric FROM goal_runtime WHERE overlay_id=$1 AND widget_id=$2',
    [OVERLAY, WIDGET]);
  return q.rows[0] || null;
};

test.before(async () => {
  if (BLOCKED) return;
  pool = new Pool({ connectionString: DB_URL });
  await pool.query(
    `INSERT INTO users (id,email,password_hash,display_name,email_verified_at)
     VALUES ($1,$2,'x','heart-me-agare',now()) ON CONFLICT (id) DO NOTHING`, [AGARE, AGARE + '@t.invalid']);
  await pool.query(`INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,'heart-me-prov',$2)
    ON CONFLICT (id) DO NOTHING`, [WS, AGARE]);
});

// Förutsättningar skapas OCH rivs av riggen — aldrig ärvda. Filerna delar databas i CI-jobbet.
test.beforeEach(async () => {
  if (BLOCKED) return;
  await pool.query('DELETE FROM stream_session_pointer WHERE workspace_id=$1', [WS]);
  await pool.query('DELETE FROM stream_sessions WHERE workspace_id=$1', [WS]);
  await pool.query('DELETE FROM goal_runtime WHERE overlay_id=$1', [OVERLAY]);
  sessionNr = 0;
});

test.after(async () => {
  if (BLOCKED) return;
  await pool.query('DELETE FROM stream_session_pointer WHERE workspace_id=$1', [WS]);
  await pool.query('DELETE FROM stream_sessions WHERE workspace_id=$1', [WS]);
  await pool.query('DELETE FROM goal_runtime WHERE overlay_id=$1', [OVERLAY]);
  await pool.end();
});

// ---- KÄRNKONTRAKTET ---------------------------------------------------------------------------

prov('en Heart Me från en avsändare ger 1', async () => {
  finns();
  await nySession(RUM_1);
  await H.applyGiftSenderEvent(pool, WS, gava(A));
  assert.equal((await malvarde()).visat, 1, 'första unika avsändaren ska ge exakt +1');
});

prov('tre Heart Me från SAMMA avsändare ger fortfarande 1', async () => {
  finns();
  await nySession(RUM_1);
  for (let i = 0; i < 3; i++) await H.applyGiftSenderEvent(pool, WS, gava(A));
  assert.equal((await malvarde()).visat, 1, 'samma person får bidra högst +1 per session');

  // KONTROLLMÄTNING: samma rigg, en NY avsändare måste fortfarande räknas. Utan den här halvan
  // går provet grönt även om ingenting alls räknas.
  await H.applyGiftSenderEvent(pool, WS, gava(B));
  assert.equal((await malvarde()).visat, 2, 'en ny avsändare ska ge +1 — annars räknar inget');
});

prov('två olika avsändare ger 2', async () => {
  finns();
  await nySession(RUM_1);
  await H.applyGiftSenderEvent(pool, WS, gava(A));
  await H.applyGiftSenderEvent(pool, WS, gava(B));
  assert.equal((await malvarde()).visat, 2);
});

prov('likes ger +0 — like-vägen är frånkopplad', async () => {
  finns();
  await nySession(RUM_1);
  for (let i = 0; i < 5; i++) await H.applyGiftSenderEvent(pool, WS, like(A, 100));
  const efterLikes = await malvarde();
  assert.equal(efterLikes ? efterLikes.visat : 0, 0, '500 likes får inte röra ett Heart Me-mål');

  // KONTROLLMÄTNING.
  await H.applyGiftSenderEvent(pool, WS, gava(A));
  assert.equal((await malvarde()).visat, 1);
});

prov('annan gåva ger +0 — bara det konfigurerade giftId räknas', async () => {
  finns();
  await nySession(RUM_1);
  await H.applyGiftSenderEvent(pool, WS, gava(C, ANNAN_GAVA));
  const efter = await malvarde();
  assert.equal(efter ? efter.visat : 0, 0, 'fel giftId får inte räknas');

  // KONTROLLMÄTNING: samma avsändare med RÄTT gåva ska räknas.
  await H.applyGiftSenderEvent(pool, WS, gava(C, HEART_ME));
  assert.equal((await malvarde()).visat, 1);
});

prov('giftName matchar aldrig — bara giftId', async () => {
  finns();
  await nySession(RUM_1);
  // Rätt NAMN men fel id. normalizer.js:68 defaultar giftName till 'Gift', så namnmatchning
  // skulle räkna varje namnlös gåva som Heart Me.
  await H.applyGiftSenderEvent(pool, WS, gava(A, ANNAN_GAVA, { giftName: 'Heart Me' }));
  const efter = await malvarde();
  assert.equal(efter ? efter.visat : 0, 0, 'namnet får aldrig avgöra — bara giftId');
});

prov('samma person räknas igen i NÄSTA sändning', async () => {
  finns();
  await nySession(RUM_1);
  await H.applyGiftSenderEvent(pool, WS, gava(A));
  assert.equal((await malvarde()).visat, 1);

  await nySession(RUM_2);                       // ny session ⇒ ny nyckelrymd
  await H.applyGiftSenderEvent(pool, WS, gava(A));
  const efter = await malvarde();
  assert.equal(efter.visat, 1, 'ny sändning börjar om från 0 och räknar A på nytt — inte 2');
});

// ---- REPLAY, RECONNECT OCH SAMTIDIGHET --------------------------------------------------------

prov('samma eventId levererat flera gånger räknas en gång', async () => {
  finns();
  await nySession(RUM_1);
  const e = gava(A);
  await H.applyGiftSenderEvent(pool, WS, e);
  await H.applyGiftSenderEvent(pool, WS, e);   // utkorgen är at-least-once
  await H.applyGiftSenderEvent(pool, WS, e);
  assert.equal((await malvarde()).visat, 1);
});

prov('reconnect: nytt eventId, samma person, samma session ⇒ fortfarande 1', async () => {
  finns();
  await nySession(RUM_1);
  await H.applyGiftSenderEvent(pool, WS, gava(A, HEART_ME, { id: 'hprov:reconnect:1' }));
  await H.applyGiftSenderEvent(pool, WS, gava(A, HEART_ME, { id: 'hprov:reconnect:2' }));
  assert.equal((await malvarde()).visat, 1,
    'dedupen får inte hänga på eventId — en reconnect ger nya id:n för samma person');
});

prov('samtidiga gåvor från samma person — sex omgångar, alltid 1', async () => {
  finns();
  // EN kapplöpning räcker inte som samtidighetsvakt: vem som hinner först varierar, och ett prov
  // som fångar sitt eget fel bara ibland ger falskt lugn.
  for (let omgang = 0; omgang < 6; omgang++) {
    await pool.query('DELETE FROM goal_runtime WHERE overlay_id=$1', [OVERLAY]);
    await pool.query('DELETE FROM stream_session_pointer WHERE workspace_id=$1', [WS]);
    await pool.query('DELETE FROM stream_sessions WHERE workspace_id=$1', [WS]);
    sessionNr = 0;
    await nySession(RUM_1);

    await Promise.all([
      H.applyGiftSenderEvent(pool, WS, gava(A, HEART_ME, { id: `hprov:race:${omgang}:1` })),
      H.applyGiftSenderEvent(pool, WS, gava(A, HEART_ME, { id: `hprov:race:${omgang}:2` }))
    ]);
    assert.equal((await malvarde()).visat, 1, `omgång ${omgang}: två samtidiga får inte båda räknas`);
  }
});

prov('processomstart: liggaren bor i Postgres, inte i minnet', async () => {
  finns();
  await nySession(RUM_1);
  await H.applyGiftSenderEvent(pool, WS, gava(A));

  // Ny modulinstans = det närmaste en omstart vi kan komma i process. Ingen delad minnesstruktur
  // får överleva som dedupe — och ingen får försvinna heller.
  delete require.cache[require.resolve('../heart-me-goal')];
  const H2 = require('../heart-me-goal');
  await H2.applyGiftSenderEvent(pool, WS, gava(A, HEART_ME, { id: 'hprov:omstart:1' }));
  assert.equal((await malvarde()).visat, 1, 'dedupen måste överleva en omstart');
});

// ---- FAIL-CLOSED ------------------------------------------------------------------------------

prov('ingen aktiv session ⇒ ingenting räknas', async () => {
  finns();
  // Pekaren är tom (beforeEach har rensat). Utan session finns ingen nyckelrymd att dedupa i,
  // och hellre noll än dubbelräkning.
  await H.applyGiftSenderEvent(pool, WS, gava(A));
  const efter = await malvarde();
  assert.equal(efter ? efter.visat : 0, 0);

  // KONTROLLMÄTNING: med en session räknas samma event.
  await nySession(RUM_1);
  await H.applyGiftSenderEvent(pool, WS, gava(A, HEART_ME, { id: 'hprov:failclosed:2' }));
  assert.equal((await malvarde()).visat, 1);
});

prov('tom avsändarnyckel räknas inte', async () => {
  finns();
  await nySession(RUM_1);
  await H.applyGiftSenderEvent(pool, WS, gava('', HEART_ME, { userId: '', username: '' }));
  const efter = await malvarde();
  assert.equal(efter ? efter.visat : 0, 0, 'ett event utan användbart namn får inte bli en rad');
});

prov('avsändarnyckeln är kanoniserad — @Namn och namn är samma person', async () => {
  finns();
  await nySession(RUM_1);
  await H.applyGiftSenderEvent(pool, WS, gava(A, HEART_ME, { username: '@Provgivare_A', userId: '@Provgivare_A' }));
  await H.applyGiftSenderEvent(pool, WS, gava(A, HEART_ME, { username: 'provgivare_a', userId: 'provgivare_a', id: 'hprov:kanon:2' }));
  assert.equal((await malvarde()).visat, 1,
    'samma nyckel som identitet() i stream-stats.js: strip @, trim, lowercase');
});

// ---- ICKE-REGRESSION PÅ LIKE GOAL -------------------------------------------------------------

prov('baseline och target rörs aldrig av räkningen', async () => {
  finns();
  await nySession(RUM_1);
  await H.applyGiftSenderEvent(pool, WS, gava(A));
  const rad = await malvarde();
  assert.equal(Number(rad.baseline), 0, 'baseline ägs av konfigurationen, inte av räknaren');
  assert.ok(Number(rad.target) > 0, 'target måste finnas kvar');
  assert.equal(rad.metric, 'gift_senders', 'Heart Me-målet ska bära den nya metriken');
});

prov('ett templateSocialGoal med goalKind likes påverkas inte', async () => {
  finns();
  await nySession(RUM_1);
  const LIKE_WIDGET = 'templateSocialGoal-prov-0001';
  await pool.query(
    `INSERT INTO goal_runtime (overlay_id, widget_id, metric, baseline, target)
     VALUES ($1,$2,'likes',0,1000) ON CONFLICT (overlay_id, widget_id) DO NOTHING`,
    [OVERLAY, LIKE_WIDGET]);

  await H.applyGiftSenderEvent(pool, WS, gava(A));
  const q = await pool.query('SELECT progress FROM goal_runtime WHERE overlay_id=$1 AND widget_id=$2',
    [OVERLAY, LIKE_WIDGET]);
  assert.equal(Number(q.rows[0].progress), 0, 'en gåva får aldrig knuffa ett like-mål');
});
