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
  assert.match(js, /'heart-tower':\{name:'Heart Tower',kind:'likes',orientation:'portrait',art:'vertical-like-tube\.png',marker:'vertical-like-emblem\.png',width:100,/,
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
  // Fabriken bumpades för tornet i 20261014-1. Det provet bevisar är att en cachad fabrik INTE kan ge
  // 130 — vilken senare version som helst bevisar samma sak, så kravet är "minst", inte "exakt".
  const v = /widget-factory\.js\?v=(\d{8})-(\d+)/.exec(las('studio.html'));
  assert.ok(v && (+v[1] > 20261014 || (+v[1] === 20261014 && +v[2] >= 1)), 'fabriken ska vara minst 20261014-1');
});

test('ovanför fyllnadsnivån ligger ett mörkt lager, och det vita skenet är borta', () => {
  const js = las('goal-motion.js'), css = las('goal-motion.css');
  assert.match(js, /<div class="goal-motion-livefill" data-goal-fill><\/div><div class="goal-motion-dim" data-goal-dim><\/div>/,
    'markupen saknar goal-motion-dim efter livefill');
  const dim = /\.goal-motion-portrait \.goal-motion-dim\{([^}]*)\}/.exec(css);
  assert.ok(dim, 'CSS-regeln för goal-motion-dim saknas');
  assert.match(dim[1], /bottom:calc\(5% \+ var\(--goal-fill\)\*\.85\)/, 'lagrets underkant ska följa fyllnadsnivån exakt som livefill');
  assert.match(dim[1], /background:rgba\(0,0,0,\.[5-9]\d*\)/, 'lagret ska släcka konsten tydligt');
  // Det vita skenet är borta i porträtt: oskarpt vitt utanför röret ("vad är den vita skuggan").
  assert.match(css, /\.goal-motion-portrait \.goal-motion-livefill\{display:none\}/);
  // Landskap och cirkel rörs inte: lagret är bara definierat för porträtt.
  assert.doesNotMatch(css, /\.goal-motion-(landscape|circle) \.goal-motion-dim/);
});

test('hjärtat i mitten är markören som glider med nivån', () => {
  // Davids ord: "målet är den hjärta i mitten ska vara den som visar hur mycket man har tappat".
  const js = las('goal-motion.js'), css = las('goal-motion.css');
  assert.match(js, /'heart-tower':\{[^}]*art:'vertical-like-tube\.png',marker:'vertical-like-emblem\.png'/, 'tornet ska rita röret utan emblem och emblemet separat');
  for (const f of ['vertical-like-tube.png', 'vertical-like-emblem.png']) assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'goal-motion', f)), f + ' saknas');
  assert.match(js, /goal-motion-marker/, 'markupen saknar markören');
  const m = /\.goal-motion-portrait \.goal-motion-marker\{([^}]*)\}/.exec(css);
  assert.ok(m, 'CSS för markören saknas');
  assert.match(m[1], /bottom:calc\(5% \+ var\(--goal-fill\)\*\.85\)/, 'markören ska stå på exakt samma nivå som fyllningen');
  assert.match(m[1], /translate\(-50%,50%\)/, 'emblemets mittpunkt ska ligga på nivån');
  assert.match(css, /\.goal-heart-tower \.goal-motion-dim::after\{display:none\}/, 'den vita linjen ska bort där hjärtat är markör');
});

test('orbit: nivåringen ligger på konstens ring, i designens färg', () => {
  // Davids granskning vid 100 %: en vit ring med fast storlek (81 % av bredden) hamnade utanför likes-
  // och följarringen och innanför diamantringen. Nu per design, kalibrerat mot renderingen.
  const css = las('goal-motion.css');
  assert.match(css, /\.goal-motion-circle \.goal-motion-livefill\{[^}]*left:50%;top:50%;transform:translate\(-50%,-50%\)/, 'ringen ska vara centrerad på konsten');
  assert.match(css, /\.goal-motion-circle \.goal-motion-livefill\{[^}]*conic-gradient\(from -90deg,var\(--gm-ring\)/, 'färgen ska komma från --gm-ring, inte vara vit');
  assert.match(css, /\.goal-heart-orbit \.goal-motion-livefill\{width:69%;--gm-ring:rgba\(255,105,170,\.95\)\}/);
  assert.match(css, /\.goal-crown-orbit \.goal-motion-livefill\{width:75%;--gm-ring:rgba\(255,200,95,\.95\)\}/);
  assert.match(css, /\.goal-diamond-orbit \.goal-motion-livefill\{width:60%;--gm-ring:rgba\(95,185,255,\.95\)\}/);
});

test('den delade live-uppdateringen skriver ingen inline-bredd på goal-motion-fyllningen', () => {
  // Uppmätt med riktiga frames: cirkelns ring var 0 px vid 0 %, 180 px vid 50 %, 360 px vid 100 % —
  // media.js:s patch satte fill.style.width=pct% på alla [data-goal-fill], även goal-motion, vars
  // geometri redan följer --goal-fill i CSS. Det var den ursprungliga stora ringen vid 100 %.
  assert.match(las('media.js'), /if\(fill&&!node\.classList\.contains\('goal-motion'\)\)fill\.style\.width=pct\+'%';/);
  assert.match(las('studio.html'), /media\.js\?v=20261019-22/);
});

test('premiumbuntens version höjdes med goal-motion-filerna', () => {
  assert.match(las('media.js'), /const version='20261019-3'/);
});
