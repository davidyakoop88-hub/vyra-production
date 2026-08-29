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
// AVSÄNDARNYCKELN ÄR EN HMAC över (workspace, session, normaliserad identitet). Proven kräver att
// namnet inte går att läsa ur den, att den är stabil inom en sändning men ANNORLUNDA i nästa, att
// databasen fysiskt vägrar ta emot något som inte är 64 hex, och att en saknad hemlighet ger
// fail-closed utan att kasta.
//
// SYNTETISKA VÄRDEN ÖVERALLT. Inga verkliga konto-, rums- eller användarnamn. Rums-id:n har samma
// 19-siffriga form som TikToks men är påhittade.
const REGION = 'SE';
// Kontrolltal for riggens sma listor — proven har mater inte fullstandighet.
const kt = poster => {
  const unika = new Set();
  let utanId = 0;
  for (const p of poster) { const id = String((p && p.id) || ''); if (id) unika.add(id); else utanId += 1; }
  return { poster: poster.length, unikaId: unika.size, utanId };
};   // observerad region i riggen — aldrig gissad i produktion
const test = require('node:test'), assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');

// Syntetisk hemlighet, satt FÖRE modulen laddas. Postgres-jobbet sätter ingen APP_ENCRYPTION_KEY,
// och den riktiga produktionshemligheten ska självklart aldrig finnas i ett prov. 32 bytes
// base64url är samma form som token-vault.js kräver.
process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64url');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. En unikhetsnyckel går inte att prova mot en attrapp.';

