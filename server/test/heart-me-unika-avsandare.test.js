'use strict';
// HEART ME GOAL — UNIKA PERSONER SOM SKICKAR GÅVAN HEART ME UNDER AKTUELL LIVE.
//
// Produktkravet (docs/heart-me-goal-design.md): högst +1 per avsändare och sändning, oavsett hur
// många Heart Me hen skickar. Likes och andra gåvor ger +0. Samma person räknas igen nästa LIVE.
//
// Dagens beteende var fel mot kravet: goal-metrics.js mappade templateHeartGoal → 'likes'. Uppmätt
// i test-LIVE 2 (produktion): två unika Heart Me-avsändare, men widgeten visade 48/50 — allt från
// TikTok-likes.
//
// TVÅ OLIKA SKYDD, lätt att blanda ihop:
//   raw.duplicate / goal_event_apply   skyddar mot samma EVENT levererat flera gånger
//   heart_me_bidrag-raden              skyddar mot att samma PERSON bidrar flera gånger
// Proven nedan mäter BÅDA, för det ena döljer inte att det andra saknas.
//
// DEDUPEN ÄR EN PRIMÄRNYCKEL, INTE KOD. heart_me_bidrag(session_id, widget_id, avsandarnyckel) med
// INSERT ... ON CONFLICT DO NOTHING RETURNING: målet ökas bara när insert:en skapade en rad. Ingen
// läsning följd av skrivning, så två samtidiga gåvor från samma person kan inte båda räknas, och en
// processomstart ändrar ingenting eftersom liggaren bor i Postgres.
//
// IDENTITETEN KOMMER FRÅN LÄRLÄGET. Vilken gåva som är Heart Me står i gift_rule_identity under
// nyckeln `heart_me` — riggen skriver den raden som lärläget skulle ha gjort. Ingen katalog, ingen
// namnmatchning.
//
// SYNTETISKA VÄRDEN ÖVERALLT. Inga verkliga konto-, rums- eller användarnamn. Rums-id:n har samma
// 19-siffriga form som TikToks men är påhittade.
const test = require('node:test'), assert = require('node:assert/strict');
const { Pool } = require('pg');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. En unikhetsnyckel går inte att prova mot en attrapp.';

const H = require('../heart-me-goal');
const Regelnycklar = require('../regelnycklar');

const AGARE = 'd0000000-0000-4000-8000-000000000001';
const WS = 'd0000000-1111-4000-8000-000000000001';
const OVERLAY = 'd0000000-2222-4000-8000-000000000002';
const WIDGET = 'templateHeartGoal-prov-0001';

// Syntetiska gåvo-id:n. HEART_ME är den inlärda gåvan; ROSE och OKAND ska aldrig räknas.
const HEART_ME = '9001';
const ROSE = '9002';
const OKAND = '9003';

// Syntetiska rums-id:n, 19 siffror precis som de riktiga — men påhittade.
const RUM_1 = '7600000000000000001';
const RUM_2 = '7600000000000000002';

// Tre påhittade tittare. Namnen i produktbeslutet, som provfilens egna strängar.
const ANNA = 'provgivare_anna', BO = 'provgivare_bo', CILLA = 'provgivare_cilla';

let pool;
const prov = (namn, fn) => test('heart-me: ' + namn, { timeout: 30000, skip: BLOCKED }, fn);

let eventNr = 0;
const gava = (avsandare, giftId = HEART_ME, over = {}) => ({
  id: over.id || 'hprov:' + (++eventNr) + ':' + avsandare,
  type: 'gift', giftId, giftName: over.giftName || 'Heart Me',
  userId: over.userId !== undefined ? over.userId : avsandare,
  username: over.username !== undefined ? over.username : avsandare,
  count: over.count || 1, value: over.value || 5
});

const like = avsandare => ({
  id: 'hprov:' + (++eventNr) + ':like:' + avsandare,
  type: 'like', userId: avsandare, username: avsandare, count: 100
});

// En sändning i taget. Skapar sessionen och pekar pekaren på den — samma väg som startaLive()
// använder, men riggen äger raderna och river dem själv.
const SESSION_BAS = 'd0000000-3333-4000-8000-';
// padStart, inte konkatenering: 'd0000000-3333-4000-8000-00000000000' + 10 hade gett en 13 tecken
// lång sista grupp och ett ogiltigt uuid vid tionde sessionen. Ett tak som beror på hur många prov
// filen råkar ha är inget tak man vill upptäcka i CI.
const sessionId = nr => SESSION_BAS + String(nr).padStart(12, '0');

