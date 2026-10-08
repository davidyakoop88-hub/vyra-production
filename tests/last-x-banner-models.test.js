'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(ROOT, 'last-x-alerts.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'last-x-alerts.css'), 'utf8');
const factory = require(path.join(ROOT, 'widget-factory.js'));

const MODELS = {
  crownBanner: 'crown-banner.png',
  royalAmethyst: 'royal-amethyst.png',
  iceKing: 'ice-king.png',
  neonCyber: 'neon-cyber.png',
  dragonFlame: 'dragon-flame.png',
  angelGold: 'angel-gold.png'
};

test('alla sex bannerdesigner kan skapas och har en separat alfaram', () => {
  for (const [model, file] of Object.entries(MODELS)) {
    const widget = factory.create(`catalog:lastx:${model}`);
    assert.equal(widget.type, 'templateLastX');
    assert.equal(widget.lastXDesign, model);
    assert.match(js, new RegExp(`${model}: '${file.replace('.', '\\.')}''?`.replace("''", "'")));
    assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'images', 'last-x', file)), file);
    assert.match(css, new RegExp(`design-${model}`));
  }
});

test('Last Follower är en riktig valbar och routad Last-X-typ', () => {
  assert.match(js, /follower:\s*\{/);
  assert.match(js, /events:\s*\['follow'\]/);
  assert.match(js, /showLastX\('follower', event\)/);
});

test('senaste LIVE-personen sparas och kan ligga kvar på skärmen', () => {
  assert.match(js, /w\.lastXLatest\s*=\s*Object\.assign/);
  assert.match(js, /last-x-sticky/);
  assert.match(js, /id="lastXPersistent"/);
  assert.match(css, /\.last-x-widget\.last-x-sticky/);
});
