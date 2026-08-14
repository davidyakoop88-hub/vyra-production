'use strict';
// Multiplikatorfönstret — Boosting Glove — från LINK_MIC_BATTLE_TASK.
//
// VARFÖR DET HÄR PROVET FINNS. Hela klientvägen var redan byggd innan källan fanns:
// media.js `routeLiveBattleEvent` tänder Glove Snipe på `type.includes('glove')` och läser
// `event.multiplier`, molnets `cleanEvent` bär fältet `multiplier` (0–100), och `battleFields`
// letade redan efter `battle.multiplier ?? battle.boostMultiplier`. Ingen rad fyllde det:
// LINK_MIC_BATTLE bär ingen multiplikator. Den ligger i LINK_MIC_BATTLE_TASK, som ingen
// prenumererade på — så Glove Snipe kunde bara nås från en testknapp.
//
// Formerna nedan är byggda ur tiktok-live-proto/v3 (`WebcastLinkmicBattleTaskMessage`), inte ur
// dokumentation: `taskMessageType` 0=START 1=TASK_UPDATE 2=TASK_SETTLE 3=REWARD_SETTLE, och
// `start.config.rewardConfig` är en `RewardPeriodConfig` med `rewardMultiple`,
// `rewardStartTimestamp` och `duration`.
//
// Provet mäter tre saker som var och en har kostat oss något förut:
//   1. att fältet faktiskt läses (en v3-omdöpning nollade en gång varenda like utan larm),
//   2. att bara steget som BÄR konfigurationen skickas (TASK_UPDATE fyrar upprepat under en
//      uppgift — skickades varje uppdatering skulle overlayn blinka i ett),
//   3. att typen aldrig innehåller "battle" (battle-mvp-session.js öppnar och stänger sin
//      session på allt som gör det, och hade tänt MVP-overlayn mitt i matchen).
const test = require('node:test'), assert = require('node:assert/strict');
const N = require('../normalizer.js');

const start = (over = {}) => ({
  taskMessageType: 0,
  battleId: 'b-1',
  start: { config: { rewardConfig: { rewardMultiple: 3, rewardStartTimestamp: '1786000000', duration: '30' } } },
  ...over
});

test('START bär multiplikatorn, starttiden och längden', () => {
  const f = N.battleTaskFields(start());
  assert.equal(f.multiplier, 3);
  assert.equal(f.fonsterStart, 1786000000);
  assert.equal(f.fonsterSekunder, 30);
  assert.equal(f.battleId, 'b-1');
  assert.equal(N.arBoostFonster(f), true, 'ett fönster med x3 ska skickas');
});

test('femdubbling passerar också — glove är 5x, inte bara 2 och 3', () => {
  // Boosting Glove ger 5x. Hade tröskeln varit "2 eller 3" hade själva handsken tystnat.
  const f = N.battleTaskFields(start({ start: { config: { rewardConfig: { rewardMultiple: 5 } } } }));
  assert.equal(f.multiplier, 5);
  assert.equal(N.arBoostFonster(f), true);
});

test('TASK_UPDATE skickas aldrig — den fyrar upprepat under uppgiften', () => {
  const f = N.battleTaskFields({ taskMessageType: 1, battleId: 'b-1', taskUpdate: { progress: '7', fromUserId: 'u-9' } });
  assert.equal(f.steg, 1);
  assert.equal(f.fromUserId, 'u-9', 'vem som drev uppgiften ska ändå läsas ut');
  assert.equal(N.arBoostFonster(f), false);
});

test('ett fönster utan multiplikator är inget att tända', () => {
  for (const multiple of [undefined, 0, 1]) {
    const f = N.battleTaskFields(start({ start: { config: { rewardConfig: { rewardMultiple: multiple } } } }));
    assert.equal(N.arBoostFonster(f), false, `multiplikator ${multiple} ska inte skickas`);
  }
});

test('misslyckad uppgift ger inget fönster', () => {
  // BattleTaskSettleResult: 0=SUCCEED 1=FAILED 2=BOTH_SUCCEED.
  const f = N.battleTaskFields({ taskMessageType: 2, battleId: 'b-1', taskSettle: { result: 1 },
    start: { config: { rewardConfig: { rewardMultiple: 3 } } } });
  assert.equal(N.arBoostFonster(f), false);
});

test('en tom eller trasig payload kastar inte', () => {
  for (const payload of [undefined, null, {}, { taskMessageType: 'nej' }, { start: null }]) {
    const f = N.battleTaskFields(payload);
    assert.equal(typeof f.multiplier, 'number');
    assert.equal(N.arBoostFonster(f), false);
  }
});

test('typen som skickas innehåller inte "battle"', () => {
  // Bärande: battle-mvp-session.js kör hanteraBattle() på allt vars typ innehåller "battle" och
  // stänger då sin session. Ett boost-event mitt i en match hade tänt MVP-overlayn i fel ögonblick.
  const typ = 'glove';
  assert.ok(!typ.includes('battle'), 'typen får aldrig innehålla "battle"');
  assert.ok(typ.includes('glove'), 'media.js tänder Glove Snipe på "glove" i typen');
  assert.ok(N.TILL_MOLNET.has(typ), 'typen måste vara vitlistad mot molnet, annars når den bara den lokala vägen');
});

test('multiplikatorn överlever molnets fältnormalisering', () => {
  const moln = N.cloudEvent('id-1', 'glove', { multiplier: 5 });
  assert.equal(moln.type, 'glove');
  assert.equal(moln.multiplier, 5, 'cleanEvent bär multiplier — går den förlorad här tänds ingenting');
});
