'use strict';
// GÅVOR PER SÄNDNING (server/kampanj-gavor.js, David 2026-11-20: "gift champian räknar inte alla gift").
//
// Gift Campaigns räknare bodde i varje sida för sig, och den som sparade layouten skrev över de
// andras tal. Nu räknar servern varje gåva en gång per sändning och stämplar totalen på händelsen.
// Det som vaktas här:
//   1. bara riktiga gåvor till värden räknas, och en händelse räknas en gång
//   2. stämpeln är serverns — ett värde som kom utifrån når aldrig widgeten
//   3. utan aktiv sändning skrivs ingenting
//   4. en räkning som faller hindrar inte gåvan från att gå ut
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const K = require('../kampanj-gavor');
const G = require('../goal-runtime');
const { cleanEvent } = require('../event-bus');
const { createEventIngest } = require('../goal-ingest');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false : 'BLOCKERAT: ingen isolerad Postgres (TEST_DATABASE_URL).';
const db = (name, fn) => test(`db: ${name}`, { timeout: 120000, skip: BLOCKED }, fn);
const GAVA = { id: 'evt-1', type: 'gift', giftId: '1444198', giftName: 'FEST Energy', count: 3, value: 897, username: 'anna', userId: 'u1' };

// ---- körs överallt -------------------------------------------------------------------------------

test('bara en riktig gåva till värden har ett bidrag', () => {
  assert.deepEqual(K.bidrag(GAVA), { giftId: '1444198', antal: 3 });
  assert.equal(K.bidrag({ ...GAVA, type: 'streakstart' }), null, 'en förhandsvisning räknades — combon hade räknats två gånger');
  assert.equal(K.bidrag({ ...GAVA, type: 'like' }), null);
  assert.equal(K.bidrag({ ...GAVA, tillVarden: false }), null, 'en gåva till en medvärd räknades');
  assert.deepEqual(K.bidrag({ ...GAVA, tillVarden: true }), { giftId: '1444198', antal: 3 });
  assert.equal(K.bidrag({ ...GAVA, giftId: '' }), null);
  assert.equal(K.bidrag({ ...GAVA, count: 0 }), null);
  assert.equal(K.bidrag({ ...GAVA, count: -4 }), null);
  assert.equal(K.bidrag({ ...GAVA, count: 1e12 }).antal, K.MAX_ANTAL, 'ett orimligt antal fick sätta kampanjen');
});

// En pool som svarar efter vad satsen är, så att flödet går att följa utan databas.
function falskPool({ session = 'sess-1', redanRaknad = false, sparat = 7 } = {}) {
  const satser = [];
  const client = {
    query: async (sql, arg) => {
      const s = String(sql).replace(/\s+/g, ' ').trim(); satser.push(s.slice(0, 40));
      if (/stream_session_pointer/.test(s) && /^SELECT session_id/.test(s)) return { rowCount: session ? 1 : 0, rows: session ? [{ session_id: session }] : [] };
      if (/INSERT INTO session_gift_apply/.test(s)) return { rowCount: redanRaknad ? 0 : 1, rows: [] };
      if (/INSERT INTO session_gift_counts/.test(s)) return { rowCount: 1, rows: [{ antal: sparat + arg[3] }] };
      if (/^SELECT antal/.test(s)) return { rowCount: 1, rows: [{ antal: sparat }] };
      return { rowCount: 0, rows: [] };
    },
    release() {}
  };
  return { pool: { connect: async () => client }, satser };
}

test('en ny gåva ökar totalen och lämnar ut den', async () => {
  const { pool, satser } = falskPool();
  const ut = await K.applyEvent(pool, 'ws-1', GAVA);
  assert.deepEqual(ut, { applied: true, antal: 10, giftId: '1444198', sessionId: 'sess-1' });
  assert.equal(satser[satser.length - 1], 'COMMIT');
});

test('en händelse som redan räknats ändrar ingenting men lämnar ut samma total', async () => {
  const { pool, satser } = falskPool({ redanRaknad: true });
  const ut = await K.applyEvent(pool, 'ws-1', GAVA);
  assert.equal(ut.applied, false);
  assert.equal(ut.antal, 7, 'en omleverans fick inte veta totalen — sidan hade räknat om själv');
  assert.ok(!satser.some(s => /INSERT INTO session_gift_counts/.test(s)), 'en dubblett ökade totalen');
  assert.equal(satser[satser.length - 1], 'ROLLBACK');
});

test('utan aktiv sändning räknas ingenting, och ingenting skrivs', async () => {
  const { pool, satser } = falskPool({ session: null });
  const ut = await K.applyEvent(pool, 'ws-1', GAVA);
  assert.equal(ut.applied, false); assert.equal(ut.antal, null);
  assert.ok(!satser.some(s => /^INSERT/.test(s)));
});

