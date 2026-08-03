'use strict';
// The order of the ingest path, and what happens when a step fails.
//
// Five things happen per event and the order is the design, not an implementation detail:
//
//   1. normalise ONCE — the same event object, with the same id, goes to Postgres and to Redis
//   2. applyEvent() — progress is committed before anything is announced
//   3. eventBus.publish() — the raw event, unchanged contract
//   4. goal frames, for the updates applyEvent actually returned
//   5. metrics and lastTikTokEventAt — the caller's job, on the raw result only
//
// Postgres first because an event that was announced but not counted is invisible: a widget shows a
// number nothing backs, and no retry will fix it because the publish already succeeded. Counted but
// not announced is recoverable — the claim is idempotent, so a retry publishes without counting
// twice, which is exactly what the retry tests below pin down.
//
// Pure: every dependency is injected, and the only real one is cleanEvent — the actual function from
// event-bus.js, wrapped in a counter. Using the real one is the point. A second normalisation here
// would be a second definition of what an event is, and the id it produces is what Postgres claims
// and Redis dedupes on; they have to be the same string or the whole idempotency story is fiction.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const { cleanEvent } = require('../event-bus');

let Ingest = null;
try { Ingest = require(path.join(__dirname, '..', 'goal-ingest.js')) } catch (_) { /* red below */ }

const WS = 'ws-1';
const PAYLOAD = { id: 'evt-1', type: 'follow', username: 'Alice', userId: 'u-1',
  profileUrl: 'https://x/y.png', count: 1 };

const row = (over = {}) => ({ overlay_id: 'o-1', widget_id: 'w-1', metric: 'follows',
  baseline: '10', progress: '3', target: '100', epoch: 1, ...over });

// One harness, so each test only says what is different about it.
function harness(over = {}) {
  const calls = [], frames = [], logs = [], seen = {};
  const applied = over.applied || { applied: true, updatedGoals: 1, epoch: 1, rows: [row()] };
  const raw = over.raw || { duplicate: false, streamId: '1-0' };

  const deps = {
    pool: { marker: 'pool' },
    eventBus: {
      marker: 'bus',
      publish: async (workspaceId, event) => {
        calls.push('raw');
        seen.raw = { workspaceId, event };
        if (over.rawError) throw over.rawError;
        return { ...raw, event };
      }
    },
    goalRuntime: {
      applyEvent: async (pool, workspaceId, event) => {
        calls.push('apply');
        seen.apply = { pool, workspaceId, event };
        if (over.applyError) throw over.applyError;
        return applied;
      }
    },
    goalSse: {
      publish: async (bus, workspaceId, update) => {
        calls.push('frame');
        frames.push({ bus, workspaceId, update });
        if (over.frameError) throw over.frameError;
        return true;
      }
    },
    cleanEvent: payload => { calls.push('clean'); return cleanEvent(payload) },
    log: line => logs.push(line)
  };
  return { deps, calls, frames, logs, seen, ingest: Ingest && Ingest.createEventIngest(deps) };
}

test('goal-ingest.js finns och exporterar en fabrik', () => {
  assert.ok(Ingest, 'server/goal-ingest.js finns inte');
  assert.equal(typeof Ingest.createEventIngest, 'function');
});

test('eventet normaliseras en gång, och exakt samma objekt går till Postgres och Redis', async () => {
  const h = harness();
  await h.ingest(WS, PAYLOAD);
  assert.equal(h.calls.filter(c => c === 'clean').length, 1, 'cleanEvent kördes inte exakt en gång');
  assert.ok(h.seen.apply.event, 'applyEvent fick inget event');
  // Identity, not deep equality: two objects that happen to look alike today would drift apart the
  // first time normalisation changed on one side only.
  assert.equal(h.seen.apply.event, h.seen.raw.event, 'Postgres och Redis fick olika objekt');
  assert.equal(h.seen.apply.event.id, 'evt-1', 'event-id:t är inte det stabila id:t');
  assert.equal(h.seen.apply.workspaceId, WS);
  assert.equal(h.seen.raw.workspaceId, WS);
  assert.equal(h.seen.apply.pool, h.deps.pool);
});

test('ordningen är Postgres, sedan rått event, sedan frames', async () => {
  const h = harness();
  await h.ingest(WS, PAYLOAD);
  assert.deepEqual(h.calls, ['clean', 'apply', 'raw', 'frame']);
});

