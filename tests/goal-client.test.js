'use strict';
// The goal runtime: transport, ordering, batching and teardown.
//
// Ordering is `revision` and nothing else. epoch says which run a number belongs to and `at` is for
// display; neither can order two changes, because now() is the transaction's start time, two writes
// in the same millisecond collapse after getTime(), and a frame's timestamp used to come from the
// bridge's clock. revision is server-owned, per row, and strictly increasing — so it is compared as
// a string of digits, never as a Number, or two revisions past 2^53 would compare equal.
//
// RED BY CONSTRUCTION: goal-client.js does not exist yet.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');

let Goals = null;
try { Goals = require(path.join(__dirname, '..', 'goal-client.js')) } catch (_) { /* red below */ }

const OVERLAY = 'ov-1', WORKSPACE = 'ws-1', TOKEN = 'obs-token';

// A source that records its listeners, so "borrowed streams are never closed" is checkable.
function fakeSource(url) {
  const handlers = new Map();
  return { url, closed: false, handlers,
    addEventListener(name, fn) { handlers.set(name, [...(handlers.get(name) || []), fn]) },
    removeEventListener(name, fn) { handlers.set(name, (handlers.get(name) || []).filter(f => f !== fn)) },
    close() { this.closed = true },
    emit(name, data) { for (const fn of handlers.get(name) || []) fn({ data: JSON.stringify(data) }) },
    open() { for (const fn of handlers.get('open') || []) fn({}) } };
}

const frame = (widgetId, revision, over = {}) => ({ overlayId: OVERLAY, widgetId, metric: 'follows',
  value: 10, target: 100, epoch: 1, at: 1_700_000_000_000, revision: String(revision), ...over });

const goal = (widgetId, revision, over = {}) => ({ overlayId: OVERLAY, widgetId, metric: 'follows',
  baseline: 0, progress: 5, value: 5, target: 100, epoch: 1, at: 1, revision: String(revision), ...over });

function harness(over = {}) {
  const calls = [], frames = [], sources = [], rafQueue = [];
  const deps = {
    fetch: async (url, options) => {
      calls.push({ url, method: (options && options.method) || 'GET',
        body: options && options.body ? JSON.parse(options.body) : null });
      if (over.fetchImpl) return over.fetchImpl(url, options);
      return { ok: true, status: 200, json: async () => ({ ok: true, goals: over.snapshot || [] }) };
    },
    EventSource: function (url) { const s = fakeSource(url); sources.push(s); return s },
    requestAnimationFrame: fn => { rafQueue.push(fn); return rafQueue.length },
    cancelAnimationFrame: () => {},
    confirm: over.confirm || (() => true),
    save: over.save || (() => { throw new Error('goal-runtime får aldrig spara') }),
    render: () => { throw new Error('goal-runtime får aldrig rendera') },
    storage: { setItem: () => { throw new Error('goal-runtime får aldrig skriva localStorage') },
      getItem: () => null, removeItem: () => {} },
    dispatch: () => {},
    now: () => 1_700_000_000_000,
    ...over.deps
  };
  const runtime = Goals && Goals.createGoalRuntime(deps);
  const flush = () => { const queued = rafQueue.splice(0); queued.forEach(fn => fn(0)) };
  return { runtime, deps, calls, frames, sources, rafQueue, flush };
}

test('goal-client.js finns och exporterar createGoalRuntime', () => {
  assert.ok(Goals, 'goal-client.js finns inte');
  assert.equal(typeof Goals.createGoalRuntime, 'function');
});

// ---- transport -------------------------------------------------------------------------------------
test('overlayläget lånar strömmen och hämtar tokenens snapshot', async () => {
  const h = harness();
  const borrowed = fakeSource(`/api/overlay-access/${TOKEN}/events/stream`);
  await h.runtime.attachSource(borrowed, { owned: false, scope: { mode: 'token', token: TOKEN } });

  assert.equal(h.sources.length, 0, 'overlayläget öppnade en egen EventSource');
  assert.equal(h.calls[0].url, `/api/overlay-access/${TOKEN}/goals`);
  assert.ok(borrowed.handlers.get('goal'), 'ingen goal-lyssnare kopplades på den lånade strömmen');
});

