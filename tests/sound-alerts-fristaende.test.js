'use strict';
// FRISTÅENDE SOUND ALERTS (David 2026-10-29: "Sound Alerts ska inte behöva nån länk om nån giftar mig
// den ska funka i bakrunden", "fixa sound ska vara som tikfinty").
//
// En alert var en Action + ett Event och spelades bara i en overlay med rätt scen — utan öppen
// scenlänk hördes ingenting. Nu är den en egen rad i vyra-extras och spelas direkt i studiofliken
// (eller skrivbordsappen), som TikFinitys Sound Alerts. Provet kör sound-alerts.js i samma
// flikrigg som Action & Event-proven (tests/helpers/flikar.js): riktig session-state, riktigt
// masterval, delat lager mellan flikarna och en Audio-stubbe som räknar uppspelningar.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const F = require('./helpers/flikar.js');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const vanta = ms => new Promise(r => setTimeout(r, ms));
const oppna = [];
test.after(() => { while (oppna.length) try { oppna.pop().close() } catch {} });

const ogat = { id: 's1', trigger: 'gift', condition: 'Eye for an Eye', giftId: '1374221', soundId: 'djAirhorn', volume: 89, cooldown: 0, enabled: true };
const gava = (over = {}) => ({ type: 'gift', giftName: 'Eye for an Eye', giftId: '1374221', diamondCount: 1999, id: 'g' + Math.random().toString(36).slice(2), at: Date.now(), ...over });

async function studio({ lager = F.delatLager(), alerts = [ogat], namn = 'studio', actions = [], events = [] } = {}) {
  lager.setItem('vyra-extras', JSON.stringify({ soundAlerts: { alerts } }));
  const w = await F.fonster({ namn, lager, skrivbar: true, ljud: true, actions, events, extraFiler: ['sound-alerts.js'] });
  oppna.push(w);
  return w;
}
const skicka = (w, e) => w.dispatchEvent(new w.CustomEvent('vyra-live-event', { detail: e }));
const spelat = w => w.__ljud.map(a => ({ fil: String(a.src).split('/').pop(), volym: Math.round(a.volume * 100) }));

test('rätt gåva spelar ljudet i studion — utan länk, utan Action', async () => {
  const w = await studio();
  skicka(w, gava());
  await vanta(30);
  assert.deepEqual(spelat(w), [{ fil: 'dj-airhorn.mp3', volym: 89 }]);
});

test('gåvan träffar på id:t även när TikTok skickar namnet på svenska', async () => {
  const w = await studio();
  skicka(w, gava({ giftName: 'Öga för öga' }));
  await vanta(30);
  assert.equal(spelat(w).length, 1);
});

test('en annan gåva, en avslagen alert och ett gammalt event spelar inte', async () => {
  const w = await studio({ alerts: [ogat, { ...ogat, id: 's2', condition: 'Ros', giftId: '5655', enabled: false }] });
  skicka(w, gava({ giftName: 'Galax', giftId: '5826' }));
  skicka(w, gava({ giftName: 'Ros', giftId: '5655' }));
  skicka(w, gava({ at: Date.now() - 60000 }));
  await vanta(30);
  assert.equal(spelat(w).length, 0);
});

test('samma event två gånger ger ett ljud, och väntetiden håller', async () => {
  const w = await studio({ alerts: [{ ...ogat, cooldown: 10 }] });
  const e = gava();
  skicka(w, e); skicka(w, e);
  skicka(w, gava());
  await vanta(30);
  assert.equal(spelat(w).length, 1);
});

test('"Alla gåvor" och minsta coin-värde', async () => {
  const w = await studio({ alerts: [
    { id: 'a', trigger: 'gift', condition: '', soundId: 'pewPew', volume: 50, enabled: true },
    { id: 'b', trigger: 'giftCoins', condition: '100', soundId: 'jackpot', volume: 50, enabled: true },
  ] });
  skicka(w, gava({ giftName: 'Ros', giftId: '5655', diamondCount: 1 }));
  await vanta(30);
  assert.deepEqual(spelat(w).map(s => s.fil), ['pew-pew.mp3']);
  skicka(w, gava({ diamondCount: 1999 }));
  await vanta(30);
  assert.deepEqual(spelat(w).map(s => s.fil).sort(), ['jackpot.mp3', 'pew-pew.mp3', 'pew-pew.mp3']);
});