const H = require('../heart-me-goal');
const Regelnycklar = require('../regelnycklar');
const Gavokatalog = require('../gavokatalog');

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
    // SELECT *, inte en handplockad kolumnlista. En kolumn som glöms bort ger `undefined`, och
    // `Number(undefined) > 1` är tyst falskt — precis så föll epoch-påståendet i CI en gång.
    `SELECT *, baseline + progress AS visat
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

  // DET GLOBALA REGISTRET HAR INGEN WORKSPACE-KOLUMN, och Postgres-jobbet kör alla provfiler mot
  // SAMMA databas. En verifierad rad som gavokatalog.test.js lämnat efter sig hade därför gjort en
  // gåva matchbar mitt i ett prov här. Cachen måste tömmas i samma andetag: den lever i processen
  // och överlever en DELETE bakom ryggen på sig — precis så blev ett 403-prov falskt godkänt.
  await pool.query('DELETE FROM gavoregel WHERE gift_id = ANY($1)', [[HEART_ME, ROSE, OKAND]]);
  await pool.query('DELETE FROM gavokatalog WHERE gift_id = ANY($1)', [[HEART_ME, ROSE, OKAND]]);
  await pool.query('DELETE FROM gavoseedning');   // kaskaderar inte
  Gavokatalog.tomCache();

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

// ---- AVSÄNDARNYCKELN ÄR EN HMAC ---------------------------------------------------------------
//
// Produktbeslut 2026-08-27: det ska inte gå att läsa ett tittarnamn ur liggaren. Nyckeln är
// HMAC-SHA256(härledd nyckel, workspace + session + normaliserad identitet).

const nyckelrader = sessionId => pool.query(
  'SELECT avsandarnyckel FROM heart_me_bidrag WHERE session_id=$1 AND widget_id=$2',
  [sessionId, WIDGET]).then(q => q.rows.map(r => r.avsandarnyckel));

prov('normaliseringen sker FÖRST — @Anna och anna är samma person', async () => {
  await nySession(RUM_1);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME, { username: '@Provgivare_Anna', userId: '@Provgivare_Anna' }));
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME, { username: ANNA, userId: ANNA, id: 'hprov:kanon:2' }));
  assert.equal(await visat(), 1,
    'hashas namnet före normaliseringen blir @Anna och anna två personer och räknas två gånger');
});

prov('nyckeln är en HMAC — 64 hex, och namnet går inte att läsa ur den', async () => {
  const sessionId = await nySession(RUM_1);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME, { username: '@Provgivare_ANNA', userId: '@Provgivare_ANNA' }));

  const nycklar = await nyckelrader(sessionId);
  assert.equal(nycklar.length, 1);
  assert.match(nycklar[0], /^[0-9a-f]{64}$/, 'ska vara 64 hex-tecken');
  assert.ok(!nycklar[0].includes(ANNA), 'det normaliserade namnet får inte finnas i nyckeln');
  assert.ok(!nycklar[0].includes('provgivare'), 'inte ens en del av namnet');
});

prov('SAMMA person i SAMMA sändning ger samma nyckel', async () => {
  const sessionId = await nySession(RUM_1);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME, { id: 'hprov:stabil:1' }));
  const forsta = (await nyckelrader(sessionId))[0];

  // Andra gåvan från samma person: nyckeln måste kollidera med den befintliga raden, annars vore
  // hela engångsräkningen bruten — det är just kollisionen som gör att målet inte ökas igen.
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME, { id: 'hprov:stabil:2' }));
  const nycklar = await nyckelrader(sessionId);
  assert.equal(nycklar.length, 1, 'en instabil nyckel hade gett en andra rad');
  assert.equal(nycklar[0], forsta, 'nyckeln måste vara identisk inom sändningen');
  assert.equal(await visat(), 1);
});

prov('SAMMA person i NÄSTA sändning ger en ANNAN nyckel', async () => {
  // Hela poängen med att binda sessionen. Att session_id står i primärnyckeln gör raderna
  // ÅTSKILDA — men med samma nyckelvärde hade man ändå sett att samma person återkom sändning
  // efter sändning. Olänkbarhet kräver att värdet självt skiljer sig.
  const sess1 = await nySession(RUM_1);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME, { id: 'hprov:sess1' }));
  const nyckel1 = (await nyckelrader(sess1))[0];

  const sess2 = await nySession(RUM_2);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME, { id: 'hprov:sess2' }));
  const nyckel2 = (await nyckelrader(sess2))[0];

  assert.ok(nyckel1 && nyckel2);
  assert.notEqual(nyckel2, nyckel1, 'samma nyckel i två sändningar gör raderna länkbara över tid');
  assert.match(nyckel2, /^[0-9a-f]{64}$/);
});

prov('databasen VÄGRAR ta emot något som inte är en hash', async () => {
  // Skyddet ska sitta i databasen, inte bara i koden. Skickar en framtida bugg dit ett klartextnamn
  // ska skrivningen falla — inte lyckas tyst.
  const sessionId = await nySession(RUM_1);
  await assert.rejects(() => pool.query(
    `INSERT INTO heart_me_bidrag (session_id, widget_id, avsandarnyckel) VALUES ($1,$2,$3)`,
    [sessionId, WIDGET, ANNA]), /avsandarnyckel/i, 'ett klartextnamn accepterades');

  // Även nästan-rätt form ska nekas: fel längd och versaler.
  await assert.rejects(() => pool.query(
    `INSERT INTO heart_me_bidrag (session_id, widget_id, avsandarnyckel) VALUES ($1,$2,$3)`,
    [sessionId, WIDGET, 'a'.repeat(63)]), /avsandarnyckel/i, 'fel längd accepterades');
  await assert.rejects(() => pool.query(
    `INSERT INTO heart_me_bidrag (session_id, widget_id, avsandarnyckel) VALUES ($1,$2,$3)`,
    [sessionId, WIDGET, 'A'.repeat(64)]), /avsandarnyckel/i, 'versaler accepterades');

  // KONTROLLMÄTNING: en riktig hash släpps igenom.
  await pool.query(
    `INSERT INTO heart_me_bidrag (session_id, widget_id, avsandarnyckel) VALUES ($1,$2,$3)`,
    [sessionId, WIDGET, 'b'.repeat(64)]);
});

prov('utan hemlighet: ingen ökning, ingen rad, inget kastat fel', async () => {
  // Fail-closed. Liveflödet får inte märka något — anropet ska returnera tyst, inte kasta.
  const sessionId = await nySession(RUM_1);
  const sparad = process.env.APP_ENCRYPTION_KEY;
  delete process.env.APP_ENCRYPTION_KEY;
  try {
    const ut = await H.applyHeartMeEvent(pool, WS, gava(ANNA));
    assert.equal(ut.okade, 0, 'ingen ökning utan hemlighet');
    assert.equal(await visat(), 0);
    assert.deepEqual(await nyckelrader(sessionId), [], 'ingen rad får skrivas');
  } finally {
    process.env.APP_ENCRYPTION_KEY = sparad;
  }

  // KONTROLLMÄTNING: med hemligheten tillbaka räknas samma person.
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME, { id: 'hprov:hemlig:2' }));
  assert.equal(await visat(), 1);
});

prov('en felformad hemlighet duger inte heller', async () => {
  const sparad = process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY = 'for-kort';        // inte 32 bytes base64url
  try {
    await nySession(RUM_1);
    await H.applyHeartMeEvent(pool, WS, gava(ANNA));
    assert.equal(await visat(), 0, 'en hemlighet med fel form ska behandlas som ingen hemlighet');
  } finally {
    process.env.APP_ENCRYPTION_KEY = sparad;
  }
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

// ---- ENGÅNGSRÄTTNINGEN, PUNKT FÖR PUNKT -------------------------------------------------------
//
// Migrationens hela poäng: backfillen och syncGoalsFromState är BÅDA ON CONFLICT DO NOTHING, så en
// rad som redan finns rörs av ingen av dem. Utan rättningen hade varje Heart Me Goal som skapades
// före det här släppet fortsatt räkna TikTok-likes i produktion.
//
// Fem påståenden, fem prov. Att slå ihop dem DÖLJER den farligaste varianten: så länge progress
// redan är noll kan ett prov inte skilja "rättningen rörde ingenting" från "rättningen nollställde
// en gång till". Därför har både den redan rättade raden och idempotensen egna prov med en siffra
// som INTE är noll.

const SCHEMA = () => require('node:fs')
  .readFileSync(require('node:path').join(__dirname, '..', 'schema.sql'), 'utf8');
const deploy = () => pool.query(SCHEMA());          // exakt vad migrate.js gör vid varje deploy

const medState = widgets => pool.query(
  'UPDATE overlays SET state = $2 WHERE id = $1', [OVERLAY, JSON.stringify({ widgets })]);

const medRad = (widgetId, metric, baseline, progress, target = 50, epoch = 1) => pool.query(
  `INSERT INTO goal_runtime (overlay_id, widget_id, metric, baseline, progress, target, epoch)
   VALUES ($1,$2,$3,$4,$5,$6,$7)
   ON CONFLICT (overlay_id, widget_id) DO UPDATE
     SET metric = EXCLUDED.metric, baseline = EXCLUDED.baseline, progress = EXCLUDED.progress,
         target = EXCLUDED.target, epoch = EXCLUDED.epoch`,
  [OVERLAY, widgetId, metric, baseline, progress, target, epoch]);

const HEART_WIDGET = { id: WIDGET, type: 'templateHeartGoal' };
const LIKE_WIDGET = { id: 'likemal-prov', type: 'templateSocialGoal', goalKind: 'likes' };

prov('rättningen · ett GAMMALT Heart Me-mål flyttas bort från likes', async () => {
  // Raden ser ut som produktionen såg ut i test-LIVE 2: metric likes, hög ackumulerad likessiffra.
  await medState([HEART_WIDGET]);
  await medRad(WIDGET, 'likes', 5, 433, 50, 1);

  await deploy();
  const efter = await malrad();
  assert.equal(efter.metric, 'unique_gift_senders', 'metriken måste rättas');
  assert.equal(Number(efter.progress), 0, '433 var likes och betyder ingenting för unika givare');
  assert.ok(Number(efter.epoch) > 1, 'epoch måste stiga — klienten ska se det som en nollställning');
});

prov('rättningen · baseline och target överlever orörda', async () => {
  await medState([HEART_WIDGET]);
  await medRad(WIDGET, 'likes', 5, 433, 77, 1);

  await deploy();
  const efter = await malrad();
  assert.equal(Number(efter.baseline), 5, 'baseline är startvärdet streamern skrev in — en annan sak');
  assert.equal(Number(efter.target), 77, 'målet ägs av konfigurationen och rörs aldrig av en migration');
});

prov('rättningen · ett vanligt Like Goal rörs inte', async () => {
  await medState([HEART_WIDGET, LIKE_WIDGET]);
  await medRad(WIDGET, 'likes', 0, 433, 50, 1);
  await medRad(LIKE_WIDGET.id, 'likes', 0, 120, 1000, 3);

  await deploy();
  const like = await malrad(LIKE_WIDGET.id);
  assert.equal(like.metric, 'likes', 'ett riktigt like-mål får inte dras med');
  assert.equal(Number(like.progress), 120, 'och dess siffra får inte nollställas');
  assert.equal(Number(like.epoch), 3, 'inte heller dess epoch — det var ingen nollställning för den');

  // KONTROLLMÄTNING: rättningen gjorde ändå sitt jobb på hjärtmålet i samma overlay.
  assert.equal((await malrad()).metric, 'unique_gift_senders');
});

prov('rättningen · ett REDAN RÄTT Heart Me-mål nollställs inte vid nästa deploy', async () => {
  // DET FARLIGASTE PROVET. Om villkoret hade matchat på widgettyp i stället för på fel metrik hade
  // varje deploy nollställt ett fungerande mål mitt i sändningen — och ett prov där progress redan
  // är noll hade inte märkt något. Därför står siffran här på sju.
  await medState([HEART_WIDGET]);
  await medRad(WIDGET, 'unique_gift_senders', 2, 7, 50, 4);

  await deploy();
  const efter = await malrad();
  assert.equal(Number(efter.progress), 7, 'sju unika givare får inte försvinna vid en deploy');
  assert.equal(Number(efter.epoch), 4, 'och epoch får inte stiga — ingen nollställning skedde');
  assert.equal(Number(efter.baseline), 2);
  assert.equal(efter.metric, 'unique_gift_senders');
});

prov('rättningen · är idempotent, epoch stiger exakt EN gång över tre deploys', async () => {
  await medState([HEART_WIDGET]);
  await medRad(WIDGET, 'likes', 5, 433, 50, 1);

  await deploy();
  const forsta = await malrad();
  assert.equal(Number(forsta.progress), 0, 'första deployen rättar');
  const epokEfterRattning = Number(forsta.epoch);
  assert.ok(epokEfterRattning > 1);

  // Två deploys till. En rättning som körde om hade synts som en epoch till.
  await deploy();
  await deploy();
  const efter = await malrad();
  assert.equal(Number(efter.epoch), epokEfterRattning,
    'rättningen körde om — då nollställs målet vid varje deploy för all framtid');
  assert.equal(Number(efter.progress), 0);
  assert.equal(Number(efter.baseline), 5);
});

prov('liggaren har exakt tre kolumner — ingen plats för namn, gåva eller payload', async () => {
  // Strukturellt, inte innehållsligt. Ett prov som bara läser raderna hade gått grönt dagen någon
  // lade till en `username`- eller `gift_id`-kolumn "för felsökning". En ny kolumn i liggaren är en
  // ny personuppgift och ska kräva ett medvetet beslut, inte glida in.
  const q = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'heart_me_bidrag' ORDER BY column_name`);
  assert.deepEqual(q.rows.map(r => r.column_name),
    ['avsandarnyckel', 'session_id', 'widget_id'],
    'liggaren ska bära nyckeln och ingenting annat — ingen payload, ingen gåva, inget visningsnamn');
});

