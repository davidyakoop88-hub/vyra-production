'use strict';
// Two overlays in ONE workspace, two OBS links, two live SSE connections — the case the isolation
// rule exists for. Everything here goes over a real socket, through the real
// /api/overlay-access/:token/events/stream route, with a real Redis channel underneath.
//
// The claim is not "the filter function works" (goal-sse.test.js proves that). It is that a token
// for overlay A never receives a byte belonging to overlay B: not a frame, not a widget id, not a
// value. A shared workspace channel carries both, so the filter has to sit in the write path, and
// the only way to show that is to publish B's frame on the same channel A is listening to.
//
// Raw TikTok events keep the contract they already have: workspace-scoped, both links see them.
//
// BLOCKED without both TEST_DATABASE_URL and a reachable Redis — the whole point is the real
// pub/sub fan-out, and a fake channel would fan out however the fake was written.
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

let server = null, eventBus = null, pool = null, S = null, GoalSse = null, base = '';

const USER = 'cccccccc-0000-0000-0000-000000000001';
const WS = 'cccccccc-1111-0000-0000-000000000000';
const OVERLAY_A = 'cccccccc-2222-0000-0000-00000000000a';
const OVERLAY_B = 'cccccccc-2222-0000-0000-00000000000b';
const UNKNOWN_OVERLAY = 'cccccccc-9999-0000-0000-000000000000';
const link = { a: null, b: null, revoked: null };

// The Redis probe is async and node:test wants `skip` at definition time, so the reason is resolved
// once, lazily, and every test asks for it — the same shape sse-integration.test.js already uses.
let reason = null, probed = false;
async function blocked() {
  if (probed) return reason;
  probed = true;
  if (!DB_URL) {
    reason = 'BLOCKERAT: ingen isolerad Postgres. Sätt TEST_DATABASE_URL till en engångsdatabas.';
  } else if (!await redisReachable(REDIS_URL)) {
    reason = `BLOCKERAT: ingen Redis på ${REDIS_URL}. Isoleringen bevisas bara mot en riktig kanal.`;
  }
  return reason;
}
const sse = (name, fn) => test(`sse: ${name}`, { timeout: 30000 }, async t => {
  const why = await blocked();
  if (why) { t.skip(why); return }
  await fn();
});

async function makeLink(overlayId, { revoked = false } = {}) {
  const raw = S.token(32);
  await pool.query(
    `INSERT INTO overlay_access_tokens (overlay_id, token_hash, label, created_by, revoked_at)
     VALUES ($1,$2,'test',$3,$4)`,
    [overlayId, S.digest(raw), USER, revoked ? new Date() : null]);
  return raw;
}

test.before(async () => {
  if (await blocked()) return;
  S = require('../security');
  GoalSse = require('../goal-sse');
  ({ pool } = require('../db'));
  ({ server, eventBus } = require('../index'));

  await pool.query(
    `INSERT INTO users (id,email,password_hash,display_name,email_verified_at)
     VALUES ($1,$2,'x','sse',now()) ON CONFLICT (id) DO NOTHING`, [USER, `${USER}@test.invalid`]);
  await pool.query(`INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,'sse',$2)
     ON CONFLICT (id) DO NOTHING`, [WS, USER]);
  for (const [id, name] of [[OVERLAY_A, 'A'], [OVERLAY_B, 'B']]) {
    await pool.query(
      `INSERT INTO overlays (id,workspace_id,name,state) VALUES ($1,$2,$3,'{"widgets":[]}'::jsonb)
       ON CONFLICT (id) DO NOTHING`, [id, WS, name]);
  }
  await pool.query('DELETE FROM overlay_access_tokens WHERE overlay_id = ANY($1::uuid[])',
    [[OVERLAY_A, OVERLAY_B]]);
  link.a = await makeLink(OVERLAY_A);
  link.b = await makeLink(OVERLAY_B);
  link.revoked = await makeLink(OVERLAY_A, { revoked: true });

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
  await pool.query('DELETE FROM overlay_access_tokens WHERE overlay_id = ANY($1::uuid[])',
    [[OVERLAY_A, OVERLAY_B]]);
  await pool.end();
});

