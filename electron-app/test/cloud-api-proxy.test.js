'use strict';
// Desktopappens Studio kunde inte prata med moln-API:et — och gav 405 pa varje forsok.
//
// Efter behorighetskontrollen navigerar appen till http://127.0.0.1:4173/studio.html. Men
// studio.html laddar auth-client.js och entitlement-gate.js ovillkorligt, fore desktop-profile.js.
// Pa localhost finns ingen session, sa auth-stacken visar en inloggningsruta, och den postar till
// 127.0.0.1/api/auth/login. Den lokala servern har ingen sadan rutt, sa allt icke-GET som inte
// matchar foll igenom till catch-allen och svarade 405 "Method not allowed".
//
// En rak proxy racker inte: sessionskakan vyra_session ar satt for vyralive.app och skickas ALDRIG
// till 127.0.0.1. Darfor bryggas den — huvudprocessen laser kakan for molnorigin och ger vardet
// till den lokala servern, som faster det pa proxade anrop. Kakan nar aldrig sidans JS.
//
// Samma mönster som TTS-proxyn pa local-server.js:170 redan anvander.
//
// ROTT NU: omatchade /api/-anrop proxas inte alls.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { startLocalServer } = require('../local-server');

const ROOT = path.join(__dirname, '..', '..');
const CLOUD = 'https://vyra-cloud.invalid';
const SESSION = 'vyra_session=hemligt-token';

// Fangar vad servern skickade uppat, sa vi kan pasta nagot om kakan.
function stubCloud(t, handler) {
  const realFetch = global.fetch;
  const seen = [];
  t.after(() => { global.fetch = realFetch; });
  global.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    if (target.origin !== CLOUD) return realFetch(url, init);
    seen.push({ url: target, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    return handler(target, init);
  };
  return seen;
}

async function withServer(t, port, options, run) {
  const server = await startLocalServer(ROOT, port, options);
  try { await run(`http://127.0.0.1:${port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('an unmatched GET /api/ call is proxied to the cloud with the bridged session', async (t) => {
  const seen = stubCloud(t, () => new Response(JSON.stringify({ ok: true, user: { email: 'a@b.c' } }),
    { status: 200, headers: { 'content-type': 'application/json' } }));

  await withServer(t, 4220, { cloudOrigin: CLOUD, cloudSession: () => SESSION }, async (origin) => {
    const res = await fetch(origin + '/api/auth/me');
    assert.equal(res.status, 200, 'anropet nadde aldrig molnet');
    assert.deepEqual(await res.json(), { ok: true, user: { email: 'a@b.c' } });
  });

  assert.equal(seen.length, 1, 'exakt ett uppstromsanrop');
  assert.equal(seen[0].url.pathname, '/api/auth/me');
  assert.equal(seen[0].headers.cookie, SESSION, 'sessionen bryggades inte — molnet hade svarat 401');
});

test('an unmatched POST is proxied instead of answering 405', async (t) => {
  const seen = stubCloud(t, () => new Response(JSON.stringify({ ok: true }),
    { status: 200, headers: { 'content-type': 'application/json' } }));

  await withServer(t, 4221, { cloudOrigin: CLOUD, cloudSession: () => SESSION }, async (origin) => {
    const res = await fetch(origin + '/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":"a@b.c"}'
    });
    assert.notEqual(res.status, 405, 'det ar precis felet anvandaren ser');
    assert.equal(res.status, 200);
  });
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[0].body, '{"email":"a@b.c"}', 'kroppen kom inte fram');
});

test('the CSRF header is forwarded, since the cloud requires it for writes', async (t) => {
  const seen = stubCloud(t, () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  await withServer(t, 4222, { cloudOrigin: CLOUD, cloudSession: () => SESSION }, async (origin) => {
    await fetch(origin + '/api/workspaces/w1/overlays', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-vyra-csrf': 'csrf-token' }, body: '{}'
    });
  });
  assert.equal(seen[0].headers['x-vyra-csrf'], 'csrf-token');
});

test('upstream status and body are passed through unchanged', async (t) => {
  stubCloud(t, () => new Response(JSON.stringify({ ok: false, error: 'Inte inloggad' }),
    { status: 401, headers: { 'content-type': 'application/json' } }));
  await withServer(t, 4223, { cloudOrigin: CLOUD, cloudSession: () => SESSION }, async (origin) => {
    const res = await fetch(origin + '/api/auth/me');
    assert.equal(res.status, 401, 'ett 401 far inte maskeras som nagot annat');
    assert.deepEqual(await res.json(), { ok: false, error: 'Inte inloggad' });
  });
});

// ---- vad proxyn INTE far gora ---------------------------------------------------------------------
test('local-only device routes are still answered locally, never proxied', async (t) => {
  const seen = stubCloud(t, () => new Response('{}', { status: 200 }));
  await withServer(t, 4224, { cloudOrigin: CLOUD, cloudSession: () => SESSION }, async (origin) => {
    const res = await fetch(origin + '/api/status');
    assert.equal(res.status, 200);
  });
  assert.deepEqual(seen, [], '/api/status ar TikTok-anslutningen i den har processen — den far aldrig ga till molnet');
});

test('without a bridged session nothing is invented — the call still goes, unauthenticated', async (t) => {
  const seen = stubCloud(t, () => new Response('{"ok":false}', { status: 401, headers: { 'content-type': 'application/json' } }));
  await withServer(t, 4225, { cloudOrigin: CLOUD }, async (origin) => {
    const res = await fetch(origin + '/api/auth/me');
    assert.equal(res.status, 401);
  });
  assert.equal(seen[0].headers.cookie, '', 'en tom kaka, aldrig en pahittad');
});

test('without a cloudOrigin the old 405 stands — there is nowhere to proxy to', async (t) => {
  await withServer(t, 4226, {}, async (origin) => {
    const res = await fetch(origin + '/api/auth/login', { method: 'POST', body: '{}' });
    assert.equal(res.status, 405);
  });
});

test('the session is attached only to the cloud origin', async (t) => {
  // Proxyn bygger sin URL av cloudOrigin + path. En path som forsoker byta vard far inte ta med
  // kakan nagon annanstans.
  const seen = stubCloud(t, () => new Response('{}', { status: 200 }));
  await withServer(t, 4227, { cloudOrigin: CLOUD, cloudSession: () => SESSION }, async (origin) => {
    await fetch(origin + '/api/auth/me');
  });
  assert.equal(seen[0].url.origin, CLOUD, 'anropet gick nagon annanstans an till molnet');
});
