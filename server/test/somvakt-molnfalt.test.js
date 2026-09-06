'use strict';
// SÖMVAKTAR SOM KÖR HELA KEDJAN: bryggan -> molnbodyn -> cleanEvent -> klientens normalisering.
//
// VARFÖR DE LIGGER I SERVERNS SVIT och inte i tests/ hos sina syskon: de måste `require`:a
// `server/event-bus.js`, som drar in `redis`. CI kör `npm ci` i VARJE pakets egen katalog, så ett
// rotprov som kräver serverkod faller med `Cannot find module 'redis'` — även när logiken är helt
// rätt. Det hände precis det här provet i PR #355, och det passerade lokalt bara för att
// utvecklarens worktree hade `server/node_modules` inlänkat. Regeln: `readFileSync` över
// paketgränsen är OK, `require` är det inte.
//
// Motsatt riktning är däremot ofarlig: `tiktok-bridge/normalizer.js` och `cloud-fields.js` är
// BEROENDEFRIA (noll bare-specifier-requires), så serverns svit kan ladda dem. Det kontrolleras
// maskinellt av tests/rotsvitens-beroenden.test.js i stället för att antas här.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const normalizer = require(path.join(__dirname, '..', '..', 'tiktok-bridge', 'normalizer.js'));
const { cleanEvent } = require('../event-bus');
const { normalizeCloudFields } = require(path.join(__dirname, '..', '..', 'cloud-fields.js'));

// ---- gåvans diamanter hela vägen fram till KONSUMENTEN ---------------------------------------
// Provet mäter SLUTVÄRDET, inte att ett fält finns i ett led — och skälet är att buggen i #349 satt
// i skarven mellan två korrekta led:
//
//   cleanEvent stämplade `diamonds: 0` (båda källfälten saknades i molnbodyn)
//   live-client.js läser `e.diamonds ?? e.coins` — och `??` faller INTE igenom på noll
//
// Båda raderna var rimliga var för sig. En gåva på 30 000 diamanter nådde Actions & Events med
// coins = 0, så varje giftCoins-regel med tröskel >= 1 var död på molnvägen medan samma regel
// fungerade i skrivbordsappen. Ett prov på "finns fältet?" hade varit grönt hela tiden.
test('SOMVAKT: gavans diamanter overlever hela vagen till Actions-nyttolasten', () => {
  const gava = normalizer.giftFields({
    user: { uniqueId: 'mia', nickname: 'Mia' },
    giftId: 9001, giftDetails: { diamondCount: 30, giftName: 'Heart Me' },
    repeatCount: 1000, repeatEnd: true,
  });
  assert.equal(gava.diamonds, 30000, 'forutsattningen brast: bryggan raknar inte fram 30000');

  const ram = cleanEvent(normalizer.cloudEvent('k1', 'gift', gava));
  const event = normalizeCloudFields({ ...ram });

  // EXAKT SÅ HÄR läser live-client.js:26 när den bygger nyttolasten till Actions & Events.
  const coinsSomActionsSer = Number(event.diamonds ?? event.coins ?? event.diamondCount ?? 0);
  assert.equal(coinsSomActionsSer, 30000,
    'Actions & Events far fel coins-varde — varje giftCoins-regel med troskel over noll ar dod');
});

// ---- `name` är ÖVERLASTAT och får inte läcka in i comment -------------------------------------
// `name` bär avsändarens visningsnamn på allt utom chat, där det bär kommentaren (båda bryggorna
// gör så; desktopens vitlista har inget comment-fält). cleanEvent låter därför `comment` falla
// tillbaka på `name` — och när `name` började följa med på molnvägen (#349) blev den fallbacken
// till att varje GÅVA fick avsändarens namn som chattkommentar.
test('SOMVAKT: avsandarens namn blir inte en chattkommentar pa en gava', () => {
  const gava = cleanEvent(normalizer.cloudEvent('k1', 'gift',
    normalizer.baseUser({ user: { uniqueId: 'mia', nickname: 'Mia Blomqvist' } })));
  assert.equal(gava.name, 'Mia Blomqvist', 'gavan tappade avsandarens namn');
  assert.equal(gava.comment, '', 'avsandarens namn lackte in i comment — visas som en chattrad');

  // Och chatten får INTE tappa texten när fallbacken smalnas av.
  const chat = cleanEvent(normalizer.cloudEvent('k2', 'chat',
    { ...normalizer.baseUser({ user: { uniqueId: 'x', nickname: 'X' } }), name: 'hej alla', comment: 'hej alla' }));
  assert.equal(chat.comment, 'hej alla', 'chattexten tappades');

  // Desktopvägen skickar chattexten BARA på `name` — dess egen vitlista har inget comment-fält.
  const desktopChat = cleanEvent({ id: 'k3', type: 'chat', username: 'x', name: 'hej fran desktop' });
  assert.equal(desktopChat.comment, 'hej fran desktop',
    'fallbacken comment <- name ar borta for chat — desktopvagens chattext forsvinner');
});

// ---- typen far inte dopas om sa att klientens grenar slutar matcha ---------------------------
// `member` doptes om till `viewer` i TYPE_ALIASES fram till 2026-09-06. Klientens
// liveEventTriggers grenar pa gift/follow/member/join/share/likes/chat — och `viewer` matchar
// INGEN av dem. Foljden: 281 personer gick in i rummet under en skarp sandning och noll
// medlems-Actions fyrade, medan desktopvagen (utan alias) fyrade alla 281.
//
// De ar dessutom tva olika saker: `member` bar en PERSON, `viewer` bar ett ANTAL.
test('SOMVAKT: member behaller sin typ hela vagen till klienten', () => {
  const e = cleanEvent({ id: 'm1', type: 'member', username: 'lisa' });
  assert.equal(e.type, 'member',
    'member dops om — klientens member-gren kan da aldrig matcha, och join-grenen inte heller');
});

test('de alias som ar KVAR ar de som klienten faktiskt grenar pa', () => {
  // likes -> like och chatcommand -> chat ar riktiga alias: klienten har grenar for bada malen.
  assert.equal(cleanEvent({ id: 'l1', type: 'likes' }).type, 'like');
  assert.equal(cleanEvent({ id: 'c1', type: 'chatcommand', username: 'x' }).type, 'chat');
});
