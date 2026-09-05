'use strict';
// SPELAR UPP EN INSPELNING GENOM DEN VERKLIGA BRYGGAN — utan att röra TikTok.
//
// VARFÖR DEN BEHÖVS. Att verifiera en fix i drift har hittills krävt en riktig sändning, och två
// sändningar 2026-09-04 mätte i praktiken ingenting: checkouten som körde låg 118 commits efter
// main, så varken Glove Snipe-fördröjningen eller Battle MVP fanns i koden. Det syntes först i
// efterhand, i en fil på 450 rader.
//
// VAD DEN GÖR. Byter ut `tiktok-live-connector` mot en fejk INNAN bridge.js hinner kräva den, och
// matar in de inspelade nyttolasterna i ursprunglig takt. Allt annat är äkta: normalizern,
// sendEvent, boost-timern, MVP-vägen och POST till den lokala servern. Widgetarna ser exakt det de
// hade sett live.
//
// VAD DEN INTE BEVISAR. Att TikTok fortfarande skickar samma form — inspelningen är ett fotografi
// av en kväll. Och inget om OBS självt (punkt 5 och 7 i live-verifieringen kräver OBS).
//
// ANKAR-ID HÄRLEDS UR FILEN. `fetchRoomInfo` finns inte här, och utan ankar-id är Battle MVP tyst
// per konstruktion — det var precis det felet som gjorde att MVP aldrig fyrade. Fejken svarar
// därför med det ankar-id som återkommer i varje battle, eller det du anger med VYRA_UPPSPEL_ANKARE.
//
// Kör via scripts-omslaget:  node tiktok-bridge/spela-upp.js <fil.jsonl> [--fart N]
const Module = require('module');
const fs = require('fs');
const { EventEmitter } = require('events');

const FIL = process.env.VYRA_UPPSPEL_FIL;
const FART = Math.max(0.1, Number(process.env.VYRA_UPPSPEL_FART || 1));
const ANKARE_ARG = String(process.env.VYRA_UPPSPEL_ANKARE || '').trim();

if (!FIL) { console.error('VYRA_UPPSPEL_FIL saknas'); process.exit(2) }

// Namnen bryggan prenumererar pa. Vardena spelar ingen roll — de ar bara nycklar i fejken.
const WebcastEvent = {
  CHAT: 'u-chat', GIFT: 'u-gift', LIKE: 'u-like', FOLLOW: 'u-follow', SHARE: 'u-share',
  MEMBER: 'u-member', SUB_NOTIFY: 'u-sub', ROOM_USER: 'u-roomuser', STREAM_END: 'u-streamend',
  CONTROL_MESSAGE: 'u-ctrl', LINK_MIC_BATTLE: 'u-lmb', LINK_MIC_BATTLE_TASK: 'u-lmbt',
  LINK_MIC_ARMIES: 'u-lma', LINK_MIC_BATTLE_PUNISH_FINISH: 'u-lmbpf',
  BARRAGE: 'u-barrage', EMOTE: 'u-emote',
};
const ControlEvent = { DISCONNECTED: 'u-disconnected', ERROR: 'u-error' };

// INSPELAREN SKRIVER BRYGGANS UTGAENDE NAMN for allt som vidarebefordras — `glove`, inte
// LINK_MIC_BATTLE_TASK. Kartan vander tillbaka. Den ar hamtad ur bridge.js egna lyssnare; andras
// de utan att kartan foljer med tystnar just den handelsen i uppspelningen.
const FRAN_UTGAENDE = {
  chat: 'CHAT', gift: 'GIFT', likes: 'LIKE', follow: 'FOLLOW', share: 'SHARE',
  member: 'MEMBER', subscribe: 'SUB_NOTIFY', viewer: 'ROOM_USER',
  battle: 'LINK_MIC_BATTLE', glove: 'LINK_MIC_BATTLE_TASK', battle_mvp: 'LINK_MIC_ARMIES',
  guardian: 'BARRAGE', subscriberemote: 'EMOTE',
};

function lasRader() {
  const ut = [];
  for (const rad of fs.readFileSync(FIL, 'utf8').split('\n')) {
    if (!rad.trim()) continue;
    let r; try { r = JSON.parse(rad) } catch { continue }
    if (!r || !r.typ || String(r.typ).startsWith('_')) continue;
    const namn = FRAN_UTGAENDE[r.typ] || r.typ;
    if (!WebcastEvent[namn]) continue;              // en typ bryggan inte prenumererar pa
    const nar = Date.parse(r.vid);
    if (!Number.isFinite(nar)) continue;
    ut.push({ nar, handelse: WebcastEvent[namn], namn, nyttolast: r.nyttolast });
  }
  ut.sort((a, b) => a.nar - b.nar);
  return ut;
}

