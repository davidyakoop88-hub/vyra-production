'use strict';
// The contract live-driven goals must satisfy before any of it is implemented.
//
// Two halves, deliberately separated:
//
//   Pure  — the metric mapping. Runs anywhere, RED right now because goal-runtime.js does not exist.
//   DB    — baseline/progress, idempotency, atomicity, concurrency. These need a REAL Postgres.
//           Without one they report as BLOCKED, not as passing. A mocked transaction proves nothing
//           about transactions: the whole point of putting idempotency in Postgres is that the
//           database enforces it, so a fake that always agrees would be worse than no test at all.
//
// Point TEST_DATABASE_URL at a THROWAWAY database. Never the shared staging one — these tests write,
// delete and deliberately deadlock.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL
  ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Sätt TEST_DATABASE_URL till en engångsdatabas — '
    + 'aldrig den delade stagingdatabasen. Kontraktet är oprövat tills dess.';

// The implementation this file is written against. Absent today, which is why the pure tests are red.
let G = null;
try { G = require(path.join(__dirname, '..', 'goal-runtime.js')) } catch (_) { /* red below */ }

// ---- schema under test --------------------------------------------------------------------------
// Kept here as the single statement of the contract, so schema and tests cannot drift apart. The
// migration, when it is written, has to match this byte for byte in shape.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS goal_runtime (
  overlay_id  uuid    NOT NULL REFERENCES overlays(id) ON DELETE CASCADE,
  widget_id   text    NOT NULL,
  metric      text    NOT NULL CHECK (metric IN ('follows','likes','shares','gifts','diamonds')),
  baseline    bigint  NOT NULL DEFAULT 0 CHECK (baseline >= 0),
  progress    bigint  NOT NULL DEFAULT 0 CHECK (progress >= 0),
  target      bigint  NOT NULL DEFAULT 1000 CHECK (target > 0),
  epoch       integer NOT NULL DEFAULT 1 CHECK (epoch >= 1),
  reset_at    timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (overlay_id, widget_id)
);
CREATE INDEX IF NOT EXISTS goal_runtime_metric_idx ON goal_runtime (overlay_id, metric);

