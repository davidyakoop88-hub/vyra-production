'use strict';
// A gate that can blind a source is worse than no gate: nothing errors, the widgets simply stop
// moving. This file is about the gate failing open, and about its state being scoped to the stream
// it describes rather than to the browser it happens to run in.
//
// The scoping matters twice over. A tab that switches from one overlay to another keeps its
// sessionStorage, so a shared key would carry the previous workspace's high-water into a stream that
// starts wherever its own Redis stream does — and every new event would look old. And the only
// handle a standalone OBS page has on its stream is the access token, which must never end up in
// storage in the clear.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');

function memoryStorage() {
  const store = new Map();
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    _store: store
  };
}

// Storage that throws the way a browser with storage disabled does.
function throwingStorage(which) {
  return {
    getItem() { if (which !== 'set') throw new Error('SecurityError: storage disabled'); return null },
    setItem() { if (which !== 'get') throw new Error('QuotaExceededError'); }
  };
}

function studioFactory() {
  const sandbox = { console, JSON, Math, Number, String, Object, Array, Set, Map, Boolean, Date };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'event-dedupe.js'), 'utf8'), sandbox,
    { filename: 'event-dedupe.js' });
  return sandbox.window.VyraDedupe;
}

function widgetFactory() {
  const sandbox = {
    console, JSON, Math, Number, String, Object, Array, Set, Map, Boolean, Date,
    document: { documentElement: { dataset: {} } }, location: { search: '' }, URLSearchParams
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public/widgets/base-widget.js'), 'utf8'),
    sandbox, { filename: 'base-widget.js' });
  const api = sandbox.window.VyraWidget;
  assert.ok(api?.dedupe && api?.namespace, 'base-widget.js saknar dedupe/namespace');
  return { create: api.dedupe, namespace: api.namespace };
}

const IMPLEMENTATIONS = [['live-client (Studio)', studioFactory], ['base-widget (OBS)', widgetFactory]];