prov('liggaren bär varken giftId, namn eller payload efter en riktig gåva', async () => {
  const sessionId = await nySession(RUM_1);
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME,
    { username: '@Provgivare_ANNA', userId: '@Provgivare_ANNA' }));

  const q = await pool.query('SELECT * FROM heart_me_bidrag WHERE session_id=$1', [sessionId]);
  assert.equal(q.rowCount, 1);
  const varden = Object.values(q.rows[0]).map(String).join(' | ');
  assert.ok(!varden.includes(HEART_ME), 'gåvans id får inte lagras i liggaren');
  assert.ok(!varden.includes('@'), 'ingen @-form av namnet får ha överlevt');
  assert.ok(!varden.includes('Provgivare_ANNA'), 'det råa visningsnamnet får inte lagras');
  assert.ok(!varden.includes(ANNA), 'inte heller den normaliserade formen — nyckeln är en HMAC');
  assert.ok(!varden.includes('Heart Me'), 'inget gåvonamn');

  // KONTROLLMÄTNING: raden finns och bär faktiskt en hash — annars mäter negationerna ingenting.
  assert.match(q.rows[0].avsandarnyckel, /^[0-9a-f]{64}$/);
});

prov('målraden som går ut på SSE bär ingen avsändarnyckel', async () => {
  // Det som publiceras är goal_runtime-raden. Skulle nyckeln någonsin följa med dit vore den ute på
  // en publik overlay-ström.
  await nySession(RUM_1);
  const ut = await H.applyHeartMeEvent(pool, WS, gava(ANNA));
  assert.equal(ut.rader.length, 1, 'en rad ska ha publicerats');
  const text = JSON.stringify(ut.rader[0]);
  assert.ok(!/avsandarnyckel/i.test(text), 'ramen får inte ens ha fältet');
  assert.ok(!text.includes(ANNA), 'och inget namn');
  assert.ok(!text.includes(HEART_ME), 'och inget giftId');
});

