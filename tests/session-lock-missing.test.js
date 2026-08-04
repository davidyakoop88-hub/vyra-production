'use strict';
// When navigator.locks is unavailable there is no way to exclude another tab, so nothing persistent
// may be written. Verified data may still be shown — from memory only.
//
// The two read-only modes are deliberately separate: a Studio session without a lock is not the same
// thing as an OBS link, and they must not share ownership or persistent projection.
//
// RED BY CONSTRUCTION: session-state.js does not exist yet.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const H = require('./helpers/session-harness.js');

let Session = null;
try { Session = require(path.join(__dirname, '..', 'session-state.js')) } catch (_) { /* red below */ }

const WS = 'ws-B', OV = 'ov-B';

// Storage that already holds a previous account's data, and no lock manager at all.
function lockless(initial = {}) {
  const storage = H.createStorage(initial);
  const events = [];
  const owner = H.createOwner(Session.createSessionState, { storage, locks: null, tabId: 'tab-1',
    extras: { dispatch: (name, detail) => events.push({ name, detail }) } });
  return { owner, storage, events };
}

const oldWorld = () => ({ 'vyra-state': JSON.stringify(H.layout('A')), ...H.extrasFor('A'),
  'vyra-session-projection': JSON.stringify({ status: 'committed', tabId: 'gammal',
    projectionId: 'p-A', generation: 4, owner: { mode: 'studio-committed', workspaceId: 'ws-A',
      overlayId: 'ov-A' }, version: 2, at: 1 }) });

test('utan lås blir läget studio-readonly-lock-missing efter verifierat svar', async () => {
  assert.ok(Session, 'session-state.js finns inte');
  const { owner, storage } = lockless();
  storage.resetWrites();

  const out = await owner.projectVerifiedReadonly({ mode: 'studio', workspaceId: WS, overlayId: OV,
    state: H.layout('B'), extras: H.extrasFor('B') });

  assert.equal(out.ok, true);
  assert.equal(owner.mode(), 'studio-readonly-lock-missing');
  assert.equal(owner.activeState().user, 'B');
  assert.deepEqual(storage.writes, [], 'utan lås skrevs ändå något till storage');
});

test('gammal A-state i storage används aldrig som källa; endast B syns', async () => {
  const { owner, storage } = lockless(oldWorld());
  assert.deepEqual(owner.activeState().widgets, [], 'A:s state visades före verifiering');

  await owner.projectVerifiedReadonly({ mode: 'studio', workspaceId: WS, overlayId: OV,
    state: H.layout('B'), extras: H.extrasFor('B') });

  assert.equal(owner.activeState().user, 'B');
  assert.equal(owner.activeState().widgets[0].id, 'B-w1');
  assert.equal(String(owner.readActiveExtra('vyra-extras')).includes('!A'), false,
    'A:s EXTRA-värden nådde den verifierade vyn');
  // Och storage är orörd — A:s rader ligger kvar precis som de var.
  assert.equal(JSON.parse(storage.getItem('vyra-state')).user, 'A');
});

test('varje persistent skrivväg är stängd utan lås', async () => {
  const { owner, storage } = lockless(oldWorld());
  await owner.projectVerifiedReadonly({ mode: 'studio', workspaceId: WS, overlayId: OV,
    state: H.layout('B'), extras: H.extrasFor('B') });
  storage.resetWrites();

  assert.equal((await owner.writeActive('vyra-state', '{}')).ok, false);
  assert.equal(owner.canQueue(), false, 'CloudSync fick köa utan lås');
  assert.equal(owner.canPush(), false, 'CloudSync fick pusha utan lås');
  assert.equal(owner.canBackup(), false, 'backup tilläts utan lås');
  assert.equal(owner.committedProjection(), null, 'en committad projektion påstods finnas utan lås');
  assert.deepEqual(storage.writes, []);
});

test('projectActive vägrar helt utan lås', async () => {
  const { owner, storage } = lockless();
  storage.resetWrites();
  const token = owner.beginProjection();
  const out = await owner.projectActive(token, { mode: 'studio-committed', workspaceId: WS,
    overlayId: OV, state: H.layout('B'), extras: H.extrasFor('B') });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'no-lock-manager');
  assert.deepEqual(storage.writes, []);
});

// ---- eventkontraktet: komplett och säker, men inte persistent -------------------------------------
test('verifierad readonly-state ger ett state-event med persistent:false', async () => {
  const { owner, storage, events } = lockless(oldWorld());
  storage.resetWrites();
  await owner.projectVerifiedReadonly({ mode: 'studio', workspaceId: WS, overlayId: OV,
    state: H.layout('B'), extras: H.extrasFor('B') });

  const ready = events.filter(e => e.name === 'vyra-session-state');
  assert.equal(ready.length, 1, 'renderaren fick aldrig veta att säker data finns');
  assert.equal(ready[0].detail.reason, 'verified-readonly');
  assert.equal(ready[0].detail.persistent, false,
    'en icke-persistent projektion utgav sig för att vara committad');
  assert.deepEqual(storage.writes, []);
});