test('Studio äger sin ström och hämtar medlems-snapshot', async () => {
  const h = harness();
  await h.runtime.openOwnSource({ workspaceId: WORKSPACE, overlayId: OVERLAY });

  assert.equal(h.sources.length, 1, 'Studio öppnade ingen egen ström');
  assert.equal(h.sources[0].url, `/api/workspaces/${WORKSPACE}/overlays/${OVERLAY}/events/stream`);
  assert.equal(h.calls[0].url, `/api/workspaces/${WORKSPACE}/overlays/${OVERLAY}/goals`);
});

test('strömmen öppnas före snapshoten hämtas', async () => {
  const order = [];
  const h = harness({ deps: {
    fetch: async url => { order.push('snapshot'); return { ok: true, json: async () => ({ ok: true, goals: [] }) } },
    EventSource: function (url) { order.push('stream'); return fakeSource(url) }
  } });
  await h.runtime.openOwnSource({ workspaceId: WORKSPACE, overlayId: OVERLAY });
  assert.deepEqual(order, ['stream', 'snapshot'],
    'snapshoten hämtades först — frames mellan svaret och prenumerationen går då förlorade');
});

// ---- buffring --------------------------------------------------------------------------------------
test('frames före snapshotsvaret buffras och appliceras efter', async () => {
  let releaseSnapshot;
  const pending = new Promise(resolve => { releaseSnapshot = resolve });
  const h = harness({ deps: {
    fetch: async () => { await pending; return { ok: true, json: async () => ({ ok: true,
      goals: [goal('w-1', 5, { value: 5 })] }) } }
  } });
  const opening = h.runtime.openOwnSource({ workspaceId: WORKSPACE, overlayId: OVERLAY });
  await new Promise(r => setImmediate(r));

  h.sources[0].emit('goal', frame('w-1', 9, { value: 90 }));
  assert.equal(h.runtime.read('w-1'), null, 'framen applicerades innan snapshoten fanns');

  releaseSnapshot();
  await opening;
  h.flush();
  assert.equal(h.runtime.read('w-1').value, 90, 'den buffrade framen tappades efter snapshoten');
});

test('en buffrad frame äldre än snapshoten släpps', async () => {
  let releaseSnapshot;
  const pending = new Promise(resolve => { releaseSnapshot = resolve });
  const h = harness({ deps: {
    fetch: async () => { await pending; return { ok: true, json: async () => ({ ok: true,
      goals: [goal('w-1', 20, { value: 200 })] }) } }
  } });
  const opening = h.runtime.openOwnSource({ workspaceId: WORKSPACE, overlayId: OVERLAY });
  await new Promise(r => setImmediate(r));
  h.sources[0].emit('goal', frame('w-1', 7, { value: 70 }));
  releaseSnapshot();
  await opening;
  h.flush();
  assert.equal(h.runtime.read('w-1').value, 200, 'en gammal buffrad frame skrev över snapshoten');
});

// ---- ordning: enbart revision -----------------------------------------------------------------------
test('endast strikt högre revision accepteras', async () => {
  const h = harness({ snapshot: [goal('w-1', 10, { value: 10 })] });
  await h.runtime.openOwnSource({ workspaceId: WORKSPACE, overlayId: OVERLAY });

  h.sources[0].emit('goal', frame('w-1', 11, { value: 11 })); h.flush();
  assert.equal(h.runtime.read('w-1').value, 11);

  h.sources[0].emit('goal', frame('w-1', 11, { value: 999 })); h.flush();
  assert.equal(h.runtime.read('w-1').value, 11, 'samma revision skrev över');

  h.sources[0].emit('goal', frame('w-1', 9, { value: 888 })); h.flush();
  assert.equal(h.runtime.read('w-1').value, 11, 'en lägre revision skrev över');
});

