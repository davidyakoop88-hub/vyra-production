'use strict';
// DE TRE POSTGRES-STEGEN KÖRS SAMTIDIGT (2026-11-17, David: "förseningar mellan live och tiktok").
//
// goal-ingest.js väntade förut på nivåer, sedan målet, sedan poängen — tre till fyra rundresor till
// databasen i rad innan gåvan alls skickades ut. Stegen är oberoende, så nu startar alla tre direkt.
// Två saker får INTE ändras av det, och de är vad det här provet vaktar:
//
//   1. allt är räknat innan något publiceras (filhuvudet i goal-ingest.js — "Postgres first")
//   2. nivåhöjningen står på det publicerade eventet, för det är det widgeten läser
//
// Plus mätpunkten: serverAt sätts när eventet är räknat och går ut (latency-probe.js).
const test = require('node:test'), assert = require('node:assert/strict');
const { cleanEvent } = require('../event-bus');
const { createEventIngest } = require('../goal-ingest');

const WS = 'ws-1';
const GAVA = { id: 'evt-9', type: 'gift', username: 'Alice', userId: 'u-1', count: 1, value: 1,
  fanClubLevel: 12, tiktokAt: 1000, bryggaAt: 1100 };

// Ett steg som inte blir klart förrän provet släpper det — så går det att se vad som startat medan
// de andra fortfarande väntar.
function spärr() {
  let släpp; const p = new Promise(r => { släpp = r });
  return { p, släpp };
}

function rigg({ poangFel = null } = {}) {
  const startade = [], publicerat = [], logg = [];
  const niva = spärr(), mal = spärr(), poang = spärr();
  const ingest = createEventIngest({
    pool: {},
    cleanEvent,
    now: () => 5000,
    log: rad => logg.push(rad),
    eventBus: { publish: async (ws, event) => { publicerat.push({ ...event }); return { duplicate: false, event } } },
    goalSse: { publish: async () => true },
    viewerLevels: { applyEvent: async () => { startade.push('niva'); await niva.p; return { fanLevelUp: { from: 11, to: 12 }, gifterLevelUp: null } } },
    goalRuntime: { applyEvent: async () => { startade.push('mal'); await mal.p; return { applied: false, rows: [] } } },
    pointsRuntime: { applyEvent: async () => { startade.push('poang'); await poang.p; if (poangFel) throw poangFel; return { ok: true } } }
  });
  return { ingest, startade, publicerat, logg, niva, mal, poang };
}

const tick = () => new Promise(r => setImmediate(r));

test('alla tre databasstegen startar direkt, utan att vänta på varandra', async () => {
  const r = rigg();
  const klar = r.ingest(WS, GAVA);
  await tick();
  assert.deepEqual(r.startade.sort(), ['mal', 'niva', 'poang'], 'ett steg väntade på ett annat');
  r.niva.släpp(); r.mal.släpp(); r.poang.släpp();
  await klar;
});

test('ingenting publiceras förrän ALLA tre stegen är klara', async () => {
  const r = rigg();
  const klar = r.ingest(WS, GAVA);
  await tick();
  r.niva.släpp(); r.mal.släpp();
  await tick(); await tick();
  assert.equal(r.publicerat.length, 0, 'gåvan gick ut innan poängen var räknad');
  r.poang.släpp();
  await klar;
  assert.equal(r.publicerat.length, 1);
});

test('nivåhöjningen står på det publicerade eventet', async () => {
  const r = rigg();
  const klar = r.ingest(WS, GAVA);
  r.niva.släpp(); r.mal.släpp(); r.poang.släpp();
  await klar;
  assert.deepEqual(r.publicerat[0].fanLevelUp, { from: 11, to: 12 });
});

test('ett poängfel hindrar inte gåvan och loggas utan id:n', async () => {
  const r = rigg({ poangFel: new Error('pg nere') });
  const klar = r.ingest(WS, GAVA);
  r.niva.släpp(); r.mal.släpp(); r.poang.släpp();
  const svar = await klar;
  assert.equal(r.publicerat.length, 1, 'gåvan gick inte ut');
  assert.equal(svar.points, null);
  assert.equal(r.logg.length, 1);
  assert.match(r.logg[0], /points_apply_failed/);
  assert.doesNotMatch(r.logg[0], /evt-9|Alice|ws-1/);
});

test('ett målfel stoppar fortfarande utskicket — anroparen ska svara 500 och bryggan försöka igen', async () => {
  const startade = [];
  const ingest = createEventIngest({
    pool: {}, cleanEvent, log: () => {},
    eventBus: { publish: async () => { startade.push('publicerat'); return { duplicate: false } } },
    goalSse: { publish: async () => true },
    goalRuntime: { applyEvent: async () => { throw new Error('tx avbruten') } }
  });
  await assert.rejects(ingest(WS, GAVA), /tx avbruten/);
  assert.deepEqual(startade, []);
});

test('tidsfälten följer med: tiktokAt och bryggaAt från bryggan, serverAt när eventet går ut', async () => {
  const r = rigg();
  const klar = r.ingest(WS, GAVA);
  r.niva.släpp(); r.mal.släpp(); r.poang.släpp();
  await klar;
  const ut = r.publicerat[0];
  assert.equal(ut.tiktokAt, 1000);
  assert.equal(ut.bryggaAt, 1100);
  assert.equal(ut.serverAt, 5000);
});

test('cleanEvent kastar skräp i tidsfälten i stället för att låta det nå klienten', () => {
  const e = cleanEvent({ id: 'x', type: 'chat', tiktokAt: 'hej', bryggaAt: -5, serverAt: 12.7 });
  assert.equal(e.tiktokAt, 0);
  assert.equal(e.bryggaAt, 0);
  assert.equal(e.serverAt, 13);
});
