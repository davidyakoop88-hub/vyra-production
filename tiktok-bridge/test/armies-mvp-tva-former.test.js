'use strict';
// TIKTOK SKICKAR ARMÉLISTAN I TVÅ FORMER — och `armeMvp` läste bara den ena.
//
// UPPMÄTT över två skarpa sändningar med samma konto, två dygn isär:
//
//   inspelning   LINK_MIC_ARMIES   teamArmies fylld   armies-objekt   triggerReason=2
//   2026-09-02              305           305 av 305             305                 2
//   2026-09-04              450             0 av 450             450                 4
//
// Den 2 september bar `teamArmies` hela strukturen och `armeMvp` gav rätt MVP (4258 respektive
// 2414 poäng — samma tal som armies-mvp.test.js mätte). Den 4 september var `teamArmies` en TOM
// ARRAY i varenda rad, och `armeMvp` hade svarat null på fyra battle-slut i rad.
//
// `armies` — ett OBJEKT nycklat på ankar-id — fanns i BÅDA inspelningarna, i varenda rad. Det är
// alltså den form som går att lita på, och den `armeMvp` ska läsa i första hand.
//
// FÄLLAN SOM GÖR DET LÄTT ATT MISSA: `teamArmies: []` är TRUTHY. En `||`-kedja som börjar med
// `teamArmies` faller aldrig igenom till `armies` — den stannar på den tomma listan och rapporterar
// "ingen armé". Det är exakt vad analysatorns punkt 4 gjorde innan det här provet skrevs.
//
// STRUKTURSKILLNADEN, ordagrant ur inspelningarna:
//
//   teamArmies[i] = { teamId, teamUser:[{userIdStr}], teamTotalScore,
//                     userArmies: { userArmies:[…], hostscore, anchorIdStr } }
//   armies[ankarId] = { userArmies:[…], hostscore, anchorIdStr, hostEnigmaScore, hostEnigmaUv }
//
// Alltså: i den ena är `userArmies` ett OBJEKT som bär listan, i den andra ÄR den listan.
const test = require('node:test'), assert = require('node:assert/strict');
const N = require('../normalizer.js');

const VART_ANKARE = '7276185677820527649';        // rummets ägare, ur fetchRoomInfo().data.owner.id_str
const MOTSTANDAREN = '7018482564693771270';

const bidrag = (nick, score) => ({
  userId: 'id#' + nick, score: String(score), nickname: 'namn#' + nick,
  avatarThumb: { urlList: ['https://cdn/' + nick + '.jpg'] },
  diamondScore: '0', userIdStr: '75862911878092' + nick.slice(0, 5), enigmaScore: '0'
});

// ---- FORM A: `armies`, objekt nycklat pa ankar-id (uppmatt 2026-09-04) --------------------------
const armiesLag = (ankarId, total, lista) => ({
  userArmies: lista, hostscore: String(total), anchorIdStr: String(ankarId),
  hostEnigmaScore: '0', hostEnigmaUv: '0',
});
const FORM_A = {
  common: { method: 'WebcastLinkMicArmies' },
  battleId: '7681772097240107798',
  triggerReason: 2,
  // TOM — men NARVARANDE. Det ar hela poangen med provet.
  teamArmies: [],
  armies: {
    [MOTSTANDAREN]: armiesLag(MOTSTANDAREN, 7762, [bidrag('aaaa1111', 7500), bidrag('bbbb2222', 98)]),
    [VART_ANKARE]: armiesLag(VART_ANKARE, 3120, [bidrag('cccc3333', 2100), bidrag('dddd4444', 1020)]),
  },
};

// ---- FORM B: `teamArmies`, array med teamUser (uppmatt 2026-09-02) ------------------------------
const teamLag = (teamId, ankare, total, lista) => ({
  teamId: String(teamId),
  teamUser: ankare.map(id => ({ userId: 'id#a', score: '0', userIdStr: id, enigmaScore: '0' })),
  teamTotalScore: String(total),
  userArmies: { userArmies: lista, hostscore: String(total), anchorIdStr: String(teamId) },
  hostRank: '0',
});
const FORM_B = {
  common: { method: 'WebcastLinkMicArmies' },
  battleId: '7681024595775736598',
  triggerReason: 2,
  teamArmies: [
    teamLag(1, ['7023150919291716610', VART_ANKARE], 5075,
      [bidrag('13c98e19', 4258), bidrag('224f1f37', 705)]),
    teamLag(2, ['6805519295863489542', '6814454050551514118'], 2847,
      [bidrag('3215b44b', 2504), bidrag('b8155a99', 207)]),
  ],
};

// ---- proven -------------------------------------------------------------------------------------

test('FORM A: laser armies-objektet nar teamArmies ar tom', () => {
  const mvp = N.armeMvp(FORM_A, VART_ANKARE);
  assert.ok(mvp, 'armeMvp svarade null pa den form som uppmattes i 450 rader 2026-09-04. '
    + '`teamArmies: []` ar truthy — en ||-kedja som borjar dar faller aldrig igenom till `armies`.');
  assert.equal(mvp.name, 'namn#cccc3333', `fel givare valdes: ${mvp.name}`);
  assert.equal(mvp.score, 2100, `fel poang: ${mvp.score}`);
});

