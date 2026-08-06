'use strict';
// Sond 3: sluta ga blind mitt i en match, och borja rakna det som faktiskt skickas.
//
// TVA HAL UPPMATTA UNDER MATCH 2, 2026-08-06:
//
// HAL 1 — SONDEN TYSTNADE MEDAN MATCHEN PAGICK. Taket pa 40 rader raknas per BRYGGPROCESS, inte per
// match. Match 1 at upp 14 av dem. Match 2 fick 26 och slog i taket pa rad #40, som fortfarande bar
// battleSettings.status=1 — alltsa en pagaende battle. Slutet hamnade efter taket och gick forlorat,
// och vi star kvar pa EN uppmatt slutsignal, fran en AVBRUTEN match.
//
// HAL 2 — INGEN VET HUR MANGA EVENT SOM FAKTISKT SKICKAS. Battle-payloaden visade atta skilda
// gavotillfallen under matchen. Overlayn flippade Top Gift tva ganger. Gapet gar inte att forklara
// med det vi loggar: ARMIES speglar HELA battlen, alltsa aven motstandarens sida, sa atta mot tva
// kan vara helt korrekt — eller sa tappas sex gavor nagonstans mellan bryggan och OBS.
//
// Det gar inte att avgora, for `sendEvent` loggar inte per event. Det ar exakt samma blinda flack
// som gjorde att en hel sandning kunde ga utan ETT enda battle-event utan att loggen kunde saga
// varfor. Den stangs har.
//
// RAKNAREN AR EN RAKNARE, INTE EN EVENTLOGG. Per typ, inget innehall: en rad per minut med
// `gift=8 chat=41` bar ingen anvandardata, medan en rad per event hade burit allt.
//
// ROTT NU: raknarna nollstalls aldrig, och ingenting raknar det som skickas.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const BRYGGAN = fs.readFileSync(path.join(__dirname, '..', 'bridge.js'), 'utf8');
const kropp = (fran, till) => BRYGGAN.slice(BRYGGAN.indexOf(fran), BRYGGAN.indexOf(till));

// ---- hal 1: sonden far inte tystna mitt i en match ----------------------------------------------

test('sonden nollstaller sig nar en ny match borjar', () => {
  // Utan det arver varje ny match forra matchens forbrukning, och den som kor tre battles i rad far
  // ingen sond alls pa den tredje.
  assert.match(BRYGGAN, /battleSondMatch/,
    'inget begrepp om vilken match sonden ar i — taket ar kvar per process');
});

test('nollstallningen hanger pa battleId, inte pa tiden', () => {
  // En tidsbaserad nollstallning gissar. battleId ar det TikTok sjalv byter nar en ny match borjar,
  // och det finns i bade LINK_MIC_BATTLE och LINK_MIC_ARMIES.
  const fn = kropp('function loggaBattleSond', 'function scheduleReconnect');
  assert.match(fn, /battleId/, 'nollstallningen laser inte battleId');
  assert.doesNotMatch(fn, /setInterval|setTimeout/, 'nollstallningen ar tidsstyrd och gissar');
});

test('bada raknarna nollstalls, inte bara den ena', () => {
  // Nollstalls bara antalsraknaren men inte signaturkartan blir forsta raden i nya matchen tyst,
  // eftersom den ser likadan ut som nagon rad i forra matchen.
  const fn = kropp('function loggaBattleSond', 'function scheduleReconnect');
  assert.match(fn, /battleSondRaknare\.clear\(\)/, 'antalsraknaren nollstalls inte');
  assert.match(fn, /battleSondSenaste\.clear\(\)/,
    'signaturkartan nollstalls inte — forsta raden i nya matchen blir tyst');
});

test('samma match nollstaller inte om och om igen', () => {
  // Nollstalls det vid varje handelse ar taket verkningslost och loggen dranks.
  const fn = kropp('function loggaBattleSond', 'function scheduleReconnect');
  assert.match(fn, /battleSondMatch\s*!==|!==\s*battleSondMatch/,
    'nollstallningen jamfor inte mot forra matchen — den sker vid varje handelse');
});

test('taket finns kvar', () => {
  const tak = BRYGGAN.match(/BATTLE_SOND_TAK\s*=\s*(\d+)/);
  assert.ok(tak, 'taket togs bort i stallet for att nollstallas per match');
  assert.ok(Number(tak[1]) >= 20 && Number(tak[1]) <= 80, `taket ar ${tak[1]}`);
  assert.match(BRYGGAN, /if\s*\(\s*n\s*>\s*BATTLE_SOND_TAK\s*\)\s*return/, 'taket jamfors inte');
});

// ---- hal 2: rakna det som skickas ---------------------------------------------------------------

