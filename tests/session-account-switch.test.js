'use strict';
// A logs out, B logs in, same tab. Nothing of A's may reach B.
//
// This runs the real session-state.js and cloud-sync.js inside a node:vm browser and drives them
// with the actual event sequence, because the leak is a property of how the two behave together
// over time — a source scan cannot see it.
//
// The three leaks the inventory found, in one file:
//   1. vyra-cloud-sync-queue carries no account id, so A's unsaved layout could be PUT to B's overlay.
//   2. `initialized` was never reset, so B kept A's workspace and overlay.
//   3. The conflict dialog offered A's local layout to B.
const test = require('node:test'), assert = require('node:assert/strict');
const { createBrowser } = require('./helpers/browser-harness.js');
const H = require('./helpers/session-harness.js');

const WS_A = 'ws-A', OV_A = 'ov-A';
const WS_B = 'ws-B', OV_B = 'ov-B';

// A scripted VyraAuth: every request is answered from a table, and every call is recorded so a test
// can prove that no PUT carried the wrong account's data.
function installAuth(browser, overlays) {
  const calls = [];
  browser.sandbox.VyraAuth = {
    lastDetail: () => browser.sandbox.__detail || null,
    api: async (path, options) => {
      calls.push({ path, method: (options && options.method) || 'GET',
        body: options && options.body ? JSON.parse(options.body) : null });
      const listing = path.match(/^\/api\/workspaces\/([^/]+)\/overlays$/);
      if (listing) return { overlays: overlays[listing[1]].map(o => ({ id: o.id, version: o.version })) };
      const single = path.match(/^\/api\/workspaces\/([^/]+)\/overlays\/([^/]+)$/);
      if (single && (!options || !options.method || options.method === 'GET')) {
        return { overlay: overlays[single[1]].find(o => o.id === single[2]) };
      }
      if (single && options.method === 'PUT') {
        const overlay = overlays[single[1]].find(o => o.id === single[2]);
        overlay.version += 1;
        return { overlay };
      }
      throw Object.assign(new Error('okänd rutt: ' + path), { status: 404 });
    }
  };
  return calls;
}

const overlayFor = (id, account) => ({ id, name: account, version: 1, updated_at: '2026-01-01',
  state: { ...H.layout(account), __vyraCloud: { schema: 1, storage: H.extrasFor(account), savedAt: 1 } } });

async function bootAccount(browser, workspaceId, overlayId) {
  browser.sandbox.__detail = { user: { id: 'u-' + workspaceId }, workspaces: [{ id: workspaceId }] };
  browser.emit('vyra-auth-ready', browser.sandbox.__detail);
  for (let i = 0; i < 12; i++) await browser.settle();
}

function world() {
  const browser = createBrowser();
  const overlays = { [WS_A]: [overlayFor(OV_A, 'A')], [WS_B]: [overlayFor(OV_B, 'B')] };
  browser.load('session-state.js');
  const calls = installAuth(browser, overlays);
  browser.load('cloud-sync.js');
  return { browser, overlays, calls, session: browser.sandbox.VyraSessionState };
}

test('konto A projiceras och äger sessionen', async () => {
  const { browser, session } = world();
  await bootAccount(browser, WS_A, OV_A);

  assert.equal(session.mode(), 'studio-committed', 'A fick ingen committad projektion');
  assert.equal(session.activeState().user, 'A');
  assert.equal(session.committedProjection().workspaceId, WS_A);
});

test('metan namespacas per workspace', async () => {
  const { browser } = world();
  await bootAccount(browser, WS_A, OV_A);
  const keys = Object.keys(browser.storage.snapshot());
  assert.ok(keys.includes(`vyra-cloud-sync-meta:${WS_A}`), 'metan skrevs inte namespacad');
  assert.ok(!keys.includes('vyra-cloud-sync-meta'),
    'den gamla globala metan skrevs — den är oåtkomlig för nästa konto bara om den är namespacad');
});

// ---- kärnan: A → logout → B ------------------------------------------------------------------------
test('A loggar ut, B loggar in: inget av A:s data når B', async () => {
  const { browser, session, calls } = world();
  await bootAccount(browser, WS_A, OV_A);

  // A redigerar utan att synken hinner spara: en kö läggs på disk.
  session.activeState().widgets[0].id = 'A-hemlig-widget';
  await session.writeActive('vyra-state', JSON.stringify(session.activeState()));
  browser.tick('interval');
  await browser.settle();

  // Logout: identiteten rensas, sedan eventet.
  browser.emit('vyra-auth-identity-cleared');
  for (let i = 0; i < 6; i++) await browser.settle();

  assert.deepEqual(session.activeState().widgets, [], 'A:s widgets låg kvar aktiva efter logout');

  calls.length = 0;
  await bootAccount(browser, WS_B, OV_B);

  // 1. B ser sin egen layout, aldrig A:s.
  assert.equal(session.activeState().user, 'B', 'B fick inte sin egen molnlayout');
  assert.ok(!JSON.stringify(session.activeState()).includes('A-hemlig-widget'),
    'A:s osparade widget syns i B:s session');
  assert.equal(session.committedProjection().workspaceId, WS_B, 'B ärvde A:s workspace');

  // 2. Ingen PUT bär A:s data, och ingen PUT går mot A:s workspace.
  for (const call of calls.filter(c => c.method === 'PUT')) {
    assert.ok(!call.path.includes(WS_A), 'en PUT gick mot A:s workspace under B:s session');
    assert.ok(!JSON.stringify(call.body).includes('A-hemlig-widget'),
      'A:s osparade layout PUT:ades under B:s session');
  }

  // 3. B:s EXTRA kommer från B, inte från A.
  const extras = session.readActiveExtra('vyra-extras');
  assert.ok(extras && String(extras).includes('!B'), 'B fick inte sina egna EXTRA-värden');
  assert.ok(!String(extras).includes('!A'), 'A:s chatbotkommandon nådde B');
});

