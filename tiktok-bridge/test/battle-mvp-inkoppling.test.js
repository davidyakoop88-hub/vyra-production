'use strict';
// Inkopplingen av TikToks officiella MVP — bryggans sida.
//
// #313 gav den rena funktionen `armeMvp`. Det här är vägen från den till molnet, och den kräver
// tre saker som inte går att härleda ur payloaden:
//
//   1. ANKAR-ID VID CONNECT. armeMvp kan inte avgöra vilket lag som är vårt utan streamerns egna
//      userId. Det finns inte i eventet — det hämtas med fetchRoomInfo() och cachas.
//   2. FÄLTEN MÅSTE ÖVERLEVA cloudEvent. media.js triggerBattleMvp läser `event.name` och
//      `event.score`. cloudEvent har varken — det har `username` och `value`. Bryggan fyller
//      därför BÅDA namnen, så ingenting tappas oavsett vilken ände som läser.
//   3. battleId MÅSTE MED. Utan det kan klienten inte deduplicera per match, och widgeten kan
//      tändas två gånger: en gång av TikToks officiella lista och en gång av
//      battle-mvp-session.js egen räkning (som fungerar sedan #312).
//
// TYPEN HETER `battle_mvp` MED FLIT. media.js routeLiveBattleEvent tänder redan på
// `type.includes('battle_mvp')` — klientens routing behöver alltså inte röras.
//
// RÖTT NU: normalizer har ingen mvpFields, cloudEvent bär inget battleId, och bryggan
// prenumererar inte på LINK_MIC_ARMIES.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const N = require('../normalizer.js');

const ROT = path.join(__dirname, '..', '..');
const BRIDGE = fs.readFileSync(path.join(__dirname, '..', 'bridge.js'), 'utf8');

const VART_ANKARE = '7276185677820527649';

const bidrag = (nick, score) => ({
  userId: 'id#' + nick, score: String(score), nickname: 'namn#' + nick,
  avatarThumb: { urlList: ['https://cdn/' + nick + '.jpg'] }
});

const SLUT = {
  common: { method: 'WebcastLinkMicArmies', roomId: '7681020984748411670' },
  battleId: '7681024595775736598',
  triggerReason: 2,
  teamArmies: [
    { teamId: '1', teamUser: [{ userIdStr: VART_ANKARE }], teamTotalScore: '5075',
      userArmies: { userArmies: [bidrag('13c98e19', 4258), bidrag('224f1f37', 705)] } },
    { teamId: '2', teamUser: [{ userIdStr: '6805519295863489542' }], teamTotalScore: '2847',
      userArmies: { userArmies: [bidrag('3215b44b', 2504)] } }
  ]
};

// ---- 1. fälten som skickas -------------------------------------------------------------------------

test('mvpFields bär BÅDA namnformerna utan datatapp', () => {
  assert.equal(typeof N.mvpFields, 'function', 'normalizer.js exporterar ingen mvpFields');
  const f = N.mvpFields(SLUT, VART_ANKARE);
  assert.ok(f, 'inget event byggdes');
  // Klientens trigger laser name/score. Molnets cloudEvent bar username/value. BADA fylls.
  assert.equal(f.name, 'namn#13c98e19');
  assert.equal(f.username, 'namn#13c98e19', 'username saknas — cloudEvent skulle tappa namnet');
  assert.equal(f.score, 4258);
  assert.equal(f.coins, 4258, 'coins saknas — cloudEvent fyller value ur coins');
  assert.equal(f.profileImage, 'https://cdn/13c98e19.jpg');
  assert.equal(f.battleId, '7681024595775736598', 'utan battleId kan klienten inte deduplicera');
});

test('inget event när armeMvp inte hittar någon', () => {
  assert.equal(N.mvpFields(SLUT, ''), null, 'utan ankar-id byggdes ändå ett event');
  assert.equal(N.mvpFields({ ...SLUT, triggerReason: 1 }, VART_ANKARE), null);
});

// ---- 2. hela vägen genom cloudEvent -----------------------------------------------------------------