test('revision jämförs precisionssäkert bortom 2^53', async () => {
  // Number('9007199254740993') avrundas ner till ...992, så de två blir omöjliga att skilja åt
  // som tal men skiljer sig som siffersträngar. Det är hela poängen med att jämföra dem som text.
  const low = '9007199254740992', high = '9007199254740993';
  assert.equal(Number(low), Number(high), 'förutsättningen för testet gäller inte längre');
  const h = harness({ snapshot: [goal('w-1', low, { value: 1 })] });
  await h.runtime.openOwnSource({ workspaceId: WORKSPACE, overlayId: OVERLAY });
  h.sources[0].emit('goal', frame('w-1', high, { value: 2 })); h.flush();
  assert.equal(h.runtime.read('w-1').value, 2, 'revisionen jämfördes som Number och tappade steget');
});

test('epoch och at styr aldrig ordningen', async () => {
  const h = harness({ snapshot: [goal('w-1', 10, { value: 10, epoch: 1, at: 1000 })] });
  await h.runtime.openOwnSource({ workspaceId: WORKSPACE, overlayId: OVERLAY });

  // Högre epoch och nyare at, men lägre revision: ska ignoreras.
  h.sources[0].emit('goal', frame('w-1', 9, { value: 777, epoch: 9, at: 9_999_999 })); h.flush();
  assert.equal(h.runtime.read('w-1').value, 10, 'epoch eller at fick avgöra ordningen');

  // Lägre epoch men högre revision: ska accepteras — en reset kan ha rullat tillbaka epoken.
  h.sources[0].emit('goal', frame('w-1', 11, { value: 12, epoch: 0, at: 1 })); h.flush();
  assert.equal(h.runtime.read('w-1').value, 12);
});

test('en frame för ett annat overlay eller en okänd widget ignoreras', async () => {
  const h = harness({ snapshot: [goal('w-1', 1)] });
  await h.runtime.openOwnSource({ workspaceId: WORKSPACE, overlayId: OVERLAY });
  h.sources[0].emit('goal', frame('w-1', 5, { overlayId: 'ov-annan', value: 500 })); h.flush();
  assert.notEqual(h.runtime.read('w-1').value, 500, 'en frame från ett annat overlay applicerades');
});

// ---- reconnect --------------------------------------------------------------------------------------
test('reconnect hämtar en ny snapshot', async () => {
  const h = harness({ snapshot: [goal('w-1', 1)] });
  await h.runtime.openOwnSource({ workspaceId: WORKSPACE, overlayId: OVERLAY });
  const before = h.calls.filter(c => c.url.endsWith('/goals')).length;
  h.sources[0].open();
  await new Promise(r => setImmediate(r));
  const after = h.calls.filter(c => c.url.endsWith('/goals')).length;
  assert.equal(after, before + 1, 'ingen ny snapshot efter reconnect');
});

// ---- rAF-batchning ------------------------------------------------------------------------------------
test('100 frames före en animation frame ger en flush', async () => {
  const seen = [];
  const h = harness({ snapshot: [goal('w-1', 0)] });
  await h.runtime.openOwnSource({ workspaceId: WORKSPACE, overlayId: OVERLAY });
  h.runtime.subscribe(changed => seen.push(changed));

  for (let i = 1; i <= 100; i++) h.sources[0].emit('goal', frame('w-1', i, { value: i }));
  assert.equal(seen.length, 0, 'en frame målade direkt i stället för att vänta på rAF');
  assert.equal(h.rafQueue.length, 1, `${h.rafQueue.length} rAF-anrop för 100 frames`);

  h.flush();
  assert.equal(seen.length, 1, 'flushen gav fler än en uppdatering');
  assert.equal(h.runtime.read('w-1').value, 100, 'sista värdet vann inte');
});

test('runtimen sparar, renderar och skriver aldrig storage', async () => {
  // save/render/storage kastar i harnessen — ett anrop fäller testet.
  const h = harness({ snapshot: [goal('w-1', 1)] });
  await h.runtime.openOwnSource({ workspaceId: WORKSPACE, overlayId: OVERLAY });
  for (let i = 2; i < 20; i++) h.sources[0].emit('goal', frame('w-1', i, { value: i }));
  h.flush();
  assert.equal(h.runtime.read('w-1').value, 19);
});

