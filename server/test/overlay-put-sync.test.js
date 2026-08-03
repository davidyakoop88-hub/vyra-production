'use strict';
// Overlay-PUT and syncGoalsFromState() share one transaction, so a successful Layout save means the
// goal is live immediately. Anything less and a streamer who saves a new goal and starts counting
// loses the events between the save and whenever a GET happened to repair the row — the widget looks
// present and simply does not count.
//
// That is also why sync cannot be a second request: a failure there has to take the overlay state and
// its version back with it, or the two disagree about what exists.
//
// BLOCKED without TEST_DATABASE_URL — every claim here is about transaction boundaries, and a fake
// transaction proves nothing about transactions.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const G = require(path.join(__dirname, '..', 'goal-runtime.js'));
const M = require(path.join(__dirname, '..', 'goal-metrics.js'));

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Transaktionsgränsen mellan overlay-PUT och sync är oprövad '
    + 'tills TEST_DATABASE_URL pekar på en engångsdatabas.';
const db = (name, fn) => test(`db: ${name}`, { timeout: 30000, skip: BLOCKED }, fn);

let pool = null;
const WS = 'eeeeeeee-0000-0000-0000-000000000000';
const OVERLAY = 'eeeeeeee-1111-0000-0000-000000000000';

const goalWidget = (id, over = {}) => ({
  id, type: 'templateSocialGoal', goalKind: 'follows', goalCurrent: 0, goalTarget: 1000, ...over });
const stateWith = (...widgets) => ({ widgets });

test.before(async () => {
  if (BLOCKED) return;
  const { Pool } = require(path.join(__dirname, '..', 'node_modules', 'pg'));
  pool = new Pool({ connectionString: DB_URL, max: 8 });
  await pool.query(
    `INSERT INTO users (id,email,password_hash,display_name) VALUES ($1,$2,'x','put')
     ON CONFLICT (id) DO NOTHING`, [WS, `${WS}@test.invalid`]);
  await pool.query(`INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,'put',$1)
     ON CONFLICT (id) DO NOTHING`, [WS]);
});

// Puts the overlay back to a known state and clears its runtime rows.
async function reset(state = stateWith()) {
  await pool.query('DELETE FROM goal_runtime WHERE overlay_id = $1', [OVERLAY]);
  await pool.query(
    `INSERT INTO overlays (id,workspace_id,name,state,version) VALUES ($1,$2,'put',$3,1)
     ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, version = 1`,
    [OVERLAY, WS, JSON.stringify(state)]);
}
const overlayRow = async () => (await pool.query(
  'SELECT state, version FROM overlays WHERE id = $1', [OVERLAY])).rows[0];
const runtimeIds = async () => (await pool.query(
  'SELECT widget_id FROM goal_runtime WHERE overlay_id=$1 ORDER BY widget_id', [OVERLAY]))
  .rows.map(r => r.widget_id);

// The function under test does not exist yet — these are red by construction.
const putWithSync = (...args) => {
  assert.ok(typeof G.putOverlayWithGoals === 'function',
    'server/goal-runtime.js exporterar ingen putOverlayWithGoals — transaktionen är inte skriven');
  return G.putOverlayWithGoals(...args);
};

db('ett event direkt efter lyckad PUT räknas', async () => {
  await reset();
  const out = await putWithSync(pool, { overlayId: OVERLAY, workspaceId: WS,
    state: stateWith(goalWidget('w-new')), expectedVersion: 1 });
  assert.equal(out.ok, true);
  // No GET in between: the save alone must have made the goal live.
  const applied = await G.applyEvent(pool, WS, { id: 'after-put-1', type: 'follow' });
  assert.equal(applied.applied, true, 'eventet claimades inte — inget mål matchade');
  assert.equal((await G.readGoal(pool, OVERLAY, 'w-new')).progress, 1,
    'målet var inte aktivt direkt efter ett lyckat Layout-save');
});

db('syncfel lämnar både overlay-state, version och runtime oförändrade', async () => {
  await reset(stateWith(goalWidget('w-keep')));
  await putWithSync(pool, { overlayId: OVERLAY, workspaceId: WS,
    state: stateWith(goalWidget('w-keep')), expectedVersion: 1 });
  const before = await overlayRow();
  const beforeIds = await runtimeIds();

  await assert.rejects(() => putWithSync(pool, { overlayId: OVERLAY, workspaceId: WS,
    state: stateWith(goalWidget('w-keep'), goalWidget('w-added')),
    expectedVersion: before.version, failSync: true }));

  const after = await overlayRow();
  assert.equal(after.version, before.version, 'versionen räknades upp trots att sync föll');
  assert.deepEqual(after.state, before.state, 'overlay-state ändrades trots att sync föll');
  assert.deepEqual(await runtimeIds(), beforeIds, 'runtime-rader ändrades trots att sync föll');
});

