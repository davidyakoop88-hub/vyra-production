'use strict';
// Nothing in the browser ever checked whether it had already seen an event. live-leaderboard.js
// back-filled /api/events?after=0 and called record() directly while live-client.js's poll loop fed
// the same events through ingest(), and record() writes into localStorage day buckets that survive
// reloads — so in desktop mode every reload added the whole rolling buffer to Today/Week/Month all
// over again. On the cloud side the same gap means a history fetch racing the SSE stream counts the
// overlap twice. Neither shows up as an error; the numbers are simply wrong, and they stay wrong.
//
// The rule this file pins:
//   - the same id twice in one browser source is handled exactly once
//   - a reload of that source does not re-handle history it already counted
//   - a second source (a second OBS browser source, a second tab) still gets the event once
//   - an event with no id is always handled, and two of them are never the same event
//   - Redis stream ids (digits-digits) get a high-water mark; every other id shape is a set
//     membership test, never a lexicographic comparison
//   - memory is bounded
//
// Both implementations are driven from the same table. live-client.js and the standalone
// base-widget.js each carry their own copy for the reason normalizeCloudFields already does — an OBS
// page never loads the Studio bundle — so the only thing keeping them honest is a shared test.
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

// The Studio copy, loaded as a plain script.
function studioFactory() {
  const sandbox = { console, JSON, Math, Number, String, Object, Array, Set, Map, Boolean, Date };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'event-dedupe.js'), 'utf8'), sandbox,
    { filename: 'event-dedupe.js' });
  return sandbox.window.VyraDedupe;
}

// The standalone copy, lifted out of base-widget.js the same way.
function widgetFactory() {
  const sandbox = {
    console, JSON, Math, Number, String, Object, Array, Set, Map, Boolean, Date,
    document: { documentElement: { dataset: {} } },
    location: { search: '' }, URLSearchParams
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public/widgets/base-widget.js'), 'utf8'),
    sandbox, { filename: 'base-widget.js' });
  assert.ok(sandbox.window.VyraWidget?.dedupe, 'base-widget.js exporterar ingen dedupe');
  return { create: sandbox.window.VyraWidget.dedupe };
}

const IMPLEMENTATIONS = [['live-client (Studio)', studioFactory], ['base-widget (OBS)', widgetFactory]];

