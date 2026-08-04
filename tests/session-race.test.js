'use strict';
// Two tabs, one origin, one storage, one lock manager.
//
// This is the file that can falsify the architecture choice. The race the plan exists to close is:
// A validates the marker, A writes state, B commits a new projection, A notices and rolls its
// snapshot back on top of B's data. Two marker reads cannot stop that — only mutual exclusion can.
//
// Every test here therefore runs two independent owner instances against the SAME shared storage and
// the SAME lock manager, and pauses one of them at a chosen point with an injected hook.
//
// RED BY CONSTRUCTION: session-state.js does not exist yet.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const H = require('./helpers/session-harness.js');

let Session = null;
try { Session = require(path.join(__dirname, '..', 'session-state.js')) } catch (_) { /* red below */ }

const WS = 'shared-workspace', OV = 'shared-overlay';

// Two owners, shared world. `hooks` lets a test suspend one owner inside its locked section.
function twoTabs({ storage = H.createStorage(), locks = H.createLockManager() } = {}) {
  const events = { a: [], b: [] };
  const hooks = { a: {}, b: {} };
  const a = H.createOwner(Session.createSessionState, { storage, locks, tabId: 'tab-A',
    extras: { dispatch: (name, detail) => events.a.push({ name, detail }), hooks: hooks.a } });
  const b = H.createOwner(Session.createSessionState, { storage, locks, tabId: 'tab-B',
    extras: { dispatch: (name, detail) => events.b.push({ name, detail }), hooks: hooks.b } });
  return { a, b, storage, locks, events, hooks };
}

const commit = (owner, account) => {
  const token = owner.beginProjection();
  return owner.projectActive(token, { mode: 'studio-committed', workspaceId: WS, overlayId: OV,
    state: H.layout(account), extras: H.extrasFor(account) });
};

const deferred = () => { let release; const promise = new Promise(r => { release = r }); return { promise, release } };

test('harnessen kan köra två isolerade ägarinstanser mot samma lås', async () => {
  assert.ok(Session, 'session-state.js finns inte');
  const { a, b, locks } = twoTabs();
  assert.notEqual(a, b);
  const order = [];
  const first = deferred();
  const one = locks.request('vyra-session-projection', { mode: 'exclusive' }, async () => {
    order.push('a-in'); await first.promise; order.push('a-ut');
  });
  const two = locks.request('vyra-session-projection', { mode: 'exclusive' }, async () => {
    order.push('b-in');
  });
  await new Promise(r => setImmediate(r));
  assert.deepEqual(order, ['a-in'], 'B kom in i låset medan A höll det');
  first.release();
  await Promise.all([one, two]);
  assert.deepEqual(order, ['a-in', 'a-ut', 'b-in']);
});

// ---- 1. A pausar efter första valideringen ----------------------------------------------------------
test('A pausad efter validering: B väntar, och slutstate är aldrig blandat', async () => {
  const { a, b, storage, hooks } = twoTabs();
  await commit(a, 'A');

  const paused = deferred();
  hooks.a.afterValidate = () => paused.promise;
  const aProjection = commit(a, 'A2');
  await new Promise(r => setImmediate(r));

  const bProjection = commit(b, 'B');
  await new Promise(r => setImmediate(r));
  const marker = JSON.parse(storage.getItem('vyra-session-projection'));
  assert.equal(marker.owner.workspaceId, WS);
  assert.notEqual(marker.tabId, 'tab-B', 'B committade medan A höll låset');

  paused.release();
  await Promise.all([aProjection, bProjection]);

  const state = JSON.parse(storage.getItem('vyra-state'));
  assert.equal(state.widgets.length, 1, 'blandad state — widgets från två projektioner');
  assert.ok(['A2-w1', 'B-w1'].includes(state.widgets[0].id));
  const extras = JSON.parse(storage.getItem('vyra-extras'));
  assert.match(extras.commands[0].cmd, new RegExp(state.user === 'A2' ? '!A2' : '!B'),
    'state och EXTRA kommer från olika projektioner');
});

// ---- 2. A pausar efter första nyckelskrivningen -------------------------------------------------------
test('A pausad mitt i skrivningen: B blockeras, och A:s rollback rör aldrig B:s data', async () => {
  const { a, b, storage, hooks } = twoTabs();
  await commit(a, 'A');

  const paused = deferred();
  hooks.a.afterFirstKey = () => paused.promise;
  hooks.a.failAfterFirstKey = true;          // tvinga rollback när den fortsätter
  const aFail = commit(a, 'A2');
  await new Promise(r => setImmediate(r));

  const bDone = commit(b, 'B');
  await new Promise(r => setImmediate(r));
  assert.equal(JSON.parse(storage.getItem('vyra-state')).user, 'A',
    'B skrev medan A höll låset — ömsesidig uteslutning saknas');

  paused.release();
  const aResult = await aFail;
  await bDone;

  assert.equal(aResult.ok, false);
  assert.equal(JSON.parse(storage.getItem('vyra-state')).user, 'B',
    'A:s rollback skrev över B:s committade state');
  assert.equal(JSON.parse(storage.getItem('vyra-session-projection')).tabId, 'tab-B');
});