// ---- SSE plumbing --------------------------------------------------------------------------------
// A live EventSource, minus the browser: read the body as it arrives and keep the raw text, because
// several assertions below are about what is NOT in it.
async function openStream(token) {
  const controller = new AbortController();
  // The head has to arrive on its own, before any event: a stream that only becomes visible when
  // the first message happens to be published is not an open connection. Guarded so a server that
  // holds the header fails here, quickly and by name, instead of as a 30 s test timeout.
  let timer;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(
    new Error('SSE-huvudet kom aldrig inom 5 s — flushas headern?')), 5000) });
  let res;
  try {
    res = await Promise.race([
      fetch(`${base}/api/overlay-access/${token}/events/stream`,
        { headers: { accept: 'text/event-stream' }, signal: controller.signal }),
      guard]);
  } catch (error) {
    // The server has already subscribed by now; without this the connection — and its subscription
    // — would linger and take every later test's quiet() with it.
    controller.abort();
    throw error;
  } finally { clearTimeout(timer) }
  const stream = { status: res.status, text: '', close: () => controller.abort() };
  if (res.status === 200) {
    const reader = res.body.getReader(), decoder = new TextDecoder();
    (async () => {
      try { for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        stream.text += decoder.decode(value, { stream: true });
      } } catch { /* abort */ }
    })();
  } else {
    stream.body = await res.json();
  }
  return stream;
}

// event/data pairs; heartbeats and comment lines dropped. A chunk can arrive split mid-message, so
// the trailing partial block is left out rather than parsed — otherwise a poll that happens to land
// between two TCP segments throws instead of waiting one more round.
function messages(text) {
  const blocks = text.split('\n\n');
  if (!text.endsWith('\n\n')) blocks.pop();
  return blocks.filter(Boolean).map(block => {
    const out = {};
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) out.event = line.slice(7);
      else if (line.startsWith('data: ')) { try { out.data = JSON.parse(line.slice(6)) } catch { return {} } }
      else if (line.startsWith('id: ')) out.id = line.slice(4);
    }
    return out;
  }).filter(m => m.event && m.data);
}
const goals = stream => messages(stream.text).filter(m => m.event === 'goal').map(m => m.data);
const raw = stream => messages(stream.text).filter(m => m.event === 'live').map(m => m.data);

async function waitFor(predicate, { ms = 5000, why = 'villkoret' } = {}) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > deadline) assert.fail(`tidsgränsen gick ut medan jag väntade på ${why}`);
    await new Promise(r => setTimeout(r, 25));
  }
}
// fetch resolves on the response head, which openEventStream() writes BEFORE it subscribes. Publish
// before the subscription exists and the message is simply gone — so wait for the real count.
const subscribers = () => eventBus.diagnostics().subscribers;
const settle = () => new Promise(r => setTimeout(r, 400));
// Unsubscribe is asynchronous on the server side, so a previous test's connection can still be
// closing. Every test starts from a known zero rather than from whatever is left over.
const quiet = () => waitFor(() => subscribers() === 0, { why: 'att tidigare strömmar stängs' });

// Bypasses buildFrame() completely: this is what a broken or hostile publisher would put on the
// channel, and the write path has to be what stops it.
async function publishRaw(envelope) {
  const client = await eventBus.connect();
  await client.publish(eventBus.channel(WS), JSON.stringify(envelope));
}

const frameFor = (overlayId, widgetId, over = {}) => ({
  overlayId, widgetId, metric: 'follows', baseline: 0, progress: 7, target: 100, epoch: 1,
  revision: '1', at: 1_700_000_000_000, ...over });

