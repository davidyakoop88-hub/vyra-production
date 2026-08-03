'use strict';
// The whole chain, end to end: POST /api/events/tiktok/:workspaceId with the bridge's own token,
// through the real route, into a real Postgres, out over a real Redis channel, onto two real SSE
// connections opened with two different OBS links.
//
// goal-ingest.test.js pins the order and the failure semantics with fakes. This file is about the
// parts a fake cannot testify to: that the number in the database and the number on the wire are the
// same number, that the two dedupes (Postgres claim, Redis SET NX) really are independent, and that
// a frame produced by the actual ingest path — not by a test publishing directly — still only
// reaches the overlay it belongs to.
//
// BLOCKED without both TEST_DATABASE_URL and a reachable Redis.
const test = require('node:test'), assert = require('node:assert/strict');
const net = require('node:net');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const INGEST_TOKEN = 'ci-ingest-token-for-the-goal-chain-32+';

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
process.env.TIKTOK_INGEST_TOKEN = INGEST_TOKEN;

let reason = null, probed = false;
async function blocked() {
  if (probed) return reason;
  probed = true;
  if (!DB_URL) reason = 'BLOCKERAT: ingen isolerad Postgres. Sätt TEST_DATABASE_URL.';
  else if (!await redisReachable(REDIS_URL)) reason = `BLOCKERAT: ingen Redis på ${REDIS_URL}.`;
  return reason;
}
const chain = (name, fn) => test(`kedja: ${name}`, { timeout: 30000 }, async t => {
  const why = await blocked();
  if (why) { t.skip(why); return }
  await fn();
});

let server = null, eventBus = null, pool = null, S = null, G = null, GoalSse = null, base = '';
const USER = 'aaaaaaaa-0000-0000-0000-000000000001';
const WS = 'aaaaaaaa-1111-0000-0000-000000000000';
const A = 'aaaaaaaa-2222-0000-0000-00000000000a';
const B = 'aaaaaaaa-2222-0000-0000-00000000000b';
const link = {};

const social = (id, kind = 'follows', over = {}) => ({ id, type: 'templateSocialGoal',
  goalKind: kind, goalCurrent: 0, goalTarget: 1000, ...over });

// A has one goal per metric family the tests touch; B has a follows goal of its own, so a single
// follow event legitimately updates both overlays and the isolation claim has something to isolate.
const STATE = {
  [A]: { widgets: [social('w-a-follows'), social('w-a-likes', 'likes')] },
  [B]: { widgets: [social('w-b-follows')] }
};

test.before(async () => {
  if (await blocked()) return;
  S = require('../security');
  G = require('../goal-runtime');
  GoalSse = require('../goal-sse');
  ({ pool } = require('../db'));
  ({ server, eventBus } = require('../index'));

  await pool.query(
    `INSERT INTO users (id,email,password_hash,display_name,email_verified_at)
     VALUES ($1,$2,'x','chain',now()) ON CONFLICT (id) DO NOTHING`, [USER, `${USER}@test.invalid`]);
  await pool.query(`INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,'chain',$2)
     ON CONFLICT (id) DO NOTHING`, [WS, USER]);
  for (const id of [A, B]) {
    await pool.query(
      `INSERT INTO overlays (id,workspace_id,name,state) VALUES ($1,$2,'chain','{"widgets":[]}'::jsonb)
       ON CONFLICT (id) DO NOTHING`, [id, WS]);
  }
  await pool.query('DELETE FROM overlay_access_tokens WHERE overlay_id = ANY($1::uuid[])', [[A, B]]);
  for (const [key, id] of [['a', A], ['b', B]]) {
    const raw = S.token(32);
    await pool.query(
      `INSERT INTO overlay_access_tokens (overlay_id, token_hash, label, created_by)
       VALUES ($1,$2,'chain',$3)`, [id, S.digest(raw), USER]);
    link[key] = raw;
  }

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
  await pool.query('DELETE FROM overlay_access_tokens WHERE overlay_id = ANY($1::uuid[])', [[A, B]]);
  await pool.end();
});

// Fresh layouts, fresh runtime rows, and no idempotency history for this workspace.
async function reset() {
  for (const [id, state] of Object.entries(STATE)) {
    await pool.query('UPDATE overlays SET state = $2 WHERE id = $1', [id, JSON.stringify(state)]);
  }
  await pool.query('DELETE FROM goal_runtime WHERE overlay_id = ANY($1::uuid[])', [[A, B]]);
  await pool.query('DELETE FROM goal_event_apply WHERE workspace_id = $1', [WS]);
  // The rows come into being the way the app makes them.
  await G.listGoals(pool, A);
  await G.listGoals(pool, B);
}

