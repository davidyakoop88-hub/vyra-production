'use strict';
// Kontraktet mellan servern och klienten, körd som EN kedja i stället för två.
//
// Varje sida var grön för sig och ändå trasig ihop: server/goal-sse.js låste fast att ramen har
// exakt sju fält, tests/goal-client.test.js byggde sina egna ramar med revision inbakat, och
// goal-client.js ordnar på revision och ingenting annat. Ingen av sviterna kunde se att fältet
// aldrig lämnade servern — och i produktion hade varje målwidget frusit på sitt första värde.
//
// Därför går det här testet hela vägen med RIKTIG kod på båda sidor och inget påhittat däremellan:
//
//   rad ur goal_runtime (som pg lämnar den, bigint som sträng)
//     -> server/goal-sse.js buildFrame()
//     -> frameEnvelope()            (det som läggs på Redis-kanalen)
//     -> sseChunk()                 (de exakta bytes en EventSource tar emot)
//     -> goal-client.js 'goal'-lyssnare
//     -> runtime.read()
//
// Samma sak för snapshotvägen, som går genom goalItem() i stället.
//
// RÖTT NU: revision finns inte i en enda fil under server/.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const Sse = require(path.join(ROOT, 'server', 'goal-sse'));
const GoalRuntime = require(path.join(ROOT, 'server', 'goal-runtime'));
const Goals = require(path.join(ROOT, 'goal-client.js'));

const OVERLAY = '11111111-1111-1111-1111-111111111111';
const AT = 1_700_000_000_000;

// En rad precis som node-postgres lämnar den: bigint kommer tillbaka som sträng, aldrig som Number.
// Det är hela anledningen till att revision kan bära ett värde som inte får plats i en double.
const row = (over = {}) => ({
  overlay_id: OVERLAY, widget_id: 'w1', metric: 'follows',
  baseline: '100', progress: '5', target: '1000', epoch: '1', revision: '1',
  updated_at: new Date(AT), ...over
});

// Rad -> exakt den sträng som står efter "data: " i SSE-ramen. null om servern vägrar bygga den.
function wire(source) {
  const frame = Sse.buildFrame({ ...source, at: AT });
  if (!frame) return null;
  const chunk = Sse.sseChunk(Sse.frameEnvelope(frame), OVERLAY);
  if (!chunk) return null;
  const start = chunk.indexOf('data: ') + 6;
  return chunk.slice(start, chunk.indexOf('\n\n', start));
}

// Klienten med riktiga beroenden stubbade — men datan som kommer in är serverns egna bytes.
function client(snapshot = []) {
  const rafQueue = [];
  const source = {
    handlers: new Map(), closed: false,
    addEventListener(name, fn) { source.handlers.set(name, [...(source.handlers.get(name) || []), fn]) },
    removeEventListener(name, fn) {
      source.handlers.set(name, (source.handlers.get(name) || []).filter(f => f !== fn));
    },
    close() { source.closed = true },
    // Rå sträng vidare, INTE JSON.stringify: det är serverns serialisering som ska provas.
    send(data) { for (const fn of source.handlers.get('goal') || []) fn({ data }) }
  };
  const runtime = Goals.createGoalRuntime({
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, goals: snapshot }) }),
    EventSource: function () { return source },
    requestAnimationFrame: fn => rafQueue.push(fn),
    cancelAnimationFrame: () => {},
    save: () => { throw new Error('kontraktstestet får aldrig spara') },
    render: () => { throw new Error('kontraktstestet får aldrig rendera') },
    storage: { setItem: () => { throw new Error('kontraktstestet får aldrig skriva localStorage') },
      getItem: () => null, removeItem: () => {} },
    dispatch: () => {}, now: () => AT
  });
  const flush = () => rafQueue.splice(0).forEach(fn => fn(0));
  const attach = () => runtime.attachSource(source,
    { owned: false, overlayId: OVERLAY, scope: { mode: 'token', token: 'obs-token' } });
  return { runtime, source, flush, attach };
}

// ---- ramen bär fältet ---------------------------------------------------------------------------
test('serverns ram innehåller revision', () => {
  const frame = Sse.buildFrame({ ...row(), at: AT });
  assert.ok(frame, 'buildFrame vägrade en fullständig rad');
  assert.ok('revision' in frame, 'ramen saknar revision — klienten kan inte ordna den mot något');
});

