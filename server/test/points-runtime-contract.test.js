'use strict';
// The contract the points engine must satisfy before it is wired into anything live.
//
// Same split as goal-runtime-contract.test.js, deliberately:
//
//   Pure  — earn-rate math and the level curve. Runs anywhere, no Postgres required, RED right now
//           because server/points-runtime.js does not exist yet.
//   DB    — idempotency and workspace isolation. These need a REAL Postgres, for the same reason
//           goal-runtime-contract.test.js needs one: a mocked transaction proves nothing about
//           whether ON CONFLICT actually stops a duplicate.
//
// Point TEST_DATABASE_URL at a THROWAWAY database. Never the shared staging one.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL
  ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Sätt TEST_DATABASE_URL till en engångsdatabas — '
    + 'aldrig den delade stagingdatabasen. Idempotensen och workspace-isoleringen är oprövade tills dess.';

// The implementation this file is written against. Absent today, which is why the pure tests are red.
let P = null;
try { P = require(path.join(__dirname, '..', 'points-runtime.js')) } catch (_) { /* red below */ }

// ---- del 1: earn-rate-matten och nivakurvan, kors overallt ----------------------------------------

test('claim-satsen foljer exakt goal_event_apply-monstret', { timeout: 5000 }, () => {
  assert.ok(P, 'server/points-runtime.js finns inte');
  assert.match(P.CLAIM_SQL, /INSERT INTO points_event_apply/);
  assert.match(P.CLAIM_SQL, /ON CONFLICT \(workspace_id, event_id\) DO NOTHING/);
  assert.match(P.CLAIM_SQL, /RETURNING 1/);
});

test('gift ger poang fran value (redan totalen), inte value gånger count igen', { timeout: 5000 }, () => {
  assert.ok(P, 'server/points-runtime.js finns inte');
  const settings = { ...P.DEFAULT_SETTINGS, perCoin: 1 };
  assert.equal(P.pointsAmount({ type: 'gift', count: 8, value: 80 }, settings), 80);
});

test('medvardsgavor ger inga poang, samma regel som goal-runtime.js', { timeout: 5000 }, () => {
  assert.ok(P, 'server/points-runtime.js finns inte');
  assert.equal(P.pointsAmount({ type: 'gift', value: 80, tillVarden: false }, P.DEFAULT_SETTINGS), 0);
});

test('like anvander count och perLike', { timeout: 5000 }, () => {
  assert.ok(P, 'server/points-runtime.js finns inte');
  const settings = { ...P.DEFAULT_SETTINGS, perLike: 0.2 };
  assert.equal(P.pointsAmount({ type: 'like', count: 5 }, settings), 1);
});

test('follow och share ger platta belopp fran installningarna', { timeout: 5000 }, () => {
  assert.ok(P, 'server/points-runtime.js finns inte');
  const settings = { ...P.DEFAULT_SETTINGS, perFollow: 100, perShare: 3 };
  assert.equal(P.pointsAmount({ type: 'follow' }, settings), 100);
  assert.equal(P.pointsAmount({ type: 'share' }, settings), 3);
});

test('comment ger 0 poang som standard', { timeout: 5000 }, () => {
  assert.ok(P, 'server/points-runtime.js finns inte');
  assert.equal(P.pointsAmount({ type: 'comment' }, P.DEFAULT_SETTINGS), 0);
});

test('prenumerant-bonusen multiplicerar hela beloppet', { timeout: 5000 }, () => {
  assert.ok(P, 'server/points-runtime.js finns inte');
  const settings = { ...P.DEFAULT_SETTINGS, perShare: 10, subscriberBonus: 1.5 };
  assert.equal(P.pointsAmount({ type: 'share', isSubscriber: true }, settings), 15);
  assert.equal(P.pointsAmount({ type: 'share', isSubscriber: false }, settings), 10);
});

test('okand eventtyp ger 0 poang i stallet for att kasta', { timeout: 5000 }, () => {
  assert.ok(P, 'server/points-runtime.js finns inte');
  assert.equal(P.pointsAmount({ type: 'battle' }, P.DEFAULT_SETTINGS), 0);
});

