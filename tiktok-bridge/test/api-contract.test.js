'use strict';
// The contract between the connection API and this manager is implicit — they share only a
// table, and they live in different packages. This test pins it: a row written the way
// PUT /api/workspaces/:id/tiktok-connection writes it must produce a bridge with the right argv.
// Fake pool and fake spawn, so no Postgres and no TikTok are involved.
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createConnectionManager } = require('../connection-manager');
const { normalizeTikTokUsername } = require('../../server/security');

function harness(rows) {
  const spawned = [];
  const pool = { async query() { return { rows }; } };
  const spawnBridge = (workspaceId, username) => {
    spawned.push({ workspaceId, username });
    const child = new EventEmitter();
    child.kill = () => {};
    return child;
  };
  const manager = createConnectionManager({ pool, spawnBridge, staggerMs: 0, sleepFn: async () => {} });
  return { manager, spawned };
}

test('a username typed as @Piiikabom reaches the bridge as piiikabom', async () => {
  const stored = normalizeTikTokUsername('@Piiikabom');
  assert.equal(stored, 'piiikabom', 'API normalisation changed — the manager contract assumes lowercase, @-free');

  const { manager, spawned } = harness([{ workspace_id: 'ws-abc', tiktok_username: stored }]);
  await manager.startAll();

  assert.deepEqual(spawned, [{ workspaceId: 'ws-abc', username: 'piiikabom' }]);
});

test('one bridge per active row, keyed by workspace', async () => {
  const { manager, spawned } = harness([
    { workspace_id: 'ws-1', tiktok_username: 'alice' },
    { workspace_id: 'ws-2', tiktok_username: 'bob' },
  ]);
  await manager.startAll();

  assert.equal(spawned.length, 2);
  assert.deepEqual(spawned.map(s => s.workspaceId).sort(), ['ws-1', 'ws-2']);
});

test('no active rows means no bridges, not a crash', async () => {
  const { manager, spawned } = harness([]);
  await manager.startAll();
  assert.deepEqual(spawned, []);
});
