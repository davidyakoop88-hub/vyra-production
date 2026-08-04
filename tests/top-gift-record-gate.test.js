'use strict';
// Separationen måste hålla med BÅDA skrivarna laddade, inte bara i en sandlåda.
//
// templateTopGift har två skrivare som lyssnar på samma vyra-live-event:
//   gift-event-images.js  — rekordgrindad efter A2
//   live-leaderboard.js:130 updateTopGift() — skrev tidigare över namn/bild/värde på VARJE gåva
//
// Med bara den första grinden hade enhetstestet varit grönt medan produktionen fortsatte byta
// Top Gift på varje billig gåva. Det här testet kör båda filerna i den ordning sidan laddar dem.
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.after(closeAll);

const topGift = id => ({ id, type: 'templateTopGift', x: 10, y: 20, width: 320,
  dataName: '@StreamQueen', dataValue: 0, profileImage: '' });

function boot() {
  const w = topGift('tg1');
  const h = createDom({ state: { widgets: [w], projectName: 'test' } });
  // Utan detta kastar live-leaderboard.js ReferenceError: fetch is not defined vid laddning, dess
  // lyssnare registreras aldrig, och testet blir grönt utan att den andra skrivaren ens körts.
  // Första versionen av det här testet passerade även med grinden bortmuterad, av precis det skälet.
  h.window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  h.load('overlay-sanitize.js');
  h.load('gift-event-images.js');
  h.load('live-leaderboard.js');
  h.paint([w]);
  // media.js laddar om state efter harnessens injektion, så widgeten måste in EFTER det.
  const script = h.document.createElement('script');
  script.textContent = `state.widgets.length=0;state.widgets.push(${JSON.stringify(w)})`;
  h.document.body.append(script);
  const fire = detail => h.window.dispatchEvent(new h.window.CustomEvent('vyra-live-event', { detail }));
  const widget = () => {
    const probe = h.document.createElement('script');
    probe.textContent = 'window.__tg = JSON.parse(JSON.stringify(state.widgets[0]))';
    h.document.body.append(probe);
    return h.window.__tg;
  };
  return { h, fire, widget };
}

test('en billig gåva slår inte ut en dyr i Top Gift', () => {
  const env = boot();
  env.fire({ type: 'gift', giftName: 'Rose', username: 'rik', coins: 30000, count: 1 });
  assert.equal(env.widget().dataName, 'rik', 'den dyra gåvan sattes aldrig');
  assert.equal(Number(env.widget().dataValue), 30000);

  env.fire({ type: 'gift', giftName: 'Rose', username: 'billig', coins: 1, count: 99 });
  assert.equal(env.widget().dataName, 'rik',
    'live-leaderboard skrev över Top Gift med en 1-coins-gåva');
  assert.equal(Number(env.widget().dataValue), 30000,
    'Top Gift visar den senaste gåvan i stället för den största');
});

test('en dyrare gåva tar fortfarande över', () => {
  const env = boot();
  env.fire({ type: 'gift', giftName: 'Rose', username: 'forst', coins: 500, count: 1 });
  env.fire({ type: 'gift', giftName: 'Rose', username: 'storre', coins: 900, count: 1 });
  assert.equal(env.widget().dataName, 'storre', 'grinden blockerade ett äkta rekord');
  assert.equal(Number(env.widget().dataValue), 900);
});

test('rekordet delas mellan de två skrivarna', () => {
  const env = boot();
  env.fire({ type: 'gift', giftName: 'Rose', username: 'a', coins: 4200, count: 3 });
  assert.equal(env.h.window.VyraGiftRecords.giftCoins, 4200,
    'live-leaderboard läser den här siffran — utan den finns ingen gemensam sanning');
});
