'use strict';
// Cleanup capacity. The earlier claim that cleanup "keeps up with inflow" was unfounded: a single
// sweepApplied() call is fast, but nothing scheduled it, and one 5 000-row batch only covers 50
// seconds of inflow at the 100 events/s ceiling. These tests cover the drain that replaces it.
//
// The loop-bound tests run anywhere — they drive drainApplied() with a fake pool, because batch caps
// and time budgets are arithmetic, not database behaviour. Everything about locking, concurrency and
// what actually gets deleted needs a real Postgres and is BLOCKED without TEST_DATABASE_URL.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const G = require(path.join(__dirname, '..', 'goal-runtime.js'));

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Låsning och radering är oprövade tills TEST_DATABASE_URL '
    + 'pekar på en engångsdatabas.';
const db = (name, fn) => test(`db: ${name}`, { timeout: 120000, skip: BLOCKED }, fn);

// A pool that returns a scripted rowCount per call, so the loop's own limits can be tested without
// a database deciding how many rows exist.
const scripted = counts => { let i = 0; return { query: async () => ({ rowCount: counts[i++] ?? 0 }) } };

// ---- loopens gränser, körs överallt --------------------------------------------------------------

test('varje DELETE tar högst 5 000', { timeout: 5000 }, () => {
  assert.match(G.SWEEP_SQL, /LIMIT \$2/, 'batchstorleken är inte parameterstyrd');
  const calls = [];
  const pool = { query: async (_sql, params) => { calls.push(params[1]); return { rowCount: params[1] } } };
  return G.drainApplied(pool, { batch: 5000, maxBatches: 3 }).then(() => {
    assert.deepEqual(calls, [5000, 5000, 5000], 'en batch bad om fler än 5 000 rader');
  });
});

test('en kort batch avslutar loopen', { timeout: 5000 }, async () => {
  const out = await G.drainApplied(scripted([5000, 5000, 17]), { batch: 5000 });
  assert.equal(out.batches, 3, 'loopen fortsatte efter en kort batch');
  assert.equal(out.deleted, 10017);
  assert.equal(out.exhausted, true);
});

test('batchtaket respekteras', { timeout: 5000 }, async () => {
  const out = await G.drainApplied(scripted(Array(50).fill(5000)), { batch: 5000, maxBatches: 20 });
  assert.equal(out.batches, 20, 'fler batcher än taket kördes');
  assert.equal(out.deleted, 100000);
  assert.equal(out.exhausted, false, 'kön var inte tom men rapporterades som slut');
});

test('tidsbudgeten respekteras även när kön är full', { timeout: 5000 }, async () => {
  // Each now() reading advances three seconds, so a five-second budget allows one batch.
  let clock = 0;
  const now = () => { clock += 3000; return clock };
  const out = await G.drainApplied(scripted(Array(50).fill(5000)),
    { batch: 5000, maxBatches: 20, budgetMs: 5000, now });
  assert.equal(out.batches, 1, 'tidsbudgeten stoppade inte loopen');
});

test('kapaciteten räcker för inflödet vid ingesttaket', { timeout: 5000 }, () => {
  // 100 events/s is the per-workspace rate limit in server/index.js, so 6 000 rows a minute have to
  // leave the table once they age past the window. One batch per fifteen-minute tick gives 333.
  const perMinute = (5000 * 20) / (60_000 / 60_000);
  assert.ok(perMinute >= 6000 * 4,
    `dräneringstaket ${perMinute}/min ger inte fyrfaldig marginal mot 6 000/min`);
});

// ---- schemaläggarens beteende --------------------------------------------------------------------