let sessionNr = 0;
async function nySession(roomId) {
  const id = sessionId(++sessionNr);
  await pool.query(
    `INSERT INTO stream_sessions (id, workspace_id, room_id, account_key, started_at)
     VALUES ($1,$2,$3,'prov-konto', now()) ON CONFLICT (id) DO NOTHING`, [id, WS, roomId]);
  await pool.query(
    `INSERT INTO stream_session_pointer (workspace_id, session_id, updated_at)
     VALUES ($1,$2, now())
     ON CONFLICT (workspace_id) DO UPDATE SET session_id = EXCLUDED.session_id, updated_at = now()`,
    [WS, id]);
  return id;
}

// Det lärläget skulle ha skrivit efter Bekräfta.
const larIn = giftId => pool.query(
  `INSERT INTO gift_rule_identity (workspace_id, rule_key, gift_id, gift_name)
   VALUES ($1,$2,$3,'Heart Me')
   ON CONFLICT (workspace_id, rule_key) DO UPDATE SET gift_id = EXCLUDED.gift_id`,
  [WS, Regelnycklar.HEART_ME, giftId]);

const malrad = async (widgetId = WIDGET) => {
  const q = await pool.query(
    `SELECT baseline + progress AS visat, baseline, progress, target, metric, revision
       FROM goal_runtime WHERE overlay_id=$1 AND widget_id=$2`, [OVERLAY, widgetId]);
  return q.rows[0] || null;
};
const visat = async (widgetId = WIDGET) => {
  const rad = await malrad(widgetId);
  return rad ? Number(rad.visat) : 0;
};

const nyttMal = (widgetId, metric) => pool.query(
  `INSERT INTO goal_runtime (overlay_id, widget_id, metric, baseline, target)
   VALUES ($1,$2,$3,0,50) ON CONFLICT (overlay_id, widget_id) DO NOTHING`,
  [OVERLAY, widgetId, metric]);

test.before(async () => {
  if (BLOCKED) return;
  pool = new Pool({ connectionString: DB_URL });
  await pool.query(
    `INSERT INTO users (id,email,password_hash,display_name,email_verified_at)
     VALUES ($1,$2,'x','heart-me-agare',now()) ON CONFLICT (id) DO NOTHING`, [AGARE, AGARE + '@t.invalid']);
  await pool.query(`INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,'heart-me-prov',$2)
    ON CONFLICT (id) DO NOTHING`, [WS, AGARE]);
  await pool.query(`INSERT INTO overlays (id,workspace_id,name) VALUES ($1,$2,'heart-me-prov')
    ON CONFLICT (id) DO NOTHING`, [OVERLAY, WS]);
});

// Förutsättningar skapas OCH rivs av riggen — aldrig ärvda. Filerna delar databas i CI-jobbet.
async function rensa() {
  await pool.query('DELETE FROM stream_session_pointer WHERE workspace_id=$1', [WS]);
  await pool.query('DELETE FROM stream_sessions WHERE workspace_id=$1', [WS]);  // liggaren cascadar
  await pool.query('DELETE FROM goal_runtime WHERE overlay_id=$1', [OVERLAY]);
  await pool.query('DELETE FROM gift_rule_identity WHERE workspace_id=$1', [WS]);
  // Tom state: migrationsprovet nedan fyller den, och en kvarlämnad widget skulle låta schema.sql:s
  // backfill skapa rader mitt i ett annat prov.
  await pool.query(`UPDATE overlays SET state = '{}'::jsonb WHERE id = $1`, [OVERLAY]);
}

test.beforeEach(async () => {
  if (BLOCKED) return;
  await rensa();
  sessionNr = 0;
  await nyttMal(WIDGET, 'unique_gift_senders');
  await larIn(HEART_ME);
});

test.after(async () => {
  if (BLOCKED) return;
  await rensa();
  await pool.query('DELETE FROM overlays WHERE id=$1', [OVERLAY]);
  await pool.end();
});

// ---- SLUTBEVISET ------------------------------------------------------------------------------
//
// De fyra scenarierna produktbeslutet pekade ut, var för sig och med kontrollmätning.