// ---- HTTP + SSE plumbing ---------------------------------------------------------------------------
let eventSeq = 0;
const eventId = prefix => `${prefix}-${Date.now()}-${eventSeq++}`;

async function ingest(payload, { token = INGEST_TOKEN, workspaceId = WS } = {}) {
  const res = await fetch(`${base}/api/events/tiktok/${workspaceId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text) } catch {}
  return { status: res.status, body, text };
}

async function openStream(token) {
  const controller = new AbortController();
  let timer;
  const guard = new Promise((_, reject) => { timer = setTimeout(
    () => reject(new Error('SSE-huvudet kom aldrig inom 5 s')), 5000) });
  let res;
  try {
    res = await Promise.race([
      fetch(`${base}/api/overlay-access/${token}/events/stream`,
        { headers: { accept: 'text/event-stream' }, signal: controller.signal }), guard]);
  } catch (error) { controller.abort(); throw error } finally { clearTimeout(timer) }

  const stream = { status: res.status, text: '', close: () => controller.abort() };
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
const goals = stream => messages(stream.text).filter(m => m.event === 'goal').map(m => m.data);
const raws = stream => messages(stream.text).filter(m => m.event === 'live').map(m => m.data);

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

const goalRow = async (overlayId, widgetId) => (await pool.query(
  'SELECT * FROM goal_runtime WHERE overlay_id=$1 AND widget_id=$2', [overlayId, widgetId])).rows[0];
const applyRows = async () => Number((await pool.query(
  'SELECT count(*) c FROM goal_event_apply WHERE workspace_id=$1', [WS])).rows[0].c);

// Opens A (and optionally B), runs the body, always closes.
async function withStreams(fn, { both = false } = {}) {
  await quiet();
  const a = await openStream(link.a);
  const b = both ? await openStream(link.b) : null;
  try {
    await waitFor(() => subscribers() === (both ? 2 : 1), { why: 'prenumerationerna' });
    return await fn(a, b);
  } finally { a.close(); if (b) b.close() }
}

// ---- the happy path ---------------------------------------------------------------------------------
chain('ett follow räknas i Postgres och syns som en absolut frame', async () => {
  await reset();
  await withStreams(async a => {
    const id = eventId('follow');
    const out = await ingest({ id, type: 'follow', username: 'Alice', userId: 'u-1' });
    assert.equal(out.status, 202, out.text);

    await waitFor(() => goals(a).length >= 1 && raws(a).length >= 1, { why: 'event och frame' });
    await settle();

    const row = await goalRow(A, 'w-a-follows');
    assert.equal(Number(row.progress), 1, 'Postgres räknade inte eventet');

    const frame = goals(a).find(f => f.widgetId === 'w-a-follows');
    assert.ok(frame, 'ingen frame för målet som uppdaterades');
    // The number on the wire is the number in the database, absolutely, not an increment.
    assert.equal(frame.value, Number(row.baseline) + Number(row.progress));
    assert.equal(frame.value, 1);
    assert.equal(frame.overlayId, A);
    assert.equal(frame.metric, 'follows');
    assert.equal(frame.epoch, Number(row.epoch));
    assert.deepEqual(Object.keys(frame).sort(),
      ['at', 'epoch', 'metric', 'overlayId', 'target', 'value', 'widgetId']);

    // And the raw event still arrives, unchanged.
    assert.equal(raws(a)[0].id, id);
    assert.equal(raws(a)[0].type, 'follow');
    assert.equal(raws(a)[0].username, 'Alice');
  });
});

chain('ett gift uppdaterar gifts och diamonds med en frame per widget', async () => {
  await reset();
  await pool.query('UPDATE overlays SET state = $2 WHERE id = $1', [A, JSON.stringify({
    widgets: [social('w-gifts', 'follows'), social('w-diamonds', 'follows')] })]);
  // Two goals on different metrics, made directly: goalKind only speaks follows/likes today.
  await pool.query('DELETE FROM goal_runtime WHERE overlay_id=$1', [A]);
  await G.upsertGoal(pool, { overlayId: A, widgetId: 'w-gifts', metric: 'gifts', target: 100 });
  await G.upsertGoal(pool, { overlayId: A, widgetId: 'w-diamonds', metric: 'diamonds', target: 1000 });

  await withStreams(async a => {
    const out = await ingest({ id: eventId('gift'), type: 'gift', username: 'Alice',
      giftName: 'Rose', count: 8, value: 80 });
    assert.equal(out.status, 202, out.text);
    await waitFor(() => goals(a).length >= 2, { why: 'båda framarna' });
    await settle();

    const byWidget = Object.fromEntries(goals(a).map(f => [f.widgetId, f]));
    assert.equal(byWidget['w-gifts'].value, 8, 'gifts räknade inte antalet');
    assert.equal(byWidget['w-diamonds'].value, 80, 'diamonds räknade inte värdet');
    assert.equal(Number((await goalRow(A, 'w-gifts')).progress), 8);
    assert.equal(Number((await goalRow(A, 'w-diamonds')).progress), 80);
    assert.equal(goals(a).length, 2, 'fler frames än uppdaterade widgets');
  });
});

chain('ett like räknar bara count, aldrig rummets totalvärde', async () => {
  await reset();
  await withStreams(async a => {
    // value is TikTok's running room-wide like total. Counting it would credit the goal with the
    // whole room on every tap.
    await ingest({ id: eventId('like'), type: 'likes', username: 'Alice', count: 3, value: 999999 });
    await waitFor(() => goals(a).length >= 1, { why: 'like-framen' });
    await settle();

    const row = await goalRow(A, 'w-a-likes');
    assert.equal(Number(row.progress), 3, 'like räknade något annat än count');
    const frame = goals(a).find(f => f.widgetId === 'w-a-likes');
    assert.equal(frame.value, 3);
    // The room total is legitimately on the raw event; it must not be anywhere in a goal frame.
    assert.ok(!goals(a).some(f => f.value === 999999 || f.target === 999999),
      'rummets total kom ut som måldata');
    assert.equal(raws(a)[0].value, 999999, 'det råa eventets värde ändrades av målvägen');
    assert.equal(Number((await goalRow(A, 'w-a-follows')).progress), 0, 'ett like rörde follows-målet');
  });
});

// ---- dedupe ----------------------------------------------------------------------------------------
chain('samma event igen: ingen dubbelräkning och ingen ny frame', async () => {
  await reset();
  await withStreams(async a => {
    const id = eventId('dup');
    const first = await ingest({ id, type: 'follow', username: 'Alice' });
    assert.equal(first.status, 202);
    await waitFor(() => goals(a).length >= 1, { why: 'första framen' });

    const again = await ingest({ id, type: 'follow', username: 'Alice' });
    assert.equal(again.status, 200, 'omtaget behandlades inte som en dublett');
    assert.equal(again.body.duplicate, true);
    await settle();

    assert.equal(Number((await goalRow(A, 'w-a-follows')).progress), 1, 'eventet räknades två gånger');
    assert.equal(goals(a).length, 1, 'dubletten publicerade en till frame');
    assert.equal(raws(a).length, 1, 'dubletten publicerade ett till rått event');
  });
});

chain('samma event samtidigt två gånger: en ökning, högst ett rått event', async () => {
  await reset();
  await withStreams(async a => {
    const id = eventId('race');
    const [one, two] = await Promise.all([
      ingest({ id, type: 'follow', username: 'Alice' }),
      ingest({ id, type: 'follow', username: 'Alice' })]);
    await settle();

    assert.equal(Number((await goalRow(A, 'w-a-follows')).progress), 1,
      `två samtidiga kopior räknades båda (${one.status}/${two.status})`);
    assert.ok(raws(a).length <= 1, `${raws(a).length} råa event för ett id`);
    assert.ok(goals(a).length <= 1, `${goals(a).length} frames för en ökning`);
    assert.equal(await applyRows(), 1, 'fler än en apply-rad för samma id');
  });
});

chain('ett event som inget mål räknar lämnar den råa vägen orörd och skriver ingen apply-rad', async () => {
  await reset();
  await pool.query('DELETE FROM goal_runtime WHERE overlay_id = ANY($1::uuid[])', [[A, B]]);
  const before = await applyRows();
  await withStreams(async a => {
    const id = eventId('nogoal');
    const out = await ingest({ id, type: 'follow', username: 'Alice', userId: 'u-9' });
    assert.equal(out.status, 202, 'statuskoden ändrades när inget mål matchade');
    await waitFor(() => raws(a).length >= 1, { why: 'det råa eventet' });
    await settle();

    assert.equal(raws(a).length, 1);
    assert.equal(raws(a)[0].id, id);
    assert.equal(raws(a)[0].username, 'Alice');
    assert.equal(goals(a).length, 0, 'en frame publicerades utan mål');
    assert.equal(await applyRows(), before, 'en apply-rad skrevs för ett event ingen räknar');
  });
});

// ---- failures, injected into the real chain ---------------------------------------------------------
chain('ett Postgresfel före commit: 500, inget rått event, ingen frame', async () => {
  await reset();
  await withStreams(async a => {
    const real = G.applyEvent;
    G.applyEvent = async () => { throw new Error('injicerat DB-fel') };
    let out;
    try { out = await ingest({ id: eventId('dbfail'), type: 'follow', username: 'Alice' }) }
    finally { G.applyEvent = real }

    assert.equal(out.status, 500, out.text);
    await settle();
    assert.equal(raws(a).length, 0, 'ett rått event publicerades trots DB-felet');
    assert.equal(goals(a).length, 0);
    assert.equal(Number((await goalRow(A, 'w-a-follows')).progress), 0);
  });
});

chain('rå publicering som fallerar efter commit ger 500, och omtaget dubblar inte', async () => {
  await reset();
  await withStreams(async a => {
    const id = eventId('rawfail');
    const real = eventBus.publish.bind(eventBus);
    eventBus.publish = async () => { throw new Error('injicerat Redis-fel') };
    let failed;
    try { failed = await ingest({ id, type: 'follow', username: 'Alice' }) }
    finally { eventBus.publish = real }
    assert.equal(failed.status, 500, failed.text);

    // Committed, but never announced. The bridge retries the same id.
    assert.equal(Number((await goalRow(A, 'w-a-follows')).progress), 1);
    const retry = await ingest({ id, type: 'follow', username: 'Alice' });
    assert.equal(retry.status, 202, 'omtaget kom inte igenom som ett nytt rått event');
    await waitFor(() => raws(a).length >= 1, { why: 'det råa eventet i omtaget' });
    await settle();

    assert.equal(Number((await goalRow(A, 'w-a-follows')).progress), 1, 'omtaget räknade en gång till');
    assert.equal(raws(a).length, 1);
    // Postgres already applied it, so this retry has no new number to announce.
    assert.equal(goals(a).length, 0, 'en redan applicerad dublett publicerade en frame');
  });
});

chain('ett frame-fel efter commit lämnar svaret och databasen korrekta, och loggar rent', async () => {
  await reset();
  const lines = [];
  const realLog = console.error;
  console.error = line => lines.push(String(line));
  const realPublish = GoalSse.publish;
  GoalSse.publish = async () => { throw new Error('injicerat framefel') };
  let out;
  try {
    out = await ingest({ id: eventId('framefail'), type: 'follow', username: 'Streamer',
      userId: 'u-42', profileUrl: 'https://cdn/avatar-42.png' });
  } finally { GoalSse.publish = realPublish; console.error = realLog }

  assert.equal(out.status, 202, 'ett frame-fel ändrade HTTP-svaret');
  assert.equal(Number((await goalRow(A, 'w-a-follows')).progress), 1, 'DB-värdet blev fel');

  const failure = lines.find(l => l.includes('goal_frame_publish_failed'));
  assert.ok(failure, 'frame-felet loggades inte');
  for (const secret of [INGEST_TOKEN, 'Streamer', 'u-42', 'avatar-42', WS, A, 'w-a-follows']) {
    assert.ok(!failure.includes(secret), `${secret} hamnade i loggen`);
  }
});

// ---- isolation, through the real ingest path ---------------------------------------------------------
chain('två overlays i samma workspace får bara sina egna frames ur den riktiga ingestvägen', async () => {
  await reset();
  await withStreams(async (a, b) => {
    const id = eventId('iso');
    const out = await ingest({ id, type: 'follow', username: 'Alice' });
    assert.equal(out.status, 202, out.text);

    await waitFor(() => goals(a).length >= 1 && goals(b).length >= 1 &&
      raws(a).length >= 1 && raws(b).length >= 1, { why: 'frames på båda strömmarna' });
    await settle();

    // One event, two overlays, two different goals — each link sees exactly its own.
    assert.deepEqual(goals(a).map(f => f.widgetId), ['w-a-follows']);
    assert.deepEqual(goals(b).map(f => f.widgetId), ['w-b-follows']);
    assert.equal(goals(a)[0].overlayId, A);
    assert.equal(goals(b)[0].overlayId, B);

    // The raw event is workspace-wide, exactly as before: both got it, and it is the same event.
    assert.equal(raws(a)[0].id, id);
    assert.equal(raws(b)[0].id, id);

    assert.ok(!a.text.includes('w-b-follows'), 'B:s widget kom ut på A:s länk');
    assert.ok(!a.text.includes(B), 'B:s overlay-id kom ut på A:s länk');
    assert.ok(!b.text.includes('w-a-follows'), 'A:s widget kom ut på B:s länk');
    assert.ok(!b.text.includes(A), 'A:s overlay-id kom ut på B:s länk');
  }, { both: true });
});

chain('en ogiltig ingest-token räknar ingenting', async () => {
  await reset();
  const out = await ingest({ id: eventId('badtoken'), type: 'follow', username: 'Alice' },
    { token: 'x'.repeat(INGEST_TOKEN.length) });
  assert.equal(out.status, 401);
  assert.equal(Number((await goalRow(A, 'w-a-follows')).progress), 0);
  assert.equal(await applyRows(), 0);
});