-- The FK matters more here than anywhere else in the schema: this is the highest-volume table in
-- the system, and without ON DELETE CASCADE a deleted workspace leaves its idempotency rows behind
-- forever. At the ingest ceiling that is millions of orphans per workspace with nothing left that
-- could ever reference them.
CREATE TABLE IF NOT EXISTS goal_event_apply (
  workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_id     text        NOT NULL,
  applied_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, event_id)
) WITH (fillfactor = 90);
-- BRIN, not B-tree: the table is written in applied_at order, which is what BRIN is for, and
-- it measured 162,7 against 175,4 bytes a row at a million rows. The drop keeps this in step with
-- schema.sql, which is the whole point of stating the schema here.
DROP INDEX IF EXISTS goal_event_apply_sweep_idx;
CREATE INDEX IF NOT EXISTS goal_event_apply_sweep_brin ON goal_event_apply USING brin (applied_at);
`;

// ---- the write path, stated exactly ---------------------------------------------------------------
// goal_runtime is keyed by overlay, but an event arrives for a WORKSPACE. Every write therefore joins
// through overlays. Both statements run inside one transaction, in this order:
//
//   1. Claim the id. Zero rows back means the event was already applied — commit and stop.
//   2. Increment every goal in the workspace whose metric matches, in one statement.
//
// Whether the index below is the one the planner picks is NOT assumed. goal_runtime(overlay_id, metric)
// indexes the wrong leading column for a workspace-wide update: the filter starts at
// overlays.workspace_id. The right index may well be on overlays(workspace_id) with a plain
// goal_runtime(metric), or a composite reached the other way round. That is measured with EXPLAIN
// (ANALYZE, BUFFERS) against the isolated database before any index is added — not guessed here.
// The statements live in goal-runtime.js and are asserted here rather than restated, so the contract
// cannot drift from the implementation.
test('claim-satsen är atomär och rapporterar sitt utfall', { timeout: 5000 }, () => {
  assert.ok(G, 'server/goal-runtime.js finns inte');
  // Without RETURNING there is no way to tell "claimed" from "already claimed" — rowCount would be
  // 0 in both cases and every event would look like a duplicate.
  assert.match(G.CLAIM_SQL, /RETURNING 1/, 'claim-satsen saknar RETURNING 1');
  // Existence check and insert in ONE statement: a separate pre-check leaves a window in which a
  // concurrent reset or delete can remove the last matching goal after the check and before the write.
  assert.match(G.CLAIM_SQL, /WHERE EXISTS/, 'existenskontrollen är inte en del av claim-satsen');
  assert.match(G.CLAIM_SQL, /gr\.metric = ANY\(\$3::text\[\]\)/,
    'claim-satsen kontrollerar inte alla eventets metriker på en gång');
  assert.match(G.CLAIM_SQL, /ON CONFLICT \(workspace_id, event_id\) DO NOTHING/);
  assert.ok(!/SELECT 1[\s\S]*LIMIT 1\s*$/.test(G.CLAIM_SQL.trim()),
    'en separat förkontroll finns kvar');
});

test('uppräkningen sker i en enda sats med en bidragstabell', { timeout: 5000 }, () => {
  assert.ok(G, 'server/goal-runtime.js finns inte');
  const sql = G.incrementSql([['gifts', 8], ['diamonds', 80]]);
  assert.match(sql, /\(VALUES \(\$2::text, \$3::bigint\), \(\$4::text, \$5::bigint\)\)/,
    'bidragen skickas inte som en VALUES-tabell');
  assert.match(sql, /AS contribution\(metric, amount\)/);
  assert.match(sql, /contribution\.amount <> 0/, 'nollbidrag filtreras inte bort');
  assert.match(sql, /o\.workspace_id = \$1/, 'uppdateringen joinar inte via overlays.workspace_id');
  // One statement, not one per metric.
  assert.equal((sql.match(/UPDATE goal_runtime/g) || []).length, 1);
});

test('bidragslistan byggs efter eventtypen, inte hårdkodad', { timeout: 5000 }, () => {
  assert.ok(G, 'server/goal-runtime.js finns inte');
  assert.deepEqual(G.contributionsFor({ type: 'gift', count: 8, value: 80 }),
    [['gifts', 8], ['diamonds', 80]], 'ett gift bidrar inte till båda metrikerna');
  assert.deepEqual(G.contributionsFor({ type: 'like', count: 12, value: 2700 }),
    [['likes', 12]], 'like bidrar med något annat än count');
  assert.deepEqual(G.contributionsFor({ type: 'follow' }), [['follows', 1]]);
  assert.deepEqual(G.contributionsFor({ type: 'share' }), [['shares', 1]]);
  // Zero-amount contributions are dropped before the claim, so nothing is written for an increment
  // of nothing.
  assert.deepEqual(G.contributionsFor({ type: 'like', count: 0, value: 2700 }), []);
  assert.deepEqual(G.contributionsFor({ type: 'gift', count: 3, value: 0 }), [['gifts', 3]]);
});

// ---- del 1: metrikavbildningen, körs överallt ----------------------------------------------------
// The measured gift semantics, restated as the goal counter's input contract: what a forwarded event
// is worth. A streak has already been collapsed to its final frame by the bridge, so `count` is the
// streak's total and `value` is diamondCount x count.
const AMOUNTS = [
  { name: 'follows räknar ett per follow', metric: 'follows',
    event: { type: 'follow', count: 0, value: 0 }, expect: 1 },
  { name: 'shares räknar ett per share', metric: 'shares',
    event: { type: 'share', count: 0, value: 0 }, expect: 1 },
  { name: 'likes använder count', metric: 'likes',
    event: { type: 'like', count: 12, value: 2700 }, expect: 12 },
  { name: 'likes med count 0 ökar med 0', metric: 'likes',
    event: { type: 'like', count: 0, value: 2700 }, expect: 0 },
  { name: 'gifts använder slutframens count', metric: 'gifts',
    event: { type: 'gift', count: 8, value: 8 }, expect: 8 },
  { name: 'diamonds använder slutframens value', metric: 'diamonds',
    event: { type: 'gift', count: 8, value: 80 }, expect: 80 },
  { name: 'en metrik ignorerar event av fel typ', metric: 'likes',
    event: { type: 'gift', count: 8, value: 80 }, expect: 0 }
];

for (const row of AMOUNTS) {
  test(`metrik: ${row.name}`, { timeout: 5000 }, () => {
    assert.ok(G, 'server/goal-runtime.js finns inte — kontraktet är ännu inte implementerat');
    assert.equal(G.goalAmount(row.metric, row.event), row.expect);
  });
}

test('likes får aldrig läsa value — det är rumstotalen', { timeout: 5000 }, () => {
  assert.ok(G, 'server/goal-runtime.js finns inte — kontraktet är ännu inte implementerat');
  // Same event twice, only the room total differs. A like goal must not notice.
  const a = G.goalAmount('likes', { type: 'like', count: 3, value: 100 });
  const b = G.goalAmount('likes', { type: 'like', count: 3, value: 999999 });
  assert.equal(a, b, 'like-beloppet påverkas av value — rumstotalen läcker in i målet');
  assert.equal(a, 3);
});

test('okänd metrik kastar i stället för att tyst ge noll', { timeout: 5000 }, () => {
  assert.ok(G, 'server/goal-runtime.js finns inte — kontraktet är ännu inte implementerat');
  assert.throws(() => G.goalAmount('subscribers', { type: 'follow' }), /metrik/i);
});

// ---- del 2: databaskontraktet -------------------------------------------------------------------
// Every test below states, in its own name, what stays unproven while BLOCKED is set.
const db = (name, fn) => test(`db: ${name}`, { timeout: 20000, skip: BLOCKED }, fn);

let pool = null;
const WS = '11111111-1111-1111-1111-111111111111';
const OVERLAY = '22222222-2222-2222-2222-222222222222';

// Opens the throwaway database and puts the fixtures the contract assumes in place. Runs only when
// TEST_DATABASE_URL is set; without it every db() below is skipped and this never executes.
test.before(async () => {
  if (BLOCKED) return;
  const { Pool } = require(path.join(__dirname, '..', 'node_modules', 'pg'));
  pool = new Pool({ connectionString: DB_URL, max: 8 });
  await pool.query(SCHEMA);
  await seedWorkspace(WS);
  await pool.query(
    `INSERT INTO overlays (id, workspace_id, name, state)
     VALUES ($1, $2, 'contract', '{"widgets":[]}'::jsonb)
     ON CONFLICT (id) DO NOTHING`, [OVERLAY, WS]);
  await pool.query('DELETE FROM goal_event_apply WHERE workspace_id = $1', [WS]);
  await pool.query('DELETE FROM goal_runtime WHERE overlay_id = $1', [OVERLAY]);
});

// Fixtures live here, not in goal-runtime.js — production code has no business creating workspaces.
async function seedWorkspace(id) {
  // display_name is NOT NULL in the real schema — the fixture has to satisfy every constraint the
  // production tables carry, or the contract never gets as far as being evaluated.
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name) VALUES ($1,$2,'x','contract')
     ON CONFLICT (id) DO NOTHING`, [id, `${id}@test.invalid`]);
  await pool.query(
    `INSERT INTO workspaces (id, name, owner_user_id) VALUES ($1,'test',$2)
     ON CONFLICT (id) DO NOTHING`, [id, id]);
}

