'use strict';
// goal-sse.js: what a goal frame is, and what may be written to a client.
//
// Pure — no Redis, no Postgres, no socket. Everything here is about shape, and shape is where the
// isolation rule is decided: sseChunk() is the ONLY thing that turns a message into bytes, so a
// frame that does not belong to the connection's overlay cannot reach res.write() by any path,
// live or replayed.
//
// Absolute, never delta: a frame carries the value the widget should show. An SSE client that
// missed a message must be able to recover from the next one alone, and a browser that applied an
// increment twice would drift with nothing to correct it.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

let G = null;
try { G = require(path.join(__dirname, '..', 'goal-sse.js')) } catch (_) { /* red below */ }

const OVERLAY_A = '11111111-aaaa-0000-0000-000000000000';
const OVERLAY_B = '22222222-bbbb-0000-0000-000000000000';
// Åtta fält sedan 2026-08-04, inte sju. Klienten ordnar sina ramar på `revision` och ingenting
// annat, och fältet fanns inte på serversidan — så varje ram efter den första kastades och
// målwidgeten frös på sitt första värde. Sju var alltså inte ett kontrakt som höll, det var buggen
// nedskriven som en assertion. tests/goal-contract.test.js kör numera båda sidorna som en kedja
// så att de två aldrig kan glida isär igen.
const FIELDS = ['overlayId', 'widgetId', 'metric', 'value', 'target', 'epoch', 'at', 'revision'];

const update = (over = {}) => ({
  overlayId: OVERLAY_A, widgetId: 'w-1', metric: 'follows',
  baseline: 100, progress: 5, target: 1000, epoch: 1, revision: '1',
  at: 1_700_000_000_000, ...over });

test('goal-sse.js finns', () => {
  assert.ok(G, 'server/goal-sse.js finns inte');
});

// ---- the frame -----------------------------------------------------------------------------------
test('en frame är absolut: value är baseline + progress, inte ökningen', () => {
  const frame = G.buildFrame(update({ baseline: 100, progress: 5 }));
  assert.equal(frame.value, 105);
});

test('en ren delta-uppdatering avvisas — den kan inte bli en absolut frame', () => {
  for (const bad of [{ overlayId: OVERLAY_A, widgetId: 'w-1', metric: 'follows', amount: 3, target: 10, epoch: 1 },
                     { overlayId: OVERLAY_A, widgetId: 'w-1', metric: 'follows', delta: 3, target: 10, epoch: 1 },
                     { overlayId: OVERLAY_A, widgetId: 'w-1', metric: 'follows', increment: 3, target: 10, epoch: 1 }]) {
    assert.equal(G.buildFrame(bad), null, `${JSON.stringify(bad)} byggde en frame`);
  }
});

test('value får anges direkt, och vinner inte över baseline+progress i smyg', () => {
  assert.equal(G.buildFrame({ overlayId: OVERLAY_A, widgetId: 'w-1', metric: 'likes',
    value: 42, target: 50, epoch: 2, revision: '1', at: 1 }).value, 42);
  // Both given and disagreeing is a caller bug, not something to guess about.
  assert.equal(G.buildFrame(update({ value: 999 })), null,
    'value och baseline+progress fick säga emot varandra');
});

test('framen innehåller exakt de åtta fälten, inget mer', () => {
  const frame = G.buildFrame(update());
  assert.deepEqual(Object.keys(frame).sort(), [...FIELDS].sort());
});

// ---- revision ------------------------------------------------------------------------------------
// Ordningsfältet. Det passerar som siffersträng hela vägen: kolumnen är bigint, och förbi 2^53
// rundas två skilda revisioner till samma double — jämför man dem som tal ser den nyare stale ut.
test('revision passerar som sträng, aldrig som tal', () => {
  const frame = G.buildFrame(update({ revision: '9007199254740993' }));
  assert.equal(typeof frame.revision, 'string');
  assert.equal(frame.revision, '9007199254740993');
  assert.match(JSON.stringify(frame), /"revision":"9007199254740993"/,
    'revision gick ut som JSON-tal och tappade precision på vägen');
});

