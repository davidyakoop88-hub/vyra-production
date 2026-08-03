'use strict';
// Measures what a goal_event_apply row actually costs, heap and index separately, after a known
// number of rows. Replaces the estimate in the architecture report — heap header, alignment and the
// primary key's own copy of the key are not things to guess at.
// CI only, against the throwaway container in TEST_DATABASE_URL.
const { Client } = require(require('path').join(__dirname, '..', 'server', 'node_modules', 'pg'));

const URL = process.env.TEST_DATABASE_URL;
if (!URL) { console.error('TEST_DATABASE_URL saknas'); process.exit(1) }

const ROWS = Number(process.env.GOAL_SIZE_ROWS || 100000);
const WS = '00000001-0000-0000-0000-000000000000';
const kb = bytes => (bytes / 1024).toFixed(0) + ' kB';

(async () => {
  const client = new Client({ connectionString: URL });
  await client.connect();
  await client.query('TRUNCATE goal_event_apply');

  // Event ids the length the bridge actually produces: "<type>:<msgId>" with a snowflake-ish id.
  await client.query(
    `INSERT INTO goal_event_apply (workspace_id, event_id)
     SELECT $1, 'gift:74' || lpad(g::text, 17, '0') FROM generate_series(1, $2) g`,
    [WS, ROWS]);
  await client.query('VACUUM ANALYZE goal_event_apply');

  const q = await client.query(`
    SELECT pg_total_relation_size('goal_event_apply')   AS total,
           pg_table_size('goal_event_apply')            AS heap,
           pg_indexes_size('goal_event_apply')          AS idx,
           (SELECT count(*) FROM goal_event_apply)      AS rows`);
  const r = q.rows[0];
  const rows = Number(r.rows);

  console.log(`\n=== goal_event_apply, ${rows.toLocaleString('sv-SE')} rader`);
  console.log(`heap    ${kb(r.heap)}   ${(r.heap / rows).toFixed(1)} B/rad`);
  console.log(`index   ${kb(r.idx)}   ${(r.idx / rows).toFixed(1)} B/rad`);
  console.log(`totalt  ${kb(r.total)}   ${(r.total / rows).toFixed(1)} B/rad`);

  // What the 48-hour retention window costs at the ingest ceiling, using the measured figure rather
  // than an estimate. 100 events/s is the per-workspace rate limit in server/index.js.
  const perRow = r.total / rows;
  const worstCase = perRow * 100 * 3600 * 48;
  console.log(`\nvid 100 ev/s i 48 h, ett workspace: ${(worstCase / 1024 ** 3).toFixed(2)} GiB`);
  console.log('(taket, inte en prognos — förutsätter full ingestgräns dygnet runt)');

  const goals = await client.query(`
    SELECT pg_total_relation_size('goal_runtime') AS total,
           (SELECT count(*) FROM goal_runtime)    AS rows`);
  console.log(`\n=== goal_runtime, ${goals.rows[0].rows} rader: ${kb(goals.rows[0].total)} totalt`);

  await client.end();
})().catch(error => { console.error(error); process.exit(1) });
