'use strict';

// De har vakterna ar medvetet källnara. Felet syns forst i en webblasare,
// men orsakerna ar binara: gammal bundle-URL, flera startpunkter eller
// ramkonst bakom widgetens hela stacking context.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('studio och premium-bundlen cachebustas tillsammans', () => {
  const studio = read('studio.html');
  const media = read('media.js');
  // Bumpad 2026-08-13 for Battle MVP-ramarna: andringen lag i media.js och widget-factory.js,
  // och utan ny strang fortsatter en cachad webblasare servera de gamla filerna.
  //
  // Bumpad 2026-08-17 for hero-koreografin, sedan for stack, ribbon, loyalty, badgereveal, hearts, heartbeat och duo — alla atta modeller. Regeln ar densamma
  // varje gang: BARA de strangar vars filer faktiskt andrades. For stack och ribbon ar det tre —
  // studio.css (modellens gamla .fan-active-regler borttagna), media.js (som bar bade sin egen
  // och fan-fas.js:s versionsstrang) och premium-bundlens version, som styr premium-final.css dar
  // faserna bor. widget-factory.js ar orord i bada och behaller sin strang; en bump utan andring
  // ar en gratis omladdning for varje anvandare och gor nasta lasare osaker pa vad som bytts.
  assert.match(studio, /studio\.css\?v=20260817-fan-duo-motet/);
  assert.match(studio, /media\.js\?v=20260817-fan-duo-motet/);
  assert.match(studio, /widget-factory\.js\?v=20260813-gifter-level/);
  assert.match(media, /const version='20260817-fan-duo-motet'/);
  assert.match(media, /fan-fas\.js\?v=20260817-fan-duo-motet/);
});

test('Like Fountain föder alla partiklar från mitten', () => {
  const css = read('studio.css');
  assert.match(css, /\.lf-p\{position:absolute;left:50%;bottom:14px/,
    'varje partikel måste ha samma fysiska startpunkt');
  assert.doesNotMatch(css, /\.lf-p\{position:absolute;left:calc\(50% \+ var\(--ox/,
    'sidledsspridning får inte placera partiklar på olika startpunkter');
  assert.match(css, /@keyframes lfOrganicHeartRise\{\s*0%\{transform:translate\(-50%,10px\)/,
    'organiska hjärtan måste börja i källpunkten innan banan breder ut sig');
});

test('framed Goal har konst bakom innehållet, även stående', () => {
  const css = read('premium-final.css');
  assert.match(css, /\.premium-goal\.goal-framed \.goal-frame-art\{[^}]*z-index:0/);
  assert.match(css, /\.premium-goal\.goal-framed>\.goal-copy,\.premium-goal\.goal-framed>\.goal-track,\.premium-goal\.goal-framed>em\{z-index:1\}/);
  assert.match(css, /\.premium-goal\.goal-framed\.goal-portrait\{min-height:440px/);
  assert.doesNotMatch(css, /\.premium-goal\.goal-framed \.goal-frame-art\{[^}]*z-index:-1/);
});
