'use strict';
// /status was unauthenticated and returned, for every running bridge and every queued workspace,
// the workspace id and the streamer's TikTok username. Give the service a public domain and that
// is an open directory of every customer's TikTok account.
//
// These tests pin both halves of the fix: the endpoint is behind METRICS_TOKEN, and what it
// returns carries no identity at all. The second half matters more than the first — a token can be
// leaked or a domain accidentally opened, but a body that never contained a username cannot leak
// one.
const test = require('node:test'), assert = require('node:assert/strict');
const { createHttpHandler } = require('../connection-manager');

const TOKEN = 'm'.repeat(48);          // realistic length; the guard refuses anything under 32

// Distinctive values, so a leak is unmistakable rather than a judgement call.
const WORKSPACE = '11111111-2222-3333-4444-555555555555';
const QUEUED_WORKSPACE = '99999999-8888-7777-6666-555555555555';
const USERNAME = 'piiikabom';
const QUEUED_USERNAME = 'someoneelse';

// Mirrors the real manager.stats() shape, including the two identity-carrying arrays.
const manager = {
  stats: () => ({
    totalBridges: 2,
    maxBridges: 5,
    atCapacity: false,
    waitingCount: 1,
    restarts: 3,
    lastEventTime: 1754160000000,
    bridges: [
      { workspaceId: WORKSPACE, username: USERNAME, isConnected: true, reconnectAttempts: 0, lastEventTime: 1754160000000 },
      { workspaceId: QUEUED_WORKSPACE, username: 'another', isConnected: false, reconnectAttempts: 2, lastEventTime: null }
    ],
    waiting: [
      { workspaceId: QUEUED_WORKSPACE, username: QUEUED_USERNAME, reason: 'at-capacity', since: 1754160000000 }
    ]
  })
};

const syncInfo = () => ({ lastSyncAt: 1754160001000, lastSyncError: null, syncIntervalMs: 15000 });

// Minimal ServerResponse stand-in — enough for writeHead/end, nothing more.
function fakeResponse() {
  return {
    statusCode: null, headers: null, body: '',
    writeHead(code, headers) { this.statusCode = code; this.headers = headers },
    end(chunk) { this.body = chunk === undefined ? '' : String(chunk) }
  };
}

function call(url, authorization) {
  const handle = createHttpHandler({ manager, syncInfo, token: () => TOKEN });
  const res = fakeResponse();
  handle({ url, headers: authorization === undefined ? {} : { authorization } }, res);
  return res;
}

const parse = res => JSON.parse(res.body);

// ---- authentication ----------------------------------------------------------------------------
test('/status without a token is refused', () => {
  const res = call('/status');
  assert.equal(res.statusCode, 401);
  assert.equal(parse(res).ok, false);
});

test('/status with a wrong token of the same length is refused', () => {
  // Same length as the real token, so only the comparison itself can reject it.
  const res = call('/status', `Bearer ${'x'.repeat(TOKEN.length)}`);
  assert.equal(res.statusCode, 401);
});

test('/status with a wrong token of a different length is refused', () => {
  // The length check must reject before timingSafeEqual, which throws on unequal buffers.
  for (const wrong of ['Bearer short', `Bearer ${'m'.repeat(TOKEN.length - 1)}`, `Bearer ${'m'.repeat(TOKEN.length + 1)}`]) {
    assert.equal(call('/status', wrong).statusCode, 401, wrong.slice(0, 20));
  }
});

test('/status with a token that is a prefix of the real one is refused', () => {
  // Guards against a comparison that stops at the shorter string.
  assert.equal(call('/status', `Bearer ${TOKEN.slice(0, 32)}`).statusCode, 401);
});

test('/status with the correct token succeeds', () => {
  const res = call('/status', `Bearer ${TOKEN}`);
  assert.equal(res.statusCode, 200);
  assert.equal(parse(res).ok, true);
});

test('the raw token is accepted with or without the Bearer prefix', () => {
  assert.equal(call('/status', TOKEN).statusCode, 200);
});

