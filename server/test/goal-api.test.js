'use strict';
// The four goal routes, over real sockets, against a real Postgres:
//
//   GET   /api/overlay-access/:token/goals                        — the OBS link, read-only
//   GET   /api/workspaces/:ws/overlays/:overlayId/goals           — owner/admin/editor/viewer
//   PATCH /api/workspaces/:ws/overlays/:overlayId/goals/:widgetId — owner/admin/editor
//   POST  .../goals/:widgetId/reset                               — owner/admin/editor
//
// Two things are being proved here, and they are not the same thing:
//
//   1. The contract: statuses, roles, validation limits, ordering, number types.
//   2. That an overlay is a boundary. Two overlays in ONE workspace, whose owner is allowed to read
//      and write both, must still not be able to reach one through the other's id — the routes take
//      an overlayId AND a widgetId from the URL, and either one used as the only key would let A's
//      link edit B's goal. The public GET has no id from the client at all; it uses the token's.
//
// BLOCKED without TEST_DATABASE_URL: lazy backfill, 404-without-row-creation and reset are claims
// about rows, and a fake would agree with whatever the code did.
const test = require('node:test'), assert = require('node:assert/strict');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Mål-API:t är oprövat tills TEST_DATABASE_URL pekar på en '
    + 'engångsdatabas.';
const api = (name, fn) => test(`api: ${name}`, { timeout: 30000, skip: BLOCKED }, fn);
if (!BLOCKED) process.env.DATABASE_URL = DB_URL;

let server = null, eventBus = null, pool = null, S = null, G = null, base = '';
const OWNER = 'bbbbbbbb-0000-0000-0000-000000000001';
const VIEWER = 'bbbbbbbb-0000-0000-0000-000000000002';
const OUTSIDER = 'bbbbbbbb-0000-0000-0000-000000000003';
const WS1 = 'bbbbbbbb-1111-0000-0000-000000000001';
const WS2 = 'bbbbbbbb-1111-0000-0000-000000000002';
const A = 'bbbbbbbb-2222-0000-0000-00000000000a';
const B = 'bbbbbbbb-2222-0000-0000-00000000000b';
const C = 'bbbbbbbb-2222-0000-0000-00000000000c';
const NO_SUCH_OVERLAY = 'bbbbbbbb-9999-0000-0000-000000000000';
const auth = {}, link = {};

// 1e12: far past any real follower or diamond count, and four orders of magnitude below 2^53 so
// baseline + progress stays an exact JavaScript number for the widget that has to render it.
const MAX = 1_000_000_000_000;

const social = (id, over = {}) => ({ id, type: 'templateSocialGoal', goalKind: 'follows',
  goalCurrent: 0, goalTarget: 1000, ...over });
const heart = (id, over = {}) => ({ id, type: 'templateHeartGoal', heartCurrent: 0,
  heartTarget: 50, ...over });
const plain = id => ({ id, type: 'templateTopGift' });

const STATE = {
  [A]: { widgets: [social('w-a2', { goalCurrent: 10 }), plain('w-gift'), social('w-a1'), heart('w-a3')] },
  [B]: { widgets: [social('w-b1', { goalTarget: 500 })] },
  [C]: { widgets: [social('w-c1')] }
};

