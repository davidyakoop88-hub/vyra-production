'use strict';
// Guardian Del A — bryggan ska skicka ett `guardian`-event när en Guardian går in i rummet.
//
// UPPMÄTT I SKARP SÄNDNING 2026-09-01, inte gissat. Kommentarsblocket "GUARDIAN — FORBEREDD" i
// bridge.js listade tre kandidater:
//
//   · MEMBER med ett rollfält (guardianType / userRole / badgeList)
//   · USER_NAVIGATION_EVENT med isGuardian
//   · en egen typ vi inte prenumererar på än
//
// INGEN av dem var rätt. `USER_NAVIGATION_EVENT` finns inte ens i tiktok-live-connector 2.4.0
// (67 typer, kontrollerat). Svaret var en fjärde: `BARRAGE` med `subType: "guardian_entrance"`.
//
// Mätningen (inspelning 2026-09-01T2130-dd5bbd68.jsonl, 3710 rader, 28,7 MB):
//
//   guardian_entrance      8 event, ALLA från samma person
//   unika personer         1 av ~59 tittare i rummet
//   övriga BARRAGE-subTypes fans_entrance 16, user_level_entrance 5, fans_upgrade 3
//
// Streamern bekräftade personen vid namn under sändningen, och två av entréerna inträffade
// sekunder innan bekräftelsen. Fältet identifierar alltså Guardian entydigt — inga falska
// positiva bland de andra 58.
//
// VARFÖR ÅTTA FÖR EN PERSON. Han går in och ut ur rummet; eventet fyrar vid varje entré. Klientens
// spärr i guardian-session.js (en gång per tittare per sändning) är därför inte överdriven — utan
// den hade emblemet spelat åtta gånger den kvällen.
//
// PAYLOADERNA NEDAN ÄR RIKTIGA, hämtade ur inspelningen. Värdena är maskerade av inspelaren
// (`id#...`, `namn#...` är stabila SHA-256-prefix, inte påhittade strängar) — men STRUKTUREN och
// fältnamnen är exakt vad TikTok skickade.
//
// RÖTT NU: normalizer.js har ingen arGuardianEntrance, och bridge.js prenumererar inte på BARRAGE.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const N = require('../normalizer.js');

const BRIDGE = fs.readFileSync(path.join(__dirname, '..', 'bridge.js'), 'utf8');

// ---- verkliga payloads ur inspelningen -----------------------------------------------------------

const anvandare = (over = {}) => Object.assign({
  id: 'id#5c67f361',
  displayId: 'id#ee1e6ac2',          // TikToks @handle. uniqueId finns INTE: 0 av 1333 event bar det.
  nickname: 'namn#224f1f37',
  avatarThumb: { urlList: ['https://p16-common-sign.tiktokcdn-eu.com/avatar.jpg'] },
  border: { nameStarlingKey: 'ttlive_guardian_viewerRanking_label', level: '4' }
}, over);

const barrage = (subType, over = {}) => Object.assign({
  subType, scene: subType,
  common: { method: 'WebcastBarrageMessage', msgId: '7680650726338511136', roomId: '7680650509790808854' },
  content: { key: 'pm_mt_alp_join_animation_1New', defaultPattern: '{0:user} joined', pieces: [] },
  user: anvandare()
}, over);

const GUARDIAN = barrage('guardian_entrance');

// De andra tre subTypes som faktiskt förekom samma kväll. De får ALDRIG tända emblemet.
const FANS_ENTRANCE = barrage('fans_entrance', {
  content: { key: 'pm_mt_fan_live_join', defaultPattern: 'joined', pieces: [] },
  user: anvandare({ border: undefined })
});
const FANS_UPGRADE = barrage('fans_upgrade', {
  content: { key: 'pm_mt_fan_live_upgrade_bullet', defaultPattern: 'reached member Lv.{0:string}',
    pieces: [{ type: 1, stringValue: '32' }] },
  user: anvandare({ border: undefined })
});
const USER_LEVEL = barrage('user_level_entrance', { user: anvandare({ border: undefined }) });

// ---- 1. regeln -----------------------------------------------------------------------------------

test('en verklig guardian_entrance känns igen', () => {
  assert.equal(typeof N.arGuardianEntrance, 'function',
    'normalizer.js exporterar ingen arGuardianEntrance');
  assert.equal(N.arGuardianEntrance(GUARDIAN), true);
});

test('de tre andra BARRAGE-typerna från samma sändning tänder INGENTING', () => {
  // Alla fyra kom i samma ström samma kväll. Skiljer regeln dem inte åt spelar emblemet
  // 24 gånger i stället för 8.
  for (const p of [FANS_ENTRANCE, FANS_UPGRADE, USER_LEVEL]) {
    assert.equal(N.arGuardianEntrance(p), false, `${p.subType} tände emblemet`);
  }
});