// ---- the isolation proof -------------------------------------------------------------------------
sse('A och B får samma råa event, men bara sitt eget mål', async () => {
  await quiet();
  const a = await openStream(link.a), b = await openStream(link.b);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  try {
    await waitFor(() => subscribers() === 2, { why: 'båda prenumerationerna' });

    // B's value is deliberately unmistakable: '22' would also match the '2222' inside both overlay
    // uuids, and the leak checks below are substring searches over the raw byte stream.
    await eventBus.publish(WS, { id: `sse-raw-${Date.now()}`, type: 'follow', username: 'Alice' });
    await GoalSse.publish(eventBus, WS, frameFor(OVERLAY_A, 'w-a', { progress: 11 }));
    await GoalSse.publish(eventBus, WS, frameFor(OVERLAY_B, 'w-b', { progress: 424242 }));

    await waitFor(() => raw(a).length === 1 && raw(b).length === 1 && goals(a).length && goals(b).length,
      { why: 'ett rått event och ett mål på varje ström' });
    await settle();

    // Raw events: the existing workspace contract, untouched.
    assert.equal(raw(a).length, 1);
    assert.deepEqual(raw(a)[0].username, 'Alice');
    assert.deepEqual(raw(b)[0].username, 'Alice');

    // Goals: one each, and only its own.
    assert.deepEqual(goals(a).map(g => g.widgetId), ['w-a']);
    assert.deepEqual(goals(b).map(g => g.widgetId), ['w-b']);
    assert.equal(goals(a)[0].overlayId, OVERLAY_A);
    assert.equal(goals(a)[0].value, 11);
    assert.equal(goals(b)[0].value, 424242);

    // Nothing of B's is anywhere in A's byte stream — not the id, not the widget, not the value.
    assert.ok(!a.text.includes(OVERLAY_B), 'B:s overlay-id fanns i A:s ström');
    assert.ok(!a.text.includes('w-b'), 'B:s widget-id fanns i A:s ström');
    assert.ok(!a.text.includes('424242'), 'B:s värde fanns i A:s ström');
    assert.ok(!b.text.includes(OVERLAY_A), 'A:s overlay-id fanns i B:s ström');
    assert.ok(!b.text.includes('w-a'), 'A:s widget-id fanns i B:s ström');
  } finally { a.close(); b.close() }
});

sse('flera mål i samma overlay når rätt token, alla tre', async () => {
  await quiet();
  const a = await openStream(link.a), b = await openStream(link.b);
  try {
    await waitFor(() => subscribers() === 2, { why: 'båda prenumerationerna' });
    for (const [widgetId, progress] of [['w-1', 1], ['w-2', 2], ['w-3', 3]]) {
      await GoalSse.publish(eventBus, WS, frameFor(OVERLAY_A, widgetId, { progress }));
    }
    await GoalSse.publish(eventBus, WS, frameFor(OVERLAY_B, 'w-other', { progress: 9 }));

    await waitFor(() => goals(a).length === 3 && goals(b).length === 1, { why: 'alla fyra frames' });
    await settle();
    assert.deepEqual(goals(a).map(g => g.widgetId).sort(), ['w-1', 'w-2', 'w-3']);
    assert.deepEqual(goals(b).map(g => g.widgetId), ['w-other']);
  } finally { a.close(); b.close() }
});

sse('en frame utan overlayId eller med okänt overlayId släpps av strömmen', async () => {
  await quiet();
  const a = await openStream(link.a), b = await openStream(link.b);
  try {
    await waitFor(() => subscribers() === 2, { why: 'båda prenumerationerna' });

    await publishRaw({ goal: { widgetId: 'w-noid', metric: 'follows', value: 5, target: 10, epoch: 1,
      revision: '1', at: 1 } });
    await publishRaw({ goal: frameFor(UNKNOWN_OVERLAY, 'w-unknown', { progress: 5 }) });
    await publishRaw({ goal: { overlayId: OVERLAY_A, widgetId: 'w-bad', metric: 'kramar', value: 1, target: 2,
      epoch: 1, revision: '1', at: 1 } });
    // A valid frame published last: when THIS arrives, the three above have already been handled.
    await GoalSse.publish(eventBus, WS, frameFor(OVERLAY_A, 'w-ok', { progress: 4 }));

    await waitFor(() => goals(a).length >= 1, { why: 'den giltiga framen' });
    await settle();
    assert.deepEqual(goals(a).map(g => g.widgetId), ['w-ok'], 'en ogiltig frame kom igenom');
    assert.deepEqual(goals(b), [], 'B fick något av det som släpptes');
    for (const leak of ['w-noid', 'w-unknown', 'w-bad', UNKNOWN_OVERLAY]) {
      assert.ok(!a.text.includes(leak), `${leak} skrevs till A`);
    }
  } finally { a.close(); b.close() }
});

