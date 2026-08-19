'use strict';
// Framsidans ljusstrimma — Tubes-markören bakom muspekaren. Skrivet RÖTT FÖRST.
//
// Effekten är TubesCursor ur threejs-components (samma bibliotek och mönster som konkurrenten
// tikscan.live använder): en helskärmsduk fixed på z 0 bakom innehållet, Three.js-tuber som
// jagar pekaren, bloom för glöden. Framsidan bär redan ett CDN-laddat Three.js-hero
// (home-3d.js → unpkg), så CDN-modulen följer husets etablerade mönster.
//
// TVÅ HÅRDA REGLER provet vaktar:
//   1. Effekten är en LANDNINGSSIDE-förstärkning — studio.html får ALDRIG referera den
//      (OBS-vägen ?overlay=1 går genom studio.html, och sändningsytan ska vara transparent
//      och lätt; 774 KB WebGL i overlayn vore en driftskada).
//   2. prefers-reduced-motion respekteras — samma vakt som home-3d.js redan har.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const las = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('framsidan laddar tubes-strimman — och Studio gör det aldrig', () => {
  const index = las('index.html');
  assert.match(index, /<canvas id="tubes-fx"[^>]*aria-hidden="true"/,
    'framsidan saknar tubes-duken (canvas#tubes-fx med aria-hidden)');
  assert.match(index, /landing-tubes\.js\?v=/,
    'framsidan laddar aldrig landing-tubes.js — effekten kan inte existera i drift');
  assert.match(index, /type="module" src="landing-tubes\.js/,
    'landing-tubes.js måste laddas som module (biblioteket är en ES-modul med default-export)');
  const studio = las('studio.html');
  assert.ok(!studio.includes('landing-tubes') && !studio.includes('tubes-fx'),
    'studio.html refererar tubes-effekten — OBS-vägen går genom studio.html och ska vara ren');
});

test('strimman respekterar prefers-reduced-motion och ligger bakom innehållet', () => {
  const js = las('landing-tubes.js');
  assert.match(js, /prefers-reduced-motion:\s*reduce/,
    'landing-tubes.js saknar reduced-motion-vakten — home-3d.js-mönstret gäller');
  const css = las('styles.css');
  assert.match(css, /\.tubes-fx\{[^}]*position:fixed/,
    'duken är inte fixed — den ska täcka hela fönstret bakom innehållet');
  assert.match(css, /\.tubes-fx\{[^}]*z-index:0/,
    'duken ligger inte på z 0 — innehållet ovanpå lyfts till z 1');
});
