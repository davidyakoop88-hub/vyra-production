'use strict';
// The same transaction, but reached the way a browser reaches it: over a socket, through
// PUT /api/workspaces/:workspaceId/overlays/:overlayId, with a real session cookie and a real CSRF
// header, against a real Postgres.
//
// overlay-put-sync.test.js proves the transaction. This file proves the ROUTE uses it — that is a
// separate claim, and the only one that says anything about what a streamer gets. A route that
// still ran its own UPDATE would leave every assertion in that file true and every goal dead.
//
// So the checks here are about wiring, not about SQL:
//   - a 200 from the route means the goal counts, with no GET in between,
//   - the four outcomes still map onto the HTTP contract the Studio client already handles
//     (200 / 400 / 404 / 409+emptyBlocked / 409 conflict), unchanged by the rewiring,
//   - auth, membership and CSRF stay OUTSIDE the transaction: a rejected request writes nothing.
//
// BLOCKED without TEST_DATABASE_URL, for the same reason as the sync test: a fake transaction
// proves nothing about transactions, and a fake route proves nothing about the route.
const test = require('node:test'), assert = require('node:assert/strict');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. PUT-rutten är oprövad tills TEST_DATABASE_URL pekar på '
    + 'en engångsdatabas.';
const http = (name, fn) => test(`http: ${name}`, { timeout: 30000, skip: BLOCKED }, fn);

// server/db.js reads DATABASE_URL when it is required, and server/index.js requires it at module
// load — so which database the route talks to is decided here, before the first require below.
if (!BLOCKED) process.env.DATABASE_URL = DB_URL;

let server = null, eventBus = null, pool = null, G = null, base = '';
const OWNER = 'dddddddd-0000-0000-0000-000000000001';
const VIEWER = 'dddddddd-0000-0000-0000-000000000002';
const WS = 'dddddddd-1111-0000-0000-000000000000';
const OVERLAY = 'dddddddd-2222-0000-0000-000000000000';
const MISSING_OVERLAY = 'dddddddd-9999-0000-0000-000000000000';
const auth = { owner: null, viewer: null };

const goalWidget = (id, over = {}) => ({
  id, type: 'templateSocialGoal', goalKind: 'follows', goalCurrent: 0, goalTarget: 1000, ...over });
const stateWith = (...widgets) => ({ widgets });

// A session row is all the route needs; going through /api/auth/login would drag password hashing,
// MFA and the notification outbox into a test about overlay saves.
async function makeSession(S, userId) {
  const raw = S.token(), csrf = S.token();
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, csrf_hash, expires_at, mfa_verified_at)
     VALUES ($1,$2,$3,now() + interval '1 hour', now())`,
    [userId, S.digest(raw), S.digest(csrf)]);
  return { cookie: `vyra_session=${raw}`, csrf };
}

test.before(async () => {
  if (BLOCKED) return;
  const S = require('../security');
  G = require('../goal-runtime');
  ({ pool } = require('../db'));
  ({ server, eventBus } = require('../index'));

  await pool.query(
    `INSERT INTO users (id,email,password_hash,display_name) VALUES ($1,$2,'x','put-http'),($3,$4,'x','put-http-viewer')
     ON CONFLICT (id) DO NOTHING`,
    [OWNER, `${OWNER}@test.invalid`, VIEWER, `${VIEWER}@test.invalid`]);
  await pool.query(`INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,'put-http',$2)
     ON CONFLICT (id) DO NOTHING`, [WS, OWNER]);
  await pool.query(
    `INSERT INTO workspace_members (workspace_id,user_id,role) VALUES ($1,$2,'owner'),($1,$3,'viewer')
     ON CONFLICT (workspace_id,user_id) DO UPDATE SET role = EXCLUDED.role`, [WS, OWNER, VIEWER]);
  auth.owner = await makeSession(S, OWNER);
  auth.viewer = await makeSession(S, VIEWER);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (BLOCKED) return;
  // fetch keeps its sockets alive, so close() alone would wait for them and the step would hang
  // instead of finishing.
  await new Promise(resolve => {
    server.close(resolve);
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  });
  await eventBus.close().catch(() => {});
  await pool.query('DELETE FROM sessions WHERE user_id = ANY($1::uuid[])', [[OWNER, VIEWER]]);
  await pool.end();
});

// The request under test. `as` picks whose session is used; passing csrf:null sends none at all.
async function put(payload, { as = 'owner', overlayId = OVERLAY, csrf } = {}) {
  const who = auth[as];
  const token = csrf === undefined ? who.csrf : csrf;
  const res = await fetch(`${base}/api/workspaces/${WS}/overlays/${overlayId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: who.cookie,
      ...(token ? { 'x-vyra-csrf': token } : {}) },
    body: JSON.stringify(payload)
  });
  return { status: res.status, body: await res.json() };
}

