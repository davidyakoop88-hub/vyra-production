'use strict';
// AVLÖST-SPÄRREN I CONNECTION-MANAGER — röda prov före implementation (§1 i designen).
//
// En bridgeprocess som avslutas med AVLOST_EXIT (86) är permanent avlöst: en NYARE process äger
// kontot. Managern får inte starta om kontot i samma managerlivstid — annars flip-floppar två
// deployments generationerna mellan sig: gammal → stale → exit → respawn med nytt UUID → gör sig
// current → nya deploymentens process blir stale → om igen. En NY managerprocess (= ny
// deployment) börjar med tom spärr och får starta kontot — det är den som ska äga det.
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createConnectionManager } = require('../connection-manager');

let L = null;
try { L = require('../livscykel'); } catch {}
// Faller pa BETEENDET, inte pa existensen: 86 ar reserv tills livscykel.js exporterar konstanten,
// sa varje rott prov pekar pa den saknade sparren i managern — inte pa en require-rad.
// Nar modulen finns kravs att konstanten ar exakt 86 (kontraktet mot managern).
const AVLOST = () => { if (L) assert.equal(L.AVLOST_EXIT, 86, 'AVLOST_EXIT ska vara 86'); return 86; };

function fakeChild() {
  const emitter = new EventEmitter();
  emitter.killed = false;
  emitter.kill = signal => { emitter.killed = true; emitter.lastSignal = signal; };
  return emitter;
}

function fakePool(rows) {
  return { query: async () => ({ rows }) };
}

test('manager: exit 86 markerar kontot generationsavlöst — ingen respawn, ingen timer', async () => {
  const spawns = [];
  let child;
  let klocka = 0;
  const manager = createConnectionManager({
    pool: fakePool([{ workspace_id: 'ws-1', tiktok_username: 'alice' }]),
    spawnBridge: (ws, u) => { spawns.push(u); child = fakeChild(); return child; },
    sleepFn: async () => {},
    nowFn: () => klocka,
  });
  await manager.syncOnce();
  assert.deepEqual(spawns, ['alice']);
  child.emit('exit', AVLOST());

  // Klockan flyttas FORBI backofftaket (5 min): dagens manager SKULLE respawna har, sa provet
  // faller pa sparrens franvaro — inte pa att backoffen rakar dolja den i 5 s.
  klocka += 6 * 60_000;
  // Nästa synk: raden är kvar aktiv i Postgres, men kontot är spärrat.
  const resultat = await manager.syncOnce();
  assert.deepEqual(spawns, ['alice'], 'managern respawnade en generationsavlöst bridge');
  assert.equal(resultat.started, 0);
  const vantar = manager.stats().waiting;
  assert.equal(vantar.length, 1);
  assert.equal(vantar[0].reason, 'stale-generation',
    'väntlistan ska säga stale-generation, inte backoff: ' + JSON.stringify(vantar));
});

test('manager: andra konton fortsätter opåverkade när ett är generationsavlöst', async () => {
  const spawns = [];
  const barn = new Map();
  let klocka = 0;
  const manager = createConnectionManager({
    pool: fakePool([
      { workspace_id: 'ws-1', tiktok_username: 'alice' },
      { workspace_id: 'ws-2', tiktok_username: 'bob' },
    ]),
    spawnBridge: (ws, u) => { spawns.push(u); const c = fakeChild(); barn.set(u, c); return c; },
    sleepFn: async () => {},
    nowFn: () => klocka,
  });
  await manager.syncOnce();
  barn.get('alice').emit('exit', AVLOST());
  barn.get('bob').emit('exit', 1);           // vanlig krasch: befintlig backoff, INTE spärr
  klocka += 6 * 60_000;                      // forbi ALLA backofffonster — bara sparren kan halla alice ute
  await manager.syncOnce();
  assert.equal(spawns.filter(u => u === 'alice').length, 1, 'alice respawnades trots spärren');
  assert.equal(spawns.filter(u => u === 'bob').length, 2, 'bob ska respawnas som vanligt efter backoff');
});

