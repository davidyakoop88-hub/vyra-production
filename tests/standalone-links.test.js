'use strict';
// The two things that must never happen: the streamer gets a link to a widget the server refused,
// and a failed save quietly undoes work another tab or another action did in the meantime.
//
// cloud-sync reads the layout from storage, so a candidate has to exist locally before it can be
// sent. Every failure path therefore removes that candidate by its own id and nothing else — the
// tests below add a concurrent change during the save and check it survives.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));

// Fresh module per test: it keeps an in-flight map, and leaking that between tests would hide a
// double-click bug rather than expose one.
function load(state, options = {}) {
  const sandbox = {
    console, JSON, Math, Number, String, Object, Array, Set, Map, Boolean, Date, Promise, Error,
    crypto: require('crypto').webcrypto, Uint32Array,
    state, VyraWidgets
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'standalone-links.js'), 'utf8'), sandbox,
    { filename: 'standalone-links.js' });
  const calls = { pushes: 0, saves: 0, billing: 0 };
  const deps = {
    widgets: VyraWidgets,
    workspaceId: 'ws-1',
    fetchJson: async () => { calls.billing += 1; return { limits: { widgets: options.limit ?? 500 } } },
    save: () => { calls.saves += 1 },
    sync: { push: async () => { calls.pushes += 1; return options.push ? options.push(calls.pushes) : { ok: true } } },
    confirm: options.confirm
  };
  return { api: sandbox.window.VyraStandalone, deps, calls, sandbox };
}

const layoutWidget = (id, type = 'templateTopLike') => ({ id, type });
const KEY = 'catalog:toplike:neon';

// ---- quota ---------------------------------------------------------------------------------------
test('limit 0 blockeras före factory och före varje stateändring', () => {
  const state = { widgets: [] };
  const { api, deps, calls } = load(state, { limit: 0 });
  return api.create(KEY, deps).then(
    () => assert.fail('skapandet tilläts trots limit 0'),
    err => {
      assert.equal(err.code, 'quota');
      assert.match(err.message, /Uppgradera/);
      assert.deepEqual(state.widgets, [], 'state ändrades trots blockering');
      assert.equal(calls.pushes, 0, 'servern anropades trots blockering');
      assert.equal(calls.saves, 0, 'state sparades trots blockering');
    });
});

test('en aktiv trial använder entitlementets faktiska gräns, inte ett plannamn', async () => {
  // A trial and a paid plan differ only in the limits the server reports.
  const state = { widgets: [layoutWidget('a'), layoutWidget('b')] };
  const { api, deps } = load(state, { limit: 3 });
  const result = await api.create(KEY, deps);
  assert.equal(result.reused, false);
  assert.equal(state.widgets.length, 3);
  const source = fs.readFileSync(path.join(ROOT, 'standalone-links.js'), 'utf8');
  for (const planName of ['premium', 'free', 'trialing', 'plan ===']) {
    assert.ok(!source.includes(planName), `plannamnet "${planName}" är hårdkodat i flödet`);
  }
});

test('sista lediga platsen fungerar, platsen därefter blockeras', async () => {
  const state = { widgets: [layoutWidget('a'), layoutWidget('b')] };
  const { api, deps } = load(state, { limit: 3 });
  await api.create(KEY, deps);
  assert.equal(state.widgets.length, 3, 'sista platsen kunde inte användas');
  await assert.rejects(() => api.create('catalog:topgift:neon', deps), err => err.code === 'quota');
  assert.equal(state.widgets.length, 3, 'en blockerad widget lämnades kvar i state');
});

test('layout och standalone räknas mot samma gräns', async () => {
  const state = { widgets: [layoutWidget('a'), { id: 'b', type: 'x', placement: 'standalone' }] };
  const { api, deps } = load(state, { limit: 2 });
  await assert.rejects(() => api.create(KEY, deps), err => err.code === 'quota');
});