sse('framen på tråden bär exakt de åtta fälten och inga identiteter', async () => {
  await quiet();
  const a = await openStream(link.a);
  try {
    await waitFor(() => subscribers() === 1, { why: 'prenumerationen' });
    // Everything a caller might carelessly hand along, on its way to the wire.
    await publishRaw({ goal: { ...frameFor(OVERLAY_A, 'w-fields', { progress: 3 }),
      value: 3, workspaceId: WS, userId: USER, username: 'Streamer', accessToken: link.a,
      tokenHash: 'hash', eventId: 'evt-1' } });

    await waitFor(() => goals(a).length >= 1, { why: 'framen' });
    await settle();
    const frame = goals(a)[0];
    assert.deepEqual(Object.keys(frame).sort(),
      ['at', 'epoch', 'metric', 'overlayId', 'revision', 'target', 'value', 'widgetId']);
    for (const secret of [WS, USER, 'Streamer', link.a, link.b, 'hash', 'evt-1']) {
      assert.ok(!a.text.includes(secret), `${secret} nådde klienten`);
    }
    // The id: line belongs to replayable stream events. A frame must not move the resume position.
    assert.ok(!/^id: /m.test(a.text.split('event: goal')[1] || ''), 'framen bar en id-rad');
  } finally { a.close() }
});

sse('en återkallad token kan inte öppna strömmen', async () => {
  await quiet();
  const dead = await openStream(link.revoked);
  assert.equal(dead.status, 401);
  assert.equal(dead.body.ok, false);
  assert.match(dead.body.error, /ogiltig|gått ut/i);
  await settle();
  assert.equal(subscribers(), 0, 'en återkallad token lämnade en prenumeration efter sig');

  // And it stays deaf: a frame for the overlay it used to point at reaches nobody through it.
  await GoalSse.publish(eventBus, WS, frameFor(OVERLAY_A, 'w-revoked', { progress: 1 }));
  await settle();
  assert.equal(dead.text, '', 'en återkallad länk fick ändå bytes');
});

sse('en stängd anslutning lämnar varken prenumeration eller timer kvar', async () => {
  const timers = () => process.getActiveResourcesInfo().filter(r => r === 'Timeout').length;
  // Warm-up first: the route queries Postgres, and a pg client's idle timer is a Timeout too. One
  // open/close cycle gets those clients into the pool so the measurement below sees the heartbeat
  // and not the pool filling up.
  await quiet();
  const warm = await openStream(link.a);
  await waitFor(() => subscribers() === 1, { why: 'uppvärmningsströmmen' });
  warm.close();
  await quiet();
  await settle();

  const timersBefore = timers();
  const a = await openStream(link.a), b = await openStream(link.b);
  await waitFor(() => subscribers() === 2, { why: 'båda prenumerationerna' });
  // Load-bearing: if an open stream did not add a timer, the check below would prove nothing.
  assert.ok(timers() > timersBefore, 'en öppen ström la inte till någon timer — mätningen är blind');

  a.close(); b.close();
  await waitFor(() => subscribers() === 0, { why: 'att prenumerationerna städas bort' });
  await settle();
  assert.equal(subscribers(), 0, 'en Redis-prenumeration blev kvar efter stängning');
  // Soft poll, so the failure below is the one that reports the numbers.
  for (let i = 0; i < 40 && timers() > timersBefore; i++) await new Promise(r => setTimeout(r, 50));
  assert.ok(timers() <= timersBefore,
    `heartbeat-timern blev kvar: ${timersBefore} före, ${timers()} efter`);
});
