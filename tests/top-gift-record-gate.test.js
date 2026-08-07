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
  assert.equal(env.h.window.VyraGiftRecords.giftCoins, 1400,
    'live-leaderboard läser den här siffran — utan den finns ingen gemensam sanning');
});

// ---- styckpris, inte combosumma ---------------------------------------------------------------
// Davids regel 2026-08-07, ordagrant: "1 ros 1 coins, 11 rosor 1 coins". Top Gift rankar GÅVANS
// värde. Elva rosor är elva gånger samma ros, inte en gåva värd elva, och får därför aldrig slå ut
// en gåva som ensam kostar mer.
//
// Bryggan skickar `coins` som styckpris × antal (normalizer.js: `coins: coinsEach * repeatCount`)
// och `count` som antalet. Den totalen är RÄTT för Top Coins, för fyrverkeriernas fwMin, för målen
// och för giftCoins-triggern — därför räknas styckpriset fram här, hos Top Gifts två skrivare, och
// fältet över nätet lämnas i fred. Ett test längre ned vaktar att eventet inte muteras.
//
// Streaks kommer som ETT event med repeatCount, inte elva separata (bryggan släpper bara igenom
// sista framen), så det är just den multiplikationen som avgör utfallet.
const gift = (over = {}) => ({ type: 'gift', giftName: 'Rose', username: 'x', count: 1, ...over });

test('en ros är 1 coins, och elva rosor är också 1 coins', () => {
  const env = boot();
  env.fire(gift({ username: 'en', coins: 1, count: 1 }));
  assert.equal(Number(env.widget().dataValue), 1, 'en ensam ros visade fel värde');

  const env2 = boot();
  env2.fire(gift({ username: 'elva', coins: 11, count: 11 }));
  assert.equal(Number(env2.widget().dataValue), 1,
    'elva rosor visades som 11 — combons summa i stället för gåvans värde');
});

test('elva rosor tar inte över ett tio-coins-rekord', () => {
  const env = boot();
  env.fire(gift({ username: 'tio', giftName: 'Perfume', coins: 10, count: 1 }));
  assert.equal(Number(env.widget().dataValue), 10);

  env.fire(gift({ username: 'rosor', coins: 11, count: 11 }));
  assert.equal(env.widget().dataName, 'tio',
    'elva rosor (11 totalt, 1 styck) slog ut en gåva som ensam kostar 10');
  assert.equal(Number(env.widget().dataValue), 10);
});

test('en dyrare enskild gåva tar över, oavsett antal', () => {
  const env = boot();
  env.fire(gift({ username: 'tio', coins: 10, count: 1 }));
  env.fire(gift({ username: 'galaxy', giftName: 'Galaxy', coins: 1000, count: 1 }));
  assert.equal(env.widget().dataName, 'galaxy', 'ett äkta rekord blockerades');
  assert.equal(Number(env.widget().dataValue), 1000);
});

test('tre Galaxy visar 1000, inte 3000', () => {
  const env = boot();
  env.fire(gift({ username: 'tre', giftName: 'Galaxy', coins: 3000, count: 3 }));
  assert.equal(Number(env.widget().dataValue), 1000,
    'antalet drev upp värdet — Top Gift ska visa vad gåvan kostar, inte vad combon summerade till');
});

test('count som saknas eller är noll behandlas som en enda gåva', () => {
  const utan = boot();
  utan.fire({ type: 'gift', giftName: 'Rose', username: 'utan', coins: 250 });
  assert.equal(Number(utan.widget().dataValue), 250, 'ett event utan count tappade sitt värde');

  const noll = boot();
  noll.fire(gift({ username: 'noll', coins: 250, count: 0 }));
  assert.equal(Number(noll.widget().dataValue), 250,
    'count:0 gav en division som inte går att visa');
});

test('eventet självt lämnas orört — coins bär fortfarande totalen', () => {
  const env = boot();
  const e = gift({ username: 'a', coins: 3000, count: 3 });
  env.fire(e);
  assert.equal(e.coins, 3000,
    'Top Gift skrev om coins i eventet — Top Coins, fwMin, målen och giftCoins-triggern läser det');
  assert.equal(e.count, 3, 'antalet skrevs om');
});
