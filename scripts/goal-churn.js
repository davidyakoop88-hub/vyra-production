'use strict';
// Does the table stabilise under repeated delete/insert, or does it grow without bound?
//
// A plain VACUUM does not shrink the file — it marks space reusable. The question is whether later
// inserts actually reuse it, so the measurement is size across cycles, not size after one vacuum.
// VACUUM FULL is never used: it takes an ACCESS EXCLUSIVE lock and would block ingest completely.
const path = require('path');
const { Client } = require(path.join(__dirname, '..', 'server', 'node_modules', 'pg'));
const G = require(path.join(__dirname, '..', 'server', 'goal-runtime.js'));

const URL = process.env.TEST_DATABASE_URL;
if (!URL) { console.error('TEST_DATABASE_URL saknas'); process.exit(1) }
const ROWS = Number(process.env.CHURN_ROWS || 1000000);
const CYCLES = Number(process.env.CHURN_CYCLES || 4);
const WS = 'dddddddd-0000-0000-0000-000000000000';
const mb = b => (Number(b) / 1024 / 1024).toFixed(1);
const p95 = xs => xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length * 0.95)] : 0;

async function stats(client) {
  const q = await client.query(`
    SELECT s.n_live_tup, s.n_dead_tup,
           pg_table_size('goal_event_apply') heap,
           pg_indexes_size('goal_event_apply') idx,
           pg_total_relation_size('goal_event_apply') total
      FROM pg_stat_user_tables s WHERE s.relname = 'goal_event_apply'`);
  return q.rows[0] || {};
}

// Half the rows land outside the window so each cycle has something real to drain.
async function fill(client, rows) {
  await client.query(`
    INSERT INTO goal_event_apply (workspace_id, event_id, applied_at)
    SELECT $1, 'churn:' || extract(epoch from clock_timestamp())::bigint || ':' || g,
           now() - (CASE WHEN g % 2 = 0 THEN interval '72 hours' ELSE interval '1 minute' END)
      FROM generate_series(1, $2) g
    ON CONFLICT DO NOTHING`, [WS, rows]);
}

(async () => {
  const client = new Client({ connectionString: URL });
  await client.connect();
  await client.query('SET statement_timeout = 0');
  await client.query(
    `INSERT INTO users (id,email,password_hash,display_name) VALUES ($1,$2,'x','churn')
     ON CONFLICT (id) DO NOTHING`, [WS, `${WS}@churn.invalid`]);
  await client.query(`INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,'churn',$1)
     ON CONFLICT (id) DO NOTHING`, [WS]);
  await client.query('DELETE FROM goal_event_apply WHERE workspace_id = $1', [WS]);

  console.log(`churn: ${ROWS.toLocaleString('sv-SE')} rader, ${CYCLES} cykler, aldrig VACUUM FULL\n`);
  await fill(client, ROWS);
  await client.query('VACUUM (ANALYZE) goal_event_apply');
  const first = await stats(client);
  console.log(`start        live ${Number(first.n_live_tup).toLocaleString('sv-SE').padStart(10)}  `
    + `dead ${Number(first.n_dead_tup).toLocaleString('sv-SE').padStart(9)}  `
    + `heap ${mb(first.heap).padStart(7)} MB  idx ${mb(first.idx).padStart(7)} MB  `
    + `total ${mb(first.total).padStart(7)} MB`);

  const sizes = [];
  for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
    const latencies = [];
    let deleted = 0;
    for (;;) {
      const t0 = process.hrtime.bigint();
      const out = await G.sweepApplied(client, { limit: 5000 });
      latencies.push(Number(process.hrtime.bigint() - t0) / 1e6);
      deleted += out.deleted;
      if (out.deleted < 5000) break;
    }
    await fill(client, Math.floor(ROWS / 2));
    await client.query('VACUUM (ANALYZE) goal_event_apply');
    const s = await stats(client);
    sizes.push(Number(s.total));
    console.log(`cykel ${cycle}      live ${Number(s.n_live_tup).toLocaleString('sv-SE').padStart(10)}  `
      + `dead ${Number(s.n_dead_tup).toLocaleString('sv-SE').padStart(9)}  `
      + `heap ${mb(s.heap).padStart(7)} MB  idx ${mb(s.idx).padStart(7)} MB  `
      + `total ${mb(s.total).padStart(7)} MB   raderade ${deleted.toLocaleString('sv-SE')}  `
      + `p95/batch ${p95(latencies).toFixed(1)}ms`);
  }

  const last = sizes[sizes.length - 1], prev = sizes[sizes.length - 2] ?? last;
  const drift = prev ? ((last - prev) / prev * 100) : 0;
  console.log(`\nstorleksdrift sista cykeln: ${drift.toFixed(1)}%`);
  console.log(drift <= 5
    ? 'Storleken stabiliseras — senare inserts återanvänder utrymmet vanlig VACUUM frigjort.'
    : '⚠ Storleken växer fortfarande efter uppvärmning — utrymmet återanvänds inte.');
  await client.end();
})().catch(error => { console.error(error); process.exit(1) });