// Nivakurvan är samma formel som action-runtime.js:s computeLevel: bas=50, multiplikator=1.03 ger
// trösklarna 0, 51, 104, 158, 214, 271 enligt bakgrundens TikFinity-referens — provat mot precis de
// talen, inte mot ett godtyckligt exempel.
test('nivatrosklar racknas ratt for kanda summor', { timeout: 5000 }, () => {
  assert.ok(P, 'server/points-runtime.js finns inte');
  const settings = { ...P.DEFAULT_SETTINGS, levelBasePoints: 50, levelMultiplier: 1.03 };
  assert.equal(P.computeLevel(0, settings).level, 0);
  assert.equal(P.computeLevel(50, settings).level, 1);
  assert.equal(P.computeLevel(50, settings).pointsForNextLevel, 52);
  assert.equal(P.computeLevel(101, settings).level, 1, '51 in ska inte racka for niva 2 an');
  assert.equal(P.computeLevel(102, settings).level, 2);
  assert.equal(P.computeLevel(102, settings).pointsIntoLevel, 0);
});

test('nivakurvan matchar VyraPoints egna standardvarden (bas 100, x1.2)', { timeout: 5000 }, () => {
  assert.ok(P, 'server/points-runtime.js finns inte');
  assert.equal(P.DEFAULT_SETTINGS.levelBasePoints, 100);
  assert.equal(P.DEFAULT_SETTINGS.levelMultiplier, 1.2);
  assert.equal(P.computeLevel(0).level, 0);
  assert.equal(P.computeLevel(99).level, 0);
  assert.equal(P.computeLevel(100).level, 1);
  assert.equal(P.computeLevel(100).pointsForNextLevel, 120);
});

test('okand installningsnyckel avvisas i stallet for att tyst ignoreras', { timeout: 5000 }, () => {
  assert.ok(P, 'server/points-runtime.js finns inte');
  const pool = { query: async () => { throw new Error('fick aldrig na SQL') } };
  return assert.rejects(() => P.upsertSettings(pool, 'ws', { perBanana: 5 }), /Okända/);
});

// ---- del 2: databaskontraktet ----------------------------------------------------------------------
const db = (name, fn) => test(`db: ${name}`, { timeout: 20000, skip: BLOCKED }, fn);

let pool = null;
const WS_A = '44444444-4444-4444-4444-444444444444';
const WS_B = '55555555-5555-5555-5555-555555555555';

