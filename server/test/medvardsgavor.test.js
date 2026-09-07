'use strict';
// GÅVOR TILL EN MEDVÄRD ÄR INTE STREAMERNS.
//
// I ett flervärdsrum (link mic) går en del gåvor till en medvärd. TikTok märker dem med `toUser`.
// Fram till 2026-09-07 lästes fältet inte, så de räknades som värdens egna.
//
// UPPMÄTT i en skarp sändning 2026-09-06:
//
//   till värden (inget toUser):   55 gåvor    283 diamanter
//   till medvärd (toUser satt):   16 gåvor    604 diamanter    <- 68 % av kvällens värde
//
// ⚠️ GÄLLER INTE BATTLES. Då sitter motståndaren i sitt EGET rum och deras gåvor passerar aldrig
// vår anslutning; uppmätt 0 av 95 gåvor med toUser i battle-sändningen. Det är multi-guest som
// blandar ihop dem.
//
// SERVERN KAN INTE AVGÖRA DET SJÄLV — den vet inte streamerns TikTok-id. Bara bryggan gör det, via
// `mittAnkarId`. Därför härleds `tillVarden` vid källan och bärs som en flagga.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const normalizer = require(path.join(__dirname, '..', '..', 'tiktok-bridge', 'normalizer.js'));
const { cleanEvent } = require('../event-bus');
const { CONTRIBUTIONS } = (() => {
  // goal-runtime är beroendefri (se tests/rotsvitens-beroenden.test.js) men exporterar inte
  // CONTRIBUTIONS. Bidragen mäts därför genom modulens egen väg om den finns, annars via källan.
  try { return require('../goal-runtime') } catch { return {} }
})();

const OSS = '7100000000000000001';
const gava = (till) => normalizer.giftFields({
  giftDetails: { diamondCount: 30, giftName: 'Rose' },
  repeatCount: 10, repeatEnd: true,
  ...(till ? { toUser: { id: till } } : {}),
}, OSS);

test('en gåva utan toUser räknas som värdens', () => {
  const e = cleanEvent(normalizer.cloudEvent('k1', 'gift', gava(null)));
  assert.equal(e.tillVarden, true);
  assert.equal(e.diamonds, 300, 'värdet tappades');
});

test('en gåva till en medvärd markeras — men värdet bärs ändå', () => {
  const e = cleanEvent(normalizer.cloudEvent('k2', 'gift', gava('7100000000000000002')));
  assert.equal(e.tillVarden, false, 'medvärdsgåvan markerades inte');
  assert.equal(e.diamonds, 300,
    'värdet ströks i stället för att markeras — då går en medvärdstavla inte att bygga senare');
  assert.equal(e.toUserId, '7100000000000000002', 'mottagaren bars inte vidare');
});

test('en gåva till oss själva räknas som vår', () => {
  const e = cleanEvent(normalizer.cloudEvent('k3', 'gift', gava(OSS)));
  assert.equal(e.tillVarden, true);
});

test('FÖRVALET: en äldre brygga utan fältet räknas som i dag', () => {
  // Filtret får bara utesluta det vi är SÄKRA på. En brygga som inte skickar fältet, eller en där
  // fetchRoomInfo misslyckats, ska ge exakt dagens beteende — inte noll intäkter.
  assert.equal(cleanEvent({ id: 'x', type: 'gift', value: 100 }).tillVarden, true);
  assert.equal(normalizer.giftFields({ toUser: { id: 'nagon' } }, '').tillVarden, true,
    'utan ankar-id gissade den — då kan värdens egna gåvor filtreras bort');
});

// ---- vilka konsumenter som filtrerar, och vilka som med FLIT inte gör det --------------------
// En regel som ska tillämpas på N ställen glöms på ett. Den här listan gör uppdelningen till ett
// prov i stället för till en vana — och den skyddar ÅT BÅDA HÅLL: den fångar både en konsument som
// slutar filtrera och en som börjar filtrera fast den inte ska.
const RAKNAR_VARDENS = [
  ['server/goal-runtime.js', 'ett mål får inte öka av en gåva till någon annan'],
  ['server/stream-stats.js', 'statistiken och Top Gifters är värdens siffror'],
  ['server/heart-me-goal.js', 'en Heart Me till en medvärd är inte värdens'],
  ['live-leaderboard.js', 'klientens toppgivare visar värdens gåvor'],
];
// LÄR SIG VAD SOM FINNS, oberoende av mottagare. Att filtrera här vore fel: gåvokatalogen och
// gåvoidentiteten beskriver vilka GÅVOR som existerar, inte vem som fick dem. En Rose till en
// medvärd är fortfarande en Rose.
const LAR_SIG_ALLT = [
  ['server/gavokatalog.js', 'katalogen beskriver gåvor, inte mottagare'],
  ['server/gavoidentitet.js', 'lärläget lär sig giftId, inte vem som fick gåvan'],
];