test('B får aldrig en konfliktdialog med A:s layout', async () => {
  const { browser } = world();
  await bootAccount(browser, WS_A, OV_A);
  browser.emit('vyra-auth-identity-cleared');
  for (let i = 0; i < 6; i++) await browser.settle();

  let dialogs = 0;
  const realCreate = browser.sandbox.document.createElement;
  browser.sandbox.document.createElement = tag => {
    const node = realCreate(tag);
    const original = Object.getOwnPropertyDescriptor(node, 'innerHTML');
    Object.defineProperty(node, 'innerHTML', { set(value) {
      if (String(value).includes('Vilken layout')) dialogs += 1;
      if (original && original.set) original.set.call(node, value);
    }, get() { return '' }, configurable: true });
    return node;
  };
  await bootAccount(browser, WS_B, OV_B);
  assert.equal(dialogs, 0, 'B erbjöds att välja mellan sin och A:s layout');
});

test('A återvänder och får tillbaka sitt parkerade arbete', async () => {
  const { browser, session } = world();
  await bootAccount(browser, WS_A, OV_A);
  session.activeState().widgets[0].id = 'A-osparad';
  await session.writeActive('vyra-state', JSON.stringify(session.activeState()));

  browser.emit('vyra-auth-identity-cleared');
  for (let i = 0; i < 6; i++) await browser.settle();
  await bootAccount(browser, WS_B, OV_B);
  browser.emit('vyra-auth-identity-cleared');
  for (let i = 0; i < 6; i++) await browser.settle();
  await bootAccount(browser, WS_A, OV_A);

  assert.ok(JSON.stringify(session.activeState()).includes('A-osparad'),
    'A:s parkerade arbete återlämnades inte vid återkomst');
});

// ---- legacy ------------------------------------------------------------------------------------------
test('legacy meta som tillhör A adopteras inte av B, utan karantäniseras', async () => {
  const browser = createBrowser();
  browser.storage.setItem('vyra-cloud-sync-meta', JSON.stringify({ workspaceId: WS_A,
    overlayId: OV_A, version: 3, lastLocal: null }));
  browser.storage.setItem('vyra-cloud-sync-queue', JSON.stringify({ at: 1,
    state: { widgets: [{ id: 'A-legacy' }] } }));
  browser.load('session-state.js');
  const overlays = { [WS_A]: [overlayFor(OV_A, 'A')], [WS_B]: [overlayFor(OV_B, 'B')] };
  const calls = installAuth(browser, overlays);
  browser.load('cloud-sync.js');

  await bootAccount(browser, WS_B, OV_B);

  const snapshot = browser.storage.snapshot();
  assert.equal(snapshot['vyra-cloud-sync-meta'], undefined, 'legacy-metan låg kvar åtkomlig');
  assert.equal(snapshot['vyra-cloud-sync-queue'], undefined, 'legacy-kön låg kvar åtkomlig');
  const quarantined = Object.keys(snapshot).filter(k => k.startsWith('vyra-session-orphan:'));
  assert.equal(quarantined.length, 1, 'legacydatan raderades i stället för att karantäniseras');
  assert.ok(snapshot[quarantined[0]].includes('A-legacy'), 'karantänen bevarade inte arbetet');

  for (const call of calls.filter(c => c.method === 'PUT')) {
    assert.ok(!JSON.stringify(call.body).includes('A-legacy'), 'legacy-kön PUT:ades under B');
  }
});

test('legacy meta som tillhör samma workspace migreras i stället', async () => {
  const browser = createBrowser();
  browser.storage.setItem('vyra-cloud-sync-meta', JSON.stringify({ workspaceId: WS_A,
    overlayId: OV_A, version: 1, lastLocal: null }));
  browser.load('session-state.js');
  installAuth(browser, { [WS_A]: [overlayFor(OV_A, 'A')] });
  browser.load('cloud-sync.js');

  await bootAccount(browser, WS_A, OV_A);
  const snapshot = browser.storage.snapshot();
  assert.equal(snapshot['vyra-cloud-sync-meta'], undefined, 'den globala metan städades inte bort');
  assert.ok(snapshot[`vyra-cloud-sync-meta:${WS_A}`], 'metan migrerades inte till sitt workspace');
  assert.deepEqual(Object.keys(snapshot).filter(k => k.startsWith('vyra-session-orphan:')), [],
    'eget arbete karantäniserades i onödan');
});

// ---- timern -------------------------------------------------------------------------------------------
test('sekundtimern köar ingenting utan en committad session', async () => {
  const { browser, session } = world();
  await bootAccount(browser, WS_A, OV_A);
  browser.emit('vyra-auth-identity-cleared');
  for (let i = 0; i < 6; i++) await browser.settle();

  browser.storage.resetWrites();
  browser.tick('interval');
  await browser.settle();
  const queued = browser.storage.writes.filter(([, key]) => key.startsWith('vyra-cloud-sync-queue'));
  assert.deepEqual(queued, [], 'timern köade efter logout');
  assert.equal(session.canQueue(), false);
});