test('an unset or too-short expected token locks the endpoint rather than opening it', () => {
  // A half-configured service must not be easier to read than a locked one — including the case
  // where the supplied token equals the (empty or weak) expected one.
  for (const weak of ['', 'short', 'a'.repeat(31)]) {
    const handle = createHttpHandler({ manager, syncInfo, token: () => weak });
    const res = fakeResponse();
    handle({ url: '/status', headers: { authorization: `Bearer ${weak}` } }, res);
    assert.equal(res.statusCode, 401, `token av langd ${weak.length} slapp igenom`);
  }
});

// ---- the health check stays open ---------------------------------------------------------------
test('/health and /health/live answer 200 without any token', () => {
  // Railway health-checks without credentials; locking these would have the platform restart a
  // healthy fleet forever.
  for (const url of ['/health', '/health/live']) {
    const res = call(url);
    assert.equal(res.statusCode, 200, url);
    assert.deepEqual(parse(res), { ok: true, status: 'live' });
  }
});

test('the open health endpoints reveal nothing beyond liveness', () => {
  const body = call('/health').body;
  for (const secret of [WORKSPACE, QUEUED_WORKSPACE, USERNAME, QUEUED_USERNAME]) {
    assert.ok(!body.includes(secret), `/health lackte ${secret}`);
  }
});

test('an unknown path is 404, not an accidental status leak', () => {
  assert.equal(call('/', `Bearer ${TOKEN}`).statusCode, 404);
  assert.equal(call('/status/../status').statusCode, 404);
});

// ---- the body carries no identity --------------------------------------------------------------
test('an authenticated /status contains no usernames and no workspace ids', () => {
  const res = call('/status', `Bearer ${TOKEN}`);
  const body = res.body;
  for (const identity of [WORKSPACE, QUEUED_WORKSPACE, USERNAME, QUEUED_USERNAME, 'another']) {
    assert.ok(!body.includes(identity), `/status lackte ${identity}`);
  }
  // Even authenticated, the two identity-carrying arrays must not be present at all.
  const payload = parse(res);
  assert.equal(payload.bridges, undefined, 'bridges[] ska inte finnas i svaret');
  assert.equal(payload.waiting, undefined, 'waiting[] ska inte finnas i svaret');
});

test('/status returns exactly the agreed aggregate fields', () => {
  // Pinned as an exact set: a field added to stats() later cannot quietly widen this response.
  const payload = parse(call('/status', `Bearer ${TOKEN}`));
  assert.deepEqual(Object.keys(payload).sort(), [
    'activeBridges', 'at', 'atCapacity', 'lastEventTime', 'lastSyncAt', 'lastSyncError',
    'maxBridges', 'ok', 'restarts', 'syncIntervalMs', 'waitingCount'
  ]);
});

test('the aggregates report the real numbers', () => {
  // Stripping identity must not cost observability — the counts are the point of the endpoint.
  const payload = parse(call('/status', `Bearer ${TOKEN}`));
  assert.equal(payload.activeBridges, 2);
  assert.equal(payload.maxBridges, 5);
  assert.equal(payload.atCapacity, false);
  assert.equal(payload.waitingCount, 1);
  assert.equal(payload.restarts, 3);
  assert.equal(payload.lastEventTime, 1754160000000);
  assert.equal(payload.lastSyncAt, 1754160001000);
  assert.equal(payload.lastSyncError, null);
});

test('a sync failure is still reported, so a wedged manager is distinguishable from a healthy one', () => {
  const handle = createHttpHandler({
    manager,
    syncInfo: () => ({ lastSyncAt: null, lastSyncError: 'connect ECONNREFUSED', syncIntervalMs: 15000 }),
    token: () => TOKEN
  });
  const res = fakeResponse();
  handle({ url: '/status', headers: { authorization: `Bearer ${TOKEN}` } }, res);
  assert.equal(parse(res).lastSyncError, 'connect ECONNREFUSED');
  assert.equal(parse(res).lastSyncAt, null);
});

test('responses are not cacheable', () => {
  // A shared cache holding an authenticated body would hand it to the next unauthenticated caller.
  assert.equal(call('/status', `Bearer ${TOKEN}`).headers['cache-control'], 'no-store');
});
