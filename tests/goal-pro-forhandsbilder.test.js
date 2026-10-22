'use strict';
// GOAL PRO: EN FÖRHANDSBILD PER MODELL — RÖTT FÖRST (2026-10-11).
//
// DAVIDS ORD, med en skärmbild av katalogen: "kolla genom de att de funkar och varje modell för sig
// själv". Uppmätt: alla åtta Goal Pro-korten visade SAMMA bild (assets/previews/pggoal.jpg,
// familjebilden), medan Top Streak Flip och Top Gifter Podium redan visar sin egen modell. Åtta kort
// med samma bild går inte att skilja åt utan att läsa rubriken.
//
// Bilderna är renderade ur den riktiga widgeten (playground-widgets.js W.goalvar) i Chromium, en
// per design, vid 64 % av målet 2 000 — samma läge som familjebilden — och sparade som 880×440 som
// de andra förhandsbilderna i assets/previews/.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

// 9 = Stående pill (2026-10-11): 7 var två staplar i en ruta, prototypens jämförelseläge.
const DESIGNER = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

test('varje Goal Pro-design har en egen förhandsbild på disk', () => {
  for (const id of DESIGNER) {
    const fil = path.join(ROOT, 'assets', 'previews', `pggoal-${id}.jpg`);
    assert.ok(fs.existsSync(fil), `${fil} saknas`);
    assert.ok(fs.statSync(fil).size > 5000, `${fil} är misstänkt liten`);
  }
  // Åtta olika bilder, inte åtta kopior.
  const md5 = f => require('crypto').createHash('md5').update(fs.readFileSync(f)).digest('hex');
  const hashar = new Set(DESIGNER.map(id => md5(path.join(ROOT, 'assets', 'previews', `pggoal-${id}.jpg`))));
  assert.equal(hashar.size, 9, 'minst två designer delar bild');
});

test('katalogen pekar varje Goal Pro-kort på sin egen bild', () => {
  const src = fs.readFileSync(path.join(ROOT, 'playground-widgets.js'), 'utf8');
  assert.match(src, /goal: \(\) => schemaOf\('goal'\)[^\n]*bild: 'assets\/previews\/pggoal-' \+ id \+ '\.jpg'/,
    'MODELLER.goal ska ge varje design pggoal-<id>.jpg, inte familjebilden');
  assert.doesNotMatch(src, /goal: \(\) => schemaOf\('goal'\)[^\n]*bild: 'assets\/previews\/pggoal\.jpg'/);
});

test('cachebusten höjdes med filen', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8'), /playground-widgets\.js\?v=20261022-2/);
});
