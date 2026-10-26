'use strict';
// Gift semantics, pinned to real traffic rather than to the library's README.
//
// Measured on staging 2026-08-03 with DEBUG_GIFT_STREAK_SHAPE=true, 14 frames from a real room.
// Every frame reported giftType undefined, gift.type 1 (number), repeatEnd 0/1 (number), and a
// stable source id. repeatCount is CUMULATIVE within a streak:
//
//   streak A   repeatCount 1,3,5,7,9,10,10   repeatEnd 0,0,0,0,0,0,1   diamondCount 1
//   single     repeatCount 1,1               repeatEnd 0,1             diamondCount 10
//   streak B   repeatCount 5,8,8             repeatEnd 0,0,1           diamondCount 1
//
// The old guard read `data.giftType === 1`. That field does not exist in tiktok-live-proto v3, so
// the comparison was always false and every frame was forwarded — streak A counted as 45 gifts and
// 45 diamonds instead of 10 and 10, and even the single gift counted twice. These fixtures are the
// measurement; the fixture below is the contract they pin.
const test = require('node:test'), assert = require('node:assert/strict');
const N = require('../normalizer');
const { MEASURED, frames } = require('./fixtures/gift-frames');

// What the bridge actually forwards: the frames the guard lets through, normalised.
function forwarded(list) {
  return list.filter(f => !(N.isStreakable(f) && !N.isFinalFrame(f))).map(f => N.giftFields(f));
}
const sum = (list, key) => list.reduce((total, e) => total + e[key], 0);

for (const measured of MEASURED) {
  test(`${measured.name}: endast slutframen vidarebefordras`, { timeout: 5000 }, () => {
    const events = forwarded(frames(measured));
    assert.equal(events.length, 1,
      `${events.length} frames vidarebefordrades — kumulativa frames läcker igenom`);
    assert.equal(events[0].count, measured.expectCount);
    assert.equal(events[0].coins, measured.expectDiamonds);
  });

  test(`${measured.name}: summan blir ${measured.expectCount} gifts och ${measured.expectDiamonds} diamanter`,
    { timeout: 5000 }, () => {
      const events = forwarded(frames(measured));
      assert.equal(sum(events, 'count'), measured.expectCount);
      assert.equal(sum(events, 'coins'), measured.expectDiamonds);
    });
}

test('hela den uppmätta sessionen ger 19 gifts och 28 diamanter', { timeout: 5000 }, () => {
  const events = forwarded(MEASURED.flatMap(frames));
  assert.equal(events.length, 3, 'en gåva per streak, inte en per frame');
  // 10 + 1 + 8 gifts, 10 + 10 + 8 diamanter. Utan filtret: 68 gifts och 86 diamanter.
  assert.equal(sum(events, 'count'), 19);
  assert.equal(sum(events, 'coins'), 28);
});

test('utan filtret blir samma session triangulärt uppräknad', { timeout: 5000 }, () => {
  // The defect, stated as a number so the fix has something to be measured against.
  const all = MEASURED.flatMap(frames).map(f => N.giftFields(f));
  assert.equal(sum(all, 'count'), 68);
  assert.equal(sum(all, 'coins'), 86);
});

// ---- fältformerna, exakt som de mättes -----------------------------------------------------------

test('giftType finns inte; streakbarhet läses ur gift.type', { timeout: 5000 }, () => {
  const frame = frames(MEASURED[0])[0];
  assert.equal(frame.giftType, undefined, 'fixturen speglar inte längre den uppmätta formen');
  assert.equal(frame.gift.type, 1);
  assert.equal(N.isStreakable(frame), true);
});

test('äldre former läses fortfarande: platt giftType och giftDetails', { timeout: 5000 }, () => {
  assert.equal(N.isStreakable({ giftType: 1 }), true);
  assert.equal(N.isStreakable({ giftDetails: { giftType: 1 } }), true);
  assert.equal(N.isStreakable({ gift: { type: 2 } }), false);
});

test('repeatEnd tolkas både som tal och som boolean', { timeout: 5000 }, () => {
  assert.equal(N.isFinalFrame({ repeatEnd: 1 }), true);
  assert.equal(N.isFinalFrame({ repeatEnd: 0 }), false);
  assert.equal(N.isFinalFrame({ repeatEnd: true }), true);
  assert.equal(N.isFinalFrame({ repeatEnd: false }), false);
  // A gift without the field at all is complete on arrival — dropping it would lose the event.
  assert.equal(N.isFinalFrame({}), true);
});

