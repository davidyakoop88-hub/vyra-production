'use strict';
// Sliding window: does goal_event_apply reach a steady state, or grow forever?
//
// The previous version answered the wrong question. It inserted more than it drained, so the table
// gained 250 000 live rows a cycle and "the size keeps growing" was arithmetic, not fragmentation.
// This one holds the live count fixed — drain exactly N, insert exactly N — which is what the table
// actually does once the 48-hour window has filled: rows age out at the rate new ones arrive.
//
// Event ids are monotonically increasing and zero-padded, so old rows sit at the low end of the
// primary key and new ones are appended at the high end. That is the real access pattern and the
// hard case for a B-tree. Random ids would refill the pages the deletes emptied and report a reuse
// production would never see.
//
// Plain VACUUM (ANALYZE) only. VACUUM FULL takes an ACCESS EXCLUSIVE lock and would block ingest;
// REINDEX would hide exactly the growth this test exists to find.
const path = require('path');
const { Client } = require(path.join(__dirname, '..', 'server', 'node_modules', 'pg'));
const G = require(path.join(__dirname, '..', 'server', 'goal-runtime.js'));

const URL = process.env.TEST_DATABASE_URL;
if (!URL) { console.error('TEST_DATABASE_URL saknas'); process.exit(1) }

const LIVE = Number(process.env.CHURN_LIVE || 1000000);
const CYCLES = Number(process.env.CHURN_CYCLES || 6);
const PER_CYCLE = Number(process.env.CHURN_PER_CYCLE || 100000);
const BATCH = 5000;
const TOLERANCE = 5;
const WS = 'dddddddd-0000-0000-0000-000000000000';

const mb = b => (Number(b) / 1024 / 1024).toFixed(1);
const pct = (a, b) => (b ? ((a - b) / b * 100) : 0);
const pick = (s, p) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0);

// One counter for the whole run: every id is larger than every id before it.
let nextId = 0;

async function stats(client) {
  const q = await client.query(`
    SELECT s.n_live_tup, s.n_dead_tup,
           pg_table_size('goal_event_apply')               AS heap,
           pg_relation_size('goal_event_apply_pkey')       AS pk,
           pg_relation_size('goal_event_apply_sweep_brin') AS brin,
           pg_total_relation_size('goal_event_apply')      AS total
      FROM pg_stat_user_tables s WHERE s.relname = 'goal_event_apply'`);
  return q.rows[0];
}

async function insert(client, rows, ageHours) {
  const from = nextId;
  nextId += rows;
  await client.query(`
    INSERT INTO goal_event_apply (workspace_id, event_id, applied_at)
    SELECT $1, 'gift:' || lpad(($3 + g)::text, 18, '0'), now() - ($4 || ' hours')::interval
      FROM generate_series(1, $2) g
    ON CONFLICT DO NOTHING`, [WS, rows, from, String(ageHours)]);
  return rows;
}

