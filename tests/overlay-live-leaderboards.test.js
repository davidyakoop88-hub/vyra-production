'use strict';
// Regression tests for the three overlay bugs that put invented numbers in front of a live
// audience. All three were observed in production on 2026-08-03 while @piiikabom was broadcasting:
// the overlay showed "Alex 98.7K / Mia 82.4K / Leo 71.1K" — shipped demo people — while TikTok's
// own counter read 2.7K real likes, and DevTools filled with 401s from state-backup.js.
//
// These files are browser IIFEs with no module boundary, so each test loads the real source into a
// fresh vm sandbox with a hand-built DOM. No jsdom, no new dependency: the sandbox implements only
// what these three files actually touch, which keeps it obvious what is being simulated and makes
// a test that passes for the wrong reason much harder to write.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

// ---- minimal DOM ---------------------------------------------------------------------------
// Only the surface these files use: querySelector(All), textContent, dataset, style, classList,
// addEventListener/dispatchEvent, and a MutationObserver that fires on explicit notify() calls.
function makeElement(tag, attrs = {}) {
  const el = {
    tagName: tag.toUpperCase(),
    children: [],
    parent: null,
    textContent: attrs.textContent || '',
    dataset: attrs.dataset || {},
    style: {},
    classList: { _set: new Set(attrs.classes || []), add(c) { this._set.add(c) }, remove(c) { this._set.delete(c) }, contains(c) { return this._set.has(c) } },
    _classes: new Set(attrs.classes || []),
    src: '',
    append(...kids) { kids.forEach(k => { k.parent = el; el.children.push(k) }) },
    matches(sel) { return matches(el, sel) },
    querySelector(sel) { return descendants(el).find(d => matches(d, sel)) || null },
    querySelectorAll(sel) { return descendants(el).filter(d => matches(d, sel)) }
  };
  return el;
}

const descendants = el => el.children.flatMap(c => [c, ...descendants(c)]);

// Supports the selector shapes these files use: ".class", "tag", ".a[data-id]", "img:not(.x)".
function matches(el, sel) {
  return sel.split(',').map(s => s.trim()).some(one => {
    const notMatch = /:not\(\.([A-Za-z0-9_-]+)\)/.exec(one);
    if (notMatch && el._classes.has(notMatch[1])) return false;
    const base = one.replace(/:not\([^)]*\)/g, '');
    const attr = /\[data-([A-Za-z0-9-]+)\]/.exec(base);
    if (attr && el.dataset[attr[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] === undefined) return false;
    const head = base.replace(/\[[^\]]*\]/g, '');
    if (!head) return true;
    if (head.startsWith('.')) return el._classes.has(head.slice(1));
    return el.tagName === head.toUpperCase();
  });
}

