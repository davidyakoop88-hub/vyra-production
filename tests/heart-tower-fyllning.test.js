'use strict';
// HEART TOWER: SMALARE OCH EN FYLLNING MAN SER — RÖTT FÖRST (2026-10-11).
//
// DAVIDS ORD, med en skärmbild av tornet: "kan man göra den smalare på bredden och nu som den
// syns att den är på halvväg".
//
// UPPMÄTT I CHROMIUM med riktiga like-frames genom goal-client.js (0 → 250 → 640 → 1 000 likes):
// siffrorna och procenten följde med, fyllnadselementet växte 0 → 556 px — men röret är alltid
// fullt rosa (det är konstverket), och framstegen syntes bara som ett dämpat vitt sken
// (opacity .65, blur 5px). Rörets nedre tredjedel blev ~50 % ljusare vid 1 000 än vid 0. Det går
// inte att se "halvvägs" på håll. Dessutom är likes-tornets konst 247 px bred av 313 (följare- och
// diamanttornen 186/192), så Heart Tower såg bredast ut av de tre vid samma bredd.
//
// Kontraktet: Heart Tower är 100 px bred som standard (inte 130), och ovanför fyllnadsnivån ligger
// ett mörkt lager som släcker konsten, så nivån syns som en gräns mellan mörkt och lysande.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
test.after(() => closeAll());

test('Heart Tower är smalare som standard', () => {
  const js = las('goal-motion.js');
  assert.match(js, /'heart-tower':\{name:'Heart Tower',kind:'likes',orientation:'portrait',art:'vertical-like\.png',width:100,/,
    'heart-tower ska ha width:100 (var 130)');
});

test('fabriken ger samma bredd som katalogknappen, och panelen tillåter den', () => {
  // Två vägar skapar tornet: goal-motion.js:s egen katalogknapp (DESIGNS.width) och VyraWidgets.create
  // (fabrikens GOAL_MOTION_MATT). Uppmätt: fabriken gav fortfarande 130 när DESIGNS sade 100, och
  // panelens Bredd-fält hade min=120 — 100 gick inte ens att skriva in.
  const W = createDom({ url: 'https://vyralive.app/studio.html', state: { widgets: [], projectName: 'torn' } }).window.VyraWidgets;
  assert.equal(W.create('catalog:socialgoal:likes:heart-tower:portrait').width, 100);
  assert.equal(W.create('catalog:socialgoal:followers:crown-tower:portrait').width, 130, 'de andra tornen är orörda');
  assert.match(las('goal-motion.js'), /Bredd<input id="propWidth" type="number" min="80" max="1200"/);
  assert.match(las('studio.html'), /widget-factory\.js\?v=20261011-3/);
});

test('ovanför fyllnadsnivån ligger ett mörkt lager, och skenet är tydligt', () => {
  const js = las('goal-motion.js'), css = las('goal-motion.css');
  assert.match(js, /<div class="goal-motion-livefill" data-goal-fill><\/div><div class="goal-motion-dim" data-goal-dim><\/div>/,
    'markupen saknar goal-motion-dim efter livefill');
  const dim = /\.goal-motion-portrait \.goal-motion-dim\{([^}]*)\}/.exec(css);
  assert.ok(dim, 'CSS-regeln för goal-motion-dim saknas');
  assert.match(dim[1], /bottom:calc\(5% \+ var\(--goal-fill\)\*\.85\)/, 'lagrets underkant ska följa fyllnadsnivån exakt som livefill');
  assert.match(dim[1], /background:rgba\(0,0,0,\.[5-9]\d*\)/, 'lagret ska släcka konsten tydligt');
  const fill = /\.goal-motion-portrait \.goal-motion-livefill\{([^}]*)\}/.exec(css);
  assert.ok(fill);
  assert.match(fill[1], /opacity:(\.9|1)/, 'skenet ska vara tydligt (var .65)');
  // Landskap och cirkel rörs inte: lagret är bara definierat för porträtt.
  assert.doesNotMatch(css, /\.goal-motion-(landscape|circle) \.goal-motion-dim/);
});

test('premiumbuntens version höjdes med goal-motion-filerna', () => {
  assert.match(las('media.js'), /const version='20261011-3'/);
});