test('det råa resultatet returneras oförändrat till anroparen', async () => {
  // metrics.event() and lastTikTokEventAt follow the raw contract, and that decision stays with the
  // caller — this module only has to hand the raw result back untouched.
  const h = harness({ raw: { duplicate: false, streamId: '7-0' } });
  const out = await h.ingest(WS, PAYLOAD);
  assert.equal(out.raw.streamId, '7-0');
  assert.equal(out.raw.duplicate, false);
  assert.equal(out.raw.event, h.seen.raw.event);
  assert.equal(out.applied.applied, true);
});

// ---- failures --------------------------------------------------------------------------------------
test('ett Postgresfel före commit stoppar allt: inget rått event, ingen frame', async () => {
  const h = harness({ applyError: Object.assign(new Error('deadlock detected'), { code: '40P01' }) });
  await assert.rejects(() => h.ingest(WS, PAYLOAD), /deadlock/);
  assert.deepEqual(h.calls, ['clean', 'apply'], 'något publicerades efter ett DB-fel');
  assert.equal(h.frames.length, 0);
});

test('ett Postgresfel bär ingen status — anroparen ska ge 500, inte 4xx', async () => {
  const h = harness({ applyError: new Error('connection terminated') });
  await h.ingest(WS, PAYLOAD).then(() => assert.fail('borde ha kastat'), error => {
    assert.equal(error.status, undefined, 'ett DB-fel maskerades som ett klientfel');
  });
});

test('ett fel i den råa publiceringen efter commit kastas vidare, utan frames', async () => {
  // The progress is committed and the retry will not double it, so the honest answer is 500: the
  // bridge should send this event again.
  const h = harness({ rawError: new Error('redis unavailable') });
  await assert.rejects(() => h.ingest(WS, PAYLOAD), /redis unavailable/);
  assert.deepEqual(h.calls, ['clean', 'apply', 'raw']);
  assert.equal(h.frames.length, 0, 'en frame publicerades trots att det råa eventet aldrig kom ut');
});

test('ett omtag efter det: Postgres säger applied:false, det råa eventet publiceras ändå', async () => {
  const h = harness({ applied: { applied: false, updatedGoals: 0, epoch: null, rows: [] } });
  const out = await h.ingest(WS, PAYLOAD);
  assert.deepEqual(h.calls, ['clean', 'apply', 'raw'], 'omtaget räknade eller ramade om eventet');
  assert.equal(out.raw.duplicate, false, 'det råa eventet kom inte ut i omtaget');
  assert.equal(h.frames.length, 0);
});

test('Postgres applicerade men Redis kallar det dublett: den riktiga framen publiceras ändå', async () => {
  // The two dedupes are independent. Redis can already hold the id — a partial earlier attempt, a
  // replay — while this is the transaction that actually moved the number. The widget must be told.
  const h = harness({ raw: { duplicate: true, streamId: null } });
  const out = await h.ingest(WS, PAYLOAD);
  assert.equal(out.raw.duplicate, true);
  assert.equal(h.frames.length, 1, 'framen tappades för att det råa eventet var en dublett');
  assert.equal(h.frames[0].update.widget_id, 'w-1');
});

test('en helt redan applicerad dublett ger ingen frame alls', async () => {
  const h = harness({ applied: { applied: false, updatedGoals: 0, epoch: null, rows: [] },
    raw: { duplicate: true, streamId: null } });
  await h.ingest(WS, PAYLOAD);
  assert.equal(h.frames.length, 0, 'en dublett publicerade en frame');
});

test('ett event som inget mål räknar lämnar den råa vägen exakt som den var', async () => {
  const h = harness({ applied: { applied: false, updatedGoals: 0, epoch: null, rows: [] } });
  const out = await h.ingest(WS, PAYLOAD);
  assert.equal(h.seen.raw.event, h.seen.apply.event, 'det råa eventet ändrades av målvägen');
  assert.equal(out.raw.streamId, '1-0');
  assert.equal(h.frames.length, 0);
});

// ---- frames ---------------------------------------------------------------------------------------
test('framen byggs absolut ur raden som faktiskt uppdaterades', async () => {
  const h = harness();
  await h.ingest(WS, PAYLOAD);
  const { update, workspaceId, bus } = h.frames[0];
  assert.equal(workspaceId, WS);
  assert.equal(bus, h.deps.eventBus, 'framen publicerades på något annat än event-bussen');
  // baseline and progress both present: the frame is the value after the increment, not the increment.
  assert.equal(update.baseline, '10');
  assert.equal(update.progress, '3');
  assert.equal(update.target, '100');
  assert.equal(update.epoch, 1);
  assert.equal(update.overlay_id, 'o-1');
  assert.equal(update.at, h.seen.apply.event.at, 'framen bär inte eventets tidpunkt');
  assert.equal(update.amount, undefined, 'framen bär ett delta');
  assert.equal(update.delta, undefined);
});