test('överlappande tick startar inte en andra drain', { timeout: 5000 }, async () => {
  let concurrent = 0, peak = 0;
  const pool = { query: async () => {
    concurrent += 1; peak = Math.max(peak, concurrent);
    await new Promise(r => setTimeout(r, 30));
    concurrent -= 1;
    return { rowCount: 0 };
  } };
  const drain = G.startAppliedDrain({ pool, intervalMs: 3600_000 });
  const first = drain.tick();
  const second = await drain.tick();          // fires while the first is still in flight
  await first;
  drain.stop();
  assert.equal(second.skipped, true, 'en andra drain startade ovanpå den första');
  assert.equal(peak, 1, `${peak} samtidiga batcher — running-vakten höll inte`);
});

test('ett kast i en batch lämnar schemaläggaren körbar', { timeout: 5000 }, async () => {
  let calls = 0;
  const pool = { query: async () => { calls += 1; if (calls === 1) throw new Error('injicerat'); return { rowCount: 0 } } };
  const drain = G.startAppliedDrain({ pool, intervalMs: 3600_000 });
  const failed = await drain.tick();
  assert.equal(failed.error, 'injicerat', 'felet fångades inte');
  assert.equal(drain.isRunning(), false, 'running-vakten släpptes inte efter ett kast');
  const after = await drain.tick();
  assert.equal(after.error, undefined, 'nästa tick kunde inte köra efter ett fel');
  drain.stop();
});

test('timern hindrar inte processen från att avslutas', { timeout: 5000 }, () => {
  const drain = G.startAppliedDrain({ pool: { query: async () => ({ rowCount: 0 }) } });
  assert.equal(typeof drain.stop, 'function', 'timern går inte att stoppa vid shutdown');
  drain.stop();
});

test('mätvärden rapporteras via den skyddade metrics-vägen', { timeout: 5000 }, async () => {
  const seen = {};
  const metrics = { gauge: (name, value) => { seen[name] = value } };
  const drain = G.startAppliedDrain({ pool: scripted([12]), metrics, intervalMs: 3600_000 });
  await drain.tick();
  drain.stop();
  assert.equal(seen.goal_cleanup_deleted, 12);
  assert.equal(typeof seen.goal_cleanup_duration_ms, 'number');
  assert.ok(seen.goal_cleanup_last_run_at > 0);
});

// ---- riktig databas ------------------------------------------------------------------------------

let pool = null;
const WS = 'cccccccc-0000-0000-0000-000000000000';

test.before(async () => {
  if (BLOCKED) return;
  const { Pool } = require(path.join(__dirname, '..', 'node_modules', 'pg'));
  pool = new Pool({ connectionString: DB_URL, max: 8 });
  await pool.query(
    `INSERT INTO users (id,email,password_hash,display_name) VALUES ($1,$2,'x','cleanup')
     ON CONFLICT (id) DO NOTHING`, [WS, `${WS}@test.invalid`]);
  await pool.query(`INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,'cleanup',$1)
     ON CONFLICT (id) DO NOTHING`, [WS]);
});

// Rows spread either side of the window: `old` well past 48 hours, `fresh` seconds ago.
async function seed({ old = 0, fresh = 0 } = {}) {
  await pool.query('DELETE FROM goal_event_apply WHERE workspace_id = $1', [WS]);
  if (old) await pool.query(
    `INSERT INTO goal_event_apply (workspace_id,event_id,applied_at)
     SELECT $1, 'old:'||g, now() - interval '72 hours' FROM generate_series(1,$2) g`, [WS, old]);
  if (fresh) await pool.query(
    `INSERT INTO goal_event_apply (workspace_id,event_id,applied_at)
     SELECT $1, 'fresh:'||g, now() - interval '10 seconds' FROM generate_series(1,$2) g`, [WS, fresh]);
}
const count = async where => Number((await pool.query(
  `SELECT count(*)::int c FROM goal_event_apply WHERE workspace_id=$1 AND event_id LIKE $2`,
  [WS, where])).rows[0].c);

