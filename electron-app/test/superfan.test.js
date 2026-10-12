'use strict';
// SUPER FAN-ENTRÉN på skrivbordsvägen (#361 fynd 2): samma regel och samma fält som bryggan, och den
// lokala vitlistan stryker dem inte. Payloaderna är syntetiska — inga riktiga namn eller id.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const F = require('../tiktok-fields.js');
const N = require('../../tiktok-bridge/normalizer.js');
const SERVICE = fs.readFileSync(path.join(__dirname, '..', 'tiktok-service.js'), 'utf8');
const LOKAL = fs.readFileSync(path.join(__dirname, '..', 'local-server.js'), 'utf8');

const bild = namn => ({ urlList: [`https://cdn.example/${namn}.webp`] });
const entre = (over = {}) => Object.assign({
  msgType: 11,
  content: { key: 'ttlive_superfan_commentnotif_superfanjoined', pieces: [] },
  fansLevelParam: { currentGrade: 50 },
  badge: { image: { image: bild('badge') } },
  background: bild('bakgrund'),
  ribbonAnimation: bild('band'),
  user: { displayId: 'testfan', nickname: 'Testfan' }
}, over);

// Regelns BESLUT jämförs, inte hela objektet: desktops baseUser sätter inte userId (känd och
// dokumenterad skillnad, se tests/desktop-paritet.test.js).
const beslut = r => r && { username: r.username, name: r.name, fanClubLevel: r.fanClubLevel,
  superfanBadge: r.superfanBadge, superfanBakgrund: r.superfanBakgrund, superfanBand: r.superfanBand };

test('desktops superfanFields ger samma svar som bryggans, indata för indata', () => {
  const fall = [
    entre(),
    entre({ content: { key: '' }, commonBarrageContent: { key: 'TTLIVE_SUPERFAN_COMMENTNOTIF_SUPERFANJOINED' } }),
    entre({ badge: { combine: { icon: bild('kombinerad') } }, background: undefined, backGround: bild('reserv') }),
    entre({ fansLevelParam: { currentGrade: 999 } }),
    // nickname med flit: utan den skiljer sig baseUsers namnreserv mellan vägarna (äldre än #361,
    // bryggan faller tillbaka på uniqueId, desktop på displayId) — det är inte regeln som provas här.
    entre({ fansLevelParam: undefined, user: { displayId: 'testfan', nickname: 'Testfan', badgeList: [{ sceneType: 10, privilegeLogExtra: { level: '12' } }] } }),
    entre({ content: { key: 'pm_mt_fans_entrance' }, subType: 'fans_entrance' }),
    entre({ content: { key: 'ttlive_superfan_somethingelse' } }),
    { subType: 'guardian_entrance' }, { msgType: 11 }, {}, null, undefined
  ];
  for (const f of fall) {
    assert.deepEqual(beslut(F.superfanFields(f)), beslut(N.superfanFields(f)),
      `desktop och bryggan är oense om ${JSON.stringify(f && (f.content || f))}`);
  }
  // Och regeln måste säga JA någon gång — annars är likheten meningslös.
  assert.equal(F.superfanFields(entre()).fanClubLevel, 50);
  assert.equal(F.superfanFields(entre()).superfanBadge, 'https://cdn.example/badge.webp');
});

test('tjänsten grenar till superfan i BARRAGE-lyssnaren', () => {
  assert.match(SERVICE, /connection\.on\(WebcastEvent\.BARRAGE,[\s\S]{0,600}superfanFields\(data\)[\s\S]{0,120}emit\('superfan'/);
  assert.doesNotMatch(SERVICE, /WebcastEvent\.SUPER_FAN_JOIN/,
    'en egen SUPER_FAN_JOIN-lyssnare skickar varje entré två gånger — biblioteket emitterar båda');
});

test('den lokala vitlistan bär super fan-fälten och speglar typen till molnet', () => {
  assert.match(LOKAL, /superfanBadge: imageUrl\(d\.superfanBadge\)/);
  assert.match(LOKAL, /superfanBakgrund: imageUrl\(d\.superfanBakgrund\)/);
  assert.match(LOKAL, /superfanBand: imageUrl\(d\.superfanBand\)/);
  assert.match(LOKAL, /TILL_MOLNET = new Set\(\[[^\]]*'superfan'/);
});
