'use strict';
// The state owner's core contract: one permanent active-state object, neutral until verified, and a
// write path that can never leave a half-applied edit behind.
//
// Every dependency is injected — storage, lock manager, id source, clock, event sink — because the
// claims here are about ordering and ownership between two browser tabs, and a harness that cannot
// run two owners against one storage cannot falsify any of them.
//
// RED BY CONSTRUCTION: session-state.js does not exist yet.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const H = require('./helpers/session-harness.js');

let Session = null;
try { Session = require(path.join(__dirname, '..', 'session-state.js')) } catch (_) { /* red below */ }

const WS_A = 'aaaa-workspace', OV_A = 'aaaa-overlay';
const WS_B = 'bbbb-workspace', OV_B = 'bbbb-overlay';

function setup({ storage = H.createStorage(), locks = H.createLockManager(), tabId = 'tab-1' } = {}) {
  const events = [];
  const owner = H.createOwner(Session.createSessionState, { storage, locks, tabId,
    extras: { dispatch: (name, detail) => events.push({ name, detail }) } });
  return { owner, storage, locks, events };
}

// Brings an owner to studio-committed with the given account's data.
async function commitStudio(owner, account, ws, ov) {
  const token = owner.beginProjection();
  return owner.projectActive(token, { mode: 'studio-committed', workspaceId: ws, overlayId: ov,
    state: H.layout(account), extras: H.extrasFor(account) });
}

test('session-state.js finns och exporterar createSessionState', () => {
  assert.ok(Session, 'session-state.js finns inte');
  assert.equal(typeof Session.createSessionState, 'function');
});

// ---- neutral före verifiering ---------------------------------------------------------------------
test('boot är neutralt även när storage är full av ett annat kontos data', () => {
  const storage = H.createStorage({ 'vyra-state': JSON.stringify(H.layout('A')),
    ...H.extrasFor('A'),
    'vyra-session-projection': JSON.stringify({ status: 'committed', tabId: 'gammal',
      projectionId: 'p-A', generation: 7, owner: { mode: 'studio-committed', workspaceId: WS_A,
        overlayId: OV_A }, version: 3, at: 1 }) });
  const { owner } = setup({ storage });

  assert.equal(owner.mode(), 'boot-neutral');
  assert.deepEqual(owner.activeState().widgets, [], 'A:s widgets exponerades före verifiering');
  assert.equal(owner.activeState().user, 'Streamer');
  assert.equal(owner.committedProjection(), null);
});

test('neutralState saknar demowidgets, onboardingState har dem', () => {
  const { owner } = setup();
  assert.deepEqual(owner.neutralState().widgets, []);
  assert.ok(owner.onboardingState().widgets.length > 0,
    'onboarding utan demowidgets — då är de två factories omöjliga att skilja åt');
  assert.notEqual(owner.neutralState(), owner.activeState(),
    'neutralState returnerade den aktiva referensen; den måste vara en ny kopia');
});

// ---- den permanenta referensen --------------------------------------------------------------------
test('activeState() returnerar alltid samma objektreferens', async () => {
  const { owner } = setup();
  const ref = owner.activeState();
  assert.equal(owner.activeState(), ref);

  await commitStudio(owner, 'B', WS_B, OV_B);
  assert.equal(owner.activeState(), ref, 'projektionen bytte referens under studio.js fötter');
  assert.equal(ref.user, 'B', 'referensen uppdaterades inte in-place');
  assert.equal(ref.widgets[0].id, 'B-w1');
});

test('referensen överlever också neutralisering och fail-closed', async () => {
  const { owner } = setup();
  const ref = owner.activeState();
  await commitStudio(owner, 'A', WS_A, OV_A);
  await owner.beginLogout();
  assert.equal(owner.activeState(), ref);
  assert.deepEqual(ref.widgets, [], 'A:s widgets låg kvar i den aktiva referensen efter logout');
});

