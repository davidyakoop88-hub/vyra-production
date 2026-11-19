'use strict';
// BARRAGE-SONDEN (2026-11-19). I sändningen 2026-11-19 visade TikTok "nådde medlemsnivå 25" för en
// tittare, men bryggan skickade ingen fanlevelup och ingenting skrev ner hur meddelandet såg ut.
// Sonden loggar formen på varje BARRAGE som ingen gren känner igen — utan personer.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const N = require('../normalizer.js');
const BRIDGE = fs.readFileSync(path.join(__dirname, '..', 'bridge.js'), 'utf8');

// Formerna nedan är uppmätta 2026-11-19 i fyra pågående sändningar (G:\vyra-lokal\barrage-sond.jsonl).
const entre = { subType: 'user_level_entrance', scene: 'user_level_entrance', msgType: 9,
  content: { key: 'pm_mt_alp_join_animation', defaultPattern: 'joined', pieces: [{ type: 11, stringValue: 'Lisa Hemlig', userValue: { user: { nickname: 'Lisa Hemlig', id: '123456789' } } }] },
  user: { id: '123456789', nickname: 'Lisa Hemlig', displayId: 'lisa_hemlig' } };
const fansEntre = { subType: 'fans_entrance', scene: 'fans_entrance', msgType: 11,
  content: { key: 'pm_mt_fan_live_join', defaultPattern: 'joined', pieces: [{ type: 11, stringValue: 'Lisa Hemlig' }] },
  fansLevelParam: { currentGrade: 42 }, user: { id: '123456789', nickname: 'Lisa Hemlig' } };
// En höjning i en form regeln INTE känner igen: annan subType, nivån som andra biten.
const okandHojning = { subType: 'fans_upgrade_v2', scene: 'fans_upgrade_v2', msgType: 12,
  content: { key: 'pm_mt_fan_live_upgrade_bullet_tier', defaultPattern: '{0:user} reached member Lv.{1:string}',
    pieces: [{ type: 11, stringValue: 'Lisa Hemlig' }, { type: 1, stringValue: '25' }] },
  user: { id: '123456789', nickname: 'Lisa Hemlig', displayId: 'lisa_hemlig' } };

test('formen bär aldrig namn eller id — bara sort, nyckel, mall, bitsorter och rena tal', () => {
  for (const d of [entre, fansEntre, okandHojning]) {
    const rad = JSON.stringify(N.barrageForm(d));
    assert.ok(!/Lisa|Hemlig|lisa_hemlig|123456789/.test(rad), 'personuppgift i loggraden: ' + rad);
  }
  const f = N.barrageForm(okandHojning);
  assert.equal(f.subType, 'fans_upgrade_v2');
  assert.equal(f.nyckel, 'pm_mt_fan_live_upgrade_bullet_tier');
  assert.equal(f.monster, '{0:user} reached member Lv.{1:string}');
  assert.deepEqual(f.bitar, [11, 1]);
  assert.deepEqual(f.tal, [25], 'nivån ska följa med, det är den som ska läsas ut');
  assert.equal(N.barrageForm(fansEntre).fansNiva, 42);
});

test('en höjning regeln inte känner igen räknas som nivåmeddelande, en entré gör det inte', () => {
  assert.equal(N.fansUppgradering(okandHojning), null, 'kontroll: regeln känner inte igen formen');
  assert.equal(N.barrageRorNiva(N.barrageForm(okandHojning)), true);
  assert.equal(N.barrageRorNiva(N.barrageForm(entre)), false, 'user_level_entrance är en entré och kommer hela tiden');
  assert.equal(N.barrageRorNiva(N.barrageForm(fansEntre)), false);
});

test('skräp kastar aldrig — sonden ligger i livevägen', () => {
  for (const d of [null, undefined, 7, 'x', {}, { content: null }, { content: { pieces: 'nej' } }]) {
    assert.doesNotThrow(() => N.barrageForm(d));
    assert.equal(N.barrageRorNiva(N.barrageForm(d)), false);
  }
});

test('bryggan loggar bara det ingen gren kände igen, och höjningen skickas som förut', () => {
  const lyssnare = BRIDGE.slice(BRIDGE.indexOf('connection.on(WebcastEvent.BARRAGE'));
  const slut = lyssnare.indexOf('loggaBarrageSond(data)');
  assert.ok(slut > 0, 'BARRAGE-lyssnaren anropar inte sonden');
  const fore = lyssnare.slice(0, slut);
  assert.match(fore, /if \(upp\) \{ sendEvent\('fanlevelup', upp, data\); return; \}/, 'en igenkänd höjning ska skickas och INTE loggas som okänd');
  assert.match(BRIDGE, /BARRAGE_SOND_NIVA_TAK = \d+/, 'sonden saknar tak');
});