for (const [name, factory] of IMPLEMENTATIONS) {
  const gateWith = (storage, ns = 'ws-1') => factory().create(storage, 'vyra-seen-events', ns);

  test(`${name}: otillgänglig sessionStorage stoppar inte eventflödet`, () => {
    for (const [label, storage] of [
      ['getItem kastar', throwingStorage('get')],
      ['setItem kastar', throwingStorage('set')],
      ['båda kastar', throwingStorage()],
      ['ingen storage alls', null],
      ['storage utan metoder', {}]
    ]) {
      const gate = gateWith(storage);
      assert.equal(gate.accept('1-0'), true, `${label}: första eventet blockerades`);
      assert.equal(gate.accept('2-0'), true, `${label}: nya event blockerades`);
      // Without persistence it can only deduplicate in memory — which it must still do.
      assert.equal(gate.accept('2-0'), false, `${label}: dedupliceringen i minnet slutade fungera`);
    }
  });

  test(`${name}: korrupt persistens gör inte källan blind`, () => {
    for (const junk of ['{ inte json', '[]', 'null', '{"ids":"inte en array","high":"skräp"}',
      '{"high":["abc","def"]}', '{"ids":[1,2,3]}', '{"high":[1]}']) {
      const storage = memoryStorage();
      storage.setItem('vyra-seen-events:ws-1', junk);
      const gate = gateWith(storage);
      assert.equal(gate.accept('1754180000000-0'), true, `${junk}: allt blockerades`);
      // Nothing unusable may be adopted either: a persisted [1,2,3] must not become three set
      // entries that no incoming string id can ever match, and that the ring can never evict.
      assert.equal(gate.size(), 0, `${junk}: skräp lästes in i mängden`);
    }
  });

  test(`${name}: utkastade ID försvinner ur mängden, inte bara ur ringen`, () => {
    // If the ring drops an id but the set keeps it, memory grows without bound while the ring
    // pretends to be capped — the leak the cap exists to prevent.
    const gate = gateWith(memoryStorage());
    for (let i = 0; i < 600; i += 1) gate.accept(`uuid-${i}`);
    assert.equal(gate.accept('uuid-0'), true, 'ett utkastat ID satt kvar i mängden');
    assert.equal(gate.accept('uuid-599'), false, 'det senaste ID:t glömdes bort');
    assert.equal(gate.size(), 512, `mängden höll ${gate.size()} ID:n, inte 512`);
  });

  test(`${name}: state är namespacat per ström`, () => {
    const storage = memoryStorage();
    const a = gateWith(storage, 'workspace-a');
    const b = gateWith(storage, 'workspace-b');
    assert.equal(a.accept('1754180000000-0'), true);
    assert.equal(b.accept('1754180000000-0'), true, 'två strömmar delade high-water');
    const keys = [...storage._store.keys()];
    assert.ok(keys.some(k => k.includes('workspace-a')), 'namespace saknas i nyckeln');
    assert.ok(keys.some(k => k.includes('workspace-b')));
  });

  test(`${name}: byte av overlay i samma flik kastar inte nya event`, () => {
    const storage = memoryStorage();
    const first = gateWith(storage, 'workspace-a');
    assert.equal(first.accept('9999999999999-0'), true);
    const second = gateWith(storage, 'workspace-b');
    assert.equal(second.accept('1-0'), true, 'det nya overlayet blockerades av det gamlas high-water');
    assert.equal(second.accept('2-0'), true);
  });

  test(`${name}: en återskapad ström blinddödar inte källan permanent`, () => {
    // If Redis is flushed the ids start over below the stored high-water. Rejecting for ever would
    // leave the widgets frozen with no error anywhere. After a run of rejects the gate lets go of
    // its high-water and follows the stream it is actually being given.
    const gate = gateWith(memoryStorage());
    assert.equal(gate.accept('9999999999999-0'), true);
    let accepted = 0;
    for (let i = 1; i <= 120; i += 1) if (gate.accept(`1000-${i}`)) accepted += 1;
    assert.ok(accepted > 0, 'källan förblev blind efter att strömmen återskapats');
    assert.equal(gate.accept('1000-121'), true, 'strömmen togs aldrig över');
  });

  test(`${name}: en enstaka sen dubblett återställer inte high-water`, () => {
    // The reset above must not be reachable by ordinary replay, or it would undo the whole point.
    const gate = gateWith(memoryStorage());
    assert.equal(gate.accept('1000-100'), true);
    for (let i = 0; i < 20; i += 1) {
      assert.equal(gate.accept('1000-50'), false, 'en gammal dubblett släpptes igenom');
      assert.equal(gate.accept(`1000-${101 + i}`), true, 'ett nytt event blockerades');
    }
    assert.equal(gate.accept('1000-50'), false, 'high-water tappades av vanlig replay');
  });

  test(`${name}: ett UUID påverkas aldrig av Redis high-water`, () => {
    const gate = gateWith(memoryStorage());
    assert.equal(gate.accept('9999999999999-0'), true, 'stream-ID:t accepterades inte');
    for (const id of ['0000-0000-0000', 'a1b2c3d4-e5f6-4789-8abc-def012345678',
      '00000000-0000-4000-8000-000000000000', 'evt_1', 'x1']) {
      assert.equal(gate.accept(id), true, `${id} kastades av high-water`);
      assert.equal(gate.accept(id), false, `${id} deduplicerades inte som mängd`);
    }
  });

  test(`${name}: två browser sources reagerar en gång vardera även med namespace`, () => {
    const a = gateWith(memoryStorage(), 'workspace-a');
    const b = gateWith(memoryStorage(), 'workspace-a');
    assert.equal(a.accept('1754180000000-0'), true);
    assert.equal(b.accept('1754180000000-0'), true, 'den andra källan blev av med sitt event');
    assert.equal(a.accept('1754180000000-0'), false);
    assert.equal(b.accept('1754180000000-0'), false);
  });
}

// ---- the namespace itself -----------------------------------------------------------------------
test('access-tokenen lagras aldrig i klartext som namespace', () => {
  const VyraDedupe = studioFactory();
  const token = 'ovl_9f3c1e7b52a84d0f9c6e2b7a4d81f503';
  const ns = String(VyraDedupe.namespace(token));
  assert.ok(ns, 'ingen namespace producerades');
  assert.ok(!ns.includes(token), 'tokenen hamnade i namespacet');
  assert.ok(!ns.includes(token.slice(4, 20)), 'en del av tokenen läckte in i namespacet');
  assert.equal(VyraDedupe.namespace(token), ns, 'namespacet är inte stabilt');
  assert.notEqual(VyraDedupe.namespace(token + 'x'), ns, 'olika tokens gav samma namespace');

  const storage = memoryStorage();
  VyraDedupe.create(storage, 'vyra-seen-events', ns).accept('1-0');
  for (const key of storage._store.keys()) assert.ok(!key.includes(token), `nyckeln ${key} bär tokenen`);
  for (const value of storage._store.values()) {
    assert.ok(!String(value).includes(token), 'tokenen hamnade i det lagrade värdet');
  }
});