test('namn, poäng, bild och battleId överlever cloudEvent', () => {
  const moln = N.cloudEvent('e1', 'battle_mvp', N.mvpFields(SLUT, VART_ANKARE));
  assert.equal(moln.username, 'namn#13c98e19', 'namnet ströks');
  assert.equal(moln.value, 4258, 'poängen ströks — cloudEvent fyller value ur coins');
  assert.equal(moln.profileUrl, 'https://cdn/13c98e19.jpg', 'bilden ströks');
  assert.equal(moln.battleId, '7681024595775736598', 'cloudEvent bär inget battleId');
  assert.equal(moln.type, 'battle_mvp');
});

test('battleId utelämnas helt när det saknas', () => {
  // Samma val som fanLevelUp i #309: en nyckel med vardet '' hade smutsat den kanoniska formen
  // for VARJE event och tvingat formvakten i normalizer.test.js att bara den.
  const vanligt = N.cloudEvent('c1', 'chat', { username: 'lisa', comment: 'hej' });
  assert.equal('battleId' in vanligt, false, 'battleId finns på ett event utan battle');
});

// ---- 3. bryggan -------------------------------------------------------------------------------------

test('bryggan prenumererar på LINK_MIC_ARMIES och skickar battle_mvp', () => {
  assert.match(BRIDGE, /connection\.on\(WebcastEvent\.LINK_MIC_ARMIES/,
    'bryggan lyssnar inte på LINK_MIC_ARMIES — listan når aldrig molnet');
  assert.match(BRIDGE, /sendEvent\('battle_mvp'/,
    "typen skrivs som literal med flit: event-contract.test.js skannar källkoden efter den");
});

test('bryggan hämtar och cachar ankar-id vid connect', () => {
  // armeMvp kan inte avgora vilket lag som ar vart utan streamerns eget userId, och det finns
  // INTE i eventet. Utan cachningen ar hela kedjan tyst — funktionen returnerar null varje gang.
  assert.match(BRIDGE, /fetchRoomInfo/,
    'bryggan hämtar aldrig rumsinfon — ankar-id:t finns inte i något event');
  assert.match(BRIDGE, /mittAnkarId/, 'ankar-id:t cachas inte');
});

test('LINK_MIC_ARMIES är med i inspelarens redanLyssnade', () => {
  // Regel 2 i inspelare.js: en typ bryggan REDAN prenumererar pa far inte en andra lyssnare fran
  // inspelaren. LINK_MIC_ARMIES ligger dessutom i TYPER_DEFAULT — utan den har raden dubbleras
  // 305 rader per sandning i inspelningsfilen.
  const m = BRIDGE.match(/redanLyssnade\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(m, 'hittade ingen redanLyssnade-lista');
  assert.match(m[1], /'LINK_MIC_ARMIES'/,
    'LINK_MIC_ARMIES saknas i redanLyssnade — inspelningen dubbleras');
});

// ---- 4. listorna ------------------------------------------------------------------------------------

test('battle_mvp finns i alla tre listorna men inte i ROOM_TYPES', () => {
  assert.equal(N.tillMolnet('battle_mvp'), true, 'TILL_MOLNET saknar battle_mvp');
  const index = fs.readFileSync(path.join(ROT, 'server/index.js'), 'utf8');
  const bus = fs.readFileSync(path.join(ROT, 'server/event-bus.js'), 'utf8');
  assert.match(index.match(/TIKTOK_INGEST_TYPES\s*=\s*new Set\(\[([^\]]*)\]/)[1], /'battle_mvp'/,
    'TIKTOK_INGEST_TYPES saknar battle_mvp — molnet svarar 400');
  assert.match(bus.match(/ALLOWED\s*=\s*new Set\(\[([^\]]*)\]/)[1], /'battle_mvp'/,
    'ALLOWED saknar battle_mvp — event-bussen kastar eventet');
  // MVP:n ar en PERSON. Ligger typen i ROOM_TYPES slutar molnet krava username.
  assert.doesNotMatch(index.match(/TIKTOK_ROOM_TYPES\s*=\s*new Set\(\[([^\]]*)\]/)[1], /'battle_mvp'/,
    'battle_mvp ligger i ROOM_TYPES — då slutar molnet kräva username');
});