test('ett gift ger en frame per uppdaterad widget', async () => {
  const h = harness({ applied: { applied: true, updatedGoals: 2, epoch: 1, rows: [
    row({ widget_id: 'w-gifts', metric: 'gifts', progress: '8' }),
    row({ widget_id: 'w-diamonds', metric: 'diamonds', progress: '80' })] } });
  await h.ingest(WS, { id: 'evt-2', type: 'gift', username: 'Alice', count: 8, value: 80 });
  assert.deepEqual(h.frames.map(f => f.update.widget_id), ['w-gifts', 'w-diamonds']);
  assert.deepEqual(h.frames.map(f => f.update.metric), ['gifts', 'diamonds']);
});

test('applied utan rader publicerar ingenting', async () => {
  const h = harness({ applied: { applied: true, updatedGoals: 0, epoch: null, rows: [] } });
  await h.ingest(WS, PAYLOAD);
  assert.equal(h.frames.length, 0);
});

// ---- frame failures --------------------------------------------------------------------------------
test('ett frame-fel fäller inte anropet — DB och HTTP-svaret står kvar', async () => {
  const h = harness({ frameError: new Error('redis publish failed') });
  const out = await h.ingest(WS, PAYLOAD);
  assert.equal(out.raw.duplicate, false, 'det råa svaret ändrades av ett frame-fel');
  assert.equal(out.applied.applied, true, 'DB-utfallet ändrades av ett frame-fel');
  assert.equal(out.frames, 0, 'en misslyckad frame räknades som publicerad');
});

test('en trasig frame stoppar inte de andra', async () => {
  let first = true;
  const h = harness();
  h.deps.goalSse.publish = async (bus, workspaceId, update) => {
    h.calls.push('frame');
    h.frames.push({ bus, workspaceId, update });
    if (first) { first = false; throw new Error('första framen dog') }
    return true;
  };
  const ingest = Ingest.createEventIngest(h.deps);
  const out = await ingest(WS, { id: 'evt-3', type: 'gift', username: 'A', count: 1, value: 1 });
  assert.equal(h.frames.length, 1, 'den andra framen försökte aldrig');
  assert.equal(out.frames, 0);
});

test('frame-felet loggas utan token, payload eller identitet', async () => {
  const h = harness({ frameError: new Error('redis publish failed') });
  await h.ingest('11111111-2222-3333-4444-555555555555',
    { id: 'evt-hemligt', type: 'gift', username: 'Streamer', userId: 'u-42',
      profileUrl: 'https://cdn/avatar-42.png', comment: 'hej alla', count: 1, value: 5 });

  assert.equal(h.logs.length, 1, 'felet loggades inte, eller loggades flera gånger');
  const line = h.logs[0];
  for (const secret of ['Streamer', 'u-42', 'avatar-42', 'hej alla', 'evt-hemligt',
                        '11111111-2222-3333-4444-555555555555', 'w-1', 'o-1']) {
    assert.ok(!line.includes(secret), `${secret} hamnade i loggen`);
  }
  // It still has to be useful: a machine-readable line naming what failed and how much.
  const parsed = JSON.parse(line);
  assert.equal(parsed.level, 'error');
  assert.equal(parsed.event, 'goal_frame_publish_failed');
  assert.equal(parsed.failed, 1);
  assert.equal(parsed.frames, 1);
  assert.match(parsed.message, /redis publish failed/);
  assert.ok(parsed.at, 'loggraden saknar tidpunkt');
});

test('utan injicerad logger går felraden till console.error vid anropet', async () => {
  // Not to whatever console.error was when the ingest was created: a snapshot taken at construction
  // ignores every transport installed later, and it is why the first CI run of the chain test saw
  // the frame failure reach the real stderr instead of the capture it had just installed.
  const h = harness({ frameError: new Error('redis publish failed') });
  delete h.deps.log;
  const ingest = Ingest.createEventIngest(h.deps);

  const lines = [], real = console.error;
  console.error = line => lines.push(String(line));
  try { await ingest(WS, PAYLOAD) } finally { console.error = real }

  assert.equal(lines.length, 1, 'standardloggern nådde inte console.error');
  assert.match(lines[0], /goal_frame_publish_failed/);
});

test('inget annat loggas när allt går bra', async () => {
  const h = harness();
  await h.ingest(WS, PAYLOAD);
  assert.deepEqual(h.logs, [], 'den lyckade vägen loggar');
});