test('en händelse utan bidrag eller utan id rör aldrig databasen', async () => {
  let anslutningar = 0;
  const pool = { connect: async () => { anslutningar++; throw new Error('ska inte ske'); } };
  for (const e of [{ ...GAVA, type: 'like' }, { ...GAVA, id: '' }, { ...GAVA, tillVarden: false }, null]) await K.applyEvent(pool, 'ws-1', e);
  await K.applyEvent(pool, '', GAVA);
  assert.equal(anslutningar, 0);
});

test('idempotensraden sveps — annars växer den tills disken är full', () => {
  assert.match(G.SWEEP_SQL_BY_TABLE.session_gift_apply, /DELETE FROM session_gift_apply/);
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  assert.match(index, /startAppliedDrain\(\{pool,metrics,table:'session_gift_apply',name:'gift_count_cleanup'\}\)/);
  assert.match(index, /gavoCleanup\.stop\(\)/);
  assert.match(index, /KampanjGavor\.sweepOld\(pool\)/, 'gamla sändningars totaler städas aldrig');
});

test('modulen följer med i serverbilden och loggar ingenting', () => {
  const docker = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
  assert.match(docker, /\bkampanj-gavor\.js\b/, 'filen saknas i COPY-listan: servern startar inte i produktion');
  const kod = fs.readFileSync(path.join(__dirname, '..', 'kampanj-gavor.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(kod, /console\./);
});

// ---- stämpeln genom intaget ----------------------------------------------------------------------

function intag(kampanjGavor) {
  const publicerat = [], logg = [];
  const ingest = createEventIngest({
    pool: {}, cleanEvent, now: () => 5000, log: rad => logg.push(rad),
    eventBus: { publish: async (ws, event) => { publicerat.push(cleanEvent(event)); return { duplicate: false, event } } },
    goalSse: { publish: async () => true },
    goalRuntime: { applyEvent: async () => ({ applied: false, rows: [] }) },
    kampanjGavor
  });
  return { ingest, publicerat, logg };
}

test('serverns total stämplas på den publicerade gåvan', async () => {
  const r = intag({ applyEvent: async () => ({ applied: true, antal: 12, giftId: '1444198', sessionId: 's' }) });
  await r.ingest('ws-1', GAVA);
  assert.equal(r.publicerat[0].giftSessionCount, 12);
});

test('ett kampanjtal som kom med utifrån når aldrig widgeten', async () => {
  const utan = intag({ applyEvent: async () => null });
  await utan.ingest('ws-1', { ...GAVA, giftSessionCount: 999999 });
  assert.equal('giftSessionCount' in utan.publicerat[0], false, 'avsändarens tal gick ut som om det vore serverns');
  const med = intag({ applyEvent: async () => ({ applied: true, antal: 4 }) });
  await med.ingest('ws-1', { ...GAVA, giftSessionCount: 999999 });
  assert.equal(med.publicerat[0].giftSessionCount, 4);
});

test('en räkning som faller hindrar inte gåvan, och loggas utan innehåll', async () => {
  const r = intag({ applyEvent: async () => { throw new Error('databasen svarar inte'); } });
  await r.ingest('ws-1', GAVA);
  assert.equal(r.publicerat.length, 1);
  assert.equal('giftSessionCount' in r.publicerat[0], false);
  assert.equal(JSON.parse(r.logg[0]).event, 'gift_count_apply_failed');
  assert.doesNotMatch(r.logg[0], /anna|1444198|evt-1/, 'loggraden bär händelsens innehåll');
});

test('stämpeln bärs bara av gåvor, och bara som ett positivt heltal', () => {
  assert.equal(cleanEvent({ ...GAVA, giftSessionCount: 5 }).giftSessionCount, 5);
  for (const v of [0, -1, 1.5, 'abc', null, undefined]) assert.equal('giftSessionCount' in cleanEvent({ ...GAVA, giftSessionCount: v }), false, String(v));
  assert.equal('giftSessionCount' in cleanEvent({ id: 'l1', type: 'like', count: 3, giftSessionCount: 5 }), false);
  assert.equal('giftSessionCount' in cleanEvent({ ...GAVA, type: 'streakstart', giftSessionCount: 5 }), false);
});

// ---- riktig databas ------------------------------------------------------------------------------

let pool = null;
const WS = 'eeeeeeee-0000-0000-0000-000000000000';
let session = null;
const nySession = async rum => {
  await pool.query('UPDATE stream_sessions SET ended_at=now() WHERE workspace_id=$1 AND ended_at IS NULL', [WS]);
  const s = await pool.query('INSERT INTO stream_sessions (workspace_id,room_id,account_key) VALUES ($1,$2,$3) RETURNING id', [WS, rum, 'prov']);
  await pool.query(`INSERT INTO stream_session_pointer (workspace_id,session_id) VALUES ($1,$2)
     ON CONFLICT (workspace_id) DO UPDATE SET session_id=EXCLUDED.session_id, updated_at=now()`, [WS, s.rows[0].id]);
  return s.rows[0].id;
};

test.before(async () => {
  if (BLOCKED) return;
  const { Pool } = require(path.join(__dirname, '..', 'node_modules', 'pg'));
  pool = new Pool({ connectionString: DB_URL, max: 6 });
  await pool.query(`INSERT INTO users (id,email,password_hash,display_name) VALUES ($1,$2,'x','gavorakning')
     ON CONFLICT (id) DO NOTHING`, [WS, `${WS}@test.invalid`]);
  await pool.query(`INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,'gavorakning',$1) ON CONFLICT (id) DO NOTHING`, [WS]);
  await pool.query('DELETE FROM session_gift_apply WHERE workspace_id=$1', [WS]);
  await pool.query('DELETE FROM session_gift_counts WHERE workspace_id=$1', [WS]);
  session = await nySession('rum-' + Date.now());
});
test.after(async () => {
  if (!pool) return;
  await pool.query('DELETE FROM session_gift_apply WHERE workspace_id=$1', [WS]);
  await pool.query('DELETE FROM session_gift_counts WHERE workspace_id=$1', [WS]);
  await pool.query('DELETE FROM stream_session_pointer WHERE workspace_id=$1', [WS]);
  await pool.query('DELETE FROM stream_sessions WHERE workspace_id=$1', [WS]);
  await pool.end();
});

db('gåvor räknas per gåvo-id, och en omleverans räknas inte igen', async () => {
  const a = await K.applyEvent(pool, WS, { ...GAVA, id: 'a1', count: 3 });
  const b = await K.applyEvent(pool, WS, { ...GAVA, id: 'a2', count: 2 });
  const om = await K.applyEvent(pool, WS, { ...GAVA, id: 'a2', count: 2 });
  const annan = await K.applyEvent(pool, WS, { ...GAVA, id: 'a3', giftId: '5655', count: 1 });
  assert.deepEqual([a.antal, b.antal, om.antal, annan.antal], [3, 5, 5, 1]);
  assert.equal(om.applied, false);
  assert.deepEqual((await K.readCounts(pool, WS)).counts, { '1444198': 5, '5655': 1 });
});

db('femtio samtidiga gåvor ger exakt femtio', async () => {
  await Promise.all(Array.from({ length: 50 }, (_, i) => K.applyEvent(pool, WS, { ...GAVA, id: 'samtidig-' + i, giftId: '7934', count: 1 })));
  assert.equal((await K.readCounts(pool, WS)).counts['7934'], 50);
});

db('en ny sändning börjar från noll, och den förra sändningens tal lämnas inte ut', async () => {
  await K.applyEvent(pool, WS, { ...GAVA, id: 'fore-byte', count: 4 });
  const ny = await nySession('rum-nytt-' + Date.now());
  assert.notEqual(ny, session);
  assert.deepEqual((await K.readCounts(pool, WS)).counts, {}, 'förra sändningens gåvor syntes i den nya');
  const forsta = await K.applyEvent(pool, WS, { ...GAVA, id: 'efter-byte', count: 1 });
  assert.equal(forsta.antal, 1);
});

db('utan pekare räknas ingenting', async () => {
  await pool.query('UPDATE stream_session_pointer SET session_id=NULL WHERE workspace_id=$1', [WS]);
  const ut = await K.applyEvent(pool, WS, { ...GAVA, id: 'ingen-sandning', count: 9 });
  assert.equal(ut.antal, null);
  assert.deepEqual((await K.readCounts(pool, WS)).counts, {});
  assert.equal(Number((await pool.query(`SELECT count(*)::int c FROM session_gift_apply WHERE workspace_id=$1 AND event_id='ingen-sandning'`, [WS])).rows[0].c), 0);
});

db('gamla sändningars totaler städas, färska står kvar', async () => {
  const s = await nySession('rum-stad-' + Date.now());
  await K.applyEvent(pool, WS, { ...GAVA, id: 'farsk', count: 2 });
  await pool.query(`UPDATE session_gift_counts SET updated_at = now() - interval '30 days' WHERE workspace_id=$1 AND session_id<>$2`, [WS, s]);
  const ut = await K.sweepOld(pool);
  assert.ok(ut.deleted >= 1);
  assert.deepEqual((await K.readCounts(pool, WS)).counts, { '1444198': 2 });
});