test('en icke-streakbar gåva vidarebefordras direkt, oavsett repeatEnd', { timeout: 5000 }, () => {
  const frame = { gift: { type: 2, diamondCount: 5 }, repeatCount: 4, repeatEnd: 0,
    user: { idStr: 'u9', displayId: 'b' } };
  assert.equal(N.isStreakable(frame), false);
  assert.equal(forwarded([frame]).length, 1, 'en gåva som inte streakar får inte filtreras bort');
  assert.equal(forwarded([frame])[0].coins, 20, '5 diamanter × 4');
});

test('stabilt ID kommer från common.msgId, med äldre fallback', { timeout: 5000 }, () => {
  assert.equal(N.sourceId({ common: { msgId: '7412' } }), '7412');
  assert.equal(N.sourceId({ msgId: 'legacy' }), 'legacy');
  assert.equal(N.sourceId({ logId: 'log' }), 'log');
  assert.equal(N.sourceId({}), '');
  // Same frame, same id on every retry — the whole point of not minting a new one per attempt.
  const frame = frames(MEASURED[0])[6];
  assert.equal(N.sourceId(frame), N.sourceId(frame));
});

test('avataren läses från avatarLarge, med äldre avatarLarger som fallback', { timeout: 5000 }, () => {
  assert.equal(N.profileImageOf({ user: { avatarLarge: { urlList: ['stor'] } } }), 'stor');
  assert.equal(N.profileImageOf({ user: { avatarLarger: { urlList: ['äldre'] } } }), 'äldre');
  // v3 name wins when both are present.
  assert.equal(N.profileImageOf({ user: {
    avatarLarge: { urlList: ['stor'] }, avatarLarger: { urlList: ['äldre'] } } }), 'stor');
  assert.equal(N.profileImageOf({ user: { avatarMedium: { urlList: ['mellan'] } } }), 'mellan');
});

test('diamantvärdet är diamondCount × repeatCount', { timeout: 5000 }, () => {
  const frame = { gift: { type: 1, diamondCount: 7 }, repeatCount: 3, repeatEnd: 1,
    user: { idStr: 'u1', displayId: 'a' } };
  assert.equal(N.giftFields(frame).coins, 21);
  assert.equal(N.giftFields(frame).count, 3);
});

// The open question the traffic could not answer: every gift observed had gift.type === 1, so the
// non-streakable branch is unproven by traffic. It is pinned to the connector's own proto contract
// instead — Gift.type is a number and repeatEnd is a number on WebcastGiftMessage — and the rule is
// deliberately conservative: only a gift we can positively identify as streakable is ever filtered.
test('en frame med uttryckligt repeatEnd 0 filtreras bara om den är streakbar', { timeout: 5000 }, () => {
  const unknownType = { gift: { diamondCount: 2 }, repeatCount: 1, repeatEnd: 0,
    user: { idStr: 'u2', displayId: 'c' } };
  assert.equal(N.isStreakable(unknownType), false, 'okänd typ får inte antas vara streakbar');
  assert.equal(forwarded([unknownType]).length, 1,
    'en gåva av okänd typ tappas — trafiken har inte bevisat det beteendet');
});

test('protokontraktet som fixturen vilar på gäller fortfarande', { timeout: 5000 }, () => {
  const fs = require('fs'), path = require('path');
  const dts = path.join(__dirname, '..', 'node_modules', 'tiktok-live-proto', 'dist', 'node', 'v3.d.ts');
  if (!fs.existsSync(dts)) return; // shallow checkout without node_modules
  const source = fs.readFileSync(dts, 'utf8');
  const start = source.indexOf('interface WebcastGiftMessage {');
  assert.notEqual(start, -1, 'WebcastGiftMessage saknas i proto v3');
  const body = source.slice(start, source.indexOf('\n}', start));
  assert.ok(!/^\s*giftType\s*[?:]/m.test(body), 'giftType har återuppstått på meddelandet');
  assert.match(body, /repeatCount: number;/);
  assert.match(body, /repeatEnd: number;/, 'repeatEnd är inte längre ett tal');
  assert.match(body, /common: CommonMessageData \| undefined;/);
});