prov('SLUTBEVIS 1 · Anna skickar tre Heart Me → +1', async () => {
  await nySession(RUM_1);
  for (let i = 0; i < 3; i++) await H.applyHeartMeEvent(pool, WS, gava(ANNA));
  assert.equal(await visat(), 1, 'samma person får bidra högst +1 per sändning');

  // KONTROLLMÄTNING: utan den här halvan går provet grönt även om ingenting alls räknas.
  await H.applyHeartMeEvent(pool, WS, gava(BO));
  assert.equal(await visat(), 2, 'en ny avsändare ska ge +1 — annars räknar inget');
});

prov('SLUTBEVIS 2 · Anna och Bo skickar en var → +2', async () => {
  await nySession(RUM_1);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA));
  await H.applyHeartMeEvent(pool, WS, gava(BO));
  assert.equal(await visat(), 2);
});

prov('SLUTBEVIS 3 · Rose, okänd gåva och likes → +0', async () => {
  await nySession(RUM_1);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, ROSE));
  await H.applyHeartMeEvent(pool, WS, gava(BO, OKAND));
  for (let i = 0; i < 5; i++) await H.applyHeartMeEvent(pool, WS, like(CILLA));
  assert.equal(await visat(), 0, 'varken andra gåvor eller 500 likes får röra ett Heart Me-mål');

  // KONTROLLMÄTNING: samma rigg, rätt gåva, räknas.
  await H.applyHeartMeEvent(pool, WS, gava(ANNA));
  assert.equal(await visat(), 1);
});

prov('SLUTBEVIS 4 · ny livesession → Anna kan bidra +1 igen', async () => {
  await nySession(RUM_1);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA));
  await H.applyHeartMeEvent(pool, WS, gava(ANNA));
  assert.equal(await visat(), 1);

  await nySession(RUM_2);                       // ny session ⇒ ny nyckelrymd
  await H.applyHeartMeEvent(pool, WS, gava(ANNA));
  assert.equal(await visat(), 2, 'Anna räknas på nytt i nästa sändning');
});

// ---- IDENTITETEN ------------------------------------------------------------------------------

prov('utan inlärd heart_me-identitet räknas ingenting', async () => {
  await pool.query('DELETE FROM gift_rule_identity WHERE workspace_id=$1', [WS]);
  await nySession(RUM_1);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA));
  assert.equal(await visat(), 0, 'ingen bekräftad gåva ⇒ hellre noll än fel siffra');

  // KONTROLLMÄTNING: lär in och räkna.
  await larIn(HEART_ME);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME, { id: 'hprov:larin:2' }));
  assert.equal(await visat(), 1);
});

prov('giftName matchar aldrig — bara giftId', async () => {
  await nySession(RUM_1);
  // Rätt NAMN men fel id. normalizer.js:68 defaultar giftName till 'Gift', så namnmatchning skulle
  // räkna varje namnlös gåva som Heart Me.
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, ROSE, { giftName: 'Heart Me' }));
  assert.equal(await visat(), 0, 'namnet får aldrig avgöra');
});

prov('utan giftId i eventet räknas ingenting — ingen namnfallback', async () => {
  await nySession(RUM_1);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, '', { giftName: 'Heart Me' }));
  assert.equal(await visat(), 0);
});

prov('en omlärd identitet flyttar räkningen till det nya id:t', async () => {
  await nySession(RUM_1);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME));
  assert.equal(await visat(), 1);

  // Lärläget körs om och pekar på en annan gåva. Det gamla id:t får inte längre räkna.
  await larIn(OKAND);
  await H.applyHeartMeEvent(pool, WS, gava(BO, HEART_ME, { id: 'hprov:omlard:1' }));
  assert.equal(await visat(), 1, 'föråldrat id räknar inte');
  await H.applyHeartMeEvent(pool, WS, gava(BO, OKAND, { id: 'hprov:omlard:2' }));
  assert.equal(await visat(), 2, 'det nya id:t räknar');
});

// ---- REPLAY, RECONNECT OCH SAMTIDIGHET --------------------------------------------------------

prov('duplicate-flaggan stoppar en replay', async () => {
  await nySession(RUM_1);
  const e = gava(ANNA);
  await H.applyHeartMeEvent(pool, WS, e, { duplicate: true });
  assert.equal(await visat(), 0, 'en replay får aldrig räknas');

  // KONTROLLMÄTNING: samma event utan flaggan räknas.
  await H.applyHeartMeEvent(pool, WS, e);
  assert.equal(await visat(), 1);
});

