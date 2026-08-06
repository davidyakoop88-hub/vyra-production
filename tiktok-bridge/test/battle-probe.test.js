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

test('sonden tar ALLA skalarer, inte bara de vars namn later som status', () => {
  // Sond ett letade efter namn som matchade status/stage/state/type/phase/result. Mot en riktig
  // TikTok-payload gav det EN traff: inviteeGiftPermissionType. Det som faktiskt bar lage var
  // `action` — som inte matchade — och battleResult, som ar ett objekt.
  const ut = N.battleProbe({ battleId: '7534', action: 2, battleSettings: { duration: 300 } });
  assert.equal(ut.skalarer.action, 2, 'action foll bort — det ar troligen just den som bar laget');
  assert.equal(ut.skalarer.battleId, '7534');
  assert.equal(ut.skalarer['battleSettings.duration'], 300, 'gick inte ner i nastlade objekt');
});

test('sonden gar ner i battleResult', () => {
  const ut = N.battleProbe({ battleResult: { winnerType: 1, teamResult: 2 } });
  assert.equal(ut.skalarer['battleResult.winnerType'], 1);
  assert.equal(ut.skalarer['battleResult.teamResult'], 2);
});

test('arrayer redovisas med langd, aldrig innehall', () => {
  // Det ar i armies och anchorsInfo deltagarna bor.
  const ut = N.battleProbe({ armies: [{ nickname: 'A' }, { nickname: 'B' }] });
  assert.equal(ut.skalarer['armies.length'], 2);
  assert.ok(!JSON.stringify(ut.skalarer).includes('nickname'), 'arrayens innehall loggades');
});

test('sonden slapper aldrig igenom anvandardata', () => {
  const ut = N.battleProbe({
    action: 1,
    anchorsInfo: { nickname: 'HEMLIG', avatarUrl: 'https://bild/x.png', userId: '123' },
    bubbleText: 'en text med mellanslag',
    ownerNickname: 'Nagon'
  });
  const s = JSON.stringify(ut.skalarer);
  for (const lackage of ['HEMLIG', 'https://bild/x.png', 'en text', 'Nagon', '123']) {
    assert.ok(!s.includes(lackage), `sonden loggade ${lackage}`);
  }
  assert.equal(ut.skalarer.action, 1, 'filtret tog med sig det vi faktiskt behover');
});

test('fritext med mellanslag loggas inte, aven under en ofarlig nyckel', () => {
  const ut = N.battleProbe({ status: 'en lang mening som ar fritext' });
  assert.equal(ut.skalarer.status, undefined);
  // Men ett kort enum-varde utan mellanslag ska med.
  assert.equal(N.battleProbe({ status: 'ended' }).skalarer.status, 'ended');
});

test('sonden gar inte ner i all oandlighet', () => {
  const djupt = { a: { b: { c: { d: { e: 1 } } } } };
  assert.doesNotThrow(() => N.battleProbe(djupt));
  assert.equal(JSON.stringify(N.battleProbe(djupt).skalarer).includes('a.b.c.d.e'), false,
    'ingen djupgrans — en cirkulär eller mycket djup payload skulle svalla loggen');
});

test('en trasig payload valter inte sonden', () => {
  for (const skrap of [null, undefined, 0, 'strang', []]) {
    assert.doesNotThrow(() => N.battleProbe(skrap), `kastade pa ${JSON.stringify(skrap)}`);
  }
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
  // Spannet ar HOGRE an i sond ett, och det ar avsiktligt: dar raknades varje handelse, har raknas
  // bara FORANDRADE rader. LINK_MIC_ARMIES fyrar upprepat med samma innehall och kostar nu noll.
  // Det som kostar ar riktiga skiften — dem far det inte finnas farre av an en match innehaller.
  const tak = BRYGGAN.match(/BATTLE_SOND_TAK\s*=\s*(\d+)/);
  assert.ok(tak, 'inget tak — en payload med tickande sekundraknare andras vid varje handelse');
  assert.ok(Number(tak[1]) >= 20 && Number(tak[1]) <= 80,
    `taket ar ${tak[1]}; under 20 kan slutet klippas bort, over 80 dranker loggen om nagot rakneverk tickar`);
});

test('sonden loggar bara nar varden andrats', () => {
  // LINK_MIC_ARMIES slog i sond ettas tak efter atta IDENTISKA rader, och slutet kan ha legat i
  // nummer nio. Skiftet start -> aktiv -> slut ar per definition en forandring.
  assert.match(BRYGGAN, /battleSondSenaste\.get\(namn\)\s*===\s*signatur/,
    'sonden jamfor inte mot forra loggade raden — brus branner taket');
});

test('taket raknar loggade rader, inte handelser', () => {
  // Raknas handelser i stallet tystnar sonden pa oforandrat brus innan det intressanta hander.
  const kropp = BRYGGAN.slice(BRYGGAN.indexOf('function loggaBattleSond'), BRYGGAN.indexOf('function scheduleReconnect'));
  const iJamforelse = kropp.indexOf('battleSondSenaste.get(namn) === signatur');
  const iRaknare = kropp.indexOf('battleSondRaknare.set(namn, n)');
  assert.ok(iJamforelse > -1 && iRaknare > iJamforelse,
    'raknaren okas fore forandringskontrollen');
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
