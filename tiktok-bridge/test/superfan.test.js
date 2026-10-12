'use strict';
// SUPER FAN-ENTRÉN — #361 fynd 2.
//
// Uppmätt 2026-09-06 (28 min, 5 händelser): SUPER_FAN_JOIN är en WebcastBarrageMessage, msgType 11,
// alltså samma rör som Guardian och fans_upgrade. Bryggan lyssnar redan på BARRAGE; det här är en
// gren till i den hanteraren.
//
// Igenkänningen är tiktok-live-connectors egen (2.5.0, processDecodedData): content.key eller
// commonBarrageContent.key innehåller 'ttlive_superfan_commentnotif_superfanjoined'. Det var den
// regeln som sorterade ut raderna i inspelningen, så bryggan använder samma.
//
// PAYLOADEN NEDAN ÄR SYNTETISK — formen följer de uppmätta nycklarna i
// hjalp/uppmatta-payloadfalt.json (SUPER_FAN_JOIN), men inga värden är riktiga: inga namn, inga id.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const N = require('../normalizer.js');

const BRIDGE = fs.readFileSync(path.join(__dirname, '..', 'bridge.js'), 'utf8');
const FORM = JSON.parse(fs.readFileSync(path.join(__dirname, 'hjalp', 'uppmatta-payloadfalt.json'), 'utf8'));

const bild = namn => ({ urlList: [`https://cdn.example/${namn}.webp`] });
const entre = (over = {}) => Object.assign({
  common: { method: 'WebcastBarrageMessage', msgId: '900001', roomId: '900002' },
  msgType: 11,
  subType: '',
  scene: '',
  content: { key: 'ttlive_superfan_commentnotif_superfanjoined', defaultPattern: '{0:user} joined', pieces: [] },
  commonBarrageContent: { key: '', pieces: [] },
  fansLevelParam: { currentGrade: 50, displayConfig: 0 },
  badge: { sceneType: 10, image: { image: bild('badge') } },
  background: bild('bakgrund'),
  ribbonAnimation: bild('band'),
  user: { id: 'id#0000aa', displayId: 'testfan', nickname: 'Testfan',
    avatarThumb: { urlList: ['https://cdn.example/avatar.jpg'] } }
}, over);

// ---- 1. formen är uppmätt, inte gissad ----------------------------------------------------------

test('fälten superfanFields läser finns i de uppmätta SUPER_FAN_JOIN-payloaderna', () => {
  const uppmatt = FORM.typer.SUPER_FAN_JOIN;
  assert.ok(uppmatt, 'ingen uppmätt form för SUPER_FAN_JOIN');
  for (const f of ['content', 'commonBarrageContent', 'fansLevelParam', 'badge', 'background',
    'ribbonAnimation', 'user', 'msgType']) {
    assert.ok(uppmatt.nycklar.includes(f), `superfanFields läser ${f}, men fältet finns inte i payloaden`);
  }
});

// ---- 2. normaliseringen --------------------------------------------------------------------------

test('en super fan-entré ger användare, nivå och TikToks grafik', () => {
  const f = N.superfanFields(entre());
  assert.ok(f, 'entrén kändes inte igen');
  assert.equal(f.username, 'testfan', 'utan username avvisar molnet eventet med 400');
  assert.equal(f.name, 'Testfan');
  assert.equal(f.profileImage, 'https://cdn.example/avatar.jpg');
  assert.equal(f.fanClubLevel, 50, 'fansLevelParam.currentGrade lästes inte');
  assert.equal(f.superfanBadge, 'https://cdn.example/badge.webp');
  assert.equal(f.superfanBakgrund, 'https://cdn.example/bakgrund.webp');
  assert.equal(f.superfanBand, 'https://cdn.example/band.webp');
});

test('nyckeln i commonBarrageContent räcker också — samma regel som biblioteket', () => {
  const f = N.superfanFields(entre({
    content: { key: '', pieces: [] },
    commonBarrageContent: { key: 'TTLIVE_SUPERFAN_COMMENTNOTIF_SUPERFANJOINED', pieces: [] }
  }));
  assert.ok(f, 'commonBarrageContent.key kändes inte igen');
});

test('badgebilden hittas även i combine.icon, och protots backGround är reserv', () => {
  const f = N.superfanFields(entre({
    badge: { combine: { icon: bild('kombinerad') } },
    background: undefined,
    backGround: bild('reserv')
  }));
  assert.equal(f.superfanBadge, 'https://cdn.example/kombinerad.webp');
  assert.equal(f.superfanBakgrund, 'https://cdn.example/reserv.webp');
});