// ---- 3. Två samtidiga writeActive ----------------------------------------------------------------------
test('två samtidiga writeActive: en definierad ordning och ett slutstate', async () => {
  const { a, b, storage } = twoTabs();
  await commit(a, 'A');
  // Bara ägaren av den committade projektionen får skriva; B måste först ta över.
  await commit(b, 'B');

  const [one, two] = await Promise.all([
    a.writeActive('vyra-state', JSON.stringify(H.layout('A', { user: 'A-skriv' }))),
    b.writeActive('vyra-state', JSON.stringify(H.layout('B', { user: 'B-skriv' })))
  ]);

  assert.equal(one.ok, false, 'A fick skriva trots att B äger projektionen');
  assert.equal(one.reason, 'lost-ownership');
  assert.equal(two.ok, true);
  assert.equal(JSON.parse(storage.getItem('vyra-state')).user, 'B-skriv');
});

// ---- 4. projectActive i B mot writeActive i A ------------------------------------------------------------
test('projectActive i B och writeActive i A delar aldrig en projektion', async () => {
  const { a, b, storage, hooks } = twoTabs();
  await commit(a, 'A');

  const paused = deferred();
  hooks.b.afterValidate = () => paused.promise;
  const bProjection = commit(b, 'B');
  await new Promise(r => setImmediate(r));

  const aWrite = a.writeActive('vyra-state', JSON.stringify(H.layout('A', { user: 'A-sent' })));
  await new Promise(r => setImmediate(r));
  paused.release();
  const [bOut, aOut] = await Promise.all([bProjection, aWrite]);

  assert.equal(bOut.ok, true);
  assert.equal(aOut.ok, false, 'A:s skrivning trängde in i B:s projektion');
  assert.equal(JSON.parse(storage.getItem('vyra-state')).user, 'B');
});

// ---- 5. logout mot vanlig save -----------------------------------------------------------------------------
test('logout-neutralisering vinner över en samtidig save', async () => {
  const { a, storage, hooks } = twoTabs();
  await commit(a, 'A');

  const paused = deferred();
  hooks.a.afterValidate = () => paused.promise;
  const save = a.writeActive('vyra-state', JSON.stringify(H.layout('A', { user: 'sent-save' })));
  await new Promise(r => setImmediate(r));
  const logout = a.beginLogout();
  paused.release();
  const [saveOut] = await Promise.all([save, logout]);

  const state = storage.getItem('vyra-state');
  assert.ok(!state || !state.includes('sent-save'), 'en sen save återupplivade state efter logout');
  assert.ok(!state || !state.includes('A-w1'), 'A:s layout var kvar aktiv efter logout');
  assert.equal(saveOut.ok, false);
});

// ---- 6. kast inuti låset ------------------------------------------------------------------------------------
test('ett kast inuti låset släpper låset och nästa operation lyckas', async () => {
  const { a, b, locks, hooks } = twoTabs();
  await commit(a, 'A');
  hooks.a.afterValidate = () => { throw new Error('injicerat fel i låset') };

  const crashed = await commit(a, 'A2').catch(error => ({ ok: false, thrown: error.message }));
  assert.equal(crashed.ok, false);
  assert.equal(locks.heldBy('vyra-session-projection'), null, 'låset släpptes aldrig');

  hooks.a.afterValidate = null;
  const after = await commit(b, 'B');
  assert.equal(after.ok, true, 'nästa verifierade operation kunde inte ta låset');
});

// ---- 7. förlorat ägarskap medan A väntade -------------------------------------------------------------------
test('förlorat ägarskap: A avbryter, synkar från vinnaren och blir readonly', async () => {
  const { a, b, storage, hooks, events } = twoTabs();
  await commit(a, 'A');
  const ref = a.activeState();

  // A muterar lokalt, precis som drag-slut gör, och hinner inte spara innan B tar över.
  ref.widgets[0].x = 999;

  const paused = deferred();
  hooks.a.beforeLock = () => paused.promise;
  const aWrite = a.writeActive('vyra-state', JSON.stringify(ref));
  await new Promise(r => setImmediate(r));
  await commit(b, 'B');
  paused.release();
  const out = await aWrite;

  assert.equal(out.ok, false);
  assert.equal(out.reason, 'lost-ownership');
  assert.equal(a.mode(), 'studio-readonly', 'A blev inte readonly efter förlorat ägarskap');
  assert.equal(a.activeState(), ref, 'referensen byttes vid synk från vinnaren');
  assert.equal(ref.user, 'B', 'A visar inte vinnarens state');
  assert.equal(ref.widgets[0].id, 'B-w1');
  assert.notEqual(ref.widgets[0].x, 999, 'A:s osparade mutation överlevde');
  assert.equal(JSON.parse(storage.getItem('vyra-state')).user, 'B');
  assert.ok(events.a.some(e => e.name === 'vyra-session-state'
    && e.detail.reason === 'ownership-lost'), 'inget ownership-lost-event');
});

test('en gammal timer i A kan inte återta ägarskapet', async () => {
  const { a, b, storage } = twoTabs();
  await commit(a, 'A');
  await commit(b, 'B');
  const before = storage.snapshot();
  const out = await a.writeActive('vyra-extras', JSON.stringify({ commands: [] }));
  assert.equal(out.ok, false);
  assert.deepEqual(storage.snapshot(), before);
});