// ---- reuse ---------------------------------------------------------------------------------------
test('en befintlig standalone med samma createdFrom återanvänds utan ny plats', async () => {
  const existing = VyraWidgets.create(KEY, { placement: 'standalone' });
  const state = { widgets: [layoutWidget('a'), existing] };
  const { api, deps, calls } = load(state, { limit: 2 });
  const result = await api.create(KEY, deps);
  assert.equal(result.reused, true);
  assert.equal(result.widget.id, existing.id, 'ID:t ändrades vid återanvändning');
  assert.equal(state.widgets.length, 2, 'en dubblett skapades');
  assert.equal(calls.billing, 0, 'kvoten kontrollerades trots att inget skapades');
  assert.equal(calls.pushes, 0, 'servern anropades trots att inget skapades');
});

test('en layoutwidget av samma typ räknas inte som återanvändbar instans', async () => {
  // Copying a link for a widget already in Layout is a different flow and costs no slot either, but
  // it must not be mistaken for the standalone instance.
  const layout = VyraWidgets.create(KEY);
  const state = { widgets: [layout] };
  const { api, deps } = load(state, { limit: 5 });
  const result = await api.create(KEY, deps);
  assert.equal(result.reused, false);
  assert.notEqual(result.widget.id, layout.id);
});

// ---- server refusals ------------------------------------------------------------------------------
test('402 rullar tillbaka endast kandidaten och visar uppgraderingsmeddelandet', async () => {
  const other = layoutWidget('other');
  const state = { widgets: [other] };
  const { api, deps } = load(state, { limit: 500, push: () => ({ ok: false, status: 402 }) });
  await assert.rejects(() => api.create(KEY, deps), err => {
    assert.equal(err.code, 'quota');
    assert.match(err.message, /Uppgradera/);
    return true;
  });
  assert.deepEqual(state.widgets, [other], 'kandidaten eller något annat blev kvar');
});

test('409 skriver inte över serverstate och ber användaren försöka igen', async () => {
  const state = { widgets: [layoutWidget('other')] };
  const { api, deps } = load(state, { limit: 500, push: () => ({ ok: false, status: 409 }) });
  await assert.rejects(() => api.create(KEY, deps), err => {
    assert.equal(err.code, 'conflict');
    assert.match(err.message, /försök igen/i);
    return true;
  });
  assert.equal(state.widgets.length, 1, 'kandidaten blev kvar efter konflikt');
});

test('nätverksfel lämnar varken död länk eller halv instans', async () => {
  const state = { widgets: [layoutWidget('other')] };
  const { api, deps } = load(state, {
    limit: 500, push: () => { throw Object.assign(new Error('offline'), { status: 0 }) }
  });
  await assert.rejects(() => api.create(KEY, deps), err => err.code === 'network');
  assert.equal(state.widgets.length, 1);
  assert.ok(!state.widgets.some(w => VyraWidgets.isStandalone(w)), 'en halv standalone lämnades kvar');
});

test('återställningen raderar aldrig andra samtidiga widgetändringar', async () => {
  // Another tab, an action or the streamer adds a widget while the save is in flight. A snapshot
  // rollback would delete it; a targeted one by candidate id cannot.
  const state = { widgets: [layoutWidget('before')] };
  const { api, deps } = load(state, {
    limit: 500,
    push: async () => { state.widgets.push(layoutWidget('added-during-save')); return { ok: false, status: 402 } }
  });
  await assert.rejects(() => api.create(KEY, deps), err => err.code === 'quota');
  assert.deepEqual(state.widgets.map(w => w.id), ['before', 'added-during-save'],
    'en samtidig ändring försvann i återställningen');
});