// ANKAR-ID UR FILEN: det id som finns i VARJE battles armelista. Motstandaren byts mellan matcher,
// vart eget gor det inte — sa snittet over alla battle-slut ar entydigt.
function harledAnkare(rader) {
  if (ANKARE_ARG) return ANKARE_ARG;
  let snitt = null;
  for (const r of rader) {
    if (r.namn !== 'LINK_MIC_ARMIES') continue;
    const p = r.nyttolast || {};
    if (Number(p.triggerReason) !== 2) continue;
    const ids = new Set();
    const a = p.armies;
    if (a && typeof a === 'object' && !Array.isArray(a)) {
      for (const k of Object.keys(a)) { ids.add(String(k)); const v = a[k]; if (v && v.anchorIdStr) ids.add(String(v.anchorIdStr)) }
    }
    for (const t of (Array.isArray(p.teamArmies) ? p.teamArmies : [])) {
      for (const u of (Array.isArray(t && t.teamUser) ? t.teamUser : [])) if (u && u.userIdStr) ids.add(String(u.userIdStr));
    }
    if (!ids.size) continue;
    snitt = snitt === null ? ids : new Set([...snitt].filter(x => ids.has(x)));
  }
  if (snitt && snitt.size === 1) return [...snitt][0];
  return '';
}

const RADER = lasRader();
const ANKARE = harledAnkare(RADER);

class TikTokLiveConnection extends EventEmitter {
  constructor() { super(); this.roomId = '760000000000000009' }
  async connect() {
    setImmediate(() => this.emit('u-connected'));
    // Uppspelningen startar forst nar bryggan har hunnit registrera sina lyssnare.
    setTimeout(() => this._spela(), 400);
    return { roomId: this.roomId };
  }
  // Bryggan laser ankar-id harifran. Utan det ar Battle MVP tyst — per konstruktion.
  async fetchRoomInfo() { return { data: { owner: { id_str: ANKARE } } } }
  disconnect() {}
  _spela() {
    if (!RADER.length) { console.log('[uppspelning] inga uppspelbara handelser i filen'); return }
    const t0 = RADER[0].nar;
    const start = Date.now();
    let i = 0;
    const nasta = () => {
      if (i >= RADER.length) {
        console.log(`[uppspelning] klar — ${RADER.length} handelser`);
        // BOOST-TIMERN SKALAS INTE AV --fart. Den ar en riktig setTimeout i bridge.js och
        // raknar i VERKLIGA millisekunder — det ar hela poangen med fixen. Vid hog fart tar
        // uppspelningen darfor slut langt fore handsken tands, och ett verktyg som avslutar
        // dar hade visat motsatsen till vad den ska bevisa.
        if (globalThis.__uppspelBoostar > 0) {
          console.log(`[uppspelning] ${globalThis.__uppspelBoostar} boost-fonster vantar `
            + 'pa sin riktiga fordrojning — processen star kvar tills de tants. Ctrl+C avbryter.');
        }
        return;
      }
      const r = RADER[i++];
      if (r.namn === 'LINK_MIC_BATTLE_TASK' && Number(r.nyttolast && r.nyttolast.taskMessageType) === 0) {
        globalThis.__uppspelBoostar = (globalThis.__uppspelBoostar || 0) + 1;
      }
      this.emit(r.handelse, r.nyttolast);
      if (i >= RADER.length) { setTimeout(nasta, 0); return }
      const bor = (RADER[i].nar - t0) / FART;
      const gatt = Date.now() - start;
      setTimeout(nasta, Math.max(0, bor - gatt));
    };
    nasta();
  }
}

const laddaOriginal = Module._load;
Module._load = function (begart, foralder, ar) {
  if (begart === 'tiktok-live-connector') {
    return { TikTokLiveConnection, WebcastEvent, ControlEvent, signatureProvider: { config: {} } };
  }
  return laddaOriginal.apply(this, arguments);
};

const spann = RADER.length ? Math.round((RADER[RADER.length - 1].nar - RADER[0].nar) / 1000) : 0;
console.log(`[uppspelning] ${RADER.length} handelser, ${spann} s inspelat, fart x${FART}`
  + `  (~${Math.round(spann / FART)} s uppspelning)`);
console.log(`[uppspelning] ankar-id: ${ANKARE || 'KUNDE INTE HARLEDAS — Battle MVP blir tyst'}`);
