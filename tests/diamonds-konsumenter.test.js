'use strict';
// #133 steg 2: konsumenterna laser `diamonds` forst och `coins` bara som reserv.
//
// Talet ar detsamma — bryggan och klientgransen satter bada falten till samma tal (se
// tests/diamanter-faltnamn.test.js). Det som provas har ar att varje lasare (1) raknar en handelse
// som BARA bar `diamonds`, sa att `coins` kan tas bort i steg 3 utan att nagot blir noll, och
// (2) fortfarande raknar en handelse som bara bar `coins`, fran en aldre .exe som inte kan
// uppdateras retroaktivt.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function poangsystem() {
  const listeners = {}, tillagt = [];
  const sb = {
    console, JSON, Object, Number, String, Math, Date,
    localStorage: { getItem: () => null, setItem() {} },
    document: { querySelector: () => null, addEventListener() {} },
    MutationObserver: class { observe() {} },
    setInterval() {}, setTimeout() {},
    addEventListener: (n, fn) => (listeners[n] = listeners[n] || []).push(fn),
    VyraPoints: { add: (u, n) => tillagt.push([u, n]) }
  };
  sb.window = sb;
  vm.runInNewContext(read('points-system.js'), sb, { filename: 'points-system.js' });
  return {
    tillagt,
    skicka: detail => (listeners['vyra-live-event'] || []).forEach(fn => fn({ detail }))
  };
}

test('poangsystemet raknar en gava som bara bar diamonds', () => {
  const p = poangsystem();
  p.skicka({ type: 'gift', username: 'ny', diamonds: 40 });
  assert.deepEqual(p.tillagt, [['ny', 40]]);
});

test('poangsystemet raknar fortfarande en gava fran en aldre .exe (bara coins)', () => {
  const p = poangsystem();
  p.skicka({ type: 'gift', username: 'gammal', coins: 25 });
  assert.deepEqual(p.tillagt, [['gammal', 25]]);
});

test('poangsystemet raknar en gava med bada namnen EN gang', () => {
  const p = poangsystem();
  p.skicka({ type: 'gift', username: 'bada', diamonds: 10, coins: 10 });
  assert.deepEqual(p.tillagt, [['bada', 10]]);
});

// Kalltextsvakt for resten: filerna ar webblasar-IIFE:er med DOM, VFX-motor eller canvas runt
// lasningen, och att ladda dem bara for att prova ett uttryck hade provat riggen, inte lasningen.
// Varje rad pinnar att `diamonds` star FORE `coins` i samma lasning.
const LASARE = [
  ['live-leaderboard.js', /Number\(e\.diamonds \|\| e\.coins \|\| e\.diamondCount \|\| e\.value\)/],
  ['stream-time-analytics.js', /ev\.diamonds \|\| ev\.coins/],
  ['battle-mvp-session.js', /\[e\.diamonds, e\.coins, e\.value, e\.diamondCount\]/],
  ['gift-event-images.js', /detail\.diamonds \|\| detail\.coins/],
  ['gift-bubbles.js', /\[d\.diamonds,d\.coins,d\.value,d\.diamondCount\]/],
  ['gift-fireworks.js', /\[d\.diamonds,d\.coins,d\.value,d\.diamondCount\]/],
  ['gift-fireworks.js', /\[d\.diamonds,d\.coins,d\.value\]/],
  ['heart-fireworks.js', /\[d\.diamonds,d\.coins,d\.value,d\.diamondCount\]/],
  ['live-control.js', /coins:e\.diamonds\?\?e\.coins,diamonds:e\.diamonds\?\?e\.coins/],
  ['action-runtime.js', /coins:p\.diamonds\|\|p\.coins\|\|0/],
  ['action-options.js', /coins:p\.diamonds\|\|p\.coins\|\|1/],
  ['recognition-normalizer.js', /rawEvent\.diamonds != null \? rawEvent\.diamonds : rawEvent\.coins/],
  ['public/widgets/last-x-alerts.html', /nOf\(e\.diamonds,e\.coins,e\.value\)/],
  ['media.js', /person\.diamonds\?\?person\.coins/],
  ['live-client.js', /getTop\('diamonds',1\)/]
];

for (const [fil, monster] of LASARE) {
  test(`${fil} laser diamonds fore coins`, () => {
    assert.match(read(fil), monster, `${fil} laser inte diamonds forst — steg 3 skulle nolla den`);
  });
}
