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

// STÅENDE FOKUS OCH CLASSIC: raden har 86 px. Textblocket var 78–95 px, målraden bröts på två rader och masken
// tonade bort namnet överst. Uppmätt i Chromium efter rättningen: 62–65 px av 74 px, målraden på en rad.
const regel = val => (regler.find(r => r.val === val) || {}).kropp || '';
const px = (kropp, prop) => { const m = kropp.match(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([\\d.]+)px')); return m ? Number(m[1]) : NaN; };

test('stående: målraden och namnet bryts aldrig på två rader', () => {
  assert.match(regel('.vyra-gcm .gcm-rad .gcm-mal'), /white-space\s*:\s*nowrap/, '"av 250 · 170 kvar" kan brytas och spränga raden');
  assert.match(regel('.vyra-gcm .gcm-rad .gcm-namn'), /white-space\s*:\s*nowrap/, 'ett långt gåvonamn kan brytas och spränga raden');
});

test('stående: textblocket ryms i radens 86 px', () => {
  const namn = regel('.vyra-gcm .gcm-rad .gcm-namn'), num = regel('.vyra-gcm .gcm-rad .gcm-num'), mal = regel('.vyra-gcm .gcm-rad .gcm-mal');
  const lh = k => Number((k.match(/line-height\s*:\s*([\d.]+)/) || [])[1]);
  const hojd = px(namn, 'font-size') * lh(namn) + px(namn, 'margin-bottom') + px(num, 'font-size') * lh(num) +
    px(mal, 'margin-top') + px(mal, 'font-size') * lh(mal) + px(regel('.vyra-gcm .gcm-rad .gcm-bar'), 'margin-top') + 2;
  assert.ok(Number.isFinite(hojd), 'kunde inte läsa radens mått');
  assert.ok(hojd <= 86 - 12, `textblocket blir ${hojd.toFixed(1)} px — raden har 74 px innanför sin utfyllnad`);
});

test('stående: masken tonar bara kanten, inte grannradernas text', () => {
  const m = regel('.vyra-gcm .gcm-lista').match(/mask-image\s*:\s*linear-gradient\(transparent,#000 ([\d.]+)%/);
  assert.ok(m, 'listans mask saknas');
  assert.ok(Number(m[1]) <= 3, `masken tonar ${m[1]} % — namnet på raden överst försvinner`);
});

// LIGGANDE GÅVOFLÖDE: gåvorna längst ut står alltid halvvägs utanför fönstret. Med 6 % mask skars talen av hårt.
test('liggande Gåvoflöde: kanterna tonas över ungefär en gåvas bredd', () => {
  const m = regel('.vyra-gcm[data-orient=landscape] .gcm-flode').match(/mask-image\s*:\s*linear-gradient\(90deg,transparent,#000 ([\d.]+)%/);
  assert.ok(m, 'liggande flödets mask saknas');
  assert.ok(Number(m[1]) >= 15, `masken tonar bara ${m[1]} % — gåvorna i kanten skärs av i stället för att tonas ut`);
});

test('liggande Gåvoflöde: talen är mindre än avståndet mellan gåvorna', () => {
  const stor = px(regel('.vyra-gcm[data-orient=landscape] .gcm-mini'), 'font-size');
  const liten = px(regel('.vyra-gcm[data-orient=landscape] .gcm-mini small'), 'font-size');
  assert.ok(stor <= 21 && liten <= 14, `talen är ${stor}/${liten} px — "80 / 250" blev 72 px brett med 82 px mellan gåvorna`);
});

// STÅENDE GÅVOFLÖDE: med 7 % mask syntes ett tal överst utan sin gåva och en gåva nederst utan sitt tal.
test('stående Gåvoflöde: kanterna tonas över ungefär en gåvas höjd', () => {
  const m = regel('.vyra-gcm[data-orient=portrait] .gcm-flode').match(/mask-image\s*:\s*linear-gradient\(transparent,#000 ([\d.]+)%/);
  assert.ok(m, 'stående flödets mask saknas');
  assert.ok(Number(m[1]) >= 20, `masken tonar bara ${m[1]} % — halva gåvor syns i över- och underkant`);
});

test('media.js laddar den nya stilen', () => {
  const media = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
  assert.match(media, /gift-campaign-modeller\.css\?v=20261122-1/, 'stilfilens version är inte höjd — webbläsare behåller den gamla raden');
});
