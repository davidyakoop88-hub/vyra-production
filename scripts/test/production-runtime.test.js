'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('cloud Studio never polls the desktop TikTok endpoints', () => {
  const liveClient = read('live-client.js');
  assert.match(liveClient, /localRuntime=\['127\.0\.0\.1','localhost'\]\.includes\(location\.hostname\)/);
  // This used to assert the "Öppna VYRA Desktop för att ansluta TikTok LIVE" message, which the
  // cloud path deliberately removed when web mode learned to connect on its own — so the test has
  // been red on main ever since, describing a product decision that no longer holds. A permanently
  // red suite is what let f7792bf ship a feature that never loaded, so it asserts the CURRENT
  // contract instead: in web mode Studio takes its events from the workspace SSE stream and returns
  // before the desktop poll loop is ever reached.
  assert.match(liveClient, /new EventSource\(`\/api\/workspaces\/\$\{id\}\/events\/stream`\)/);
  const cloudBranch = liveClient.indexOf('if(!localRuntime){');
  const desktopPoll = liveClient.indexOf("json('/events?after='");
  assert.ok(cloudBranch !== -1 && desktopPoll !== -1, 'både moln- och desktopvägen ska finnas kvar');
  assert.ok(cloudBranch < desktopPoll, 'molnvägen måste returnera innan desktop-pollningen definieras');
});

test('Studio cannot claim a demo TikTok connection', () => {
  assert.doesNotMatch(read('studio.js'), /@demo|Ansluten i demoläge/);
});

test('account identity and plan have a production updater', () => {
  const html = read('studio.html');
  const profile = read('account-profile.js');
  assert.match(html, /account-profile\.js/);
  assert.match(profile, /vyra-auth-ready/);
  assert.match(profile, /Premium · aktiv/);
});

test('overview starts empty instead of presenting fake live statistics', () => {
  const overview = read('overview-premium.js');
  for (const fake of ['1 284', '84 730', '2 406', '3 842 kr', '@alex']) {
    assert.doesNotMatch(overview, new RegExp(fake.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(overview, /Visas under riktig LIVE/);
});

test('Overlay routing opens the real editor instead of an undefined view', () => {
  const safeLayout = read('layout-safe.js');
  assert.match(safeLayout, /nextView === 'overlay'/);
  assert.match(safeLayout, /VyraOverlayPreviewReady/);
  const preview = read('overlay-preview.js');
  assert.match(preview, /get\('open'\) === 'overlay'/);
  assert.match(preview, /go\('overlay'\)/);
});

test('Overlay catalog does not render every premium thumbnail on page load', () => {
  const preview = read('overlay-preview.js');
  assert.match(preview, /new IntersectionObserver/);
  assert.match(preview, /owgThumbObserver\.observe\(btn\)/);
  assert.match(preview, /location\.href = 'layout\.html'/);
});

test('direct Layout access uses the same account and Premium gate as Studio', () => {
  const layout = read('layout.html');
  const studio = read('studio.html');
  assert.match(layout, /new URL\('studio\.html'/);
  assert.match(layout, /searchParams\.set\('open', 'layout'\)/);
  assert.match(studio, /auth-client\.js/);
  assert.match(studio, /entitlement-gate\.js/);
  assert.match(studio, /account-profile\.js/);
});

test('Layout uses the full Studio widget renderer instead of the standalone prototype', () => {
  const safeLayout = read('layout-safe.js');
  assert.match(safeLayout, /get\('open'\) === 'layout'/);
  assert.match(safeLayout, /items\.map\(wh\)/);
  assert.match(safeLayout, /aria-current/);
});

test('the desktop installer redirect requires login, a verified email, and an active Premium plan', () => {
  const src = read('server/index.js');
  const route = src.match(/if\(p==='\/api\/downloads\/windows'&&req\.method==='GET'\)\{[\s\S]*?return res\.end\(\)\}/);
  assert.ok(route, 'download route not found in server/index.js');
  const body = route[0];
  // meta=1 (landing-page version/size blurb) stays public — only the real .exe handoff is gated
  assert.match(body, /if\(u\.searchParams\.get\('meta'\)==='1'\)return send\(res,200,/);
  assert.match(body, /const dls=await session\(req\);if\(!dls\)return send\(res,401,/);
  assert.match(body, /if\(!dls\.email_verified_at\)return send\(res,403,/);
  assert.match(body, /Billing\.entitlement\(pool,dlWorkspaceId\)/);
  assert.match(body, /if\(dlEnt\.plan!=='premium'\)return send\(res,402,/);
});

