'use strict';
// Studio's own goal stream, and the two rules around it.
//
//   GET /api/workspaces/:ws/overlays/:overlayId/events/stream
//
// The workspace-level stream still gets raw events and no frames, because a frame belongs to one
// overlay and a workspace-level connection cannot say which. This route names the overlay, proves
// the caller is a member, and confirms the id really is in that workspace before it opens anything
// — and then reuses the same filter an OBS link goes through. There is no second frame format and
// no second normalisation anywhere; goal-sse.js is what writes, in both cases.
//
// The other rule is about the test event: it is for looking at. If it counted, someone trying out
// widget designs would run their real follower goal up with fake events and have no way to tell
// which part of the number was real.
//
// BLOCKED without both TEST_DATABASE_URL and a reachable Redis.
const test = require('node:test'), assert = require('node:assert/strict');
const net = require('node:net');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

function redisReachable(url) {
  return new Promise(resolve => {
    let host = '127.0.0.1', port = 6379;
    try { const u = new URL(url); host = u.hostname; port = Number(u.port) || 6379 } catch {}
    const socket = net.createConnection({ host, port });
    const done = ok => { socket.destroy(); resolve(ok) };
    socket.setTimeout(1000);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

if (DB_URL) process.env.DATABASE_URL = DB_URL;

let reason = null, probed = false;
async function blocked() {
  if (probed) return reason;
  probed = true;
  if (!DB_URL) reason = 'BLOCKERAT: ingen isolerad Postgres. Sätt TEST_DATABASE_URL.';
  else if (!await redisReachable(REDIS_URL)) reason = `BLOCKERAT: ingen Redis på ${REDIS_URL}.`;
  return reason;
}
const studio = (name, fn) => test(`studio: ${name}`, { timeout: 30000 }, async t => {
  const why = await blocked();
  if (why) { t.skip(why); return }
  await fn();
});

let server = null, eventBus = null, pool = null, S = null, G = null, GoalSse = null, base = '';
const OWNER = 'ffffffff-0000-0000-0000-000000000001';
const OUTSIDER = 'ffffffff-0000-0000-0000-000000000002';
const WS = 'ffffffff-1111-0000-0000-000000000001';
const WS_OTHER = 'ffffffff-1111-0000-0000-000000000002';
const A = 'ffffffff-2222-0000-0000-00000000000a';
const B = 'ffffffff-2222-0000-0000-00000000000b';
const FOREIGN = 'ffffffff-2222-0000-0000-00000000000f';
const auth = {};

const social = (id, over = {}) => ({ id, type: 'templateSocialGoal', goalKind: 'follows',
  goalCurrent: 0, goalTarget: 1000, ...over });
const STATE = {
  [A]: { widgets: [social('w-a-goal')] },
  [B]: { widgets: [social('w-b-goal')] },
  [FOREIGN]: { widgets: [social('w-f-goal')] }
};

async function makeSession(userId) {
  const raw = S.token(), csrf = S.token();
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, csrf_hash, expires_at, mfa_verified_at)
     VALUES ($1,$2,$3,now() + interval '1 hour', now())`,
    [userId, S.digest(raw), S.digest(csrf)]);
  return { cookie: `vyra_session=${raw}`, csrf };
}

test.before(async () => {
  if (await blocked()) return;
  S = require('../security');
  G = require('../goal-runtime');
  GoalSse = require('../goal-sse');
  ({ pool } = require('../db'));
  ({ server, eventBus } = require('../index'));

  await pool.query(
    `INSERT INTO users (id,email,password_hash,display_name,email_verified_at) VALUES
       ($1,$2,'x','studio',now()),($3,$4,'x','studio-out',now())
     ON CONFLICT (id) DO UPDATE SET email_verified_at = now()`,
    [OWNER, `${OWNER}@test.invalid`, OUTSIDER, `${OUTSIDER}@test.invalid`]);
  await pool.query(
    `INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,'studio',$3),($2,'studio-2',$4)
     ON CONFLICT (id) DO NOTHING`, [WS, WS_OTHER, OWNER, OUTSIDER]);
  await pool.query(
    `INSERT INTO workspace_members (workspace_id,user_id,role) VALUES ($1,$3,'owner'),($2,$4,'owner')
     ON CONFLICT (workspace_id,user_id) DO UPDATE SET role = EXCLUDED.role`,
    [WS, WS_OTHER, OWNER, OUTSIDER]);
  for (const [id, ws] of [[A, WS], [B, WS], [FOREIGN, WS_OTHER]]) {
    await pool.query(
      `INSERT INTO overlays (id,workspace_id,name,state) VALUES ($1,$2,'studio','{"widgets":[]}'::jsonb)
       ON CONFLICT (id) DO NOTHING`, [id, ws]);
  }
  auth.owner = await makeSession(OWNER);
  auth.outsider = await makeSession(OUTSIDER);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (await blocked()) return;
  await new Promise(resolve => {
    server.close(resolve);
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  });
  await eventBus.close().catch(() => {});
  await pool.query('DELETE FROM sessions WHERE user_id = ANY($1::uuid[])', [[OWNER, OUTSIDER]]);
  await pool.end();
});

async function reset() {
  for (const [id, state] of Object.entries(STATE)) {
    await pool.query('UPDATE overlays SET state = $2 WHERE id = $1', [id, JSON.stringify(state)]);
  }
  await pool.query('DELETE FROM goal_runtime WHERE overlay_id = ANY($1::uuid[])', [[A, B, FOREIGN]]);
  await pool.query('DELETE FROM goal_event_apply WHERE workspace_id = ANY($1::uuid[])', [[WS, WS_OTHER]]);
  await G.listGoals(pool, A);
  await G.listGoals(pool, B);
}

// ---- plumbing ---------------------------------------------------------------------------------------
async function openStream(path, { as = 'owner' } = {}) {
  const who = as ? auth[as] : null;
  const controller = new AbortController();
  let timer;
  const guard = new Promise((_, reject) => { timer = setTimeout(
    () => reject(new Error('SSE-huvudet kom aldrig inom 5 s')), 5000) });
  let res;
  try {
    res = await Promise.race([
      fetch(`${base}${path}`, { headers: { accept: 'text/event-stream',
        ...(who ? { cookie: who.cookie } : {}) }, signal: controller.signal }), guard]);
  } catch (error) { controller.abort(); throw error } finally { clearTimeout(timer) }

  const stream = { status: res.status, text: '', close: () => controller.abort() };
  if (res.status !== 200) { stream.body = await res.json().catch(() => null); return stream }
  const reader = res.body.getReader(), decoder = new TextDecoder();
  (async () => {
    try { for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      stream.text += decoder.decode(value, { stream: true });
    } } catch { /* abort */ }
  })();
  return stream;
}

function messages(text) {
  const blocks = text.split('\n\n');
  if (!text.endsWith('\n\n')) blocks.pop();
  return blocks.filter(Boolean).map(block => {
    const out = {};
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) out.event = line.slice(7);
      else if (line.startsWith('data: ')) { try { out.data = JSON.parse(line.slice(6)) } catch { return {} } }
    }
    return out;
  }).filter(m => m.event && m.data);
}
const goals = s => messages(s.text).filter(m => m.event === 'goal').map(m => m.data);
const raws = s => messages(s.text).filter(m => m.event === 'live').map(m => m.data);

async function waitFor(predicate, { ms = 5000, why = 'villkoret' } = {}) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > deadline) assert.fail(`tidsgränsen gick ut medan jag väntade på ${why}`);
    await new Promise(r => setTimeout(r, 25));
  }
}
const subscribers = () => eventBus.diagnostics().subscribers;
const settle = () => new Promise(r => setTimeout(r, 400));
const quiet = () => waitFor(() => subscribers() === 0, { why: 'att tidigare strömmar stängs' });

const studioPath = (ws, overlayId) => `/api/workspaces/${ws}/overlays/${overlayId}/events/stream`;
const frameFor = (overlayId, widgetId, over = {}) => ({ overlayId, widgetId, metric: 'follows',
  baseline: 0, progress: 3, target: 100, epoch: 1, revision: '1',
  at: 1_700_000_000_000, ...over });
const goalRow = async (overlayId, widgetId) => (await pool.query(
  'SELECT * FROM goal_runtime WHERE overlay_id=$1 AND widget_id=$2', [overlayId, widgetId])).rows[0];
const applyRows = async () => Number((await pool.query(
  'SELECT count(*) c FROM goal_event_apply WHERE workspace_id=$1', [WS])).rows[0].c);

// ---- the authenticated overlay stream -----------------------------------------------------------------
studio('en inloggad medlem får sitt overlays frames och de råa eventen', async () => {
  await reset();
  await quiet();
  const a = await openStream(studioPath(WS, A));
  assert.equal(a.status, 200);
  try {
    await waitFor(() => subscribers() === 1, { why: 'prenumerationen' });
    await eventBus.publish(WS, { id: `studio-raw-${Date.now()}`, type: 'follow', username: 'Alice' });
    await GoalSse.publish(eventBus, WS, frameFor(A, 'w-a-goal', { progress: 7 }));

    await waitFor(() => goals(a).length >= 1 && raws(a).length >= 1, { why: 'event och frame' });
    await settle();
    assert.deepEqual(goals(a).map(f => f.widgetId), ['w-a-goal']);
    assert.equal(goals(a)[0].value, 7);
    assert.equal(goals(a)[0].overlayId, A);
    // The same eight fields an OBS link gets — one frame format, built in one place.
    assert.deepEqual(Object.keys(goals(a)[0]).sort(),
      ['at', 'epoch', 'metric', 'overlayId', 'revision', 'target', 'value', 'widgetId']);
    assert.equal(raws(a)[0].username, 'Alice');
  } finally { a.close() }
});

studio('två Studio-strömmar i samma workspace ser bara sitt eget overlay', async () => {
  await reset();
  await quiet();
  const a = await openStream(studioPath(WS, A));
  const b = await openStream(studioPath(WS, B));
  try {
    await waitFor(() => subscribers() === 2, { why: 'båda prenumerationerna' });
    await GoalSse.publish(eventBus, WS, frameFor(A, 'w-a-goal', { progress: 11 }));
    await GoalSse.publish(eventBus, WS, frameFor(B, 'w-b-goal', { progress: 424242 }));

    await waitFor(() => goals(a).length >= 1 && goals(b).length >= 1, { why: 'båda framarna' });
    await settle();
    assert.deepEqual(goals(a).map(f => f.widgetId), ['w-a-goal']);
    assert.deepEqual(goals(b).map(f => f.widgetId), ['w-b-goal']);
    assert.ok(!a.text.includes('w-b-goal'), 'B:s widget kom ut i A:s Studio-ström');
    assert.ok(!a.text.includes('424242'), 'B:s värde kom ut i A:s Studio-ström');
    assert.ok(!b.text.includes(A), 'A:s overlay-id kom ut i B:s Studio-ström');
  } finally { a.close(); b.close() }
});

studio('workspace-strömmen får fortfarande inga målframes', async () => {
  // The standing rule: no goal frames workspace-wide, ever, until the connection names an overlay
  // and that name has been checked. This is the connection that cannot.
  await reset();
  await quiet();
  const wide = await openStream(`/api/workspaces/${WS}/events/stream`);
  const scoped = await openStream(studioPath(WS, A));
  try {
    await waitFor(() => subscribers() === 2, { why: 'båda prenumerationerna' });
    await eventBus.publish(WS, { id: `studio-wide-${Date.now()}`, type: 'follow', username: 'Alice' });
    await GoalSse.publish(eventBus, WS, frameFor(A, 'w-a-goal', { progress: 5 }));

    await waitFor(() => goals(scoped).length >= 1 && raws(wide).length >= 1,
      { why: 'framen på den scopade och eventet på den breda' });
    await settle();
    assert.equal(raws(wide).length, 1, 'workspace-strömmen tappade det råa eventet');
    assert.deepEqual(goals(wide), [], 'workspace-strömmen fick en målframe');
    assert.ok(!wide.text.includes('w-a-goal'), 'ett widget-id nådde en workspace-bred anslutning');
    assert.equal(goals(scoped).length, 1);
  } finally { wide.close(); scoped.close() }
});

studio('utloggad 401, fel workspace 403, främmande overlay 404 — och ingen prenumeration kvar', async () => {
  await reset();
  await quiet();
  const anonymous = await openStream(studioPath(WS, A), { as: null });
  assert.equal(anonymous.status, 401);

  const foreignMember = await openStream(studioPath(WS, A), { as: 'outsider' });
  assert.equal(foreignMember.status, 403);

  // A real overlay — in the other workspace. Membership passes, the id does not.
  const foreignOverlay = await openStream(studioPath(WS, FOREIGN));
  assert.equal(foreignOverlay.status, 404);
  assert.equal(foreignOverlay.body.error, 'Overlay saknas');

  await settle();
  assert.equal(subscribers(), 0, 'ett avvisat försök lämnade en prenumeration efter sig');
  // And the rejected caller hears nothing, even for the overlay it named.
  await GoalSse.publish(eventBus, WS_OTHER, frameFor(FOREIGN, 'w-f-goal', { progress: 9 }));
  await settle();
  assert.equal(foreignOverlay.text, '');
});

studio('en skrivmetod mot strömmen är 405', async () => {
  const res = await fetch(`${base}${studioPath(WS, A)}`,
    { method: 'POST', headers: { cookie: auth.owner.cookie, 'x-vyra-csrf': auth.owner.csrf } });
  assert.equal(res.status, 405);
  await res.text();
});

// ---- the test event stays visual ------------------------------------------------------------------------
studio('ett testevent syns på strömmarna men rör inget persistent mål', async () => {
  await reset();
  const before = await goalRow(A, 'w-a-goal');
  assert.equal(Number(before.progress), 0);
  await quiet();
  const scoped = await openStream(studioPath(WS, A));
  try {
    await waitFor(() => subscribers() === 1, { why: 'prenumerationen' });
    const res = await fetch(`${base}/api/test/event/${WS}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: auth.owner.cookie,
        'x-vyra-csrf': auth.owner.csrf },
      body: JSON.stringify({ type: 'follow', username: 'DesignTest' })
    });
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.test, true);

    await waitFor(() => raws(scoped).length >= 1, { why: 'testeventet på strömmen' });
    await settle();

    // Visual: it arrives, looks like a real event, and is gone.
    assert.equal(raws(scoped)[0].username, 'DesignTest');
    assert.equal(goals(scoped).length, 0, 'ett testevent publicerade en målframe');
    assert.equal(Number((await goalRow(A, 'w-a-goal')).progress), 0,
      'ett testevent räknades in i ett riktigt mål');
    assert.equal(await applyRows(), 0, 'ett testevent skrev en apply-rad');
  } finally { scoped.close() }
});

