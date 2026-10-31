'use strict';
// GÅVANS EGEN ANIMATION — steg 2 av Top Gift (2026-10-31, PR 719).
//
// KEDJAN SOM PROVAS: bryggans giftFields -> cloudEvent -> validateTikTokIngestPayload -> cleanEvent.
// Utan raden i cleanEvent strök vitlistan giftVideo och overlayen fick aldrig se det — samma tysta
// förlust som en gång drabbade chattexten och fanClubLevel. Videolistans form är den uppmätta, se
// tiktok-bridge/test/gift-video.test.js.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const { cleanEvent } = require('../event-bus.js');
const { validateTikTokIngestPayload } = require('../index.js');
const N = require(path.join(__dirname, '..', '..', 'tiktok-bridge', 'normalizer.js'));

const URL_OK = 'https://sf16-webcast.tiktokcdn.com/obj/maliva/webcast-va/resource/0a7c24a91de2bd8356a6c0f6496feb43.zip';
const kropp = (typ = 'gift') => N.cloudEvent('g1', typ, N.giftFields({
  user: { userId: 'u1', uniqueId: 'testare', nickname: 'Testare' },
  giftDetails: { giftId: '6369', giftName: 'Lion', diamondCount: 29999 },
  repeatCount: 1, repeatEnd: true,
  asset: { videoResourceList: [{ videoTypeName: 'h264', videoUrl: { urlList: [URL_OK] } }] },
}));

test('giftVideo överlever hela vägen från bryggan till cleanEvent', () => {
  assert.doesNotThrow(() => validateTikTokIngestPayload(kropp()));
  assert.equal(cleanEvent(kropp()).giftVideo, URL_OK, 'vitlistan strök gåvans video');
  assert.equal(cleanEvent(kropp('streakstart')).giftVideo, URL_OK, 'streakens första frame tappade videon');
});

test('en gåva utan video bär inget giftVideo-fält', () => {
  const ut = cleanEvent({ id: 'g2', type: 'gift', username: 'testare', giftName: 'Rose', coins: 1 });
  assert.equal('giftVideo' in ut, false);
});

test('andra typer bär aldrig giftVideo, även om avsändaren skickar det', () => {
  for (const type of ['like', 'chat', 'follow', 'superfan', 'battle'])
    assert.equal('giftVideo' in cleanEvent({ id: 'x1', type, username: 'x', giftVideo: URL_OK }), false, type);
});

test('servern gör om vakten — en länk utanför https://*.tiktokcdn.com stryks', () => {
  for (const giftVideo of ['https://ond.example/a.zip', 'http://sf16-webcast.tiktokcdn.com/a.zip',
    'https://tiktokcdn.com.ond.example/a.zip', 'javascript:alert(1)', 42, { href: URL_OK }])
    assert.equal('giftVideo' in cleanEvent({ id: 'x2', type: 'gift', username: 'x', giftVideo }), false, String(giftVideo));
});
