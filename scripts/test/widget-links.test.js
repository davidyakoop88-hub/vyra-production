const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const preview = fs.readFileSync(path.join(root, 'overlay-preview.js'), 'utf8');
const media = fs.readFileSync(path.join(root, 'media.js'), 'utf8');

test('individual widget links retain the secure access token and widget id', () => {
  assert.match(preview, /overlayShareUrl\(widgetId\)/);
  assert.match(media, /searchParams\.set\('widget',widgetId\)/);
  assert.match(media, /get\('widget'\)/);
});

test('every active layout widget has its own copy-link control', () => {
  assert.match(preview, /data-copy-widget-link="\$\{w\.id\}"/);
  assert.match(preview, /owgCopyWidgetLink\(button\.dataset\.copyWidgetLink\)/);
});

test('catalog link creates the widget and copies only that widget', () => {
  assert.match(preview, /originalClick\.call\(btn, e\)/);
  assert.match(preview, /await owgCopyWidgetLink\(widgetId\)/);
});

test('copying has a fallback when the Clipboard API is unavailable', () => {
  assert.match(preview, /navigator\.clipboard\?\.writeText/);
  assert.match(preview, /document\.execCommand\('copy'\)/);
});