studio('inte ens många testevent flyttar målet', async () => {
  await reset();
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${base}/api/test/event/${WS}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: auth.owner.cookie,
        'x-vyra-csrf': auth.owner.csrf },
      body: JSON.stringify({ type: i % 2 ? 'gift' : 'follow', username: `Design${i}`, count: 10, value: 100 })
    });
    assert.equal(res.status, 202);
  }
  await settle();
  assert.equal(Number((await goalRow(A, 'w-a-goal')).progress), 0);
  assert.equal(Number((await goalRow(B, 'w-b-goal')).progress), 0);
  assert.equal(await applyRows(), 0);
});

// ---- lifecycle -------------------------------------------------------------------------------------------
studio('stängning och återanslutning lämnar varken prenumeration eller timer', async () => {
  const timers = () => process.getActiveResourcesInfo().filter(r => r === 'Timeout').length;
  await reset();
  await quiet();
  // Warm-up: the route queries Postgres, and a pg client's idle timer is a Timeout too.
  const warm = await openStream(studioPath(WS, A));
  await waitFor(() => subscribers() === 1, { why: 'uppvärmningen' });
  warm.close();
  await quiet();
  await settle();
  const timersBefore = timers();

  // Three reconnects in a row, the way a Studio tab does across a reload.
  for (let i = 0; i < 3; i++) {
    const s = await openStream(studioPath(WS, A));
    await waitFor(() => subscribers() === 1, { why: `prenumerationen i varv ${i + 1}` });
    assert.ok(timers() > timersBefore, 'en öppen ström la inte till någon timer — mätningen är blind');
    s.close();
    await waitFor(() => subscribers() === 0, { why: `att varv ${i + 1} städas bort` });
  }
  await settle();
  assert.equal(subscribers(), 0, 'en Redis-prenumeration blev kvar');
  for (let i = 0; i < 40 && timers() > timersBefore; i++) await new Promise(r => setTimeout(r, 50));
  assert.ok(timers() <= timersBefore,
    `heartbeat-timers blev kvar efter tre varv: ${timersBefore} före, ${timers()} efter`);
});