test('följare utlöser följar-alerten', async () => {
  const w = await studio({ alerts: [{ id: 'f', trigger: 'follow', condition: '', soundId: 'followCheer', volume: 80, enabled: true }] });
  skicka(w, { type: 'follow', username: 'lisa', id: 'f1', at: Date.now() });
  await vanta(30);
  assert.deepEqual(spelat(w).map(s => s.fil), ['follow-cheer.mp3']);
});

test('två öppna studioflikar ger ETT ljud, inte två', async () => {
  const lager = F.delatLager();
  const a = await studio({ lager, namn: 'a' });
  const b = await F.fonster({ namn: 'b', lager, ljud: true, extraFiler: ['sound-alerts.js'] });
  oppna.push(b);
  const e = gava();
  skicka(a, e); skicka(b, e);
  await vanta(30);
  assert.equal(spelat(a).length + spelat(b).length, 1);
});

test('overlayn spelar aldrig en Sound Alert — annars hördes den två gånger', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="title"></div><div id="view"></div></body></html>',
    { url: 'https://vyralive.app/studio.html?overlay=1&access=TOK', runScripts: 'dangerously' });
  oppna.push(dom.window);
  const w = dom.window;
  w.localStorage.setItem('vyra-extras', JSON.stringify({ soundAlerts: { alerts: [ogat] } }));
  w.__ljud = [];
  w.Audio = function (src) { const el = { src, volume: 1, play() { return Promise.resolve() }, addEventListener() {}, removeEventListener() {} }; w.__ljud.push(el); return el };
  w.toast = () => {};
  const s = w.document.createElement('script'); s.textContent = las('sound-alerts.js'); w.document.body.append(s);
  skicka(w, gava());
  await vanta(30);
  assert.equal(w.__ljud.length, 0);
});

test('gamla alerts flyttas ur Action & Event, och Actions som används av annat står kvar', async () => {
  const actions = [
    { id: 'aLjud', name: 'DJ Airhorn', types: ['audio'], volume: 89, cooldown: 2, audioMedia: { packagePath: 'assets/sounds/pixabay/dj-airhorn.mp3' }, scene: { number: 1 } },
    { id: 'aVideo', name: 'Video', types: ['video'], scene: { number: 1 } },
  ];
  const events = [
    { id: 'eLjud', trigger: 'gift', condition: 'Eye for an Eye', giftId: '1374221', actionId: 'aLjud', enabled: true, soundAlertId: 'djAirhorn' },
    { id: 'eVideo', trigger: 'giftCoins', condition: '30', actionId: 'aVideo', enabled: true },
  ];
  const w = await studio({ alerts: [], actions, events });
  assert.equal(await w.saFlyttaFranActionEvent(), true);
  const extras = JSON.parse(w.VyraSessionState.readActiveExtra('vyra-extras'));
  assert.deepEqual(extras.soundAlerts.alerts, [{ id: 'eLjud', trigger: 'gift', condition: 'Eye for an Eye', giftId: '1374221', soundId: 'djAirhorn', volume: 89, cooldown: 2, enabled: true }]);
  const ae = JSON.parse(w.VyraSessionState.readActiveExtra('vyra-action-event-v2'));
  assert.deepEqual(ae.events.map(e => e.id), ['eVideo'], 'ljud-eventet låg kvar och hade spelats i overlayn också');
  assert.deepEqual(ae.actions.map(a => a.id), ['aVideo'], 'ljud-actionen låg kvar, eller videon försvann');
  // Ett andra varv gör ingenting — raden läggs aldrig in två gånger.
  assert.equal(await w.saFlyttaFranActionEvent(), true);
  assert.equal(JSON.parse(w.VyraSessionState.readActiveExtra('vyra-extras')).soundAlerts.alerts.length, 1);
  // Och den flyttade alerten spelar.
  skicka(w, gava());
  await vanta(30);
  assert.equal(spelat(w).length, 1);
});