test('ett heltal accepteras men normaliseras till sträng', () => {
  assert.equal(G.buildFrame(update({ revision: 12 })).revision, '12');
  assert.equal(G.buildFrame(update({ revision: '007' })).revision, '7',
    'inledande nollor gör jämförelsen på längd fel');
});

test('en uppdatering utan revision blir ingen frame', () => {
  const { revision, ...utan } = update();
  assert.equal(G.buildFrame(utan), null,
    'en frame utan ordningsfält kan inte placeras mot en annan — vägra, gissa inte');
});

test('en revision som inte är ett icke-negativt heltal blir ingen frame', () => {
  for (const bad of ['', '   ', 'abc', '-1', '1.5', '1e3', '0x10', null, true, [], {}, NaN, Infinity]) {
    assert.equal(G.buildFrame(update({ revision: bad })), null,
      `revision ${JSON.stringify(bad)} accepterades`);
  }
});

test('revision skrivs inte över av något annat fältnamn', () => {
  // snake_case finns inte för det här fältet — kolumnen heter redan revision i båda formerna.
  assert.equal(G.buildFrame(update({ revision: '5' })).revision, '5');
});

test('inget från uppdateringen läcker med — inte workspace, användare eller token', () => {
  const frame = G.buildFrame(update({
    workspaceId: '33333333-cccc-0000-0000-000000000000', userId: 'u-1', username: 'Streamer',
    email: 'någon@example.invalid', accessToken: 'hemlig-token', profileUrl: 'https://x/y.png',
    eventId: 'evt-1', tokenHash: 'abc' }));
  assert.deepEqual(Object.keys(frame).sort(), [...FIELDS].sort());
  const wire = JSON.stringify(frame);
  for (const secret of ['33333333', 'u-1', 'Streamer', 'example.invalid', 'hemlig-token',
                        'profileUrl', 'evt-1', 'abc']) {
    assert.ok(!wire.includes(secret), `${secret} följde med ut i framen`);
  }
});

// ---- normalisation -------------------------------------------------------------------------------
test('pg:s bigint-strängar blir tal', () => {
  const frame = G.buildFrame(update({ baseline: '100', progress: '5', target: '1000', epoch: '3' }));
  assert.strictEqual(frame.value, 105);
  assert.strictEqual(frame.target, 1000);
  assert.strictEqual(frame.epoch, 3);
  for (const field of ['value', 'target', 'epoch', 'at']) {
    assert.equal(typeof frame[field], 'number', `${field} är inte ett tal`);
  }
});

test('snake_case från en databasrad duger lika bra som camelCase', () => {
  const frame = G.buildFrame({ overlay_id: OVERLAY_A, widget_id: 'w-1', metric: 'gifts',
    baseline: 0, progress: 7, target: 10, epoch: 1, revision: '3', at: 5 });
  assert.equal(frame.overlayId, OVERLAY_A);
  assert.equal(frame.widgetId, 'w-1');
  assert.equal(frame.value, 7);
});

test('at fylls i när det saknas i stället för att fälla uppdateringen', () => {
  const before = Date.now();
  const frame = G.buildFrame(update({ at: undefined }));
  assert.ok(frame.at >= before && frame.at <= Date.now() + 1000, 'at blev inte en rimlig tidpunkt');
});

