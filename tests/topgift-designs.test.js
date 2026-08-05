'use strict';
// TOP GIFTER · 21 DESIGNVAL — men bara 8 unika utseenden.
//
// Uppmatt i produktion: alla 21 renderade samtidigt, beraknad stil jamford over hela widgettradet.
//
//   1 st:  royal
//   12 st: neon, cyber, glass, sakura, fire, ice, galaxy, aurora, retro, goldrush, signal, fireworks
//   2 st:  hall, throne        2 st: champion, arch
//   1 st:  pedestal   1 st: phoenix   1 st: bloom   1 st: comet
//
// Orsaken ar ett klassnamnsbyte. Widgeten ritades en gang med klassen theme-<namn>. Sedan tog
// vyraTopGift i premium-final.js over renderingen och ritar topgift-<namn> i stallet. CSS:en
// foljde inte med:
//
//   royal..goldrush (11 st)   0 regler under .topgift-*   80 regler under .theme-*
//   hall..comet     (10 st)  12 regler under .topgift-*    0 regler under .theme-*
//
// De 80 reglerna ar oatkomliga. Raknat i webblasaren: NOLL element far nagonsin en theme-*-klass.
// De elva ursprungliga designerna har alltsa ingen styling kvar och ritas alla likadant.
//
// Samma sort som gavobilderna: ena sidan bytte namn, den andra hangde inte med, ingenting gick
// sonder hogljutt - det slutade bara se ut som nagot.
//
// ROTT NU.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const CSS = fs.readdirSync(ROOT).filter(f => f.endsWith('.css'))
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
const PREMIUM = fs.readFileSync(path.join(ROOT, 'premium-final.js'), 'utf8');

// Katalogen som anvandaren ser, last ur koden och inte handskriven - annars kan listan och
// verkligheten glida isar utan att nagot sager till.
function designval() {
  const m = PREMIUM.match(/TOP_GIFTS=\{[\s\S]*?\n\s*\};?/);
  assert.ok(m, 'TOP_GIFTS hittades inte i premium-final.js');
  return [...m[0].matchAll(/([a-zA-Z0-9_-]+)\s*:/g)].map(x => x[1]);
}

// Klassen renderaren faktiskt satter.
const KLASS = namn => 'topgift-' + namn;
const regler = (prefix, namn) =>
  (CSS.match(new RegExp('\\.' + prefix + '-' + namn + '(?![a-z0-9-])', 'g')) || []).length;

test('katalogen har 21 designval', () => {
  assert.equal(designval().length, 21, 'antalet i katalogen har andrats — rubriken sager 21');
});

test('varje designval har CSS under den klass renderaren satter', () => {
  const utan = designval().filter(namn => regler('topgift', namn) === 0);

  assert.deepEqual(utan, [],
    'dessa designval ritas utan egen styling och ser darfor likadana ut:\n' +
    utan.map(n => `  ${n}  (${regler('theme', n)} regler ligger kvar under .theme-${n})`).join('\n'));
});

test('inga regler ligger kvar under den gamla theme-klassen', () => {
  // theme-* satts inte langre av nagon renderare. Regler kvar dar ar dod vikt som dessutom ser
  // ut att vara en fungerande design nar man laser filen.
  const kvar = [...CSS.matchAll(/\.vyra-topgift\.theme-([a-z0-9-]+)/g)].map(m => m[1]);

  assert.deepEqual([...new Set(kvar)], [],
    `dessa selektorer kan aldrig matcha nagot element: ${[...new Set(kvar)].join(', ')}`);
});

test('renderaren satter fortfarande topgift-klassen — testet mater ratt sak', () => {
  // Om renderaren byter namn igen ska DET har testet falla, inte de ovanfor med en gatfull
  // forklaring.
  assert.match(PREMIUM, /premium-topgift topgift-\$\{style\}/,
    'vyraTopGift satter inte langre topgift-<namn>; testerna ovan mater fel klass');
});

// ---- DOM-kontraktet som de aterupplivade reglerna hanger pa -------------------------------------
// Reglerna skrevs mot den GAMLA renderarens DOM. De flesta krokarna finns kvar, men strong har
// flyttat in i .topgift-copy - en regel som star pa `>strong` traffar darfor ingenting langre.
test('reglerna pekar bara pa krokar som renderaren faktiskt producerar', () => {
  const krokar = ['vyra-flip', 'vyra-gift-title', 'vyra-gift-face', 'vyra-profile-face', 'topgift-copy'];
  const saknas = krokar.filter(k => !PREMIUM.includes(k));

  assert.deepEqual(saknas, [], `renderaren producerar inte: ${saknas.join(', ')}`);
  assert.equal(/\.vyra-topgift\.topgift-[a-z0-9-]+>strong/.test(CSS), false,
    'en regel star pa >strong, men strong ligger numera inuti .topgift-copy och natt aldrig');
});
