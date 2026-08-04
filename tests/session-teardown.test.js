'use strict';
// What must be gone when a session ends, proved by running the real files.
//
// The stream, the callback and the caches are three separate leaks that all survive a logout today:
// nothing closes the EventSource, its listener is an anonymous arrow that cannot be removed, and
// extras.js/wishlist.js parse their key once at load and never again.
const test = require('node:test'), assert = require('node:assert/strict');
const { createBrowser } = require('./helpers/browser-harness.js');
const H = require('./helpers/session-harness.js');

const WS = 'ws-A';

function live({ hostname = 'vyralive.app' } = {}) {
  const browser = createBrowser({ hostname });
  browser.load('session-state.js');
  browser.sandbox.VyraAuth = { lastDetail: () => ({ workspaces: [{ id: WS }] }) };
  browser.load('live-client.js');
  return browser;
}

test('exakt en ström öppnas, och den stängs vid vyra-session-ended', async () => {
  const browser = live();
  browser.emit('vyra-auth-ready', { workspaces: [{ id: WS }] });
  await browser.settle();
  assert.equal(browser.openStreams.length, 1, 'ingen eller flera strömmar öppnades');
  const stream = browser.openStreams[0];
  assert.match(stream.url, new RegExp(WS));

  browser.emit('vyra-session-ended', { mode: 'neutral' });
  await browser.settle();
  assert.equal(stream.closed, true, 'workspace-strömmen stängdes aldrig vid logout');
});

test('en redan köad callback når inte ingest efter teardown', async () => {
  const browser = live();
  browser.emit('vyra-auth-ready', { workspaces: [{ id: WS }] });
  await browser.settle();
  const stream = browser.openStreams[0];

  browser.emit('vyra-session-ended', { mode: 'neutral' });
  await browser.settle();

  // close() river anslutningen men garanterar inte att redan köade meddelanden uteblir — därför
  // sitter vakten i callbacken, inte i strömmen.
  browser.sandbox.localStorage.resetWrites();
  stream.deliver('live', { id: 'efter-teardown', type: 'follow', username: 'A' }, '1-0');
  await browser.settle();
  const wrote = browser.sandbox.localStorage.writes
    .filter(([, key]) => key === 'vyra-live-event');
  assert.deepEqual(wrote, [], 'ett event från förra kontot behandlades efter teardown');
});

test('en ny inloggning öppnar exakt en ny ström', async () => {
  const browser = live();
  browser.emit('vyra-auth-ready', { workspaces: [{ id: WS }] });
  await browser.settle();
  browser.emit('vyra-session-ended', { mode: 'neutral' });
  await browser.settle();

  browser.sandbox.VyraAuth = { lastDetail: () => ({ workspaces: [{ id: 'ws-B' }] }) };
  browser.emit('vyra-auth-ready', { workspaces: [{ id: 'ws-B' }] });
  await browser.settle();

  const open = browser.openStreams.filter(s => !s.closed);
  assert.equal(open.length, 1, `${open.length} öppna strömmar efter kontobyte`);
  assert.match(open[0].url, /ws-B/, 'den nya strömmen pekar på förra kontots workspace');
});

test('desktop-pollen har ett stopphandtag', async () => {
  const browser = createBrowser({ hostname: '127.0.0.1' });
  browser.load('session-state.js');
  browser.load('live-client.js');
  await browser.settle();
  assert.equal(typeof browser.sandbox.VyraLive.stop, 'function',
    'desktopläget saknar en väg att stoppa poll-loopen');
  browser.sandbox.VyraLive.stop();
  const running = browser.timers.timeouts.filter(t => !t.cleared);
  assert.ok(running.length === 0 || browser.sandbox.VyraLive.isStopped(),
    'poll-loopen fortsätter schemalägga sig själv efter stop()');
});

// ---- cacherna ------------------------------------------------------------------------------------
test('extras och wishlist laddar om sin cache vid varje projektion', async () => {
  const browser = createBrowser();
  browser.storage.setItem('vyra-extras', JSON.stringify({ commands: [{ cmd: '!A', reply: 'A', on: true }] }));
  browser.storage.setItem('vyra-wishlist', JSON.stringify([{ id: 'A-wish' }]));
  // extras.js overlagrar studio.js globala bind()/view, precis som i den riktiga sidan dar
  // studio.js laddas fore den. Harnessen tillhandahaller dem sa filen kan koras som den ar.
  browser.sandbox.bind = () => {};
  browser.sandbox.view = 'home';
  browser.load('session-state.js');
  browser.load('extras.js');
  browser.load('wishlist.js');

  assert.equal(typeof browser.sandbox.VyraExtras?.reload, 'function',
    'extras.js registrerar ingen omläsare');
  assert.equal(typeof browser.sandbox.VyraWishlist?.reload, 'function',
    'wishlist.js registrerar ingen omläsare');

  const session = browser.sandbox.VyraSessionState;
  const token = session.beginProjection();
  await session.projectActive(token, { mode: 'studio-committed', workspaceId: WS, overlayId: 'ov',
    state: H.layout('B'), extras: H.extrasFor('B') });

  assert.match(JSON.stringify(browser.sandbox.VyraExtras.data), /!B/,
    'extras-cachen visar fortfarande förra kontots kommandon');
  assert.match(JSON.stringify(browser.sandbox.VyraWishlist.data), /B-wish/,
    'wishlist-cachen visar fortfarande förra kontots poster');
});

test('cachen töms när sessionen neutraliseras', async () => {
  const browser = createBrowser();
  browser.sandbox.bind = () => {};
  browser.sandbox.view = 'home';
  browser.load('session-state.js');
  browser.load('extras.js');
  browser.load('wishlist.js');
  const session = browser.sandbox.VyraSessionState;
  const token = session.beginProjection();
  await session.projectActive(token, { mode: 'studio-committed', workspaceId: WS, overlayId: 'ov',
    state: H.layout('A'), extras: H.extrasFor('A') });
  await session.beginLogout();

  assert.ok(!JSON.stringify(browser.sandbox.VyraExtras.data).includes('!A'),
    'A:s kommandon låg kvar i minnet efter logout');
  assert.deepEqual(browser.sandbox.VyraWishlist.data, [],
    'A:s önskelista låg kvar i minnet efter logout');
});

test('omläsarna är idempotenta — samma resultat vid upprepade anrop', async () => {
  const browser = createBrowser();
  browser.storage.setItem('vyra-wishlist', JSON.stringify([{ id: 'x' }]));
  browser.load('session-state.js');
  browser.load('wishlist.js');
  const value = JSON.stringify([{ id: 'y' }, { id: 'z' }]);
  browser.sandbox.VyraWishlist.reload(value);
  const first = JSON.stringify(browser.sandbox.VyraWishlist.data);
  browser.sandbox.VyraWishlist.reload(value);
  browser.sandbox.VyraWishlist.reload(value);
  assert.equal(JSON.stringify(browser.sandbox.VyraWishlist.data), first,
    'omläsaren muterar inkrementellt i stället för att byta ut hela värdet');
});
