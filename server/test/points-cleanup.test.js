'use strict';
// POINTS_EVENT_APPLY RENSADES ALDRIG — OCH FÄLLDE PRODUKTIONEN (2026-11-20).
//
// Tabellen har en rad per händelse som redan gett poäng. Den fick sitt svep-index i schemat men
// ingen DELETE, och växte en rad per gåva, like och kommentar tills databasens disk (500 MB) tog
// slut. Postgres kunde inte längre skriva sin WAL och startade inte. API:t tappade då sina
// anslutningar, vilket blev ett uncaughtException — och eftersom avstängningen slutade med kod 0
// räknade Railway (restartPolicyType ON_FAILURE) tjänsten som "klar" och lät den ligga i tio timmar.
//
// Tre saker vaktas här: att poängtabellen rensas med samma fönster som måltabellen, att en tappad
// databasanslutning tas emot i stället för att fälla processen, och att en krasch slutar med felkod.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const EventEmitter = require('events');
const G = require(path.join(__dirname, '..', 'goal-runtime.js'));

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false : 'BLOCKERAT: ingen isolerad Postgres (TEST_DATABASE_URL).';
const db = (name, fn) => test(`db: ${name}`, { timeout: 120000, skip: BLOCKED }, fn);
const index = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

// ---- körs överallt -------------------------------------------------------------------------------

test('poängtabellen har en egen rensningssats, i övrigt identisk med målens', () => {
  const sql = G.SWEEP_SQL_BY_TABLE.points_event_apply;
  assert.match(sql, /DELETE FROM points_event_apply/);
  assert.doesNotMatch(sql, /goal_event_apply/);
  assert.equal(sql.replace(/points_event_apply/g, 'goal_event_apply'), G.SWEEP_SQL);
});

test('tabellen väljs ur en fast lista — ett okänt namn når aldrig databasen', async () => {
  const fragor = [];
  const pool = { query: async sql => { fragor.push(sql); return { rowCount: 0 } } };
  for (const namn of ['users', 'points_event_apply; DROP TABLE users', 'toString', '']) {
    await assert.rejects(G.sweepApplied(pool, { table: namn }), /Okänd tabell/);
  }
  assert.equal(fragor.length, 0);
});

test('dräneringen skickar tabellen hela vägen till satsen', async () => {
  const fragor = [];
  const pool = { query: async sql => { fragor.push(sql); return { rowCount: fragor.length === 1 ? 5000 : 3 } } };
  const out = await G.drainApplied(pool, { batch: 5000, table: 'points_event_apply' });
  assert.equal(out.deleted, 5003);
  assert.equal(fragor.length, 2);
  for (const sql of fragor) assert.match(sql, /DELETE FROM points_event_apply/);
});

test('utan tabell rensas måltabellen, som förut', async () => {
  const fragor = [];
  await G.drainApplied({ query: async sql => { fragor.push(sql); return { rowCount: 0 } } });
  assert.match(fragor[0], /DELETE FROM goal_event_apply/);
});

test('poängsvepet rapporterar under eget namn och rör inte målens mätvärden', async () => {
  const sedda = {};
  const drain = G.startAppliedDrain({ pool: { query: async () => ({ rowCount: 7 }) },
    metrics: { gauge: (namn, varde) => { sedda[namn] = varde } },
    intervalMs: 3600_000, table: 'points_event_apply', name: 'points_cleanup' });
  await drain.tick();
  drain.stop();
  assert.equal(sedda.points_cleanup_deleted, 7);
  assert.equal(sedda.goal_cleanup_deleted, undefined);
});

test('servern startar poängsvepet och stoppar det vid avstängning', () => {
  assert.match(index, /pointsCleanup=GoalRuntime\.startAppliedDrain\(\{pool,metrics,table:'points_event_apply',name:'points_cleanup'\}\)/);
  assert.match(index, /pointsCleanup\.stop\(\)/);
});

test('en krasch slutar med felkod, så att Railway startar om tjänsten', () => {
  assert.match(index, /process\.exit\(signal==='uncaughtException'\?1:0\)/);
  assert.doesNotMatch(index, /shutdown_complete[^;]*;process\.exit\(0\)/);
});

