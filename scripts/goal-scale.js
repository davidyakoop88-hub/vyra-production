'use strict';
// Planner scale. The earlier EXPLAIN ran against 64 overlays and 84 goals — Postgres correctly picks
// a sequential scan on a table that fits in two pages, so those plans could not answer the index
// question either way. This builds a table big enough for the planner to have a real choice, reads
// the plans, proposes an index from what they show, and reruns to compare.
//
// CI only, against the throwaway container in TEST_DATABASE_URL.
const path = require('path');
const { Client } = require(path.join(__dirname, '..', 'server', 'node_modules', 'pg'));
const G = require(path.join(__dirname, '..', 'server', 'goal-runtime.js'));

const URL = process.env.TEST_DATABASE_URL;
if (!URL) { console.error('TEST_DATABASE_URL saknas'); process.exit(1) }

const OVERLAYS = Number(process.env.SCALE_OVERLAYS || 10000);
const WORKSPACES = Number(process.env.SCALE_WORKSPACES || 2000);
const METRICS = ['follows', 'likes', 'shares', 'gifts', 'diamonds'];
const uuid = (p, n) => `${p}${String(n).padStart(8 - p.length, '0')}-0000-0000-0000-000000000000`;

// Three shapes the write path actually meets: an account tracking nothing for this metric, one
// tracking a single goal, and one tracking several across several overlays.
const WS_NO_GOAL = uuid('a', 1);
const WS_ONE_GOAL = uuid('b', 1);
const WS_MANY = uuid('c', 1);

async function seed(client) {
  console.log(`seedar ${WORKSPACES} workspaces, ${OVERLAYS} overlays…`);
  await client.query('TRUNCATE goal_event_apply, goal_runtime CASCADE');
  await client.query('DELETE FROM overlays');
  await client.query('DELETE FROM workspaces');
  await client.query('DELETE FROM users');

  // Bulk-generated so the seed is seconds rather than minutes.
  await client.query(`
    INSERT INTO users (id,email,password_hash,display_name)
    SELECT ('00000000-0000-0000-0000-' || lpad(g::text,12,'0'))::uuid,
           'u' || g || '@scale.invalid', 'x', 'scale'
      FROM generate_series(1,$1) g`, [WORKSPACES]);
  await client.query(`
    INSERT INTO workspaces (id,name,owner_user_id)
    SELECT ('00000000-0000-0000-0000-' || lpad(g::text,12,'0'))::uuid, 'ws'||g,
           ('00000000-0000-0000-0000-' || lpad(g::text,12,'0'))::uuid
      FROM generate_series(1,$1) g`, [WORKSPACES]);
  // Overlays spread across the workspaces, five per workspace on average.
  await client.query(`
    INSERT INTO overlays (id,workspace_id,name,state)
    SELECT ('10000000-0000-0000-0000-' || lpad(g::text,12,'0'))::uuid,
           ('00000000-0000-0000-0000-' || lpad((((g-1) % $2)+1)::text,12,'0'))::uuid,
           'ov'||g, '{"widgets":[]}'::jsonb
      FROM generate_series(1,$1) g`, [OVERLAYS, WORKSPACES]);
  // Five goals per overlay, one per metric — 50 000 goal_runtime rows at 10 000 overlays.
  await client.query(`
    INSERT INTO goal_runtime (overlay_id,widget_id,metric)
    SELECT o.id, 'w-'||m.metric, m.metric
      FROM overlays o CROSS JOIN unnest($1::text[]) AS m(metric)`, [METRICS]);

  // The three probe workspaces, built explicitly so each has a known shape.
  for (const [id, name] of [[WS_NO_GOAL, 'no-goal'], [WS_ONE_GOAL, 'one-goal'], [WS_MANY, 'many']]) {
    await client.query(
      `INSERT INTO users (id,email,password_hash,display_name) VALUES ($1,$2,'x','scale')`,
      [id, `${name}@scale.invalid`]);
    await client.query(`INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,$2,$1)`, [id, name]);
  }
  await client.query(
    `INSERT INTO overlays (id,workspace_id,name,state) VALUES ($1,$1,'probe','{"widgets":[]}')`,
    [WS_NO_GOAL]);
  await client.query(
    `INSERT INTO overlays (id,workspace_id,name,state) VALUES ($1,$1,'probe','{"widgets":[]}')`,
    [WS_ONE_GOAL]);
  await client.query(
    `INSERT INTO goal_runtime (overlay_id,widget_id,metric) VALUES ($1,'w-follows','follows')`,
    [WS_ONE_GOAL]);
  for (let i = 1; i <= 5; i += 1) {
    const overlayId = uuid('d', i);
    await client.query(
      `INSERT INTO overlays (id,workspace_id,name,state) VALUES ($1,$2,'probe','{"widgets":[]}')`,
      [overlayId, WS_MANY]);
    for (const metric of METRICS) {
      await client.query(
        `INSERT INTO goal_runtime (overlay_id,widget_id,metric) VALUES ($1,$2,$3)`,
        [overlayId, `w-${metric}`, metric]);
    }
  }
  await client.query('ANALYZE users; ANALYZE workspaces; ANALYZE overlays; ANALYZE goal_runtime');
  const counts = await client.query(
    `SELECT (SELECT count(*) FROM overlays) ov, (SELECT count(*) FROM goal_runtime) gr,
            (SELECT count(*) FROM workspaces) ws`);
  console.log(`  overlays=${counts.rows[0].ov}  goal_runtime=${counts.rows[0].gr}  `
    + `workspaces=${counts.rows[0].ws}\n`);
}

