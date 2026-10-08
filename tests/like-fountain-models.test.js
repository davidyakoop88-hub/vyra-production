const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const media = fs.readFileSync(path.join(root, 'media.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'studio.css'), 'utf8');
const factory = fs.readFileSync(path.join(root, 'widget-factory.js'), 'utf8');

const models = [
  ['classic', 'Classic'],
  ['sakuraFall', 'Sakura Fall'],
  ['neonPulse', 'Neon Pulse'],
  ['goldRush', 'Gold Rush'],
  ['pixelArcade', 'Pixel Arcade'],
  ['galaxyDrift', 'Galaxy Drift'],
  ['bubblePop', 'Bubble Pop'],
  ['ghostHearts', 'Ghost Hearts'],
  ['plasmaCore', 'Plasma Core'],
  ['origami', 'Origami']
];

test('Like Fountain exposes all ten saved VYRA models', () => {
  for (const [key, label] of models) {
    assert.match(media, new RegExp(`${key}:\\{id:'[^']+',name:'${label}'`));
  }
  assert.match(media, /w\.fountainPreset=key/);
  assert.match(media, /save\(\);render\(\);toast\(LIKE_FOUNTAIN_PRESETS/);
});

test('every model receives a dedicated visual class', () => {
  for (const [, label] of models) {
    const slug = label.toLowerCase().replaceAll(' ', '-');
    assert.match(css, new RegExp(`lf-preset-${slug}`), `${label} lacks model CSS`);
  }
  assert.match(media, /lf-preset-'\+preset/);
});

test('viewer avatars are enabled, configurable and refreshed from LIVE data', () => {
  assert.match(factory, /fountainPreset: 'classic'/);
  assert.match(factory, /fountainAvatarHearts: true/);
  assert.match(media, /id="fountainAvatarHearts"/);
  assert.match(media, /querySelectorAll\('\.lf-p-heart-avatar-img'\)/);
  assert.doesNotMatch(css, /TOP LIKER"\]\{display:none/);
});
