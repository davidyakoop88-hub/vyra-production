'use strict';
// Two REAL connection operations in parallel — the whole path, not just the decision function:
// makeTx() from db.js (the actual transaction wrapper the route uses) driving
// decideTikTokCapacity() against a pool that models Postgres's advisory-lock semantics.
//
// This is the test that can catch the failure the isolated one cannot: a lock released after the
// check but before the INSERT. If BEGIN/lock/count/INSERT/COMMIT ever stop sharing one client, or
// the lock stops being transaction-scoped, both callers get admitted and this fails.
const test = require('node:test'), assert = require('node:assert/strict');
const { makeTx } = require('../db');
const { decideTikTokCapacity } = require('../capacity-gate');

// A fake pool with pg's semantics for the parts that matter:
//  - connect() hands out an independent client
//  - pg_advisory_xact_lock blocks other clients until THIS client's COMMIT or ROLLBACK
//  - release() returns the client to the pool
function fakePool(rows = []) {
  const table = rows.slice();
  let lockHolder = null;                 // client id currently holding the advisory lock
  const waiters = [];                    // queued clients, FIFO like Postgres
  const log = [];
  let nextId = 1;
  let released = 0, connected = 0;

  function releaseLock(id) {
    if (lockHolder !== id) return;
    lockHolder = null;
    const next = waiters.shift();
    if (next) { lockHolder = next.id; next.resolve() }
  }

  return {
    table,
    log,
    stats: () => ({ connected, released, lockHolder }),
    activeAccounts: () => new Set(
      table.filter(r => r.active)
        .map(r => String(r.tiktok_username || '').trim().toLowerCase().replace(/^@+/, ''))
        .filter(Boolean)).size,

    async connect() {
      const id = nextId++;
      connected++;
      return {
        id,
        async query(sql, params = []) {
          log.push(`c${id}:${sql.replace(/\s+/g, ' ').trim().slice(0, 40)}`);

          if (sql === 'BEGIN') return { rows: [], rowCount: 0 };
          if (sql === 'COMMIT' || sql === 'ROLLBACK') { releaseLock(id); return { rows: [], rowCount: 0 } }

          if (sql.includes('pg_advisory_xact_lock')) {
            if (lockHolder === null) { lockHolder = id; return { rows: [], rowCount: 0 } }
            if (lockHolder === id) return { rows: [], rowCount: 0 };
            await new Promise(resolve => waiters.push({ id, resolve }));
            return { rows: [], rowCount: 0 };
          }
          // Everything below must only ever run while THIS client holds the lock. If the gate ever
          // let go early, this assertion is what catches it.
          if (lockHolder !== id) {
            throw new Error(`client ${id} queried without holding the capacity lock — the window that lets two callers both be admitted`);
          }

          const key = v => String(v || '').trim().toLowerCase().replace(/^@+/, '');

          if (sql.includes('WHERE workspace_id=$1 AND active=true')) {
            const hit = table.filter(r => r.workspace_id === params[0] && r.active);
            return { rows: hit, rowCount: hit.length };
          }
          if (sql.includes('workspace_id<>$2')) {
            const hit = table.filter(r => r.active && r.workspace_id !== params[1] && key(r.tiktok_username) === params[0] && key(r.tiktok_username) !== '');
            return { rows: hit, rowCount: hit.length };
          }
          if (sql.includes('count(DISTINCT')) {
            const n = new Set(table.filter(r => r.active).map(r => key(r.tiktok_username)).filter(Boolean)).size;
            return { rows: [{ n }], rowCount: 1 };
          }
          if (sql.startsWith('INSERT INTO tiktok_connections')) {
            const [workspace_id, tiktok_username] = params;
            const existing = table.find(r => r.workspace_id === workspace_id);
            if (existing) { existing.tiktok_username = tiktok_username; existing.active = true }
            else table.push({ workspace_id, tiktok_username, active: true });
            return { rows: [{ tiktok_username, active: true, updated_at: 'now' }], rowCount: 1 };
          }
          throw new Error('ovantad fraga: ' + sql);
        },
        release() { released++; releaseLock(id) }
      };
    }
  };
}

test('two parallel connection operations for one slot: exactly one is admitted', async () => {
  const pool = fakePool([
    { workspace_id: 'ws-a', tiktok_username: 'alice', active: true },
    { workspace_id: 'ws-b', tiktok_username: 'bob', active: true },
    { workspace_id: 'ws-c', tiktok_username: 'carol', active: true },
    { workspace_id: 'ws-d', tiktok_username: 'dave', active: true }
  ]);
  const tx = makeTx(pool);
  const connect = (workspaceId, username) =>
    tx(c => decideTikTokCapacity(c, { workspaceId, username, limit: 5 }));

  const [r1, r2] = await Promise.all([connect('ws-e', 'erik'), connect('ws-f', 'frida')]);

  assert.equal([r1, r2].filter(r => r.connection).length, 1, 'exakt en slapps in');
  assert.equal([r1, r2].filter(r => r.refused === 'capacity').length, 1, 'den andra nekas');
  assert.equal(pool.activeAccounts(), 5, 'flottan far aldrig ga over MAX_BRIDGES');
  assert.equal(pool.stats().connected, 2);
  assert.equal(pool.stats().released, 2, 'bada klienterna maste lamnas tillbaka');
  assert.equal(pool.stats().lockHolder, null, 'lasat maste vara slappt efter bada transaktionerna');
});

