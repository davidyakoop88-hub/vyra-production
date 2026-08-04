'use strict';
// A like must be counted by its own increment, never by TikTok's running room-wide total.
//
// Scoped regression test for the production line cherry-picked from f49a006 on the PR #40 branch
// (hotfix/overlay-live-leaderboards). That commit's own suite, tests/overlay-live-leaderboards.test.js,
// was created by bd67e90 and does not exist on this base, so it was deliberately NOT cherry-picked —
// pulling it in would have dragged the rest of PR #40 along with it. This file covers the same
// defect, written against what actually exists here.
//
// The defect: `Number(e.count || e.likes || e.value)`. cloudEvent() fills `value` from
// coins ?? points ?? score, and a like carries no coins — so for a like, `value` IS the room total.
// A viewer who tapped once got credited with every like in the room, once per event.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'live-leaderboard.js'), 'utf8');

// Runs the real file in a sandbox complete enough for record() to work, and hands back a way to
// feed it events and read the tally. The DOM-patching interval is stubbed out — this test is about
// the arithmetic, not the repaint.
function leaderboard() {
  const listeners = {};
  const noop = () => {};
  const el = () => ({
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    dataset: {}, style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    textContent: '', innerHTML: '', children: [], append: noop, remove: noop
  });
  const store = new Map();
  const sandbox = {
    console, JSON, Math, Number, String, Object, Array, Date, Set, Map, Boolean, Error,
    setInterval: () => 0, clearInterval: noop, setTimeout: () => 0, clearTimeout: noop,
    addEventListener: (name, fn) => { (listeners[name] = listeners[name] || []).push(fn) },
    removeEventListener: noop,
    dispatchEvent: event => { (listeners[event.type] || []).forEach(fn => fn(event)); return true },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail } },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    },
    // live-leaderboard.js laser ?overlay ur adressen for att veta om den star i en OBS-kalla.
    // Sandladan ar inte en webblasare, sa bada maste skickas in explicit — utan dem faller
    // filen pa ReferenceError innan en enda like hunnit raknas.
    location: { search: '' },
    URLSearchParams,
    document: { querySelector: () => null, querySelectorAll: () => [], createElement: el, body: el() },
    fetch: () => Promise.reject(new Error('ingen nätverkstrafik i testet'))
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: 'live-leaderboard.js' });
  return {
    like(fields) {
      sandbox.dispatchEvent(new sandbox.CustomEvent('vyra-live-event',
        { detail: { type: 'like', username: 'tittare', name: 'Tittare', ...fields } }));
    },
    likesFor(username = 'tittare') {
      const row = sandbox.window.VyraLeaderboard.getTop('likes', 10)
        .find(r => r.username === username);
      return row ? row.likes : 0;
    }
  };
}

test('en like räknas med sitt eget count, inte med rumstotalen', { timeout: 5000 }, () => {
  const board = leaderboard();
  // The reconstructed production payload: a single tap while the room sits at 2 700 likes.
  board.like({ count: 5, value: 2700 });
  assert.equal(board.likesFor(), 5, 'rumstotalen läckte in i användarens tally');
});

test('value påverkar inte resultatet oavsett hur stort det är', { timeout: 5000 }, () => {
  const low = leaderboard(); low.like({ count: 3, value: 10 });
  const high = leaderboard(); high.like({ count: 3, value: 999999 });
  assert.equal(low.likesFor(), high.likesFor());
  assert.equal(low.likesFor(), 3);
});

test('count 0 stannar på 0 och faller inte igenom till nästa fält', { timeout: 5000 }, () => {
  const board = leaderboard();
  board.like({ count: 0, value: 2700 });
  assert.equal(board.likesFor(), 0,
    'en like med count 0 föll igenom till likes/value — ?? har blivit || igen');
});

test('flera likes summeras till sina inkrement, inte till en löpande total', { timeout: 5000 }, () => {
  const board = leaderboard();
  // A running total climbs with every event; the increments are what must be added.
  board.like({ count: 1, value: 100 });
  board.like({ count: 2, value: 102 });
  board.like({ count: 4, value: 106 });
  assert.equal(board.likesFor(), 7, 'tallyn följer rumstotalen i stället för inkrementen');
});

test('legacyfältet likes läses fortfarande när count saknas', { timeout: 5000 }, () => {
  const board = leaderboard();
  board.like({ likes: 6, value: 2700 });
  assert.equal(board.likesFor(), 6);
});

test('like-grenen refererar inte value alls', { timeout: 5000 }, () => {
  // Lexical guard: the behavioural tests above would also catch a reintroduced fallback, but this
  // names the exact mistake so a future reader knows why the chain stops where it does.
  const at = SOURCE.indexOf("if (type === 'likes'");
  assert.notEqual(at, -1, 'hittade ingen like-gren i record()');
  const branch = SOURCE.slice(at, SOURCE.indexOf("if (type === 'gift'", at));
  assert.match(branch, /Number\(e\.count \?\? e\.likes\)/);
  assert.ok(!/e\.value/.test(branch), 'like-grenen läser value igen — det är rumstotalen');
});
