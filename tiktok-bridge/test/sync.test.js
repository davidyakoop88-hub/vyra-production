'use strict';
// syncOnce() is what makes the connection API take effect: startAll() only ran at boot, so a
// workspace that connected afterwards was never picked up, and with an empty table the process
// exited before anyone could connect at all. These tests pin both directions of the reconcile.
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createConnectionManager } = require('../connection-manager');

function harness(initialRows = []) {
  let rows = initialRows;
  const spawned = [], killed = [];
  const pool = { async query() { return { rows }; } };
  const spawnBridge = (workspaceId, username) => {
    spawned.push({ workspaceId, username });
    const child = new EventEmitter();
    child.kill = () => killed.push({ workspaceId, username });
    return child;
  };
  const manager = createConnectionManager({ pool, spawnBridge, staggerMs: 0, sleepFn: async () => {} });
  return { manager, spawned, killed, setRows: next => { rows = next; } };
}

test('starts a bridge for a connection registered after boot', async () => {
  const h = harness([]);

  let result = await h.manager.syncOnce();
  assert.deepEqual(result, { started: 0, stopped: 0, refused: 0, running: 0, waiting: 0 }, 'empty table starts nothing');

  h.setRows([{ workspace_id: 'ws-1', tiktok_username: 'piiikabom' }]);
  result = await h.manager.syncOnce();

  assert.deepEqual(result, { started: 1, stopped: 0, refused: 0, running: 1, waiting: 0 });
  assert.deepEqual(h.spawned, [{ workspaceId: 'ws-1', username: 'piiikabom' }]);
});

test('stops the bridge when the row goes inactive', async () => {
  const h = harness([{ workspace_id: 'ws-1', tiktok_username: 'piiikabom' }]);
  await h.manager.syncOnce();

  h.setRows([]);                        // DELETE sets active=false, so it drops out of the query
  const result = await h.manager.syncOnce();

  assert.deepEqual(result, { started: 0, stopped: 1, refused: 0, running: 0, waiting: 0 });
  assert.deepEqual(h.killed, [{ workspaceId: 'ws-1', username: 'piiikabom' }]);
});

test('restarts the bridge when the username changes', async () => {
  const h = harness([{ workspace_id: 'ws-1', tiktok_username: 'oldname' }]);
  await h.manager.syncOnce();

  h.setRows([{ workspace_id: 'ws-1', tiktok_username: 'newname' }]);
  const result = await h.manager.syncOnce();

  assert.deepEqual(result, { started: 1, stopped: 1, refused: 0, running: 1, waiting: 0 });
  assert.deepEqual(h.killed, [{ workspaceId: 'ws-1', username: 'oldname' }]);
  assert.deepEqual(h.spawned.at(-1), { workspaceId: 'ws-1', username: 'newname' });
});

test('is idempotent — an unchanged table spawns nothing new', async () => {
  const rows = [{ workspace_id: 'ws-1', tiktok_username: 'piiikabom' }];
  const h = harness(rows);
  await h.manager.syncOnce();
  const result = await h.manager.syncOnce();

  assert.deepEqual(result, { started: 0, stopped: 0, refused: 0, running: 1, waiting: 0 });
  assert.equal(h.spawned.length, 1, 'must not respawn a bridge that is already running');
  assert.deepEqual(h.killed, []);
});

test('handles several workspaces at once', async () => {
  const h = harness([
    { workspace_id: 'ws-1', tiktok_username: 'alice' },
    { workspace_id: 'ws-2', tiktok_username: 'bob' },
  ]);
  await h.manager.syncOnce();

  h.setRows([
    { workspace_id: 'ws-2', tiktok_username: 'bob' },     // unchanged
    { workspace_id: 'ws-3', tiktok_username: 'carol' },   // new
  ]);                                                     // ws-1 disconnected
  const result = await h.manager.syncOnce();

  assert.deepEqual(result, { started: 1, stopped: 1, refused: 0, running: 2, waiting: 0 });
  assert.deepEqual(h.killed, [{ workspaceId: 'ws-1', username: 'alice' }]);
  assert.deepEqual(h.spawned.at(-1), { workspaceId: 'ws-3', username: 'carol' });
});
