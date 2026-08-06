'use strict';
// Battle-sonden: ta reda pa VILKEN link-mic-handelse TikTok faktiskt anvander, utan att gissa.
//
// 2026-08-06 kordes en hel sandning utan att ett enda battle-event nadde klienten. Bevisat den
// kvallen:
//
//   - SSE-strommen fungerade (42 tittare sedda, sista eventet 2 minuter fore matningen)
//   - anslutningen satt stabilt: alla anslutningsfel lag FORE den enda "Ansluten till @",
//     ingenting failade efter
//   - klientens seenStatuses var TOM, alltsa nadde inget event av typen `battle` fram
//   - loggen kunde inte saga varfor: sendEvent loggar inte per event
//
// Biblioteket har sju link-mic-handelser. Bryggan prenumererade pa en. Vilken som bar en battles
// slut gar inte att lasa ut ur typerna - de ar generiska EventHandler - och ett felaktigt gissat
// forsok kostade redan en deploy samma kvall.
//
// Sonden LOGGAR BARA. Den far inte vidarebefordra: LINK_MIC_ARMIES fyrar upprepat under en match,
// och som `battle` skulle den stanga och oppna klientens session om och om igen - och tanda
// MVP-overlayn varje varv, mitt i sandningen.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const N = require('../normalizer.js');

const BRYGGAN = fs.readFileSync(path.join(__dirname, '..', 'bridge.js'), 'utf8');

// ---- vad sonden plockar ut -----------------------------------------------------------------------

test('sonden namnger nycklarna i payloaden', () => {
  const ut = N.battleProbe({ battleInfo: { status: 2, hostScore: 1200 }, common: {} });
  assert.deepEqual(ut.rotnycklar, ['battleInfo', 'common']);
  assert.deepEqual(ut.battlenycklar, ['status', 'hostScore']);
});

test('sonden plockar ut statusliknande falt, oavsett vad de heter', () => {
  const ut = N.battleProbe({ battleInfo: { status: 2, battleStage: 'end', armiesState: 1 } });
  assert.deepEqual(ut.statusliknande, { status: 2, battleStage: 'end', armiesState: 1 });
});

test('sonden slapper aldrig igenom anvandardata', () => {
  // Payloaden bar deltagarnas profiler. En logg ar inte ratt plats for dem.
  const ut = N.battleProbe({ battleInfo: {
    status: 1, anchorName: 'hemligt-namn', avatarUrl: 'https://bild/x.png',
    nickname: 'Nagon', comment: 'text', hostScore: 999
  } });
  const varden = JSON.stringify(ut.statusliknande);
  for (const lackage of ['hemligt-namn', 'https://bild/x.png', 'Nagon', 'text']) {
    assert.ok(!varden.includes(lackage), `sonden loggade ${lackage}`);
  }
  // NyckelNAMNEN far synas — de ar det som gor payloaden begriplig.
  assert.ok(ut.battlenycklar.includes('anchorName'));
});

test('en lang strang loggas inte, aven om faltet heter status', () => {
  const lang = 'x'.repeat(200);
  const ut = N.battleProbe({ battleInfo: { statusText: lang } });
  assert.equal(ut.statusliknande.statusText, undefined, 'en 200 teckens strang hamnade i loggen');
});

test('en trasig payload valter inte sonden', () => {
  for (const skrap of [null, undefined, 0, 'strang', []]) {
    assert.doesNotThrow(() => N.battleProbe(skrap), `kastade pa ${JSON.stringify(skrap)}`);
  }
});

test('utan battleInfo laser sonden roten', () => {
  const ut = N.battleProbe({ battleStatus: 'ended', foo: 1 });
  assert.deepEqual(ut.statusliknande, { battleStatus: 'ended' });
});

// ---- hur bryggan anvander den --------------------------------------------------------------------

test('bryggan prenumererar pa alla battle-relaterade handelser', () => {
  for (const namn of ['LINK_MIC_BATTLE', 'LINK_MIC_ARMIES', 'LINK_MIC_BATTLE_PUNISH_FINISH', 'LINK_MIC_BATTLE_TASK']) {
    assert.match(BRYGGAN, new RegExp(namn), `${namn} sonderas inte — da kan den inte uteslutas`);
  }
});

test('en handelse som inte finns i biblioteket valter inte anslutningen', () => {
  // WebcastEvent-namnen kan bytas mellan biblioteksversioner. connection.on(undefined, ...) hade
  // kastat mitt i uppkopplingen och tagit hela bryggan med sig.
  assert.match(BRYGGAN, /if \(!handelse\)/, 'ingen kontroll av att handelsen finns');
});

test('sonden vidarebefordrar ingenting', () => {
  const block = BRYGGAN.slice(BRYGGAN.indexOf('battle-sond ---'), BRYGGAN.indexOf('STREAM_END'));
  assert.doesNotMatch(block, /sendEvent\(/,
    'sonden skickar events — LINK_MIC_ARMIES skulle da tanda MVP-overlayn om och om igen mitt i en match');
});

test('sonden har ett tak sa loggen inte dranks', () => {
  const tak = BRYGGAN.match(/BATTLE_SOND_TAK\s*=\s*(\d+)/);
  assert.ok(tak, 'inget tak — LINK_MIC_ARMIES kan fyra manga ganger i minuten');
  assert.ok(Number(tak[1]) >= 3 && Number(tak[1]) <= 25,
    `taket ar ${tak[1]}; for lagt sager inget, for hogt dranker loggen`);
});

test('taket anvands, inte bara deklareras', () => {
  // Ett tak som ingen jamfor mot ar ingen begransning. Uppmatt: att bara kontrollera att
  // konstanten FINNS lat en mutation som tog bort sjalva returen ga igenom gron.
  assert.match(BRYGGAN, /if\s*\(\s*n\s*>\s*BATTLE_SOND_TAK\s*\)\s*return/,
    'raknaren jamfors aldrig mot taket — sonden loggar varje handelse hur manga det an blir');
});

test('den riktiga battle-vidarebefordringen ar orord', () => {
  assert.match(BRYGGAN, /WebcastEvent\.LINK_MIC_BATTLE,\s*data\s*=>\s*sendEvent\('battle'/,
    'sonden ersatte den riktiga handleraren i stallet for att ligga bredvid');
});