db('versionskonflikt skapar eller tar bort inga runtime-rader', async () => {
  await reset(stateWith(goalWidget('w-a')));
  await putWithSync(pool, { overlayId: OVERLAY, workspaceId: WS,
    state: stateWith(goalWidget('w-a')), expectedVersion: 1 });
  const before = await overlayRow();
  const beforeIds = await runtimeIds();

  // Someone else already saved; this PUT is working from a stale version.
  const stale = await putWithSync(pool, { overlayId: OVERLAY, workspaceId: WS,
    state: stateWith(goalWidget('w-a'), goalWidget('w-b')), expectedVersion: 1 });
  assert.equal(stale.conflict, true, 'en inaktuell version accepterades');
  assert.equal((await overlayRow()).version, before.version);
  assert.deepEqual(await runtimeIds(), beforeIds, 'en konflikt rörde runtime-raderna');
});

db('wipe-guard 409 ändrar ingenting', async () => {
  await reset(stateWith(goalWidget('w-a'), goalWidget('w-b')));
  await putWithSync(pool, { overlayId: OVERLAY, workspaceId: WS,
    state: stateWith(goalWidget('w-a'), goalWidget('w-b')), expectedVersion: 1 });
  const before = await overlayRow();
  const beforeIds = await runtimeIds();
  assert.equal(beforeIds.length, 2);

  const wiped = await putWithSync(pool, { overlayId: OVERLAY, workspaceId: WS,
    state: { widgets: [] }, expectedVersion: before.version });
  assert.equal(wiped.emptyBlocked, true, 'en tom layout gick igenom utan allowEmptyWidgets');
  assert.equal((await overlayRow()).version, before.version);
  assert.deepEqual(await runtimeIds(), beforeIds, 'wipe-guarden hann ta runtime-rader');
});

db('befintlig runtime baseline/progress/target/epoch skrivs aldrig över', async () => {
  await reset(stateWith(goalWidget('w-own', { goalCurrent: 658, goalTarget: 1000 })));
  await putWithSync(pool, { overlayId: OVERLAY, workspaceId: WS,
    state: stateWith(goalWidget('w-own', { goalCurrent: 658 })), expectedVersion: 1 });
  // The server takes over: PATCH and reset are authoritative after the row exists.
  await pool.query(
    `UPDATE goal_runtime SET baseline=100, progress=42, target=250, epoch=7
      WHERE overlay_id=$1 AND widget_id='w-own'`, [OVERLAY]);
  const owned = await G.readGoal(pool, OVERLAY, 'w-own');

  // A later save still carrying the old goalCurrent must not undo any of it.
  const v = (await overlayRow()).version;
  await putWithSync(pool, { overlayId: OVERLAY, workspaceId: WS,
    state: stateWith(goalWidget('w-own', { goalCurrent: 658, goalTarget: 1000 })), expectedVersion: v });

  const after = await G.readGoal(pool, OVERLAY, 'w-own');
  assert.equal(after.baseline, owned.baseline, 'sync skrev över baseline');
  assert.equal(after.progress, owned.progress, 'sync skrev över progress');
  assert.equal(after.target, owned.target, 'sync skrev över target');
  assert.equal(after.epoch, owned.epoch, 'sync skrev över epoch');
});

db('borttagen målwidget försvinner atomärt med overlay-state', async () => {
  await reset(stateWith(goalWidget('w-a'), goalWidget('w-gone')));
  await putWithSync(pool, { overlayId: OVERLAY, workspaceId: WS,
    state: stateWith(goalWidget('w-a'), goalWidget('w-gone')), expectedVersion: 1 });
  assert.deepEqual(await runtimeIds(), ['w-a', 'w-gone']);

  const v = (await overlayRow()).version;
  await putWithSync(pool, { overlayId: OVERLAY, workspaceId: WS,
    state: stateWith(goalWidget('w-a')), expectedVersion: v, allowEmptyWidgets: false });

  assert.deepEqual(await runtimeIds(), ['w-a'], 'runtime-raden för en borttagen widget blev kvar');
  const saved = (await overlayRow()).state.widgets.map(w => w.id);
  assert.deepEqual(saved, ['w-a'], 'state och runtime hamnade ur fas');
  // And the removed goal stops counting.
  await G.applyEvent(pool, WS, { id: 'after-remove-1', type: 'follow' });
  assert.equal(await G.readGoal(pool, OVERLAY, 'w-gone'), null);
});

db('sync skapar bara saknade rader och rör inga andra overlays', async () => {
  await reset(stateWith(goalWidget('w-a')));
  await putWithSync(pool, { overlayId: OVERLAY, workspaceId: WS,
    state: stateWith(goalWidget('w-a')), expectedVersion: 1 });
  const v = (await overlayRow()).version;
  await putWithSync(pool, { overlayId: OVERLAY, workspaceId: WS,
    state: stateWith(goalWidget('w-a'), goalWidget('w-b')), expectedVersion: v });
  assert.deepEqual(await runtimeIds(), ['w-a', 'w-b']);
  // Non-goal widgets never become runtime rows, whatever id they carry.
  const v2 = (await overlayRow()).version;
  await putWithSync(pool, { overlayId: OVERLAY, workspaceId: WS,
    state: stateWith(goalWidget('w-a'), goalWidget('w-b'), { id: 'w-gift', type: 'templateTopGift' }),
    expectedVersion: v2 });
  assert.deepEqual(await runtimeIds(), ['w-a', 'w-b'], 'en icke-målwidget fick en runtime-rad');
});

test.after(async () => { if (pool) await pool.end() });
