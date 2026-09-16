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

// FIXTUREN AR UPPMATT, INTE PAHITTAD (2026-09-16).
//
// `emoteType: 2` och `packageId: '99'` var gissningar fran den tid da inget skarpt emote-event
// observerats. Tre riktiga inspelningar (2026-09-01/02, 156 emotes) visar en annan form:
//
//   emoteType 0, emotePrivateType 0, packageId 'fansclub', auditStatus 0, contentSource 0
//   emoteScene 2 i 59 fall och 3 i 97 — proto-enumet har inget 3
//
// En fixtur som inte liknar verkligheten provar bara sig sjalv.
const emote = (over = {}) => Object.assign({
  emoteId: '7382910',
  image: { urlList: ['https://cdn/emote-1.png', 'https://cdn/spegel.png'], uri: 'webcast/emote1.png' },
  emoteType: 0,
  emoteScene: 2,
  emotePrivateType: 0,
  packageId: 'fansclub'
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

// FAN CLUB-STICKERS AR EMOTES MED emoteScene 2 (FANS_CLUB).
//
// Uppmatt 2026-09-16: INGENTING i hela kedjan emitterar typen `fanclubsticker` — varken
// normalizer.js, bridge.js eller electron-app/tiktok-service.js. Triggern `fanSticker` i
// live-client.js kunde alltsa fysiskt aldrig fyra, och stickervaljaren visade subscriber-emotes
// eftersom bada las ur samma nyckel.
//
// Scenen ar det ENDA som skiljer dem at, och den maste overleva bada vitlistorna for att klienten
// ska kunna dela listorna. Provet ar skrivet som en falla: stryk `emoteScene` ur emoteFields eller
// ur cloudEvent och det faller.
// EMOTES KOMMER PA CHATTKANALEN, INTE PA EMOTE-KANALEN.
//
// UPPMATT 2026-09-16 mot tre skarpa inspelningar (2026-09-01/02): 48 av 48 meddelanden som bar en
// emote var `typ:'chat'` med emoten i `emotes[]` — formen { index, emote:{...} }. NOLL kom som
// WebcastEmoteChatMessage med `emoteList`. Innan den formen lastes nadde 0 av 48 igenom kedjan;
// efterat 48 av 48, alla med id och bild.
//
// Detta ar hela forklaringen till varfor filen tidigare sa att inget skarpt EMOTE-event setts.
const CHATT_MED_EMOTE = {
  user: anv(),
  content: 'hej',
  emotes: [{ index: 0, emote: emote() }]
};

test('emoteFields laser chattformen emotes[].emote', () => {
  const f = N.emoteFields(CHATT_MED_EMOTE);
  assert.equal(f.emote, '7382910', 'emoten i ett chattmeddelande hittades inte');
  assert.equal(f.giftImage, 'https://cdn/emote-1.png', 'bilden hittades inte i chattformen');
  assert.equal(f.emotePaket, 'fansclub', 'paketet hittades inte i chattformen');
});

test('emoteList gar fortfarande fore — en riktig EMOTE-handelse far inte sluta fungera', () => {
  const bada = { user: anv(), emoteList: [emote({ emoteId: 'fran-emoteList' })],
                 emotes: [{ index: 0, emote: emote({ emoteId: 'fran-chatt' }) }] };
  assert.equal(N.emoteFields(bada).emote, 'fran-emoteList');
});

test('bryggan skickar en emote aven nar den kommer i en chattrad', () => {
  const kod = fs.readFileSync(path.join(ROT, 'tiktok-bridge/bridge.js'), 'utf8');
  const chatt = kod.slice(kod.indexOf('WebcastEvent.CHAT'), kod.indexOf('WebcastEvent.GIFT'));
  assert.match(chatt, /data\?\.emotes/,
    'CHAT-hanteraren tittar inte efter emotes — da kan subscriberEmote och fanSticker aldrig fyra');
  assert.match(chatt, /sendEvent\('subscriberemote'/,
    'CHAT-hanteraren skickar inget emote-event');
});

// `packageId` AR DISKRIMINATORN, INTE SCENEN.
//
// UPPMATT 2026-09-16 mot 156 emotes i tre SKARPA inspelningar (2026-09-01/02):
//   packageId 'fansclub' + emoteScene 2 ..... 53
//   packageId 'fansclub' + emoteScene 3 ..... 97   <- proto-enumet har inget 3
//   packageId ''         + emoteScene 2 ...... 6
// Scen 3 ar alltsa majoriteten och finns inte i enumet. En klassificering pa scenen hade stamplat
// 97 fanklubbs-stickers som prenumerationsemotes.
test('emotePaket foljer med ut ur emoteFields', () => {
  assert.equal(N.emoteFields(EMOTE_EVENT).emotePaket, 'fansclub',
    'packageId plockades inte ur emoteList — utan det gar en sticker inte att skilja fran en emote');
});

test('emotePaket overlever cloudEvent-vitlistan', () => {
  const moln = N.cloudEvent('e1', 'subscriberemote', N.emoteFields(EMOTE_EVENT));
  assert.equal(moln.emotePaket, 'fansclub', 'cloudEvent strok packageId');
});

test('en emote utan paket blir INTE en sticker', () => {
  const utan = { ...EMOTE_EVENT, emoteList: [{ ...EMOTE_EVENT.emoteList[0], packageId: '' }] };
  assert.equal(N.emoteFields(utan).emotePaket, '',
    'ett tomt paket ska forbli tomt — att gissa AT hallet sticker fyller fel valjare');
});

test('emoteScene foljer med ut ur emoteFields', () => {
  assert.equal(N.emoteFields(EMOTE_EVENT).emoteScene, 2, 'scenen plockades inte ur emoteList');
});

test('emoteScene overlever cloudEvent-vitlistan', () => {
  const moln = N.cloudEvent('e1', 'subscriberemote', N.emoteFields(EMOTE_EVENT));
  assert.equal(moln.emoteScene, 2,
    'cloudEvent strok emoteScene — utan den kan klienten inte skilja en Fan Club-sticker fran en emote');
});

test('en emote utan scen blir INTE en sticker', () => {
  // 99 = okand scen. Att gissa AT hallet 'sticker' hade fyllt fel valjare med ratt bilder.
  const utanScen = { ...EMOTE_EVENT, emoteList: [{ ...EMOTE_EVENT.emoteList[0], emoteScene: undefined }] };
  assert.notEqual(N.emoteFields(utanScen).emoteScene, 2, 'en ofullstandig nyttolast lases som sticker');
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