prov('reconnect: nytt eventId, samma person, samma session ⇒ fortfarande 1', async () => {
  await nySession(RUM_1);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME, { id: 'hprov:reconnect:1' }));
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME, { id: 'hprov:reconnect:2' }));
  assert.equal(await visat(), 1,
    'dedupen får inte hänga på eventId — en reconnect ger nya id:n för samma person');
});

prov('samtidiga gåvor från samma person — sex omgångar, alltid 1', async () => {
  // EN kapplöpning räcker inte som samtidighetsvakt: vem som hinner först varierar, och ett prov
  // som fångar sitt eget fel bara ibland ger falskt lugn.
  for (let omgang = 0; omgang < 6; omgang++) {
    await rensa();
    sessionNr = 0;
    await nyttMal(WIDGET, 'unique_gift_senders');
    await larIn(HEART_ME);
    await nySession(RUM_1);

    await Promise.all([
      H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME, { id: 'hprov:race:' + omgang + ':1' })),
      H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME, { id: 'hprov:race:' + omgang + ':2' }))
    ]);
    assert.equal(await visat(), 1, 'omgång ' + omgang + ': två samtidiga får inte båda räknas');
  }
});

prov('processomstart: liggaren bor i Postgres, inte i minnet', async () => {
  await nySession(RUM_1);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA));

  // Ny modulinstans = det närmaste en omstart vi kommer i process. Ingen delad minnesstruktur får
  // överleva som dedupe — och ingen får försvinna heller.
  delete require.cache[require.resolve('../heart-me-goal')];
  const H2 = require('../heart-me-goal');
  await H2.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME, { id: 'hprov:omstart:1' }));
  assert.equal(await visat(), 1, 'dedupen måste överleva en omstart');
});

// ---- FAIL-CLOSED ------------------------------------------------------------------------------

prov('ingen aktiv session ⇒ ingenting räknas', async () => {
  await pool.query('DELETE FROM stream_session_pointer WHERE workspace_id=$1', [WS]);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA));
  assert.equal(await visat(), 0, 'utan sändning finns ingen nyckelrymd att dedupa i');

  // KONTROLLMÄTNING: med en session räknas samma person.
  await nySession(RUM_1);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME, { id: 'hprov:failclosed:2' }));
  assert.equal(await visat(), 1);
});

prov('tom avsändarnyckel räknas inte', async () => {
  await nySession(RUM_1);
  await H.applyHeartMeEvent(pool, WS, gava('', HEART_ME, { userId: '', username: '' }));
  assert.equal(await visat(), 0, 'ett event utan användbar identitet får inte bli en rad');
});

prov('ett annat workspace kan inte knuffa målet', async () => {
  await nySession(RUM_1);
  const ANNAT_WS = 'd0000000-1111-4000-8000-000000000009';
  await H.applyHeartMeEvent(pool, ANNAT_WS, gava(ANNA));
  assert.equal(await visat(), 0, 'målet är scopat till sitt eget workspace');
});

// ---- AVSÄNDARNYCKELN ÄR PSEUDONYM -------------------------------------------------------------

prov('nyckeln är kanoniserad — @Anna och anna är samma person', async () => {
  await nySession(RUM_1);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME, { username: '@Provgivare_Anna', userId: '@Provgivare_Anna' }));
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME, { username: ANNA, userId: ANNA, id: 'hprov:kanon:2' }));
  assert.equal(await visat(), 1,
    'samma regel som identitet() i stream-stats.js: strip @, trim, lowercase');
});

prov('liggaren lagrar ingen synlig form av namnet', async () => {
  const sessionId = await nySession(RUM_1);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME, { username: '@Provgivare_ANNA', userId: '@Provgivare_ANNA' }));

  const q = await pool.query(
    'SELECT avsandarnyckel FROM heart_me_bidrag WHERE session_id=$1 AND widget_id=$2', [sessionId, WIDGET]);
  assert.equal(q.rowCount, 1);
  assert.equal(q.rows[0].avsandarnyckel, ANNA, 'bara den pseudonyma nyckeln, aldrig visningsnamnet');
  assert.ok(!/[@A-ZÅÄÖ]/.test(q.rows[0].avsandarnyckel), 'ingen versal och inget @ ska ha överlevt');
});

