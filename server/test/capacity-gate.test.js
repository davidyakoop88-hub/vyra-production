'use strict';
// Covers the four pre-staging review checks on the TikTok capacity gate:
//   1. two concurrent attempts for one remaining slot must not both be admitted
//   2. the API must count the same thing the fleet manager counts
//   3. an already-active connection must survive a full fleet
//   4. (probeWrite is covered separately — it needs a real Postgres)
const test = require('node:test'), assert = require('node:assert/strict');
const { decideTikTokCapacity } = require('../capacity-gate');

// A fake transaction client backed by a shared in-memory table, so two "concurrent" gate calls can
// be interleaved deliberately. `lock` models pg_advisory_xact_lock: whoever holds it makes the
// other await, exactly as Postgres would.
function makeDatabase(rows = []) {
  const table = rows.slice();
  let held = null;                       // Promise held while a transaction owns the lock
  const order = [];

  function client(name) {
    let release = null;
    return {
      name,
      released: false,
      async query(sql, params = []) {
        order.push(`${name}:${sql.slice(0, 34).replace(/\s+/g, ' ').trim()}`);

        if (sql.includes('pg_advisory_xact_lock')) {
          while (held) await held;       // wait for the current holder
          held = new Promise(r => { release = r });
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('WHERE workspace_id=$1 AND active=true')) {
          const hit = table.filter(r => r.workspace_id === params[0] && r.active);
          return { rows: hit, rowCount: hit.length };
        }
        if (sql.includes('AND tiktok_username=$1 AND workspace_id<>$2')) {
          const hit = table.filter(r => r.active && r.tiktok_username === params[0] && r.workspace_id !== params[1]);
          return { rows: hit, rowCount: hit.length };
        }
        if (sql.includes('count(DISTINCT tiktok_username)')) {
          const n = new Set(table.filter(r => r.active).map(r => r.tiktok_username)).size;
          return { rows: [{ n }], rowCount: 1 };
        }
        if (sql.startsWith('INSERT INTO tiktok_connections')) {
          const [workspace_id, tiktok_username] = params;
          const existing = table.find(r => r.workspace_id === workspace_id);
          if (existing) { existing.tiktok_username = tiktok_username; existing.active = true; }
          else table.push({ workspace_id, tiktok_username, active: true });
          return { rows: [{ tiktok_username, active: true, updated_at: 'now' }], rowCount: 1 };
        }
        throw new Error('ovantad fraga: ' + sql);
      },
      commit() { this.released = true; if (release) { const r = release; release = null; held = null; r() } }
    };
  }
  return { table, client, order, activeAccounts: () => new Set(table.filter(r => r.active).map(r => r.tiktok_username)).size };
}

test('two workspaces racing for one remaining slot: exactly one wins', async () => {
  // fyra konton upptagna, MAX_BRIDGES=5 → en plats kvar
  const db = makeDatabase([
    { workspace_id: 'ws-a', tiktok_username: 'alice', active: true },
    { workspace_id: 'ws-b', tiktok_username: 'bob', active: true },
    { workspace_id: 'ws-c', tiktok_username: 'carol', active: true },
    { workspace_id: 'ws-d', tiktok_username: 'dave', active: true }
  ]);
  const c1 = db.client('t1'), c2 = db.client('t2');

  // Bada startar innan nagon hunnit skriva — precis det fonster som slapp igenom bada forut.
  const p1 = decideTikTokCapacity(c1, { workspaceId: 'ws-e', username: 'erik', limit: 5 });
  const p2 = decideTikTokCapacity(c2, { workspaceId: 'ws-f', username: 'frida', limit: 5 });

  const r1 = await p1;
  c1.commit();                          // forsta transaktionen slapper lasat
  const r2 = await p2;
  c2.commit();

  const admitted = [r1, r2].filter(r => r.connection).length;
  const refused = [r1, r2].filter(r => r.refused === 'capacity').length;
  assert.equal(admitted, 1, 'exakt en slapps in');
  assert.equal(refused, 1, 'den andra nekas kontrollerat');
  assert.equal(db.activeAccounts(), 5, 'flottan far aldrig ga over gransen');
});

