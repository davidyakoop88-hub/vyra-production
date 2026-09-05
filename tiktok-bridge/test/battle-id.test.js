'use strict';
// battleId MÅSTE FÖLJA MED PÅ `battle`, annars biter inte MVP-dedupen.
//
// DAVID I DRIFT 2026-09-05: två MVP-alerts per match — först med handtaget, sedan med
// visningsnamnet.
//
// DEDUPEN FANNS REDAN OCH VAR KORREKT. battle-mvp-session.js lindar triggerBattleMvp och håller en
// `annonserade`-mängd nycklad på battleId; tests/battle-mvp-dedup.test.js har nio prov på den, alla
// gröna. Men den fick aldrig någon nyckel från klientens EGEN räkning:
//
//   TikToks armélista  -> battle_mvp, som BAR battleId   -> dedupas
//   sessionens egen    -> oppna(e.battleId) ur `battle`  -> battleFields skickade det ALDRIG
//
// Dedupens egen regel släpper med flit igenom ett event utan id ("hellre en alert för mycket än
// ingen alls"), så den egna fyrningen kom alltid fram. Två alerts, varje match.
//
// VARFÖR INGET PROV FÅNGADE DET: klientprovets fixtur skickar
//     const battleStart = battleId => ({ type: 'battle', battleId, ... })
// alltså ett battle-event MED battleId — ett fält bryggan aldrig satte. Provet var grönt mot en
// payload som inte fanns. Det är samma söm-fel som gått igen hela den kvällen: båda sidor provade
// mot sitt eget antagande, och skarven mellan dem var oprovad.
//
// Det här provet mäter skarven: att bryggan faktiskt fyller fältet, och att det är SAMMA id som
// mvpFields skickar för samma match — annars dedupar man mot fel nyckel och felet ser ut att finnas
// kvar.
const test = require('node:test'), assert = require('node:assert/strict');
const N = require('../normalizer.js');

// Verklig payload ur inspelning 2026-09-05T2240 (maskad). battleId står på TOPPNIVÅ och upprepas i
// battleSettings — båda uppmätta, därav reserven i battleFields.
const ID = '7682152221400681249';
const battle = (over = {}) => Object.assign({
  common: { method: 'WebcastLinkMicBattle', msgId: '76821', roomId: '76821' },
  battleId: ID,
  battleSettings: { battleId: ID, startTimeMs: '1788640000000', duration: 300, status: 1 },
  battleResult: [], armies: [], anchorsInfo: []
}, over);

test('battleFields skickar battleId vidare', () => {
  assert.equal(N.battleFields(battle()).battleId, ID,
    'utan detta far klientens session inget id och dedupen kan aldrig bita');
});

test('battleSettings.battleId duger som reserv', () => {
  // Uppmatt i bada inspelningarna: id:t finns pa bada stallena. Toppnivan vinner, men faller den
  // bort en dag ska faltet inte tyst bli tomt igen.
  const utan = battle(); delete utan.battleId;
  assert.equal(N.battleFields(utan).battleId, ID);
});

test('SAMMA id som mvpFields ger for samma match — annars dedupar man mot fel nyckel', () => {
  // Det ar hela poangen. Tva olika id hade sett ut som en fungerande fix men gett tva alerts anda.
  const armies = {
    common: { method: 'WebcastLinkMicArmies' },
    battleId: ID, triggerReason: 2,
    armies: { 'ankare-1': { anchorIdStr: 'ankare-1', userArmies: [
      { userId: 'u1', userIdStr: 'u1', nickname: 'Lisa', score: '600' }] } }
  };
  const franMvp = N.mvpFields(armies, 'ankare-1');
  assert.ok(franMvp, 'mvpFields gav ingen traff — provets payload matchar inte armeMvp');
  assert.equal(franMvp.battleId, N.battleFields(battle()).battleId);
});

test('utan id i payloaden uppfinns inget', () => {
  // Ett tomt falt ar ratt svar: dedupen slapper da igenom eventet med flit, hellre en alert for
  // mycket an ingen alls. Ett PAHITTAT id hade daremot kunnat tysta en riktig match.
  const utan = battle(); delete utan.battleId; delete utan.battleSettings;
  assert.equal(N.battleFields(utan).battleId, '');
});
