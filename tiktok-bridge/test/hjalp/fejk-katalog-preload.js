'use strict';
// PRELOAD för det RIKTIGA kopplingsprovet av gåvokatalogobservationen
// (test/gavokatalog-koppling.test.js).
//
// Samma idé som fejk-connector-preload.js: byt ut 'tiktok-live-connector' INNAN bridge.js hinner
// kräva den, så provet kör den verkliga entrypointen — require.main-blocket, riktiga
// connect().then-vägen, riktiga livscykeln — utan att röra TikTok.
//
// Skillnaden mot den preloaden: den här fejken har `fetchAvailableGifts()`, vars beteende väljs av
// PROV_KATALOG_LAGE. Det är en PROVFIXTUR, inte en produktinställning: bridge.js läser den aldrig.
//   kast    — kastar med status 403
//   hanger  — svarar aldrig (tvingar observatorns timeout)
//   ok      — returnerar en liten katalog
//
// Fejken registrerar också konstruktorns optionsnycklar, så provet kan bevisa att bryggan aldrig
// skickar signApiKey eller någon annan signeringsnyckel till anslutningen. Endast NYCKELNAMN
// skrivs ut — aldrig värden.
const Module = require('module');
const { EventEmitter } = require('events');

const LAGE = String(process.env.PROV_KATALOG_LAGE || 'kast');
const LIVSTID = Number(process.env.PROV_LIVSTID_MS || 2600);
// > 0 = fejken kopplar fran EN gang efter forsta anslutningen, sa bryggans riktiga
// scheduleReconnect-vag kors. Backoffen ar 1000 ms +-20 % jitter for forsta forsoket.
const FRANKOPPLA_EFTER = Number(process.env.PROV_FRANKOPPLA_MS || 0);

const WebcastEvent = {
  CHAT: 'f-chat', GIFT: 'f-gift', LIKE: 'f-like', FOLLOW: 'f-follow', SHARE: 'f-share',
  MEMBER: 'f-member', SUB_NOTIFY: 'f-sub', ROOM_USER: 'f-roomuser', STREAM_END: 'f-streamend',
  CONTROL_MESSAGE: 'f-ctrl', LINK_MIC_BATTLE: 'f-lmb', LINK_MIC_BATTLE_TASK: 'f-lmbt',
  LINK_MIC_ARMIES: 'f-lma', LINK_MIC_BATTLE_PUNISH_FINISH: 'f-lmbpf',
};
const ControlEvent = { DISCONNECTED: 'f-disconnected', ERROR: 'f-error' };

const FEJK_RUM = '760000000000000009';
const FEJK_FOLLOW = { userId: '42', uniqueId: 'givare', nickname: 'Givaren' };

// Syntetisk katalog. Inga verkliga gåvo-id:n.
const FEJK_KATALOG = { gifts: [{ id: 5487, name: 'Rose' }, { id: 6247, name: 'Heart Me' }] };

let katalogAnrop = 0;
let anslutningar = 0;
let harFrankopplat = false;

class TikTokLiveConnection extends EventEmitter {
  constructor(username, options) {
    super();
    // BARA NYCKELNAMN. Värdena kan bära proxyuppgifter och får aldrig skrivas ut.
    const nycklar = options && typeof options === 'object' ? Object.keys(options).sort() : [];
    console.log(`[fejk] connOptionsKeys=${nycklar.join(',')}`);
  }
  connect() {
    anslutningar++;
    // Varje anslutning fyrar ett follow-event, sa provet kan bevisa att eventflodet lever.
    setTimeout(() => this.emit(WebcastEvent.FOLLOW, FEJK_FOLLOW), 400);
    // ... och EN gang, efter forsta anslutningen, en frankoppling som tvingar bryggan genom sin
    // riktiga scheduleReconnect-vag.
    if (FRANKOPPLA_EFTER > 0 && !harFrankopplat) {
      harFrankopplat = true;
      setTimeout(() => this.emit(ControlEvent.DISCONNECTED), FRANKOPPLA_EFTER);
    }
    return Promise.resolve({ roomId: FEJK_RUM });
  }
  fetchAvailableGifts() {
    katalogAnrop++;
    if (LAGE === 'hanger') return new Promise(() => {});
    if (LAGE === 'ok') return Promise.resolve(FEJK_KATALOG);
    const fel = new Error('katalogen nekades');
    fel.status = 403;
    return Promise.reject(fel);
  }
  disconnect() {}
}

process.on('exit', () => {
  console.log(`[fejk] katalogAnrop=${katalogAnrop}`);
  console.log(`[fejk] anslutningar=${anslutningar}`);
});

const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'tiktok-live-connector') return { TikTokLiveConnection, WebcastEvent, ControlEvent };
  return origLoad.call(this, request, ...rest);
};

// Utgången är en TIMER, inte SIGTERM — signalhanterare kör inte tillförlitligt på Windows.
setTimeout(() => process.exit(0), LIVSTID);

module.exports = { FEJK_RUM, FEJK_KATALOG };
