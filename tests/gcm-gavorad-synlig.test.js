'use strict';
// Gift Campaign · Fokus och Classic: gåvoraden under den stora gåvan måste synas i sändningen.
//
// Raden låg på opacity:.45 för alla gåvor utom den aktiva. Mot studions mörka rutbakgrund såg det
// okej ut, men i TikTok LIVE ligger raden över kamerabilden och gåvorna försvann (David 2026-11-22).
// Den aktiva gåvan märks nu på storlek och sken, aldrig på att de andra tonas bort.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'gift-campaign-modeller.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const regler = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ val: m[1].trim(), kropp: m[2] }));

test('ingen regel för gåvoradens gåvor tonar ner dem', () => {
  const rad = regler.filter(r => /\.gcm-ko\s+(span|img)/.test(r.val));
  assert.ok(rad.length >= 2, 'hittade inte gåvoradens regler i gift-campaign-modeller.css');
  for (const r of rad) {
    const o = r.kropp.match(/(?:^|;)\s*opacity\s*:\s*([\d.]+)/);
    if (o) assert.equal(Number(o[1]), 1, `${r.val} har opacity ${o[1]} — raden försvinner mot kamerabilden i LIVE`);
  }
});

test('gåvorna har en mörk skugga som ger kontrast mot ljus bakgrund', () => {
  const bas = regler.find(r => /^\.vyra-gcm \.gcm-ko span$/.test(r.val));
  assert.ok(bas, 'grundregeln för .gcm-ko span saknas');
  assert.match(bas.kropp, /filter\s*:[^;]*drop-shadow/, 'gåvorna saknar skugga');
});

test('den aktiva gåvan märks på storlek, inte på att de andra tonas', () => {
  const aktiv = regler.find(r => /^\.vyra-gcm \.gcm-ko span\.gcm-aktiv$/.test(r.val));
  assert.ok(aktiv, 'regeln för den aktiva gåvan saknas');
  assert.match(aktiv.kropp, /transform\s*:\s*scale\(/, 'den aktiva gåvan förstoras inte');
});

test('media.js laddar den nya stilen', () => {
  const media = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
  assert.match(media, /gift-campaign-modeller\.css\?v=20261122-1/, 'stilfilens version är inte höjd — webbläsare behåller den gamla raden');
});
