// Runs one tiktok-bridge child process per workspace that has an active TikTok connection
// configured (see server/schema.sql's tiktok_connections table), so a single host can operate a
// fleet of bridges instead of someone manually running `node bridge.js <user>` once per account.
//
// Usage:
//   cd tiktok-bridge
//   npm install
//   DATABASE_URL=postgresql://... node connection-manager.js     (or: npm run manager)
//
// Each bridge runs as its own forked process (child_process.fork), so one bridge crashing can
// never take down the manager or any other bridge — Node process isolation, not just a try/catch.
//
// Capacity: every bridge is a full Node process (~40-60 MB resident), and this manager used to
// start one for every active row with no ceiling at all. On a memory-capped host that does not
// degrade gracefully — the container is OOM-killed, taking the API, login and every widget with it.
// MAX_BRIDGES turns that into a controlled refusal: the fleet stops at the limit, already-running
// streamers are untouched, and the workspaces that did not fit are reported as waiting and started
// automatically as soon as a slot frees. Set it from MEASURED memory use, not a guess — start low
// (the default 5) and raise it once a load test shows the real per-bridge cost with headroom left
// for the manager process itself.
'use strict';

const { fork } = require('child_process');
const path = require('path');

const START_STAGGER_MS = 500; // wait between each bridge start — avoids TikTok rate-limiting a burst of connects
const DEFAULT_MAX_BRIDGES = 5;

// Restart backoff. A bridge whose connection is permanently broken (banned account, deleted user,
// a stream that never goes live) exits immediately, and syncOnce() would otherwise start it again
// on the very next tick — forever, burning CPU and hammering TikTok. Each consecutive failure
// doubles the wait; a bridge that stays up past STABLE_MS is considered healthy and its counter
// resets, so an ordinary reconnect never accumulates penalty.
const BACKOFF_BASE_MS = 5000;
const BACKOFF_MAX_MS = 5 * 60 * 1000;
const STABLE_MS = 60 * 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function defaultSpawnBridge(workspaceId, username) {
  return fork(path.join(__dirname, 'bridge.js'), [username], {
    env: { ...process.env, VYRA_WORKSPACE_ID: workspaceId }
  });
}

// Two different workspaces can each configure the SAME TikTok account. Keying only on workspaceId
// (as this file used to) let both spawn a bridge, so one live stream got two independent readers:
// duplicate events downstream and two connections TikTok can rate-limit or block as abuse.
function accountKey(username) {
  return String(username || '').trim().toLowerCase().replace(/^@+/, '');
}