prov('liggaren städas med sändningen — ingen egen rutin behövs', async () => {
  const sessionId = await nySession(RUM_1);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA));
  const fore = await pool.query('SELECT 1 FROM heart_me_bidrag WHERE session_id=$1', [sessionId]);
  assert.equal(fore.rowCount, 1);

  await pool.query('DELETE FROM stream_session_pointer WHERE workspace_id=$1', [WS]);
  await pool.query('DELETE FROM stream_sessions WHERE id=$1', [sessionId]);
  const efter = await pool.query('SELECT 1 FROM heart_me_bidrag WHERE session_id=$1', [sessionId]);
  assert.equal(efter.rowCount, 0, 'ON DELETE CASCADE ÄR städningen');
});

// ---- METRIKEN STÅR UTANFÖR DEN GENERELLA VÄGEN ------------------------------------------------

prov('en vanlig gåva kan inte öka Heart Me Goal via goal-motorn', async () => {
  const GoalRuntime = require('../goal-runtime');
  await nySession(RUM_1);

  // Den generella vägen: contributionsFor() är det som matar de fem gamla metrikerna. Får den
  // producera unique_gift_senders skulle varje Rose i rummet knuffa Heart Me Goal.
  const bidrag = GoalRuntime.contributionsFor(gava(ANNA, HEART_ME));
  assert.ok(Array.isArray(bidrag) && bidrag.length > 0, 'en gåva ska fortfarande mata gifts/diamonds');
  for (const [metrik] of bidrag) {
    assert.notEqual(metrik, 'unique_gift_senders',
      'den generella gåvovägen får ALDRIG producera unika-givare-metriken');
  }
  assert.equal(await visat(), 0,
    'och målet står kvar på noll: den generella vägen rörde det aldrig');
});

prov('ett templateSocialGoal med likes påverkas inte av en Heart Me', async () => {
  await nySession(RUM_1);
  const LIKE_WIDGET = 'templateSocialGoal-prov-0001';
  await nyttMal(LIKE_WIDGET, 'likes');

  await H.applyHeartMeEvent(pool, WS, gava(ANNA));
  assert.equal(Number((await malrad(LIKE_WIDGET)).progress), 0, 'en gåva får aldrig knuffa ett like-mål');
  assert.equal(await visat(), 1, 'medan Heart Me-målet räknade som det ska');
});

prov('baseline och target rörs aldrig av räkningen', async () => {
  await nySession(RUM_1);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA));
  const rad = await malrad();
  assert.equal(Number(rad.baseline), 0, 'baseline ägs av konfigurationen, inte av räknaren');
  assert.equal(Number(rad.target), 50, 'target måste stå kvar');
  assert.equal(rad.metric, 'unique_gift_senders', 'Heart Me-målet ska bära den nya metriken');
  assert.ok(Number(rad.revision) > 0, 'revision måste stiga — annars ser klienten aldrig ändringen');
});

// ---- MIGRATIONEN ------------------------------------------------------------------------------
//
// Det farligaste i hela ändringen. CREATE TABLE IF NOT EXISTS gör ingenting alls med en tabell som
// redan finns, så den utökade CHECK-listan i tabelldefinitionen når ALDRIG en befintlig databas.
// Huset har gått på exakt den minan två gånger förut (revision-kolumnen, trial_end). Proven nedan
// mäter det MIGRERADE villkoret, inte texten i schema.sql.

prov('metrikvillkoret släpper in unique_gift_senders men inget påhittat', async () => {
  await pool.query(
    `INSERT INTO goal_runtime (overlay_id, widget_id, metric, target)
     VALUES ($1,'migprov-ny','unique_gift_senders',10)`, [OVERLAY]);

  // KONTROLLMÄTNING: villkoret är fortfarande ett villkor och inte bortdroppat.
  await assert.rejects(() => pool.query(
    `INSERT INTO goal_runtime (overlay_id, widget_id, metric, target)
     VALUES ($1,'migprov-fel','subscribers',10)`, [OVERLAY]), /metric/i,
    'en påhittad metrik måste fortfarande avvisas — annars droppades villkoret bara');

  // Och de fem gamla står kvar. Tillägget var additivt, inte en ersättning.
  for (const m of ['follows', 'likes', 'shares', 'gifts', 'diamonds']) {
    await pool.query(
      `INSERT INTO goal_runtime (overlay_id, widget_id, metric, target)
       VALUES ($1,$2,$3,10)`, [OVERLAY, 'migprov-' + m, m]);
  }
});