const las = f => fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8');

for (const [fil, skal] of RAKNAR_VARDENS) {
  test(`${fil} filtrerar medvärdsgåvor (${skal})`, () => {
    assert.match(las(fil), /tillVarden/,
      `${fil} räknar medvärdsgåvor som värdens — 68 % av en uppmätt sändning var någon annans`);
  });
}

for (const [fil, skal] of LAR_SIG_ALLT) {
  test(`${fil} filtrerar INTE — ${skal}`, () => {
    assert.doesNotMatch(las(fil), /tillVarden/,
      `${fil} har börjat filtrera. Den lär sig vilka gåvor som finns, och det är oberoende av vem ` +
      'som fick dem — ett filter här gör katalogen sämre utan att göra någon siffra sannare.');
  });
}

test('goal-runtime räknar inte en medvärdsgåva', () => {
  const src = las('server/goal-runtime.js');
  assert.match(src, /event\.tillVarden === false \? \[\]/,
    'gåvobidraget saknar filtret, eller skrevs om till något annat än en tom lista');
});

test('stream-stats filtrerar gifts och diamonds med SAMMA villkor', () => {
  // EN HALV FILTRERING AR VARRE AN INGEN. Filtrerar `gifts` men inte `diamonds` blir summorna
  // inbordes motsagelsefulla — noll gavor men hundratals diamanter — och det ser ut som en
  // rakenskapsbugg nagon annanstans i systemet.
  //
  // Uppmatt med mutationsriggen 2026-09-07: en mutation som backade BARA diamonds-raden gav noll
  // fallande prov. Kommentaren i stream-stats.js varnade for exakt det, men ingenting matte det.
  const src = las('server/stream-stats.js');
  const rader = src.split('\n').filter(r => /const (gifts|diamonds) =/.test(r));
  assert.equal(rader.length, 2, 'hittade inte bada raderna — har blocket skrivits om?');
  for (const rad of rader) {
    assert.match(rad, /arVardensGava/,
      'gifts och diamonds anvander olika villkor: ' + rad.trim());
  }
  assert.doesNotMatch(src, /\barGava \?/,
    'en rad anvander fortfarande det ofiltrerade arGava — da racknas medvardsgavor dar');
});

test('bridge.js skickar mittAnkarId till giftFields', () => {
  // DEN ENDA MUTATION SOM GJORDE HELA FIXEN INERT UTAN ATT FALLA ETT PROV.
  //
  // Ändringen i bridge.js är ETT ORD. Tas det bort får `tillVardenAv` inget ankar-id, förvalet
  // slår till på varenda gåva, och `tillVarden` blir alltid true — filtret finns kvar i alla fyra
  // konsumenterna men slutar betyda något. Uppmätt med mutationsriggen 2026-09-07: noll fallande
  // prov, eftersom varje annat prov anropar `giftFields` DIREKT med ankar-id:t och därför aldrig
  // rör kopplingen.
  //
  // Samma vakt och samma skäl som `battleFields` fick 2026-09-06 (tiktok-bridge/test/
  // battle-poang.test.js). Den bor här, hos regeln den skyddar, och läser källan med readFileSync
  // — aldrig `require` över paketgränsen: CI kör `npm ci` per katalog.
  assert.match(las('tiktok-bridge/bridge.js'), /N\.giftFields\(\s*data\s*,\s*mittAnkarId\s*\)/,
    'bridge.js anropar giftFields UTAN ankar-id — då är varje gåva "till värden" och HELA ' +
    'medvärdsfiltret är verkningslöst, medan alla andra prov fortsätter vara gröna.');
});