test('två flikar på sista platsen: bara den servergodkända instansen finns kvar', async () => {
  // Both tabs pass the client check against the same limit; the server accepts one and refuses the
  // other with 402. Only the accepted one may survive locally.
  const shared = [layoutWidget('a'), layoutWidget('b')];
  const tabA = { widgets: shared.slice() };
  const tabB = { widgets: shared.slice() };
  const a = load(tabA, { limit: 3, push: () => ({ ok: true }) });
  const b = load(tabB, { limit: 3, push: () => ({ ok: false, status: 402 }) });
  const [resA, resB] = await Promise.allSettled([a.api.create(KEY, a.deps), b.api.create(KEY, b.deps)]);
  assert.equal(resA.status, 'fulfilled');
  assert.equal(resB.status, 'rejected');
  assert.equal(resB.reason.code, 'quota');
  assert.equal(tabA.widgets.length, 3, 'den godkända instansen sparades inte');
  assert.equal(tabB.widgets.length, 2, 'den avvisade instansen blev kvar');
});

test('dubbelklick skapar en enda instans', async () => {
  const state = { widgets: [] };
  const { api, deps, calls } = load(state, { limit: 5 });
  const [one, two] = await Promise.all([api.create(KEY, deps), api.create(KEY, deps)]);
  assert.equal(one.widget.id, two.widget.id, 'två olika instanser skapades');
  assert.equal(state.widgets.length, 1);
  assert.equal(calls.pushes, 1, 'servern anropades två gånger för ett klick');
});

test('länken kopieras först efter serverns bekräftelse', async () => {
  // The flow returns the widget only on ok:true; every other path throws, so there is nothing to
  // build a URL from.
  const source = fs.readFileSync(path.join(ROOT, 'standalone-links.js'), 'utf8');
  const returns = [...source.matchAll(/return \{ widget: [^}]*\}/g)].map(m => m[0]);
  assert.ok(returns.length >= 2, 'hittade inte returvägarna');
  const okGate = /if \(!result \|\| result\.ok !== true\) \{[\s\S]*?throw/.test(source);
  assert.ok(okGate, 'flödet returnerar utan att kräva ok:true från servern');
});

test('access-tokenen förekommer aldrig i fel eller loggar', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'standalone-links.js'), 'utf8');
  // Comments may name the risk; code may not touch it.
  const code = source.split(String.fromCharCode(10)).filter(l => !l.trim().startsWith("//")).join(" ");
  for (const word of ['access', 'token', 'console.log', 'console.error', 'overlayShareUrl']) {
    assert.ok(!code.includes(word), `flödet rör ${word}`);
  }
  // And a failed request's own message never reaches the user-facing error.
  const state = { widgets: [] };
  const { api, deps } = load(state, {
    limit: 5,
    push: () => { throw new Error('PUT https://vyralive.app/overlay.html?access=SECRET-TOKEN failed') }
  });
  await assert.rejects(() => api.create(KEY, deps), err => {
    assert.ok(!/SECRET-TOKEN|access=/.test(err.message), `tokenen läckte: ${err.message}`);
    return err.code === 'network';
  });
});

// ---- deletion ------------------------------------------------------------------------------------
test('radering kräver bekräftelse och avbryts om användaren säger nej', async () => {
  const w = VyraWidgets.create(KEY, { placement: 'standalone' });
  const state = { widgets: [layoutWidget('a'), w] };
  const { api, deps, calls } = load(state, { confirm: () => false });
  const result = await api.deleteStandalone(w.id, deps);
  assert.equal(result.deleted, false);
  assert.equal(result.reason, 'cancelled');
  assert.equal(state.widgets.length, 2, 'widgeten togs bort trots avbruten bekräftelse');
  assert.equal(calls.pushes, 0);
});

test('lyckad radering tar bort instansen', async () => {
  const w = VyraWidgets.create(KEY, { placement: 'standalone' });
  const state = { widgets: [layoutWidget('a'), w] };
  const { api, deps } = load(state, { confirm: () => true });
  const result = await api.deleteStandalone(w.id, deps);
  assert.equal(result.deleted, true);
  assert.deepEqual(state.widgets.map(x => x.id), ['a']);
});

