'use strict';
// EXPLAIN (ANALYZE, BUFFERS) for the goal write path, on realistic shapes rather than an empty table.
// Prints the plan so an index decision can be made from evidence instead of intuition — nothing here
// creates an index. CI only, against the throwaway container in TEST_DATABASE_URL.
const { Client } = require(require('path').join(__dirname, '..', 'server', 'node_modules', 'pg'));
const G = require(require('path').join(__dirname, '..', 'server', 'goal-runtime.js'));

const URL = process.env.TEST_DATABASE_URL;
if (!URL) { console.error('TEST_DATABASE_URL saknas'); process.exit(1) }

const uuid = n => `${String(n).padStart(8, '0')}-0000-0000-0000-000000000000`;

// A workspace with a realistic number of overlays and goals, plus enough neighbours that the planner
// is choosing between real alternatives rather than reading a three-row table.
async function seed(client) {
  await client.query('TRUNCATE goal_event_apply, goal_runtime CASCADE');
  await client.query('DELETE FROM overlays');
  await client.query('DELETE FROM workspaces');
  await client.query('DELETE FROM users');
  for (let w = 1; w <= 60; w += 1) {
    await client.query(
      `INSERT INTO users (id,email,password_hash) VALUES ($1,$2,'x') ON CONFLICT DO NOTHING`,
      [uuid(w), `u${w}@ci.invalid`]);
    await client.query(
      `INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [uuid(w), `ws${w}`, uuid(w)]);
    // Workspace 1 is the one under test: five overlays, several goals. The rest are neighbours.
    const overlays = w === 1 ? 5 : 1;
    for (let o = 1; o <= overlays; o += 1) {
      const overlayId = uuid(w * 100 + o);
      await client.query(
        `INSERT INTO overlays (id,workspace_id,name,state) VALUES ($1,$2,$3,'{"widgets":[]}')
         ON CONFLICT DO NOTHING`, [overlayId, uuid(w), `ov${o}`]);
      const metrics = w === 1
        ? ['follows', 'likes', 'shares', 'gifts', 'diamonds']
        : ['follows'];
      for (const metric of metrics) {
        await client.query(
          `INSERT INTO goal_runtime (overlay_id,widget_id,metric) VALUES ($1,$2,$3)
           ON CONFLICT DO NOTHING`, [overlayId, `w-${metric}-${o}`, metric]);
      }
    }
  }
  await client.query('ANALYZE goal_runtime');
  await client.query('ANALYZE overlays');
  await client.query('ANALYZE goal_event_apply');
}

function summarise(plan) {
  const lines = [];
  const walk = (node, depth) => {
    const type = node['Node Type'] + (node['Relation Name'] ? ` on ${node['Relation Name']}` : '')
      + (node['Index Name'] ? ` using ${node['Index Name']}` : '');
    lines.push(`${'  '.repeat(depth)}${type}  rows=${node['Actual Rows']} `
      + `time=${node['Actual Total Time']}ms shared_hit=${node['Shared Hit Blocks'] || 0} `
      + `read=${node['Shared Read Blocks'] || 0}`);
    (node.Plans || []).forEach(child => walk(child, depth + 1));
  };
  walk(plan.Plan, 0);
  return lines.join('\n');
}

async function explain(client, label, sql, params) {
  const q = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, params);
  const plan = q.rows[0]['QUERY PLAN'][0];
  const seq = /Seq Scan/.test(JSON.stringify(plan));
  console.log(`\n=== ${label}${seq ? '   ⚠ SEKVENTIELL SCANNING' : ''}`);
  console.log(summarise(plan));
  console.log(`    total ${plan['Execution Time']}ms, planering ${plan['Planning Time']}ms`);
  return { label, seq, executionMs: plan['Execution Time'] };
}

(async () => {
  const client = new Client({ connectionString: URL });
  await client.connect();
  await seed(client);

  const results = [];
  // 1. A workspace with no goal for this metric: the claim must decide "nothing to count" cheaply,
  //    because on a busy account this is the common case for every metric nobody is tracking.
  results.push(await explain(client, 'claim: workspace utan matchande mål',
    G.CLAIM_SQL, [uuid(2), 'x-nomatch', ['likes']]));

  // 2. One workspace, one goal.
  results.push(await explain(client, 'claim: workspace med ett mål',
    G.CLAIM_SQL, [uuid(2), 'x-match', ['follows']]));

  // 3. Five overlays and several goals — the update has to find them all.
  results.push(await explain(client, 'uppdatering: fem overlays, flera mål (follows)',
    G.incrementSql([['follows', 1]]), [uuid(1), 'follows', 1]));

  // 4. A gift feeds two metrics in one statement.
  results.push(await explain(client, 'uppdatering: gifts + diamonds i samma event',
    G.incrementSql([['gifts', 8], ['diamonds', 80]]), [uuid(1), 'gifts', 8, 'diamonds', 80]));

  await client.end();

  const scans = results.filter(r => r.seq);
  console.log('\n---------------------------------------------');
  if (scans.length) {
    console.log('SEKVENTIELL SCANNING i: ' + scans.map(r => r.label).join(' | '));
    console.log('Indexbeslut tas utifrån dessa planer — inte innan.');
  } else {
    console.log('Ingen sekventiell scanning i någon plan. Inget index läggs till.');
  }
})().catch(error => { console.error(error); process.exit(1) });