// Drains exactly `target` rows in 5 000-row batches, timing each.
async function drainExactly(client, target) {
  const latencies = [];
  let deleted = 0, calls = 0;
  const started = process.hrtime.bigint();
  while (deleted < target) {
    const limit = Math.min(BATCH, target - deleted);
    const t0 = process.hrtime.bigint();
    const out = await G.sweepApplied(client, { limit });
    latencies.push(Number(process.hrtime.bigint() - t0) / 1e6);
    calls += 1;
    deleted += out.deleted;
    if (out.deleted < limit) break;
  }
  const sorted = latencies.slice().sort((a, b) => a - b);
  return { deleted, calls, totalMs: Number(process.hrtime.bigint() - started) / 1e6,
    p50: pick(sorted, 0.50), p95: pick(sorted, 0.95), p99: pick(sorted, 0.99) };
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

  const old = PER_CYCLE * CYCLES;
  const fresh = LIVE - old;
  if (fresh < 0) throw new Error('CHURN_LIVE räcker inte för alla cykler');
  console.log(`glidande fönster: ${LIVE.toLocaleString('sv-SE')} levande rader konstant, `
    + `${CYCLES} cykler à ${PER_CYCLE.toLocaleString('sv-SE')}`);
  console.log(`seed: ${old.toLocaleString('sv-SE')} äldre än 48 h, `
    + `${fresh.toLocaleString('sv-SE')} färska, monotont stigande ID\n`);

  await insert(client, old, 72);
  await insert(client, fresh, 0.1);
  await client.query('VACUUM (ANALYZE) goal_event_apply');

  const start = await stats(client);
  console.log(`start     live ${Number(start.n_live_tup).toLocaleString('sv-SE').padStart(9)}  `
    + `dead ${Number(start.n_dead_tup).toLocaleString('sv-SE').padStart(7)}  `
    + `heap ${mb(start.heap).padStart(6)}  pk ${mb(start.pk).padStart(6)}  `
    + `brin ${mb(start.brin).padStart(5)}  total ${mb(start.total).padStart(6)} MB`);

  const history = [];
  for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
    const drain = await drainExactly(client, PER_CYCLE);
    const inserted = await insert(client, PER_CYCLE, 0.1);
    await client.query('VACUUM (ANALYZE) goal_event_apply');
    const s = await stats(client);
    history.push({ cycle, ...s, drain });
    console.log(`cykel ${cycle}   live ${Number(s.n_live_tup).toLocaleString('sv-SE').padStart(9)}  `
      + `dead ${Number(s.n_dead_tup).toLocaleString('sv-SE').padStart(7)}  `
      + `heap ${mb(s.heap).padStart(6)}  pk ${mb(s.pk).padStart(6)}  `
      + `brin ${mb(s.brin).padStart(5)}  total ${mb(s.total).padStart(6)} MB`);
    console.log(`          raderade ${drain.deleted.toLocaleString('sv-SE')}  `
      + `insatta ${inserted.toLocaleString('sv-SE')}  drain-anrop ${drain.calls}  `
      + `total ${drain.totalMs.toFixed(0)}ms  p50 ${drain.p50.toFixed(1)}  `
      + `p95 ${drain.p95.toFixed(1)}  p99 ${drain.p99.toFixed(1)}ms`);
  }

  const last3 = history.slice(-3);
  const live = history.map(h => Number(h.n_live_tup));
  const spread = Math.max(...live) - Math.min(...live);
  const liveStable = spread <= LIVE * 0.02;    // pg_stat_user_tables is an estimate; allow 2%
  const totalDrift = pct(Number(last3[2].total), Number(last3[0].total));
  const pkDrift = pct(Number(last3[2].pk), Number(last3[0].pk));
  const heapDrift = pct(Number(last3[2].heap), Number(last3[0].heap));

  console.log('\n================ UTFALL ================');
  console.log(`levande radantal: spridning ${spread.toLocaleString('sv-SE')} rader `
    + `(${liveStable ? 'konstant' : 'INTE konstant'})`);
  console.log(`drift över de tre sista cyklerna — tolerans ${TOLERANCE}%:`);
  console.log(`  heap         ${heapDrift.toFixed(1)}%`);
  console.log(`  primärnyckel ${pkDrift.toFixed(1)}%`);
  console.log(`  totalt       ${totalDrift.toFixed(1)}%`);

  if (liveStable && Math.abs(totalDrift) <= TOLERANCE) {
    console.log('\nSTABILISERAT: konstant levande radantal, total storlek inom toleransen.');
    console.log('Senare inserts återanvänder utrymmet vanlig VACUUM frigjort.');
  } else if (liveStable && pkDrift > TOLERANCE) {
    console.log('\n⚠ PRIMÄRNYCKELN VÄXER trots konstant levande radantal.');
    console.log('Monotont stigande ID lägger alltid till i B-trädets högra kant medan raderingarna');
    console.log('tömmer sidor till vänster. Vanlig VACUUM markerar dem återanvändbara, men en');
    console.log('stigande nyckel besöker dem aldrig igen, så filen växer.');
    console.log('');
    console.log('Föreslagen fysisk lagringsstrategi — inte REINDEX, inte VACUUM FULL:');
    console.log('  Partitionera goal_event_apply på applied_at i intervall, t.ex. per 6 eller 12 h.');
    console.log('  Retention blir DROP PARTITION i stället för DELETE: hela filen försvinner, index');
    console.log('  och allt, utan vacuum, utan döda tuplar och utan att röra levande partitioner.');
    console.log('  Dräneringsloopen behövs då bara som skyddsnät.');
    console.log('  Kostnad: en partitionsunderhållsrutin, och primärnyckeln måste innehålla');
    console.log('  partitionsnyckeln — (workspace_id, event_id, applied_at).');
  } else {
    console.log('\n⚠ INTE STABILISERAT — läs siffrorna ovan innan slutsats dras.');
  }
  await client.end();
})().catch(error => { console.error(error); process.exit(1) });
