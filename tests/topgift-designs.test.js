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

// ---- ingen design far vara en kopia av en annan -------------------------------------------------
// Efter omdopningen gick 8 -> 18 unika utseenden, men fyra designval var fortfarande kopior:
// hall delade sin ENDA regel med throne, och champion sin med arch. De var inte trasiga, bara
// aldrig fardigritade.
//
// Jamforelsen sker pa REGELUPPSATTNING och inte pa beraknad stil: jsdom kan inte lasa
// pseudoelement, och temana ligger till stor del i :before och :after. En matning som missar dem
// sager "identiska" om tva designer som i sjalva verket skiljer sig - det hande, och sa foll
// signal felaktigt ut som en kopia av cyber.
const ALLA_TEMAN = () => designval();
const CSS_REGLER = [...CSS.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), dekl: m[2].trim() }));

function regeluppsattning(tema, teman) {
  // ALLA temanamn normaliseras bort, inte bara det aktuella - annars ser en regel som DELAS av tva
  // teman olika ut for dem, och de raknas felaktigt som unika.
  const alla = new RegExp('\\.topgift-(' + teman.join('|') + ')(?![a-z0-9-])', 'g');
  return CSS_REGLER
    .filter(r => new RegExp('\\.topgift-' + tema + '(?![a-z0-9-])').test(r.sel))
    .map(r => r.sel.replace(alla, '.T') + '{' + r.dekl + '}')
    .sort().join('\n');
}

test('inga tva designval har identisk styling', () => {
  const teman = ALLA_TEMAN();
  const per = {};
  for (const t of teman) (per[regeluppsattning(t, teman)] ||= []).push(t);
  const kopior = Object.values(per).filter(x => x.length > 1);

  assert.deepEqual(kopior, [],
    'dessa designval ser likadana ut for anvandaren:\n' +
    kopior.map(x => '  ' + x.join(' = ')).join('\n'));
});

test('de fyra tunnaste designvalen har fatt en egen siluett', () => {
  const teman = ALLA_TEMAN();
  const tunna = ['hall', 'throne', 'champion', 'arch'].filter(t => {
    const n = regeluppsattning(t, teman);
    return !n || n.split('\n').length < 3;
  });

  assert.deepEqual(tunna, [],
    `dessa har farre an tre regler och kan darfor inte ha en egen form: ${tunna.join(', ')}`);
});

test('varje ny design har en egen signaturrorelse', () => {
  // VYRA:s designsprak: egen siluett OCH egen rorelse per design. Delar tva designer animation
  // ar de inte sarskilda i rorelse, bara i farg.
  const rorelser = {};
  for (const t of ['hall', 'throne', 'champion', 'arch']) {
    const namn = [...regeluppsattning(t, ALLA_TEMAN()).matchAll(/animation:\s*(?!none\b)([a-zA-Z][\w-]*)/g)]
      .map(m => m[1]);
    assert.ok(namn.length, `${t} har ingen animation alls`);
    namn.forEach(n => (rorelser[n] ||= []).push(t));
  }
  const delade = Object.entries(rorelser).filter(([, t]) => new Set(t).size > 1);

  assert.deepEqual(delade.map(([n, t]) => n + ': ' + [...new Set(t)].join(', ')), [],
    'dessa designer delar rorelse');
});

test('varje rorelse har sina keyframes', () => {
  const anvanda = new Set();
  for (const t of ['hall', 'throne', 'champion', 'arch']) {
    [...regeluppsattning(t, ALLA_TEMAN()).matchAll(/animation:\s*(?!none\b)([a-zA-Z][\w-]*)/g)]
      .forEach(m => anvanda.add(m[1]));
  }
  const saknas = [...anvanda].filter(n => !new RegExp('@keyframes\\s+' + n + '\\b').test(CSS));

  assert.deepEqual(saknas, [],
    `dessa animationer namnges men har inga keyframes, sa ingenting ror sig: ${saknas.join(', ')}`);
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