test('tom, saknad och främmande payload tänder ingenting', () => {
  for (const p of [undefined, null, {}, { subType: '' }, { subType: 'guardian' },
    { subType: 'guardian_entrance_v2' }, { giftName: 'Guardian Wings' }]) {
    assert.equal(N.arGuardianEntrance(p), false, `${JSON.stringify(p)} tände emblemet`);
  }
});

// GAVAN "GUARDIAN WINGS" ar den farligaste falska positiva: TikTok saljer en gava med det namnet
// (assets/gifts/events/0006_Guardian_Wings.png). En regel som letade efter ordet "guardian"
// nagonstans i payloaden hade tant emblemet for varje sald sadan gava.
test('en gåva som heter Guardian Wings är inte ett guardian-event', () => {
  assert.equal(N.arGuardianEntrance({ giftDetails: { giftName: 'Guardian Wings' } }), false);
});

// ---- 2. användaren måste överleva --------------------------------------------------------------

test('baseUser får fram ett användarnamn ur BARRAGE-payloaden', () => {
  // KRITISKT, och nästan missat: molnets validateTikTokIngestPayload avvisar varje event utan
  // `username` med 400. BARRAGE-payloaden saknar `uniqueId` helt — uppmätt 0 av 1333 event — så
  // namnet måste komma från `displayId`. Faller den fallbacken tystnar hela typen i molnet.
  const u = N.baseUser(GUARDIAN);
  assert.equal(u.username, 'id#ee1e6ac2', 'username kom inte från displayId');
  assert.ok(u.username.trim(), 'tomt username ger 400 från molnets ingest');
  assert.equal(u.name, 'namn#224f1f37', 'nickname följde inte med');
  assert.match(u.profileImage, /^https:\/\//, 'profilbilden hittades inte i avatarThumb');
});

// ---- 3. bryggan ----------------------------------------------------------------------------------

test('bryggan prenumererar på BARRAGE och skickar guardian', () => {
  assert.match(BRIDGE, /connection\.on\(WebcastEvent\.BARRAGE/,
    'bryggan lyssnar inte på BARRAGE — eventet når aldrig molnet');
  assert.match(BRIDGE, /sendEvent\('guardian'/,
    "bryggan skickar inget 'guardian' — typen skrivs ut som literal med flit, "
    + 'tests/event-contract.test.js skannar källkoden efter just den strängen');
});

test('BARRAGE är med i inspelarens redanLyssnade', () => {
  // Regel 2 i inspelare.js: en typ bryggan REDAN prenumererar på får inte en andra lyssnare från
  // inspelaren — det dubblerar raderna i filen och gör en inspelning omöjlig att räkna på.
  // Missas den här raden går buggen inte att se förrän någon räknar fel på nästa inspelning.
  const m = BRIDGE.match(/redanLyssnade\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(m, 'hittade ingen redanLyssnade-lista i bridge.js');
  assert.match(m[1], /'BARRAGE'/,
    'BARRAGE saknas i redanLyssnade — inspelaren lägger en andra lyssnare och dubblerar filen');
});

// ---- 4. de fyra listorna -------------------------------------------------------------------------

test('guardian släpps fram av bryggans egen vitlista', () => {
  assert.equal(N.tillMolnet('guardian'), true,
    'TILL_MOLNET saknar guardian — bryggan skulle hålla eventet hemma');
});

test('guardian finns i molnets tre listor', () => {
  const rot = path.join(__dirname, '..', '..');
  const index = fs.readFileSync(path.join(rot, 'server/index.js'), 'utf8');
  const bus = fs.readFileSync(path.join(rot, 'server/event-bus.js'), 'utf8');

  const ingest = index.match(/TIKTOK_INGEST_TYPES\s*=\s*new Set\(\[([^\]]*)\]/);
  assert.ok(ingest, 'hittade ingen TIKTOK_INGEST_TYPES');
  assert.match(ingest[1], /'guardian'/, 'TIKTOK_INGEST_TYPES saknar guardian — molnet svarar 400');

  const allowed = bus.match(/ALLOWED\s*=\s*new Set\(\[([^\]]*)\]/);
  assert.ok(allowed, 'hittade ingen ALLOWED');
  assert.match(allowed[1], /'guardian'/, 'ALLOWED saknar guardian — event-bussen kastar eventet');

  // TIKTOK_ROOM_TYPES ska INTE innehalla guardian: den listan undantar event som beskriver RUMMET
  // och darfor saknar anvandare. Ett guardian-event bar en person, och att lagga det dar hade
  // stangt av username-kontrollen for just den typen.
  const room = index.match(/TIKTOK_ROOM_TYPES\s*=\s*new Set\(\[([^\]]*)\]/);
  assert.ok(room, 'hittade ingen TIKTOK_ROOM_TYPES');
  assert.doesNotMatch(room[1], /'guardian'/,
    'guardian ligger i TIKTOK_ROOM_TYPES — då slutar molnet kräva username för typen');
});