test('en icke-känslig identitet används rakt av', () => {
  // A workspace id is not a credential, and hashing it would only make the stored key unreadable
  // while debugging, for no gain.
  const VyraDedupe = studioFactory();
  assert.equal(VyraDedupe.namespace('ws_01HZY8', { sensitive: false }), 'ws_01HZY8');
});

test('båda implementationerna producerar samma namespace', () => {
  const studio = studioFactory(), widget = widgetFactory();
  for (const seed of ['ovl_abc123', 'ws_01HZY8', '', 'åäö-token', 'x'.repeat(200)]) {
    assert.equal(widget.namespace(seed), studio.namespace(seed), `namespace för "${seed}" glidit isär`);
  }
});

test('live-client och base-widget namespacar sin grind', () => {
  for (const file of ['live-client.js', 'public/widgets/base-widget.js']) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(source, /namespace\(/, `${file} skapar sin grind utan namespace`);
    assert.ok(!/create\(\s*(?:sessionStorage|storage)\s*,\s*'[^']*'\s*\)/.test(source),
      `${file} använder fortfarande en global nyckel`);
  }
});

// Studio can move between workspaces without a reload — cloud-sync's conflict dialog does exactly
// that — so the gate cannot be created once at load and kept for ever. live-client.js as a whole
// cannot be evaluated here (it builds the live connection), so the three functions that decide the
// gate's identity are lifted out and run against stubs.
function liveClientGate(stubs) {
  const source = fs.readFileSync(path.join(ROOT, 'live-client.js'), 'utf8');
  const start = source.indexOf('function safeSessionStorage()');
  const end = source.indexOf('function ingest(');
  assert.ok(start > -1 && end > start, 'hittade inte grindblocket i live-client.js');
  const sandbox = {
    console, JSON, Math, Number, String, Object, Array, Set, Map, Boolean, Date, URLSearchParams,
    location: { search: stubs.search || '' },
    sessionStorage: stubs.storage,
    ...stubs.globals
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'event-dedupe.js'), 'utf8'), sandbox);
  vm.runInNewContext(source.slice(start, end), sandbox);
  return sandbox;
}

test('grinden byggs om när strömmen byter identitet', () => {
  let workspace = 'workspace-a';
  const storage = memoryStorage();
  const sandbox = liveClientGate({
    storage,
    globals: { VyraAuth: { lastDetail: () => ({ workspaces: [{ get id() { return workspace } }] }) } }
  });
  assert.equal(sandbox.gateFor().accept('9999999999999-0'), true);
  assert.equal(sandbox.gateFor().accept('9999999999999-0'), false, 'samma ström deduplicerar inte');
  workspace = 'workspace-b';
  assert.equal(sandbox.gateFor().accept('1-0'), true,
    'det nya workspacet blockerades av det gamlas high-water');
  assert.equal(sandbox.gateFor().accept('1-0'), false, 'den nya grinden deduplicerar inte');
});

test('overlayläget namespacar på tokenen utan att lagra den', () => {
  const token = 'ovl_9f3c1e7b52a84d0f9c6e2b7a4d81f503';
  const storage = memoryStorage();
  const sandbox = liveClientGate({ storage, search: '?overlay=1&access=' + token, globals: {} });
  assert.equal(sandbox.gateFor().accept('1-0'), true);
  assert.equal(sandbox.gateFor().accept('1-0'), false);
  for (const key of storage._store.keys()) assert.ok(!key.includes(token), `nyckeln ${key} bär tokenen`);
  assert.ok([...storage._store.keys()].some(k => /:h[0-9a-z]+$/.test(k)),
    'overlayläget använde inte det envägshashade namespacet');
});

test('en otillgänglig sessionStorage stoppar inte Studio heller', () => {
  const sandbox = liveClientGate({
    storage: throwingStorage(),
    globals: { VyraAuth: { lastDetail: () => ({ workspaces: [{ id: 'ws' }] }) } }
  });
  assert.equal(sandbox.gateFor().accept('1-0'), true);
  assert.equal(sandbox.gateFor().accept('2-0'), true);
});