prov('liggaren kaskaderar från stream_sessions', async () => {
  const q = await pool.query(
    `SELECT confdeltype FROM pg_constraint
      WHERE conrelid = 'heart_me_bidrag'::regclass AND contype = 'f'`);
  assert.equal(q.rowCount, 1, 'liggaren ska ha exakt en främmande nyckel');
  assert.equal(q.rows[0].confdeltype, 'c',
    'utan ON DELETE CASCADE blir liggaren en personuppgift som aldrig städas');
});

// ---- DET GLOBALA REGISTRET ---------------------------------------------------------------------
//
// Det här blocket saknades helt, och det var PR #289:s hela poäng. Mutationsmätt 2026-08-29: med
// `Gavokatalog.verifieradeId` bortklippt ur heart-me-goal.js gick alla 44 prov och alla 7 vakter
// gröna. Inget prov band målet till registret; källvakten intygade RESERVEN.
//
// Proven nedan använder INTE lärläget. `beforeEach` lär visserligen in HEART_ME, så varje prov
// river den raden först — annars kan reserven svara och dölja att registret aldrig lästes.

// Det en plattformsadministratör gör via POST /api/admin/gavokatalog + .../verifiera.
const verifieraGlobalt = async giftId => {
  await Gavokatalog.noteraKatalog(pool, [{ id: giftId, name: 'Heart Me', diamond_count: 1 }], { region: REGION , forvantat: kt([{ id: giftId, name: 'Heart Me', diamond_count: 1 }]) });
  const ut = await Gavokatalog.verifiera(pool, Regelnycklar.HEART_ME, giftId);
  assert.equal(ut.ok, true, 'riggen kunde inte verifiera — provet nedan hade blivit meningslöst');
};