// ---- generationskontraktet -------------------------------------------------------------------------
test('beginProjection höjer generationen och ger unika id', () => {
  const { owner } = setup();
  const first = owner.beginProjection(), second = owner.beginProjection();
  assert.notEqual(first.projectionId, second.projectionId);
  assert.ok(second.generation > first.generation);
  assert.equal(owner.isCurrent(first), false, 'den äldre token var fortfarande giltig');
  assert.equal(owner.isCurrent(second), true);
});

test('en förbrukad token får varken skriva eller dispatcha', async () => {
  const { owner, storage, events } = setup();
  const stale = owner.beginProjection();
  owner.beginProjection();
  storage.resetWrites();
  const out = await owner.projectActive(stale, { mode: 'studio-committed', workspaceId: WS_A,
    overlayId: OV_A, state: H.layout('A'), extras: H.extrasFor('A') });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'stale-token');
  assert.deepEqual(storage.writes, [], 'en förbrukad projektion skrev till storage');
  assert.deepEqual(events.filter(e => e.name === 'vyra-session-state'), []);
});

// ---- markören ---------------------------------------------------------------------------------------
test('markören skrivs preparing före nycklarna och committed sist', async () => {
  const { owner, storage } = setup();
  storage.resetWrites();
  await commitStudio(owner, 'A', WS_A, OV_A);
  const keys = storage.writes.map(([, key]) => key);
  assert.equal(keys[0], 'vyra-session-projection', 'markören skrevs inte först');
  assert.equal(keys[keys.length - 1], 'vyra-session-projection', 'markören committades inte sist');
  const marker = JSON.parse(storage.getItem('vyra-session-projection'));
  assert.equal(marker.status, 'committed');
  assert.equal(marker.owner.workspaceId, WS_A);
  assert.equal(marker.tabId, 'tab-1');
  assert.ok(marker.projectionId, 'markören saknar projectionId');
});

test('ready-eventet kommer först efter komplett commit', async () => {
  const { owner, events } = setup();
  await commitStudio(owner, 'A', WS_A, OV_A);
  const ready = events.filter(e => e.name === 'vyra-session-state');
  assert.equal(ready.length, 1);
  assert.equal(ready[0].detail.mode, 'studio-committed');
});

// ---- writeActive: behörighet ------------------------------------------------------------------------
test('writeActive avvisas i varje läge utom aktuell studio-committed', async () => {
  const { owner, storage } = setup();
  storage.resetWrites();
  const blocked = await owner.writeActive('vyra-state', JSON.stringify(H.layout('X')));
  assert.equal(blocked.ok, false, 'boot-neutral tillät en skrivning');
  assert.deepEqual(storage.writes, []);

  await commitStudio(owner, 'A', WS_A, OV_A);
  const allowed = await owner.writeActive('vyra-state',
    JSON.stringify(H.layout('A', { user: 'A2' })));
  assert.equal(allowed.ok, true, 'en committad Studio-session fick inte skriva');
  assert.equal(owner.activeState().user, 'A2', 'writeActive uppdaterade inte den aktiva referensen');
});

test('overlay-token och logout tillåter aldrig writeActive', async () => {
  const { owner } = setup();
  await owner.projectReadonlyOverlay({ state: H.layout('token'), extras: H.extrasFor('token') });
  assert.equal((await owner.writeActive('vyra-state', '{}')).ok, false);

  const fresh = setup();
  await commitStudio(fresh.owner, 'A', WS_A, OV_A);
  await fresh.owner.beginLogout();
  assert.equal((await fresh.owner.writeActive('vyra-state', '{}')).ok, false);
});

// ---- BINDANDE TILLÄGG 1: in-memory återställning ----------------------------------------------------
test('lokalt skrivfel återställer activeStateObject in-place till committad state', async () => {
  const { owner, storage } = setup();
  await commitStudio(owner, 'A', WS_A, OV_A);
  const ref = owner.activeState();
  const committedUser = ref.user;

  // Så gör UI:t idag: muterar widgetobjektet först, sparar sedan.
  ref.widgets[0].x = 999;
  ref.user = 'osparad';
  storage.failOnWrite(2);
  const out = await owner.writeActive('vyra-state', JSON.stringify(ref));
  storage.clearFailure();

  assert.equal(out.ok, false);
  assert.equal(out.reason, 'storage-error');
  assert.equal(owner.activeState(), ref, 'referensen byttes under återställningen');
  assert.equal(ref.user, committedUser, 'den osparade mutationen blev kvar i minnet');
  assert.equal(ref.widgets[0].x, 10, 'widgetkoordinaten återställdes inte');
});