function summarise(plan) {
  const lines = [];
  const walk = (node, depth) => {
    const label = node['Node Type']
      + (node['Relation Name'] ? ` on ${node['Relation Name']}` : '')
      + (node['Index Name'] ? ` using ${node['Index Name']}` : '');
    lines.push(`${'  '.repeat(depth + 1)}${label}  rows=${node['Actual Rows']} `
      + `time=${node['Actual Total Time']}ms hit=${node['Shared Hit Blocks'] || 0} `
      + `read=${node['Shared Read Blocks'] || 0}`);
    (node.Plans || []).forEach(child => walk(child, depth + 1));
  };
  walk(plan.Plan, 0);
  return lines.join('\n');
}

async function explain(client, label, sql, params) {
  // Run once untimed so the plan is not measuring a cold cache.
  await client.query(sql, params).catch(() => {});
  const q = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, params);
  const plan = q.rows[0]['QUERY PLAN'][0];
  const json = JSON.stringify(plan);
  const seqOnGoals = /"Node Type":"Seq Scan","[^}]*"Relation Name":"goal_runtime"/.test(json)
    || /"Relation Name":"goal_runtime"[^}]*"Node Type":"Seq Scan"/.test(json);
  console.log(`\n--- ${label}`);
  console.log(summarise(plan));
  console.log(`    exekvering ${plan['Execution Time']}ms, planering ${plan['Planning Time']}ms`
    + `${seqOnGoals ? '   ⚠ Seq Scan på goal_runtime' : ''}`);
  return { label, ms: plan['Execution Time'], seqOnGoals, blocks: plan.Plan['Shared Hit Blocks'] || 0 };
}

async function probes(client, when) {
  console.log(`\n================ PLANER ${when} INDEX ================`);
  const out = [];
  out.push(await explain(client, 'claim: workspace utan matchande mål',
    G.CLAIM_SQL, [WS_NO_GOAL, `p-${when}-1`, ['likes']]));
  out.push(await explain(client, 'claim: workspace med ett mål',
    G.CLAIM_SQL, [WS_ONE_GOAL, `p-${when}-2`, ['follows']]));
  out.push(await explain(client, 'uppdatering: workspace med flera mål (follows)',
    G.incrementSql([['follows', 1]]), [WS_MANY, 'follows', 1]));
  out.push(await explain(client, 'uppdatering: gifts + diamonds i samma event',
    G.incrementSql([['gifts', 8], ['diamonds', 80]]), [WS_MANY, 'gifts', 8, 'diamonds', 80]));
  return out;
}

(async () => {
  const client = new Client({ connectionString: URL });
  await client.connect();
  await seed(client);

  const before = await probes(client, 'FÖRE');

  // The index is proposed from the plans above, not decided in advance. Every probe filters on
  // overlays.workspace_id first and then goal_runtime.metric, so the candidates follow that order:
  // reach the overlays of one workspace, then the goals of those overlays for one metric.
  console.log('\n================ FÖRESLAGNA INDEX ================');
  const proposals = [
    ['overlays_workspace_idx', 'CREATE INDEX overlays_workspace_idx ON overlays(workspace_id)'],
    ['goal_runtime_overlay_metric_idx',
      'CREATE INDEX goal_runtime_overlay_metric_idx ON goal_runtime(overlay_id, metric)']
  ];
  for (const [name, sql] of proposals) {
    console.log(`  ${sql}`);
    await client.query(`DROP INDEX IF EXISTS ${name}`);
    await client.query(sql);
  }
  await client.query('ANALYZE overlays; ANALYZE goal_runtime');

  const after = await probes(client, 'EFTER');

  console.log('\n================ FÖRE / EFTER ================');
  for (let i = 0; i < before.length; i += 1) {
    const b = before[i], a = after[i];
    const delta = b.ms > 0 ? ((a.ms - b.ms) / b.ms * 100).toFixed(0) : '0';
    console.log(`${b.label}\n    ${b.ms.toFixed(3)}ms → ${a.ms.toFixed(3)}ms  (${delta > 0 ? '+' : ''}${delta}%)`
      + `   seq på goal_runtime: ${b.seqOnGoals} → ${a.seqOnGoals}`);
  }
  await client.end();
})().catch(error => { console.error(error); process.exit(1) });
