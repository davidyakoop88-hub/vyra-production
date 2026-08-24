'use strict';
// PRELOAD för flagga-av-entrypointprovet (test/flagga-av-entry.test.js).
//
// Laddas med `node -r <denna fil> bridge.js <konto>` i en FORKAD process och byter ut
// 'tiktok-live-connector' mot en fejk INNAN bridge.js hinner kräva den — så provet kör den
// verkliga entrypointen (require.main-blocket, riktiga sendEvent-vägen, riktiga miljöläsningen)
// utan att röra TikTok. Fejken ansluter direkt (roomId i FEJK_RUM), fyrar ett FOLLOW-event
// efter 400 ms och låter processen självdö efter 2200 ms — SIGTERM-hanterare kör inte
// tillförlitligt på Windows, så utgången är en timer, inte en signal.
//
// randomUUID räknas globalt och skrivs på exit — flagga av ska ge exakt uuid=0.
const Module = require('module');
const { EventEmitter } = require('events');
const crypto = require('crypto');

let uuids = 0;
const riktigUUID = crypto.randomUUID;
crypto.randomUUID = (...a) => { uuids++; return riktigUUID.call(crypto, ...a); };
process.on('exit', () => console.log(`[fejk] uuid=${uuids}`));

const WebcastEvent = {
  CHAT: 'f-chat', GIFT: 'f-gift', LIKE: 'f-like', FOLLOW: 'f-follow', SHARE: 'f-share',
  MEMBER: 'f-member', SUB_NOTIFY: 'f-sub', ROOM_USER: 'f-roomuser', STREAM_END: 'f-streamend',
  CONTROL_MESSAGE: 'f-ctrl', LINK_MIC_BATTLE: 'f-lmb', LINK_MIC_BATTLE_TASK: 'f-lmbt',
  LINK_MIC_ARMIES: 'f-lma', LINK_MIC_BATTLE_PUNISH_FINISH: 'f-lmbpf',
};
const ControlEvent = { DISCONNECTED: 'f-disconnected', ERROR: 'f-error' };

const FEJK_RUM = '760000000000000009';
const FEJK_FOLLOW = { userId: '42', uniqueId: 'givare', nickname: 'Givaren' };

class TikTokLiveConnection extends EventEmitter {
  connect() {
    setTimeout(() => this.emit(WebcastEvent.FOLLOW, FEJK_FOLLOW), 400);
    return Promise.resolve({ roomId: FEJK_RUM });
  }
  disconnect() {}
}

const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'tiktok-live-connector') return { TikTokLiveConnection, WebcastEvent, ControlEvent };
  return origLoad.call(this, request, ...rest);
};

setTimeout(() => process.exit(0), 2200);

module.exports = { FEJK_RUM, FEJK_FOLLOW };
