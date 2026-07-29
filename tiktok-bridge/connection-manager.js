// Runs one tiktok-bridge child process per workspace that has an active TikTok connection
// configured (see server/schema.sql's tiktok_connections table), so a single host can operate a
// fleet of bridges instead of someone manually running `node bridge.js <user>` once per account.
//
// Usage:
//   cd tiktok-bridge
//   npm install
//   DATABASE_URL=postgresql://... node connection-manager.js
//
// Each bridge runs as its own forked process (child_process.fork), so one bridge crashing can
// never take down the manager or any other bridge — Node process isolation, not just a try/catch.
'use strict';

const { fork } = require('child_process');
const path = require('path');

const START_STAGGER_MS = 500; // wait between each bridge start — avoids TikTok rate-limiting a burst of connects

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function defaultSpawnBridge(workspaceId, username) {
  return fork(path.join(__dirname, 'bridge.js'), [username], {
    env: { ...process.env, VYRA_WORKSPACE_ID: workspaceId }
  });
}

// pool: an object with an async query(sql, params) method — matches `pg`'s Pool interface (and
// server/db.js's own `pool` shape), injectable so tests can fake Postgres without a real
// connection. Only required if startAll() is actually called.
// spawnBridge: (workspaceId, username) => a child-process-like EventEmitter exposing
// on('message'|'exit'|'error', ...) and kill(signal) — defaults to forking the real bridge.js,
// injectable so tests never spawn a real process or touch real TikTok.
function createConnectionManager({ pool, spawnBridge = defaultSpawnBridge, staggerMs = START_STAGGER_MS, sleepFn = sleep } = {}) {
  const bridges = new Map(); // workspaceId -> { child, username, isConnected, reconnectAttempts, lastEventTime }

  // Starting the same workspace twice is a no-op (returns the existing entry) rather than
  // spawning a duplicate bridge for the same TikTok account.
  function startBridge(workspaceId, username) {
    const existing = bridges.get(workspaceId);
    if (existing) return existing;

    const entry = { child: null, username, isConnected: false, reconnectAttempts: 0, lastEventTime: null };
    bridges.set(workspaceId, entry);

    let child;
    try {
      child = spawnBridge(workspaceId, username);
    } catch (err) {
      // A bridge that fails to even spawn must not affect any other bridge or the caller
      // (startAll() keeps going through the rest of its list).
      console.error(`[connection-manager] Kunde inte starta bridge för workspace ${workspaceId} (@${username}):`, err.message);
      bridges.delete(workspaceId);
      return null;
    }
    entry.child = child;

    child.on('message', msg => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'connected') {
        entry.isConnected = true;
        entry.reconnectAttempts = 0;
      } else if (msg.type === 'reconnecting') {
        entry.isConnected = false;
        entry.reconnectAttempts = Number(msg.attempt) || entry.reconnectAttempts + 1;
      } else if (msg.type === 'event') {
        entry.lastEventTime = Number(msg.at) || Date.now();
      }
    });

    child.on('error', err => {
      console.error(`[connection-manager] Bridge-fel för workspace ${workspaceId} (@${username}):`, err.message);
    });

    // A bridge exiting (crash, or its own graceful shutdown) must never affect other bridges —
    // just drop it from the map. Whoever calls startAll() again later (e.g. on a timer, or the
    // next manager restart) will start it fresh.
    child.on('exit', () => {
      if (bridges.get(workspaceId) === entry) bridges.delete(workspaceId);
    });

    return entry;
  }

  function stopBridge(workspaceId) {
    const entry = bridges.get(workspaceId);
    if (!entry) return false;
    try { entry.child?.kill?.('SIGTERM'); } catch {}
    bridges.delete(workspaceId);
    return true;
  }

  function stopAll() {
    for (const workspaceId of [...bridges.keys()]) stopBridge(workspaceId);
  }

  // Fetches every workspace with an active TikTok connection from Postgres and starts a bridge
  // for each, staggered by `staggerMs` so a fleet restart doesn't fire a burst of connects at
  // TikTok all at once. One workspace failing to start never stops the rest from starting —
  // matches startBridge()'s own isolation.
  async function startAll() {
    if (!pool) throw new Error('connection-manager: pool krävs för startAll()');
    const { rows } = await pool.query('SELECT workspace_id, tiktok_username FROM tiktok_connections WHERE active = true');
    for (const row of rows) {
      try {
        startBridge(row.workspace_id, row.tiktok_username);
      } catch (err) {
        console.error(`[connection-manager] Kunde inte starta bridge för workspace ${row.workspace_id}:`, err.message);
      }
      await sleepFn(staggerMs);
    }
    return bridges.size;
  }

  function stats() {
    return {
      totalBridges: bridges.size,
      bridges: [...bridges.entries()].map(([workspaceId, entry]) => ({
        workspaceId,
        username: entry.username,
        isConnected: entry.isConnected,
        reconnectAttempts: entry.reconnectAttempts,
        lastEventTime: entry.lastEventTime
      }))
    };
  }

  return { startAll, startBridge, stopBridge, stopAll, stats };
}

module.exports = { createConnectionManager };

// ---- Fleet runtime — only runs when executed directly (`node connection-manager.js`), never on
// require() (e.g. from tests), matching bridge.js's/server/index.js's same require.main guard.
// This is what satisfies "if the server restarts, all bridges restart automatically" — startAll()
// runs unconditionally on process startup, so a deploy/crash/restart of the manager itself always
// re-establishes every active workspace's bridge from Postgres, no manual step required. ----
if (require.main === module) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const manager = createConnectionManager({ pool });

  manager.startAll()
    .then(count => console.log(`[connection-manager] ${count} bridge(r) startade från tiktok_connections.`))
    .catch(err => {
      console.error('[connection-manager] Kunde inte hämta aktiva workspaces från Postgres:', err.message);
      process.exitCode = 1;
    });

  async function shutdown(signal) {
    console.log(`[connection-manager] Stänger ner (${signal})...`);
    manager.stopAll();
    await pool.end().catch(() => {});
    process.exit(0);
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