prov('schema.sql är idempotent — en omkörning är en no-op', async () => {
  // Varje deploy kör migrate.js, som kör HELA schema.sql igen. Ett DROP CONSTRAINT som körs varje
  // gång vore ett fönster där villkoret inte finns; blocket ska därför inte göra något andra gången.
  const fs = require('node:fs'), path = require('node:path');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(sql);
  await pool.query(sql);

  const q = await pool.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = 'goal_runtime'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%diamonds%'`);
  assert.equal(q.rowCount, 1, 'exakt ett metrikvillkor ska finnas — inte noll, inte två');
  assert.match(q.rows[0].def, /unique_gift_senders/, 'och det ska känna den nya metriken');
});

prov('engångsrättningen flyttar ett BEFINTLIGT Heart Me-mål bort från likes', async () => {
  // Det här är hela poängen med migrationen. Backfillen och syncGoalsFromState är båda
  // ON CONFLICT DO NOTHING, så en rad som REDAN finns rörs av ingen av dem. Utan rättningen hade
  // varje Heart Me Goal som skapades före det här släppet fortsatt räkna TikTok-likes i produktion.
  const fs = require('node:fs'), path = require('node:path');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');

  // En overlay-state som gör widgeten till ett Heart Me Goal, och en runtime-rad som ser ut som
  // produktion såg ut i test-LIVE 2: metric likes, en hög ackumulerad likessiffra.
  await pool.query(`UPDATE overlays SET state = $2 WHERE id = $1`,
    [OVERLAY, JSON.stringify({ widgets: [{ id: WIDGET, type: 'templateHeartGoal' }] })]);
  await pool.query('DELETE FROM goal_runtime WHERE overlay_id=$1', [OVERLAY]);
  await pool.query(
    `INSERT INTO goal_runtime (overlay_id, widget_id, metric, baseline, progress, target, epoch)
     VALUES ($1,$2,'likes',5,433,50,1)`, [OVERLAY, WIDGET]);

  await pool.query(sql);
  const efter = await malrad();
  assert.equal(efter.metric, 'unique_gift_senders', 'metriken måste rättas');
  assert.equal(Number(efter.progress), 0, '433 var likes och betyder ingenting för unika givare');
  assert.equal(Number(efter.baseline), 5, 'baseline är streamerns eget startvärde och rörs inte');
  assert.equal(Number(efter.target), 50, 'målet rörs inte');
  assert.ok(Number(efter.epoch) > 1, 'epoch måste stiga — klienten ska se det som en nollställning');

  // KONTROLLMÄTNING: rättningen är riktad. Ett äkta like-mål i samma overlay rörs inte.
  await pool.query(`UPDATE overlays SET state = $2 WHERE id = $1`,
    [OVERLAY, JSON.stringify({ widgets: [
      { id: WIDGET, type: 'templateHeartGoal' },
      { id: 'likemal', type: 'templateSocialGoal', goalKind: 'likes' }] })]);
  await pool.query(
    `INSERT INTO goal_runtime (overlay_id, widget_id, metric, baseline, progress, target)
     VALUES ($1,'likemal','likes',0,120,1000)`, [OVERLAY]);
  await pool.query(sql);
  const like = await malrad('likemal');
  assert.equal(like.metric, 'likes', 'ett riktigt like-mål får inte dras med');
  assert.equal(Number(like.progress), 120, 'och dess siffra får inte nollställas');

  // Och idempotent: en andra körning rör ingenting mer.
  await pool.query(sql);
  assert.equal(Number((await malrad()).progress), 0);
  assert.equal(Number((await malrad('likemal')).progress), 120);

  await pool.query(`UPDATE overlays SET state = '{}'::jsonb WHERE id = $1`, [OVERLAY]);
});

prov('liggaren kaskaderar från stream_sessions', async () => {
  const q = await pool.query(
    `SELECT confdeltype FROM pg_constraint
      WHERE conrelid = 'heart_me_bidrag'::regclass AND contype = 'f'`);
  assert.equal(q.rowCount, 1, 'liggaren ska ha exakt en främmande nyckel');
  assert.equal(q.rows[0].confdeltype, 'c',
    'utan ON DELETE CASCADE blir liggaren en pseudonym personuppgift som aldrig städas');
});

