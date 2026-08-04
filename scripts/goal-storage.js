'use strict';
// What the idempotency table costs, and what the alternatives would save. Measures rather than
// argues: the same row count in four shapes, at 100 000 and 1 000 000 rows.
//
//   A  text event_id + btree PK          — what the schema has today
//   B  bytea sha256 digest + btree PK    — fixed 32 bytes instead of a variable-length string
//   C  A + BRIN on applied_at            — the sweep scans by time, and the table is append-ordered
//   D  B + BRIN on applied_at
//
// Nothing here changes the production schema. CI only, TEST_DATABASE_URL.
const path = require('path');
const { Client } = require(path.join(__dirname, '..', 'server', 'node_modules', 'pg'));

const URL = process.env.TEST_DATABASE_URL;
if (!URL) { console.error('TEST_DATABASE_URL saknas'); process.exit(1) }

const SIZES = (process.env.STORAGE_ROWS || '100000,1000000').split(',').map(Number);
const WS = 'aaaaaaaa-0000-0000-0000-000000000000';
const mb = bytes => (Number(bytes) / 1024 / 1024).toFixed(1) + ' MB';

// Event ids the length the bridge actually produces: "<type>:<msgId>" with a snowflake-sized id.
const GEN_TEXT = `'gift:74' || lpad(g::text, 17, '0')`;
const GEN_HASH = `sha256(('gift:74' || lpad(g::text, 17, '0'))::bytea)`;

const VARIANTS = [
  { key: 'A', label: 'text-ID + btree PK (nuvarande)', idType: 'text', gen: GEN_TEXT, brin: false },
  { key: 'B', label: 'sha256 bytea + btree PK', idType: 'bytea', gen: GEN_HASH, brin: false },
  { key: 'C', label: 'text-ID + btree PK + BRIN(applied_at)', idType: 'text', gen: GEN_TEXT, brin: true },
  { key: 'D', label: 'sha256 bytea + btree PK + BRIN(applied_at)', idType: 'bytea', gen: GEN_HASH, brin: true }
];

async function measure(client, variant, rows) {
  const t = `storage_${variant.key.toLowerCase()}`;
  await client.query(`DROP TABLE IF EXISTS ${t}`);
  await client.query(`
    CREATE TABLE ${t} (
      workspace_id uuid NOT NULL,
      event_id ${variant.idType} NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, event_id)
    ) WITH (fillfactor = 90)`);
  // applied_at spread across three days so the retention comparison has something to select.
  await client.query(`
    INSERT INTO ${t} (workspace_id, event_id, applied_at)
    SELECT $1, ${variant.gen}, now() - (g % 259200) * interval '1 second'
      FROM generate_series(1, $2) g`, [WS, rows]);
  if (variant.brin) {
    await client.query(`CREATE INDEX ${t}_brin ON ${t} USING brin (applied_at)`);
  } else {
    await client.query(`CREATE INDEX ${t}_btree ON ${t} (applied_at)`);
  }
  await client.query(`VACUUM ANALYZE ${t}`);

  const q = await client.query(`
    SELECT pg_table_size($1) heap, pg_indexes_size($1) idx, pg_total_relation_size($1) total`, [t]);
  const r = q.rows[0];

  // How long the sweep's own selection takes on this shape — the only query that reads applied_at.
  const sweep = await client.query(
    `EXPLAIN (ANALYZE, FORMAT JSON) SELECT ctid FROM ${t}
      WHERE applied_at < now() - interval '48 hours' LIMIT 5000`);
  const plan = sweep.rows[0]['QUERY PLAN'][0];

  const retention = await client.query(`
    SELECT count(*) FILTER (WHERE applied_at >= now() - interval '24 hours') AS keep24,
           count(*) FILTER (WHERE applied_at >= now() - interval '48 hours') AS keep48
      FROM ${t}`);

  await client.query(`DROP TABLE ${t}`);
  return {
    ...variant, rows,
    heap: Number(r.heap), idx: Number(r.idx), total: Number(r.total),
    perRow: Number(r.total) / rows,
    sweepMs: plan['Execution Time'],
    sweepNode: plan.Plan['Node Type'] + (plan.Plan.Plans ? ` / ${plan.Plan.Plans[0]['Node Type']}` : ''),
    keep24: Number(retention.rows[0].keep24), keep48: Number(retention.rows[0].keep48)
  };
}

(async () => {
  const client = new Client({ connectionString: URL });
  await client.connect();
  await client.query('SET statement_timeout = 0');

  for (const rows of SIZES) {
    console.log(`\n================ ${rows.toLocaleString('sv-SE')} RADER ================`);
    const measured = [];
    for (const variant of VARIANTS) measured.push(await measure(client, variant, rows));

    const base = measured[0];
    for (const m of measured) {
      const delta = ((m.total - base.total) / base.total * 100).toFixed(0);
      console.log(`\n${m.key}  ${m.label}`);
      console.log(`   heap ${mb(m.heap).padStart(9)}   index ${mb(m.idx).padStart(9)}   `
        + `totalt ${mb(m.total).padStart(9)}   ${m.perRow.toFixed(1)} B/rad`
        + `${m.key === 'A' ? '   (referens)' : `   ${delta > 0 ? '+' : ''}${delta}% mot A`}`);
      console.log(`   sweep-selektion: ${m.sweepMs.toFixed(1)}ms  (${m.sweepNode})`);
    }

    // Retention is the same question for every variant: how much of the table a shorter window drops.
    const { keep24, keep48 } = measured[0];
    console.log(`\n   retention vid ${rows.toLocaleString('sv-SE')} rader över 3 dygn:`);
    console.log(`     24 h behåller ${keep24.toLocaleString('sv-SE')} rader `
      + `(${(keep24 / rows * 100).toFixed(0)}%)`);
    console.log(`     48 h behåller ${keep48.toLocaleString('sv-SE')} rader `
      + `(${(keep48 / rows * 100).toFixed(0)}%)`);
    console.log(`     skillnad: ${(keep48 - keep24).toLocaleString('sv-SE')} rader, `
      + `${mb((keep48 - keep24) * measured[0].perRow)}`);
  }

  console.log('\n================ REPLAYGARANTIN ================');
  console.log('Redis dedupe-nyckeln lever 24 h (EX 86400 i server/event-bus.js). Postgres-fönstret är');
  console.log('det bredare av de två och är det som gäller när Redis är tömt eller omstartat.');
  console.log('');
  console.log('48 h: ett event som återlevereras upp till två dygn efter första gången känns igen och');
  console.log('      räknas inte om — även efter en Redis-flush, en Railway-omstart, eller en');
  console.log('      sändning som pågått över ett dygn.');
  console.log('24 h: fönstret blir exakt lika brett som Redis TTL. Förloras: skyddet mot en');
  console.log('      omleverans som kommer efter att Redis-nyckeln också hunnit gå ut. En streamer');
  console.log('      som sänder längre än ett dygn i sträck, eller en bridge som återansluter och');
  console.log('      spelar upp gammalt, kan då dubbelräkna. Det är den enda garanti som försvinner —');
  console.log('      allt inom dygnet skyddas fortfarande av båda lagren.');
  await client.end();
})().catch(error => { console.error(error); process.exit(1) });
