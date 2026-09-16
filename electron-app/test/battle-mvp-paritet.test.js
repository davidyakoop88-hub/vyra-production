'use strict';
// BATTLE MVP: DESKTOPVÄGEN SVARAR SAMMA SOM MOLNVÄGEN — annars tänds widgeten bara på ena hållet.
//
// #381: molnet tar emot typen `battle_mvp` och `battle-mvp-session.js` tänder widgeten på den, men
// skrivbordsappen SÄNDE den aldrig. `tiktok-service.js` emitterade elva typer och `battle_mvp` var
// ingen av dem. Battle MVP fungerade alltså på molnvägen och var helt tyst på desktopvägen.
//
// Luckan var dessutom OSYNLIG: alla tre paritetsproven plockade typnamnen med en teckenklass utan
// understreck, så `battle_mvp` kunde aldrig matchas och proven rapporterade paritet utan att ha
// jämfört typen. Teckenklassen rättades i #350, och luckan stod därefter namngiven som `KAND_LUCKA`
// i tests/desktop-paritet.test.js — tills nu.
//
// VAD DET HÄR PROVET MÄTER, och vad det INTE mäter.
//
// Det mäter PARITET: samma payload in, samma fält ut, ur båda implementationerna. Det är ett
// påstående som går att bevisa på en utvecklingsmaskin, och det är det som faktiskt gick sönder —
// två egna tolkningar av samma kontrakt.
//
// Det mäter INTE att fälten är rätt mot TikTok. Det kräver en riktig battle, och det avgörs i
// docs/live-verifiering.md. Skulle molnets härledning vara fel är den nu fel på båda ställena — men
// då är den ETT fel att laga, inte två som glidit isär.
//
// PAYLOADERNA ÄR UPPMÄTTA, INTE PÅHITTADE. Båda formerna kommer ordagrant ur
// tiktok-bridge/test/armies-mvp-tva-former.test.js, som i sin tur läste dem ur riktiga
// inspelningar 2026-09-02 och 2026-09-04. En fixtur med påhittad struktur hade bevisat att två
// funktioner är lika, inte att de läser det TikTok faktiskt skickar.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('node:path');

const desktop = require('../tiktok-fields.js');
const moln = require(path.join(__dirname, '..', '..', 'tiktok-bridge', 'normalizer.js'));

const VART_ANKARE = '7276185677820527649';
const MOTSTANDAREN = '7018482564693771270';

const bidrag = (nick, score) => ({
  userId: 'id#' + nick, score: String(score), nickname: 'namn#' + nick,
  avatarThumb: { urlList: ['https://cdn/' + nick + '.jpg'] },
  diamondScore: '0', userIdStr: '75862911878092' + nick.slice(0, 5), enigmaScore: '0'
});

// FORM A: `armies` som objekt nycklat på ankar-id. teamArmies är TOM men närvarande — uppmätt i
// 450 rader 2026-09-04, och en implementation som bara läser teamArmies svarar null på varje
// battle-slut utan att något säger ifrån.
const armiesLag = (ankarId, total, lista) => ({
  userArmies: lista, hostscore: String(total), anchorIdStr: String(ankarId),
  hostEnigmaScore: '0', hostEnigmaUv: '0'
});
const FORM_A = {
  common: { method: 'WebcastLinkMicArmies' },
  battleId: '7681772097240107798',
  triggerReason: 2,
  teamArmies: [],
  armies: {
    [MOTSTANDAREN]: armiesLag(MOTSTANDAREN, 7762, [bidrag('aaaa1111', 7500), bidrag('bbbb2222', 98)]),
    [VART_ANKARE]: armiesLag(VART_ANKARE, 3120, [bidrag('cccc3333', 2100), bidrag('dddd4444', 1020)])
  }
};

// FORM B: `teamArmies` som array med teamUser — uppmätt 2026-09-02.
const teamLag = (teamId, ankare, total, lista) => ({
  teamId: String(teamId),
  teamUser: ankare.map(id => ({ userId: 'id#a', score: '0', userIdStr: id, enigmaScore: '0' })),
  teamTotalScore: String(total),
  userArmies: { userArmies: lista, hostscore: String(total), anchorIdStr: String(teamId) },
  hostRank: '0'
});
const FORM_B = {
  common: { method: 'WebcastLinkMicArmies' },
  battleId: '7681024595775736598',
  triggerReason: 2,
  teamArmies: [
    teamLag(1, ['7023150919291716610', VART_ANKARE], 5075,
      [bidrag('13c98e19', 4258), bidrag('224f1f37', 705)]),
    teamLag(2, ['6805519295863489542', '6814454050551514118'], 2847,
      [bidrag('3215b44b', 2504), bidrag('b8155a99', 207)])
  ]
};

