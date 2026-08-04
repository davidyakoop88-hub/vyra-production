'use strict';
// A2: Top Streak visar samma sak som Top Gift.
//
// Handlern i gift-event-images.js behandlade de två typerna i en och samma gren och gav båda
// exakt samma fält, inklusive `dataValue = coins`. Widgetarna mäter olika saker:
//
//   Top Gift    — den dyraste gåvan. Bryggan skickar coins = värde per gåva × antal.
//   Top Streak  — den längsta comboen. Bryggan skickar count = repeatCount.
//
// Se tiktok-bridge/normalizer.js: `coins:coinsEach*repeatCount, count:repeatCount`. En billig gåva
// spammad 50 gånger är en stor streak men en liten gåva; en enda dyr gåva är tvärtom. Med en delad
// gren blev båda widgetarna en dubblett av den senaste gåvan.
//
// Båda är dessutom "topp"-widgetar, inte "senaste"-widgetar: de ska bara ändras när ett rekord slås.
//
// RÖTT NU: en gåva uppdaterar båda widgetarna, varje gång, med samma siffra.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'gift-event-images.js'), 'utf8');

function makeEnv() {
  const listeners = {};
  const widgets = [
    { id: 'tg1', type: 'templateTopGift', dataValue: 0, dataName: '@StreamQueen' },
    { id: 'ts1', type: 'templateTopStreak', dataValue: 0, dataName: '@StreamQueen' }
  ];
  const state = { widgets };
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Map, Set, Boolean, Error,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    addEventListener: (n, fn) => { (listeners[n] = listeners[n] || []).push(fn) },
    state,
    save: () => { throw new Error('save() får aldrig anropas från livevägen') },
    render: () => { throw new Error('render() får aldrig anropas från livevägen') },
    VYRA_GIFTS: [{ name: 'Rose', file: 'assets/gifts/rose.png' }]
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: 'gift-event-images.js' });

  const gift = detail => {
    for (const fn of listeners['vyra-live-event'] || []) fn({ detail, type: 'vyra-live-event' });
  };
  const topGift = () => widgets[0], topStreak = () => widgets[1];
  return { sandbox, state, gift, topGift, topStreak };
}

// En dyr engångsgåva: stort coins-värde, combo 1.
const DYR = { type: 'gift', giftName: 'Rose', username: 'rik_tittare', coins: 30000, count: 1,
  profileImage: 'https://cdn/rik.jpg' };
// En billig gåva spammad många gånger: liten coins-summa, lång combo.
const LANG = { type: 'gift', giftName: 'Rose', username: 'spam_tittare', coins: 50, count: 99,
  profileImage: 'https://cdn/spam.jpg' };

test('en lång billig combo sätter Top Streak men rör inte Top Gift', () => {
  const env = makeEnv();
  env.gift(DYR);   // sätter rekordet för coins
  env.gift(LANG);  // slår streak-rekordet men inte coins-rekordet

  assert.equal(env.topStreak().dataValue, 99, 'Top Streak ska visa combolängden');
  assert.equal(env.topStreak().dataName, 'spam_tittare');

  assert.equal(env.topGift().dataValue, 30000, 'Top Gift ändrades av en billigare gåva');
  assert.equal(env.topGift().dataName, 'rik_tittare', 'Top Gift bytte namn på en billigare gåva');
});

test('en dyr engångsgåva sätter Top Gift men rör inte Top Streak', () => {
  const env = makeEnv();
  env.gift(LANG);  // sätter rekordet för streak
  env.gift(DYR);   // slår coins-rekordet men inte streak-rekordet

  assert.equal(env.topGift().dataValue, 30000, 'Top Gift ska visa coins');
  assert.equal(env.topGift().dataName, 'rik_tittare');

  assert.equal(env.topStreak().dataValue, 99, 'Top Streak ändrades av en kortare combo');
  assert.equal(env.topStreak().dataName, 'spam_tittare', 'Top Streak bytte namn på en kortare combo');
});

test('widgetarna visar olika siffror för samma gåva', () => {
  const env = makeEnv();
  env.gift({ type: 'gift', giftName: 'Rose', username: 'a', coins: 500, count: 10 });
  assert.equal(env.topGift().dataValue, 500, 'Top Gift ska visa coins');
  assert.equal(env.topStreak().dataValue, 10, 'Top Streak ska visa antalet, inte coins');
  assert.notEqual(env.topGift().dataValue, env.topStreak().dataValue,
    'widgetarna visar fortfarande samma siffra — det är hela buggen');
});

test('en sämre gåva ändrar ingendera widgeten', () => {
  const env = makeEnv();
  env.gift({ type: 'gift', giftName: 'Rose', username: 'bast', coins: 9000, count: 40 });
  env.gift({ type: 'gift', giftName: 'Rose', username: 'samre', coins: 10, count: 2 });
  assert.equal(env.topGift().dataName, 'bast', 'Top Gift är en topplista, inte "senaste gåvan"');
  assert.equal(env.topStreak().dataName, 'bast', 'Top Streak är en topplista, inte "senaste comboen"');
});

test('combo läses även när fältet heter repeatCount eller combo', () => {
  for (const field of ['count', 'repeatCount', 'combo']) {
    const env = makeEnv();
    env.gift({ type: 'gift', giftName: 'Rose', username: 'u', coins: 10, [field]: 33 });
    assert.equal(env.topStreak().dataValue, 33, `fältet ${field} lästes inte`);
  }
});

test('en gåva utan combo räknas som en enda', () => {
  const env = makeEnv();
  env.gift({ type: 'gift', giftName: 'Rose', username: 'u', coins: 700 });
  assert.equal(env.topStreak().dataValue, 1, 'saknad combo ska bli 1, inte 0 eller coins');
  assert.equal(env.topGift().dataValue, 700);
});

test('rekorden exponeras så att andra skrivare kan respektera dem', () => {
  // live-leaderboard.js skriver också till templateTopGift, på varje gåva. Utan en gemensam
  // sanning skulle separationen gälla i testet men inte i produktion.
  const env = makeEnv();
  env.gift(DYR);
  env.gift(LANG);
  const records = env.sandbox.VyraGiftRecords;
  assert.ok(records, 'ingen delad rekordkälla exponerades');
  assert.equal(records.giftCoins, 30000);
  assert.equal(records.streakCount, 99);
});

test('kampanjer räknar fortfarande varje gåva, inte bara rekord', () => {
  const env = makeEnv();
  env.state.widgets.push({ id: 'c1', type: 'templateGiftCampaign', giftName0: 'Rose', giftCurrent0: 0 });
  env.sandbox.VyraCampaignItems = w => [{ name: 'Rose', current: Number(w.giftCurrent0 || 0), target: 100 }];
  env.gift({ type: 'gift', giftName: 'Rose', username: 'a', coins: 9000, count: 5 });
  env.gift({ type: 'gift', giftName: 'Rose', username: 'b', coins: 10, count: 1 });
  assert.equal(Number(env.state.widgets[2].giftCurrent0), 6,
    'kampanjen ska summera alla gåvor — rekordgrindarna gäller bara topplistorna');
});