test('state-eventet kommer efter att state och cacher är klara', async () => {
  const order = [];
  const storage = H.createStorage(oldWorld());
  const owner = H.createOwner(Session.createSessionState, { storage, locks: null, tabId: 'tab-1',
    extras: { dispatch: name => {
      if (name !== 'vyra-session-state') return;
      order.push('event');
      order.push(owner.activeState().user);      // vad renderaren skulle se just då
    } } });
  owner.registerCache('vyra-extras', () => order.push('cache'));

  await owner.projectVerifiedReadonly({ mode: 'studio', workspaceId: WS, overlayId: OV,
    state: H.layout('B'), extras: H.extrasFor('B') });

  assert.deepEqual(order, ['cache', 'event', 'B'],
    'eventet kom före cachen eller före att activeStateObject var uppdaterat');
});

test('readonly-varningen är ett eget event efter state-eventet', async () => {
  const { owner, events } = lockless(oldWorld());
  await owner.projectVerifiedReadonly({ mode: 'studio', workspaceId: WS, overlayId: OV,
    state: H.layout('B'), extras: H.extrasFor('B') });
  const names = events.map(e => e.name);
  assert.deepEqual(names, ['vyra-session-state', 'vyra-session-state-error'],
    'varningen och state-eventet kom i fel ordning, eller ett av dem saknas');
});

test('Goal-SSE får starta efter en verifierad readonly-projektion', async () => {
  const { owner } = lockless(oldWorld());
  assert.equal(owner.canOpenGoalStream(), false, 'strömmen fick öppnas före verifiering');
  await owner.projectVerifiedReadonly({ mode: 'studio', workspaceId: WS, overlayId: OV,
    state: H.layout('B'), extras: H.extrasFor('B') });
  assert.equal(owner.canOpenGoalStream(), true);
});

test('ett ogiltigt svar ger inget state-event alls', async () => {
  const { owner, storage, events } = lockless(oldWorld());
  storage.resetWrites();
  const out = await owner.projectVerifiedReadonly({ mode: 'studio', workspaceId: WS, overlayId: OV,
    state: { widgets: 'inte en array' }, extras: H.extrasFor('B') });

  assert.equal(out.ok, false);
  assert.deepEqual(events.filter(e => e.name === 'vyra-session-state'), [],
    'ett ogiltigt svar utgav sig för att vara en komplett projektion');
  assert.deepEqual(owner.activeState().widgets, [], 'ogiltig data nådde den aktiva referensen');
  assert.deepEqual(storage.writes, []);
});

test('felmeddelandet är fast och bär varken state, workspace eller token', async () => {
  const { owner, events } = lockless(oldWorld());
  await owner.projectVerifiedReadonly({ mode: 'studio', workspaceId: WS, overlayId: OV,
    state: H.layout('B'), extras: H.extrasFor('B') });
  const notice = events.find(e => e.name === 'vyra-session-state-error');
  assert.ok(notice, 'ingen readonly-varning dispatchades');
  const text = JSON.stringify(notice.detail);
  for (const secret of [WS, OV, 'B-w1', 'ws-A', 'p-A']) {
    assert.ok(!text.includes(secret), `${secret} läckte i varningen`);
  }
});

test('overlay-token utan lås är ett eget läge, inte Studio-readonly', async () => {
  const { owner } = lockless(oldWorld());
  await owner.projectReadonlyOverlay({ state: H.layout('token'), extras: H.extrasFor('token') });
  assert.equal(owner.mode(), 'overlay-token-readonly');
  assert.equal(owner.canQueue(), false);
  assert.equal(owner.canBackup(), false);
});

test('en ny sidinstans börjar neutral igen tills ny verifiering', async () => {
  const shared = H.createStorage(oldWorld());
  const first = H.createOwner(Session.createSessionState, { storage: shared, locks: null,
    tabId: 'tab-1', extras: { dispatch: () => {} } });
  await first.projectVerifiedReadonly({ mode: 'studio', workspaceId: WS, overlayId: OV,
    state: H.layout('B'), extras: H.extrasFor('B') });
  assert.equal(first.activeState().user, 'B');

  // Sidomladdning: en helt ny instans mot samma storage.
  const second = H.createOwner(Session.createSessionState, { storage: shared, locks: null,
    tabId: 'tab-1', extras: { dispatch: () => {} } });
  assert.equal(second.mode(), 'boot-neutral');
  assert.deepEqual(second.activeState().widgets, [], 'den nya instansen visade gammal state');
});