test('FIELDS och den byggda ramen är samma uppsättning', () => {
  const frame = Sse.buildFrame({ ...row(), at: AT });
  assert.deepEqual(Object.keys(frame).sort(), [...Sse.FIELDS].sort());
  assert.ok(Sse.FIELDS.includes('revision'), 'revision saknas i FIELDS');
});

// ---- själva buggen ------------------------------------------------------------------------------
test('en andra ram med högre revision uppdaterar värdet', async () => {
  const c = client();
  await c.attach();

  c.source.send(wire(row({ progress: '5' })));                    // revision 1 -> värde 105
  c.flush();
  assert.equal(c.runtime.read('w1').value, 105);

  c.source.send(wire(row({ progress: '12', revision: '2' })));    // revision 2 -> värde 112
  c.flush();
  assert.equal(c.runtime.read('w1').value, 112,
    'andra ramen kastades — widgeten fryser på sitt första värde i produktion');
});

test('en äldre revision skriver inte över en nyare', async () => {
  const c = client();
  await c.attach();

  c.source.send(wire(row({ progress: '12', revision: '9' })));
  c.flush();
  c.source.send(wire(row({ progress: '5', revision: '4' })));
  c.flush();
  assert.equal(c.runtime.read('w1').value, 112, 'en sen, gammal ram tog över');
});

// ---- bigint över gränsen ------------------------------------------------------------------------
test('revision förbi 2^53 ordnas rätt hela vägen', async () => {
  // De två minsta heltal som kollapsar till samma double: Number(a) === Number(b).
  const a = '9007199254740992', b = '9007199254740993';
  assert.equal(Number(a), Number(b), 'fixturen bevisar inget om de inte kollapsar som Number');

  const c = client();
  await c.attach();
  c.source.send(wire(row({ progress: '5', revision: a })));
  c.flush();
  c.source.send(wire(row({ progress: '12', revision: b })));
  c.flush();
  assert.equal(c.runtime.read('w1').value, 112,
    'revision jämförs som tal någonstans i kedjan — de två versionerna ser lika ut');
});

test('revision serialiseras som sträng, inte som tal', () => {
  const data = wire(row({ revision: '9007199254740993' }));
  assert.match(data, /"revision":"9007199254740993"/,
    'revision gick på tråden som JSON-tal och tappade precision');
  assert.equal(JSON.parse(data).revision, '9007199254740993');
});

// ---- fail-closed --------------------------------------------------------------------------------
test('en rad utan revision blir ingen ram', () => {
  const { revision, ...utan } = row();
  assert.equal(Sse.buildFrame({ ...utan, at: AT }), null,
    'en ram utan revision går inte att ordna — den ska vägras, inte gissas');
});

test('en revision som inte är siffror blir ingen ram', () => {
  for (const bad of ['', ' ', 'abc', '-1', '1.5', '1e3', null, true, [], {}]) {
    assert.equal(Sse.buildFrame({ ...row({ revision: bad }), at: AT }), null,
      `revision ${JSON.stringify(bad)} accepterades`);
  }
});

// ---- snapshotvägen ------------------------------------------------------------------------------
test('goalItem bär revision som sträng', () => {
  const item = GoalRuntime.goalItem(row({ revision: '9007199254740993' }));
  assert.equal(item.revision, '9007199254740993');
  assert.equal(typeof item.revision, 'string', 'revision konverterades till Number');
});

test('snapshotet och strömmen ordnas mot varandra', async () => {
  // GET svarar med goalItem-formen; en ström-ram med högre revision ska ta över, och en med lägre
  // ska inte. Det är den enda platsen där de två serialiseringarna möts.
  const snapshot = [GoalRuntime.goalItem(row({ progress: '5', revision: '7' }))];
  const c = client(snapshot);
  await c.attach();
  assert.equal(c.runtime.read('w1').value, 105, 'snapshotet lästes inte in');

  c.source.send(wire(row({ progress: '4', revision: '6' })));
  c.flush();
  assert.equal(c.runtime.read('w1').value, 105, 'en ram äldre än snapshotet togs emot');

  c.source.send(wire(row({ progress: '20', revision: '8' })));
  c.flush();
  assert.equal(c.runtime.read('w1').value, 120, 'en ram nyare än snapshotet kastades');
});
