'use strict';
// SANDNINGENS RAKNARE OVERLEVER INTE EN SIDLADDNING (uppmatt i livetestet 2026-09-21).
//
// Tva raknare bar "den har sandningen" i klienten, och bada lag i vanliga variabler:
//
//   live-leaderboard.js `totals`      -> Top Likes / Top Coins / Top Points, periodvalet "Denna
//                                        stream". En omladdning tomde listan; tillbaka kom bara
//                                        serverns rullande buffert (max 250 handelser).
//   gift-event-images.js `records`    -> hogvattenmarkena Top Gift och Top Streak jamfor mot. En
//                                        omladdning satte bada till 0, sa NASTA gava — en enkrona —
//                                        rakades som nytt rekord och skrev over den gava som ledde.
//
// Regeln bada skulle folja stod redan i koden: raknarna nollstalls nar SANDNINGEN borjar om, inte
// nar sidan gor det. Den hall bara for live:start-handelsen, aldrig for laddningen.
//
// KLART NAR: en mutation som tar bort aterstallningen (eller som aterstaller utan att jamfora
// sessionId) faller. Darfor mater proven bade att ratt sessions siffror kommer tillbaka OCH att en
// annan sessions siffror inte gor det — en aterstallning utan nyckelkontroll hade annars varit gron.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const las = fil => fs.readFileSync(path.join(ROOT, fil), 'utf8');
const SANITIZE = las('overlay-sanitize.js');
const LEADERBOARD = las('live-leaderboard.js');
const GIFTBILDER = las('gift-event-images.js');

const SESSION_A = '11111111-1111-4111-8111-111111111111';
const SESSION_B = '22222222-2222-4222-8222-222222222222';

// EN lagring, manga fonster. Det ar hela poangen med proven: "en omladdning" ar ett nytt fonster
// som moter samma sessionStorage, precis som en F5 i samma flik. jsdom ger varje fonster sin egen
// lagring, sa den skickas in utifran i stallet.
function lagring(initial = {}) {
  const m = Object.assign(Object.create(null), initial);
  return {
    getItem: k => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v) },
    removeItem: k => { delete m[k] },
    _rad: m
  };
}

// Ett overlay-fonster med de globaler filerna laser vid laddning. `fetch` saknas i jsdom och
// anropas pa toppniva i live-leaderboard.js — utan attrapp dor IIFE:n innan lyssnarna registreras.
function fonster({ storage, aktivSession = null, widgets = [] }) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'https://vyralive.app/studio.html?overlay=1', runScripts: 'outside-only' });
  const w = dom.window;
  w.fetch = () => Promise.reject(new Error('ingen server i provet'));
  Object.defineProperty(w, 'sessionStorage', { value: storage, configurable: true });
  // Sessionsagaren, sa liten som filerna faktiskt anvander den: bara aktivSession().
  w.VyraLiveSession = { runtime: () => ({ aktivSession: () => aktivSession }) };
  w.eval(`var state = ${JSON.stringify({ widgets })};
    var selected = null; var view = 'overlay';
    var wh = () => ''; var props = () => ''; var bind = () => {};
    var liveWidget = id => state.widgets.find(x => x.id === id);`);
  w.eval(SANITIZE);
  return { dom, w };
}

function medLeaderboard(opts) {
  const { dom, w } = fonster(opts);
  w.eval(LEADERBOARD);
  assert.ok(w.VyraLeaderboard, 'live-leaderboard.js laddades inte hela vagen — provet mater ingenting');
  return { dom, w };
}

function medGiftbilder(opts) {
  const { dom, w } = fonster(opts);
  w.eval('window.VYRA_GIFTS = [];');
  w.eval(GIFTBILDER);
  assert.ok(w.VyraGiftRecords, 'gift-event-images.js laddades inte — provet mater ingenting');
  return { dom, w };
}

// Listan kommer fran ett ANNAT jsdom-realm, sa dess Array har en annan prototyp an provets och
// assert.deepEqual skulle falla pa just det — inte pa innehallet. JSON tar over vardena hit.
const topp = (w, metric, falt) => JSON.parse(JSON.stringify(w.VyraLeaderboard.getTop(metric, 5)))
  .map(t => [t.name, t[falt || metric]]);