// ---- rejection -----------------------------------------------------------------------------------
test('ofullständiga och ogiltiga uppdateringar blir null, inte en halv frame', () => {
  const bad = {
    'utan overlayId': update({ overlayId: undefined }),
    'tomt overlayId': update({ overlayId: '   ' }),
    'utan widgetId': update({ widgetId: undefined }),
    'tomt widgetId': update({ widgetId: '' }),
    'okänd metrik': update({ metric: 'kramar' }),
    'metrik saknas': update({ metric: undefined }),
    'negativt värde': update({ baseline: 0, progress: -5 }),
    'target 0': update({ target: 0 }),
    'negativ target': update({ target: -10 }),
    'target NaN': update({ target: 'inte ett tal' }),
    'epoch 0': update({ epoch: 0 }),
    'epoch NaN': update({ epoch: 'x' }),
    'value NaN': { overlayId: OVERLAY_A, widgetId: 'w', metric: 'likes', value: 'x', target: 5, epoch: 1 },
    'inget alls': undefined,
    'inte ett objekt': 'follows',
    'array': [1, 2, 3]
  };
  for (const [name, input] of Object.entries(bad)) {
    assert.equal(G.buildFrame(input), null, `${name} gav en frame`);
  }
});

test('buildFrame kastar aldrig — en trasig rad får inte ta ner anropet', () => {
  for (const input of [null, undefined, 0, '', [], { overlayId: {} }, { get overlayId() { throw new Error('x') } }]) {
    assert.doesNotThrow(() => G.buildFrame(input));
  }
});

// ---- isolation -----------------------------------------------------------------------------------
test('visibleTo släpper bara igenom sitt eget overlay', () => {
  const frame = G.buildFrame(update({ overlayId: OVERLAY_A }));
  assert.equal(G.visibleTo(frame, OVERLAY_A), true);
  assert.equal(G.visibleTo(frame, OVERLAY_B), false);
});

test('en anslutning utan overlay ser inga frames alls', () => {
  const frame = G.buildFrame(update());
  for (const scope of [null, undefined, '', '   ']) {
    assert.equal(G.visibleTo(frame, scope), false, `scope ${JSON.stringify(scope)} fick en frame`);
  }
});

test('uuid-versaler avgör inte vem som ser vad', () => {
  const frame = G.buildFrame(update({ overlayId: OVERLAY_A.toUpperCase() }));
  assert.equal(G.visibleTo(frame, OVERLAY_A), true);
  assert.equal(G.visibleTo(frame, OVERLAY_B), false);
});

// ---- the write path ------------------------------------------------------------------------------
// sseChunk() is what openEventStream() writes. Anything it returns null for is never written at all.
test('ett rått event behåller sitt format och sin stream-id', () => {
  const item = { streamId: '1700000000000-0', event: { id: 'e1', type: 'gift', username: 'A' } };
  const chunk = G.sseChunk(item, OVERLAY_A);
  assert.equal(chunk, `id: ${item.streamId}\nevent: live\ndata: ${JSON.stringify(item.event)}\n\n`);
});

test('ett rått event är workspace-scopat: samma bytes oavsett overlay', () => {
  const item = { streamId: '1-0', event: { id: 'e1', type: 'follow', username: 'A' } };
  assert.equal(G.sseChunk(item, OVERLAY_A), G.sseChunk(item, OVERLAY_B));
  assert.ok(G.sseChunk(item, null), 'ett rått event stoppades av att anslutningen saknar overlay');
});

test('en goal-frame skrivs som event: goal, utan id-rad', () => {
  const frame = G.buildFrame(update());
  const chunk = G.sseChunk({ goal: frame }, OVERLAY_A);
  // No `id:` line: a frame is not replayable through Last-Event-ID, and giving it a stream id would
  // move the client's resume position to something xRange cannot find.
  assert.ok(!chunk.includes('id:'), 'framen bar en id-rad');
  assert.match(chunk, /^event: goal\ndata: /);
  assert.ok(chunk.endsWith('\n\n'));
  assert.deepEqual(Object.keys(JSON.parse(chunk.slice(chunk.indexOf('data: ') + 6))).sort(),
    [...FIELDS].sort());
});

