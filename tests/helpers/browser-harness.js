'use strict';
// A minimal browser for the session modules, built on node:vm — no jsdom, no dependency.
//
// The account-switch leak is a property of how cloud-sync.js, live-client.js and session-state.js
// behave together over a real sequence of events, so a source scan cannot prove it closed. This
// loads the actual production files into one shared global and drives them with real events.
//
// Only what those files touch is implemented. Anything they reach for that is missing shows up as a
// TypeError in the test rather than being silently faked.
const vm = require('node:vm');
const fs = require('fs'), path = require('path');
const H = require('./session-harness.js');

const ROOT = path.join(__dirname, '..', '..');

function createBrowser({ storage = H.createStorage(), locks = H.createLockManager(),
                         hostname = 'vyralive.app' } = {}) {
  const listeners = new Map();
  const timers = { intervals: [], timeouts: [] };
  const dispatched = [];

  const element = () => {
    const node = { style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
      children: [], innerHTML: '', textContent: '', hidden: false,
      append(...kids) { node.children.push(...kids) }, remove() {}, setAttribute() {},
      removeAttribute() {}, addEventListener() {}, querySelector: () => element(),
      querySelectorAll: () => [], onclick: null, value: '' };
    return node;
  };
  const document = { readyState: 'complete', body: element(), head: element(),
    documentElement: { dataset: {}, classList: { add() {}, remove() {}, toggle() {} } },
    createElement: () => element(), querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {} };

  // EventSource stub with a real close()/listener registry, so a teardown claim can be checked.
  const openStreams = [];
  class FakeEventSource {
    constructor(url) {
      this.url = url; this.readyState = 0; this.closed = false;
      this.handlers = new Map();
      openStreams.push(this);
    }
    addEventListener(name, fn) {
      const list = this.handlers.get(name) || [];
      list.push(fn); this.handlers.set(name, list);
    }
    removeEventListener(name, fn) {
      this.handlers.set(name, (this.handlers.get(name) || []).filter(f => f !== fn));
    }
    close() { this.closed = true; this.readyState = 2 }
    // Deliver a message the way the browser would — including after close(), which is exactly the
    // case a generation guard has to survive.
    deliver(name, data, lastEventId) {
      for (const fn of this.handlers.get(name) || []) fn({ data: JSON.stringify(data), lastEventId });
    }
  }
  FakeEventSource.CLOSED = 2;

  const sandbox = {
    console, JSON, Math, Date, Promise, Error, TypeError, Object, Array, String, Number, Boolean,
    Set, Map, RegExp, URL, URLSearchParams, TextDecoder, isNaN, parseInt, parseFloat,
    localStorage: storage,
    sessionStorage: H.createStorage(),
    document,
    navigator: { locks, userAgent: 'harness' },
    location: { hostname, search: '', pathname: '/studio.html', href: `https://${hostname}/studio.html` },
    crypto: { randomUUID: (() => { let n = 0; return () => `uuid-${++n}` })() },
    EventSource: FakeEventSource,
    CustomEvent: class CustomEvent { constructor(name, init) { this.type = name; this.detail = init && init.detail } },
    addEventListener(name, fn) { (listeners.get(name) || listeners.set(name, []).get(name)).push(fn) },
    removeEventListener(name, fn) {
      listeners.set(name, (listeners.get(name) || []).filter(f => f !== fn));
    },
    dispatchEvent(event) {
      dispatched.push(event.type);
      for (const fn of (listeners.get(event.type) || []).slice()) fn(event);
      return true;
    },
    setTimeout(fn, ms) { timers.timeouts.push({ fn, ms }); return timers.timeouts.length },
    clearTimeout(id) { if (timers.timeouts[id - 1]) timers.timeouts[id - 1].cleared = true },
    setInterval(fn, ms) { timers.intervals.push({ fn, ms }); return timers.intervals.length },
    clearInterval(id) { if (timers.intervals[id - 1]) timers.intervals[id - 1].cleared = true },
    fetch: async () => { throw new Error('harnessen tillåter inget nätverk') }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  // `listeners.get(name) || listeners.set(...)` above needs the map to exist first.
  sandbox.addEventListener = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(fn);
  };

  const context = vm.createContext(sandbox);
  const load = file => {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  };
  const emit = (name, detail) => sandbox.dispatchEvent(new sandbox.CustomEvent(name, { detail }));
  // cloud-sync and live-client both schedule work; the harness fires it explicitly so a test never
  // depends on wall-clock timing.
  const tick = kind => {
    for (const timer of (kind === 'interval' ? timers.intervals : timers.timeouts)) {
      if (!timer.cleared) timer.fn();
    }
  };
  const settle = () => new Promise(resolve => setImmediate(resolve));

  return { sandbox, storage, locks, load, emit, tick, settle, timers, dispatched, openStreams };
}

module.exports = { createBrowser };