test('the lock is still held when the INSERT lands', async () => {
  const pool = fakePool();
  const tx = makeTx(pool);
  await tx(c => decideTikTokCapacity(c, { workspaceId: 'ws-1', username: 'alice', limit: 5 }));

  // Ordningen bevisar att BEGIN -> las -> rakning -> INSERT -> COMMIT sker pa samma klient utan
  // att slappa lasat emellan. Slapptes det efter kontrollen skulle INSERT kasta i fake-poolen.
  const seq = pool.log.map(l => l.split(':')[0] + ':' + l.split(':')[1].split(' ')[0]);
  assert.equal(seq[0], 'c1:BEGIN');
  assert.ok(pool.log[1].includes('pg_advisory_xact_lock'), 'lasat tas direkt efter BEGIN');
  const insertAt = pool.log.findIndex(l => l.includes('INSERT INTO'));
  const commitAt = pool.log.findIndex(l => l.includes('COMMIT'));
  assert.ok(insertAt > 1 && commitAt > insertAt, 'INSERT sker fore COMMIT, alltsa medan lasat halls');
  assert.ok(pool.log.every(l => l.startsWith('c1:')), 'allt pa EN klient');
});

test('ten parallel attempts never exceed the limit', async () => {
  const pool = fakePool();
  const tx = makeTx(pool);
  const attempts = Array.from({ length: 10 }, (_, i) =>
    tx(c => decideTikTokCapacity(c, { workspaceId: `ws-${i}`, username: `user${i}`, limit: 3 })));
  const results = await Promise.all(attempts);

  assert.equal(results.filter(r => r.connection).length, 3, 'exakt MAX_BRIDGES slapps in');
  assert.equal(results.filter(r => r.refused === 'capacity').length, 7);
  assert.equal(pool.activeAccounts(), 3);
  assert.equal(pool.stats().released, 10, 'ingen klient far lacka');
  assert.equal(pool.stats().lockHolder, null);
});

test('a throw inside the transaction still rolls back and releases the client', async () => {
  const pool = fakePool();
  const tx = makeTx(pool);
  await assert.rejects(
    tx(async c => {
      await c.query('SELECT pg_advisory_xact_lock($1)', [1]);
      throw new Error('boom');
    }),
    /boom/);
  assert.equal(pool.stats().released, 1, 'klienten lamnas tillbaka aven pa felvagen');
  assert.equal(pool.stats().lockHolder, null, 'ROLLBACK maste slappa lasat, annars laser sig flottan');
  assert.ok(pool.log.some(l => l.includes('ROLLBACK')));

  // och kon maste ga vidare efterat
  const out = await tx(c => decideTikTokCapacity(c, { workspaceId: 'ws-1', username: 'alice', limit: 5 }));
  assert.ok(out.connection, 'nasta transaktion far lasat efter en misslyckad foregangare');
});

test('stored usernames are matched the way the manager reduces them', async () => {
  // Rader som INTE skrivits via API:et — versaler, snabel-a, blanksteg. Manager reducerar alla
  // till 'alice'; API:et maste gora likadant eller slapper in en dubblett flottan sedan nekar.
  for (const stored of ['Alice', '@alice', '  alice  ', '@@Alice']) {
    const pool = fakePool([{ workspace_id: 'ws-legacy', tiktok_username: stored, active: true }]);
    const tx = makeTx(pool);
    const out = await tx(c => decideTikTokCapacity(c, { workspaceId: 'ws-new', username: 'alice', limit: 5 }));
    assert.equal(out.refused, 'duplicate', `lagrat som ${JSON.stringify(stored)} ska rakna som samma konto`);
  }
});

test('a blank stored username never counts as a slot or a duplicate', async () => {
  const pool = fakePool([
    { workspace_id: 'ws-junk1', tiktok_username: '', active: true },
    { workspace_id: 'ws-junk2', tiktok_username: '   ', active: true }
  ]);
  const tx = makeTx(pool);
  const out = await tx(c => decideTikTokCapacity(c, { workspaceId: 'ws-new', username: 'alice', limit: 1 }));
  assert.ok(out.connection, 'tomma rader far varken fylla flottan eller matcha varandra som dubbletter');
});
