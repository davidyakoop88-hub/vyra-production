'use strict';
// Boosting Glove-korten — WebcastLinkMicBattleItemCard.
//
// UPPMÄTT 2026-10-09 i TikTok LIVE Studios egen logg under Davids sändning: 96 kort mot 57
// boost-fönster, och inte ett enda kort nådde overlayen. Tittarna skickar handsken som ett KORT
// (`useCriticalStrikeCard`), bryggan lyssnade bara på LINK_MIC_BATTLE_TASK, och biblioteket
// (2.4.0) hade inte kortet i sitt proto. Formerna nedan är kopierade ur den loggen — strängar,
// inte tal, för int64-fälten.
//
// Provet vaktar fyra saker:
//   1. att kortets multiplikator, längd och effekttid läses ur strängarna,
//   2. att ett kort till MOTSTÅNDAREN inte tänder vår overlay (Tjaotts kort gick till Bertil),
//   3. att AWARD_CARD_NOTICE ("Contributors got match power-ups") aldrig blir ett glove-event,
//   4. att väntan till effektens start räknas i TikToks klocka, som boost-fönstret.
const test = require('node:test'), assert = require('node:assert/strict');
const N = require('../normalizer.js');

const MITT = '7276185677820527649', MOTSTANDARE = '7210894820158882821';
const kort = (over = {}, info = {}) => ({
  common: { method: 'WebcastLinkMicBattleItemCard', msgId: '7694768422060395287', createTime: '1791577889891' },
  battleId: '7694767787897637654',
  msgType: 2,
  useCriticalStrikeCard: {
    cardInfo: {
      cardNameKey: 'pm_mt_boost_crit_name', sendTimeSec: '1791577889',
      sendUser: { user: { userId: '6931349929172698118', nickName: 'Tjaott', displayId: 'tjaoott' } },
      effectLastDuration: '30', criticalStrikeRateLow: '20', criticalStrikeRateHigh: '30', multiple: '5',
      effectTimeSec: '1791577892', toAnchorId: MITT, toAnchorIdStr: MITT, ...info
    },
    anchorId: MITT
  },
  ...over
});

test('kortet bär x5, 30 s och effekttiden — ur strängar', () => {
  const k = N.battleKortFields(kort());
  assert.equal(k.sort, 'crit');
  assert.equal(k.multiplier, 5, 'Boosting Glove är 5x');
  assert.equal(k.effektSekunder, 30);
  assert.equal(k.effektStart, 1791577892);
  assert.equal(k.anchorId, MITT);
  assert.equal(k.sandareId, '6931349929172698118');
  assert.equal(k.battleId, '7694767787897637654');
  assert.equal(k.skickatAt, 1791577889891);
  assert.equal(N.arGloveKort(k, MITT), true);
});

test('ett kort till motståndaren tänder inte vår overlay', () => {
  const k = N.battleKortFields(kort({ useCriticalStrikeCard: { ...kort().useCriticalStrikeCard, anchorId: MOTSTANDARE } }, { toAnchorId: MOTSTANDARE, toAnchorIdStr: MOTSTANDARE }));
  assert.equal(k.anchorId, MOTSTANDARE);
  assert.equal(N.arGloveKort(k, MITT), false, 'Tjaotts handske gick till Bertil, inte till David');
  // Utan eget ankar-id släpps kortet igenom: hellre en handske för mycket än en battle utan.
  assert.equal(N.arGloveKort(k, ''), true);
});

test('AWARD_CARD_NOTICE och andra kort utan multiplikator blir aldrig glove', () => {
  const notis = N.battleKortFields({ common: { createTime: '1791579635523' }, battleId: 'b', msgType: 4,
    awardCardNotice: { displayContent: { defaultPattern: 'Contributors got match power-ups.' }, awardedUsers: [] } });
  assert.equal(notis.sort, '');
  assert.equal(N.arGloveKort(notis, MITT), false);
  for (const msgType of [0, 1, 3, 5, 6, 7, 8, 9, 10, 11]) {
    assert.equal(N.arGloveKort(N.battleKortFields(kort({ msgType })), MITT), false, `msgType ${msgType}`);
  }
  assert.equal(N.arGloveKort(N.battleKortFields(kort({}, { multiple: '1' })), MITT), false, 'x1 är inget att tända');
  assert.equal(N.arGloveKort(N.battleKortFields(null), MITT), false);
});

test('Vault Glove-kortet (msgType 12) räknas som samma handske', () => {
  const k = N.battleKortFields({ common: { createTime: '1791577889891' }, battleId: 'b', msgType: 12,
    useVaultGloveCard: { cardInfo: { common: { effectTimeSec: '1791577900', effectLastDuration: '30' }, multiple: '3' }, anchorId: MITT } });
  assert.equal(k.sort, 'vault');
  assert.equal(k.multiplier, 3);
  assert.equal(k.effektSekunder, 30);
  assert.equal(k.effektStart, 1791577900);
  assert.equal(N.arGloveKort(k, MITT), true);
});

test('väntan till effekten räknas i TikToks klocka, med tak', () => {
  // Uppmätt: skickat 1791577889891 ms, effekt 1791577892 s → 2109 ms.
  assert.equal(N.kortFordrojningMs(N.battleKortFields(kort())), 2109);
  // Ett kort i kö bakom ett annat: effekten 31 s efter sändningen.
  assert.equal(N.kortFordrojningMs(N.battleKortFields(kort({}, { effectTimeSec: '1791577922' }))), 32109);
  // Redan passerad eller saknad effekttid: skickas nu.
  assert.equal(N.kortFordrojningMs(N.battleKortFields(kort({}, { effectTimeSec: '1791577000' }))), 0);
  assert.equal(N.kortFordrojningMs(N.battleKortFields(kort({}, { effectTimeSec: undefined }))), 0);
  assert.equal(N.kortFordrojningMs(null), 0);
});

test('typen är glove — aldrig något med "battle" i', () => {
  // battle-mvp-session.js stänger sin session på allt vars typ innehåller "battle".
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'bridge.js'), 'utf8');
  const start = src.indexOf('LINK_MIC_BATTLE_ITEM_CARD'), block = src.slice(start, src.indexOf('---- battle-sond', start));
  assert.ok(block.includes("sendEvent('glove', kortFalt, data)"), 'kortet ska skickas som glove');
  assert.ok(!/sendEvent\('battle/.test(block), 'kortet får inte skickas som battle');
});