for (const [name, factory] of IMPLEMENTATIONS) {
  const make = (storage = memoryStorage()) => ({ gate: factory().create(storage, 'vyra-seen-events'), storage });

  test(`${name}: samma event-ID två gånger hanteras exakt en gång`, () => {
    const { gate } = make();
    assert.equal(gate.accept('1754180000000-0'), true, 'första förekomsten släpptes inte igenom');
    assert.equal(gate.accept('1754180000000-0'), false, 'dubbletten räknades');
  });

  test(`${name}: historik följt av samma event via SSE räknas en gång`, () => {
    // /api/events?after=0 returns the rolling buffer; the stream then delivers whatever was
    // published after it connected. The overlap is real and is exactly what used to double-count.
    const { gate } = make();
    const history = ['1754180000000-0', '1754180000100-0', '1754180000200-0'];
    history.forEach(id => assert.equal(gate.accept(id), true));
    // The stream re-delivers the tail of that history plus one genuinely new event.
    assert.equal(gate.accept('1754180000100-0'), false, 'historik-event räknades igen från strömmen');
    assert.equal(gate.accept('1754180000200-0'), false);
    assert.equal(gate.accept('1754180000300-0'), true, 'ett nytt event blockerades');
  });

  test(`${name}: en omladdning i samma flik räknar inte om historiken`, () => {
    const storage = memoryStorage();
    const first = make(storage);
    ['1754180000000-0', '1754180000100-0'].forEach(id => first.gate.accept(id));
    // Reload: same sessionStorage, brand new gate.
    const second = make(storage);
    assert.equal(second.gate.accept('1754180000000-0'), false, 'historiken räknades om efter reload');
    assert.equal(second.gate.accept('1754180000100-0'), false);
    assert.equal(second.gate.accept('1754180000050-0'), false, 'ett äldre ID släpptes igenom efter reload');
    assert.equal(second.gate.accept('1754180000200-0'), true, 'nya event stoppades efter reload');
  });

  test(`${name}: två separata källor får vardera sitt exemplar`, () => {
    // sessionStorage is per browsing context, so an OBS browser source and a Studio tab are two
    // independent counters. Deduplicating globally would mean one source silently showed nothing.
    const a = make(), b = make();
    assert.equal(a.gate.accept('1754180000000-0'), true);
    assert.equal(b.gate.accept('1754180000000-0'), true, 'den andra källan blev av med sitt event');
  });

  test(`${name}: event utan ID hanteras alltid och slås inte ihop`, () => {
    const { gate } = make();
    for (const missing of ['', null, undefined, 0, false]) {
      assert.equal(gate.accept(missing), true, `${JSON.stringify(missing)} blockerades`);
      assert.equal(gate.accept(missing), true, `${JSON.stringify(missing)} slogs ihop med föregående`);
    }
  });

  test(`${name}: UUID jämförs som mängd, aldrig lexikografiskt`, () => {
    // A UUID that happens to sort below an earlier one must still be accepted — treating it like a
    // stream id would silently drop half the traffic from any producer that does not use Redis ids.
    const { gate } = make();
    const high = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const low = '00000000-0000-4000-8000-000000000000';
    assert.equal(gate.accept(high), true);
    assert.equal(gate.accept(low), true, 'ett "lägre" UUID behandlades som gammalt');
    assert.equal(gate.accept(high), false, 'UUID-dubbletten räknades');
    assert.equal(gate.accept(low), false);
  });

  test(`${name}: gamla och nya Redis stream-ID hanteras med high-water`, () => {
    const { gate } = make();
    assert.equal(gate.accept('1754180000000-5'), true);
    // Same millisecond, lower sequence — older, already covered.
    assert.equal(gate.accept('1754180000000-4'), false, 'ett lägre sekvensnummer släpptes igenom');
    // Same millisecond, higher sequence — genuinely newer.
    assert.equal(gate.accept('1754180000000-6'), true, 'ett högre sekvensnummer blockerades');
    // Older millisecond entirely.
    assert.equal(gate.accept('1754179999999-0'), false, 'ett äldre millisekund-ID släpptes igenom');
    // Numeric, not string: '9-0' must not look newer than '10-0'.
    const fresh = make();
    assert.equal(fresh.gate.accept('10-0'), true);
    assert.equal(fresh.gate.accept('9-0'), false, 'ID:n jämfördes som strängar');
  });

  test(`${name}: minnet är begränsat till 512 ID:n`, () => {
    const { gate, storage } = make();
    const ids = Array.from({ length: 600 }, (_, i) => `id-${i}-uuid`);
    ids.forEach(id => assert.equal(gate.accept(id), true, `${id} blockerades felaktigt`));
    // The most recent ones are still remembered…
    assert.equal(gate.accept('id-599-uuid'), false, 'det senaste ID:t glömdes bort');
    assert.equal(gate.accept('id-100-uuid'), false, 'ett ID inom ringen glömdes bort');
    // …and the oldest have fallen out rather than growing without bound.
    assert.equal(gate.accept('id-0-uuid'), true, 'ringen växte obegränsat');
    const persisted = storage.getItem('vyra-seen-events') || '';
    assert.ok(persisted.length < 40000, `persistensen växte till ${persisted.length} tecken`);
    const parsed = JSON.parse(persisted);
    assert.ok((parsed.ids || []).length <= 512, `ringen höll ${(parsed.ids || []).length} ID:n`);
  });

  test(`${name}: trasig persistens gör inte källan blind`, () => {
    const storage = memoryStorage();
    storage.setItem('vyra-seen-events', '{ inte json');
    const { gate } = make(storage);
    assert.equal(gate.accept('1754180000000-0'), true, 'ett korrupt lager stoppade alla event');
  });
}