test('ett transient skrivfel lämnar varken markör eller nyckel halvskriven', async () => {
  // failOnceOnWrite: bara den andra skrivningen kastar. En storage som permanent vägrar kan per
  // definition inte återställas, och den världen mäts av fail-closed-testerna längre ned i stället.
  const { owner, storage } = setup();
  await commitStudio(owner, 'A', WS_A, OV_A);
  const before = storage.snapshot();
  storage.failOnceOnWrite(2);
  await owner.writeActive('vyra-state', JSON.stringify(H.layout('A', { user: 'trasig' })));
  storage.clearFailure();
  assert.deepEqual(storage.snapshot(), before, 'storage skiljer sig efter en misslyckad skrivning');
});

// ---- de två felaktiga vilolägena är inte samma sak ------------------------------------------------
test('rollbackfel ger studio-readonly-error med senast committade state kvar', async () => {
  const { owner, storage, events } = setup();
  await commitStudio(owner, 'A', WS_A, OV_A);
  const ref = owner.activeState();
  ref.user = 'osparad';
  storage.failOnWrite(2);                       // permanent: även återställningen vägrar
  const out = await owner.writeActive('vyra-state', JSON.stringify(ref));
  storage.clearFailure();

  assert.equal(out.ok, false);
  assert.equal(owner.mode(), 'studio-readonly-error',
    'ett vanligt rollbackfel maskerades som fail-closed');
  assert.equal(ref.user, 'A', 'senast committade Studio-state visas inte');
  assert.equal(ref.widgets[0].id, 'A-w1');

  assert.equal((await owner.writeActive('vyra-state', '{}')).ok, false, 'skrivning tilläts');
  assert.equal(owner.canQueue(), false);
  assert.equal(owner.canPush(), false);
  assert.equal(owner.canBackup(), false);
  assert.equal(owner.canOpenGoalStream(), true,
    'Goal-SSE stängdes trots att snapshoten fortfarande är verifierad');

  const notice = events.find(e => e.name === 'vyra-session-state-error');
  assert.ok(notice, 'ingen fast feltext dispatchades');
  assert.ok(!JSON.stringify(notice.detail).includes('A-w1'), 'statevärden läckte i feltexten');
});

test('logoutens fail-closed är minimal neutral, inte senast committade state', async () => {
  const { owner, storage } = setup();
  await commitStudio(owner, 'A', WS_A, OV_A);
  storage.failOnWrite(1);
  await owner.beginLogout();
  storage.clearFailure();

  assert.equal(owner.mode(), 'fail-closed');
  assert.deepEqual(owner.activeState().widgets, [], 'kontodata låg kvar i fail-closed');
  assert.equal(owner.activeState().user, 'Streamer');
  assert.equal(owner.canOpenGoalStream(), false, 'Goal-SSE fick öppnas i fail-closed');
});

test('en orelaterad render efter misslyckad save kan inte återuppliva värdet', async () => {
  const { owner, storage } = setup();
  await commitStudio(owner, 'A', WS_A, OV_A);
  const ref = owner.activeState();
  ref.user = 'spöke';
  storage.failOnWrite(2);
  await owner.writeActive('vyra-state', JSON.stringify(ref));
  storage.clearFailure();
  assert.equal(owner.activeState().user, 'A');
  assert.equal(JSON.parse(storage.getItem('vyra-state')).user, 'A');
});

