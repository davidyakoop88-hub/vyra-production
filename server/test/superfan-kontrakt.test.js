'use strict';
// Molnets kontrakt för super fan-entrén (#361 fynd 2).
//
// Ligger här och inte i tiktok-bridge/test/ av samma skäl som fanlevelup-kontrakt.test.js:
// cleanEvent drar in redis, och bryggans CI-jobb installerar bara bryggans beroenden.
// Fältlogiken provas i tiktok-bridge/test/superfan.test.js.
//
// KEDJAN SOM PROVAS: bryggans superfanFields -> cloudEvent -> validateTikTokIngestPayload -> cleanEvent.
// Payloaden är syntetisk — inga riktiga namn eller id.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const { cleanEvent } = require('../event-bus.js');
const { validateTikTokIngestPayload, TIKTOK_INGEST_TYPES } = require('../index.js');
const N = require(path.join(__dirname, '..', '..', 'tiktok-bridge', 'normalizer.js'));

const bild = namn => ({ urlList: [`https://cdn.example/${namn}.webp`] });
const entre = {
  common: { method: 'WebcastBarrageMessage', msgId: '900001' },
  msgType: 11,
  content: { key: 'ttlive_superfan_commentnotif_superfanjoined', pieces: [] },
  fansLevelParam: { currentGrade: 50 },
  badge: { image: { image: bild('badge') } },
  background: bild('bakgrund'),
  ribbonAnimation: bild('band'),
  user: { id: 'id#0000aa', displayId: 'testfan', nickname: 'Testfan' }
};
const kropp = () => N.cloudEvent('sf1', 'superfan', N.superfanFields(entre));

test('superfan är en persontyp i molnets ingest', () => {
  assert.ok(TIKTOK_INGEST_TYPES.has('superfan'));
  assert.doesNotThrow(() => validateTikTokIngestPayload(kropp()));
  assert.throws(() => validateTikTokIngestPayload({ type: 'superfan' }), /username/,
    'en super fan-entré utan avsändare släpptes igenom');
});

test('entrén överlever hela vägen till cleanEvent med nivå och grafik', () => {
  const ut = cleanEvent(kropp());
  assert.equal(ut.type, 'superfan', 'cleanEvent kastade typen');
  assert.equal(ut.username, 'testfan');
  assert.equal(ut.name, 'Testfan');
  assert.equal(ut.fanClubLevel, 50, 'nivån tappades');
  assert.equal(ut.superfanBadge, 'https://cdn.example/badge.webp');
  assert.equal(ut.superfanBakgrund, 'https://cdn.example/bakgrund.webp');
  assert.equal(ut.superfanBand, 'https://cdn.example/band.webp');
});

test('andra typer bär inga super fan-fält', () => {
  const ut = cleanEvent({ ...kropp(), type: 'gift' });
  for (const f of ['superfanBadge', 'superfanBakgrund', 'superfanBand'])
    assert.equal(f in ut, false, `en gåva fick ${f}`);
});