test('saknas nivån faller den tillbaka på badgen, och bilderna blir tomma — inte undefined', () => {
  const f = N.superfanFields(entre({
    fansLevelParam: undefined, badge: undefined, background: undefined, ribbonAnimation: undefined,
    user: { displayId: 'testfan', nickname: 'Testfan',
      badgeList: [{ sceneType: 10, privilegeLogExtra: { level: '12' } }] }
  }));
  assert.equal(f.fanClubLevel, 12);
  assert.equal(f.superfanBadge, '');
  assert.equal(f.superfanBakgrund, '');
  assert.equal(f.superfanBand, '');
});

test('nivån klampas till 0–50', () => {
  assert.equal(N.superfanFields(entre({ fansLevelParam: { currentGrade: 999 } })).fanClubLevel, 50);
  assert.equal(N.superfanFields(entre({ fansLevelParam: { currentGrade: 'x' } })).fanClubLevel, 0);
});

// ---- 3. bara super fan-entrén -------------------------------------------------------------------

test('andra BARRAGE ger ingenting — inte ens med samma msgType', () => {
  for (const p of [
    entre({ content: { key: 'pm_mt_fans_entrance', pieces: [] }, subType: 'fans_entrance' }),
    entre({ content: { key: 'pm_mt_guardian_entrance', pieces: [] }, subType: 'guardian_entrance' }),
    entre({ content: { key: 'pm_mt_fan_live_upgrade_bullet', pieces: [] }, subType: 'fans_upgrade' }),
    entre({ content: { key: 'ttlive_superfan_somethingelse', pieces: [] } }),
    { msgType: 11 }, {}, null, undefined
  ]) {
    assert.equal(N.superfanFields(p), null, `${JSON.stringify(p?.content?.key)} tolkades som super fan-entré`);
  }
});

test('guardian- och nivåreglerna rörs inte av en super fan-entré', () => {
  assert.equal(N.arGuardianEntrance(entre()), false);
  assert.equal(N.fansUppgradering(entre()), null);
});

// ---- 4. kedjan genom bryggan --------------------------------------------------------------------

test('cloudEvent bär nivån och bildfälten, och bara på super fan-entrén', () => {
  const kropp = N.cloudEvent('s1', 'superfan', N.superfanFields(entre()));
  assert.equal(kropp.type, 'superfan');
  assert.equal(kropp.username, 'testfan');
  assert.equal(kropp.fanClubLevel, 50);
  assert.equal(kropp.superfanBadge, 'https://cdn.example/badge.webp');
  assert.equal(kropp.superfanBakgrund, 'https://cdn.example/bakgrund.webp');
  assert.equal(kropp.superfanBand, 'https://cdn.example/band.webp');
  const gava = N.cloudEvent('g1', 'gift', { username: 'testfan', giftName: 'Rose', coins: 1 });
  assert.equal('superfanBadge' in gava, false, 'en gåva släpar super fan-fält');
});

test('typen släpps till molnet', () => {
  assert.equal(N.tillMolnet('superfan'), true);
});

test('BARRAGE-lyssnaren grenar till superfan, och SUPER_FAN_JOIN spelas inte in dubbelt', () => {
  assert.match(BRIDGE, /N\.superfanFields\(data\)/, 'bryggan använder inte regeln');
  assert.match(BRIDGE, /sendEvent\('superfan'/, "bryggan skickar inget 'superfan'");
  // Grenen måste ligga i den BEFINTLIGA BARRAGE-lyssnaren, inte i en egen SUPER_FAN_JOIN-lyssnare:
  // biblioteket emitterar båda för samma meddelande, och två vägar hade skickat varje entré två gånger.
  assert.doesNotMatch(BRIDGE, /connection\.on\(WebcastEvent\.SUPER_FAN_JOIN/,
    'bryggan lyssnar på SUPER_FAN_JOIN också — varje entré skickas två gånger');
  const barrage = BRIDGE.slice(BRIDGE.indexOf('connection.on(WebcastEvent.BARRAGE'));
  assert.ok(barrage.indexOf("sendEvent('superfan'") > -1 &&
    barrage.indexOf("sendEvent('superfan'") < barrage.indexOf('connection.on(', 10),
    "sendEvent('superfan') ligger inte i BARRAGE-lyssnaren");
  assert.match(BRIDGE, /'SUPER_FAN_JOIN'\]\)/, 'inspelaren lägger en andra lyssnare på samma meddelande');
});