async function reset(state = stateWith()) {
  await pool.query('DELETE FROM goal_runtime WHERE overlay_id = $1', [OVERLAY]);
  await pool.query('DELETE FROM goal_event_apply WHERE workspace_id = $1', [WS]);
  await pool.query(
    `INSERT INTO overlays (id,workspace_id,name,state,version) VALUES ($1,$2,'put-http',$3,1)
     ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, version = 1`,
    [OVERLAY, WS, JSON.stringify(state)]);
}
const overlayRow = async () => (await pool.query(
  'SELECT state, version FROM overlays WHERE id = $1', [OVERLAY])).rows[0];
const runtimeIds = async () => (await pool.query(
  'SELECT widget_id FROM goal_runtime WHERE overlay_id=$1 ORDER BY widget_id', [OVERLAY]))
  .rows.map(r => r.widget_id);

http('ett 200 från rutten betyder att målet räknar — inget GET emellan', async () => {
  await reset();
  const saved = await put({ version: 1, state: stateWith(goalWidget('w-http')) });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.ok, true);
  // The response body the Studio client already parses: an overlay row with the new version.
  assert.equal(saved.body.overlay.version, 2, 'svaret bar inte den uppräknade versionen');
  assert.deepEqual(saved.body.overlay.state.widgets.map(w => w.id), ['w-http']);

  const applied = await G.applyEvent(pool, WS, { id: 'http-after-put-1', type: 'follow' });
  assert.equal(applied.applied, true, 'eventet claimades inte — rutten skapade ingen målrad');
  assert.equal((await G.readGoal(pool, OVERLAY, 'w-http')).progress, 1,
    'målet räknade inte direkt efter ett 200 från rutten');
});

http('en inaktuell version ger 409 och rör inga runtime-rader', async () => {
  await reset();
  await put({ version: 1, state: stateWith(goalWidget('w-a')) });
  const before = await overlayRow();
  const beforeIds = await runtimeIds();

  const stale = await put({ version: 1, state: stateWith(goalWidget('w-a'), goalWidget('w-b')) });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, 'Overlayn har ändrats i en annan session');
  assert.equal(stale.body.emptyBlocked, undefined, 'en versionskonflikt flaggades som wipe-guard');
  assert.equal((await overlayRow()).version, before.version);
  assert.deepEqual(await runtimeIds(), beforeIds, 'en konflikt rörde runtime-raderna');
});

http('wipe-guarden svarar 409 med emptyBlocked och lämnar allt orört', async () => {
  await reset();
  await put({ version: 1, state: stateWith(goalWidget('w-a'), goalWidget('w-b')) });
  const before = await overlayRow();
  const beforeIds = await runtimeIds();
  assert.equal(beforeIds.length, 2);

  const wiped = await put({ version: before.version, state: { widgets: [] } });
  assert.equal(wiped.status, 409);
  assert.equal(wiped.body.emptyBlocked, true, 'klienten får ingen konfliktdialog utan flaggan');
  assert.equal((await overlayRow()).version, before.version);
  assert.deepEqual(await runtimeIds(), beforeIds, 'wipe-guarden hann ta runtime-rader');

  // And the deliberate deletion still gets through, with the goals removed in the same save.
  const allowed = await put({ version: before.version, state: { widgets: [] }, allowEmptyWidgets: true });
  assert.equal(allowed.status, 200);
  assert.deepEqual(await runtimeIds(), [], 'en avsiktlig radering lämnade kvar målrader');
});

http('okänd overlay ger 404, inte 500', async () => {
  const missing = await put({ version: 1, state: stateWith(goalWidget('w-a')) },
    { overlayId: MISSING_OVERLAY });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, 'Overlay saknas');
});

