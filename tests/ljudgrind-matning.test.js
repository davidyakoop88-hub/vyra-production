'use strict';
// LJUDGRINDENS MÄTNING (2026-11-19). Sound Alerts kastar en händelse som är äldre än 30 s, men loggen från en
// riktig sändning sa bara "kom för sent" — inte var tiden försvann. saNotera() i sound-alerts.js sparar nu alla
// tider (at, tiktokAt, bryggaAt, serverAt, mottagen) och de tre sträckorna var för sig i window.VyraLjudgrind.
// Provet kör sound-alerts.js i samma flikrigg som tests/sound-alerts-fristaende.test.js och vaktar tre saker:
//   1. en kastad händelse lämnar en rad med alla tider och sträckorna uträknade,
//   2. mätningen ändrar inte vad som spelas — gammalt kastas, färskt spelas,
//   3. raderna är begränsade (20 stoppade, 50 åldrar) så att en lång sändning inte växer minnet.
const test = require('node:test'), assert = require('node:assert/strict');
const F = require('./helpers/flikar.js');

const vanta = ms => new Promise(r => setTimeout(r, ms));
const oppna = [];
test.after(() => { while (oppna.length) try { oppna.pop().close() } catch {} });

const ogat = { id: 's1', trigger: 'gift', condition: 'Eye for an Eye', giftId: '1374221', soundId: 'djAirhorn', volume: 89, cooldown: 0, enabled: true };
let lopnummer = 0;
const gava = (over = {}) => ({ type: 'gift', giftName: 'Eye for an Eye', giftId: '1374221', diamondCount: 1999,
  id: 'lg' + (++lopnummer), at: Date.now(), ...over });

async function studio() {
  const lager = F.delatLager();
  lager.setItem('vyra-extras', JSON.stringify({ soundAlerts: { alerts: [ogat] } }));
  const w = await F.fonster({ namn: 'studio', lager, skrivbar: true, ljud: true, actions: [], events: [], extraFiler: ['sound-alerts.js'] });
  oppna.push(w);
  return w;
}
const skicka = (w, e) => w.dispatchEvent(new w.CustomEvent('vyra-live-event', { detail: e }));
const spelat = w => w.__ljud;

test('en kastad händelse lämnar alla tider och de tre sträckorna', async () => {
  const w = await studio();
  const nu = Date.now();
  // TikTok skapade den för 100 s sedan, bryggan tog emot den 60 s efter det, servern skickade ut den 20 s senare.
  skicka(w, gava({ at: nu - 40000, tiktokAt: nu - 100000, bryggaAt: nu - 40000, serverAt: nu - 20000 }));
  await vanta(30);
  const g = w.VyraLjudgrind;
  assert.ok(g, 'window.VyraLjudgrind finns');
  assert.equal(g.antalStoppade, 1);
  const rad = g.stoppade[0];
  assert.equal(rad.typ, 'gift');
  assert.ok(rad.alderMs >= 39000 && rad.alderMs < 45000, `åldern räknas mot saNu: ${rad.alderMs}`);
  assert.equal(rad.steg.tiktokTillBryggaMs, 60000, 'TikTok -> brygga');
  assert.equal(rad.steg.bryggaTillServerMs, 20000, 'brygga -> server');
  assert.ok(rad.steg.serverTillKlientMs >= 19000 && rad.steg.serverTillKlientMs < 25000, `server -> klient: ${rad.steg.serverTillKlientMs}`);
  assert.equal(rad.atFalt, 'at');
  assert.ok(rad.mottagen >= nu, 'mottagen = klientens tid när den kom fram');
});

test('saknade fält ger null i sträckan, inte NaN eller 0', async () => {
  const w = await studio();
  skicka(w, gava({ at: Date.now() - 45000 }));
  await vanta(30);
  const rad = w.VyraLjudgrind.stoppade.at(-1);
  assert.equal(rad.steg.tiktokTillBryggaMs, null);
  assert.equal(rad.steg.bryggaTillServerMs, null);
  assert.equal(rad.steg.serverTillKlientMs, null);
});

test('mätningen ändrar inte vad som spelas: gammalt kastas, färskt spelas', async () => {
  const w = await studio();
  skicka(w, gava({ at: Date.now() - 60000 }));
  await vanta(30);
  assert.equal(spelat(w).length, 0, 'ett 60 s gammalt event spelar fortfarande inget');
  skicka(w, gava({ at: Date.now() - 2000 }));
  await vanta(60);
  assert.equal(spelat(w).length, 1, 'ett färskt event spelar fortfarande ljudet');
  assert.equal(w.VyraLjudgrind.antalStoppade, 1, 'bara det gamla räknas som stoppat');
  assert.ok(w.VyraLjudgrind.aldrar.length >= 2, 'åldern på båda händelserna mäts');
});

test('raderna är begränsade så att en lång sändning inte växer minnet', async () => {
  const w = await studio();
  for (let i = 0; i < 75; i++) skicka(w, gava({ at: Date.now() - 50000 }));
  await vanta(60);
  const g = w.VyraLjudgrind;
  assert.equal(g.antalStoppade, 75, 'räknaren fortsätter räkna');
  assert.equal(g.stoppade.length, 20, 'bara de 20 senaste raderna sparas');
  assert.equal(g.aldrar.length, 50, 'bara de 50 senaste åldrarna sparas');
});