test('en frame från ett annat overlay blir inga bytes alls', () => {
  const frame = G.buildFrame(update({ overlayId: OVERLAY_B }));
  assert.equal(G.sseChunk({ goal: frame }, OVERLAY_A), null);
});

test('sseChunk normaliserar om framen — extra fält på tråden kommer inte ut', () => {
  // A publisher that skipped buildFrame cannot smuggle a field through the write path.
  const chunk = G.sseChunk({ goal: { overlayId: OVERLAY_A, widgetId: 'w-1', metric: 'likes',
    value: 3, target: 10, epoch: 1, revision: '1', at: 5,
    workspaceId: 'hemligt', username: 'Streamer' } }, OVERLAY_A);
  assert.ok(!chunk.includes('hemligt') && !chunk.includes('Streamer'), 'extra fält skrevs ut');
  assert.deepEqual(Object.keys(JSON.parse(chunk.slice(chunk.indexOf('data: ') + 6))).sort(),
    [...FIELDS].sort());
});

test('en ogiltig frame på tråden skrivs inte, ens till sitt eget overlay', () => {
  for (const goal of [{ widgetId: 'w-1', metric: 'likes', value: 1, target: 2, epoch: 1 },
                      { overlayId: OVERLAY_A, metric: 'likes', value: 1, target: 2, epoch: 1 },
                      { overlayId: OVERLAY_A, widgetId: 'w-1', metric: 'kramar', value: 1, target: 2, epoch: 1 },
                      { overlayId: OVERLAY_A, widgetId: 'w-1', metric: 'likes', value: 1, target: 0, epoch: 1 }]) {
    assert.equal(G.sseChunk({ goal }, OVERLAY_A), null, `${JSON.stringify(goal)} skrevs ut`);
  }
});

test('okända kuvert skrivs inte — okänt betyder tyst, inte igenom', () => {
  for (const item of [{}, null, undefined, { streamId: '1-0' }, { goal: null },
                      { event: null }, { something: { overlayId: OVERLAY_A } }, 'text']) {
    assert.equal(G.sseChunk(item, OVERLAY_A), null, `${JSON.stringify(item)} skrevs ut`);
  }
});

// ---- publishing ----------------------------------------------------------------------------------
test('kuvertet skiljer en frame från ett rått event', () => {
  const frame = G.buildFrame(update());
  assert.deepEqual(G.frameEnvelope(frame), { goal: frame });
});

test('publish vägrar en ogiltig frame i stället för att lägga skräp på kanalen', async () => {
  const calls = [];
  const fakeBus = { channel: id => `vyra:live:${id}`,
    connect: async () => ({ publish: async (...args) => { calls.push(args); return 1 } }) };
  assert.equal(await G.publish(fakeBus, 'ws-1', { widgetId: 'w-1' }), false);
  assert.equal(calls.length, 0, 'en ogiltig frame publicerades ändå');

  assert.equal(await G.publish(fakeBus, 'ws-1', update()), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'vyra:live:ws-1', 'framen gick inte på workspace-kanalen');
  assert.deepEqual(Object.keys(JSON.parse(calls[0][1]).goal).sort(), [...FIELDS].sort());
});

// Both source checks below read the CODE, not the comments — a file that explains why it does not
// call xAdd must not fail for saying so.
const code = () => fs.readFileSync(path.join(__dirname, '..', 'goal-sse.js'), 'utf8')
  .split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n');

test('frames läggs aldrig i Redis-strömmen — de är inte återspelbara', () => {
  assert.ok(!/xAdd/.test(code()), 'goal-sse.js skriver till strömmen; en frame får bara publiceras');
});

// ---- logging -------------------------------------------------------------------------------------
test('goal-sse.js loggar ingenting', () => {
  // The module sees overlay ids, widget ids and access-scoped values on every event. The cheapest
  // way to guarantee none of it reaches a log line is for the file to have no logging at all.
  assert.ok(!/console\./.test(code()), 'goal-sse.js loggar — inget här får nå en loggrad');
});