// pool: an object with an async query(sql, params) method — matches `pg`'s Pool interface (and
// server/db.js's own `pool` shape), injectable so tests can fake Postgres without a real
// connection. Only required if startAll()/syncOnce() is actually called.
// spawnBridge: (workspaceId, username) => a child-process-like EventEmitter exposing
// on('message'|'exit'|'error', ...) and kill(signal) — defaults to forking the real bridge.js,
// injectable so tests never spawn a real process or touch real TikTok.
// maxBridges: hard ceiling on concurrently running bridges. nowFn/sleepFn are injectable so the
// backoff can be tested without real time passing.
function createConnectionManager({
  pool,
  spawnBridge = defaultSpawnBridge,
  staggerMs = START_STAGGER_MS,
  sleepFn = sleep,
  maxBridges = Number(process.env.MAX_BRIDGES || DEFAULT_MAX_BRIDGES),
  nowFn = Date.now
} = {}) {
  const limit = Math.max(1, Number(maxBridges) || DEFAULT_MAX_BRIDGES);
  const bridges = new Map();  // workspaceId -> { child, username, isConnected, reconnectAttempts, lastEventTime, startedAt }
  const waiting = new Map();  // workspaceId -> { username, reason, since } — wanted but not running
  const backoff = new Map();  // workspaceId -> { failures, notBefore } — survives the bridge entry itself
  let restarts = 0;           // total bridge exits that were NOT a deliberate stop

  function markWaiting(workspaceId, username, reason) {
    const existing = waiting.get(workspaceId);
    // Keep the original `since` so "how long has this been queued" stays meaningful across ticks.
    waiting.set(workspaceId, { username, reason, since: existing?.since ?? nowFn() });
  }

  function activeAccount(username, exceptWorkspaceId) {
    const key = accountKey(username);
    for (const [workspaceId, entry] of bridges) {
      if (workspaceId !== exceptWorkspaceId && accountKey(entry.username) === key) return workspaceId;
    }
    return null;
  }

  // Returns the entry on success, or null when the bridge was refused. Refusal is a normal outcome,
  // not an error: the caller keeps going and the workspace is recorded in waiting so stats() can
  // report it and the next sync can pick it up once the blocker clears.
  function startBridge(workspaceId, username) {
    const existing = bridges.get(workspaceId);
    if (existing) return existing;

    const duplicateOf = activeAccount(username, workspaceId);
    if (duplicateOf) {
      markWaiting(workspaceId, username, 'duplicate-account');
      console.warn(`[connection-manager] @${username} körs redan för workspace ${duplicateOf} — startar inte en andra bridge för ${workspaceId}.`);
      return null;
    }

    const wait = backoff.get(workspaceId);
    if (wait && nowFn() < wait.notBefore) {
      markWaiting(workspaceId, username, 'backoff');
      return null;
    }

    if (bridges.size >= limit) {
      markWaiting(workspaceId, username, 'at-capacity');
      console.warn(`[connection-manager] Kapaciteten är full (${bridges.size}/${limit}) — workspace ${workspaceId} (@${username}) väntar på en ledig plats.`);
      return null;
    }

    const entry = {
      child: null, username, isConnected: false, reconnectAttempts: 0,
      lastEventTime: null, startedAt: nowFn(), stopping: false
    };
    bridges.set(workspaceId, entry);

    let child;
    try {
      child = spawnBridge(workspaceId, username);
    } catch (err) {
      // A bridge that fails to even spawn must not affect any other bridge or the caller
      // (syncOnce() keeps going through the rest of its list). It counts as a failure for backoff
      // purposes, otherwise a permanently unspawnable bridge retries every tick forever.
      console.error(`[connection-manager] Kunde inte starta bridge för workspace ${workspaceId} (@${username}):`, err.message);
      bridges.delete(workspaceId);
      registerFailure(workspaceId, username);
      return null;
    }
    entry.child = child;
    waiting.delete(workspaceId);

    child.on('message', msg => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'connected') {
        entry.isConnected = true;
        entry.reconnectAttempts = 0;
      } else if (msg.type === 'reconnecting') {
        entry.isConnected = false;
        entry.reconnectAttempts = Number(msg.attempt) || entry.reconnectAttempts + 1;
      } else if (msg.type === 'event') {
        entry.lastEventTime = Number(msg.at) || nowFn();
      }
    });

    child.on('error', err => {
      console.error(`[connection-manager] Bridge-fel för workspace ${workspaceId} (@${username}):`, err.message);
    });

    // A bridge exiting (crash, or its own graceful shutdown) must never affect other bridges — just
    // drop it from the map so its capacity slot is freed immediately. A deliberate stop carries no
    // penalty; anything else is a failure and earns backoff before syncOnce() tries again.
    child.on('exit', () => {
      if (bridges.get(workspaceId) !== entry) return;
      bridges.delete(workspaceId);
      if (entry.stopping) return;
      restarts++;
      const ranFor = nowFn() - entry.startedAt;
      if (ranFor >= STABLE_MS) backoff.delete(workspaceId);   // it was healthy; this is a fresh incident
      registerFailure(workspaceId, entry.username);
    });

    return entry;
  }

  function registerFailure(workspaceId, username) {
    const prev = backoff.get(workspaceId);
    const failures = (prev?.failures || 0) + 1;
    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * Math.pow(2, failures - 1));
    backoff.set(workspaceId, { failures, notBefore: nowFn() + delay });
    markWaiting(workspaceId, username, 'backoff');
    console.warn(`[connection-manager] Bridge för workspace ${workspaceId} (@${username}) avslutades — försök ${failures}, väntar ${Math.round(delay / 1000)} s.`);
  }

  function stopBridge(workspaceId) {
    const entry = bridges.get(workspaceId);
    waiting.delete(workspaceId);
    if (!entry) return false;
    entry.stopping = true;   // a stop we asked for is not a crash — no backoff, no restart count
    try { entry.child?.kill?.('SIGTERM'); } catch {}
    bridges.delete(workspaceId);
    backoff.delete(workspaceId);
    return true;
  }

  function stopAll() {
    for (const workspaceId of [...bridges.keys()]) stopBridge(workspaceId);
  }

  // Fetches every workspace with an active TikTok connection from Postgres and reconciles the
  // running fleet against it in both directions: starts one for every active row that has no bridge
  // (or whose username changed), and stops bridges whose row went inactive or was renamed.
  // startAll() only ever ran at boot, so a connection registered afterwards was never picked up —
  // this is what makes the connection API actually take effect.
  //
  // Starts are staggered by `staggerMs` so a fleet restart doesn't fire a burst of connects at
  // TikTok all at once, and one workspace failing or being refused never stops the rest.
  // ORDER BY updated_at: when the fleet is at capacity the rows that do not fit are refused, and
  // without a deterministic order Postgres could hand back a different sequence every tick — so
  // which workspace got the freed slot would be luck, and an unlucky one could wait indefinitely
  // while later arrivals jumped ahead. Oldest connection first makes the queue fair and repeatable.
  async function syncOnce() {
    if (!pool) throw new Error('connection-manager: pool krävs för syncOnce()');
    const { rows } = await pool.query('SELECT workspace_id, tiktok_username FROM tiktok_connections WHERE active = true ORDER BY updated_at ASC, workspace_id ASC');
    const wanted = new Map(rows.map(r => [r.workspace_id, r.tiktok_username]));
    let started = 0, stopped = 0, refused = 0;

    for (const [workspaceId, entry] of [...bridges.entries()]) {
      const want = wanted.get(workspaceId);
      if (want === undefined || want !== entry.username) {
        stopBridge(workspaceId);
        stopped++;
      }
    }
    // A workspace that is no longer active must not linger in the waiting list either, or stats()
    // would keep advertising demand that no longer exists.
    for (const workspaceId of [...waiting.keys()]) {
      if (!wanted.has(workspaceId)) waiting.delete(workspaceId);
    }

    for (const [workspaceId, username] of wanted) {
      if (bridges.has(workspaceId)) continue;
      let entry = null;
      try {
        entry = startBridge(workspaceId, username);
      } catch (err) {
        console.error(`[connection-manager] Kunde inte starta bridge för workspace ${workspaceId}:`, err.message);
      }
      if (entry) {
        started++;
        await sleepFn(staggerMs);   // only pace real spawns; a refusal costs nothing
      } else {
        refused++;
      }
    }
    return { started, stopped, refused, running: bridges.size, waiting: waiting.size };
  }

  async function startAll() {
    if (!pool) throw new Error('connection-manager: pool krävs för startAll()');
    const { rows } = await pool.query('SELECT workspace_id, tiktok_username FROM tiktok_connections WHERE active = true ORDER BY updated_at ASC, workspace_id ASC');
    for (const row of rows) {
      let entry = null;
      try {
        entry = startBridge(row.workspace_id, row.tiktok_username);
      } catch (err) {
        console.error(`[connection-manager] Kunde inte starta bridge för workspace ${row.workspace_id}:`, err.message);
      }
      if (entry) await sleepFn(staggerMs);
    }
    return bridges.size;
  }

  function stats() {
    const list = [...bridges.entries()].map(([workspaceId, entry]) => ({
      workspaceId,
      username: entry.username,
      isConnected: entry.isConnected,
      reconnectAttempts: entry.reconnectAttempts,
      lastEventTime: entry.lastEventTime
    }));
    const lastEventTime = list.reduce((latest, b) => (b.lastEventTime && b.lastEventTime > latest ? b.lastEventTime : latest), 0) || null;
    return {
      totalBridges: bridges.size,
      maxBridges: limit,
      atCapacity: bridges.size >= limit,
      waitingCount: waiting.size,
      restarts,
      lastEventTime,
      bridges: list,
      waiting: [...waiting.entries()].map(([workspaceId, w]) => ({
        workspaceId, username: w.username, reason: w.reason, since: w.since
      }))
    };
  }

  return { startAll, syncOnce, startBridge, stopBridge, stopAll, stats };
}

