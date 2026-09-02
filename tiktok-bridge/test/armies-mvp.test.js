'use strict';
// TikToks EGEN bidragslista vid battle-slut.
//
// I dag räknar battle-mvp-session.js själv: den summerar coins ur de gift-event som når klienten
// under matchen. Det fungerar, men har tre svagheter som TikToks egen lista inte har:
//
//   1. Öppnas overlayen mitt i en match saknas allt som hänt dessförinnan.
//   2. Ett tappat gift-event tappar också bidraget.
//   3. RAW COINS ÄR INTE BATTLE-POÄNG. Boosting Glove multiplicerar poängen i matchen, så den
//      siffra TikTok visar på skärmen är inte summan av gåvornas diamanter.
//
// TikTok skickar hela rankingen färdigräknad vid `LINK_MIC_ARMIES` med
// `triggerReason: 2` (BATTLE_END, ur LinkMicArmiesTriggerReason).
//
// UPPMÄTT 2026-09-02, två battle-slut i samma sändning:
//
//   battle 1  team 1 (vårt) 5075 mot team 2  2847   topp: 4258 / 705 / 9
//   battle 2  team 1 (vårt) 5432 mot team 2   451   topp: 2414 / 2398 / 7
//
// Andra matchen är ett bra prov i sig: 2414 mot 2398 är sexton poäng isär. En sortering som är
// instabil eller läser fel fält ger fel vinnare där, men rätt i den första.
//
// VILKET LAG ÄR VÅRT? Det är den fråga som gör funktionen farlig — listan bär BÅDA sidorna, och
// fel val hyllar motståndarens tittare i vår egen overlay. Svaret är uppmätt, inte antaget:
// rummets ägare (fetchRoomInfo -> data.owner.id_str = 7276185677820527649 för jokero060) finns i
// `teamArmies[].teamUser[].userIdStr` för team 1. Vårt lag är alltså det vars teamUser innehåller
// vårt eget ankar-id.
//
// UTAN ANKAR-ID GÖR FUNKTIONEN INGENTING. Att gissa "team 1 är alltid vårt" hade fungerat i båda
// de uppmätta matcherna och varit fel så fort streamern bjuds in i stället för att bjuda.
//
// RÖTT NU: normalizer.js har ingen armeMvp.
const test = require('node:test'), assert = require('node:assert/strict');
const N = require('../normalizer.js');

// ---- de två verkliga battle-sluten ----------------------------------------------------------------

const VART_ANKARE = '7276185677820527649';   // jokero060, ur fetchRoomInfo().data.owner.id_str

const bidrag = (nick, score) => ({
  userId: 'id#' + nick, score: String(score), nickname: 'namn#' + nick,
  avatarThumb: { urlList: ['https://cdn/' + nick + '.jpg'] }
});

const lag = (teamId, ankare, total, bidragslista) => ({
  teamId: String(teamId),
  teamUser: ankare.map(id => ({ userId: 'id#a', score: '0', userIdStr: id, enigmaScore: '0' })),
  teamTotalScore: String(total),
  userArmies: { userArmies: bidragslista, hostscore: String(total), anchorIdStr: String(teamId) },
  hostRank: '0'
});

// battle 1: vart lag vinner 5075-2847, topp 4258
const SLUT_1 = {
  common: { method: 'WebcastLinkMicArmies', roomId: '7681020984748411670' },
  battleId: '7681024595775736598',
  triggerReason: 2,
  teamArmies: [
    lag(1, ['7023150919291716610', VART_ANKARE], 5075,
      [bidrag('13c98e19', 4258), bidrag('224f1f37', 705), bidrag('9599e3c1', 9)]),
    lag(2, ['6805519295863489542', '6814454050551514118'], 2847,
      [bidrag('3215b44b', 2504), bidrag('b8155a99', 207), bidrag('467424ba', 103)])
  ]
};

// battle 2: 2414 mot 2398 — sexton poang isar
const SLUT_2 = {
  common: { method: 'WebcastLinkMicArmies', roomId: '7681020984748411670' },
  battleId: '7681026111756651286',
  triggerReason: 2,
  teamArmies: [
    lag(1, ['7023150919291716610', VART_ANKARE], 5432,
      [bidrag('13c98e19', 2414), bidrag('224f1f37', 2398), bidrag('2845fa45', 7)]),
    lag(2, ['6805519295863489542', '6814454050551514118'], 451,
      [bidrag('b8155a99', 389), bidrag('467424ba', 34), bidrag('d6f917bb', 5)])
  ]
};

// ---- 1. rätt person ur rätt lag ------------------------------------------------------------------

test('MVP ur det första uppmätta battle-slutet', () => {
  assert.equal(typeof N.armeMvp, 'function', 'normalizer.js exporterar ingen armeMvp');
  const m = N.armeMvp(SLUT_1, VART_ANKARE);
  assert.ok(m, 'ingen MVP alls');
  assert.equal(m.name, 'namn#13c98e19');
  assert.equal(m.score, 4258);
  assert.equal(m.profileImage, 'https://cdn/13c98e19.jpg');
});

test('MVP ur det andra — 2414 mot 2398, sexton poäng isär', () => {
  const m = N.armeMvp(SLUT_2, VART_ANKARE);
  assert.equal(m.name, 'namn#13c98e19', 'fel person när marginalen är liten');
  assert.equal(m.score, 2414);
});

