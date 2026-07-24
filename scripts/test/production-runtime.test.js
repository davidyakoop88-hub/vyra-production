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
  assert.match(liveClient, /Öppna VYRA Desktop för att ansluta TikTok LIVE/);
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
  assert.match(preview, /const thumbHtml = null/);
  assert.match(preview, /explicitly presses Preview/);
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

