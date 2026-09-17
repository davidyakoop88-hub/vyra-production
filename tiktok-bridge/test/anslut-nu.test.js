'use strict';
// "ANSLUT NU" — sandaren ber om en omedelbar anslutning i stallet for att vanta ut cykeln.
//
// VARFOR DEN BEHOVS. bridge.js ger aldrig upp mot ett konto som inte sander: den forsoker igen
// efter 1, 2, 4, 8, 16, 32 och sedan 60 sekunder i evighet. Uppmatt 2026-09-18 blir vantevardet
// nar sandningen startar ~30 s och varsta fallet 72 s. Konkurrenten lovar "usually within
// seconds". Knappen ar for den som inte vill vanta ut cykeln.
//
// Servern och managern ar TVA OLIKA Railway-tjanster och pratar bara via databasen. Knappen
// satter darfor en tidsstampel i tiktok_connections; managern ser den pa sin nasta tick (15 s)
// och startar om just den bryggan. En omstart nollstaller bryggans egen forsoksraknare, sa
// nasta anslutningsforsok sker efter en sekund i stallet for sextio.
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createConnectionManager } = require('../connection-manager');

function fakeChild() {
  const emitter = new EventEmitter();
  emitter.killed = false;
  emitter.kill = signal => { emitter.killed = true; emitter.lastSignal = signal };
  return emitter;
}

// En pool vars rader gar att byta mellan tickar, och en klocka vi styr.
function rigg({ rows, nu = 1_000_000 }) {
  const spawnade = [];
  const klocka = { nu };
  const pool = { query: async () => ({ rows: rows() }) };
  const manager = createConnectionManager({
    pool,
    spawnBridge: (workspaceId, username) => { spawnade.push({ workspaceId, username }); return fakeChild() },
    sleepFn: async () => {},
    nowFn: () => klocka.nu,
  });
  return { manager, spawnade, klocka };
}

test('en begaran som ar NYARE an bryggans start startar om den', async () => {
  let rader = [{ workspace_id: 'ws-1', tiktok_username: 'alice', omstart_begard_at: null }];
  const { manager, spawnade, klocka } = rigg({ rows: () => rader });

  await manager.syncOnce();
  assert.equal(spawnade.length, 1, 'bryggan ska ha startat en gang');

  // Sandaren trycker pa knappen: tidsstampeln hamnar efter bryggans startedAt.
  klocka.nu += 30_000;
  rader = [{ workspace_id: 'ws-1', tiktok_username: 'alice', omstart_begard_at: new Date(klocka.nu) }];
  const ut = await manager.syncOnce();

  assert.equal(spawnade.length, 2, 'bryggan ska ha startats om');
  assert.equal(ut.restarted, 1);
  assert.equal(manager.stats().totalBridges, 1, 'omstart far inte ge tva bryggor for samma workspace');
});

test('KRITISK: en begaran som ar ALDRE an bryggans start ror ingenting', async () => {
  // Utan den har regeln startas bryggan om vid VARJE tick i evighet — var 15:e sekund, for alltid,
  // mot TikTok. Tidsstampeln ligger kvar i tabellen efter att den anvants; det ar jamforelsen mot
  // startedAt som gor den till en engangshandelse.
  const gammal = new Date(999_000);
  const rader = [{ workspace_id: 'ws-1', tiktok_username: 'alice', omstart_begard_at: gammal }];
  const { manager, spawnade } = rigg({ rows: () => rader, nu: 1_000_000 });

  await manager.syncOnce();
  assert.equal(spawnade.length, 1);

  for (let i = 0; i < 5; i++) {
    const ut = await manager.syncOnce();
    assert.equal(ut.restarted, 0, `tick ${i + 1} startade om utan ny begaran`);
  }
  assert.equal(spawnade.length, 1, 'bryggan ska ha startats exakt en gang');
});

test('omstarten nollstaller backoff, annars fastnar knappen i vantan', async () => {
  // En brygga som avslutats nagra ganger har en backofftimer. Trycker sandaren pa "Anslut nu" ska
  // den timern inte kunna halla kvar starten — hela poangen ar att det sker NU.
  let rader = [{ workspace_id: 'ws-1', tiktok_username: 'alice', omstart_begard_at: null }];
  const { manager, spawnade, klocka } = rigg({ rows: () => rader });

  await manager.syncOnce();
  const entry = manager.stats().bridges[0];
  assert.ok(entry);

  // Tvinga fram backoff: bryggan avslutas direkt, flera ganger.
  for (let i = 0; i < 3; i++) {
    manager.stopBridge('ws-1');
    await manager.syncOnce();
  }
  const spawnadeFore = spawnade.length;

  klocka.nu += 120_000;
  rader = [{ workspace_id: 'ws-1', tiktok_username: 'alice', omstart_begard_at: new Date(klocka.nu) }];
  await manager.syncOnce();

  assert.ok(spawnade.length > spawnadeFore, 'begaran ska starta bryggan trots backoff');
});

test('ett workspace UTAN brygga paverkas inte — den vanliga startvagen galler', async () => {
  const rader = [{ workspace_id: 'ws-1', tiktok_username: 'alice', omstart_begard_at: new Date(2_000_000) }];
  const { manager, spawnade } = rigg({ rows: () => rader, nu: 1_000_000 });
  const ut = await manager.syncOnce();
  assert.equal(spawnade.length, 1, 'ska startas som vanligt');
  assert.equal(ut.restarted, 0, 'en forsta start ar ingen omstart');
});

test('KONTROLLMATNING: utan begaran sker ingen omstart', async () => {
  // Om provet ovan gav samma svar med och utan tidsstampel skulle det inte mata nagot alls.
  const rader = [{ workspace_id: 'ws-1', tiktok_username: 'alice', omstart_begard_at: null }];
  const { manager, spawnade } = rigg({ rows: () => rader });
  await manager.syncOnce();
  const ut = await manager.syncOnce();
  assert.equal(ut.restarted, 0);
  assert.equal(spawnade.length, 1);
});

test('en begaran for ETT workspace ror inte de andra', async () => {
  let rader = [
    { workspace_id: 'ws-1', tiktok_username: 'alice', omstart_begard_at: null },
    { workspace_id: 'ws-2', tiktok_username: 'bob', omstart_begard_at: null },
  ];
  const { manager, spawnade, klocka } = rigg({ rows: () => rader });
  await manager.syncOnce();
  assert.equal(spawnade.length, 2);

  klocka.nu += 30_000;
  rader = [
    { workspace_id: 'ws-1', tiktok_username: 'alice', omstart_begard_at: new Date(klocka.nu) },
    { workspace_id: 'ws-2', tiktok_username: 'bob', omstart_begard_at: null },
  ];
  const ut = await manager.syncOnce();

  assert.equal(ut.restarted, 1);
  assert.equal(spawnade.filter(s => s.workspaceId === 'ws-1').length, 2);
  assert.equal(spawnade.filter(s => s.workspaceId === 'ws-2').length, 1, 'bob ska inte ha rorts');
});
