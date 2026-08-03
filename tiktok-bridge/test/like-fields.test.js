'use strict';
// Every like reaching production carried count 0 and value 0 — all 251 of them in the sample we
// measured — while TikTok's own counter climbed past 2.7K. Nothing was broken between the bridge
// and the browser: the bridge was reading field names that no longer exist.
//
// tiktok-live-connector 2.4.0 imports its message types from tiktok-live-proto/v3, where
// WebcastLikeMessage is:
//
//     count: number     (was likeCount in v1/v2)
//     total: string     (was totalLikeCount in v1/v2 — and is now a STRING)
//
// The library README still documents the v1/v2 names, which is why this went unnoticed. These
// tests pin both shapes, the string total, and the one mistake that would be worse than the bug:
// treating the running room total as a per-event increment.
const test = require('node:test'), assert = require('node:assert/strict');
const N = require('../normalizer');

// A realistic v3 payload. Only the fields under test plus the user block likeFields reads.
const v3 = (over = {}) => ({
  common: { msgId: '1' },
  count: 7,
  total: '2748',
  color: 0,
  user: { uniqueId: 'jokero', nickname: 'Jokero' },
  ...over
});

// The v1/v2 shape the old code was written against.
const v12 = (over = {}) => ({
  user: { uniqueId: 'jokero', nickname: 'Jokero' },
  likeCount: 7,
  totalLikeCount: 2748,
  ...over
});

test('a v3 like yields a real increment', () => {
  const f = N.likeFields(v3());
  assert.equal(f.count, 7, 'count är inkrementet i v3 och måste läsas');
  assert.equal(f.username, 'jokero');
});

test('a v1/v2 like still works through the fallback', () => {
  // The socket shape is not ours to control; a downgrade or a proxy speaking the old protocol must
  // not silently zero the leaderboard again.
  const f = N.likeFields(v12());
  assert.equal(f.count, 7);
  assert.equal(f.points, 2748);
});

test('the v3 string total is converted, not dropped', () => {
  // `total` is typed as string in v3. Number('2748') is 2748; a missing conversion would give NaN
  // and number() would floor it to 0, which is how a running total quietly disappears.
  const f = N.likeFields(v3());
  assert.equal(f.points, 2748);
  assert.equal(typeof f.points, 'number');
});

test('the running total is never used as the increment', () => {
  // The failure mode that would be worse than the original bug: every like would add the whole
  // room total, so one viewer's tally would explode by thousands per event.
  const f = N.likeFields(v3({ count: 1, total: '999999' }));
  assert.equal(f.count, 1, 'inkrementet måste komma från count, aldrig från total');
  assert.notEqual(f.count, 999999);
});

test('count and points are carried separately, never merged', () => {
  const f = N.likeFields(v3({ count: 3, total: '500' }));
  assert.equal(f.count, 3);
  assert.equal(f.points, 500);
  assert.notEqual(f.count, f.points, 'de två fälten får inte kollapsa till samma värde');
});

test('v3 wins when a payload somehow carries both namings', () => {
  // Defensive: if a shim ever populates both, the current protocol must decide.
  const f = N.likeFields(v3({ count: 4, likeCount: 99, total: '10', totalLikeCount: 88 }));
  assert.equal(f.count, 4);
  assert.equal(f.points, 10);
});

test('a genuine zero stays zero rather than falling through to the total', () => {
  // ?? not ||: count 0 is a real value and must not make the code reach for likeCount, and a 0
  // increment must never be replaced by the room total.
  const f = N.likeFields(v3({ count: 0, likeCount: 5, total: '2748' }));
  assert.equal(f.count, 0, 'ett äkta 0 får inte ersättas av det gamla fältet');
  assert.equal(f.points, 2748);
});

test('a like with no count fields at all is 0, not NaN', () => {
  const f = N.likeFields({ user: { uniqueId: 'x' } });
  assert.equal(f.count, 0);
  assert.equal(f.points, 0);
  assert.ok(Number.isFinite(f.count) && Number.isFinite(f.points));
});

test('garbage values degrade to 0 instead of poisoning the tally', () => {
  for (const bad of ['abc', null, undefined, {}, [], NaN, -5]) {
    const f = N.likeFields(v3({ count: bad, total: bad }));
    assert.ok(Number.isFinite(f.count) && f.count >= 0, `count blev ogiltigt för ${JSON.stringify(bad)}`);
    assert.ok(Number.isFinite(f.points) && f.points >= 0, `points blev ogiltigt för ${JSON.stringify(bad)}`);
  }
});

test('the user block still comes through', () => {
  // likeFields must not regress what baseUser already provided — the leaderboard drops any event
  // without a username, so losing this would trade one silent failure for another.
  const f = N.likeFields(v3());
  assert.equal(f.username, 'jokero');
  assert.equal(f.name, 'Jokero');
});

// ---- end to end through the cloud contract ----------------------------------------------------
test('a v3 like survives cloudEvent with count > 0', () => {
  // cloudEvent is what actually reaches the API, and it maps value from coins ?? points ?? score.
  // This is the assertion that would have caught the production bug at build time.
  const e = N.cloudEvent('k1', 'likes', N.likeFields(v3()));
  assert.equal(e.type, 'likes');
  assert.equal(e.count, 7, 'count måste överleva hela vägen till molnkontraktet');
  assert.equal(e.value, 2748);
  assert.equal(e.username, 'jokero');
});

test('the exact production payload we measured no longer produces a zero', () => {
  // Reconstructed from the field names the installed v3 type definitions declare. Under the old
  // code (data.likeCount / data.totalLikeCount) this payload gave count 0 — 251 times out of 251.
  const e = N.cloudEvent('k2', 'likes', N.likeFields({
    common: { msgId: '9' }, count: 1, total: '2748',
    user: { uniqueId: 'viewer', nickname: 'Viewer' }
  }));
  assert.ok(e.count > 0, 'produktionsformatet ger fortfarande 0 — fixen biter inte');
});