// ---- kontroller ---------------------------------------------------------------------------------------
test('PATCH skickar bara det ändrade fältet och speglar först efter svar', async () => {
  const mirrored = [];
  const h = harness({ snapshot: [goal('w-1', 1)],
    deps: { save: (widgetId, patch) => mirrored.push([widgetId, patch]) } });
  await h.runtime.openOwnSource({ workspaceId: WORKSPACE, overlayId: OVERLAY });

  const out = await h.runtime.patchBaseline('w-1', 250);
  const put = h.calls.find(c => c.method === 'PATCH');
  assert.ok(put, 'ingen PATCH skickades');
  assert.deepEqual(put.body, { baseline: 250 }, 'PATCH bar fler fält än det ändrade');
  assert.equal(out.ok, true);
  assert.deepEqual(mirrored, [['w-1', { baseline: 250 }]],
    'legacyfältet speglades inte, eller speglades före serversvaret');
});

test('ogiltiga värden skickas aldrig', async () => {
  const h = harness({ snapshot: [goal('w-1', 1)] });
  await h.runtime.openOwnSource({ workspaceId: WORKSPACE, overlayId: OVERLAY });
  for (const bad of [-1, 1.5, NaN, Infinity, '5', null, 1e20]) {
    const out = await h.runtime.patchBaseline('w-1', bad);
    assert.equal(out.ok, false, `${bad} skickades till servern`);
  }
  assert.equal(h.calls.filter(c => c.method === 'PATCH').length, 0);
});

test('dubbel submit ger ett anrop', async () => {
  const h = harness({ snapshot: [goal('w-1', 1)] });
  await h.runtime.openOwnSource({ workspaceId: WORKSPACE, overlayId: OVERLAY });
  const [a, b] = await Promise.all([
    h.runtime.patchTarget('w-1', 500), h.runtime.patchTarget('w-1', 500)]);
  assert.equal(h.calls.filter(c => c.method === 'PATCH').length, 1,
    'dubbelklick gav två PATCH');
  assert.equal(a.ok || b.ok, true);
});

test('reset kräver bekräftelse', async () => {
  const h = harness({ snapshot: [goal('w-1', 1)], confirm: () => false });
  await h.runtime.openOwnSource({ workspaceId: WORKSPACE, overlayId: OVERLAY });
  const out = await h.runtime.reset('w-1');
  assert.equal(out.ok, false);
  assert.equal(h.calls.filter(c => c.method === 'POST').length, 0, 'reset skickades utan bekräftelse');
});

// ---- teardown -------------------------------------------------------------------------------------------
test('vyra-session-ended stänger ägd ström men aldrig lånad', async () => {
  const h = harness({ snapshot: [] });
  await h.runtime.openOwnSource({ workspaceId: WORKSPACE, overlayId: OVERLAY });
  const owned = h.sources[0];
  h.runtime.close();
  assert.equal(owned.closed, true, 'den ägda strömmen stängdes inte');

  const h2 = harness({ snapshot: [] });
  const borrowed = fakeSource('/api/overlay-access/x/events/stream');
  await h2.runtime.attachSource(borrowed, { owned: false, scope: { mode: 'token', token: 'x' } });
  h2.runtime.close();
  assert.equal(borrowed.closed, false, 'den lånade strömmen stängdes av målruntimen');
  assert.deepEqual(borrowed.handlers.get('goal'), [], 'lyssnaren låg kvar på den lånade strömmen');
});

test('teardown tömmer store och pending snapshot', async () => {
  const h = harness({ snapshot: [goal('w-1', 1)] });
  await h.runtime.openOwnSource({ workspaceId: WORKSPACE, overlayId: OVERLAY });
  assert.ok(h.runtime.read('w-1'));
  h.runtime.close();
  assert.equal(h.runtime.read('w-1'), null, 'store levde kvar efter teardown');
});