test('manager: vanlig krasch-exit respawnar som i dag efter backoff — spärren gäller bara kod 86', async () => {
  const spawns = [];
  let child, klocka = 0;
  const manager = createConnectionManager({
    pool: fakePool([{ workspace_id: 'ws-1', tiktok_username: 'alice' }]),
    spawnBridge: (ws, u) => { spawns.push(u); child = fakeChild(); return child; },
    sleepFn: async () => {},
    nowFn: () => klocka,
  });
  await manager.syncOnce();
  child.emit('exit', 1);
  klocka += 6000;                             // förbi backoffens 5 s
  await manager.syncOnce();
  assert.equal(spawns.length, 2, 'en vanlig krasch ska fortfarande respawnas efter backoff');
});

test('manager: en NY managerinstans har tom spärr och startar kontot igen', async () => {
  const rows = [{ workspace_id: 'ws-1', tiktok_username: 'alice' }];
  let child;
  let spawnadeForsta = 0, klocka = 0;
  const forsta = createConnectionManager({
    pool: fakePool(rows),
    spawnBridge: () => { spawnadeForsta++; child = fakeChild(); return child; },
    sleepFn: async () => {},
    nowFn: () => klocka,
  });
  await forsta.syncOnce();
  child.emit('exit', AVLOST());
  klocka += 6 * 60_000;                      // forbi backoffen: bara sparren kan hindra respawn
  await forsta.syncOnce();
  assert.equal(spawnadeForsta, 1, 'forsta managern respawnade en generationsavlost bridge');
  assert.equal(forsta.stats().totalBridges, 0);

  const spawns2 = [];
  const andra = createConnectionManager({
    pool: fakePool(rows),
    spawnBridge: (ws, u) => { spawns2.push(u); return fakeChild(); },
    sleepFn: async () => {},
  });
  await andra.syncOnce();
  assert.deepEqual(spawns2, ['alice'], 'en ny managerprocess ska få starta kontot');
});

test('manager: spärren nycklas per KONTO — samma konto i annat workspace spärras också', async () => {
  // Två workspaces, samma TikTok-konto (uppmätt verklighet: tiktok_connections har ingen unik
  // nyckel på tiktok_username). Blir kontots körning avlöst får inget av workspacen respawna det.
  const spawns = [];
  let child, klocka = 0;
  const manager = createConnectionManager({
    pool: fakePool([
      { workspace_id: 'ws-1', tiktok_username: 'alice' },
      { workspace_id: 'ws-2', tiktok_username: '@ALICE ' },
    ]),
    spawnBridge: (ws, u) => { spawns.push(ws); child = fakeChild(); return child; },
    sleepFn: async () => {},
    nowFn: () => klocka,
  });
  await manager.syncOnce();
  assert.equal(spawns.length, 1, 'dublettkontot ska redan i dag bara ge en bridge');
  child.emit('exit', AVLOST());
  klocka += 6 * 60_000;
  await manager.syncOnce();
  assert.equal(spawns.length, 1, 'spärren ska täcka kontot, inte bara workspace-raden');
  const orsaker = manager.stats().waiting.map(w => w.reason);
  assert.ok(orsaker.includes('stale-generation'), 'väntlistan ska bära stale-generation: ' + orsaker);
});

test('manager: utan exit 86 är beteendet exakt som före ändringen — flagga-av-kontraktet', async () => {
  // Ingen stale-exit någonsin ⇒ ingen spärr existerar och stats() bär ingen ny hemlighet.
  let child;
  const manager = createConnectionManager({
    pool: fakePool([{ workspace_id: 'ws-1', tiktok_username: 'alice' }]),
    spawnBridge: () => { child = fakeChild(); return child; },
    sleepFn: async () => {},
  });
  await manager.syncOnce();
  child.emit('exit', 0);                     // ren avslutning utan kod 86
  const s = manager.stats();
  assert.equal(s.totalBridges, 0);
  // /status-ytan får inte börja läcka kontonamn via en ny lista — fältet ska vara en RÄKNARE.
  assert.ok(!JSON.stringify(s).includes('stale-generation'),
    'ingen stale-markering ska finnas när ingen kod 86 setts');
});
