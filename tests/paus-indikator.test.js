'use strict';
// SANDNINGEN PAUSAD — VYRA ska veta det, inte gissa.
//
// Davids fraga 2026-08-21: "vad hander nar man ar pa paus eller internet kopplingen gar bort, man
// vill helst inte borja om". Natdelen var redan lost (bryggan ateransluter, SSE spelar upp missade
// handelser via Last-Event-ID, ~10 000 i behall, och vyra-session-ended fyrar bara vid utloggning
// sa inga raknare nollstalls). PAUSDELEN fanns inte alls.
//
// JAG HADE FEL FORST och det ar vart att skriva ner: jag sa till David att "LivePause finns i
// protokollet, vi lyssnar bara inte", utifran att Python-biblioteket TikTokLive dokumenterar
// LivePauseEvent. VART bibliotek — tiktok-live-connector v2 — har 68 handelser och INGEN av dem
// heter nagot med paus. Pausen kommer in som CONTROL_MESSAGE med ett action-falt.
//
// KODERNA AR INTE GISSADE. De star i tiktok-live-proto/v3, som biblioteket sjalvt bygger pa:
//
//   0  CONTROL_ACTION_FALLBACK_UNKNOWN
//   1  CONTROL_ACTION_STREAM_PAUSED
//   2  CONTROL_ACTION_STREAM_UNPAUSED
//   3  CONTROL_ACTION_STREAM_ENDED
//   4  CONTROL_ACTION_STREAM_SUSPENDED
//
// DET VIKTIGASTE PROVET AR ATT PAUS INTE FAR SATTA connected:false. En paus ar inte ett avbrott —
// anslutningen star kvar och hjartslaget fortsatter var 5:e sekund. Satter vi connected:false
// startar ateranslutningslogiken, sidhuvudet sager "Anslut TikTok" och anvandaren tror att nagot
// gatt sonder mitt i sandningen. Det vore att skapa felet vi forsoker beskriva.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rot = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(rot, f), 'utf8');

const BRYGGOR = ['tiktok-bridge/bridge.js', 'electron-app/tiktok-service.js'];

test('bada bryggorna prenumererar pa CONTROL_MESSAGE', () => {
  // Bada vagarna maste kunna se pausen. Desktopvagen gar utan molnet, molnvagen utan appen — en
  // funktion som bara finns i den ena ar en funktion anvandaren inte kan lita pa.
  for (const fil of BRYGGOR) {
    assert.match(las(fil), /CONTROL_MESSAGE/,
      `${fil} lyssnar inte pa CONTROL_MESSAGE — pausen kommer in dar, och vart bibliotek har ingen `
      + 'egen pauhandelse (68 typer, ingen heter nagot med pause)');
  }
});

test('action-koderna kommer fran protot, inte ur luften', () => {
  for (const fil of BRYGGOR) {
    const kalla = las(fil);
    assert.match(kalla, /STREAM_PAUSED|=== *1\b|PAUSAD/i,
      `${fil} hanterar inte action 1 (pausad)`);
    assert.match(kalla, /STREAM_UNPAUSED|=== *2\b|ATERUPPTAGEN|återupptagen/i,
      `${fil} hanterar inte action 2 (aterupptagen) — utan den fastnar laget i "pausad"`);
  }
});

test('en paus far ALDRIG sattas som frankopplad', () => {
  // Det har ar hela poangen. Provet laser blocket runt pauhanteringen och kraver att det inte
  // slar av anslutningen dar.
  // Mat SJALVA HANTERAREN, inte ett tecken-fonster. Forsta versionen tog 700 tecken fran ordet
  // "pausad" i en kommentar och rackte da in i STREAM_END och DISCONNECTED — dar connected:false
  // ar helt riktigt. Provet fallde alltso pa korrekt kod, vilket ar samre an att inte prova alls.
  for (const fil of BRYGGOR) {
    const kalla = las(fil);
    const start = kalla.indexOf('CONTROL_MESSAGE');
    assert.notEqual(start, -1, `${fil} har ingen pauhantering att mata`);
    const slut = kalla.indexOf('\n    });', start);
    assert.notEqual(slut, -1, `${fil}: hittar inte slutet pa CONTROL_MESSAGE-hanteraren`);
    // KOMMENTARERNA MASTE BORT. Blocket forklarar i klartext VARFOR connected:false vore fel —
    // och en ren textsokning kan inte skilja en regel fran ett resonemang om en regel. Det ar
    // tredje gangen samma falla slar till pa ett dygn (vaktprovet for #view och en curl-kontroll
    // av produktionen gick i den forst). Stryp kommentarer fore varje kallnar matning.
    const block = kalla.slice(start, slut)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.match(block, /action/, `${fil}: hanteraren laser inget action-falt`);
    assert.doesNotMatch(block, /connected: *false/,
      `${fil} satter connected:false i pauhanteringen. En paus ar inte ett avbrott — `
      + 'anslutningen star kvar och hjartslaget fortsatter. Med connected:false startar '
      + 'ateranslutningen och sidhuvudet sager "Anslut TikTok" mitt i en pagaende sandning.');
  }
});

test('sidhuvudet har en text for pausat lage', () => {
  // studio-live.js malar .connection ur vyra-server-status. Utan en egen gren dar ser en paus ut
  // precis som "ansluten och tyst".
  const kalla = las('studio-live.js');
  assert.match(kalla, /paus/i,
    'studio-live.js har ingen pausgren — sidhuvudet kan da inte skilja en paus fran en tyst stund');
});

test('TTS-raden sager paus i stallet for att lova upplasning', () => {
  // "Väntar på chatt" ar fel besked under en paus: det kommer ingen chatt, och det ar inte ett fel.
  const kalla = las('tts-chat.js');
  assert.match(kalla, /paus/i,
    'tts-chat.js sager fortfarande "Väntar på chatt" under en paus — ett lofte den inte kan halla');
});

test('inspelningen far med CONTROL_MESSAGE', () => {
  // Nasta sandning ar redan planerad med VYRA_INSPELNING_TYPER=alla (lanseringslistan punkt 2).
  // Da ska kontrollmeddelandena finnas i materialet, sa att action-koderna kan verifieras mot
  // verkligheten i stallet for mot ett typdokument.
  const kalla = las('tiktok-bridge/bridge.js');
  const vid = kalla.indexOf('CONTROL_MESSAGE');
  assert.notEqual(vid, -1, 'CONTROL_MESSAGE saknas helt i bryggan');
});