test('en avvisad radering återställer widgeten på sin plats', async () => {
  const w = VyraWidgets.create(KEY, { placement: 'standalone' });
  const state = { widgets: [layoutWidget('a'), w, layoutWidget('b')] };
  const { api, deps } = load(state, { confirm: () => true, push: () => ({ ok: false, status: 409 }) });
  const result = await api.deleteStandalone(w.id, deps);
  assert.equal(result.deleted, false);
  assert.equal(result.reason, 'conflict');
  assert.deepEqual(state.widgets.map(x => x.id), ['a', w.id, 'b'], 'ordningen återställdes inte');
});

test('radering av sista widgeten armerar empty-state-flaggan och rensar den alltid', async () => {
  const w = VyraWidgets.create(KEY, { placement: 'standalone' });
  const state = { widgets: [w] };
  const seen = [];
  const { api, deps, sandbox } = load(state, {
    confirm: () => true,
    push: async () => { seen.push(sandbox.window.__vyraUserEmptiedWidgets); return { ok: true } }
  });
  await api.deleteStandalone(w.id, deps);
  assert.deepEqual(seen, [true], 'flaggan var inte satt under just den sparningen');
  assert.equal('__vyraUserEmptiedWidgets' in sandbox.window, false, 'flaggan blev kvar efteråt');
});

test('flaggan rensas även när sparningen misslyckas', async () => {
  const w = VyraWidgets.create(KEY, { placement: 'standalone' });
  const state = { widgets: [w] };
  const { api, deps, sandbox } = load(state, {
    confirm: () => true, push: () => { throw new Error('offline') }
  });
  await assert.rejects(() => api.deleteStandalone(w.id, deps));
  assert.equal('__vyraUserEmptiedWidgets' in sandbox.window, false, 'flaggan blev kvar efter ett fel');
});

test('varken skapande, kvotfel eller konflikt armerar empty-state', async () => {
  for (const push of [() => ({ ok: false, status: 402 }), () => ({ ok: false, status: 409 }), () => ({ ok: true })]) {
    const state = { widgets: [] };
    const { api, deps, sandbox } = load(state, { limit: 5, push });
    await api.create(KEY, deps).catch(() => {});
    assert.equal('__vyraUserEmptiedWidgets' in sandbox.window, false,
      'skapandeflödet armerade empty-state');
  }
});

test('flaggan skrivs aldrig till state, localStorage eller molnpayloaden', () => {
  const source = fs.readFileSync(path.join(ROOT, 'standalone-links.js'), 'utf8');
  const flag = '__vyraUserEmptiedWidgets';
  const lines = source.split(/\r?\n/).filter(l => l.includes(flag) && !l.trim().startsWith('//'));
  assert.equal(lines.length, 2, `flaggan rörs på ${lines.length} ställen, väntade två`);
  assert.match(lines[0], /root\.__vyraUserEmptiedWidgets = true/);
  assert.match(lines[1], /delete root\.__vyraUserEmptiedWidgets/);
  for (const sink of ['state.', 'localStorage', 'JSON.stringify', 'payload']) {
    assert.ok(!lines.some(l => l.includes(sink)), `flaggan når ${sink}`);
  }
  // cloud-sync must not let the flag outlive the save it authorised — but it also must not let a
  // FAILED save consume it. Clearing it in a `finally` did both: a version conflict or a network
  // blip threw the user's intent away, every retry was then blocked by the server's emptyBlocked,
  // and the layout could never be emptied. So the property is narrower than "always clears":
  const sync = fs.readFileSync(path.join(ROOT, 'cloud-sync.js'), 'utf8');
  assert.doesNotMatch(sync, /finally\{if\(emptied\)delete root\.__vyraUserEmptiedWidgets\}/,
    'flaggan rensas i ett finally och forbrukas darmed aven av ett misslyckat forsok');
  assert.match(sync, /if\(emptied\)delete root\.__vyraUserEmptiedWidgets;/,
    'flaggan rensas inte efter en lyckad sparning');
  assert.match(sync, /__vyraUserEmptiedWidgets===true&&data\.widgets\.length>0\)delete/,
    'en inaktuell avsikt rensas inte nar anvandaren lagt tillbaka widgets');
});