// Replaces the goal set for the overlay, so each test states exactly which metrics exist.
async function goalsOnly(pairs) {
  await pool.query('DELETE FROM goal_runtime WHERE overlay_id=$1', [OVERLAY]);
  for (const [widgetId, metric] of pairs) {
    await G.upsertGoal(pool, { overlayId: OVERLAY, widgetId, metric, baseline: 0, target: 1000 });
  }
}

test('databaskontraktet körs mot riktig Postgres, aldrig mot en mock', { timeout: 5000 }, () => {
  // This one always runs. It is the guard against someone "fixing" the blocked tests with a stub.
  const source = require('fs').readFileSync(__filename, 'utf8');
  // Assembled from fragments so the guard cannot trip over its own pattern.
  const banned = ['si' + 'non', 'proxy' + 'quire', 'jest' + '.mock', 'createMock' + 'Pool'];
  assert.ok(!banned.some(word => source.includes(word)),
    'en mock har smugit sig in i transaktionskontraktet');
  if (BLOCKED) {
    console.log('\n  ⚠ ' + BLOCKED + '\n    Oprövat: baseline+progress, idempotens, atomicitet, '
      + 'samtidighet, reset/epoch.\n');
  }
});

db('schemat kan skapas och beskriver de fält kontraktet kräver', async () => {
  await pool.query(SCHEMA);
  const q = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'goal_runtime' ORDER BY column_name`);
  const names = q.rows.map(r => r.column_name);
  for (const col of ['overlay_id', 'widget_id', 'metric', 'baseline', 'progress', 'target',
    'epoch', 'revision', 'reset_at', 'updated_at']) assert.ok(names.includes(col), `kolumnen ${col} saknas`);
});

// Produktionens goal_runtime fanns innan revision gjorde det. CREATE TABLE IF NOT EXISTS rör inte
// en befintlig tabell, så det som måste fungera är ALTER-vägen — och den provas genom att ta bort
// kolumnen och köra schemat igen, precis som migrationen gör mot Railway.
db('revision läggs till på en tabell som redan finns', async () => {
  await pool.query(SCHEMA);
  await pool.query('ALTER TABLE goal_runtime DROP COLUMN IF EXISTS revision');
  await pool.query(SCHEMA);
  const q = await pool.query(
    `SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'goal_runtime' AND column_name = 'revision'`);
  assert.equal(q.rowCount, 1, 'revision kom inte tillbaka — migrationen är inte idempotent');
  assert.equal(q.rows[0].data_type, 'bigint');
  assert.equal(q.rows[0].is_nullable, 'NO');
  assert.match(q.rows[0].column_default || '', /0/, 'befintliga rader får ingen startrevision');
});

db('schemats garantier finns i databasen, inte bara i koden', async () => {
  await pool.query(SCHEMA);
  const pk = await pool.query(
    `SELECT a.attname FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'goal_runtime'::regclass AND i.indisprimary ORDER BY a.attname`);
  assert.deepEqual(pk.rows.map(r => r.attname), ['overlay_id', 'widget_id'],
    'primärnyckeln är inte (overlay_id, widget_id)');

  const fks = await pool.query(
    `SELECT c.conrelid::regclass::text tbl, c.confdeltype
       FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.conrelid IN ('goal_runtime'::regclass, 'goal_event_apply'::regclass)`);
  assert.equal(fks.rowCount, 2, 'båda främmande nycklarna finns inte');
  for (const row of fks.rows) {
    assert.equal(row.confdeltype, 'c', `${row.tbl} kaskaderar inte vid DELETE`);
  }

  // The metric list and the non-negative bounds are enforced by the database, so a bug in the write
  // path cannot quietly store a negative goal or an invented metric.
  await assert.rejects(() => pool.query(
    `INSERT INTO goal_runtime (overlay_id, widget_id, metric) VALUES ($1,'bad','subscribers')`,
    [OVERLAY]), /metric/i, 'okänd metrik accepterades');
  await assert.rejects(() => pool.query(
    `INSERT INTO goal_runtime (overlay_id, widget_id, metric, progress)
     VALUES ($1,'neg','likes',-1)`, [OVERLAY]), /progress/i, 'negativ progress accepterades');
  await assert.rejects(() => pool.query(
    `INSERT INTO goal_runtime (overlay_id, widget_id, metric, baseline)
     VALUES ($1,'negb','likes',-1)`, [OVERLAY]), /baseline/i, 'negativ baseline accepterades');
  await assert.rejects(() => pool.query(
    `INSERT INTO goal_runtime (overlay_id, widget_id, metric, target)
     VALUES ($1,'zero','likes',0)`, [OVERLAY]), /target/i, 'target 0 accepterades');
});

db('visat värde är baseline + progress, och baseline rörs aldrig av event', async () => {
  await G.upsertGoal(pool, { overlayId: OVERLAY, widgetId: 'w1', metric: 'follows', baseline: 658, target: 1000 });
  await G.applyEvent(pool, WS, { id: 'e1', type: 'follow', count: 0, value: 0 });
  const goal = await G.readGoal(pool, OVERLAY, 'w1');
  assert.equal(goal.baseline, 658, 'baseline ändrades av ett event');
  assert.equal(goal.progress, 1);
  assert.equal(goal.value, 659, 'visat värde är inte baseline + progress');
});

db('samma event-ID ökar målet exakt en gång', async () => {
  await goalsOnly([['w1', 'follows']]);
  const before = (await G.readGoal(pool, OVERLAY, 'w1')).progress;
  const first = await G.applyEvent(pool, WS, { id: 'dup-1', type: 'follow' });
  const second = await G.applyEvent(pool, WS, { id: 'dup-1', type: 'follow' });
  assert.equal(first.applied, true);
  assert.equal(second.applied, false, 'dubbletten applicerades');
  assert.equal(second.updatedGoals, 0, 'dubbletten uppdaterade mål');
  assert.equal((await G.readGoal(pool, OVERLAY, 'w1')).progress, before + 1);
});

db('event-ID och uppräkning ligger i samma transaktion', async () => {
  await goalsOnly([['w1', 'follows']]);
  // The increment is made to fail after the id row is inserted. Both must roll back, or a lost
  // increment becomes permanent: the id is spent and the event can never be applied again.
  const before = await G.readGoal(pool, OVERLAY, 'w1');
  await assert.rejects(
    () => G.applyEvent(pool, WS, { id: 'tx-1', type: 'follow' }, { failAfterClaim: true }));
  const seen = await pool.query(
    'SELECT 1 FROM goal_event_apply WHERE workspace_id=$1 AND event_id=$2', [WS, 'tx-1']);
  assert.equal(seen.rowCount, 0, 'event-ID:t blev kvar trots att uppräkningen misslyckades');
  assert.equal((await G.readGoal(pool, OVERLAY, 'w1')).progress, before.progress);
  // And the event can still be applied for real afterwards.
  const retry = await G.applyEvent(pool, WS, { id: 'tx-1', type: 'follow' });
  assert.equal(retry.applied, true, 'eventet kunde inte appliceras efter en rullad transaktion');
});

db('reset nollar progress, behåller baseline och höjer epoch', async () => {
  // Builds its own goal: no test may depend on a row an earlier one happened to leave behind.
  await goalsOnly([['w-reset', 'follows']]);
  await G.applyEvent(pool, WS, { id: 'reset-seed', type: 'follow' });
  const before = await G.readGoal(pool, OVERLAY, 'w-reset');
  const after = await G.resetGoal(pool, OVERLAY, 'w-reset');
  assert.equal(after.progress, 0);
  assert.equal(after.baseline, before.baseline, 'reset ändrade baseline');
  assert.equal(after.epoch, before.epoch + 1, 'epoch höjdes inte');
  assert.ok(after.reset_at, 'reset_at sattes inte');
});

db('två samtidiga event tappar ingen ökning', async () => {
  await goalsOnly([['w1', 'follows']]);
  await G.resetGoal(pool, OVERLAY, 'w1');
  const before = (await G.readGoal(pool, OVERLAY, 'w1')).progress;
  const N = 50;
  const results = await Promise.all(Array.from({ length: N }, (_, i) =>
    G.applyEvent(pool, WS, { id: `race-${i}`, type: 'follow' })));
  assert.equal(results.filter(r => r.applied).length, N);
  assert.equal((await G.readGoal(pool, OVERLAY, 'w1')).progress, before + N,
    'samtidiga event skrev över varandra — uppräkningen är inte radlåst');
});

db('samma event-ID samtidigt från två anslutningar appliceras en gång', async () => {
  await goalsOnly([['w1', 'follows']]);
  await G.resetGoal(pool, OVERLAY, 'w1');
  const before = (await G.readGoal(pool, OVERLAY, 'w1')).progress;
  const both = await Promise.all([
    G.applyEvent(pool, WS, { id: 'same-id', type: 'follow' }),
    G.applyEvent(pool, WS, { id: 'same-id', type: 'follow' })
  ]);
  assert.equal(both.filter(r => r.applied).length, 1, 'båda anslutningarna applicerade samma ID');
  assert.equal((await G.readGoal(pool, OVERLAY, 'w1')).progress, before + 1);
});

db('goal_event_apply skrivs inte när ingen aktiv metrik matchar', async () => {
  await goalsOnly([['w1', 'follows']]);
  // The workspace has a follows goal only. A like must therefore leave no idempotency row at all —
  // this is the whole defence against one row per like, forever, on accounts with no like goal.
  const before = await pool.query('SELECT count(*)::int c FROM goal_event_apply WHERE workspace_id=$1', [WS]);
  const out = await G.applyEvent(pool, WS, { id: 'no-match-1', type: 'like', count: 9, value: 2700 });
  assert.equal(out.applied, false, 'ett event utan matchande mål räknades som applicerat');
  assert.equal(out.updatedGoals, 0);
  const after = await pool.query('SELECT count(*)::int c FROM goal_event_apply WHERE workspace_id=$1', [WS]);
  assert.equal(after.rows[0].c, before.rows[0].c, 'en idempotensrad skrevs för ett event utan mål');
  const row = await pool.query(
    'SELECT 1 FROM goal_event_apply WHERE workspace_id=$1 AND event_id=$2', [WS, 'no-match-1']);
  assert.equal(row.rowCount, 0);
});

db('samma event skrivs så snart ett matchande mål finns', async () => {
  // The flip side: the skip above must be about the metric, not about the event being ignorable.
  await G.upsertGoal(pool, { overlayId: OVERLAY, widgetId: 'w-likes', metric: 'likes', baseline: 0, target: 100 });
  const out = await G.applyEvent(pool, WS, { id: 'no-match-1', type: 'like', count: 9, value: 2700 });
  assert.equal(out.applied, true, 'eventet applicerades inte trots ett matchande like-mål');
  assert.equal((await G.readGoal(pool, OVERLAY, 'w-likes')).progress, 9, 'likes använde inte count');
});

db('workspace_id kaskaderar: raderat workspace lämnar inga föräldralösa rader', async () => {
  const orphanWs = '33333333-3333-3333-3333-333333333333';
  await seedWorkspace(orphanWs);
  await G.upsertGoal(pool, { overlayId: OVERLAY, widgetId: 'w1', metric: 'follows', baseline: 0, target: 10 });
  await G.applyEvent(pool, orphanWs, { id: 'orphan-1', type: 'follow' });
  await pool.query('DELETE FROM workspaces WHERE id=$1', [orphanWs]);
  const left = await pool.query('SELECT count(*)::int c FROM goal_event_apply WHERE workspace_id=$1', [orphanWs]);
  assert.equal(left.rows[0].c, 0, 'idempotensrader blev kvar efter att workspacet raderats');
});

// ---- ett event, flera metriker ------------------------------------------------------------------
// A gift feeds two goals at once: gifts by the streak's count, diamonds by its value. Both land in
// the same transaction, under a single claim. Splitting them into two claims would let one commit
// and the other not, and there would be no id left to retry with.

db('ett gift-event ökar både gifts och diamonds i samma transaktion', async () => {
  await goalsOnly([['w-gifts', 'gifts'], ['w-diamonds', 'diamonds']]);
  const out = await G.applyEvent(pool, WS, { id: 'multi-1', type: 'gift', count: 8, value: 80 });
  assert.equal(out.applied, true);
  assert.equal(out.updatedGoals, 2, 'båda måltyperna uppdaterades inte');
  assert.equal((await G.readGoal(pool, OVERLAY, 'w-gifts')).progress, 8, 'gifts fick inte count');
  assert.equal((await G.readGoal(pool, OVERLAY, 'w-diamonds')).progress, 80, 'diamonds fick inte value');
  // One claim, not one per metric.
  const claims = await pool.query(
    'SELECT count(*)::int c FROM goal_event_apply WHERE workspace_id=$1 AND event_id=$2', [WS, 'multi-1']);
  assert.equal(claims.rows[0].c, 1, 'eventet claimades mer än en gång');
});

db('dublett-ID uppdaterar varken gifts eller diamonds igen', async () => {
  const before = [await G.readGoal(pool, OVERLAY, 'w-gifts'), await G.readGoal(pool, OVERLAY, 'w-diamonds')];
  const again = await G.applyEvent(pool, WS, { id: 'multi-1', type: 'gift', count: 8, value: 80 });
  assert.equal(again.applied, false);
  assert.equal(again.updatedGoals, 0);
  assert.equal((await G.readGoal(pool, OVERLAY, 'w-gifts')).progress, before[0].progress);
  assert.equal((await G.readGoal(pool, OVERLAY, 'w-diamonds')).progress, before[1].progress);
});

db('workspace med endast gifts-mål får gifts, och ingen diamondsrad uppstår', async () => {
  await goalsOnly([['w-gifts', 'gifts']]);
  const out = await G.applyEvent(pool, WS, { id: 'only-gifts', type: 'gift', count: 5, value: 50 });
  assert.equal(out.applied, true);
  assert.equal(out.updatedGoals, 1, 'något annat än gifts-målet uppdaterades');
  assert.equal((await G.readGoal(pool, OVERLAY, 'w-gifts')).progress, 5);
  const rows = await pool.query(
    "SELECT count(*)::int c FROM goal_runtime WHERE metric='diamonds' AND overlay_id=$1", [OVERLAY]);
  assert.equal(rows.rows[0].c, 0, 'ett diamonds-mål skapades av en uppdatering');
});

db('workspace med endast diamonds-mål får diamonds', async () => {
  await goalsOnly([['w-diamonds', 'diamonds']]);
  const out = await G.applyEvent(pool, WS, { id: 'only-diamonds', type: 'gift', count: 5, value: 50 });
  assert.equal(out.applied, true);
  assert.equal(out.updatedGoals, 1);
  assert.equal((await G.readGoal(pool, OVERLAY, 'w-diamonds')).progress, 50, 'diamonds använde count');
});

db('workspace med båda målen får båda', async () => {
  await goalsOnly([['w-gifts', 'gifts'], ['w-diamonds', 'diamonds']]);
  await G.applyEvent(pool, WS, { id: 'both-1', type: 'gift', count: 3, value: 30 });
  assert.equal((await G.readGoal(pool, OVERLAY, 'w-gifts')).progress, 3);
  assert.equal((await G.readGoal(pool, OVERLAY, 'w-diamonds')).progress, 30);
});

db('like-event i ett follows-only workspace skapar ingen apply-rad', async () => {
  await goalsOnly([['w-follows', 'follows']]);
  const before = await pool.query('SELECT count(*)::int c FROM goal_event_apply WHERE workspace_id=$1', [WS]);
  const out = await G.applyEvent(pool, WS, { id: 'like-nomatch', type: 'like', count: 9, value: 2700 });
  assert.equal(out.applied, false);
  const after = await pool.query('SELECT count(*)::int c FROM goal_event_apply WHERE workspace_id=$1', [WS]);
  assert.equal(after.rows[0].c, before.rows[0].c, 'en idempotensrad skrevs utan matchande mål');
});

db('krasch efter claim men före båda uppdateringarna rullar tillbaka allt', async () => {
  await goalsOnly([['w-gifts', 'gifts'], ['w-diamonds', 'diamonds']]);
  const before = [await G.readGoal(pool, OVERLAY, 'w-gifts'), await G.readGoal(pool, OVERLAY, 'w-diamonds')];
  await assert.rejects(
    () => G.applyEvent(pool, WS, { id: 'crash-1', type: 'gift', count: 4, value: 40 },
      { failAfterClaim: true }));
  const claimed = await pool.query(
    'SELECT 1 FROM goal_event_apply WHERE workspace_id=$1 AND event_id=$2', [WS, 'crash-1']);
  assert.equal(claimed.rowCount, 0, 'claimet blev kvar — eventet är permanent förlorat');
  assert.equal((await G.readGoal(pool, OVERLAY, 'w-gifts')).progress, before[0].progress);
  assert.equal((await G.readGoal(pool, OVERLAY, 'w-diamonds')).progress, before[1].progress);
  // And it can still be applied for real.
  const retry = await G.applyEvent(pool, WS, { id: 'crash-1', type: 'gift', count: 4, value: 40 });
  assert.equal(retry.applied, true);
  assert.equal(retry.updatedGoals, 2);
});

db('reset som konkurrerar med ett gift-event serialiseras för båda måltyperna', async () => {
  await goalsOnly([['w-gifts', 'gifts'], ['w-diamonds', 'diamonds']]);
  const startGifts = await G.readGoal(pool, OVERLAY, 'w-gifts');
  const [event] = await Promise.all([
    G.applyEvent(pool, WS, { id: 'gift-reset-race', type: 'gift', count: 6, value: 60 }),
    G.resetGoal(pool, OVERLAY, 'w-gifts')
  ]);
  const gifts = await G.readGoal(pool, OVERLAY, 'w-gifts');
  assert.equal(gifts.epoch, startGifts.epoch + 1, 'reset gick förlorad eller kördes två gånger');
  assert.equal(event.applied, true, 'eventet tappades');

  const giftsRow = event.rows.find(r => r.widget_id === 'w-gifts');
  if (giftsRow && Number(giftsRow.epoch) === startGifts.epoch) {
    assert.equal(gifts.progress, 0, 'eventet landade före reset men progress nollades inte');
  } else {
    assert.equal(gifts.progress, 6, 'reset gick först men ökningen syns inte i den nya epoken');
  }
  // The diamonds goal was not reset, so it must carry the increment regardless of the order.
  assert.equal((await G.readGoal(pool, OVERLAY, 'w-diamonds')).progress, 60,
    'diamonds tappade sin ökning för att gifts-målet nollades');
});

// Reset vs event, stated as an outcome table rather than a range. applyEvent() reports the epoch its
// increment landed in, which is what makes the order observable after the fact:
//
//   event före reset   → increment landed in the old epoch → reset cleared it → progress 0
//   reset före event   → increment landed in the new epoch → progress = eventbeloppet
//
// Anything else — a lost increment, a double application, or an increment credited to an epoch that
// no longer exists — is a defect.
db('reset och event samtidigt: utfallet följer ordningen exakt', async () => {
  await goalsOnly([['w-race', 'follows']]);
  const start = await G.readGoal(pool, OVERLAY, 'w-race');
  const [event] = await Promise.all([
    G.applyEvent(pool, WS, { id: 'reset-race', type: 'follow' }),
    G.resetGoal(pool, OVERLAY, 'w-race')
  ]);
  const after = await G.readGoal(pool, OVERLAY, 'w-race');

  assert.equal(after.epoch, start.epoch + 1, 'reset gick förlorad eller kördes två gånger');
  assert.equal(event.applied, true, 'eventet tappades helt');

  if (event.epoch === start.epoch) {
    assert.equal(after.progress, 0,
      'eventet landade före reset men progress nollades inte');
  } else {
    assert.equal(event.epoch, after.epoch, 'eventet krediterades en epoch som inte finns');
    assert.equal(after.progress, 1,
      'reset gick före eventet men ökningen syns inte i den nya epoken');
  }

  // The id is spent in both orders, so a redelivery cannot double-count across the reset.
  const again = await G.applyEvent(pool, WS, { id: 'reset-race', type: 'follow' });
  assert.equal(again.applied, false, 'ID:t kunde återanvändas efter en reset');
  assert.equal((await G.readGoal(pool, OVERLAY, 'w-race')).progress, after.progress,
    'omleveransen ändrade progress');
});

db('resetGoal returnerar tal, inte strängar', async () => {
  // pg hands back bigint as a string. readGoal converted; resetGoal did not, so the same row had
  // different types depending on which function returned it and progress === 0 failed against '0'.
  await goalsOnly([['w-types', 'follows']]);
  const row = await G.resetGoal(pool, OVERLAY, 'w-types');
  for (const field of ['epoch', 'baseline', 'progress', 'target']) {
    assert.equal(typeof row[field], 'number',
      `resetGoal returnerade ${field} som ${typeof row[field]}: ${JSON.stringify(row[field])}`);
  }
  assert.equal(row.progress, 0);
});

db('städningen är batchad och rör inte rader som ännu kan behöva replay', async () => {
  // Needs a follows goal of its own, or the event below is never claimed and the row it asserts on
  // is one that was never written — which reads as "the sweep took it".
  await goalsOnly([['w-sweep-keep', 'follows']]);
  const kept = await G.sweepApplied(pool, { olderThan: '48 hours', limit: 5000 });
  assert.ok(typeof kept.deleted === 'number');
  const fresh = await pool.query(
    "SELECT count(*)::int c FROM goal_event_apply WHERE applied_at > now() - interval '48 hours'", []);
  assert.ok(fresh.rows[0].c >= 0);
  // A row inside the replay window must survive the sweep.
  await G.applyEvent(pool, WS, { id: 'sweep-keep', type: 'follow' });
  await G.sweepApplied(pool, { olderThan: '48 hours', limit: 5000 });
  const still = await pool.query(
    'SELECT 1 FROM goal_event_apply WHERE workspace_id=$1 AND event_id=$2', [WS, 'sweep-keep']);
  assert.equal(still.rowCount, 1, 'städningen tog en rad som fortfarande behövs för replay');
});

// ---- revision -------------------------------------------------------------------------------------
// Ordningsfältet klienten litar på. Kravet är inte "ändras ibland" utan: varje skrivning som ändrar
// vad en frame bär höjer det, i SAMMA transaktion, och det går aldrig bakåt för en given rad. Går
// det bakåt en enda gång skriver en gammal frame över en nyare på skärmen.
const revisionOf = async widgetId => {
  const q = await pool.query(
    'SELECT revision FROM goal_runtime WHERE overlay_id=$1 AND widget_id=$2', [OVERLAY, widgetId]);
  return BigInt(q.rows[0].revision);
};

db('ett applicerat event höjer revision', async () => {
  await goalsOnly([['w-rev', 'follows']]);
  const before = await revisionOf('w-rev');
  const out = await G.applyEvent(pool, WS, { id: 'rev-1', type: 'follow' });
  assert.equal(out.applied, true);
  assert.ok(await revisionOf('w-rev') > before, 'progress ändrades utan att revision höjdes');
});

db('den returnerade raden bär revisionen som skrevs, inte den innan', async () => {
  // Frames byggs ur RETURNING-raden. Läser den en äldre revision än den som committades pekar
  // klientens ordning på fel version av samma tal.
  await goalsOnly([['w-ret', 'follows']]);
  const out = await G.applyEvent(pool, WS, { id: 'rev-ret', type: 'follow' });
  const row = out.rows.find(r => r.widget_id === 'w-ret');
  assert.ok(row, 'raden följde inte med ut ur applyEvent');
  assert.ok('revision' in row, 'RETURNING saknar revision — framen kan inte ordnas');
  assert.equal(BigInt(row.revision), await revisionOf('w-ret'));
});

db('en dublett höjer inte revision', async () => {
  await goalsOnly([['w-dup', 'follows']]);
  await G.applyEvent(pool, WS, { id: 'rev-dup', type: 'follow' });
  const after = await revisionOf('w-dup');
  const again = await G.applyEvent(pool, WS, { id: 'rev-dup', type: 'follow' });
  assert.equal(again.applied, false);
  assert.equal(await revisionOf('w-dup'), after, 'en dublett rörde revision');
});

db('patch och reset höjer revision', async () => {
  await goalsOnly([['w-pr', 'follows']]);
  const start = await revisionOf('w-pr');
  await G.patchGoal(pool, OVERLAY, 'w-pr', { baseline: 50 });
  const afterPatch = await revisionOf('w-pr');
  assert.ok(afterPatch > start, 'PATCH ändrade baseline utan att höja revision');
  await G.resetGoalWidget(pool, OVERLAY, 'w-pr');
  assert.ok(await revisionOf('w-pr') > afterPatch, 'reset höjde inte revision');
  await G.resetGoal(pool, OVERLAY, 'w-pr');
  assert.ok(await revisionOf('w-pr') > afterPatch + 1n, 'resetGoal höjde inte revision');
});

db('en synk som inte ändrar något rör inte revision', async () => {
  // syncGoalsFromState och backfillen är ON CONFLICT DO NOTHING. En layout som sparas om utan att
  // målet ändras får inte se ut som en ny version för klienten.
  await goalsOnly([['w-sync', 'follows']]);
  await G.applyEvent(pool, WS, { id: 'rev-sync', type: 'follow' });
  const before = await revisionOf('w-sync');
  await G.listGoals(pool, OVERLAY);            // kör syncGoalsFromState + backfill
  assert.equal(await revisionOf('w-sync'), before, 'en ren läsning höjde revision');
});

db('femtio samtidiga event ger femtio strikt växande revisioner', async () => {
  await goalsOnly([['w-mono', 'follows']]);
  const start = await revisionOf('w-mono');
  const N = 50;
  const out = await Promise.all(Array.from({ length: N }, (_, i) =>
    G.applyEvent(pool, WS, { id: `rev-mono-${i}`, type: 'follow' })));
  const seen = out.filter(r => r.applied).map(r =>
    BigInt(r.rows.find(x => x.widget_id === 'w-mono').revision));
  assert.equal(seen.length, N, 'alla event applicerades inte');
  assert.equal(new Set(seen.map(String)).size, N,
    'två samtidiga skrivningar fick samma revision — ordningen mellan dem är inte avgörbar');
  assert.equal(await revisionOf('w-mono'), start + BigInt(N));
});

test.after(async () => { if (pool) await pool.end() });