// ---- KÄLLVAKTER (kräver ingen databas) --------------------------------------------------------

test('vakt: riggens uuid-konstanter är giltiga uuid', () => {
  // Filen är BLOCKERAD utan databas, så konstanterna parsades aldrig lokalt. Den första versionen
  // bar `hhhhhhhh-0000-...` — det SER ut som ett uuid, men h är ingen hex-siffra. Felet syntes
  // först efter ett fullt CI-varv, där alla 29 prov föll i test.before på
  // "invalid input syntax for type uuid". Det här provet kör utan databas och kostar ingenting.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  for (const [namn, varde] of [['AGARE', AGARE], ['WS', WS], ['OVERLAY', OVERLAY]]) {
    assert.match(varde, UUID, namn + ' är inget giltigt uuid');
  }
  // Sessionsid:t byggs ihop, så både basen och löpnumret måste hålla — även förbi nio.
  for (const nr of [1, 2, 9, 10, 123]) {
    assert.match(sessionId(nr), UUID, 'sessionsid ' + nr + ' är inget giltigt uuid');
  }
  // KONTROLLMÄTNING: mönstret nekar precis det som föll i CI.
  assert.ok(!UUID.test('hhhhhhhh-0000-4000-8000-000000000001'),
    'vakten måste avvisa icke-hex — annars mäter den ingenting');
});

test('vakt: den generella motorn kan inte ens räkna fram unique_gift_senders', () => {
  const GoalRuntime = require('../goal-runtime');

  // Metriken FÅR nämnas i goal-runtime.js — TRANSPORT_METRICS måste känna igen den, annars släpper
  // goal-sse.js aldrig igenom Heart Me-ramen till widgeten. Det som är förbjudet är att motorn
  // MATAR den. Påståendena nedan mäter just den skillnaden, i stället för att leta efter en sträng.
  assert.ok(!GoalRuntime.METRICS.includes('unique_gift_senders'),
    'metriken hör inte hemma bland de metriker motorn matar');
  assert.ok(GoalRuntime.TRANSPORT_METRICS.includes('unique_gift_senders'),
    'men ramen måste få färdas — annars står widgeten still tills sidan laddas om');

  // goalAmount kastar för en metrik motorn inte känner: den kan alltså inte tyst ge ett belopp.
  assert.throws(() => GoalRuntime.goalAmount('unique_gift_senders', { type: 'gift', count: 3, value: 15 }),
    /metrik/i, 'motorn får inte kunna beräkna ett belopp för metriken');

  // Ingen händelsetyp får producera den. Svepet täcker alla fyra, inte bara gåvan.
  const handelser = [
    { type: 'gift', count: 3, value: 15, giftId: HEART_ME },
    { type: 'like', count: 100 }, { type: 'follow' }, { type: 'share' }
  ];
  for (const h of handelser) {
    for (const [metrik] of GoalRuntime.contributionsFor(h)) {
      assert.notEqual(metrik, 'unique_gift_senders',
        'händelsetypen ' + h.type + ' matade unika-givare-metriken');
    }
  }

  // KONTROLLMÄTNING: svepet kan hitta något alls — annars bevisar slingan ingenting.
  assert.ok(GoalRuntime.contributionsFor({ type: 'gift', count: 3, value: 15 }).length > 0);
});

test('vakt: heart-me-goal.js matchar aldrig på giftName', () => {
  const fs = require('node:fs'), path = require('node:path');
  const kall = fs.readFileSync(path.join(__dirname, '..', 'heart-me-goal.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/).map(r => r.replace(/\/\/.*$/, '')).join('\n');

  assert.ok(!/giftName/.test(kall), 'ingen namnmatchning, inte ens som reserv');
  assert.ok(!/'Heart Me'/.test(kall), 'inget hårdkodat gåvonamn');
  assert.ok(/slaUppGiftId/.test(kall), 'identiteten måste komma från lärläget');
});

test('vakt: klient och server är överens om Heart Me-metriken', () => {
  const Metrics = require('../goal-metrics');
  assert.equal(Metrics.metricForWidget({ type: 'templateHeartGoal' }), 'unique_gift_senders');
  assert.equal(Metrics.metricForWidget({ type: 'templateSocialGoal', goalKind: 'likes' }), 'likes',
    'like-målet får inte ha följt med i ändringen');
});