db('färska rader rörs aldrig', async () => {
  await seed({ old: 100, fresh: 500 });
  await G.drainApplied(pool, { batch: 5000 });
  assert.equal(await count('fresh:%'), 500, 'städningen tog rader innanför replay-fönstret');
  assert.equal(await count('old:%'), 0);
});

db('gamla rader dräneras över flera batcher', async () => {
  await seed({ old: 12000, fresh: 10 });
  const out = await G.drainApplied(pool, { batch: 5000, maxBatches: 20 });
  assert.ok(out.batches >= 3, `dränerades på ${out.batches} batcher — förväntade minst 3`);
  assert.equal(out.deleted, 12000);
  assert.equal(out.exhausted, true);
  assert.equal(await count('old:%'), 0);
  assert.equal(await count('fresh:%'), 10, 'färska rader försvann under dräneringen');
});

db('två samtidiga sweepApplied tar skilda rader via SKIP LOCKED', async () => {
  await seed({ old: 10000 });
  const [a, b] = await Promise.all([
    G.sweepApplied(pool, { limit: 5000 }),
    G.sweepApplied(pool, { limit: 5000 })
  ]);
  // Neither waited for the other, and between them they took every row exactly once.
  assert.equal(a.deleted + b.deleted, 10000,
    `tillsammans ${a.deleted + b.deleted} av 10 000 — rader togs två gånger eller missades`);
  assert.ok(a.deleted > 0 && b.deleted > 0, 'den ena blockerades helt av den andra');
  assert.equal(await count('old:%'), 0);
});

db('ingest kan fortsätta medan cleanup körs', async () => {
  await seed({ old: 20000 });
  const drain = G.drainApplied(pool, { batch: 5000, maxBatches: 20 });
  const ingest = [];
  for (let i = 0; i < 200; i += 1) {
    ingest.push(pool.query(
      `INSERT INTO goal_event_apply (workspace_id,event_id) VALUES ($1,$2)
       ON CONFLICT DO NOTHING`, [WS, `during:${i}`]));
  }
  const [swept] = await Promise.all([drain, Promise.all(ingest)]);
  assert.ok(swept.deleted > 0);
  assert.equal(await count('during:%'), 200, 'ingest tappade rader medan cleanup körde');
});

test.after(async () => { if (pool) await pool.end() });

db('applied_at-indexet är BRIN, och primärnyckeln är orörd', async () => {
  const q = await pool.query(
    `SELECT i.relname, am.amname, ix.indisprimary
       FROM pg_index ix
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_am am ON am.oid = i.relam
      WHERE ix.indrelid = 'goal_event_apply'::regclass
      ORDER BY i.relname`);
  const byName = Object.fromEntries(q.rows.map(r => [r.relname, r]));
  const brin = q.rows.find(r => r.amname === 'brin');
  assert.ok(brin, `inget BRIN-index på goal_event_apply: ${q.rows.map(r => r.relname + '/' + r.amname).join(', ')}`);
  assert.equal(brin.indisprimary, false, 'primärnyckeln blev BRIN');
  assert.ok(!byName.goal_event_apply_sweep_idx, 'det gamla B-tree-indexet finns kvar');
  const pk = q.rows.find(r => r.indisprimary);
  assert.ok(pk, 'primärnyckelindexet saknas');
  assert.equal(pk.amname, 'btree', 'primärnyckeln är inte längre btree');
});

db('sweep-planen fungerar efter indexbytet', async () => {
  await seed({ old: 20000, fresh: 100 });
  await pool.query('VACUUM (ANALYZE) goal_event_apply');
  const q = await pool.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${G.SWEEP_SQL.replace('$1', "'48 hours'").replace('$2', '5000')}`);
  const plan = q.rows[0]['QUERY PLAN'][0];
  console.log(`  sweep efter BRIN: ${plan.Plan['Node Type']}, ${plan['Execution Time'].toFixed(1)}ms`);
  assert.ok(plan['Execution Time'] < 5000, 'sweep-planen blev orimligt långsam efter bytet');
});
