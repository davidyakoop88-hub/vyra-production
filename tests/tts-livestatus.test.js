'use strict';
// TTS: SAGER PANELEN OM DEN FAKTISKT HOR LIVE-CHATTEN?
//
// Davids fraga 2026-08-20: "hur vet man att den ar kopplad till live? det finns ingen knapp som
// sager nu har du kopplat den till live". Han har ratt, och laget var samre an det later:
//
//   · tts-chat.js LYSSNAR pa riktigt — `vyra-live-event` med typerna chat/comment
//   · det enda som syns i panelen ar kryssrutan "Aktiverad"
//   · "Aktiverad" betyder att FUNKTIONEN ar pasla-gen, inte att det kommer in nagon chatt
//   · testknappen bevisar bara att ROSTEN fungerar, inte att live-chatten nar fram
//
// Det enda stallet dar man kunde se om chatt over huvud taget kommer in var den grona knappen i
// SIDHUVUDET — en helt annan del av granssnittet. Att sluta sig till en funktions tillstand fran
// ett element nagon annanstans ar inte ett tillstand, det ar en gissning.
//
// FYRA LAGEN, och det fjarde ar hela poangen:
//
//   avstangd            kryssrutan ar ur          "Avstängd"
//   ingen live          ansluten=false            "Ingen live ansluten"
//   ansluten, tyst      inga chattevent an        "Väntar på chatt"
//   ansluten, hor       minst ett event           "Lyssnar" + antal + senaste namn
//
// Raden far ALDRIG saga "Lyssnar" nar kryssrutan ar ur — da vore den en ny losgn om samma sak.
//
// Provet ar kallnara: det mater att de fyra lagena finns och att namnet skrivs som TEXT, inte som
// markup. Ett tittarnamn kommer utifran.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const kalla = fs.readFileSync(path.join(__dirname, '..', 'tts-chat.js'), 'utf8');

test('panelen har en statusrad med en stabil krok', () => {
  assert.match(kalla, /data-tts-status/,
    'tts-chat.js har ingen [data-tts-status] — panelen sager fortfarande ingenting om den hor '
    + 'live-chatten, och da maste anvandaren gissa utifran sidhuvudet');
});

test('alla fyra lagen finns formulerade', () => {
  for (const [lage, monster] of [
    ['avstängd', /Avstängd/],
    ['ingen live ansluten', /Ingen live ansluten/],
    ['väntar på chatt', /Väntar på chatt/],
    ['lyssnar', /Lyssnar/],
  ]) {
    assert.match(kalla, monster, `laget "${lage}" saknas i statusraden`);
  }
});

test('statusen laser anslutningen ur samma kalla som sidhuvudet', () => {
  // studio-live.js malar `.connection` med klassen `connected` ur vyra-server-status. Att lasa
  // NAGON ANNAN kalla vore att skapa en andra sanning om samma sak — precis det som gjorde att
  // Oversiktens basvy och premiumvy sa emot varandra tidigare samma kvall.
  assert.match(kalla, /\.connection/,
    'statusraden laser inte .connection — anslutningslaget maste komma fran samma element som '
    + 'sidhuvudet redan malar, annars kan de tva sagas emot varandra');
  assert.match(kalla, /vyra-server-status/,
    'statusraden uppdateras inte nar anslutningen andras; den skulle da frysa i det lage den '
    + 'hade nar panelen oppnades');
});

test('rakningen nollstalls vid kontobyte', () => {
  // Foregaende kontos siffror far inte folja med in i nasta session. Samma regel som
  // Kommandocentralens toppgivare och pulslistan.
  const vid = kalla.indexOf('vyra-session-ended');
  assert.notEqual(vid, -1,
    'ingen teardown pa vyra-session-ended — antalet upplasta meddelanden skulle overleva en '
    + 'utloggning och visas for nasta anvandare');
});

test('tittarnamnet skrivs som text, aldrig som markup', () => {
  // Namnet kommer fran TikTok. Byggs raden med innerHTML blir ett namn som ser ut som markup
  // tolkat. Samma regel som toppgivarraden och pulslistan.
  const vid = kalla.indexOf('data-tts-status');
  assert.notEqual(vid, -1, 'statusraden saknas helt');
  // Leta i den funktion som MALAR raden, inte i hela filen: panelen i ovrigt ar en mall-strang.
  const malning = kalla.slice(kalla.indexOf('function malaTtsStatus'));
  assert.notEqual(malning, '', 'hittar ingen malaTtsStatus() — raden byggs nagon annanstans');
  assert.match(malning.slice(0, 1400), /textContent/,
    'statusraden anvander inte textContent; ett tittarnamn far aldrig tolkas som markup');
  assert.doesNotMatch(malning.slice(0, 1400), /innerHTML/,
    'statusraden skriver innerHTML med data som kommer utifran');
});