prov('registret · en globalt verifierad gåva räknas UTAN att lärläget använts', async () => {
  await pool.query('DELETE FROM gift_rule_identity WHERE workspace_id=$1', [WS]);
  await nySession(RUM_1);

  // KONTROLLMÄTNING FÖRST: utan registret och utan lärläge ska ingenting hända. Annars bevisar
  // provet nedan bara att någonting råkade räknas.
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME));
  assert.equal(await visat(), 0, 'varken register eller lärläge ⇒ ingen ökning');

  await verifieraGlobalt(HEART_ME);
  await H.applyHeartMeEvent(pool, WS, gava(BO, HEART_ME));
  assert.equal(await visat(), 1, 'en globalt verifierad gåva måste räknas i ett workspace som aldrig lärt in');
});

prov('registret · EN verifiering räcker för ALLA workspaces', async () => {
  await pool.query('DELETE FROM gift_rule_identity WHERE workspace_id=$1', [WS]);
  await verifieraGlobalt(HEART_ME);
  await nySession(RUM_1);

  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME));
  assert.equal(await visat(), 1);

  // Samma register, ett ANNAT workspace som aldrig rört lärläget. Registret har ingen
  // workspace-kolumn, och det är precis det som gör en verifiering global.
  const q = await pool.query(
    `SELECT gift_id FROM gavoregel WHERE rule_key=$1 AND status='verifierad'`, [Regelnycklar.HEART_ME]);
  assert.deepEqual(q.rows.map(r => r.gift_id), [HEART_ME]);
  const kolumner = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='gavoregel'`);
  assert.ok(!kolumner.rows.some(r => r.column_name.includes('workspace')),
    'en workspace-kolumn hade gjort registret per konto igen');
});

prov('registret · en gåva som BARA ligger i katalogen räknas inte', async () => {
  await pool.query('DELETE FROM gift_rule_identity WHERE workspace_id=$1', [WS]);
  await nySession(RUM_1);

  // Katalogen är etikettering. Att stå i den får aldrig räcka — det är hela skälet till att
  // identiteten bor i en egen tabell.
  await Gavokatalog.noteraKatalog(pool, [{ id: HEART_ME, name: 'Heart Me', diamond_count: 1 }], { region: REGION , forvantat: kt([{ id: HEART_ME, name: 'Heart Me', diamond_count: 1 }]) });
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME));
  assert.equal(await visat(), 0, 'katalogpost utan verifierad regel ökade målet');
});

prov('registret · en verifierad gåva räknar inte NÅGON ANNAN gåva', async () => {
  await pool.query('DELETE FROM gift_rule_identity WHERE workspace_id=$1', [WS]);
  await verifieraGlobalt(HEART_ME);
  await nySession(RUM_1);

  await H.applyHeartMeEvent(pool, WS, gava(ANNA, ROSE));
  await H.applyHeartMeEvent(pool, WS, gava(BO, OKAND));
  assert.equal(await visat(), 0, 'fel gåva ökade målet — husets värsta utfall');

  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME));
  assert.equal(await visat(), 1, 'rätt gåva räknades inte');
});

prov('registret · lärläget är kvar som RESERV för en gåva registret inte täcker', async () => {
  await verifieraGlobalt(ROSE);          // registret täcker en ANNAN gåva
  await larIn(HEART_ME);                 // lärläget täcker den vi skickar
  await nySession(RUM_1);

  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME));
  assert.equal(await visat(), 1, 'reserven slutade fungera när registret infördes');
});


prov('registret · FLERA REGIONALA ID för samma regel räknas alla', async () => {
  // Samma gåva bär olika id i olika regioner. Uppslaget måste vara en LISTA hela vägen fram till
  // målet — inte bara i modulen. Faller det här provet matchar bara ett av id:na, och kunder i
  // fel region ser en widget som aldrig rör sig.
  await pool.query('DELETE FROM gift_rule_identity WHERE workspace_id=$1', [WS]);
  await Gavokatalog.noteraKatalog(pool, [
    { id: HEART_ME, name: 'Heart Me', diamond_count: 1 },
    { id: ROSE, name: 'Heart Me', diamond_count: 1 }      // regional variant, ANNAT id
  ], { region: REGION , forvantat: kt([
    { id: HEART_ME, name: 'Heart Me', diamond_count: 1 },
    { id: ROSE, name: 'Heart Me', diamond_count: 1 }      // regional variant, ANNAT id
  ]) });
  await Gavokatalog.verifiera(pool, Regelnycklar.HEART_ME, HEART_ME);
  await Gavokatalog.verifiera(pool, Regelnycklar.HEART_ME, ROSE);
  await nySession(RUM_1);

  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME));
  assert.equal(await visat(), 1, 'det första regionala id:t räknades inte');

  await H.applyHeartMeEvent(pool, WS, gava(BO, ROSE));
  assert.equal(await visat(), 2, 'det ANDRA regionala id:t räknades inte — uppslaget bär bara ett');

  // Och unikheten gäller PERSONEN, inte id:t: samma person via den andra varianten ger +0.
  await H.applyHeartMeEvent(pool, WS, gava(ANNA, ROSE));
  assert.equal(await visat(), 2, 'samma person räknades två gånger via ett annat regionalt id');

  const rader = await pool.query('SELECT count(*)::int n FROM heart_me_bidrag');
  assert.equal(rader.rows[0].n, 2, 'liggaren fick en rad per gåvo-id i stället för per person');
});

prov('registret · en INAKTIVERAD post slutar räkna omedelbart', async () => {
  await pool.query('DELETE FROM gift_rule_identity WHERE workspace_id=$1', [WS]);
  await Gavokatalog.noteraKatalog(pool, [{ id: HEART_ME, name: 'Heart Me', diamond_count: 1 }], { region: REGION , forvantat: kt([{ id: HEART_ME, name: 'Heart Me', diamond_count: 1 }]) });
  await Gavokatalog.verifiera(pool, Regelnycklar.HEART_ME, HEART_ME);
  await nySession(RUM_1);

  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME));
  assert.equal(await visat(), 1);

  // Administratören återkallar. Widgeten ska sluta trigga i samma andetag — det är hela poängen
  // med att kunna ändra facit när något visar sig vara fel.
  const ut = await Gavokatalog.inaktivera(pool, Regelnycklar.HEART_ME, HEART_ME);
  assert.equal(ut.ok, true);

  await H.applyHeartMeEvent(pool, WS, gava(BO, HEART_ME));
  assert.equal(await visat(), 1, 'en återkallad gåva fortsatte öka målet');
});

prov('registret · en KANDIDAT räknar aldrig, hur många källor den än har', async () => {
  // Tre kreatörer gör en gåva till kandidat. Den får synas för en människa — aldrig trigga.
  await pool.query('DELETE FROM gift_rule_identity WHERE workspace_id=$1', [WS]);
  await Gavokatalog.noteraKatalog(pool, [{ id: HEART_ME, name: 'Heart Me', diamond_count: 1 }], { region: REGION , forvantat: kt([{ id: HEART_ME, name: 'Heart Me', diamond_count: 1 }]) });
  for (const k of ['kreator-a', 'kreator-b', 'kreator-c', 'kreator-d']) {
    await Gavokatalog.noteraKandidat(pool, Regelnycklar.HEART_ME, HEART_ME, k);
  }
  await nySession(RUM_1);

  await H.applyHeartMeEvent(pool, WS, gava(ANNA, HEART_ME));
  assert.equal(await visat(), 0, 'en kandidat triggade utan mänskligt godkännande');

  // KONTROLLMÄTNING: efter godkännandet SKA den räkna — annars mäter provet ingenting.
  await Gavokatalog.verifiera(pool, Regelnycklar.HEART_ME, HEART_ME);
  await H.applyHeartMeEvent(pool, WS, gava(BO, HEART_ME));
  assert.equal(await visat(), 1, 'godkännandet slog inte igenom');
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

test('nyckeln är domänseparerad — inte APP_ENCRYPTION_KEY rakt av', () => {
  // Kräver ingen databas. token-vault.js använder SAMMA hemlighet som AES-nyckel; att återanvända
  // exakt de bytesen till en HMAC vore nyckelåteranvändning över två primitiver. Provet räknar fram
  // vad en oseparerad HMAC HADE gett och kräver att modulen inte ger det.
  const hemlig = Buffer.from(process.env.APP_ENCRYPTION_KEY, 'base64url');
  const SEP = String.fromCharCode(31);
  const indata = 'ws' + SEP + 'sess' + SEP + 'anna';

  const utan = crypto.createHmac('sha256', hemlig).update(indata).digest('hex');
  const med = H.avsandarnyckel('ws', 'sess', 'anna');
  assert.notEqual(med, utan, 'nyckeln härleds inte — hemligheten används rakt av');

  // Och separationen sker med den versionerade etiketten, så nyckeln kan roteras utan formatbyte.
  const harledd = crypto.createHmac('sha256', hemlig).update(H.ETIKETT).digest();
  assert.equal(med, crypto.createHmac('sha256', harledd).update(indata).digest('hex'),
    'nyckeln ska vara HMAC med en undernyckel härledd ur etiketten');
  assert.match(H.ETIKETT, /:v\d+$/, 'etiketten måste bära en version');
});

test('vakt: identiteten normaliseras före hashning, och kontrolltecken nekas', () => {
  assert.equal(H.normaliseraIdentitet({ username: '@Anna' }), 'anna');
  assert.equal(H.normaliseraIdentitet({ username: '  ANNA  ' }), 'anna');
  assert.equal(H.normaliseraIdentitet({ username: '' }), '', 'tomt är ingen identitet');
  assert.equal(H.normaliseraIdentitet({ username: 'a'.repeat(81) }), '', 'för långt nekas');
  // Separatorn får inte kunna smugglas in — annars kan två olika (ws, session, namn) ge samma
  // sträng att hasha, och två personer kollapsa till en.
  assert.equal(H.normaliseraIdentitet({ username: 'an' + String.fromCharCode(31) + 'na' }), '',
    'separatorn i namnet måste nekas');
  assert.equal(H.avsandarnyckel('ws', 'sess', ''), '', 'utan identitet finns ingen nyckel');
});

test('vakt: modulen loggar ingenting alls, och kopplingen sväljer felet tyst', () => {
  const fs = require('node:fs'), path = require('node:path');
  const modul = fs.readFileSync(path.join(__dirname, '..', 'heart-me-goal.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/).map(r => r.replace(/\/\/.*$/, '')).join('\n');

  // Ingen loggning alls är det enda som säkert håller: en loggrad som bär eventet eller nyckeln är
  // en läcka, och "logga bara vid fel" är precis när payloaden är som mest intressant att skriva ut.
  assert.ok(!/console\./.test(modul), 'modulen får inte logga — den ser varje gåva som passerar');
  assert.ok(!/\blog\s*\(/.test(modul), 'ingen injicerad logger heller');

  // Kopplingen i ingest-kedjan måste svälja felet utan att skriva ut det anrop som bar eventet.
  const rad = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
    .split(/\r?\n/).find(r => r.includes('HeartMeGoal.applyOchPublicera'));
  assert.ok(rad, 'kopplingen i ingest-kedjan hittades inte');
  assert.ok(rad.trimEnd().endsWith('.catch(()=>{});'),
    'anropet måste sluta i en tom catch — en avvisad promise utan hanterare fäller processen, ' +
    'och en catch som loggar skulle skriva ut eventet');
  assert.ok(!/console\./.test(rad), 'kopplingsraden får inte logga');

  // KONTROLLMÄTNING: mönstren kan träffa.
  assert.ok(/console\./.test('console.warn(x)'));
  assert.ok(!'foo.catch(e=>console.log(e));'.trimEnd().endsWith('.catch(()=>{});'));
});

test('vakt: heart-me-goal.js matchar aldrig på giftName', () => {
  const fs = require('node:fs'), path = require('node:path');
  const kall = fs.readFileSync(path.join(__dirname, '..', 'heart-me-goal.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/).map(r => r.replace(/\/\/.*$/, '')).join('\n');

  assert.ok(!/giftName/.test(kall), 'ingen namnmatchning, inte ens som reserv');
  assert.ok(!/'Heart Me'/.test(kall), 'inget hårdkodat gåvonamn');

  // BÅDA vägarna, och den GLOBALA först. Vakten krävde länge bara `slaUppGiftId` — alltså RESERVEN.
  // Mutationsmätt 2026-08-29: med hela det globala uppslaget borttaget gick alla sju vakter gröna
  // och inget av de 44 proven rörde registret. Hela poängen med det serverägda registret var
  // obunden av prov. En vakt som mäter fel väg är sämre än ingen.
  assert.ok(/Gavokatalog\.verifieradeId/.test(kall),
    'den PRIMÄRA identiteten måste komma från det globala registret');
  assert.ok(/slaUppGiftId/.test(kall), 'lärläget måste finnas kvar som reserv');
  assert.ok(kall.indexOf('verifieradeId') < kall.indexOf('slaUppGiftId'),
    'registret ska slås upp FÖRE reserven — annars är global verifiering verkningslös');
});

test('vakt: klient och server är överens om Heart Me-metriken', () => {
  const Metrics = require('../goal-metrics');
  assert.equal(Metrics.metricForWidget({ type: 'templateHeartGoal' }), 'unique_gift_senders');
  assert.equal(Metrics.metricForWidget({ type: 'templateSocialGoal', goalKind: 'likes' }), 'likes',
    'like-målet får inte ha följt med i ändringen');
});
