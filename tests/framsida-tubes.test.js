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

// 757 KB (774 791 byte) WebGL-modul. Uppmätt 2026-11-09 med statisk import: hämtades även på telefoner,
// där det inte finns någon pekare att följa, och blockerade huvudtråden 4,6 s vid start och 18 s
// av 10 s vila på mobil utan grafikkort (7 s / 22 s på dator) — mot 0 ms utan modulen.
test('modulen hämtas bara med riktig mus, först efter laddningen, och i skärmens egen upplösning', () => {
  const js = las('landing-tubes.js');
  assert.doesNotMatch(js, /^\s*import\s+\w+\s+from\s/m,
    'statisk import: 757 KB laddas före allt annat, även på telefoner och vid minskad rörelse');
  assert.match(js, /import\(\s*MODUL\s*\)/, 'modulen ska laddas med dynamisk import(MODUL)');
  assert.match(js, /\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/,
    'saknar musvakten — en pekskärm har ingen pekare för strimman att följa');
  assert.match(js, /addEventListener\(\s*'load'/, 'modulen ska vänta tills sidan laddat klart');
  assert.match(js, /minPixelRatio\s*=/, 'biblioteket ritar alltid i 2x — ska följa skärmens egen upplösning');
  // Biblioteket mäter sin FÖRÄLDER (size: 'parent'). Låg duken direkt i <body> blev den hela sidans
  // höjd — 1440x3404 på en skärm som visar 1440x900, nästan fyra gånger fler pixlar än någon ser.
  // En egen fönsterstor ruta runt duken gör föräldern lika stor som det synliga.
  const index = las('index.html');
  assert.match(index, /<div class="tubes-fx"[^>]*>\s*<canvas id="tubes-fx"/,
    'duken ligger inte i en egen fönsterstor ruta — då ritar biblioteket hela sidans höjd');
  // Utan grafikkort ritas WebGL i processorn: uppmätt 1-4 bilder/s även efter de andra vakterna.
  assert.match(js, /swiftshader\|llvmpipe/i, 'saknar vakten mot mjukvaruritare (ingen grafikacceleration)');
  // Ordningen: vakterna FÖRE import(), annars hämtas modulen ändå.
  const vakt = js.search(/pointer:\s*fine/), hamtning = js.search(/import\(\s*MODUL/);
  assert.ok(vakt >= 0 && hamtning > vakt, 'musvakten måste stå före hämtningen');
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
