'use strict';
// PRELOAD för glove-timingprovet (test/glove-fonster-timing.test.js).
//
// Samma idé som fejk-connector-preload.js: byt ut 'tiktok-live-connector' mot en fejk INNAN
// bridge.js hinner kräva den, så provet kör den VERKLIGA entrypointen och den verkliga
// sendEvent-vägen utan att röra TikTok.
//
// Skillnaden är vad som fyras: ett LINK_MIC_BATTLE_TASK med taskMessageType 0 (START) och ett
// belöningsfönster som öppnar exakt 2000 ms efter meddelandets EGEN tidsstämpel.
//
// TALEN LIGGER I TIKTOKS KLOCKDOMÄN och är med flit hämtade ur den riktiga inspelningen
// (2026-09-02). Det spelar ingen roll att de ligger i det förflutna relativt maskinens klocka —
// det är hela poängen: fördröjningen ska räknas som skillnaden MELLAN dem, aldrig mot Date.now().
// Räknas den mot den lokala klockan blir resultatet ~223 sekunder fel, och provet faller.
const Module = require('module');
const { EventEmitter } = require('events');

const WebcastEvent = {
  CHAT: 'f-chat', GIFT: 'f-gift', LIKE: 'f-like', FOLLOW: 'f-follow', SHARE: 'f-share',
  MEMBER: 'f-member', SUB_NOTIFY: 'f-sub', ROOM_USER: 'f-roomuser', STREAM_END: 'f-streamend',
  CONTROL_MESSAGE: 'f-ctrl', LINK_MIC_BATTLE: 'f-lmb', LINK_MIC_BATTLE_TASK: 'f-lmbt',
  LINK_MIC_ARMIES: 'f-lma', LINK_MIC_BATTLE_PUNISH_FINISH: 'f-lmbpf',
  BARRAGE: 'f-barrage', EMOTE: 'f-emote',
};
const ControlEvent = { DISCONNECTED: 'f-disconnected', ERROR: 'f-error' };

const FEJK_RUM = '760000000000000009';

// Ur den riktiga inspelningen, med fönstret flyttat till +2000 ms för att provet ska gå på sekunder
// i stället för på minuter. Allt annat är ordagrant.
const CREATE_TIME_MS = 1788377980266;
const FONSTER_S = Math.floor((CREATE_TIME_MS + 2000) / 1000);   // 2000 ms senare, i sekunder
const FORDROJNING_MS = FONSTER_S * 1000 - CREATE_TIME_MS;

const TASK = {
  common: { method: 'WebcastLinkmicBattleTaskMessage', createTime: String(CREATE_TIME_MS) },
  taskMessageType: 0,
  battleId: '7681024595775736598',
  start: { config: { rewardConfig: {
    rewardStartTime: '94', duration: '60', rewardMultiple: 2,
    rewardStartTimestamp: String(FONSTER_S) } } },
};

// Skrivs till stdout sa provet vet exakt nar handelsen fyrades och kan mata avstandet darifran.
const EMIT_EFTER_MS = 300;

class TikTokLiveConnection extends EventEmitter {
  connect() {
    setTimeout(() => {
      console.log(`[fejk] task-emit at=${Date.now()} fordrojning=${FORDROJNING_MS}`);
      this.emit(WebcastEvent.LINK_MIC_BATTLE_TASK, TASK);
    }, EMIT_EFTER_MS);
    return Promise.resolve({ roomId: FEJK_RUM });
  }
  disconnect() {}
}

const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'tiktok-live-connector') return { TikTokLiveConnection, WebcastEvent, ControlEvent };
  return origLoad.call(this, request, ...rest);
};

// Maste overleva fordrojningen med god marginal, annars dor processen innan eventet skickas och
// provet blir gront av fel skal.
setTimeout(() => process.exit(0), EMIT_EFTER_MS + FORDROJNING_MS + 2500);

module.exports = { FEJK_RUM, TASK, FORDROJNING_MS };
