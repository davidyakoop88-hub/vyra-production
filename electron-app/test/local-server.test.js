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