http('en borttagen målwidget försvinner i samma save som state', async () => {
  await reset();
  await put({ version: 1, state: stateWith(goalWidget('w-a'), goalWidget('w-gone')) });
  assert.deepEqual(await runtimeIds(), ['w-a', 'w-gone']);

  const v = (await overlayRow()).version;
  const out = await put({ version: v, state: stateWith(goalWidget('w-a')) });
  assert.equal(out.status, 200);
  assert.deepEqual(await runtimeIds(), ['w-a'], 'runtime-raden för en borttagen widget blev kvar');
  assert.deepEqual((await overlayRow()).state.widgets.map(w => w.id), ['w-a'],
    'state och runtime hamnade ur fas');
});

http('ett senare save med gammalt goalCurrent skriver inte över serverns siffror', async () => {
  await reset();
  await put({ version: 1, state: stateWith(goalWidget('w-own', { goalCurrent: 658 })) });
  await pool.query(
    `UPDATE goal_runtime SET baseline=100, progress=42, target=250, epoch=7
      WHERE overlay_id=$1 AND widget_id='w-own'`, [OVERLAY]);
  const owned = await G.readGoal(pool, OVERLAY, 'w-own');

  const v = (await overlayRow()).version;
  const out = await put({ version: v,
    state: stateWith(goalWidget('w-own', { goalCurrent: 658, goalTarget: 1000 })) });
  assert.equal(out.status, 200);

  const after = await G.readGoal(pool, OVERLAY, 'w-own');
  assert.equal(after.baseline, owned.baseline, 'rutten skrev över baseline');
  assert.equal(after.progress, owned.progress, 'rutten skrev över progress');
  assert.equal(after.target, owned.target, 'rutten skrev över target');
  assert.equal(after.epoch, owned.epoch, 'rutten skrev över epoch');
});

http('en ogiltig body ger 400 innan något skrivs', async () => {
  await reset(stateWith(goalWidget('w-a')));
  await put({ version: 1, state: stateWith(goalWidget('w-a')) });
  const before = await overlayRow();
  const beforeIds = await runtimeIds();

  for (const bad of [{ version: 'två', state: stateWith(goalWidget('w-bad')) },
                     { version: before.version, state: { widgets: 'nope' } },
                     { version: before.version }]) {
    const out = await put(bad);
    assert.equal(out.status, 400, `${JSON.stringify(bad)} gav ${out.status}`);
  }
  assert.equal((await overlayRow()).version, before.version);
  assert.deepEqual(await runtimeIds(), beforeIds, 'en 400 hann skriva runtime-rader');
});

// Auth, CSRF and membership are deliberately outside the transaction. If any of them had been pulled
// inside it, a rejected request would still have opened one — and these two would show it by leaving
// a runtime row behind.
http('utan CSRF-huvud: 401 och ingenting skrivet', async () => {
  await reset();
  const out = await put({ version: 1, state: stateWith(goalWidget('w-nocsrf')) }, { csrf: null });
  assert.equal(out.status, 401);
  assert.deepEqual(await runtimeIds(), []);
  assert.equal((await overlayRow()).version, 1);
});

http('en viewer får 403 och skapar inga målrader', async () => {
  await reset();
  const out = await put({ version: 1, state: stateWith(goalWidget('w-viewer')) }, { as: 'viewer' });
  assert.equal(out.status, 403);
  assert.deepEqual(await runtimeIds(), []);
  assert.equal((await overlayRow()).version, 1);
});

http('två samtidiga PUT på samma version: exakt ett 200 och ett 409', async () => {
  await reset(stateWith(goalWidget('w-a')));
  const v = (await overlayRow()).version;
  const [one, two] = await Promise.all([
    put({ version: v, state: stateWith(goalWidget('w-a'), goalWidget('w-x')) }),
    put({ version: v, state: stateWith(goalWidget('w-a'), goalWidget('w-y')) })
  ]);
  const won = [one, two].filter(r => r.status === 200);
  const lost = [one, two].filter(r => r.status === 409);
  assert.equal(won.length, 1, `${won.length} PUT committade på samma version`);
  assert.equal(lost.length, 1, 'förloraren fick inte 409');
  assert.equal((await overlayRow()).version, v + 1, 'versionen räknades upp mer än ett steg');
  assert.equal((await runtimeIds()).length, 2, 'vinnarens mål hamnade inte i runtime');
});
