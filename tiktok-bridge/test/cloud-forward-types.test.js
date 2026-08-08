'use strict';
// Vilka typer molnbryggan får posta till ingest-rutten — och varför det inte är "alla".
//
// TVÅ MÄTTA FEL, båda i den väg som ska köra i Railway när Davids dator är avstängd:
//
// 1. bridge.js:305 skickar `chatcommand` när en chattrad börjar med "!". Den typen finns inte i
//    server/index.js:72, så molnet svarar 400. Bryggan loggar det (bridge.js:216 kastar på !r.ok och
//    fångar med console.error) — alltså inte tyst, men en console.error per utropsteckenkommando
//    under hela sändningen, i en logg där riktiga fel ska synas.
//
// 2. VÄRRE: takten kollas FÖRE valideringen (server/index.js:108 före :111). Chatt är den
//    överlägset frekventaste typen under en aktiv sändning, och ingest-taket är 100 event/s per
//    workspace. Chatten kan alltså äta upp budgeten och få GÅVOR att avvisas med 429 — och gåvor
//    är det enda som betyder något för intäktsstatistiken. Ett event som avvisas där finns inte i
//    historiken, och det går inte att upptäcka i efterhand.
//
// Samma vitlista som electron-app/local-server.js fick: en okänd typ stannar hemma tills någon
// medvetet släpper fram den.
//
// ROTT NU: normalizer.js exporterar ingen sådan regel.
const test = require('node:test'), assert = require('node:assert/strict');
const N = require('../normalizer.js');

// Molnets egen lista, server/index.js:72. Kopierad med flit: bryts kontraktet ska det här provet
// falla, inte tyst följa med.
const MOLNETS_TYPER = ['gift', 'like', 'likes', 'chat', 'follow', 'share', 'member', 'subscribe',
  'viewer', 'battle'];

test('regeln finns och är en funktion', () => {
  assert.equal(typeof N.tillMolnet, 'function', 'normalizer.js exporterar ingen tillMolnet-regel');
});

test('allt som släpps fram accepteras av molnet', () => {
  const avvisade = MOLNETS_TYPER.concat(['chatcommand', 'subscriberemote', 'nagotnytt', ''])
    .filter(t => N.tillMolnet(t) && !MOLNETS_TYPER.includes(t));
  assert.deepEqual(avvisade, [],
    `dessa släpps fram men avvisas av molnet med 400: ${avvisade.join(', ')}`);
});

test('chatcommand stoppas', () => {
  assert.equal(N.tillMolnet('chatcommand'), false,
    'chatcommand postas fortfarande och ger 400 — en console.error per utropsteckenkommando');
});

// Chatt är giltig för molnet men får ändå inte skickas: den äter takten och kan svälta gåvorna.
test('chatt stoppas på volym, inte på giltighet', () => {
  assert.equal(N.tillMolnet('chat'), false,
    'chatt äter ingest-takten (100/s) och kan få gåvor avvisade med 429');
  assert.ok(MOLNETS_TYPER.includes('chat'), 'kontrollprov: chatt ÄR giltig för molnet');
});

test('gåvor och likes släpps alltid fram', () => {
  for (const typ of ['gift', 'likes', 'like', 'follow', 'share', 'subscribe', 'member']) {
    assert.equal(N.tillMolnet(typ), true, `${typ} stoppades — statistiken blir ofullständig`);
  }
});

test('en okänd typ stannar hemma', () => {
  for (const typ of ['nagotheltnytt', '', null, undefined, 'GIFT ']) {
    assert.equal(N.tillMolnet(typ), false, `"${String(typ)}" släpptes fram`);
  }
});

// Vitlistan är värdelös om bridge.js inte använder den. Källkodskontroll: bridge.js ansluter till
// TikTok och går inte att köra i en testprocess.
const fs = require('fs'), path = require('path');
const bridgeKod = fs.readFileSync(path.join(__dirname, '..', 'bridge.js'), 'utf8')
  .split(/\r?\n/).map(r => r.replace(/\/\/[^\r\n]*/, '')).join('\n');

test('bridge.js filtrerar molnpostningen genom regeln', () => {
  const rad = bridgeKod.split('\n').find(l => /\/api\/events\/tiktok\//.test(l));
  assert.ok(rad, 'hittade ingen molnpostning i bridge.js');
  assert.match(rad, /tillMolnet\(/,
    `molnpostningen filtrerar inte: ${rad.trim().slice(0, 160)}`);
});

// Den LOKALA postningen ska vara oförändrad. Overlayen läser den, och den har inga typbegränsningar
// — att smyga in filtret där hade tystat chattwidgetar.
test('den lokala postningen filtreras inte', () => {
  const rad = bridgeKod.split('\n').find(l => /postJson\('\/api\/events'/.test(l));
  assert.ok(rad, 'hittade ingen lokal postning');
  assert.equal(/tillMolnet/.test(rad), false,
    'filtret hamnade på den lokala vägen — chattwidgetar i OBS hade slutat få händelser');
});
