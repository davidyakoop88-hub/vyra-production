'use strict';
// Mätningen som avgör om det är NÄTET eller KÖN som gör konkurrentens widgetar synligt snabbare.
//
// Sonden får inte själv kosta något, får inte bära användardata in i loggen, och måste rivas vid
// sessionsslut — den håller en setInterval, och kontraktet säger att ingen sådan överlever en
// utloggning.
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.after(closeAll);

function boot() {
  const h = createDom({ state: { widgets: [], projectName: 'fordrojning' } });
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  // En kö som spelar direkt, så jobbet kan mätas utan att vänta ut en riktig visningstid.
  run(`window.__spelade=[];window.VyraAlertQueue={push(run,d,p){window.__spelade.push(1);return run()}};`);
  run(`window.__routade=[];window.routeLiveBattleEvent=e=>{window.__routade.push(e)};`);
  h.load('latency-probe.js');
  return { h, run, rapport: () => JSON.parse(JSON.stringify(h.window.VyraFordrojning.rapport())) };
}

test('nätverkstiden mäts mot bryggans tidsstämpel', () => {
  const env = boot();
  const nu = env.h.window.Date.now();
  env.h.window.routeLiveBattleEvent({ type: 'gift', at: nu - 250 });
  const r = env.rapport();
  assert.equal(r.nat.antal, 1, 'eventet mättes inte alls');
  assert.ok(r.nat.snitt >= 200 && r.nat.snitt < 2000,
    `nätverkstiden blev ${r.nat.snitt} ms, väntade ~250`);
});

test('den tidigare routern anropas fortfarande', () => {
  const env = boot();
  env.h.window.routeLiveBattleEvent({ type: 'gift', at: Date.now() });
  assert.equal(env.h.window.__routade.length, 1,
    'sonden svalde eventet — den ska mäta, inte konsumera');
});

test('en orimlig tidsstämpel kastas i stället för att dra upp snittet', () => {
  const env = boot();
  env.h.window.routeLiveBattleEvent({ type: 'gift', at: 1 });               // 1970
  env.h.window.routeLiveBattleEvent({ type: 'gift', at: Date.now() + 9e6 }); // framtiden
  env.h.window.routeLiveBattleEvent({ type: 'gift' });                       // ingen stämpel alls
  assert.equal(env.rapport().nat.antal, 0, 'en trasig klocka räknades som en fördröjning');
});

test('kötiden mäts inne i jobbet, inte runt push', () => {
  const env = boot();
  // push() returnerar direkt; det är väntan EFTERÅT som är hela frågan. Mäts den runt push blir
  // svaret alltid noll och kön ser oskyldig ut.
  env.run(`window.VyraAlertQueue.push(()=>{},1000,0)`);
  const r = env.rapport();
  assert.equal(r.ko.antal, 1, 'kön kopplades aldrig in');
  assert.ok(r.ko.snitt >= 0 && r.ko.snitt < 2000);
});

test('kön kopplas bara en gång, hur många gånger sonden än provar', () => {
  const env = boot();
  env.run(`window.VyraAlertQueue.push(()=>{},1000,0)`);
  assert.equal(env.rapport().ko.antal, 1);
  assert.equal(env.h.window.VyraAlertQueue.__fordrojningMatt, true,
    'utan märkningen lindas kön om vid varje försök och räknar samma jobb flera gånger');
});

test('rapporten bär bara tal — inga namn, inga gåvor, ingen text', () => {
  const env = boot();
  env.h.window.routeLiveBattleEvent({ type: 'gift', at: Date.now() - 100,
    username: 'hemlig', giftName: 'Rose', comment: 'privat meddelande' });
  const text = JSON.stringify(env.rapport());
  ['hemlig', 'Rose', 'privat'].forEach(ord =>
    assert.ok(!text.includes(ord), `${ord} läckte in i mätningen`));
});

test('mätningen rivs vid sessionsslut', () => {
  const env = boot();
  env.h.window.routeLiveBattleEvent({ type: 'gift', at: Date.now() - 100 });
  assert.equal(env.rapport().nat.antal, 1);
  env.run(`window.dispatchEvent(new CustomEvent('vyra-session-ended'))`);
  assert.equal(env.rapport().nat.antal, 0,
    'förra sessionens mätvärden låg kvar och blandades med nästa sändnings');
});
