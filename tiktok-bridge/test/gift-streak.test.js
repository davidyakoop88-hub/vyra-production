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