function makeSandbox({ search = '', state = null } = {}) {
  const body = makeElement('body');
  const documentElement = makeElement('html');
  const listeners = {};
  const observers = [];
  const store = {};
  const fetchCalls = [];

  const document = {
    body, documentElement,
    querySelector: sel => body.querySelector(sel),
    querySelectorAll: sel => body.querySelectorAll(sel),
    createElement: makeElement,
    addEventListener: (n, fn) => (listeners[n] = listeners[n] || []).push(fn),
    head: makeElement('head')
  };

  const sandbox = {
    document,
    location: { search },
    URLSearchParams,
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn) => { fn(); return 0 },          // deterministic: run the drain immediately
    clearTimeout() {}, clearInterval() {},
    Date, JSON, Object, Array, String, Number, Math, Set, Map, Boolean, Error, Promise,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
      removeItem: k => { delete store[k] }
    },
    // Every fetch is recorded so a test can assert the overlay made none at all.
    fetch: (url, opts) => { fetchCalls.push({ url: String(url), method: opts?.method || 'GET' }); return Promise.reject(new Error('offline in test')) },
    MutationObserver: class { constructor(cb) { this.cb = cb; observers.push(this) } observe() { this.on = true } disconnect() { this.on = false } },
    addEventListener: (n, fn, opts) => (listeners[n] = listeners[n] || []).push({ fn, once: !!opts?.once }),
    dispatchEvent(e) {
      (listeners[e.type] || []).slice().forEach(entry => {
        const fn = entry.fn || entry;
        fn(e);
        if (entry.once) listeners[e.type] = listeners[e.type].filter(x => x !== entry);
      });
      return true;
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail } },
    state
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  // Intervals are captured, not run, so tests drive the tick explicitly.
  const intervals = [];
  sandbox.setInterval = fn => { intervals.push(fn); return intervals.length };

  return {
    sandbox, body, fetchCalls, intervals, observers, store,
    run(file) { vm.runInNewContext(read(file), sandbox, { filename: file }) },
    // Simulate media.js's render(): rebuild the widget markup from the shipped demo data, then let
    // the MutationObserver see it — exactly what happens on every repaint in the real page.
    render(widgetEl, rowsData) {
      widgetEl.children.length = 0;
      rowsData.forEach(d => {
        const row = makeElement('div', { classes: ['toplike-row'] });
        const strong = makeElement('strong', { textContent: d.name });
        const em = makeElement('em', { textContent: '♥ ' + d.value });
        const small = makeElement('small', { textContent: '@' + d.name.toLowerCase() });
        row.append(strong, em, small);
        widgetEl.append(row);
      });
      // A real MutationObserver always hands its callback a record list; pass one, or a listener
      // that reads record.addedNodes would only ever be exercised against a stub that cannot fail.
      observers.forEach(o => o.on && o.cb([{ type: 'childList', target: widgetEl,
        addedNodes: widgetEl.children.slice(), removedNodes: [] }], o));
    },
    live(detail) { sandbox.dispatchEvent(new sandbox.CustomEvent('vyra-live-event', { detail })) },
    tick() { intervals.forEach(fn => fn()) }
  };
}

function topLikeWidget(env, id = 'w1') {
  const el = makeElement('div', { classes: ['vyra-toplike'], dataset: { id } });
  env.body.append(el);
  return el;
}

const DEMO_ROWS = [{ name: 'Alex', value: '98.7K' }, { name: 'Mia', value: '82.4K' }, { name: 'Leo', value: '71.1K' }];
const rowText = el => el.querySelectorAll('.toplike-row').map(r => ({
  name: r.querySelector('strong').textContent,
  value: r.querySelector('em').textContent
}));

// ---- state-backup.js -------------------------------------------------------------------------
test('state-backup makes no request at all in overlay mode', () => {
  const env = makeSandbox({ search: '?overlay=1' });
  env.sandbox.localStorage.setItem('vyra-state', JSON.stringify({ widgets: [{ id: 'a' }] }));
  env.run('state-backup.js');
  env.tick();
  assert.deepEqual(env.fetchCalls, [], 'overlay-läget får inte röra /api/state alls');
  assert.equal(env.intervals.length, 0, '3-sekunderstimern får inte ens startas i overlay-läge');
});

test('state-backup makes no request when only an access token is present', () => {
  // overlay.html redirects to studio.html?overlay=1&access=…, but a widget-scoped link can arrive
  // with access alone. Both are the overlay, neither has a session cookie.
  const env = makeSandbox({ search: '?access=abc123' });
  env.sandbox.localStorage.setItem('vyra-state', JSON.stringify({ widgets: [{ id: 'a' }] }));
  env.run('state-backup.js');
  env.tick();
  assert.deepEqual(env.fetchCalls, []);
});

test('state-backup still runs in Studio mode', () => {
  // The guard must not disable backup for the streamer who is actually editing a layout.
  const env = makeSandbox({ search: '' });
  env.sandbox.localStorage.setItem('vyra-state', JSON.stringify({ widgets: [{ id: 'a' }] }));
  env.run('state-backup.js');
  assert.ok(env.intervals.length > 0, 'Studio-läget måste fortfarande säkerhetskopiera');
  assert.ok(env.fetchCalls.some(c => c.url.includes('/api/state')), 'Studio ska synka vid start');
});

test('a failing backend cannot produce a version POST every three seconds', () => {
  // lastVersionAt used to advance only on success, so a 401/500 left the five-minute gate open and
  // every tick fired another POST /api/state/version. That is the log flood we saw in production.
  const env = makeSandbox({ search: '' });
  env.sandbox.localStorage.setItem('vyra-state', JSON.stringify({ widgets: [{ id: 'a' }] }));
  env.run('state-backup.js');
  const before = env.fetchCalls.length;
  for (let i = 0; i < 5; i += 1) {
    env.sandbox.localStorage.setItem('vyra-state', JSON.stringify({ widgets: [{ id: 'a', n: i }] }));
    env.tick();
  }
  const versionPosts = env.fetchCalls.slice(before).filter(c => c.url.includes('/api/state/version'));
  assert.ok(versionPosts.length <= 1, `en trasig backend gav ${versionPosts.length} version-POST på fem ticks`);
});