test('the lock is taken before anything is counted', async () => {
  const db = makeDatabase();
  const c = db.client('t1');
  await decideTikTokCapacity(c, { workspaceId: 'ws-1', username: 'alice', limit: 5 });
  c.commit();
  assert.ok(db.order[0].includes('pg_advisory_xact_lock'),
    'lasningen maste vara forsta fragan, annars ar rakningen redan foraldrad nar den skrivs');
});

test('capacity counts accounts, not rows — matching what the manager actually spawns', async () => {
  // Tva workspaces pekar pa samma konto. Manager kor EN bridge for det, sa raknat pa rader skulle
  // API:et reservera en plats som flottan aldrig anvander.
  const db = makeDatabase([
    { workspace_id: 'ws-a', tiktok_username: 'alice', active: true },
    { workspace_id: 'ws-b', tiktok_username: 'alice', active: true },
    { workspace_id: 'ws-c', tiktok_username: 'carol', active: true }
  ]);
  const c = db.client('t1');
  const out = await decideTikTokCapacity(c, { workspaceId: 'ws-new', username: 'dave', limit: 3 });
  c.commit();
  assert.ok(out.connection, 'tva distinkta konton av tre anvanda → platsen ska ges');
});

test('a second workspace on the same account is refused, not silently queued forever', async () => {
  const db = makeDatabase([{ workspace_id: 'ws-a', tiktok_username: 'alice', active: true }]);
  const c = db.client('t1');
  const out = await decideTikTokCapacity(c, { workspaceId: 'ws-b', username: 'alice', limit: 5 });
  c.commit();
  assert.equal(out.refused, 'duplicate');
  assert.match(out.error, /redan ansluten i ett annat workspace/);
});

test('an already-active workspace can reconnect while the fleet is full', async () => {
  const db = makeDatabase([
    { workspace_id: 'ws-a', tiktok_username: 'alice', active: true },
    { workspace_id: 'ws-b', tiktok_username: 'bob', active: true },
    { workspace_id: 'ws-c', tiktok_username: 'carol', active: true }
  ]);
  const c = db.client('t1');
  const out = await decideTikTokCapacity(c, { workspaceId: 'ws-b', username: 'bob', limit: 3 });
  c.commit();
  assert.ok(out.connection, 'kapacitetstaket far aldrig sparra ute nagon som redan sander');
  assert.equal(db.activeAccounts(), 3);
});

test('an already-active workspace can also RENAME its account while the fleet is full', async () => {
  const db = makeDatabase([
    { workspace_id: 'ws-a', tiktok_username: 'alice', active: true },
    { workspace_id: 'ws-b', tiktok_username: 'bob', active: true },
    { workspace_id: 'ws-c', tiktok_username: 'carol', active: true }
  ]);
  const c = db.client('t1');
  const out = await decideTikTokCapacity(c, { workspaceId: 'ws-b', username: 'bob2', limit: 3 });
  c.commit();
  assert.ok(out.connection, 'den byter namn pa sin egen plats, inte tar en ny');
  assert.equal(out.connection.tiktok_username, 'bob2');
  assert.equal(db.activeAccounts(), 3);
});

test('a workspace whose row went inactive must queue like anyone else when full', async () => {
  const db = makeDatabase([
    { workspace_id: 'ws-a', tiktok_username: 'alice', active: true },
    { workspace_id: 'ws-b', tiktok_username: 'bob', active: true },
    { workspace_id: 'ws-old', tiktok_username: 'olle', active: false }
  ]);
  const c = db.client('t1');
  const out = await decideTikTokCapacity(c, { workspaceId: 'ws-old', username: 'olle', limit: 2 });
  c.commit();
  assert.equal(out.refused, 'capacity', 'den gav upp sin plats nar den kopplade fran');
  assert.equal(out.inUse, 2);
});
