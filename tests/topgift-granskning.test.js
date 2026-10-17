'use strict';
// Granskningen av Top Gifter Royal Gold och Neon Purple (2026-10-17).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

test('GIFT EDITOR har inget eget Typsnitt — panelen ska bara ha ett (TEXT-gruppens)', () => {
  const media = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
  assert.ok(!/id="universalFont"/.test(media), 'två Typsnitt i samma panel: TEXT vann tyst över GIFT EDITOR');
  assert.ok(/id="universalFontStyle"/.test(media), 'Textstil (kursiv) finns bara i GIFT EDITOR och ska ligga kvar');
});

test('Top Gift-namnet krymper för att få plats innan det får ellips', () => {
  const src = fs.readFileSync(path.join(ROOT, 'ranking-sixpack.js'), 'utf8');
  assert.match(src, /function passaNamn\(el\)/);
  assert.match(src, /\.premium-topgift \.topgift-copy strong/);
  assert.match(src, /grund \* 0\.6/, 'ner till 60 % av grundstorleken');
});
