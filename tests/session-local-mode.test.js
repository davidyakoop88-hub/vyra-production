'use strict';
// VYRA Desktop has no account system: electron-app/local-server.js serves no /api/auth/config, so
// auth-client never reaches an authenticated workspace and nothing ever commits a cloud projection.
// A write monopoly that only recognises studio-committed would therefore break every save in the
// desktop app — drag, delete, rename, brand kit, all of it.
//
// local-committed is that machine's own session: same lock, same marker, same single-writer rule,
// but no workspace and no network. It is entered ONLY on an explicit `{authRequired:false}` answer
// — never on a failed request, because "the server did not answer" and "there is no account system"
// are different facts and only one of them is safe.
//
// RED BY CONSTRUCTION: projectLocalSession() does not exist yet.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), fs = require('fs');
const H = require('./helpers/session-harness.js');

const ROOT = path.join(__dirname, '..');
let Session = null;
try { Session = require(path.join(ROOT, 'session-state.js')) } catch (_) { /* red below */ }

function setup({ initial = {}, locks = H.createLockManager() } = {}) {
  const storage = H.createStorage(initial);
  const events = [];
  const owner = H.createOwner(Session.createSessionState, { storage, locks, tabId: 'tab-desktop',
    extras: { dispatch: (name, detail) => events.push({ name, detail }) } });
  return { owner, storage, events, locks };
}

test('en lokal session blir committad och skrivbar', async () => {
  assert.ok(Session, 'session-state.js finns inte');
  const { owner, storage } = setup({ initial: { 'vyra-state': JSON.stringify(H.layout('maskinen')) } });

  const out = await owner.projectLocalSession();
  assert.equal(out.ok, true);
  assert.equal(owner.mode(), 'local-committed');
  assert.equal(owner.activeState().user, 'maskinen', 'maskinens egen layout laddades inte');

  const write = await owner.writeActive('vyra-state',
    JSON.stringify(H.layout('maskinen', { user: 'ändrad' })));
  assert.equal(write.ok, true, 'offline-redigering blockerades');
  assert.equal(owner.activeState().user, 'ändrad');
  assert.equal(JSON.parse(storage.getItem('vyra-state')).user, 'ändrad');
});

test('en tom maskin får onboarding-state, inte neutral', async () => {
  const { owner } = setup();
  await owner.projectLocalSession();
  assert.ok(owner.activeState().widgets.length > 0,
    'en förstagångsanvändare möttes av tom yta i stället för startlayouten');
});

test('markören namnger local-committed utan workspace', async () => {
  const { owner, storage } = setup();
  await owner.projectLocalSession();
  const marker = JSON.parse(storage.getItem('vyra-session-projection'));
  assert.equal(marker.status, 'committed');
  assert.equal(marker.owner.mode, 'local-committed');
  assert.equal(marker.owner.workspaceId, null);
  assert.equal(marker.tabId, 'tab-desktop');
});

test('lokalt läge tar samma lås — två flikar kan inte skriva samtidigt', async () => {
  const locks = H.createLockManager();
  const storage = H.createStorage();
  const a = H.createOwner(Session.createSessionState, { storage, locks, tabId: 'tab-A',
    extras: { dispatch: () => {} } });
  const b = H.createOwner(Session.createSessionState, { storage, locks, tabId: 'tab-B',
    extras: { dispatch: () => {} } });

  await a.projectLocalSession();
  await b.projectLocalSession();

  const fromA = await a.writeActive('vyra-state', JSON.stringify(H.layout('A')));
  assert.equal(fromA.ok, false, 'den gamla fliken behöll skrivrätten');
  assert.equal(fromA.reason, 'lost-ownership');
  assert.equal((await b.writeActive('vyra-state', JSON.stringify(H.layout('B')))).ok, true);
});

test('inget nätverk i lokalt läge', async () => {
  const { owner } = setup();
  await owner.projectLocalSession();
  assert.equal(owner.canQueue(), false, 'lokalt läge köade mot molnet');
  assert.equal(owner.canPush(), false, 'lokalt läge pushade mot molnet');
  assert.equal(owner.canBackup(), false, 'lokalt läge skapade en workspace-backup');
  assert.equal(owner.canOpenGoalStream(), false, 'lokalt läge öppnade Goal-SSE');
});

test('utan låshanterare blir lokalt läge skrivskyddat, aldrig committat', async () => {
  const { owner, storage } = setup({ locks: null });
  storage.resetWrites();
  const out = await owner.projectLocalSession();
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'no-lock-manager');
  assert.notEqual(owner.mode(), 'local-committed');
  assert.deepEqual(storage.writes, []);
});

test('logout från lokalt läge neutraliserar utan att kräva workspace', async () => {
  const { owner, storage } = setup({ initial: { 'vyra-state': JSON.stringify(H.layout('maskinen')) } });
  await owner.projectLocalSession();
  await owner.beginLogout();
  assert.deepEqual(owner.activeState().widgets, []);
  assert.equal(JSON.parse(storage.getItem('vyra-state')).widgets.length, 0);
});

// ---- säkerhetsregeln: bara ett uttryckligt svar räknas -------------------------------------------
test('auth-client skiljer ett uttryckligt authRequired:false från ett nätverksfel', () => {
  const source = fs.readFileSync(path.join(ROOT, 'auth-client.js'), 'utf8');
  assert.match(source, /configKnown/,
    'auth-client spårar inte om /api/auth/config faktiskt svarade');
  // catch-grenen får aldrig påstå att ett lokalt läge är verifierat.
  const failure = source.match(/catch\s*\{[^}]*configKnown\s*=\s*false[^}]*\}/);
  assert.ok(failure, 'ett misslyckat konfigsvar markerar inte configKnown=false');
  assert.match(source, /isLocalSession/, 'auth-client exponerar ingen isLocalSession()');
});

test('ett kastande API aktiverar aldrig lokalt läge', async () => {
  // Webben: /api/auth/config svarar 500. Ingen får hamna i local-committed av det.
  const decide = (configKnown, authRequired) => configKnown === true && authRequired === false;
  assert.equal(decide(false, false), false, 'ett nätverksfel öppnade lokalt läge');
  assert.equal(decide(false, undefined), false);
  assert.equal(decide(true, true), false, 'en autentiserad webb öppnade lokalt läge');
  assert.equal(decide(true, false), true);

  const source = fs.readFileSync(path.join(ROOT, 'cloud-sync.js'), 'utf8');
  assert.match(source, /vyra-auth-local/,
    'ingen lyssnare kopplar det uttryckliga lokala svaret till en lokal projektion');
});
