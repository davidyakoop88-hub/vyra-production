'use strict';
// Short architecture measurement of the write path: does the single row per goal serialise under
// load, and does the pool hold up. Four shapes, each 60 seconds or less.
//
// THIS IS NOT A CAPACITY PROOF FOR RAILWAY. A GitHub runner has different CPU, different disk and a
// database in the same container. What it can show is whether the design collapses on row locks and
// how the numbers move between rates — architecture signal, nothing more.
const path = require('path');
const { Pool } = require(path.join(__dirname, '..', 'server', 'node_modules', 'pg'));
const G = require(path.join(__dirname, '..', 'server', 'goal-runtime.js'));

const URL = process.env.TEST_DATABASE_URL;
if (!URL) { console.error('TEST_DATABASE_URL saknas'); process.exit(1) }

const SECONDS = Number(process.env.THROUGHPUT_SECONDS || 60);
const POOL_MAX = 16;
const uuid = (p, n) => `${p}${String(n).padStart(8 - p.length, '0')}-0000-0000-0000-000000000000`;

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function seed(pool, workspaces) {
  await pool.query('TRUNCATE goal_event_apply, goal_runtime CASCADE');
  await pool.query('DELETE FROM overlays');
  await pool.query('DELETE FROM workspaces');
  await pool.query('DELETE FROM users');
  for (const ws of workspaces) {
    await pool.query(
      `INSERT INTO users (id,email,password_hash,display_name) VALUES ($1,$2,'x','load')
       ON CONFLICT DO NOTHING`, [ws, `${ws}@load.invalid`]);
    await pool.query(`INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,'load',$1)
       ON CONFLICT DO NOTHING`, [ws]);
    await pool.query(
      `INSERT INTO overlays (id,workspace_id,name,state) VALUES ($1,$1,'load','{"widgets":[]}')
       ON CONFLICT DO NOTHING`, [ws]);
    // One goal per metric, so a gift exercises the two-metric path under load too.
    for (const metric of ['follows', 'likes', 'gifts', 'diamonds']) {
      await pool.query(
        `INSERT INTO goal_runtime (overlay_id,widget_id,metric) VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING`, [ws, `w-${metric}`, metric]);
    }
  }
}

// Fires `rate` events per second per workspace for `seconds`, without waiting for one to finish
// before scheduling the next — otherwise the measurement would be of latency, not of load.
async function run(pool, label, workspaces, rate, seconds) {
  await seed(pool, workspaces);
  const latencies = [];
  const inflight = [];
  const errors = [];
  let sent = 0, applied = 0, peakWaiting = 0;
  const started = Date.now();

  const tick = async (ws, n) => {
    const t0 = process.hrtime.bigint();
    try {
      // A gift, so every event touches two goal rows — the worst realistic case for row contention.
      const out = await G.applyEvent(pool, ws, { id: `load-${ws}-${n}`, type: 'gift', count: 1, value: 10 });
      if (out.applied) applied += 1;
    } catch (error) {
      errors.push(error.message);
    }
    latencies.push(Number(process.hrtime.bigint() - t0) / 1e6);
  };

  for (let second = 0; second < seconds; second += 1) {
    const slotStart = Date.now();
    for (const ws of workspaces) {
      for (let i = 0; i < rate; i += 1) {
        sent += 1;
        inflight.push(tick(ws, `${second}-${i}`));
      }
    }
    peakWaiting = Math.max(peakWaiting, pool.waitingCount);
    const elapsed = Date.now() - slotStart;
    if (elapsed < 1000) await new Promise(r => setTimeout(r, 1000 - elapsed));
  }
  await Promise.all(inflight);

  const wallSeconds = (Date.now() - started) / 1000;
  const sorted = latencies.slice().sort((a, b) => a - b);
  // Transactions actually blocked on a lock right now, and anything still waiting for a connection.
  const locks = await pool.query(
    `SELECT count(*)::int c FROM pg_locks WHERE NOT granted`);

  console.log(`\n--- ${label}`);
  console.log(`  skickade ${sent}, applicerade ${applied}, fel ${errors.length}`);
  console.log(`  throughput ${(sent / wallSeconds).toFixed(1)} ev/s över ${wallSeconds.toFixed(1)}s`);
  console.log(`  p50 ${percentile(sorted, 0.50).toFixed(1)}ms  `
    + `p95 ${percentile(sorted, 0.95).toFixed(1)}ms  p99 ${percentile(sorted, 0.99).toFixed(1)}ms  `
    + `max ${sorted[sorted.length - 1].toFixed(1)}ms`);
  console.log(`  pool: max ${POOL_MAX}, högsta kö ${peakWaiting}, `
    + `totalt ${pool.totalCount}, lediga ${pool.idleCount}`);
  console.log(`  ej beviljade lås vid mätslut: ${locks.rows[0].c}`);
  if (errors.length) console.log(`  första felet: ${errors[0]}`);
  return { label, sent, applied, errors: errors.length, p99: percentile(sorted, 0.99) };
}

(async () => {
  const pool = new Pool({ connectionString: URL, max: POOL_MAX });
  console.log('ARKITEKTURSIGNAL FRÅN GITHUB ACTIONS — INTE ETT KAPACITETSBEVIS FÖR RAILWAY.');
  console.log(`pool max ${POOL_MAX}, ${SECONDS}s per steg\n`);

  const one = [uuid('e', 1)];
  const five = [1, 2, 3, 4, 5].map(n => uuid('f', n));
  const results = [];
  results.push(await run(pool, '10 ev/s, ett workspace', one, 10, SECONDS));
  results.push(await run(pool, '20 ev/s, ett workspace', one, 20, SECONDS));
  results.push(await run(pool, '100 ev/s, ett workspace', one, 100, SECONDS));
  results.push(await run(pool, '5 workspaces x 20 ev/s', five, 20, SECONDS));

  console.log('\n================ SAMMANFATTNING ================');
  for (const r of results) {
    console.log(`${r.label.padEnd(28)} applicerade ${String(r.applied).padStart(6)}  `
      + `fel ${r.errors}  p99 ${r.p99.toFixed(1)}ms`);
  }
  const collapse = results.find(r => r.errors > 0);
  console.log(collapse
    ? `\n⚠ FEL VID: ${collapse.label} — läs felmeddelandet ovan innan slutsats dras.`
    : '\nInga fel i något steg. Ingen radlåsningskollaps observerad på denna maskin.');
  await pool.end();
})().catch(error => { console.error(error); process.exit(1) });