// ---- live-zero-state.js ----------------------------------------------------------------------
test('a viewer event without a username does not stop the zeroing', () => {
  // The exact production sequence: the bridge emits `viewer` seconds after connecting, and 125 of
  // 159 of them carry no username. That event used to disconnect the observer for good.
  const env = makeSandbox({ search: '?overlay=1' });
  const widget = topLikeWidget(env);
  env.render(widget, DEMO_ROWS);
  env.run('live-zero-state.js');
  assert.ok(env.observers.some(o => o.on), 'observern ska vara igång');

  env.live({ type: 'viewer', count: 12 });
  assert.ok(env.observers.some(o => o.on), 'ett viewer-event får inte koppla bort nollställningen');

  env.render(widget, DEMO_ROWS);            // media.js repaints the demo markup
  assert.deepEqual(rowText(widget).map(r => r.name), ['', '', ''],
    'demonamnen kom tillbaka efter render — det är buggen publiken såg');
});

test('zeroing survives any number of events and repaints', () => {
  const env = makeSandbox({ search: '?overlay=1' });
  const widget = topLikeWidget(env);
  env.render(widget, DEMO_ROWS);
  env.run('live-zero-state.js');
  for (let i = 0; i < 5; i += 1) {
    env.live({ type: 'viewer', count: i });
    env.render(widget, DEMO_ROWS);
  }
  assert.deepEqual(rowText(widget).map(r => r.name), ['', '', '']);
});

test('real leaderboard data is never overwritten', () => {
  // The whole reason this file can be left running: it only touches rows still holding a shipped
  // demo name. A row with a real viewer's name must survive untouched.
  const env = makeSandbox({ search: '?overlay=1' });
  const widget = topLikeWidget(env);
  env.run('live-zero-state.js');
  env.render(widget, [{ name: 'Jokero', value: '412' }, { name: 'Alex', value: '98.7K' }]);
  const rows = rowText(widget);
  assert.equal(rows[0].name, 'Jokero', 'riktig data skrevs över');
  assert.equal(rows[0].value, '♥ 412', 'riktigt värde skrevs över');
  assert.equal(rows[1].name, '', 'demoraden skulle ha nollats');
});

test('nothing is zeroed outside overlay mode', () => {
  const env = makeSandbox({ search: '' });
  const widget = topLikeWidget(env);
  env.run('live-zero-state.js');
  env.render(widget, DEMO_ROWS);
  assert.deepEqual(rowText(widget).map(r => r.name), ['Alex', 'Mia', 'Leo'],
    'editorn ska behålla sin demodata');
});

// ---- live-leaderboard.js ---------------------------------------------------------------------
function leaderboardEnv(search, widgetState) {
  const env = makeSandbox({ search, state: { widgets: [widgetState] } });
  const widget = topLikeWidget(env, widgetState.id);
  env.render(widget, DEMO_ROWS);
  env.run('live-leaderboard.js');
  return { env, widget };
}

test('an empty tally in overlay mode renders zero, not demo people', () => {
  // sortedTop filters on activeLikes > 0. Production like events arrive with count 0, so the tally
  // is permanently empty — and `if (!top.length) return` left Alex/Mia/Leo on screen.
  const { env, widget } = leaderboardEnv('?overlay=1', { id: 'w1', type: 'templateTopLike', useLiveData: true });
  env.tick();
  const rows = rowText(widget);
  assert.deepEqual(rows.map(r => r.name), ['', '', ''], 'demonamn kvar vid tom tally');
  assert.deepEqual(rows.map(r => r.value), ['♥ 0', '♥ 0', '♥ 0'], 'siffrorna ska vara 0');
});

test('an empty tally in Studio mode leaves the demo rows alone', () => {
  const { env, widget } = leaderboardEnv('', { id: 'w1', type: 'templateTopLike', useLiveData: true });
  env.tick();
  assert.deepEqual(rowText(widget).map(r => r.name), ['Alex', 'Mia', 'Leo']);
});