test('en tappad databasanslutning tas emot — på poolen och på en utlånad klient', () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://x:y@127.0.0.1:1/x';
  const { pool } = require('../db');
  assert.ok(pool.listenerCount('error') >= 1, 'poolen saknar lyssnare: ett fel på en vilande anslutning fäller processen');
  const klient = new EventEmitter();
  pool.emit('connect', klient);
  assert.ok(klient.listenerCount('error') >= 1, 'en utlånad klient saknar lyssnare');
  const fel = console.error; console.error = () => {};
  try {
    assert.doesNotThrow(() => klient.emit('error', new Error('Connection terminated unexpectedly')));
    assert.doesNotThrow(() => pool.emit('error', new Error('Connection terminated unexpectedly')));
  } finally { console.error = fel; }
});

// ---- riktig databas ------------------------------------------------------------------------------

let pool = null;
const WS = 'dddddddd-0000-0000-0000-000000000000';

test.before(async () => {
  if (BLOCKED) return;
  const { Pool } = require(path.join(__dirname, '..', 'node_modules', 'pg'));
  pool = new Pool({ connectionString: DB_URL, max: 4 });
  await pool.query(
    `INSERT INTO users (id,email,password_hash,display_name) VALUES ($1,$2,'x','poangrensning')
     ON CONFLICT (id) DO NOTHING`, [WS, `${WS}@test.invalid`]);
  await pool.query(`INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,'poangrensning',$1)
     ON CONFLICT (id) DO NOTHING`, [WS]);
});
test.after(async () => {
  if (!pool) return;
  await pool.query('DELETE FROM points_event_apply WHERE workspace_id = $1', [WS]);
  await pool.query('DELETE FROM goal_event_apply WHERE workspace_id = $1', [WS]);
  await pool.end();
});

const lagg = (tabell, prefix, antal, alder) => pool.query(
  `INSERT INTO ${tabell} (workspace_id,event_id,applied_at)
   SELECT $1, $2||g, now() - $4::interval FROM generate_series(1,$3) g`, [WS, prefix, antal, alder]);
const antal = async (tabell, monster) => Number((await pool.query(
  `SELECT count(*)::int c FROM ${tabell} WHERE workspace_id=$1 AND event_id LIKE $2`, [WS, monster])).rows[0].c);

db('gamla poängrader tas bort, färska och måltabellens rader står kvar', async () => {
  await pool.query('DELETE FROM points_event_apply WHERE workspace_id = $1', [WS]);
  await pool.query('DELETE FROM goal_event_apply WHERE workspace_id = $1', [WS]);
  await lagg('points_event_apply', 'gammal:', 12000, '72 hours');
  await lagg('points_event_apply', 'farsk:', 300, '10 seconds');
  await lagg('goal_event_apply', 'mal-gammal:', 50, '72 hours');
  const out = await G.drainApplied(pool, { batch: 5000, maxBatches: 20, table: 'points_event_apply' });
  // Svepet gäller hela tabellen, inte bara provets arbetsyta: andra prov i samma körning kan ha lämnat
  // gamla rader. Det som ska hålla är att provets egna rader är borta (nedan), inte ett exakt antal.
  assert.ok(out.deleted >= 12000, `bara ${out.deleted} rader togs bort`);
  assert.equal(out.exhausted, true);
  assert.equal(await antal('points_event_apply', 'gammal:%'), 0);
  assert.equal(await antal('points_event_apply', 'farsk:%'), 300, 'rader innanför fönstret togs bort — händelsen kan ge poäng två gånger');
  assert.equal(await antal('goal_event_apply', 'mal-gammal:%'), 50, 'poängsvepet rörde måltabellen');
});

db('en händelse som rensats går att ta emot igen först efter fönstret — en färsk avvisas som dubblett', async () => {
  const P = require('../points-runtime.js');
  await pool.query('DELETE FROM points_event_apply WHERE workspace_id = $1', [WS]);
  const forsta = await pool.query(P.CLAIM_SQL, [WS, 'samma-handelse']);
  await G.drainApplied(pool, { table: 'points_event_apply' });
  const andra = await pool.query(P.CLAIM_SQL, [WS, 'samma-handelse']);
  assert.equal(forsta.rowCount, 1);
  assert.equal(andra.rowCount, 0, 'svepet tog en färsk rad, och samma händelse räknades en gång till');
});