// ---- cacher -----------------------------------------------------------------------------------------
test('registrerade cacher laddas om vid varje projektion, med de nya värdena', async () => {
  const { owner } = setup();
  const seen = [];
  owner.registerCache('vyra-extras', value => seen.push(value));
  await commitStudio(owner, 'A', WS_A, OV_A);
  assert.equal(seen.length, 1, 'cachen laddades inte om vid projektionen');
  assert.match(seen[0], /!A/);

  await owner.beginLogout();
  assert.equal(seen.length, 2, 'cachen laddades inte om vid neutralisering');
  assert.equal(seen[1], null, 'cachen fick inte veta att nyckeln rensats');
});

test('en cache som kastar rullar tillbaka hela projektionen', async () => {
  const { owner, storage, events } = setup();
  await commitStudio(owner, 'A', WS_A, OV_A);
  const before = storage.snapshot();
  owner.registerCache('vyra-extras', () => { throw new Error('trasig cache') });

  const token = owner.beginProjection();
  const out = await owner.projectActive(token, { mode: 'studio-committed', workspaceId: WS_A,
    overlayId: OV_A, state: H.layout('A2'), extras: H.extrasFor('A2') });

  assert.equal(out.ok, false);
  assert.deepEqual(storage.snapshot(), before, 'en halv projektion blev kvar efter cachefel');
  assert.equal(owner.activeState().user, 'A', 'minnet behöll den misslyckade projektionen');
  assert.equal(events.filter(e => e.name === 'vyra-session-state').length, 1,
    'ett ready-event dispatchades trots cachefel');
});

// ---- logout ------------------------------------------------------------------------------------------
test('logout dispatchar alltid vyra-session-ended, även när backup kastar', async () => {
  const { owner, events } = setup();
  await commitStudio(owner, 'A', WS_A, OV_A);
  owner.registerTeardown('trasig-backup', () => { throw new Error('backupfel') });
  await owner.beginLogout();

  const ended = events.filter(e => e.name === 'vyra-session-ended');
  assert.equal(ended.length, 1, 'vyra-session-ended dispatchades inte exakt en gång');
  assert.deepEqual(owner.activeState().widgets, [], 'A:s state överlevde ett backupfel');
});

test('en kastande teardown-lyssnare hindrar inte de övriga', async () => {
  const { owner } = setup();
  await commitStudio(owner, 'A', WS_A, OV_A);
  const ran = [];
  owner.registerTeardown('kastar', () => { ran.push('kastar'); throw new Error('nej') });
  owner.registerTeardown('stänger', () => ran.push('stänger'));
  await owner.beginLogout();
  assert.deepEqual(ran, ['kastar', 'stänger']);
});

test('logout når neutral även när storage vägrar', async () => {
  const { owner, storage, events } = setup();
  await commitStudio(owner, 'A', WS_A, OV_A);
  storage.failOnWrite(1);
  await owner.beginLogout();
  storage.clearFailure();

  assert.deepEqual(owner.activeState().widgets, [], 'A:s state var kvar aktiv efter storagefel');
  assert.equal(owner.mode(), 'fail-closed');
  assert.equal(events.filter(e => e.name === 'vyra-session-ended').length, 1);
  assert.equal(events.filter(e => e.name === 'vyra-session-state').length, 1,
    'fail-closed dispatchade ett state-event; endast projektionen från inloggningen får finnas');
  const error = events.find(e => e.name === 'vyra-session-state-error');
  assert.ok(error, 'inget felevent vid fail-closed');
  assert.ok(!JSON.stringify(error.detail).includes(WS_A), 'workspace-id läckte i feltexten');
  assert.ok(!JSON.stringify(error.detail).includes('A-w1'), 'statevärden läckte i feltexten');
});

test('logout-neutralisering återställer aldrig till A via vanlig rollback', async () => {
  const { owner, storage } = setup();
  await commitStudio(owner, 'A', WS_A, OV_A);
  storage.failOnWrite(3);
  await owner.beginLogout();
  storage.clearFailure();
  const state = storage.getItem('vyra-state');
  assert.ok(!state || !state.includes('A-w1'), 'A:s layout återställdes som aktiv vid logout');
});