test('bryggan raknar vidarebefordrade event per typ', () => {
  assert.match(BRYGGAN, /flodeRaknare/,
    'ingenting raknar det som skickas — 8 gavor mot 2 flippar gar inte att avgora');
});

test('raknaren sitter i sendEvent', () => {
  // Raknas nagon annanstans raknas det som bryggan SER, inte det som bryggan SKICKAR. Det ar
  // skillnaden som hela fragan handlar om.
  const fn = kropp('function sendEvent', 'function startHeartbeat');
  assert.match(fn, /flodeRaknare/, 'raknaren sitter utanfor sendEvent');
});

test('dubbletter raknas for sig', () => {
  // sendEvent slapper tyst en dubblett inom 120 s. Raknas de i samma hink gar det inte att se om
  // gavor tappas i dedupen eller aldrig kom fram.
  const fn = kropp('function sendEvent', 'function startHeartbeat');
  const iDubblett = fn.indexOf('duplicate: true');
  const forsta = fn.indexOf('flodeRaknare');
  assert.ok(forsta > -1 && forsta < iDubblett,
    'dubbletter raknas inte separat fore returen — dedupens andel gar inte att se');
  // Att ordet "duplicate" finns i funktionen bevisar ingenting: `duplicate: true` star dar redan.
  // Kravet ar att NYCKELN skiljer sig at. Mutationsprov: utan det har gick `flodeNyckel = type`
  // rakt igenom gront, och da hamnar tappade gavor i samma hink som levererade.
  assert.match(fn, /const dubblett\s*=\s*recentEventKeys\.has\(key\)/,
    'dedupens utfall fangas aldrig i en variabel att rakna pa');
  assert.match(fn, /dubblett\s*\?[^:]*dubblett/,
    'dubbletter far samma raknarnyckel som levererade event');
});

test('raknaren far inte andra vad som skickas', () => {
  // En sond som paverkar flodet ar inte en sond. Dedupen, bada jobben och returvardet star kvar.
  const fn = kropp('function sendEvent', 'function startHeartbeat');
  assert.match(fn, /if \(recentEventKeys\.has\(key\)\) return/, 'dedupen andrades');
  assert.match(fn, /return Promise\.all\(jobs\)/, 'returvardet andrades');
  assert.match(fn, /postJson\('\/api\/events', local\)/, 'den lokala vagen andrades');
  assert.match(fn, /api\/events\/tiktok/, 'molnvagen andrades');
});

test('sammanfattningen loggas periodiskt, inte per event', () => {
  // En rad per event ar en eventlogg, och den far inte finnas: den skulle bara anvandarnamn,
  // gavonamn och kommentarer rakt in i Railways logg.
  // [\d_]+, inte \d+: koden skriver 60_000 med numerisk separator, och \d+ stannar vid understrecket
  // och laser 60. Da faller testet pa sitt eget monster i stallet for pa koden (uppmatt).
  assert.match(BRYGGAN, /FLODE_INTERVALL_MS\s*=\s*[\d_]+/, 'inget intervall for sammanfattningen');
  const ms = Number(BRYGGAN.match(/FLODE_INTERVALL_MS\s*=\s*([\d_]+)/)[1].replace(/_/g, ''));
  assert.ok(ms >= 30_000, `intervallet ar ${ms} ms — for tatt for att vara en sammanfattning`);
});

test('sammanfattningen loggas bara nar nagot hant', () => {
  // En tom rad varje minut i timmar gor loggen svarlast och doljer det som betyder nagot.
  // Att variabeln FINNS racker inte — den star kvar i tilldelningen aven om jamforelsen tas bort.
  // Ocksa detta upptackt genom mutationsprov.
  assert.match(BRYGGAN, /if\s*\(\s*rad === flodeSenaste\s*\)\s*return/,
    'sammanfattningen jamfors inte mot forra raden — tom logg varje minut i timmar');
});

test('sammanfattningen bar inga anvandardata', () => {
  // Bara typnamn och tal far na loggen.
  const rad = BRYGGAN.split('\n').find(l => /bridge\]\[flode\]/.test(l)) || '';
  assert.ok(rad, 'sammanfattningen hittades inte');
  for (const falt of ['username', 'nickname', 'comment', 'giftName', 'profile', 'avatar', 'userId']) {
    assert.doesNotMatch(rad, new RegExp(falt, 'i'), `sammanfattningen loggar ${falt}`);
  }
});

test('flodesraknaren skickar ingenting', () => {
  const block = kropp('flodeRaknare', 'function eventKey');
  assert.doesNotMatch(block, /sendEvent\(/, 'raknaren skickar event');
});