test('FORM A: valjer VART lag, aldrig motstandarens', () => {
  // Motstandarens topp ar 7500 — mer an bade vara. Valjs fel lag hyllar overlayn deras tittare.
  const mvp = N.armeMvp(FORM_A, VART_ANKARE);
  assert.ok(mvp, 'ingen MVP');
  assert.notEqual(mvp.name, 'namn#aaaa1111',
    'motstandarens topp (7500) valdes — laget avgors av ankar-id, aldrig av hogsta poang');
  assert.equal(mvp.score, 2100);
});

test('FORM A: motstandarens ankar-id ger motstandarens topp', () => {
  // Spegelprovet. Utan det kan funktionen returnera "forsta laget" och anda se ratt ut ovan.
  const mvp = N.armeMvp(FORM_A, MOTSTANDAREN);
  assert.ok(mvp, 'ingen MVP for motstandaren');
  assert.equal(mvp.score, 7500, `fick ${mvp.score} — laget valjs inte av ankar-id`);
});

test('armies nycklad pa nagot annat an ankar-id — anchorIdStr avgor', () => {
  // I bada de uppmatta sandningarna ar nyckeln SAMMA som anchorIdStr, sa den har vagen ar inte
  // uppmatt. Den finns for att nyckeln ar TikToks kartnyckel och kan vara ett lagindex; da ar
  // anchorIdStr det enda som pekar ut vart lag. Utan det har provet ar reserven otestad kod —
  // och en otestad reserv ar en gissning som ser ut som en garanti.
  const d = { ...FORM_A, armies: {
    '1': armiesLag(MOTSTANDAREN, 7762, [bidrag('aaaa1111', 7500)]),
    '2': armiesLag(VART_ANKARE, 3120, [bidrag('cccc3333', 2100)]),
  } };
  const mvp = N.armeMvp(d, VART_ANKARE);
  assert.ok(mvp, 'anchorIdStr-vagen hittade inte vart lag nar nyckeln var ett lagindex');
  assert.equal(mvp.score, 2100, 'fel lag valdes: ' + mvp.score);
});

test('FORM B fungerar fortfarande — den uppmattes 2026-09-02', () => {
  // Formen ar inte borta, den var bara tom den 4:e. En fix som byter ut den i stallet for att
  // lagga till skulle tysta MVP igen nasta gang TikTok skickar den.
  const mvp = N.armeMvp(FORM_B, VART_ANKARE);
  assert.ok(mvp, 'teamArmies-formen slutade fungera');
  assert.equal(mvp.name, 'namn#13c98e19');
  assert.equal(mvp.score, 4258, `fick ${mvp.score}`);
});

test('utan ankar-id gors ingenting — i bada formerna', () => {
  // Att gissa "forsta laget ar vart" hade fungerat i alla uppmatta matcher och varit fel sa fort
  // streamern blir INBJUDEN i stallet for att bjuda.
  assert.equal(N.armeMvp(FORM_A, ''), null, 'FORM A byggde en MVP utan ankar-id');
  assert.equal(N.armeMvp(FORM_B, ''), null, 'FORM B byggde en MVP utan ankar-id');
  assert.equal(N.armeMvp(FORM_A, null), null);
});

test('ett ankar-id som inte deltar ger null, inte nagon annans lag', () => {
  assert.equal(N.armeMvp(FORM_A, '9999999999999999999'), null,
    'ett okant ankar-id gav en MVP — da hade fel lag hyllats');
});

test('bara triggerReason 2 racknas som matchens slut', () => {
  for (const tr of [1, 3, 4, undefined]) {
    assert.equal(N.armeMvp({ ...FORM_A, triggerReason: tr }, VART_ANKARE), null,
      `triggerReason ${tr} gav en MVP — overlayn hade tants mitt i matchen`);
  }
});

test('tomma och trasiga former ger null, aldrig ett kast', () => {
  for (const d of [null, undefined, {}, { triggerReason: 2 },
      { triggerReason: 2, armies: null }, { triggerReason: 2, armies: [] },
      { triggerReason: 2, armies: { [VART_ANKARE]: {} } },
      { triggerReason: 2, armies: { [VART_ANKARE]: { userArmies: [] } } },
      { triggerReason: 2, armies: { [VART_ANKARE]: { userArmies: 'nej' } } }]) {
    assert.doesNotThrow(() => N.armeMvp(d, VART_ANKARE), 'kastade pa ' + JSON.stringify(d));
    assert.equal(N.armeMvp(d, VART_ANKARE), null, 'gav en MVP for ' + JSON.stringify(d));
  }
});

test('en givare utan namn eller med noll poang raknas inte', () => {
  const d = { ...FORM_A, armies: { [VART_ANKARE]: armiesLag(VART_ANKARE, 10, [
    { ...bidrag('utannamn', 9000), nickname: '' },
    bidrag('riktig', 5),
  ]) } };
  const mvp = N.armeMvp(d, VART_ANKARE);
  assert.ok(mvp, 'ingen MVP');
  assert.equal(mvp.name, 'namn#riktig',
    'en post utan namn vann — den kan inte visas i overlayn och far inte ranknas');
});

test('mvpFields bar samma tal vidare ur FORM A', () => {
  const f = N.mvpFields(FORM_A, VART_ANKARE);
  assert.ok(f, 'mvpFields svarade null pa den uppmatta formen');
  assert.equal(f.name, 'namn#cccc3333');
  assert.equal(f.username, f.name, 'bada namnformerna ska bara samma varde');
  assert.equal(f.score, 2100);
  assert.equal(f.coins, 2100, 'coins ar aliaset for score i MVP-eventet');
  assert.equal(f.battleId, '7681772097240107798', 'battleId tappades');
});