// ---- the two implementations must not drift -----------------------------------------------------
test('båda implementationerna svarar identiskt på samma sekvens', () => {
  const sequence = ['1-0', '1-0', '2-0', '1-1', '', 'abc-def', 'abc-def', '',
    'ffffffff-ffff-4fff-8fff-ffffffffffff', '3-0', '2-9', null, '10-0', '9-0'];
  const studio = studioFactory().create(memoryStorage(), 'k');
  const widget = widgetFactory().create(memoryStorage(), 'k');
  const a = sequence.map(id => studio.accept(id));
  const b = sequence.map(id => widget.accept(id));
  assert.deepEqual(a, b, 'Studio- och OBS-implementationerna har glidit isär');
});

// ---- every entry point goes through the gate ----------------------------------------------------
test('historik, SSE och localStorage-routing passerar samma punkt', () => {
  const client = fs.readFileSync(path.join(ROOT, 'live-client.js'), 'utf8');
  assert.match(client, /VyraDedupe/, 'live-client.js använder inte dedupliceringen');
  // ingest() is the funnel: the SSE listener, the poll loop and the cross-tab storage route all
  // reach consumers through it, so the gate belongs there and nowhere else.
  const ingest = /function ingest\([^)]*\)\s*\{([\s\S]*?)\r?\n\}/.exec(client);
  assert.ok(ingest, 'hittade inte ingest()');
  assert.match(ingest[1], /accept\(/, 'ingest() släpper igenom event utan att fråga grinden');

  // live-leaderboard.js used to call record() straight from its own history fetch, bypassing
  // ingest() entirely. That path has to be gone, or the gate does not cover history.
  const leaderboard = fs.readFileSync(path.join(ROOT, 'live-leaderboard.js'), 'utf8');
  assert.ok(!/fetch\('\/api\/events\?after=0'\)[\s\S]{0,120}forEach\(record\)/.test(leaderboard),
    'live-leaderboard.js matar fortfarande record() direkt från historiken');

  // The cross-tab storage listener in media.js routes battle events to the widgets without going
  // near ingest(); it needs the same gate or a second tab replays them.
  const media = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
  const storageRoute = /addEventListener\('storage'[^\n]*routeLiveBattleEvent[^\n]*/.exec(media);
  if (storageRoute) {
    assert.match(storageRoute[0], /VyraDedupe|accept\(/,
      'storage-routingen i media.js går förbi dedupliceringen');
  }
});

test('den fristående OBS-sidan grindar sin egen ström', () => {
  // base-widget.js has its own EventSource and its own consumers; a gate that exists but is never
  // called there would leave every standalone widget double-counting on reconnect.
  const source = fs.readFileSync(path.join(ROOT, 'public/widgets/base-widget.js'), 'utf8');
  const listener = /addEventListener\('live'[\s\S]*?\n\s*\}\);/.exec(source);
  assert.ok(listener, 'hittade inte live-lyssnaren i base-widget.js');
  assert.match(listener[0], /gate\.accept\(/, 'live-lyssnaren släpper igenom event utan grind');
  assert.ok(listener[0].indexOf('gate.accept(') < listener[0].indexOf('onEvent'),
    'grinden körs efter att konsumenten redan fått eventet');
});

test('the SSE frame id is what gets deduplicated, with the event id as fallback', () => {
  // The server stamps every frame with its Redis stream id (server/index.js: `id: ${item.streamId}`)
  // and EventSource exposes it as message.lastEventId. That is the only id guaranteed to be unique
  // and ordered per workspace; event.id is the bridge's own key and is the fallback.
  for (const file of ['live-client.js', 'public/widgets/base-widget.js']) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(source, /lastEventId/, `${file} läser inte frame-ID:t`);
  }
});
