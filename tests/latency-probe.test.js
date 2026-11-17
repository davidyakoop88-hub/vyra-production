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

// ---- fördröjningens tre sträckor (2026-11-17) ------------------------------------------------------
// Bryggan bär tiktokAt (TikToks common.createTime) och bryggaAt, molnet serverAt. Sonden delar nätet
// i TikTok -> bryggan, bryggan -> molnet ut och molnet -> den här sidan.
test('nätet delas i tre sträckor: tiktok, moln och ut', () => {
  const env = boot();
  const nu = env.h.window.Date.now();
  env.h.window.routeLiveBattleEvent({ type: 'gift', at: nu - 300, tiktokAt: nu - 900, bryggaAt: nu - 600, serverAt: nu - 200 });
  const s = env.rapport().strackor;
  assert.equal(s.tiktok.antal, 1);
  assert.equal(s.tiktok.snitt, 300, 'TikTok -> bryggan');
  assert.equal(s.moln.snitt, 400, 'bryggan -> molnet ut');
  assert.ok(s.ut.snitt >= 200 && s.ut.snitt < 2000, `molnet -> sidan blev ${s.ut.snitt}`);
});

test('en glove som bryggan medvetet höll tillbaka räknas inte som TikTok-fördröjning', () => {
  const env = boot();
  const nu = env.h.window.Date.now();
  env.h.window.routeLiveBattleEvent({ type: 'glove', at: nu, tiktokAt: nu - 120000, bryggaAt: nu - 50, serverAt: nu - 20 });
  const s = env.rapport().strackor;
  assert.equal(s.tiktok.antal, 0, 'boost-fönstrets avsiktliga väntan mättes som fördröjning');
  assert.equal(s.moln.antal, 1);
});

test('ett event utan de nya fälten (VYRA Desktop, äldre brygga) mäts som förut utan sträckor', () => {
  const env = boot();
  env.h.window.routeLiveBattleEvent({ type: 'gift', at: env.h.window.Date.now() - 100 });
  const r = env.rapport();
  assert.equal(r.nat.antal, 1);
  assert.deepEqual([r.strackor.tiktok.antal, r.strackor.moln.antal, r.strackor.ut.antal], [0, 0, 0]);
});