const FALL = [
  ['FORM A — armies-objekt, teamArmies tom', FORM_A, VART_ANKARE],
  ['FORM B — teamArmies-array', FORM_B, VART_ANKARE],
  ['fel ankare: motståndarens lag får aldrig bli vår MVP', FORM_A, MOTSTANDAREN],
  ['utan ankar-id — gissa inte vilken sida som är vår', FORM_A, ''],
  ['triggerReason som inte är 2 — matchen är inte slut', { ...FORM_A, triggerReason: 1 }, VART_ANKARE],
  ['tom payload', {}, VART_ANKARE],
  ['armies utan vårt lag', { ...FORM_A, armies: { [MOTSTANDAREN]: FORM_A.armies[MOTSTANDAREN] } }, VART_ANKARE]
];

for (const [namn, payload, ankare] of FALL) {
  test(`mvpFields: desktop === moln — ${namn}`, () => {
    assert.deepEqual(desktop.mvpFields(payload, ankare), moln.mvpFields(payload, ankare),
      'desktopvägen och molnvägen tolkar samma payload olika. Då tänds Battle MVP på ett håll och '
      + 'är tyst på det andra, vilket är exakt felet #381 beskriver.');
  });
}

test('KONTROLLMÄTNING: minst ett fall ger faktiskt en MVP', () => {
  // Utan den här hade hela tabellen ovan varit grön om båda implementationerna svarat null jämt.
  const ut = desktop.mvpFields(FORM_A, VART_ANKARE);
  assert.ok(ut, 'ingen MVP togs fram ur en payload som innehåller en');
  assert.equal(ut.name, 'namn#cccc3333', 'högsta poängen i VÅRT lag skulle valts');
  assert.equal(ut.score, 2100);
  assert.equal(ut.coins, 2100, 'coins ska bära samma värde som score — läses av olika ändar');
  assert.equal(ut.username, 'namn#cccc3333', 'username ska bära samma namn som name');
  assert.equal(ut.battleId, '7681772097240107798', 'utan battleId kan klienten inte deduplicera');
});

// ---- battleStatus: grinden som öppnar en MVP-session -------------------------------------------
//
// battle-mvp-session.js öppnar en session på battleStatus. Ordet fanns inte en enda gång i
// electron-app/ före den här ändringen, så MVP-sessionen kunde aldrig öppnas på desktopvägen —
// även om typen hade sänts.
//
// ⚠️ #350 påstod att battleStatus STRYKS AV VITLISTAN. Det stämde inte: det producerades aldrig.
// Att lägga till det i vitlistan hade sett ut som en fix utan att vara en.
const STATUSFALL = [
  ['action 4 → battle_started', { action: 4 }],
  ['action 5 → battle_finished', { action: 5 }],
  ['action 6 → battle_finished', { action: 6 }],
  ['battleSettings.status 1', { battleSettings: { status: 1 } }],
  ['battleSettings.status 2', { battleSettings: { status: 2 } }],
  ['battleSettings.status 3 → punish_started', { battleSettings: { status: 3 } }],
  ['battleSettings.status 4 → punish_finished', { battleSettings: { status: 4 } }],
  ['action vinner över battleSettings', { action: 5, battleSettings: { status: 1 } }],
  ['okänd action ger tom sträng', { action: 99 }],
  ['tom payload', {}]
];

// JÄMFÖRELSEN GÅR MOT battleFields(), INTE MOT battleStatusAv().
//
// Molnet exporterar inte battleStatusAv — den är intern. Ett första utkast här skrev
// `moln.battleStatusAv?.(…) ?? desktop.battleStatusAv(…)`, vilket hade jämfört desktop MED SIG
// SJÄLV och varit grönt utan att mäta någonting alls. Den sortens prov är sämre än inget: det ser
// ut som täckning.
//
// battleFields() är dessutom det som faktiskt korsar gränsen — fältet `battleStatus` i den
// händelse klienten läser. Det är kontraktet, och det är kontraktet som ska hålla.
test('KONTROLLMÄTNING: molnet exporterar inte battleStatusAv — jämförelsen måste gå via battleFields', () => {
  assert.equal(typeof moln.battleStatusAv, 'undefined',
    'battleStatusAv exporteras numera av molnet. Jämför gärna direkt mot den i stället — men ta '
    + 'bort den här kontrollmätningen först, annars vaktar den ett antagande som inte längre gäller.');
  assert.equal(typeof moln.battleFields, 'function', 'battleFields saknas — provet nedan mäter inget');
});

for (const [namn, payload] of STATUSFALL) {
  test(`battleStatus: desktop === moln — ${namn}`, () => {
    const molnetsStatus = moln.battleFields(payload, VART_ANKARE).battleStatus;
    assert.equal(desktop.battleStatusAv(payload, null), molnetsStatus,
      `${namn}: härledningarna glider isär. battleStatus är grinden som öppnar en MVP-session i `
      + 'battle-mvp-session.js — skiljer den sig öppnas sessionen på ena vägen och inte på den andra.');
  });
}

test('battleStatusAv faller tillbaka på battle-objektets eget fält', () => {
  assert.equal(desktop.battleStatusAv({}, { status: 'battle_finished' }), 'battle_finished');
  assert.equal(desktop.battleStatusAv({}, { battleStatus: 'battle_started' }), 'battle_started');
  assert.equal(desktop.battleStatusAv({}, {}), '');
});