test('a like with a username and a real count paints the row', () => {
  // Guards the fix from over-correcting: once the bridge sends a real count, the row must show it.
  const { env, widget } = leaderboardEnv('?overlay=1', { id: 'w1', type: 'templateTopLike', useLiveData: true });
  env.live({ type: 'like', username: 'jokero', name: 'Jokero', count: 7 });
  env.tick();
  const rows = rowText(widget);
  assert.equal(rows[0].name, 'Jokero');
  assert.equal(rows[0].value, '♥ 7');
});

test('a like whose count is 0 shows 0 — no invented value', () => {
  // Exactly today's production payload. Showing 0 is correct; showing anything else would be a lie.
  const { env, widget } = leaderboardEnv('?overlay=1', { id: 'w1', type: 'templateTopLike', useLiveData: true });
  env.live({ type: 'like', username: 'jokero', name: 'Jokero', count: 0, value: 0 });
  env.tick();
  assert.deepEqual(rowText(widget).map(r => r.value), ['♥ 0', '♥ 0', '♥ 0']);
  assert.deepEqual(rowText(widget).map(r => r.name), ['', '', '']);
});

test('a gift with a username and coins paints the coins row', () => {
  // Gift events already arrive complete (11/11 with username, count and value in production), so
  // Top Gift must work off this hotfix alone.
  const { env, widget } = leaderboardEnv('?overlay=1', { id: 'w1', type: 'templateTopGift', useLiveData: true, liveMetric: 'coins' });
  env.live({ type: 'gift', username: 'jokero', name: 'Jokero', coins: 250 });
  env.tick();
  assert.equal(rowText(widget)[0].name, 'Jokero');
  assert.equal(rowText(widget)[0].value, '♥ 250');
});

test('a viewer event never creates a leaderboard entry', () => {
  const { env, widget } = leaderboardEnv('?overlay=1', { id: 'w1', type: 'templateTopLike', useLiveData: true });
  env.live({ type: 'viewer', count: 431 });
  env.tick();
  assert.deepEqual(rowText(widget).map(r => r.name), ['', '', ''],
    'ett viewer-event utan username får inte hamna på topplistan');
});

// ---- the full production sequence -------------------------------------------------------------
test('viewer, like, gift and a repaint: the audience never sees a demo person', () => {
  const env = makeSandbox({ search: '?overlay=1', state: { widgets: [{ id: 'w1', type: 'templateTopGift', useLiveData: true, liveMetric: 'coins' }] } });
  const widget = topLikeWidget(env, 'w1');
  env.render(widget, DEMO_ROWS);
  env.run('state-backup.js');
  env.run('live-zero-state.js');
  env.run('live-leaderboard.js');

  env.live({ type: 'viewer', count: 12 });          // no username — must not disable anything
  env.render(widget, DEMO_ROWS);                     // media.js repaint
  env.live({ type: 'like', username: 'jokero', name: 'Jokero', count: 0 });   // today's payload
  env.live({ type: 'gift', username: 'jokero', name: 'Jokero', coins: 99 });
  env.tick();

  assert.equal(rowText(widget)[0].name, 'Jokero', 'gåvan skulle ha målat raden');
  assert.equal(rowText(widget)[0].value, '♥ 99');
  assert.ok(!rowText(widget).some(r => ['Alex', 'Mia', 'Leo'].includes(r.name)), 'demoperson syntes');
  assert.deepEqual(env.fetchCalls.filter(c => c.url.includes('/api/state')), [],
    'overlay-läget gjorde ett /api/state-anrop');
});

// ---- the room total is never an increment -----------------------------------------------------
// cloudEvent() in tiktok-bridge/normalizer.js maps `value` from coins ?? points ?? score. A like has
// no coins, so `value` carries `points` — TikTok's running room-wide like counter. Reading it as a
// per-viewer increment would add the whole room's total to one person on a single tap, and it would
// do so once per event, so a stream with a 900-like room total would hand out hundreds of thousands
// of likes within a minute. The bridge already refuses to conflate the two (see
// tiktok-bridge/test/like-fields.test.js); this is the same rule on the browser side, which is where
// the value actually lands in a leaderboard.
const likeTotals = (env, username = 'jokero') =>
  env.sandbox.window.VyraLeaderboard.getTop('likes', 10).find(t => t.username === username);