const gava = (w, detail) => w.dispatchEvent(new w.CustomEvent('vyra-live-event', { detail }));
const sandningsstart = (w, sessionId) => w.dispatchEvent(
  new w.CustomEvent('vyra-live-session', { detail: { event: 'live:start', sessionId } }));
// Tickern skriver ner ogonblicksbilden var femte sekund; provet driver den i stallet for att vanta.
const skrivNer = w => w.dispatchEvent(new w.Event('pagehide'));

// ---- live-leaderboard.js: "Denna stream" ----------------------------------------------------
test('topplistan star kvar efter en omladdning mitt i sandningen', () => {
  const s = lagring();
  const forsta = medLeaderboard({ storage: s, aktivSession: SESSION_A });
  try {
    gava(forsta.w, { type: 'likes', username: 'maya', name: 'Maya', count: 420 });
    gava(forsta.w, { type: 'gift', username: 'ove', name: 'Ove', coins: 1500 });
    skrivNer(forsta.w);
  } finally { forsta.dom.window.close() }

  const efter = medLeaderboard({ storage: s, aktivSession: SESSION_A });
  try {
    assert.deepEqual(topp(efter.w, 'likes'), [['Maya', 420]],
      'likes fran fore omladdningen kom inte tillbaka');
    assert.deepEqual(topp(efter.w, 'coins'), [['Ove', 1500]],
      'coins fran fore omladdningen kom inte tillbaka');
  } finally { efter.dom.window.close() }
});

test('en annan sandnings siffror atertas aldrig', () => {
  const s = lagring();
  const forsta = medLeaderboard({ storage: s, aktivSession: SESSION_A });
  try {
    gava(forsta.w, { type: 'likes', username: 'maya', name: 'Maya', count: 420 });
    skrivNer(forsta.w);
  } finally { forsta.dom.window.close() }

  // Nasta sandning: samma flik, samma lagring, nytt sessionId.
  const efter = medLeaderboard({ storage: s, aktivSession: SESSION_B });
  try {
    assert.deepEqual(topp(efter.w, 'likes'), [],
      'forra sandningens topplista bars in i den nya');
  } finally { efter.dom.window.close() }
});

test('utan pagaende sandning atertas ingenting', () => {
  const s = lagring();
  const forsta = medLeaderboard({ storage: s, aktivSession: SESSION_A });
  try {
    gava(forsta.w, { type: 'likes', username: 'maya', name: 'Maya', count: 420 });
    skrivNer(forsta.w);
  } finally { forsta.dom.window.close() }

  const efter = medLeaderboard({ storage: s, aktivSession: null });
  try {
    assert.deepEqual(topp(efter.w, 'likes'), [],
      'en sida som oppnas utan LIVE ska mota en tom lista');
  } finally { efter.dom.window.close() }
});

test('live:start tommer bade listan och ogonblicksbilden', () => {
  const s = lagring();
  const w1 = medLeaderboard({ storage: s, aktivSession: SESSION_A });
  try {
    gava(w1.w, { type: 'likes', username: 'maya', name: 'Maya', count: 420 });
    skrivNer(w1.w);
    assert.equal(w1.w.VyraLeaderboard.getTop('likes', 5).length, 1, 'forutsattningen brast');
    sandningsstart(w1.w, SESSION_A);
    assert.deepEqual(topp(w1.w, 'likes'), [], 'live:start nollade inte listan');
  } finally { w1.dom.window.close() }

  // Nollningen maste na lagringen DIREKT — ett OBS som river kallan i samma sekund som sandningen
  // borjar skulle annars hitta forra sandningens siffror kvar i ogonblicksbilden.
  const efter = medLeaderboard({ storage: s, aktivSession: SESSION_A });
  try {
    assert.deepEqual(topp(efter.w, 'likes'), [],
      'ogonblicksbilden bar kvar siffror som live:start redan nollat');
  } finally { efter.dom.window.close() }
});