async function makeSession(userId) {
  const raw = S.token(), csrf = S.token();
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, csrf_hash, expires_at, mfa_verified_at)
     VALUES ($1,$2,$3,now() + interval '1 hour', now())`,
    [userId, S.digest(raw), S.digest(csrf)]);
  return { cookie: `vyra_session=${raw}`, csrf };
}

async function makeLink(overlayId, { revoked = false } = {}) {
  const raw = S.token(32);
  await pool.query(
    `INSERT INTO overlay_access_tokens (overlay_id, token_hash, label, created_by, revoked_at)
     VALUES ($1,$2,'test',$3,$4)`, [overlayId, S.digest(raw), OWNER, revoked ? new Date() : null]);
  return raw;
}

test.before(async () => {
  if (BLOCKED) return;
  S = require('../security');
  G = require('../goal-runtime');
  ({ pool } = require('../db'));
  ({ server, eventBus } = require('../index'));

  await pool.query(
    `INSERT INTO users (id,email,password_hash,display_name,email_verified_at) VALUES
       ($1,$2,'x','api-owner',now()),($3,$4,'x','api-viewer',now()),($5,$6,'x','api-out',now())
     ON CONFLICT (id) DO UPDATE SET email_verified_at = now()`,
    [OWNER, `${OWNER}@test.invalid`, VIEWER, `${VIEWER}@test.invalid`, OUTSIDER, `${OUTSIDER}@test.invalid`]);
  await pool.query(
    `INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,'api-1',$3),($2,'api-2',$4)
     ON CONFLICT (id) DO NOTHING`, [WS1, WS2, OWNER, OUTSIDER]);
  await pool.query(
    `INSERT INTO workspace_members (workspace_id,user_id,role) VALUES
       ($1,$3,'owner'),($1,$4,'viewer'),($2,$5,'owner')
     ON CONFLICT (workspace_id,user_id) DO UPDATE SET role = EXCLUDED.role`,
    [WS1, WS2, OWNER, VIEWER, OUTSIDER]);
  for (const [id, ws] of [[A, WS1], [B, WS1], [C, WS2]]) {
    await pool.query(
      `INSERT INTO overlays (id,workspace_id,name,state) VALUES ($1,$2,'api','{"widgets":[]}'::jsonb)
       ON CONFLICT (id) DO NOTHING`, [id, ws]);
  }
  await pool.query('DELETE FROM overlay_access_tokens WHERE overlay_id = ANY($1::uuid[])', [[A, B, C]]);
  auth.owner = await makeSession(OWNER);
  auth.viewer = await makeSession(VIEWER);
  auth.outsider = await makeSession(OUTSIDER);
  link.a = await makeLink(A);
  link.b = await makeLink(B);
  link.revoked = await makeLink(A, { revoked: true });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (BLOCKED) return;
  await new Promise(resolve => {
    server.close(resolve);
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  });
  await eventBus.close().catch(() => {});
  await pool.query('DELETE FROM overlay_access_tokens WHERE overlay_id = ANY($1::uuid[])', [[A, B, C]]);
  await pool.query('DELETE FROM sessions WHERE user_id = ANY($1::uuid[])', [[OWNER, VIEWER, OUTSIDER]]);
  await pool.end();
});

// Every overlay back to its declared state with no runtime rows at all — which is also the legacy
// case the lazy backfill exists for.
async function reset() {
  for (const [id, state] of Object.entries(STATE)) {
    await pool.query('UPDATE overlays SET state = $2, version = 1 WHERE id = $1',
      [id, JSON.stringify(state)]);
  }
  await pool.query('DELETE FROM goal_runtime WHERE overlay_id = ANY($1::uuid[])', [[A, B, C]]);
}

async function call(method, path, { as = null, body = null, csrf, headers = {} } = {}) {
  const who = as ? auth[as] : null;
  const token = who ? (csrf === undefined ? who.csrf : csrf) : null;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}),
      ...(who ? { cookie: who.cookie } : {}), ...(token ? { 'x-vyra-csrf': token } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text) } catch { /* not json */ }
  return { status: res.status, body: parsed, text, headers: res.headers };
}

const memberPath = (ws, overlayId) => `/api/workspaces/${ws}/overlays/${overlayId}/goals`;
const rows = async overlayId => (await pool.query(
  'SELECT widget_id, baseline, progress, target, epoch FROM goal_runtime WHERE overlay_id=$1 ORDER BY widget_id',
  [overlayId])).rows;
const rowFor = async (overlayId, widgetId) => (await pool.query(
  'SELECT * FROM goal_runtime WHERE overlay_id=$1 AND widget_id=$2', [overlayId, widgetId])).rows[0];
const ids = list => list.map(g => g.widgetId);

// ---- the OBS link ---------------------------------------------------------------------------------
api('publik GET listar tokenens egna overlay-mål, utan cache', async () => {
  await reset();
  const out = await call('GET', `/api/overlay-access/${link.a}/goals`);
  assert.equal(out.status, 200, out.text);
  assert.equal(out.body.ok, true);
  assert.deepEqual(ids(out.body.goals), ['w-a1', 'w-a2', 'w-a3']);
  // A goal number is live data behind a public link; a cached copy would be a stale scoreboard.
  assert.equal(out.headers.get('cache-control'), 'no-store');
});

api('inget id från klienten styr den publika GET:en', async () => {
  await reset();
  // Query, body and header all naming overlay B — the token points at A, and that is the only key.
  const out = await call('GET',
    `/api/overlay-access/${link.a}/goals?overlayId=${B}&overlay_id=${B}&widgetId=w-b1`,
    { headers: { 'x-overlay-id': B } });
  assert.equal(out.status, 200);
  assert.deepEqual(ids(out.body.goals), ['w-a1', 'w-a2', 'w-a3']);
  assert.ok(!out.text.includes('w-b1'), 'B:s widget nåddes via A:s länk');
  assert.ok(!out.text.includes(B), 'B:s overlay-id kom ut genom A:s länk');
});

api('en ogiltig eller återkallad token får 401, inte 404 eller data', async () => {
  await reset();
  for (const token of [link.revoked, 'x'.repeat(48), 'kort']) {
    const out = await call('GET', `/api/overlay-access/${token}/goals`);
    assert.equal(out.status, 401, `${token.slice(0, 6)}… gav ${out.status}`);
    assert.equal(out.body.ok, false);
  }
});

api('overlay-token får bara läsa: allt annat är 405', async () => {
  await reset();
  await call('GET', `/api/overlay-access/${link.a}/goals`);   // raderna finns nu
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    const out = await call(method, `/api/overlay-access/${link.a}/goals`, { body: { baseline: 5 } });
    assert.equal(out.status, 405, `${method} gav ${out.status}`);
  }
  // And nothing was written by any of them.
  assert.deepEqual((await rows(A)).map(r => Number(r.baseline)), [0, 10, 0]);
});

api('en overlay-token kan inte nå ett annat overlays mål ens som skrivning', async () => {
  await reset();
  await call('GET', memberPath(WS1, B), { as: 'owner' });          // ge B runtime-rader
  const before = await rowFor(B, 'w-b1');
  const out = await call('PATCH', `/api/overlay-access/${link.a}/goals/w-b1`, { body: { baseline: 99 } });
  // A token cannot write at all, so the method is refused before any id is even looked at.
  assert.equal(out.status, 405, `fick ${out.status}`);
  const after = await rowFor(B, 'w-b1');
  assert.equal(Number(after.baseline), Number(before.baseline), 'B:s mål ändrades via A:s länk');
});

// ---- roles ----------------------------------------------------------------------------------------
api('utloggad får 401 på alla fyra rutterna', async () => {
  await reset();
  const calls = [['GET', memberPath(WS1, A)], ['PATCH', `${memberPath(WS1, A)}/w-a1`],
                 ['POST', `${memberPath(WS1, A)}/w-a1/reset`]];
  for (const [method, path] of calls) {
    const out = await call(method, path, { body: method === 'PATCH' ? { baseline: 1 } : null });
    assert.equal(out.status, 401, `${method} ${path} gav ${out.status}`);
  }
  assert.deepEqual(await rows(A), [], 'en utloggad begäran skapade runtime-rader');
});

api('viewer får läsa men inte skriva', async () => {
  await reset();
  const list = await call('GET', memberPath(WS1, A), { as: 'viewer' });
  assert.equal(list.status, 200, list.text);
  assert.deepEqual(ids(list.body.goals), ['w-a1', 'w-a2', 'w-a3']);

  const patch = await call('PATCH', `${memberPath(WS1, A)}/w-a1`, { as: 'viewer', body: { target: 7 } });
  assert.equal(patch.status, 403);
  const reset403 = await call('POST', `${memberPath(WS1, A)}/w-a1/reset`, { as: 'viewer' });
  assert.equal(reset403.status, 403);
  assert.equal(Number((await rowFor(A, 'w-a1')).target), 1000, 'en viewer ändrade ett mål');
});

api('owner får både läsa och skriva', async () => {
  await reset();
  assert.equal((await call('GET', memberPath(WS1, A), { as: 'owner' })).status, 200);
  assert.equal((await call('PATCH', `${memberPath(WS1, A)}/w-a1`,
    { as: 'owner', body: { target: 7 } })).status, 200);
  assert.equal((await call('POST', `${memberPath(WS1, A)}/w-a1/reset`, { as: 'owner' })).status, 200);
});

api('en medlem i ett annat workspace får 403, inte 404', async () => {
  await reset();
  const out = await call('GET', memberPath(WS1, A), { as: 'outsider' });
  assert.equal(out.status, 403);
  assert.ok(!out.text.includes('w-a1'), 'mål läckte till någon utan medlemskap');
});

api('rätt workspace men fel overlay: 404 utan att avslöja något', async () => {
  await reset();
  // C exists — in the OTHER workspace. Through WS1 it must be indistinguishable from nonexistent.
  const foreign = await call('GET', memberPath(WS1, C), { as: 'owner' });
  const missing = await call('GET', memberPath(WS1, NO_SUCH_OVERLAY), { as: 'owner' });
  assert.equal(foreign.status, 404);
  assert.equal(missing.status, 404);
  assert.equal(foreign.body.error, missing.body.error, 'svaren skiljer på finns-men-annanstans och finns-inte');
  assert.deepEqual(await rows(C), [], 'ett främmande workspace fick runtime-rader skapade');
});

api('CSRF krävs fortfarande för PATCH och reset', async () => {
  await reset();
  await call('GET', memberPath(WS1, A), { as: 'owner' });
  const patch = await call('PATCH', `${memberPath(WS1, A)}/w-a1`,
    { as: 'owner', body: { target: 5 }, csrf: null });
  assert.equal(patch.status, 401);
  assert.equal(Number((await rowFor(A, 'w-a1')).target), 1000);
});

// ---- lazy backfill --------------------------------------------------------------------------------
api('en GET på en gammal overlay skapar raderna och listar dem i samma svar', async () => {
  await reset();
  assert.deepEqual(await rows(A), [], 'utgångsläget var inte tomt');

  const first = await call('GET', memberPath(WS1, A), { as: 'owner' });
  assert.equal(first.status, 200, first.text);
  // Same response, not "empty now, filled on the next call": the sync and the listing are one
  // transaction, so what was created is what is returned.
  assert.deepEqual(ids(first.body.goals), ['w-a1', 'w-a2', 'w-a3']);
  assert.deepEqual((await rows(A)).map(r => r.widget_id), ['w-a1', 'w-a2', 'w-a3']);

  // Start values come from the saved state, per widget type: a Heart Goal's default target is 50.
  const byId = Object.fromEntries(first.body.goals.map(g => [g.widgetId, g]));
  assert.equal(byId['w-a2'].baseline, 10);
  assert.equal(byId['w-a1'].target, 1000);
  assert.equal(byId['w-a3'].target, 50);
  assert.equal(byId['w-a3'].metric, 'likes');
  assert.equal(byId['w-a1'].metric, 'follows');

  // A non-goal widget never becomes a row, whatever id it carries.
  assert.ok(!ids(first.body.goals).includes('w-gift'));
});

api('en andra GET skapar inga dubbletter och rör inte serverns siffror', async () => {
  await reset();
  await call('GET', memberPath(WS1, A), { as: 'owner' });
  await pool.query(
    `UPDATE goal_runtime SET baseline=100, progress=42, target=250, epoch=7
      WHERE overlay_id=$1 AND widget_id='w-a1'`, [A]);

  const second = await call('GET', memberPath(WS1, A), { as: 'owner' });
  assert.deepEqual(ids(second.body.goals), ['w-a1', 'w-a2', 'w-a3']);
  const w1 = second.body.goals.find(g => g.widgetId === 'w-a1');
  assert.equal(w1.baseline, 100);
  assert.equal(w1.progress, 42);
  assert.equal(w1.value, 142, 'value är inte baseline + progress');
  assert.equal(w1.target, 250);
  assert.equal(w1.epoch, 7);
});

api('ett mål som tagits bort ur state försvinner ur både listan och tabellen', async () => {
  await reset();
  await call('GET', memberPath(WS1, A), { as: 'owner' });
  await pool.query('UPDATE overlays SET state = $2 WHERE id = $1',
    [A, JSON.stringify({ widgets: [social('w-a1')] })]);

  const out = await call('GET', memberPath(WS1, A), { as: 'owner' });
  assert.deepEqual(ids(out.body.goals), ['w-a1']);
  assert.deepEqual((await rows(A)).map(r => r.widget_id), ['w-a1']);
});

api('listan har samma ordning varje gång', async () => {
  await reset();
  await pool.query('UPDATE overlays SET state = $2 WHERE id = $1',
    [A, JSON.stringify({ widgets: [social('w-c'), social('w-a'), social('w-b')] })]);
  const one = await call('GET', memberPath(WS1, A), { as: 'owner' });
  const two = await call('GET', memberPath(WS1, A), { as: 'owner' });
  const three = await call('GET', `/api/overlay-access/${link.a}/goals`);
  assert.deepEqual(ids(one.body.goals), ['w-a', 'w-b', 'w-c']);
  assert.deepEqual(ids(two.body.goals), ids(one.body.goals));
  assert.deepEqual(ids(three.body.goals), ids(one.body.goals), 'länken och medlemsvyn sorterar olika');
});

api('varje tal i svaret är ett JavaScript-tal, inte en bigint-sträng', async () => {
  await reset();
  await call('GET', memberPath(WS1, A), { as: 'owner' });
  // bigint columns come back from pg as strings unless something converts them.
  await pool.query(
    `UPDATE goal_runtime SET baseline=9007199254, progress=1, target=900719925474
      WHERE overlay_id=$1 AND widget_id='w-a1'`, [A]);
  const out = await call('GET', memberPath(WS1, A), { as: 'owner' });
  const goal = out.body.goals.find(g => g.widgetId === 'w-a1');
  for (const field of ['baseline', 'progress', 'value', 'target', 'epoch', 'at']) {
    assert.equal(typeof goal[field], 'number', `${field} är ${typeof goal[field]}`);
  }
  assert.equal(goal.value, 9007199255);
  // revision är undantaget, och det är avsiktligt: den är den enda bigint som får växa förbi 2^53,
  // och som Number skulle två skilda revisioner runda till samma tal.
  assert.equal(typeof goal.revision, 'string', `revision är ${typeof goal.revision}`);
  assert.match(goal.revision, /^\d+$/);
});

api('revision överlever ett värde som inte får plats i en double', async () => {
  await reset();
  await call('GET', memberPath(WS1, A), { as: 'owner' });
  await pool.query(
    `UPDATE goal_runtime SET revision=9007199254740993
      WHERE overlay_id=$1 AND widget_id='w-a1'`, [A]);
  const out = await call('GET', memberPath(WS1, A), { as: 'owner' });
  const goal = out.body.goals.find(g => g.widgetId === 'w-a1');
  assert.equal(goal.revision, '9007199254740993',
    'revision gick genom Number och tappade sista siffran');
  assert.match(out.text, /"revision":"9007199254740993"/,
    'revision serialiserades som JSON-tal i svarskroppen');
});

api('varje mål i listan bär en revision', async () => {
  await reset();
  const out = await call('GET', memberPath(WS1, A), { as: 'owner' });
  assert.ok(out.body.goals.length, 'listan var tom — testet bevisar inget');
  for (const goal of out.body.goals) {
    assert.match(String(goal.revision), /^\d+$/, `${goal.widgetId} saknar revision`);
  }
});

// ---- PATCH ----------------------------------------------------------------------------------------
api('PATCH sätter baseline och target, och rör inget annat', async () => {
  await reset();
  await call('GET', memberPath(WS1, A), { as: 'owner' });
  await pool.query(`UPDATE goal_runtime SET progress=13, epoch=4 WHERE overlay_id=$1 AND widget_id='w-a1'`, [A]);

  const out = await call('PATCH', `${memberPath(WS1, A)}/w-a1`,
    { as: 'owner', body: { baseline: 250, target: 3000 } });
  assert.equal(out.status, 200, out.text);
  assert.equal(out.body.goal.baseline, 250);
  assert.equal(out.body.goal.target, 3000);
  assert.equal(out.body.goal.progress, 13, 'PATCH rörde progress');
  assert.equal(out.body.goal.epoch, 4, 'PATCH rörde epoch');
  assert.equal(out.body.goal.value, 263);
});

api('ett fält i taget lämnar det andra ifred', async () => {
  await reset();
  await call('GET', memberPath(WS1, A), { as: 'owner' });
  await call('PATCH', `${memberPath(WS1, A)}/w-a1`, { as: 'owner', body: { baseline: 5, target: 10 } });

  const onlyTarget = await call('PATCH', `${memberPath(WS1, A)}/w-a1`, { as: 'owner', body: { target: 99 } });
  assert.equal(onlyTarget.body.goal.baseline, 5);
  assert.equal(onlyTarget.body.goal.target, 99);
  const onlyBaseline = await call('PATCH', `${memberPath(WS1, A)}/w-a1`, { as: 'owner', body: { baseline: 6 } });
  assert.equal(onlyBaseline.body.goal.baseline, 6);
  assert.equal(onlyBaseline.body.goal.target, 99);
});

api('PATCH avvisar allt utom baseline och target', async () => {
  await reset();
  await call('GET', memberPath(WS1, A), { as: 'owner' });
  const before = await rowFor(A, 'w-a1');

  const bad = [
    {}, { progress: 5 }, { epoch: 2 }, { metric: 'likes' }, { value: 5 }, { overlayId: B },
    { baseline: 5, progress: 0 }, { baseline: -1 }, { baseline: 1.5 }, { baseline: '5' },
    { baseline: null }, { baseline: true }, { baseline: [5] }, { target: 0 }, { target: -3 },
    { target: 2.5 }, { target: 1e999 }, { baseline: 1e999 }, { target: 1e20 }, { baseline: 1e20 },
    { target: MAX + 1 }, { baseline: MAX + 1 }, { baseline: Number.MAX_SAFE_INTEGER }
  ];
  for (const body of bad) {
    const out = await call('PATCH', `${memberPath(WS1, A)}/w-a1`, { as: 'owner', body });
    assert.equal(out.status, 400, `${JSON.stringify(body)} gav ${out.status}`);
  }
  const after = await rowFor(A, 'w-a1');
  assert.equal(Number(after.baseline), Number(before.baseline), 'en avvisad patch skrev ändå');
  assert.equal(Number(after.target), Number(before.target));
});

api('gränserna själva accepteras', async () => {
  await reset();
  await call('GET', memberPath(WS1, A), { as: 'owner' });
  const edges = await call('PATCH', `${memberPath(WS1, A)}/w-a1`,
    { as: 'owner', body: { baseline: 0, target: MAX } });
  assert.equal(edges.status, 200, edges.text);
  assert.equal(edges.body.goal.target, MAX);
  const one = await call('PATCH', `${memberPath(WS1, A)}/w-a1`, { as: 'owner', body: { target: 1 } });
  assert.equal(one.status, 200);
  assert.equal(one.body.goal.target, 1);
});

// ---- reset ----------------------------------------------------------------------------------------
api('reset nollar progress, höjer epoch och lämnar baseline och target', async () => {
  await reset();
  await call('GET', memberPath(WS1, A), { as: 'owner' });
  await call('PATCH', `${memberPath(WS1, A)}/w-a1`, { as: 'owner', body: { baseline: 40, target: 900 } });
  await pool.query(`UPDATE goal_runtime SET progress=77 WHERE overlay_id=$1 AND widget_id='w-a1'`, [A]);
  const before = await rowFor(A, 'w-a1');

  const out = await call('POST', `${memberPath(WS1, A)}/w-a1/reset`, { as: 'owner' });
  assert.equal(out.status, 200, out.text);
  assert.equal(out.body.goal.progress, 0);
  assert.equal(out.body.goal.epoch, Number(before.epoch) + 1);
  assert.equal(out.body.goal.baseline, 40, 'reset kastade startvärdet');
  assert.equal(out.body.goal.target, 900, 'reset rörde målet');
  assert.equal(out.body.goal.value, 40);
  for (const field of ['baseline', 'progress', 'value', 'target', 'epoch']) {
    assert.equal(typeof out.body.goal[field], 'number');
  }
  assert.ok(BigInt(out.body.goal.revision) > BigInt(before.revision),
    'reset ändrade progress och epoch utan att höja revision — klienten ser ingen ny version');
});

// ---- unknown widgets ------------------------------------------------------------------------------
api('okänt eller borttaget widget-id ger 404 och skapar ingen rad', async () => {
  await reset();
  await call('GET', memberPath(WS1, A), { as: 'owner' });
  const before = (await rows(A)).map(r => r.widget_id);

  await pool.query('UPDATE overlays SET state = $2 WHERE id = $1',
    [A, JSON.stringify({ widgets: [social('w-a1'), social('w-a2'), heart('w-a3')] })]);
  for (const widgetId of ['w-finns-inte', 'w-gift', 'w-b1', '../w-a1', 'w-a1 ']) {
    const patch = await call('PATCH', `${memberPath(WS1, A)}/${encodeURIComponent(widgetId)}`,
      { as: 'owner', body: { target: 5 } });
    const reset404 = await call('POST',
      `${memberPath(WS1, A)}/${encodeURIComponent(widgetId)}/reset`, { as: 'owner' });
    assert.equal(patch.status, 404, `PATCH ${widgetId} gav ${patch.status}`);
    assert.equal(reset404.status, 404, `reset ${widgetId} gav ${reset404.status}`);
  }
  assert.deepEqual((await rows(A)).map(r => r.widget_id), before,
    'en 404 skapade eller tog bort en runtime-rad');
});

api('en widget som slutat vara målwidget kan inte längre patchas', async () => {
  await reset();
  await call('GET', memberPath(WS1, A), { as: 'owner' });
  // The widget is still in the layout, but no longer a goal type.
  await pool.query('UPDATE overlays SET state = $2 WHERE id = $1',
    [A, JSON.stringify({ widgets: [plain('w-a1'), social('w-a2')] })]);
  const out = await call('PATCH', `${memberPath(WS1, A)}/w-a1`, { as: 'owner', body: { target: 5 } });
  assert.equal(out.status, 404);
});

// ---- overlay is a boundary ------------------------------------------------------------------------
api('två overlays i samma workspace når aldrig varandras mål', async () => {
  await reset();
  // Same owner, both overlays, every id legitimate on its own — only the combinations are wrong.
  await call('GET', memberPath(WS1, A), { as: 'owner' });
  await call('GET', memberPath(WS1, B), { as: 'owner' });
  await call('PATCH', `${memberPath(WS1, B)}/w-b1`, { as: 'owner', body: { baseline: 64, target: 640 } });
  await pool.query(`UPDATE goal_runtime SET progress=5 WHERE overlay_id=$1 AND widget_id='w-b1'`, [B]);
  const bBefore = await rowFor(B, 'w-b1');

  // Read: A's list can never contain B's widget, through either route.
  const listA = await call('GET', memberPath(WS1, A), { as: 'owner' });
  assert.ok(!listA.text.includes('w-b1'), 'B:s mål fanns i A:s lista');
  const linkA = await call('GET', `/api/overlay-access/${link.a}/goals`);
  assert.ok(!linkA.text.includes('w-b1'), 'B:s mål fanns i A:s länksvar');

  // Write: B's widget id through A's overlay id, and A's widget id through B's.
  const crossPatch = await call('PATCH', `${memberPath(WS1, A)}/w-b1`, { as: 'owner', body: { baseline: 1 } });
  const crossReset = await call('POST', `${memberPath(WS1, A)}/w-b1/reset`, { as: 'owner' });
  const otherWay = await call('PATCH', `${memberPath(WS1, B)}/w-a1`, { as: 'owner', body: { baseline: 1 } });
  assert.equal(crossPatch.status, 404);
  assert.equal(crossReset.status, 404);
  assert.equal(otherWay.status, 404);

  const bAfter = await rowFor(B, 'w-b1');
  assert.equal(Number(bAfter.baseline), Number(bBefore.baseline), 'B:s baseline ändrades via A');
  assert.equal(Number(bAfter.progress), Number(bBefore.progress), 'B:s progress nollades via A');
  assert.equal(Number(bAfter.epoch), Number(bBefore.epoch), 'B:s epoch höjdes via A');
  assert.deepEqual((await rows(A)).map(r => r.widget_id), ['w-a1', 'w-a2', 'w-a3'],
    'A fick en rad för B:s widget');
});

api('ett overlay-id från ett annat workspace kan inte lånas in', async () => {
  await reset();
  await call('GET', memberPath(WS2, C), { as: 'outsider' });
  const before = await rows(C);
  // The owner of WS1 is a legitimate member — of WS1. C is not theirs, whichever path is tried.
  assert.equal((await call('GET', memberPath(WS1, C), { as: 'owner' })).status, 404);
  assert.equal((await call('PATCH', `${memberPath(WS1, C)}/w-c1`,
    { as: 'owner', body: { baseline: 1 } })).status, 404);
  assert.equal((await call('POST', `${memberPath(WS2, C)}/w-c1/reset`, { as: 'owner' })).status, 403);
  assert.deepEqual(await rows(C), before, 'C:s mål ändrades utifrån');
});

api('okänd metod på målrutten är 405', async () => {
  await reset();
  for (const [method, path] of [['DELETE', memberPath(WS1, A)], ['PUT', memberPath(WS1, A)],
                                ['DELETE', `${memberPath(WS1, A)}/w-a1`],
                                ['GET', `${memberPath(WS1, A)}/w-a1/reset`]]) {
    const out = await call(method, path, { as: 'owner', body: method === 'PUT' ? {} : null });
    assert.equal(out.status, 405, `${method} ${path} gav ${out.status}`);
  }
});
