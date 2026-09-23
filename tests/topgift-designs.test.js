'use strict';
// TOP GIFTER · TVA DESIGNVAL (2026-09-23).
//
// David, efter att ha sett alla 21: "behall neon, royal o ta bort resten". Skalet syns i den
// matning som gjordes innan: ALLA 21 delade EN renderare och EN markup — det renderaren skickar ut
// ar alltid `<div class="topgift-ornament"><i></i><i></i><i></i></div>`, tre tomma lador och en
// accentfarg. Varje "design" var ett satt att forma just de tre, och fem av dem bar en enda
// CSS-regel var. Formen var slut; fler varianter hade inte hjalpt.
//
// Proven nedan ar kvar och mater samma regler pa tva designer som de gjorde pa 21. De tre som
// mätte de fyra tunnaste (hall, throne, champion, arch) ar borttagna med dem — ett prov som
// filtrerar over namn som inte finns ar gront av tomhet, inte av att regeln haller.
//
// HISTORIKEN, som forklarar varfor proven ser ut som de gor:
//
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

test('katalogen har tva designval', () => {
  assert.deepEqual(designval(), ['royal', 'neon'],
    'antalet eller ordningen i katalogen har andrats — se docs/topgift-gallringen.md');
});

test('katalogen och fabriken erbjuder samma designer', () => {
  // TOP_GIFTS i premium-final.js ar en DUBBLETT av widget-factory.js variants('topgift.premium').
  // Top Streak fick exakt det felet: "en dubblerad lista ar precis det som gled isar". Listan star
  // kvar som literal for att provet ovan ska kunna lasa den — men de tva far aldrig saga olika
  // saker, for det ar katalogen anvandaren ser och fabriken som bygger.
  const vm = require('vm');
  const root = { document: { addEventListener: () => {}, querySelectorAll: () => [] } };
  root.window = root;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'widget-factory.js'), 'utf8'), root,
    { filename: 'widget-factory.js' });
  assert.deepEqual(designval().sort(),
    Object.keys(root.VyraWidgets.variants('topgift.premium')).sort(),
    'katalogen i premium-final.js och fabrikens varianttabell sager olika saker');
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
//
// Tre prov las har tidigare hall, throne, champion och arch: att de fyra tunnaste fatt en egen
// siluett, att var och en har en egen signaturrorelse, och att varje rorelse har sina keyframes.
// Alla fyra designerna pensionerades 2026-09-23, och ett prov som filtrerar over namn som inte
// finns ar gront av tomhet. De togs darfor bort med dem, inte lamnade kvar som gron dekoration.
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