test.before(async () => {
  if (BLOCKED) return;
  const { Pool } = require(path.join(__dirname, '..', 'node_modules', 'pg'));
  pool = new Pool({ connectionString: DB_URL, max: 8 });
  await pool.query(require('fs').readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
  await seedWorkspace(WS_A);
  await seedWorkspace(WS_B);
  await pool.query('DELETE FROM points_event_apply WHERE workspace_id IN ($1,$2)', [WS_A, WS_B]);
  await pool.query('DELETE FROM points_ledger WHERE workspace_id IN ($1,$2)', [WS_A, WS_B]);
  await pool.query('DELETE FROM points_settings WHERE workspace_id IN ($1,$2)', [WS_A, WS_B]);
});

async function seedWorkspace(id) {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name) VALUES ($1,$2,'x','contract')
     ON CONFLICT (id) DO NOTHING`, [id, `${id}@test.invalid`]);
  await pool.query(
    `INSERT INTO workspaces (id, name, owner_user_id) VALUES ($1,'test',$2)
     ON CONFLICT (id) DO NOTHING`, [id, id]);
}

test('databaskontraktet körs mot riktig Postgres, aldrig mot en mock', { timeout: 5000 }, () => {
  const source = require('fs').readFileSync(__filename, 'utf8');
  const banned = ['si' + 'non', 'proxy' + 'quire', 'jest' + '.mock', 'createMock' + 'Pool'];
  assert.ok(!banned.some(word => source.includes(word)), 'en mock har smugit sig in i kontraktet');
  if (BLOCKED) console.log('\n  ⚠ ' + BLOCKED + '\n');
});

db('en gava ger poang och en niva tillbaka', async () => {
  const out = await P.applyEvent(pool, WS_A, { id: 'g1', type: 'gift', userId: 'v1', count: 1, value: 60 });
  assert.equal(out.applied, true);
  assert.equal(out.awarded, 60);
  assert.equal(out.points, 60);
  assert.equal(out.earned, 60);
  assert.equal(out.level.level, 0);
});

db('samma event-ID ger poang exakt en gang', async () => {
  const before = await P.readLedger(pool, WS_A, 'dup-viewer');
  const first = await P.applyEvent(pool, WS_A, { id: 'dup-1', type: 'follow', userId: 'dup-viewer' });
  const second = await P.applyEvent(pool, WS_A, { id: 'dup-1', type: 'follow', userId: 'dup-viewer' });
  assert.equal(first.applied, true);
  assert.equal(second.applied, false, 'dubbletten gav poang igen');
  const after = await P.readLedger(pool, WS_A, 'dup-viewer');
  assert.equal(after.points, before.points + P.DEFAULT_SETTINGS.perFollow);
});

db('event-ID och poangokning ligger i samma transaktion', async () => {
  const before = await P.readLedger(pool, WS_A, 'tx-viewer');
  await assert.rejects(() => P.applyEvent(pool, WS_A,
    { id: 'tx-1', type: 'follow', userId: 'tx-viewer' }, { failAfterClaim: true }));
  const claimed = await pool.query(
    'SELECT 1 FROM points_event_apply WHERE workspace_id=$1 AND event_id=$2', [WS_A, 'tx-1']);
  assert.equal(claimed.rowCount, 0, 'event-ID:t blev kvar trots att poangokningen misslyckades');
  const stillBefore = await P.readLedger(pool, WS_A, 'tx-viewer');
  assert.equal(stillBefore.points, before.points);
  const retry = await P.applyEvent(pool, WS_A, { id: 'tx-1', type: 'follow', userId: 'tx-viewer' });
  assert.equal(retry.applied, true, 'eventet kunde inte appliceras efter en rullad transaktion');
});

db('tva arbetsytors poang lacker aldrig in i varandra', async () => {
  // Samma tittarnamn, samma event-ID, tva olika workspaces — bada maste raknas, oberoende av
  // varandra, precis som goal-runtime.js:s "workspace_id kaskaderar"-provfamilj kraver for mal.
  const eventId = 'cross-ws-1';
  const viewerId = 'shared-viewer';
  const a = await P.applyEvent(pool, WS_A, { id: eventId, type: 'share', userId: viewerId });
  const b = await P.applyEvent(pool, WS_B, { id: eventId, type: 'share', userId: viewerId });
  assert.equal(a.applied, true, 'workspace A avvisade eventet');
  assert.equal(b.applied, true, 'workspace B avvisade eventet trots att det ar ett annat workspace');

  const ledgerA = await P.readLedger(pool, WS_A, viewerId);
  const ledgerB = await P.readLedger(pool, WS_B, viewerId);
  assert.equal(ledgerA.points, P.DEFAULT_SETTINGS.perShare);
  assert.equal(ledgerB.points, P.DEFAULT_SETTINGS.perShare);

  // En dublett i workspace A far inte paverka workspace B:s rad.
  const dup = await P.applyEvent(pool, WS_A, { id: eventId, type: 'share', userId: viewerId });
  assert.equal(dup.applied, false);
  assert.equal((await P.readLedger(pool, WS_B, viewerId)).points, P.DEFAULT_SETTINGS.perShare,
    'en dublett i ett annat workspace paverkade den har radens saldo');
});

db('workspace-installningar ar oberoende av varandra', async () => {
  await P.upsertSettings(pool, WS_A, { perShare: 500 });
  const settingsA = await P.getSettings(pool, WS_A);
  const settingsB = await P.getSettings(pool, WS_B);
  assert.equal(settingsA.perShare, 500);
  assert.equal(settingsB.perShare, P.DEFAULT_SETTINGS.perShare, 'workspace B fick workspace A:s installning');
});

db('workspace_id kaskaderar: raderat workspace lamnar inga foraldralosa rader', async () => {
  const orphanWs = '66666666-6666-6666-6666-666666666666';
  await seedWorkspace(orphanWs);
  await P.applyEvent(pool, orphanWs, { id: 'orphan-1', type: 'follow', userId: 'orphan-viewer' });
  await pool.query('DELETE FROM workspaces WHERE id=$1', [orphanWs]);
  const apply = await pool.query('SELECT count(*)::int c FROM points_event_apply WHERE workspace_id=$1', [orphanWs]);
  const ledger = await pool.query('SELECT count(*)::int c FROM points_ledger WHERE workspace_id=$1', [orphanWs]);
  assert.equal(apply.rows[0].c, 0, 'idempotensrader blev kvar efter att workspacet raderats');
  assert.equal(ledger.rows[0].c, 0, 'ledgerrader blev kvar efter att workspacet raderats');
});

db('femtio samtidiga event fran samma tittare tappar ingen okning', async () => {
  const viewerId = 'race-viewer';
  const N = 50;
  const results = await Promise.all(Array.from({ length: N }, (_, i) =>
    P.applyEvent(pool, WS_A, { id: `race-${i}`, type: 'follow', userId: viewerId })));
  assert.equal(results.filter(r => r.applied).length, N);
  const ledger = await P.readLedger(pool, WS_A, viewerId);
  assert.equal(ledger.points, N * P.DEFAULT_SETTINGS.perFollow,
    'samtidiga event skrev over varandra — okningen ar inte radlast');
});

test.after(async () => { if (pool) await pool.end() });
