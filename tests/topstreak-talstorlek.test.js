'use strict';
// TOP STREAK · DESIGN 1–3: TALET ÄR LIKA STORT SOM "×" OCH "STREAK" (sändningen 2026-10-21: "×₂₀ STREAK").
// studio.css ger varje .widget b font-size:12px. Talet ligger i ett eget <b> (livepatchen skriver bara det),
// så det stod fast på 12 px medan texten runt följde widgetens storlek. Uppmätt före: em 14–18 px, b 12 px.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'topstreak-designer.css'), 'utf8');

test('talet i Top Streak Design 1–3 ärver storleken från raden', () => {
  assert.match(css, /\.vyra-streak\.tsd \.approved-streak-copy em b\{[^}]*font-size:inherit!important/);
  assert.match(css, /\.vyra-streak\.tsd \.approved-streak-copy em b\{[^}]*display|\.vyra-streak\.tsd \.approved-streak-copy em b,\.vyra-streak\.tsd \.approved-streak-copy em small\{display:inline!important\}/);
});
