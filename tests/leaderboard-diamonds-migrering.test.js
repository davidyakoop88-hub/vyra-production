'use strict';
// #133 steg 2: topplistan raknar i `diamonds`, inte `coins` — och INGET sparat tal far tappas.
//
// Talet har alltid varit diamanter (bryggans kallfalt heter `diamondCount`); det var namnet som
// ljog. Bytet ar bara ett namnbyte, men tva saker bar det gamla namnet utanfor koden:
//   * dagshinkarna i localStorage (`vyra-leaderboard-daily-v1`) — historiken bakom Idag/Vecka/
//     Manad/Ar, skriven av alla klienter fore steg 2
//   * ogonblicksbilden i sessionStorage (`vyra-leaderboard-stream-v1`) — "Denna stream" over en
//     omladdning mitt i sandningen
// En omdopning utan migrering hade nollat bada TYST: inga fel, bara en topplista som borjar om.
//
// Och avsandaren: en publicerad .exe skickar bara `coins`. Den ska fortsatta raknas.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const KALLA = fs.readFileSync(path.join(__dirname, '..', 'live-leaderboard.js'), 'utf8');
const DAILY_KEY = 'vyra-leaderboard-daily-v1';
const STREAM_KEY = 'vyra-leaderboard-stream-v1';

function lagring(start = {}) {
  const store = { ...start };
  return {
    store,
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: k => { delete store[k] }
  };
}

function ladda({ local = {}, session = {}, sessionId = null } = {}) {
  const listeners = {}, intervals = [];
  const sb = {
    location: { search: '?overlay=1' }, URLSearchParams, console,
    Date, JSON, Object, Array, String, Number, Math, Set, Map, Promise,
    localStorage: lagring(local), sessionStorage: lagring(session),
    document: { querySelector: () => null, querySelectorAll: () => [] },
    fetch: () => Promise.reject(new Error('offline i provet')),
    setInterval: fn => { intervals.push(fn); return intervals.length },
    addEventListener: (n, fn) => (listeners[n] = listeners[n] || []).push(fn),
    dispatchEvent(e) { (listeners[e.type] || []).forEach(fn => fn(e)); return true },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail } }
  };
  sb.window = sb;
  if (sessionId) sb.VyraLiveSession = { runtime: () => ({ aktivSession: () => sessionId }) };
  vm.runInNewContext(KALLA, sb, { filename: 'live-leaderboard.js' });
  return {
    sb,
    live: detail => sb.dispatchEvent(new sb.CustomEvent('vyra-live-event', { detail })),
    skrivNer: () => (listeners.pagehide || []).forEach(fn => fn()),
    top: metric => JSON.parse(JSON.stringify(sb.VyraLeaderboard.getTop(metric, 10)))
  };
}

function idag() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('gammal dagshink med `coins` lyfts over till `diamonds` — talet ar kvar', () => {
  const gammal = { '2026-09-01': { ove: { name: 'Ove', profileImage: '', likes: 3, coins: 1500 } } };
  const lb = ladda({ local: { [DAILY_KEY]: JSON.stringify(gammal) } });
  lb.skrivNer();
  const sparad = JSON.parse(lb.sb.localStorage.getItem(DAILY_KEY));
  const ove = sparad['2026-09-01'].ove;
  assert.equal(ove.diamonds, 1500, 'historiken tappade diamanterna i migreringen');
  assert.equal('coins' in ove, false, 'den gamla nyckeln ligger kvar efter migreringen');
  assert.equal(ove.likes, 3, 'likes rordes av migreringen');
  assert.equal(ove.name, 'Ove');
});

test('en ny gava samma dag laggs PA det migrerade talet, inte bredvid det', () => {
  const gammal = { [idag()]: { ove: { name: 'Ove', profileImage: '', likes: 0, coins: 100 } } };
  const lb = ladda({ local: { [DAILY_KEY]: JSON.stringify(gammal) } });
  lb.live({ type: 'gift', username: 'ove', name: 'Ove', diamonds: 50, coins: 50 });
  lb.skrivNer();
  const ove = JSON.parse(lb.sb.localStorage.getItem(DAILY_KEY))[idag()].ove;
  assert.equal(ove.diamonds, 150);
  assert.equal('coins' in ove, false);
});

test('ogonblicksbilden fran fore omladdningen kommer tillbaka aven med gamla nyckeln', () => {
  const sparad = { sessionId: 's1', totals: { ove: { name: 'Ove', likes: 0, coins: 900, present: true } } };
  const lb = ladda({ session: { [STREAM_KEY]: JSON.stringify(sparad) }, sessionId: 's1' });
  assert.deepEqual(lb.top('diamonds').map(t => [t.name, t.diamonds]), [['Ove', 900]]);
});

test('en aldre .exe som bara skickar `coins` raknas fortfarande', () => {
  const lb = ladda();
  lb.live({ type: 'gift', username: 'gammal', name: 'Gammal', coins: 30 });
  assert.equal(lb.top('diamonds')[0].diamonds, 30);
});

test('bada namnen i samma handelse raknas EN gang', () => {
  const lb = ladda();
  lb.live({ type: 'gift', username: 'ny', name: 'Ny', diamonds: 30, coins: 30 });
  assert.equal(lb.top('diamonds')[0].diamonds, 30, 'talet dubblades');
});

test("getTop('coins') ar samma lista som getTop('diamonds') — sparade widgetar och media.js fragar efter 'coins'", () => {
  const lb = ladda();
  lb.live({ type: 'gift', username: 'a', name: 'A', diamonds: 10 });
  lb.live({ type: 'gift', username: 'b', name: 'B', diamonds: 40 });
  assert.deepEqual(lb.top('coins'), lb.top('diamonds'));
  assert.deepEqual(lb.top('coins').map(t => t.name), ['B', 'A']);
});

test('trasig sparad state kastar inte och tappar inte det som gar att lasa', () => {
  const trasig = { '2026-09-01': { a: null, b: 'x', c: { coins: 'inte-ett-tal' }, d: { coins: 7 } }, '2026-09-02': null };
  const lb = ladda({ local: { [DAILY_KEY]: JSON.stringify(trasig) } });
  lb.skrivNer();
  const sparad = JSON.parse(lb.sb.localStorage.getItem(DAILY_KEY));
  assert.equal(sparad['2026-09-01'].d.diamonds, 7);
  assert.equal(sparad['2026-09-01'].c.diamonds, 0);
});
