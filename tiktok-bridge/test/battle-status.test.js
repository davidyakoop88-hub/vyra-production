'use strict';
// Battle MVP har aldrig kunnat tända — sessionen öppnas inte ens.
//
// KEDJAN. battle-mvp-session.js öppnar en session när ett `battle`-event har ett `battleStatus`
// som dess `klassa()` läser som 'aktiv', räknar gåvor under matchen, och tänder MVP när ett
// senare `battleStatus` läses som 'slut'.
//
//   SLUT  = /(end|finish|over|settle|result|punish|complete|close)/
//   AKTIV = /(start|begin|active|progress|ongoing|running|live)/
//
// Men `battleFields` i normalizer.js satte faltet sa har:
//
//   const battle = data?.battleInfo || data?.battle || data;
//   battleStatus: text(battle?.status || battle?.battleStatus || '', 64)
//
// alltsa `data.status`. UPPMATT I SKARP SANDNING 2026-09-02: det faltet finns inte. Statusen ligger
// EN NIVA DJUPARE, pa `data.battleSettings.status`. battleStatus blev darfor ALLTID tom strang,
// klassa('') svarar 'okänd', och `hanteraBattle` gor da ingenting alls. Sessionen oppnas aldrig,
// stangs aldrig, och MVP kan inte tanda oavsett hur manga gavor som kommer in.
//
// TVA SIGNALER FINNS, BADA UPPMATTA (fem battle-event, en sandning):
//
//   data.action                 4 = OPEN   (3 st)   5 = FINISH (2 st)
//   data.battleSettings.status  1 = BATTLE_STARTED
//
// Enum-namnen kommer ur bibliotekets egna typer (tiktok-live-proto/v3):
//   LinkMicBattleBattleAction   INVITE=1 REJECT=2 CANCEL=3 OPEN=4 FINISH=5 CUT_SHORT=6 ...
//   BattleSettingsBattleStatus  NOT_STARTED=0 STARTED=1 FINISHED=2 PUNISH_STARTED=3
//                               PUNISH_FINISHED=4
//
// `action` ar TRANSITIONEN och gar fore; `battleSettings.status` ar TILLSTANDET och ar reserv.
//
// VARDENA MASTE VARA ORD, INTE SIFFROR. Klientens klassa() kor en ORDSOKNING — en etta eller tvaa
// matchar ingenting och blir 'okänd'. Bryggan oversatter darfor till ord klienten kanner igen.
// Det ar ocksa varfor NOT_STARTED (0) ger TOM strang och inte 'not_started': det ordet innehaller
// "start" och hade oppnat en session for en match som inte borjat.
//
// RÖTT NU: battleFields läser data.status, som inte finns.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const N = require('../normalizer.js');

const ROT = path.join(__dirname, '..', '..');
const KLIENT = fs.readFileSync(path.join(ROT, 'battle-mvp-session.js'), 'utf8');

