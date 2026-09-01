'use strict';
// Subscriber- och fanklubbsemotes ska nå Actions & Events emote-väljare.
//
// SJÄTTE GÅNGEN SAMMA MÖNSTER: klienten är klar, bryggan är avklippt.
//
//   action-event-advanced.js   har en emote-väljare (renderEmotePickerHtml)
//   live-client.js:25          recordSeenEmote() fyller `vyra-seen-emotes-v1`
//   bryggan                    prenumererar INTE på EMOTE och skickar aldrig 'subscriberemote'
//   normalizer.js              tillMolnet('subscriberemote') === false
//   server                     typen saknas i TIKTOK_INGEST_TYPES och ALLOWED
//   cleanEvent                 bär inget `emote`-fält alls
//
// Väljaren visar därför alltid "Inga emotes har setts live än". Uppmätt 2026-09-01.
//
// DET FINNS INGEN LISTA ATT HÄMTA. `fetchRoomInfo()` för jokero060 gav `sticker_list: []`,
// `room_sticker_list: []` och `biz_sticker_list: []`, och biblioteket har ingen
// `fetchAvailableEmotes()` — bara `fetchAvailableGifts()` för gåvor. TikFinity (byggt av zerody,
// samma person som skrev tiktok-live-connector) har exakt samma åtkomst och gör samma sak:
// fånga-när-den-används. Det är alltså inte en genväg vi missat, utan enda vägen som finns.
//
// FORMEN KOMMER FRÅN BIBLIOTEKETS EGNA TYPER, inte från en gissning
// (tiktok-live-proto/dist/node/v3.d.ts):
//
//   WebcastEmoteChatMessage { common, user, emoteList: EmoteModel[], msgFilter, userIdentity }
//   EmoteModel { emoteId, image: ImageModel, emoteType, emoteScene, emotePrivateType,
//                packageId, rewardCondition, ... }
//   ImageModel { urlList: string[], uri, height, width, ... }
//
// INGEN FILTRERING PÅ emoteScene, och det är ett medvetet val. Enumet finns
// (SUBSCRIPTION=0, GAME=1, FANS_CLUB=2) och det vore frestande att bara släppa fram FANS_CLUB.
// Men: klientens recordSeenEmote filtrerar inte — den lagrar allt den ser — och en prenumerations-
// emote är en lika giltig trigger som en fanklubbsemote. En filtrering i bryggan är dessutom
// osynlig för användaren och går inte att ångra utan omdeploy. Vill vi filtrera senare görs det i
// klienten, mot uppmätt data. Vi har ännu inte sett ett enda skarpt EMOTE-event.
//
// RÖTT NU: normalizer.js har ingen emoteFields, cloudEvent bär inget emote, och bryggan lyssnar
// inte på EMOTE.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const N = require('../normalizer.js');

const ROT = path.join(__dirname, '..', '..');
const BRIDGE = fs.readFileSync(path.join(__dirname, '..', 'bridge.js'), 'utf8');

// ---- payload byggd ur typdefinitionen ------------------------------------------------------------

const anv = () => ({
  id: 'u1', displayId: 'lisa', nickname: 'Lisa',
  avatarThumb: { urlList: ['https://cdn/avatar.jpg'] }
});

const emote = (over = {}) => Object.assign({
  emoteId: '7382910',
  image: { urlList: ['https://cdn/emote-1.png', 'https://cdn/spegel.png'], uri: 'webcast/emote1.png' },
  emoteType: 2,          // EMOTE_TYPE_FANS
  emoteScene: 2,         // FANS_CLUB
  emotePrivateType: 0,
  packageId: '99'
}, over);

const EMOTE_EVENT = { user: anv(), emoteList: [emote()] };

// ---- 1. fälten plockas ut -------------------------------------------------------------------------

test('emoteFields plockar id och bild ur emoteList', () => {
  assert.equal(typeof N.emoteFields, 'function', 'normalizer.js exporterar ingen emoteFields');
  const f = N.emoteFields(EMOTE_EVENT);
  assert.equal(f.emote, '7382910', 'emote-id:t kom inte fram — väljaren kan inte visa något');
  assert.equal(f.giftImage, 'https://cdn/emote-1.png',
    'bilden kom inte fram — klienten renderar ❓ i stället för emoten');
});

test('användaren följer med', () => {
  const f = N.emoteFields(EMOTE_EVENT);
  assert.equal(f.username, 'lisa', 'utan username avvisar molnets ingest eventet med 400');
  assert.equal(f.name, 'Lisa');
});

test('flera emotes i samma meddelande: den första tas', () => {
  // emoteList ar en ARRAY i v3 — en chattrad kan bara flera emotes. Vi bar den forsta; att skicka
  // ett event per emote hade dubblerat traffiken mot ingest-taket for en ren valjarfunktion.
  const f = N.emoteFields({ user: anv(), emoteList: [emote(), emote({ emoteId: 'nummer-tva' })] });
  assert.equal(f.emote, '7382910');
});

test('v1-formen tas också emot', () => {
  // Aldre bibliotek bar ett enda `emote` med `image.imageUrl` i stallet for emoteList/urlList.
  const f = N.emoteFields({ user: anv(), emote: { emoteId: 'gammal', image: { imageUrl: 'https://cdn/g.png' } } });
  assert.equal(f.emote, 'gammal');
  assert.equal(f.giftImage, 'https://cdn/g.png');
});