// ---- gåvan syns vid första tappet (2026-10-26) ----------------------------------------------------
// Bryggan skickar en streaks FÖRSTA frame direkt som `streakstart` (bara visning) och slutframen som
// `gift` (den enda som räknas). Provet kör de uppmätta framen genom samma beslut som bridge.js gör.
function genomBryggan(list, oppna = new Map(), nu = () => 1_000) {
  const ut = [];
  for (const f of list) {
    const b = N.streakBeslut(oppna, f, nu());
    if (b.typ) ut.push({ typ: b.typ, streakId: b.streakId, ...N.giftFields(f) });
  }
  return ut;
}

for (const measured of MEASURED) {
  test(`${measured.name}: en streakstart vid första framen, en gift vid slutet, samma streakId`, { timeout: 5000 }, () => {
    const ut = genomBryggan(frames(measured));
    assert.deepEqual(ut.map(e => e.typ), ['streakstart', 'gift'], 'en start och en slutsumma — inte en per tapp');
    assert.ok(ut[0].streakId && ut[0].streakId === ut[1].streakId, 'slutframen ska bära startens streakId');
    assert.equal(ut[1].count, measured.expectCount, 'slutsumman är oförändrad');
    assert.equal(ut[0].count, measured.repeatCounts[0], 'starten visar första framens antal');
  });
}

test('det som räknas är oförändrat: bara gift, 19 gifts och 28 diamanter för hela sessionen', { timeout: 5000 }, () => {
  const ut = genomBryggan(MEASURED.flatMap(frames));
  const gavor = ut.filter(e => e.typ === 'gift');
  assert.equal(gavor.length, 3);
  assert.equal(sum(gavor, 'count'), 19);
  assert.equal(sum(gavor, 'coins'), 28);
  assert.equal(ut.filter(e => e.typ === 'streakstart').length, 3, 'en start per streak');
});

test('två tittare i samma streak-ögonblick hålls isär, och groupId skiljer två kombon åt', { timeout: 5000 }, () => {
  const ram = (anv, groupId, repeatCount, repeatEnd) => ({ gift: { id: '5655', name: 'Rose', type: 1, diamondCount: 1 }, giftId: '5655',
    groupId, repeatCount, repeatEnd, user: { idStr: anv, displayId: anv } });
  const ut = genomBryggan([ram('a', 'g1', 1, 0), ram('b', 'g9', 1, 0), ram('a', 'g1', 4, 0), ram('b', 'g9', 2, 1), ram('a', 'g1', 5, 1)]);
  assert.deepEqual(ut.map(e => `${e.typ}:${e.username || e.uniqueId || ''}`.split(':')[0]), ['streakstart', 'streakstart', 'gift', 'gift']);
  assert.notEqual(ut[0].streakId, ut[1].streakId, 'två tittare fick samma streak');
  assert.equal(ut[2].streakId, ut[1].streakId, 'b:s slutframe ska höra till b:s start');
  assert.equal(ut[3].streakId, ut[0].streakId, 'a:s slutframe ska höra till a:s start');
});

test('en gåva utan repeatEnd är klar direkt och ger ingen start', { timeout: 5000 }, () => {
  const ut = genomBryggan([{ gift: { id: '1', type: 1, diamondCount: 5 }, giftId: '1', repeatCount: 1, user: { idStr: 'x' } }]);
  assert.deepEqual(ut.map(e => e.typ), ['gift']);
  assert.equal(ut[0].streakId, '', 'utan visad start bär slutframen inget streakId');
});

test('en streak vars slutframe aldrig kom glöms efter två minuter', { timeout: 5000 }, () => {
  const oppna = new Map();
  let t = 0;
  genomBryggan([{ gift: { id: '1', type: 1 }, giftId: '1', repeatCount: 1, repeatEnd: 0, user: { idStr: 'borta' } }], oppna, () => t);
  assert.equal(oppna.size, 1);
  t = N.STREAK_GLOMS_MS + 1;
  genomBryggan([{ gift: { id: '2', type: 1 }, giftId: '2', repeatCount: 1, user: { idStr: 'annan' } }], oppna, () => t);
  assert.equal(oppna.size, 0, 'en övergiven streak ligger kvar för alltid');
});