// Klientens egna monster, lasta ur kallan i stallet for kopierade. Andras de dar ska det har
// provet folja med, inte tyst sluta stamma.
const SLUT = new RegExp(KLIENT.match(/const SLUT = \/\(([^)]*)\)\//)[1]);
const AKTIV = new RegExp(KLIENT.match(/const AKTIV = \/\(([^)]*)\)\//)[1]);
const klassa = v => {
  const s = String(v == null ? '' : v).toLowerCase();
  if (!s) return 'okänd';
  if (SLUT.test(s)) return 'slut';
  if (AKTIV.test(s)) return 'aktiv';
  return 'okänd';
};

// ---- verkliga payloads ur inspelningen 2026-09-02 ------------------------------------------------

const battle = (over = {}) => Object.assign({
  common: { method: 'WebcastLinkMicBattle', msgId: '768102', roomId: '768102' },
  battleId: '7681024595775736598',
  battleSettings: { battleId: '7681024595775736598', startTimeMs: '1788377924330',
    duration: 301, status: 1, battleType: 2, endTimeMs: '0' },
  battleResult: [],
  armies: [],
  anchorsInfo: []
}, over);

// ---- 1. de två uppmätta signalerna ----------------------------------------------------------------

test('action 4 (OPEN) läses som en battle som börjat', () => {
  const s = N.battleFields(battle({ action: 4 })).battleStatus;
  assert.ok(s, 'battleStatus är tom — sessionen öppnas aldrig och MVP kan inte tända');
  assert.equal(klassa(s), 'aktiv', `klienten läser "${s}" som ${klassa(s)}, inte aktiv`);
});

test('action 5 (FINISH) läses som en battle som tagit slut', () => {
  const s = N.battleFields(battle({ action: 5, battleSettings: { status: 2 } })).battleStatus;
  assert.equal(klassa(s), 'slut', `klienten läser "${s}" som ${klassa(s)}, inte slut`);
});

test('hela matchen: OPEN följt av FINISH ger aktiv följt av slut', () => {
  // Ordningen ar hela poangen. Oppnar inte det forsta eventet en session raknas inga gavor, och
  // stanger inte det andra den tands ingen MVP.
  const forlopp = [battle({ action: 4 }), battle({ action: 5, battleSettings: { status: 2 } })]
    .map(p => klassa(N.battleFields(p).battleStatus));
  assert.deepEqual(forlopp, ['aktiv', 'slut']);
});

// ---- 2. tillståndet som reserv ---------------------------------------------------------------------

test('battleSettings.status läses när action saknas', () => {
  // BattleSettingsBattleStatus: 1=STARTED, 2=FINISHED, 3=PUNISH_STARTED, 4=PUNISH_FINISHED
  const av = st => klassa(N.battleFields(battle({ battleSettings: { status: st } })).battleStatus);
  assert.equal(av(1), 'aktiv', 'BATTLE_STARTED öppnade ingen session');
  assert.equal(av(2), 'slut', 'BATTLE_FINISHED stängde ingen session');
  assert.equal(av(3), 'slut', 'straffläget betyder att matchen är över');
  assert.equal(av(4), 'slut', 'straffet avslutat betyder att matchen är över');
});

test('NOT_STARTED (0) öppnar INTE en session', () => {
  // Fallan: ordet "not_started" innehaller "start" och hade matchat AKTIV. Darfor tom strang.
  const s = N.battleFields(battle({ battleSettings: { status: 0 } })).battleStatus;
  assert.equal(klassa(s), 'okänd', `NOT_STARTED gav "${s}" som klienten läser som ${klassa(s)}`);
});

test('action går före battleSettings.status', () => {
  // Transitionen ar farskare an tillstandet: FINISH kommer i samma event som en settings-status
  // som fortfarande sager 1 (STARTED) i vissa former. Vinner tillstandet stangs matchen aldrig.
  const s = N.battleFields(battle({ action: 5, battleSettings: { status: 1 } })).battleStatus;
  assert.equal(klassa(s), 'slut', 'tillståndet vann över transitionen — matchen stängs aldrig');
});

// ---- 3. inget annat får öppna eller stänga -----------------------------------------------------------

test('inbjudan, avslag och avbrytning öppnar ingen session', () => {
  // LinkMicBattleBattleAction: INVITE=1, REJECT=2, CANCEL=3. Ingen av dem ar en match som borjar.
  for (const a of [1, 2, 3]) {
    const s = N.battleFields(battle({ action: a, battleSettings: {} })).battleStatus;
    assert.equal(klassa(s), 'okänd', `action ${a} gav "${s}" (${klassa(s)})`);
  }
});

test('CUT_SHORT (6) räknas som slut', () => {
  const s = N.battleFields(battle({ action: 6, battleSettings: {} })).battleStatus;
  assert.equal(klassa(s), 'slut', 'en avbruten match stängde ingen session');
});

test('tom och trasig payload ger tom status', () => {
  for (const p of [{}, { action: 0 }, { action: 99 }, { battleSettings: {} },
    { action: null, battleSettings: { status: null } }]) {
    assert.equal(N.battleFields(p).battleStatus, '', `${JSON.stringify(p)} gav en status`);
  }
});

// ---- 4. poängen får inte gå sönder ------------------------------------------------------------------

test('poängfälten fungerar som förut', () => {
  const f = N.battleFields({ battleInfo: { hostScore: 1200, guestScore: 900, multiplier: 3 } });
  assert.equal(f.scoreUs, 1200);
  assert.equal(f.scoreThem, 900);
  assert.equal(f.multiplier, 3);
});

test('det gamla battle.status fungerar fortfarande som reserv', () => {
  // Om TikTok nagon gang borjar fylla faltet ska det duga. Reserven kostar ingenting.
  assert.equal(klassa(N.battleFields({ status: 'battle_finished' }).battleStatus), 'slut');
});
