'use strict';
// `coins` bar DIAMANTER — steg 1 av #133: bada namnen, ingen omdopning.
//
// Coins ar vad TITTAREN betalar. Diamanter ar vad KREATOREN far, grovt halften, och det ar
// diamanter TikToks utbetalning bygger pa. Kallfaltet heter `diamondCount` i bada bryggorna, sa
// talet har alltid varit diamanter — det ar NAMNET som ljuger. Sa lange talet bara rangordnar
// spelar det ingen roll; det spelar roll forsta gangen nagon bygger en intaktsfunktion pa det.
// Det traffade oss redan en gang: Command Centers kort hette INTAKT (dopt om i #132).
//
// VARFOR INTE EN OMDOPNING. `coins` bevaras med flit:
//   * en publicerad .exe i drift skickar det namnet och kan inte uppdateras retroaktivt
//   * OBS-kallor kor cachad widgetkod
//   * live-leaderboard.js har redan `coins` som nyckel i sparad localStorage-state
// `coins` far ga bort forst nar inget laser det.
//
// VITLISTORNA AR HELA POANGEN. Bada vagarna slanger tyst falt de inte namner. Huset har gatt pa
// den minan tva ganger forut: chattexten och fanClubLevel fardades hela vagen fram till kontraktet
// och stroks dar. Ett falt som satts vid kallan men inte bars av vitlistan finns inte.
const test = require('node:test'), assert = require('node:assert/strict');

const { giftFields } = require('../tiktok-bridge/normalizer.js');
const GAVA = { diamondCount: 50, repeatCount: 3, giftName: 'Rose', uniqueId: 'viewer' };

test('molnbryggan satter diamonds vid sidan av coins, med samma tal', () => {
  const ut = giftFields(GAVA);
  assert.equal(ut.diamonds, 150, 'diamonds ska bara hela combons summa (50 x 3)');
  assert.equal(ut.coins, 150, 'coins bevaras oforandrat — gamla lasare far inte tappa varde');
});

// Molnets kontrakt (server/event-bus.js) provas i server/test/event-bus.test.js — filen kraver
// `redis`, som inte finns i klientens beroenden. Det ar samma skal som far
// tests/event-contract.test.js att lasa filens TEXT i stallet for att ladda den.
test('desktopens cleanEvent slanger inte diamanterna', () => {
  // cleanEvent bygger ett HELT NYTT objekt av namngivna falt. Allt annat forsvinner tyst.
  const kalla = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'electron-app', 'local-server.js'), 'utf8');
  assert.match(kalla, /diamonds:\s*number\(d\.diamonds \?\? d\.coins/,
    'cleanEvent namner inte diamonds — faltet droppas mellan tjansten och webblasaren');
});

test('klienten foredrar det sanna namnet men tappar ingen gammal avsandare', () => {
  const kalla = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'live-client.js'), 'utf8');
  assert.match(kalla, /diamonds:Number\(e\.diamonds\?\?e\.coins\?\?e\.diamondCount\?\?0\)/,
    'klienten normaliserar inte diamonds');
  assert.match(kalla, /coins:Number\(e\.diamonds\?\?e\.coins\?\?e\.diamondCount\?\?0\)/,
    'coins maste ge SAMMA tal — annars beror talet pa vilket namn lasaren rakar valja');
});

test('de tva namnen kan aldrig ge olika svar', () => {
  // Det farligaste utfallet av en halv migrering: tva falt som drar isar. Sa lange bada finns
  // MASTE de vara samma tal, annars beror beloppet pa vilket namn lasaren rakar valja.
  for (const d of [0, 1, 7, 12345]) {
    const ut = giftFields({ ...GAVA, diamondCount: d, repeatCount: 2 });
    assert.equal(ut.diamonds, ut.coins, 'diamonds och coins drog isar vid diamondCount=' + d);
  }
});
