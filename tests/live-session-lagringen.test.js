'use strict';
// VILKEN LAGRING VALJER DEDUPEN? Det ar hela fixen, och det ar det enda som inte gick att
// prova i tests/live-session-client.test.js — dar injiceras lagringen, sa den filen bevisar att
// KONTRAKTET haller om lagringen delas. Ingenting dar bevisar att modulen VALJER en delad.
//
// VARFOR DET SPELAR ROLL. `sessionStorage` ar per webblasarkontext. I OBS forstors och
// aterskapas en browserkalla vid scenbyte (med "Shutdown source when not visible"), vid omstart
// och vid cache-uppdatering. Varje gang ar listan tom, snapshotet levererar `live:start` for den
// PAGAENDE sandningen, dedupen missar, och signalen tommer `totals` i live-leaderboard.js — som
// driver bade Top Gift och Top Likes.
//
// UPPMATT I PRODUKTION 2026-09-18: bada nollstalldes samtidigt mitt i en sandning. Bandet bar
// ingen ny sandningsstart, for kontrollbesked spelas inte in av bryggan, sa signalen kan bara ha
// kommit fran snapshotet i en ny kontext.
//
// Provet kor i jsdom for att `runtime()` bara finns i webblasargrenen: under Node exporterar
// filen `skapaLiveSession` och ingenting annat, och da ar lagringsvalet ur rackhall.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const KALLA = fs.readFileSync(path.join(ROOT, 'live-session-client.js'), 'utf8');
const NYCKEL = 'vyra-live-session-hanterade';
const SID = '11111111-1111-4111-8111-111111111111';
const startram = { type: 'livesession', event: 'live:start', eventId: 'live:start:' + SID,
  sessionId: SID, startedAt: '2026-09-18T19:14:58.000Z' };

// Bygger ett fonster, tillater att lagringarna byts ut INNAN filen kors, och behandlar en ram.
function kor({ trasigLocal = false, trasigSession = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'https://vyralive.app/', runScripts: 'outside-only' });
  const w = dom.window;
  const spar = { local: [], session: [] };

  const attrapp = (namn, kastar) => ({
    getItem: () => null,
    setItem: (k, v) => { if (kastar) throw new Error(namn + ' blockerad'); spar[namn].push(k); },
    removeItem: () => {},
  });
  Object.defineProperty(w, 'localStorage', { configurable: true, value: attrapp('local', trasigLocal) });
  Object.defineProperty(w, 'sessionStorage', { configurable: true, value: attrapp('session', trasigSession) });

  w.eval(KALLA);
  const rt = w.VyraLiveSession && w.VyraLiveSession.runtime && w.VyraLiveSession.runtime();
  const ut = rt ? rt.behandla(startram) : null;
  dom.window.close();
  return { spar, ut, fannsRuntime: !!rt };
}

test('dedupelistan skrivs till localStorage, inte sessionStorage', () => {
  const { spar, ut, fannsRuntime } = kor();
  assert.equal(fannsRuntime, true, 'runtime() saknas — provet mater ingenting');
  assert.equal(ut.atgard, 'behandlad', 'ramen behandlades inte, sa ingen skrivning kan ha skett');

  assert.ok(spar.local.includes(NYCKEL),
    'dedupelistan hamnade inte i localStorage. Med sessionStorage tappar en aterskapad '
    + 'OBS-kalla listan, snapshotets live:start dedupas inte, och bade Top Gift och Top Likes '
    + 'nollstalls mitt i sandningen.');
  assert.ok(!spar.session.includes(NYCKEL),
    'listan skrevs till sessionStorage — den overlever da inte att kallan aterskapas');
});

test('blockerad localStorage faller tillbaka pa sessionStorage', () => {
  // Privat lage och vissa OBS-inbaddningar HAR objektet och kastar forst vid skrivning.
  // Darfor gor lagringen() ett riktigt skrivprov innan den accepterar en lagring.
  const { spar, ut } = kor({ trasigLocal: true });
  assert.equal(ut.atgard, 'behandlad', 'en blockerad localStorage stoppade hanteringen');
  assert.ok(spar.session.includes(NYCKEL), 'reserven anvandes inte nar localStorage kastade');
});

test('bada lagringarna blockerade: minneslistan tar over utan att krascha', () => {
  // Sista utvagen. En overlay som slutar byta sandning ar en varre regression an en dedupe
  // som bara galler sidans livstid — samma fail-safe-regel som resten av filen lyder under.
  const { spar, ut } = kor({ trasigLocal: true, trasigSession: true });
  assert.equal(ut.atgard, 'behandlad', 'hanteringen foll nar ingen lagring tog emot');
  assert.deepEqual(spar.local, [], 'skrev till en lagring som kastar');
  assert.deepEqual(spar.session, [], 'skrev till en lagring som kastar');
});