test('trasig payload ger tomma strängar, aldrig undefined', () => {
  for (const trasig of [undefined, null, {}, { emoteList: [] }, { emoteList: [{}] },
    { emoteList: [{ emoteId: '', image: {} }] }]) {
    const f = N.emoteFields(trasig);
    assert.equal(typeof f.emote, 'string', `emote blev ${typeof f.emote}`);
    assert.equal(typeof f.giftImage, 'string');
  }
});

// ---- 2. fältet måste överleva molnet ---------------------------------------------------------------

test('emote överlever cloudEvent', () => {
  // Samma bugg som fanClubLevel: baseUser raknade fram den, cloudEvent strok den hundra rader
  // senare, och faltet sag ut att fungera hela vagen. Utan raden ar valjaren tom for alltid.
  const moln = N.cloudEvent('e1', 'subscriberemote', N.emoteFields(EMOTE_EVENT));
  assert.equal(moln.emote, '7382910', 'cloudEvent strök emote-id:t');
  assert.equal(moln.giftImage, 'https://cdn/emote-1.png', 'cloudEvent strök bilden');
});

test('emote överlever molnets cleanEvent', () => {
  const bus = fs.readFileSync(path.join(ROT, 'server/event-bus.js'), 'utf8');
  const i = bus.indexOf('const event={');
  assert.ok(i > 0, 'hittade ingen cleanEvent-litteral');
  // Klammermatchning, inte ett teckenfonster — samma skal som event-contract.test.js anger.
  let djup = 0, slut = i;
  for (let k = bus.indexOf('{', i); k < bus.length; k++) {
    if (bus[k] === '{') djup++;
    else if (bus[k] === '}') { djup--; if (!djup) { slut = k; break } }
  }
  const litteral = bus.slice(i, slut);
  assert.match(litteral, /emote\s*:/,
    'cleanEvent bär inget emote-fält — id:t stryks i molnet och väljaren förblir tom');
});

// ---- 3. bryggan och de tre listorna ----------------------------------------------------------------

test('bryggan prenumererar på EMOTE och skickar subscriberemote', () => {
  assert.match(BRIDGE, /connection\.on\(WebcastEvent\.EMOTE/,
    'bryggan lyssnar inte på EMOTE — eventet når aldrig molnet');
  assert.match(BRIDGE, /sendEvent\('subscriberemote'/,
    "typen skrivs som literal med flit: event-contract.test.js skannar källkoden efter den strängen");
});

test('EMOTE är med i inspelarens redanLyssnade', () => {
  // Regel 2 i inspelare.js: en typ bryggan redan prenumererar pa far inte en andra lyssnare fran
  // inspelaren — det dubblerar raderna och gor nasta inspelning omojlig att rakna pa.
  const m = BRIDGE.match(/redanLyssnade\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(m, 'hittade ingen redanLyssnade-lista');
  assert.match(m[1], /'EMOTE'/, 'EMOTE saknas i redanLyssnade — inspelningen dubbleras');
});

test('subscriberemote släpps fram av bryggans vitlista', () => {
  assert.equal(N.tillMolnet('subscriberemote'), true,
    'TILL_MOLNET saknar subscriberemote — bryggan håller eventet hemma');
});

test('subscriberemote finns i molnets två listor, men inte i ROOM_TYPES', () => {
  const index = fs.readFileSync(path.join(ROT, 'server/index.js'), 'utf8');
  const bus = fs.readFileSync(path.join(ROT, 'server/event-bus.js'), 'utf8');

  const ingest = index.match(/TIKTOK_INGEST_TYPES\s*=\s*new Set\(\[([^\]]*)\]/);
  assert.match(ingest[1], /'subscriberemote'/, 'TIKTOK_INGEST_TYPES saknar typen — molnet svarar 400');

  const allowed = bus.match(/ALLOWED\s*=\s*new Set\(\[([^\]]*)\]/);
  assert.match(allowed[1], /'subscriberemote'/, 'ALLOWED saknar typen — event-bussen kastar eventet');

  // Emoten bar en PERSON. Ligger typen i ROOM_TYPES slutar molnet krava username — samma
  // avvagning som for guardian i #304.
  const room = index.match(/TIKTOK_ROOM_TYPES\s*=\s*new Set\(\[([^\]]*)\]/);
  assert.doesNotMatch(room[1], /'subscriberemote'/,
    'typen ligger i TIKTOK_ROOM_TYPES — då slutar molnet kräva username');
});

// ---- 4. klientens kontrakt -------------------------------------------------------------------------

test('fältnamnen matchar exakt vad recordSeenEmote läser', () => {
  // Klienten laser `e.emote` och `e.giftImage` och kraver type === 'subscriberemote' efter att ha
  // strukit bindestreck och understreck. Skickar bryggan andra namn fylls valjaren aldrig, och
  // ingenting nagonstans sager varfor.
  const klient = fs.readFileSync(path.join(ROT, 'live-client.js'), 'utf8');
  const fn = klient.slice(klient.indexOf('function recordSeenEmote'),
    klient.indexOf('function recordSeenUser'));
  assert.match(fn, /type!=='subscriberemote'/, 'klienten väntar sig inte längre subscriberemote');
  assert.match(fn, /e\.emote/, 'klienten läser inte längre e.emote');
  assert.match(fn, /e\.giftImage/, 'klienten läser inte längre e.giftImage');

  const f = N.emoteFields(EMOTE_EVENT);
  assert.ok('emote' in f && 'giftImage' in f, 'bryggan skickar inte de fältnamn klienten läser');
});