test('MOTSTÅNDARENS topplista väljs aldrig', () => {
  // Farligast av allt: 2504 i lag 2 ar HOGRE an 2414 i vart lag i battle 2. En funktion som bara
  // tar hogsta score i hela payloaden hyllar motstandarens tittare i var egen overlay.
  const m = N.armeMvp(SLUT_2, VART_ANKARE);
  assert.notEqual(m.name, 'namn#b8155a99');
  const m1 = N.armeMvp(SLUT_1, VART_ANKARE);
  assert.notEqual(m1.name, 'namn#3215b44b', 'valde motståndarens 2504 över vår 4258');
});

test('vårt lag hittas oavsett var i listan det ligger', () => {
  const omvant = { ...SLUT_1, teamArmies: [...SLUT_1.teamArmies].reverse() };
  assert.equal(N.armeMvp(omvant, VART_ANKARE).name, 'namn#13c98e19',
    'funktionen antar att vårt lag ligger först');
});

// ---- 2. utan ankar-id: gör ingenting ---------------------------------------------------------------

test('utan ankar-id returneras null — ingen gissning', () => {
  // Att gissa "team 1 ar alltid vart" hade fungerat i BADA de uppmatta matcherna och varit fel sa
  // fort streamern bjuds IN i stallet for att bjuda. Hellre tyst an fel person pa skarmen.
  for (const id of [undefined, null, '', 0]) {
    assert.equal(N.armeMvp(SLUT_1, id), null, `ankar-id ${JSON.stringify(id)} gav ändå en MVP`);
  }
});

test('tomt ankar-id matchar inte ett lag med tomt userIdStr', () => {
  // HAR ar kravet lastbarande. Utan `if (!ankare) return null` jamfors '' mot '' och ett trasigt
  // lag med tomt userIdStr skulle valjas som VART — och da hyllas en slumpvis tittare. Ett
  // mutationsprov visade att raden annars ar redundant; det har fallet ar varfor den star kvar.
  const trasigt = { triggerReason: 2, teamArmies: [
    { teamUser: [{ userIdStr: '' }], userArmies: { userArmies: [bidrag('okand', 999)] } }
  ] };
  assert.equal(N.armeMvp(trasigt, ''), null, 'tomt ankar-id matchade ett tomt userIdStr');
  assert.equal(N.armeMvp(trasigt, undefined), null);
});

test('ett ankar-id som inte finns i någon lista ger null', () => {
  assert.equal(N.armeMvp(SLUT_1, '9999999999999999999'), null);
});

// ---- 3. bara vid battle-slut ------------------------------------------------------------------------

test('bara triggerReason 2 (BATTLE_END) räknas', () => {
  // LinkMicArmiesTriggerReason: SCORE_UPDATE=1 (214 st), BATTLE_END=2 (2 st), KEEP_ALIVE=4 (89 st).
  // Under matchen kommer poangen hela tiden — en MVP dar hade tant widgeten mitt i.
  for (const skal of [0, 1, 3, 4, 5, undefined, null]) {
    assert.equal(N.armeMvp({ ...SLUT_1, triggerReason: skal }, VART_ANKARE), null,
      `triggerReason ${skal} tolkades som battle-slut`);
  }
});

// ---- 4. tomma och trasiga fall ----------------------------------------------------------------------

test('ett lag utan bidrag ger null, inte en tom MVP', () => {
  const tomt = { ...SLUT_1, teamArmies: [lag(1, [VART_ANKARE], 0, [])] };
  assert.equal(N.armeMvp(tomt, VART_ANKARE), null);
});

test('bidrag med noll poäng vinner inte', () => {
  const nollor = { ...SLUT_1,
    teamArmies: [lag(1, [VART_ANKARE], 0, [bidrag('a', 0), bidrag('b', 0)])] };
  assert.equal(N.armeMvp(nollor, VART_ANKARE), null, 'en match utan bidrag ska inte visa någon MVP');
});

test('trasig payload kastar inte', () => {
  for (const p of [undefined, null, {}, { triggerReason: 2 },
    { triggerReason: 2, teamArmies: [] },
    { triggerReason: 2, teamArmies: [{ teamUser: null, userArmies: null }] }]) {
    assert.equal(N.armeMvp(p, VART_ANKARE), null, `${JSON.stringify(p)} gav en MVP`);
  }
});

test('saknad avatar ger tom sträng, inte undefined', () => {
  const utan = { ...SLUT_1, teamArmies: [lag(1, [VART_ANKARE], 10,
    [{ nickname: 'namn#x', score: '10' }])] };
  assert.equal(N.armeMvp(utan, VART_ANKARE).profileImage, '');
});

// ---- 5. lika poäng får ett stabilt svar -------------------------------------------------------------

test('vid exakt lika poäng avgör namnet — samma svar varje körning', () => {
  // Utan en sista tie-breaker beror svaret pa inmatningsordningen, och ett prov pa det blir flakigt
  // i stallet for fel. Samma resonemang som valjMvp i battle-mvp-session.js redan anvander.
  const a = { ...SLUT_1, teamArmies: [lag(1, [VART_ANKARE], 20, [bidrag('bbb', 10), bidrag('aaa', 10)])] };
  const b = { ...SLUT_1, teamArmies: [lag(1, [VART_ANKARE], 20, [bidrag('aaa', 10), bidrag('bbb', 10)])] };
  assert.equal(N.armeMvp(a, VART_ANKARE).name, N.armeMvp(b, VART_ANKARE).name);
  assert.equal(N.armeMvp(a, VART_ANKARE).name, 'namn#aaa');
});
