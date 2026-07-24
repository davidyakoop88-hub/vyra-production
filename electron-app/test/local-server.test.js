'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { startLocalServer } = require('../local-server');

const ROOT = path.resolve(__dirname, '../..');
let server;
let origin;

test.before(async () => {
  server = await startLocalServer(ROOT, 4197);
  origin = 'http://127.0.0.1:4197';
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('serves every primary page and repaired asset', async () => {
  for (const resource of [
    '/',
    '/studio.html',
    '/spotify-callback.html',
    '/spotify-client.js',
    '/overlay.html',
    '/gifts-manifest.js',
    '/assets/gifts/gift-placeholder.svg',
    '/assets/images/test-profile.svg'
  ]) {
    const response = await fetch(origin + resource);
    assert.equal(response.status, 200, resource);
    assert.ok(Number(response.headers.get('content-length')) > 0, resource);
  }
});

test('rejects missing assets and path traversal', async () => {
  assert.equal((await fetch(origin + '/missing-image.png')).status, 404);
  assert.equal((await fetch(origin + '/..%2Fpackage.json')).status, 404);
});

test('accepts a test LIVE event and returns it', async () => {
  const posted = await fetch(origin + '/api/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ type: 'gift', username: 'TestUser', giftName: 'Rose', count: 1 })
  });
  assert.equal(posted.status, 200);
  const created = await posted.json();
  const events = await (await fetch(`${origin}/api/events?after=0`)).json();
  assert.equal(created.ok, true);
  assert.equal(events.events.some((event) => event.username === 'TestUser'), true);
});

test('does not pretend to connect when the real TikTok connector is unavailable', async () => {
  const response = await fetch(origin + '/api/connect', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ username: 'not-live' })
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  const status = await (await fetch(origin + '/api/status')).json();
  assert.equal(status.connection.connected, false);
  assert.equal(status.connection.mode, 'live');
});

test('marks TikTok connected only after the real connector succeeds', async () => {
  let connectedUsername = '';
  const liveServer = await startLocalServer(ROOT, 4198, {
    createLiveConnector({ onStatus, onEvent }) {
      return {
        async connect(username) {
          connectedUsername = username;
          onStatus({ connected: true, username, mode: 'live', state: 'live', roomId: 'room-1' });
          onEvent({ type: 'gift', username: 'RealViewer', giftName: 'Rose', count: 1, source: 'tiktok-live' });
        },
        async disconnect() {
          onStatus({ connected: false, username: '', mode: 'live', state: 'disconnected', roomId: '' });
        }
      };
    }
  });
  try {
    const liveOrigin = 'http://127.0.0.1:4198';
    const response = await fetch(liveOrigin + '/api/connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: liveOrigin },
      body: JSON.stringify({ username: 'real_creator' })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.connection.connected, true);
    assert.equal(body.connection.mode, 'live');
    assert.equal(connectedUsername, 'real_creator');
    const events = await (await fetch(liveOrigin + '/api/events?after=0')).json();
    assert.equal(events.events.some(event => event.username === 'RealViewer' && event.source === 'tiktok-live'), true);
  } finally {
    await new Promise(resolve => liveServer.close(resolve));
  }
});

test('Spotify uses real PKCE authentication without a client secret or demo mode', async () => {
  const client = await (await fetch(origin + '/spotify-client.js')).text();
  const extras = await (await fetch(origin + '/extras.js')).text();
  assert.match(client, /code_challenge_method:\s*'S256'/);
  assert.match(client, /grant_type:\s*'refresh_token'/);
  assert.match(client, /user-read-currently-playing/);
  assert.doesNotMatch(client, /client_secret/i);
  assert.doesNotMatch(extras, /Ansluten i demoläge/);
});
