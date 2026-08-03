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
  // The ?widget= read moved out of media.js. It used to build every widget and then hide all but
  // one with display:none; the selection now happens before the markup is built, in studio.js's
  // vyraRenderWidgets(), so the parameter is read there instead.
  const studio = fs.readFileSync(path.join(root, 'studio.js'), 'utf8');
  assert.match(studio, /params\.get\('widget'\)/);
  assert.match(studio, /VyraWidgets\.selectForRender\(state\.widgets,\{widgetId:wanted\}\)/);
});

test('every active layout widget has its own copy-link control', () => {
  assert.match(preview, /data-copy-widget-link="\$\{w\.id\}"/);
  assert.match(preview, /owgCopyWidgetLink\(button\.dataset\.copyWidgetLink\)/);
});

test('the catalog link button goes through the standalone flow, not the layout handler', () => {
  // The old flow ran the catalog button's own onclick and copied a link to whatever that produced —
  // a layout widget. 🔗 now creates a standalone instance from the key the button already carries,
  // and copies the id the flow returns. The layout button is the one that still calls originalClick.
  const linkHandler = preview.slice(preview.indexOf("linkBtn.onclick"), preview.indexOf('const row ='));
  assert.match(linkHandler, /const catalogKey = btn\.dataset\.catalogKey/);
  assert.match(linkHandler, /window\.VyraStandalone\.create\(catalogKey\)/);
  assert.match(linkHandler, /await owgCopyWidgetLink\(result\.widget\.id\)/);
  assert.ok(!linkHandler.includes('originalClick'),
    '🔗 kör fortfarande katalogknappens layouthandler');

  // The key is the only input, and a button without one creates nothing at all.
  assert.match(linkHandler, /if \(!catalogKey\) return toast\(/);
  assert.ok(linkHandler.indexOf('if (!catalogKey)') < linkHandler.indexOf('VyraStandalone.create'),
    'nyckeln kontrolleras inte före skapandet');

  // Baseline-red: the shape this replaced would fail every assertion above.
  const OLD_FLOW = "linkBtn.onclick = async e => { originalClick.call(btn, e);" +
    " const widgetId = state.widgets[state.widgets.length - 1].id;" +
    " await owgCopyWidgetLink(widgetId); };";
  assert.ok(!/const catalogKey = btn\.dataset\.catalogKey/.test(OLD_FLOW));
  assert.ok(OLD_FLOW.includes('originalClick'));
});

test('the layout button is untouched and still creates a layout widget', () => {
  // Both paths exist side by side: 🔗 is standalone, the card itself stays layout. Losing this is how
  // an existing layout widget would start consuming a second instance and a second quota slot.
  assert.match(preview, /originalClick\.call\(btn, e\)/);
  assert.match(media, /VyraWidgets\.create\(catalogKey/);
});

test('copying has a fallback when the Clipboard API is unavailable', () => {
  assert.match(preview, /navigator\.clipboard\?\.writeText/);
  assert.match(preview, /document\.execCommand\('copy'\)/);
});
