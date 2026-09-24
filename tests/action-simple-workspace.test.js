'use strict';

// Huvudvyn ska vara enkel även när kontot redan har gamla test-actions. De avancerade verktygen
// är inte borttagna — de ska ligga under den hopfällbara panelen så att Action → Event → Overlay
// går att förstå utan en sida med tio tomma OBS-skärmar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('arbetsytan har ett hopfällbart avancerat område', () => {
  const source = read('action-event.js');
  assert.match(source, /class="ae-advanced"/);
  assert.match(source, /data-ae-advanced-body/);
  assert.match(source, /OBS-länkar, testläge, timer och poängsystem/);
  assert.match(source, /Välj skärm i din Action/,
    'tomt konto får inte visa den förvirrande statusen 0\/0 skärmar');
});

test('varje Action har en tydlig väg till sin OBS-länk', () => {
  const source = read('action-event.js');
  assert.match(source, /data-open-action-screen/);
  assert.match(source, />OBS-länk</);
  const scenes = read('action-scenes.js');
  assert.match(scenes, /data-open-action-screen/);
  assert.match(scenes, /\.ae-advanced'\)\.open=true/);
});

test('OBS-panelen listar bara använda scener', () => {
  const scenes = read('action-scenes.js');
  assert.match(scenes, /const usedScenes=\[\.\.\.new Set\(state\.actions\.map/);
  assert.match(scenes, /const scenes=usedScenes\.length\?usedScenes:\[1\]/);
  assert.doesNotMatch(scenes, /Array\.from\(\{length:10\},\(_,i\)=>\{const n=i\+1,count=state\.actions/,
    'tio tomma OBS-kort får inte återinföras i huvudflödet');
});

test('testverktygen monteras under avancerat', () => {
  for (const file of ['action-scenes.js', 'action-timers.js', 'action-simulator.js']) {
    const source = read(file);
    assert.match(source, /querySelector\('\[data-ae-advanced-body\]'\)/,
      `${file} monterar fortfarande i huvudflödet`);
    assert.match(source, /\.append\(section\)/,
      `${file} läggs inte i det avancerade området`);
  }
});