test('a like with count 0 and a room total of 943 adds exactly 0', () => {
  const env = makeSandbox({ search: '?overlay=1', state: { widgets: [] } });
  env.run('live-leaderboard.js');
  env.live({ type: 'like', username: 'jokero', name: 'Jokero', count: 0, value: 943 });
  assert.equal(likeTotals(env)?.likes ?? 0, 0, 'rumstotalen 943 lades till som inkrement');
});

test('the room total is ignored under every name it travels by', () => {
  // `value` is what reaches the browser today, but the same number is called points on the bridge's
  // internal shape and total/totalLikeCount in the TikTok protocol. None of them is an increment —
  // neither alongside a zero count nor as the only number in the payload, which is the case that
  // catches a total quietly appended to the end of the fallback chain.
  for (const field of ['value', 'points', 'total', 'totalLikeCount']) {
    for (const extra of [{ count: 0 }, {}]) {
      const env = makeSandbox({ search: '?overlay=1', state: { widgets: [] } });
      env.run('live-leaderboard.js');
      env.live({ type: 'like', username: 'jokero', name: 'Jokero', ...extra, [field]: 943 });
      assert.equal(likeTotals(env)?.likes ?? 0, 0,
        `${field} användes som inkrement (${'count' in extra ? 'med count 0' : 'ensamt fält'})`);
    }
  }
});

test('an explicit count of 0 wins over the legacy likes field', () => {
  // `??` not `||`: a like the protocol really reported as 0 must stay 0, not fall through to a
  // stale `likes` value from another shape. The bridge's likeFields() makes the same distinction.
  const env = makeSandbox({ search: '?overlay=1', state: { widgets: [] } });
  env.run('live-leaderboard.js');
  env.live({ type: 'like', username: 'jokero', name: 'Jokero', count: 0, likes: 5, value: 943 });
  assert.equal(likeTotals(env)?.likes ?? 0, 0, 'ett äkta 0 ersattes av ett annat fält');
});

test('a real count is still counted, and still accumulates', () => {
  const env = makeSandbox({ search: '?overlay=1', state: { widgets: [] } });
  env.run('live-leaderboard.js');
  env.live({ type: 'like', username: 'jokero', name: 'Jokero', count: 7, value: 943 });
  env.live({ type: 'like', username: 'jokero', name: 'Jokero', count: 3, value: 946 });
  assert.equal(likeTotals(env).likes, 10, 'inkrementet ska summeras, och bara inkrementet');
});

test('the legacy `likes` field still works when no count is present', () => {
  // The desktop bridge shape carries `likes`; dropping it would silently zero that path.
  const env = makeSandbox({ search: '?overlay=1', state: { widgets: [] } });
  env.run('live-leaderboard.js');
  env.live({ type: 'like', username: 'jokero', name: 'Jokero', likes: 4, value: 943 });
  assert.equal(likeTotals(env).likes, 4);
});

test('a like with no increment at all is 0, not the room total', () => {
  const env = makeSandbox({ search: '?overlay=1', state: { widgets: [] } });
  env.run('live-leaderboard.js');
  env.live({ type: 'like', username: 'jokero', name: 'Jokero', value: 943 });
  assert.equal(likeTotals(env)?.likes ?? 0, 0);
});

test('the persisted daily bucket is not inflated by the room total either', () => {
  // recordDaily() survives reloads in localStorage, so a total leaking in there would keep showing
  // up in Today/Week/Month long after the stream ended.
  const env = makeSandbox({ search: '?overlay=1', state: { widgets: [] } });
  env.run('live-leaderboard.js');
  env.live({ type: 'like', username: 'jokero', name: 'Jokero', count: 0, value: 943 });
  env.intervals.forEach(fn => fn());                       // flushes the 5s daily save
  const stored = env.sandbox.localStorage.getItem('vyra-leaderboard-daily-v1');
  const days = Object.values(JSON.parse(stored || '{}'));
  const likes = days.flatMap(day => Object.values(day)).reduce((sum, t) => sum + (t.likes || 0), 0);
  assert.equal(likes, 0, 'rumstotalen skrevs till den persistenta dagsbudgeten');
});