module.exports = { createConnectionManager, accountKey, DEFAULT_MAX_BRIDGES };

// ---- Fleet runtime — only runs when executed directly (`node connection-manager.js`), never on
// require() (e.g. from tests), matching bridge.js's/server/index.js's same require.main guard.
// This is what satisfies "if the server restarts, all bridges restart automatically" — the sync
// loop runs on process startup, so a deploy/crash/restart of the manager itself always
// re-establishes every active workspace's bridge from Postgres, no manual step required. ----
if (require.main === module) {
  const http = require('http');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const manager = createConnectionManager({ pool });

  // Poll rather than start-once: with an empty table startAll() left nothing holding the event
  // loop open, so the process exited immediately and a connection registered later was never seen.
  // The interval keeps the manager alive AND makes connect/disconnect in Studio take effect within
  // one cycle. A failed poll is logged and retried on the next tick instead of killing the fleet.
  const SYNC_MS = Number(process.env.SYNC_INTERVAL_MS || 15000);
  let syncing = false;
  let lastSyncAt = null, lastSyncError = null;

  async function tick() {
    if (syncing) return;
    syncing = true;
    try {
      const { started, stopped, refused, running, waiting } = await manager.syncOnce();
      lastSyncAt = Date.now();
      lastSyncError = null;
      if (started || stopped || refused) {
        console.log(`[connection-manager] +${started} / -${stopped} bridge(r), ${refused} nekad(e), ${running} aktiva, ${waiting} väntar.`);
      }
    } catch (err) {
      lastSyncError = err.message;
      console.error('[connection-manager] Kunde inte hämta aktiva workspaces från Postgres:', err.message);
    } finally {
      syncing = false;
    }
  }

  // Railway health-checks an HTTP endpoint and will restart — or refuse to route to — a service
  // that has none. The manager was a bare polling loop with no listener, so a configured health
  // check could kill the very process that runs the fleet. This also makes capacity observable:
  // /status is what tells you whether MAX_BRIDGES is set too low before users complain.
  //
  // Deliberately reports 200 while Postgres is unreachable: the manager itself is alive and the
  // bridges it already started keep streaming, so failing the check here would have Railway restart
  // a healthy fleet over a transient database blip. The database state is in the body instead.
  const PORT = Number(process.env.PORT || 4180);
  const health = http.createServer((req, res) => {
    const url = String(req.url || '').split('?')[0];
    if (url === '/health' || url === '/health/live') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, status: 'live' }));
    }
    if (url === '/status') {
      const s = manager.stats();
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true,
        activeBridges: s.totalBridges,
        maxBridges: s.maxBridges,
        atCapacity: s.atCapacity,
        waitingCount: s.waitingCount,
        waiting: s.waiting,
        restarts: s.restarts,
        lastEventTime: s.lastEventTime,
        lastSyncAt,
        lastSyncError,
        syncIntervalMs: SYNC_MS,
        bridges: s.bridges,
        at: Date.now()
      }));
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Hittades inte' }));
  });
  health.listen(PORT, '0.0.0.0', () => console.log(`[connection-manager] Health/status lyssnar på :${PORT}`));

  console.log(`[connection-manager] Startar. MAX_BRIDGES=${manager.stats().maxBridges}. Synkar tiktok_connections var ${SYNC_MS} ms.`);
  tick();
  const timer = setInterval(tick, SYNC_MS);

  async function shutdown(signal) {
    console.log(`[connection-manager] Stänger ner (${signal})...`);
    clearInterval(timer);
    manager.stopAll();
    health.close();
    await pool.end().catch(() => {});
    process.exit(0);
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
