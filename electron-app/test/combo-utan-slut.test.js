'use strict';
// EN COMBO VARS SLUT ALDRIG KOM — SKRIVBORDSVÄGEN (2026-11-21). Samma regel som molnbryggan
// (tiktok-bridge/normalizer.js tystaStreaks): en streak som stått tyst i 10 s skickas som `gift` med sin
// senaste frames antal och startens streakId, och en sen frame av samma combo räknas inte en gång till.
// Uppmätt: 2 av 148 combos i fyra sändningar fick aldrig sin slutframe, och de gåvorna räknades aldrig.
const test = require('node:test'), assert = require('node:assert/strict');

function medStubbadConnector(kor) {
  const id = require.resolve('tiktok-live-connector');
  const sparad = require.cache[id];
  const hanterare = new Map();
  class FejkAnslutning {
    constructor() { this.roomId = '7600000000000000001'; }
    on(handelse, fn) { hanterare.set(handelse, fn); }
    async connect() { return { roomId: this.roomId }; }
    async disconnect() {}
  }
  require.cache[id] = { id, filename: id, loaded: true, exports: {
    TikTokLiveConnection: FejkAnslutning,
    WebcastEvent: { CHAT: 'chat', GIFT: 'gift', FOLLOW: 'follow', SHARE: 'share', MEMBER: 'member', SUB_NOTIFY: 'sub',
      LIKE: 'like', EMOTE: 'emote', ENVELOPE: 'envelope', ROOM_USER: 'roomuser', LINK_MIC_BATTLE: 'battle',
      LINK_MIC_ARMIES: 'armies', STREAM_END: 'end' },
    ControlEvent: { CONNECTED: 'connected', DISCONNECTED: 'disconnected', ERROR: 'error', WEBSOCKET_CONNECTED: 'ws' } } };
  const tjanstId = require.resolve('../tiktok-service');
  delete require.cache[tjanstId];
  try { return kor(require('../tiktok-service').createTikTokService, hanterare); }
  finally { if (sparad) require.cache[id] = sparad; else delete require.cache[id]; delete require.cache[tjanstId]; }
}

let n = 0;
const ros = (anv, repeatCount, repeatEnd) => ({ userId: anv, uniqueId: anv, nickname: anv, giftId: 5655, giftName: 'Rose',
  repeatCount, repeatEnd, diamondCount: 1, gift: { type: 1 }, common: { msgId: `m${++n}` } });

async function korning(t, steg) {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 0 });
  const ut = [];
  await medStubbadConnector(async (skapa, hanterare) => {
    const tjanst = skapa({ onStatus() {}, onEvent: e => ut.push(e) });
    await tjanst.connect('provkonto');
    let nu = 0;
    for (const [tid, f] of steg) {
      while (nu < tid) { const d = Math.min(1000, tid - nu); t.mock.timers.tick(d); nu += d; }
      if (f) hanterare.get('gift')(f);
    }
  });
  return ut.filter(e => e.type === 'gift' || e.type === 'streakstart').map(e => [e.type, e.count, e.streakId || '']);
}

test('en enstaka gåva utan slutframe räknas efter tystnaden, en gång, med startens streakId', async t => {
  const ut = await korning(t, [[0, ros('a', 1, 0)], [9000, null], [30000, null]]);
  assert.equal(ut.length, 2);
  assert.deepEqual(ut.map(e => e.slice(0, 2)), [['streakstart', 1], ['gift', 1]]);
  assert.equal(ut[1][2], ut[0][2]);
});

test('en sen slutframe efter avslutet räknas inte igen; en ny combo därefter gör det', async t => {
  const ut = await korning(t, [[0, ros('a', 3, 0)], [12000, null], [14000, ros('a', 3, 1)], [20000, ros('a', 1, 0)], [20500, ros('a', 1, 1)]]);
  assert.deepEqual(ut.map(e => e.slice(0, 2)), [['streakstart', 3], ['gift', 3], ['streakstart', 1], ['gift', 1]]);
});

test('en combo med slutframe i tid räknas som förut, och vakten skickar inget efteråt', async t => {
  const ut = await korning(t, [[0, ros('a', 1, 0)], [800, ros('a', 4, 0)], [2000, ros('a', 4, 1)], [40000, null]]);
  assert.deepEqual(ut.map(e => e.slice(0, 2)), [['streakstart', 1], ['gift', 4]]);
});
