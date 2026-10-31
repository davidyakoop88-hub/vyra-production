'use strict';
// GÅVANS EGEN ANIMATION — steg 1 av Top Gift (2026-10-31, PR 719).
//
// `asset.videoResourceList` nedan har samma form och samma sex typer som gåvan Lion (6369) bar i
// gavovideo-sondens mätning: 1058 gåvor med video, och varje lista hade `h264`. Länkarna är TikToks
// riktiga CDN-adresser (offentliga, utan tittardata); resten av gåvomeddelandet är syntetiskt.
const test = require('node:test'), assert = require('node:assert/strict');
const N = require('../normalizer.js');

const CDN = h => `https://sf16-webcast.tiktokcdn.com/obj/maliva/webcast-va/resource/${h}.zip`;
const lista = () => [
  { videoTypeName: 'h264_encrypt', videoUrl: { urlList: [CDN('4424cd6ef649a1641852e55b3bc661f5')] } },
  { videoTypeName: '480p', videoUrl: { urlList: [CDN('ff95a03489bb0af78dea723785d7258d')] } },
  { videoTypeName: '480p_bvc1', videoUrl: { urlList: [CDN('8f3548eaef604608656e40e6865c48ac')] } },
  { videoTypeName: 'h264', videoUrl: { urlList: [CDN('0a7c24a91de2bd8356a6c0f6496feb43'), CDN('0a7c24a91de2bd8356a6c0f6496feb43').replace('sf16', 'sf19')] } },
  { videoTypeName: 'bytevc1opt', videoUrl: { urlList: [CDN('a7ff155f93becad4dca526b89d4867a6')] } },
];
const gava = (asset) => ({
  user: { userId: 'u1', uniqueId: 'testare', nickname: 'Testare' },
  giftDetails: { giftId: '6369', giftName: 'Lion', diamondCount: 29999 },
  repeatCount: 1, repeatEnd: true, ...(asset === undefined ? {} : { asset }),
});

test('h264-versionen väljs, inte den krypterade eller HEVC', () => {
  assert.equal(N.giftFields(gava({ videoResourceList: lista() })).giftVideo, CDN('0a7c24a91de2bd8356a6c0f6496feb43'));
});

test('en gåva utan video får tom sträng, inte undefined', () => {
  assert.equal(N.giftFields(gava()).giftVideo, '');
  assert.equal(N.giftFields(gava({ resourceModel: {} })).giftVideo, '', 'AR-gåvor har asset men ingen videolista');
  assert.equal(N.giftFields(gava({ videoResourceList: lista().filter(v => v.videoTypeName !== 'h264') })).giftVideo, '',
    'utan h264 ska ingen annan typ smyga in');
});

test('länkar utanför https://*.tiktokcdn.com släpps aldrig igenom', () => {
  for (const url of ['http://sf16-webcast.tiktokcdn.com/a.zip', 'https://tiktokcdn.com.ond.example/a.zip',
    'https://ond.example/sf16-webcast.tiktokcdn.com/a.zip', 'javascript:alert(1)', 'inte en länk']) {
    const f = N.giftFields(gava({ videoResourceList: [{ videoTypeName: 'h264', videoUrl: { urlList: [url] } }] }));
    assert.equal(f.giftVideo, '', url);
  }
});

test('första godkända länken tas när den första i listan är ogiltig', () => {
  const v = [{ videoTypeName: 'h264', videoUrl: { urlList: ['https://ond.example/a.zip', CDN('ok')] } }];
  assert.equal(N.giftFields(gava({ videoResourceList: v })).giftVideo, CDN('ok'));
});

test('cloudEvent bär giftVideo, men bara när gåvan har en', () => {
  const med = N.cloudEvent('g1', 'gift', N.giftFields(gava({ videoResourceList: lista() })));
  assert.equal(med.giftVideo, CDN('0a7c24a91de2bd8356a6c0f6496feb43'));
  const utan = N.cloudEvent('g2', 'gift', N.giftFields(gava()));
  assert.equal('giftVideo' in utan, false, 'en gåva utan video släpar ett tomt fält');
});
