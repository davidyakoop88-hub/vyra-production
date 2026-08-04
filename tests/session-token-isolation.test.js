'use strict';
// An OBS link opened on the same origin as a working Studio tab must be invisible to it.
//
// The token projection is read-only and lives in the page instance's memory: no lock, no marker, no
// vyra-state, no EXTRA keys, no backup, no queue. The strongest form of that claim is byte equality —
// every protected key is compared before and after the token projection.
//
// RED BY CONSTRUCTION: session-state.js does not exist yet.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const H = require('./helpers/session-harness.js');

let Session = null;
try { Session = require(path.join(__dirname, '..', 'session-state.js')) } catch (_) { /* red below */ }

const WS = 'studio-workspace', OV = 'studio-overlay';

function world() {
  const storage = H.createStorage(), locks = H.createLockManager();
  const events = { studio: [], token: [] };
  const studio = H.createOwner(Session.createSessionState, { storage, locks, tabId: 'tab-studio',
    extras: { dispatch: (name, detail) => events.studio.push({ name, detail }) } });
  const token = H.createOwner(Session.createSessionState, { storage, locks, tabId: 'tab-token',
    extras: { dispatch: (name, detail) => events.token.push({ name, detail }) } });
  return { storage, locks, studio, token, events };
}

const commitStudio = owner => {
  const t = owner.beginProjection();
  return owner.projectActive(t, { mode: 'studio-committed', workspaceId: WS, overlayId: OV,
    state: H.layout('studio'), extras: H.extrasFor('studio') });
};

test('tokenprojektionen rör inte en enda skyddad nyckel', async () => {
  assert.ok(Session, 'session-state.js finns inte');
  const { storage, studio, token } = world();
  await commitStudio(studio);
  const before = storage.snapshot();
  storage.resetWrites();

  await token.projectReadonlyOverlay({ state: H.layout('token'), extras: H.extrasFor('token') });

  assert.deepEqual(storage.writes, [], 'tokenprojektionen skrev till storage');
  for (const key of H.PROTECTED) {
    assert.equal(storage.getItem(key), before[key] ?? null, `${key} ändrades av tokenläget`);
  }
});

test('tokenprojektionen tar aldrig Studio-låset', async () => {
  const { locks, studio, token } = world();
  await commitStudio(studio);
  const taken = locks.log.length;
  await token.projectReadonlyOverlay({ state: H.layout('token'), extras: H.extrasFor('token') });
  assert.equal(locks.log.length, taken, 'tokenläget tog ett lås');
});

test('Studio-flikens ägarskap är oförändrat efter att en tokenlänk öppnats', async () => {
  const { storage, studio, token } = world();
  await commitStudio(studio);
  const marker = storage.getItem('vyra-session-projection');
  const committed = { ...studio.committedProjection() };

  await token.projectReadonlyOverlay({ state: H.layout('token'), extras: H.extrasFor('token') });

  assert.equal(storage.getItem('vyra-session-projection'), marker, 'markören ändrades');
  assert.deepEqual(studio.committedProjection(), committed, 'projectionId eller tabId ändrades');
  assert.equal(studio.mode(), 'studio-committed', 'Studio-fliken blev readonly av en tokenlänk');

  const write = await studio.writeActive('vyra-state', JSON.stringify(H.layout('studio2')));
  assert.equal(write.ok, true, 'Studio kunde inte längre skriva');
});

test('tokenfliken visar tokenens state utan att exponera Studios', async () => {
  const { studio, token } = world();
  await commitStudio(studio);
  await token.projectReadonlyOverlay({ state: H.layout('token'), extras: H.extrasFor('token') });

  assert.equal(token.mode(), 'overlay-token-readonly');
  assert.equal(token.activeState().user, 'token');
  assert.equal(token.activeState().widgets[0].id, 'token-w1');
  assert.notEqual(studio.activeState().user, 'token', 'tokenstate läckte in i Studio-instansen');
});

test('EXTRA i tokenläge läses ur ägaren, aldrig ur localStorage', async () => {
  const { storage, token } = world();
  storage.setItem('vyra-action-event-v2', JSON.stringify({ actions: [{ id: 'gammal-A' }], events: [] }));
  await token.projectReadonlyOverlay({ state: H.layout('token'), extras: H.extrasFor('token') });

  const active = token.readActiveExtra('vyra-action-event-v2');
  assert.ok(active, 'readActiveExtra gav inget värde i tokenläge');
  assert.ok(!String(active).includes('gammal-A'), 'tokenläget föll tillbaka på localStorage');
  assert.match(String(active), /token-a/);
});

test('tokenläget skapar varken backup, QUEUE eller META', async () => {
  const { storage, token } = world();
  await token.projectReadonlyOverlay({ state: H.layout('token'), extras: H.extrasFor('token') });
  const keys = Object.keys(storage.snapshot());
  assert.deepEqual(keys.filter(k => /backup|queue|meta/i.test(k)), []);
});

test('återkallad token återgår till neutral, men bara i den egna instansen', async () => {
  const { storage, studio, token } = world();
  await commitStudio(studio);
  await token.projectReadonlyOverlay({ state: H.layout('token'), extras: H.extrasFor('token') });
  const before = storage.snapshot();

  await token.endReadonlyOverlay();

  assert.deepEqual(token.activeState().widgets, [], 'tokenflikens state neutraliserades inte');
  assert.deepEqual(storage.snapshot(), before, 'tokenavslutet rörde global storage');
  assert.equal(studio.activeState().user, 'studio', 'Studio-fliken påverkades av tokenavslutet');
});

test('writeActive är stängd i tokenläge, oavsett nyckel', async () => {
  const { storage, token } = world();
  await token.projectReadonlyOverlay({ state: H.layout('token'), extras: H.extrasFor('token') });
  storage.resetWrites();
  for (const key of H.PROTECTED) {
    const out = await token.writeActive(key, '{}');
    assert.equal(out.ok, false, `${key} kunde skrivas i tokenläge`);
  }
  assert.deepEqual(storage.writes, []);
});