// ---- gift-event-images.js: rekordtroskeln ---------------------------------------------------
test('rekordtroskeln overlever en omladdning, sa en enkrona inte blir nytt rekord', () => {
  const s = lagring();
  const stor = { id: 'tg1', type: 'templateTopGift' };
  const forsta = medGiftbilder({ storage: s, aktivSession: SESSION_A, widgets: [stor] });
  try {
    gava(forsta.w, { type: 'gift', username: 'ove', name: 'Ove', giftName: 'Universe', coins: 30000, count: 1 });
    assert.equal(forsta.w.VyraGiftRecords.giftCoins, 30000, 'forutsattningen brast: rekordet sattes aldrig');
  } finally { forsta.dom.window.close() }

  const efter = medGiftbilder({ storage: s, aktivSession: SESSION_A, widgets: [{ id: 'tg1', type: 'templateTopGift' }] });
  try {
    assert.equal(efter.w.VyraGiftRecords.giftCoins, 30000,
      'troskeln nollstalldes av omladdningen — nasta enkrona blir "nytt rekord"');
    gava(efter.w, { type: 'gift', username: 'nils', name: 'Nils', giftName: 'Rose', coins: 1, count: 1 });
    assert.equal(efter.w.VyraGiftRecords.giftCoins, 30000, 'en enkrona slog ut ett rekord pa 30 000');
    assert.equal(efter.w.state.widgets[0].dataName, undefined,
      'widgeten skrevs om av en gava som inte ar ett rekord');
  } finally { efter.dom.window.close() }
});

test('rekordtroskeln atertas inte fran en annan sandning', () => {
  const s = lagring();
  const forsta = medGiftbilder({ storage: s, aktivSession: SESSION_A });
  try {
    gava(forsta.w, { type: 'gift', username: 'ove', name: 'Ove', coins: 30000, count: 1 });
  } finally { forsta.dom.window.close() }

  const efter = medGiftbilder({ storage: s, aktivSession: SESSION_B });
  try {
    assert.equal(efter.w.VyraGiftRecords.giftCoins, 0,
      'forra sandningens rekord blev den nya sandningens troskel — forsta gavorna raknas aldrig');
  } finally { efter.dom.window.close() }
});

test('live:start nollar rekorden ocksa i lagringen', () => {
  const s = lagring();
  const w1 = medGiftbilder({ storage: s, aktivSession: SESSION_A });
  try {
    gava(w1.w, { type: 'gift', username: 'ove', name: 'Ove', coins: 30000, count: 1 });
    sandningsstart(w1.w, SESSION_A);
    assert.equal(w1.w.VyraGiftRecords.giftCoins, 0, 'live:start nollade inte rekordet');
  } finally { w1.dom.window.close() }

  const efter = medGiftbilder({ storage: s, aktivSession: SESSION_A });
  try {
    assert.equal(efter.w.VyraGiftRecords.giftCoins, 0,
      'ogonblicksbilden bar kvar ett rekord som live:start redan nollat');
  } finally { efter.dom.window.close() }
});

// En lagring som kastar (privat lage, vissa OBS-inbaddningar) far aldrig ta ner nagon av filerna.
test('en lagring som kastar tar inte ner nagon av raknarna', () => {
  const trasig = { getItem() { throw new Error('nej') }, setItem() { throw new Error('nej') },
    removeItem() { throw new Error('nej') } };
  const lb = medLeaderboard({ storage: trasig, aktivSession: SESSION_A });
  try {
    gava(lb.w, { type: 'likes', username: 'maya', name: 'Maya', count: 5 });
    skrivNer(lb.w);
    assert.equal(lb.w.VyraLeaderboard.getTop('likes', 5).length, 1, 'raknaren slutade rakna');
  } finally { lb.dom.window.close() }

  const ge = medGiftbilder({ storage: trasig, aktivSession: SESSION_A });
  try {
    gava(ge.w, { type: 'gift', username: 'ove', name: 'Ove', coins: 900, count: 1 });
    assert.equal(ge.w.VyraGiftRecords.giftCoins, 900, 'rekordgrinden slutade fungera');
  } finally { ge.dom.window.close() }
});
