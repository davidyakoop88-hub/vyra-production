'use strict';
// VAKTEN OVER SKARVNINGEN AV tests/browser/.
//
// Lackagevakten kordes fram till 2026-09-23 som EN process pa EN runner: 57 min 44 s, 82 % av
// test-client-jobbet. Den kors nu i fyra delar parallellt, och da uppstar ett fellage som inte
// fanns forut: en fil kan hamna i INGEN del. Jobbet blir gront anda, for ingen av delarna vet att
// filen finns.
//
// Det ar exakt felet i #352 — ett prov som inte kors svarar "ja" pa fragan om tackning utan att ge
// nagon — och det ar darfor den har filen finns. Den laser BADA sanningarna, skiljaren och
// ci.yml:s matris, och kraver att de tillsammans tacker katalogen precis en gang.
//
// Provet skiljer pa TVA saker, och det ar med flit:
//   TACKNINGEN ar hard. Faller den kors prov som ingen vet inte kordes.
//   BALANSEN ar mjuk. Blir den skev vantar man langre — det kostar minuter, inte tackning.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROT = path.join(__dirname, '..');
const { filer, skarva, delning } = require('../scripts/browser-skarva.js');
const CI = fs.readFileSync(path.join(ROT, '.github', 'workflows', 'ci.yml'), 'utf8');

// ANTALET DELAR LASES UR ci.yml, det skrivs inte har. Hade provet burit sin egen fyra hade en
// andring av matrisen gett en gron vakt over fel uppdelning.
function delarUrCi() {
  const rad = CI.match(/^\s*del:\s*\[([0-9,\s]+)\]\s*$/m);
  assert.ok(rad, 'hittar ingen matris `del: [...]` i ci.yml — har jobbet dopts om?');
  return rad[1].split(',').map(s => Number(s.trim()));
}

test('ci.yml:s matris ar 1..N utan hal', () => {
  const delar = delarUrCi();
  assert.deepEqual(delar, delar.map((_, i) => i + 1),
    `matrisen maste vara 1..${delar.length} i ordning — skiljaren tolkar talet som index`);
});

test('delarna tacker tests/browser/ exakt en gang', () => {
  const delar = delarUrCi();
  const av = delar.length;
  const alla = filer();
  const skarvade = delar.flatMap(del => skarva(del, av));

  const saknas = alla.filter(f => !skarvade.includes(f));
  assert.deepEqual(saknas, [],
    'de har provfilerna hamnar i INGEN del och skulle aldrig koras i CI');

  const dubbletter = skarvade.filter((f, i) => skarvade.indexOf(f) !== i);
  assert.deepEqual(dubbletter, [],
    'de har provfilerna kors i mer an en del — dubbel runner-tid utan dubbel tackning');

  assert.equal(skarvade.length, alla.length);
});

test('ingen del ar tom', () => {
  const delar = delarUrCi();
  const tomma = delar.filter(del => skarva(del, delar.length).length === 0);
  assert.deepEqual(tomma, [],
    'en tom del ar ett gront jobb som inte kort nagot — fler delar an provfiler');
});

// UPPDELNINGEN MASTE VARA DENSAMMA PA ALLA FYRA RUNNERS. De kor var sin process pa var sin maskin
// och kommer overens om vem som tar vad enbart genom att rakna ut samma sak. Blev packningen
// beroende av nagot maskinberoende — katalogordning, tidsstampel, Math.random — hade filer kunnat
// falla mellan stolarna i en korning utan att nagot prov sag det.
test('delningen ar deterministisk', () => {
  const ett = JSON.stringify(delning(4).map(k => k.filer));
  const tva = JSON.stringify(delning(4).map(k => k.filer));
  assert.equal(ett, tva, 'tva anrop gav olika uppdelning — packningen ar inte deterministisk');
});

// BALANSEN AR POANGEN MED SKARVNINGEN. Uppmatt 2026-09-23 ger packningen 13,1 minuter i alla fyra
// delar. Taket pa 25 % ar rymligt med flit: det ska fanga att tabellen slutat betyda nagot, inte
// pipa at att en fil blivit nagra sekunder langsammare.
test('den tyngsta delen ar hogst 25 % tyngre an den lattaste', () => {
  const av = delarUrCi().length;
  const laster = delning(av).map(k => k.last);
  const kvot = Math.max(...laster) / Math.min(...laster);
  assert.ok(kvot <= 1.25,
    `delarna vager ${laster.map(l => (l / 60).toFixed(1)).join('/')} min (kvot ${kvot.toFixed(2)}) — `
    + 'mat om vikterna: node scripts/browser-skarva.js --mat');
});

// TABELLEN FAR BLI GAMMAL, MEN INTE MENINGSLOS. En fil utan vikt far medianen och placeras anda —
// tackningen ar aldrig i fara — men ar halva katalogen oviktad ar packningen en gissning som ser
// ut som en matning. Da ska nagon veta om det.
test('vikttabellen tacker minst 80 % av provfilerna', () => {
  const tabell = JSON.parse(fs.readFileSync(path.join(ROT, 'tests', 'browser-tider.json'), 'utf8')).tider;
  const alla = filer().map(f => path.posix.basename(f));
  const oviktade = alla.filter(n => !Object.prototype.hasOwnProperty.call(tabell, n));
  const tackning = 1 - oviktade.length / alla.length;
  assert.ok(tackning >= 0.8,
    `${oviktade.length} av ${alla.length} provfiler saknar vikt (${(tackning * 100).toFixed(0)} % tackning). `
    + `Mat om: node scripts/browser-skarva.js --mat\nSaknas: ${oviktade.join(', ')}`);
});

// `npm run test:browser` maste finnas kvar. CLAUDE.md dokumenterar det som SATTET att kora sviten
// lokalt, och test:ci bygger pa det. Skarvningen ar till for CI, inte i stallet for kommandot.
test('bade test:browser och test:browser:skarva finns i package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['test:browser'], 'test:browser far inte forsvinna — CLAUDE.md pekar pa det');
  assert.ok(pkg.scripts['test:browser:skarva'], 'test:browser:skarva saknas');
  assert.match(pkg.scripts['test:ci'], /test:browser(\s|$)/,
    'test:ci ska fortfarande kora HELA browsersviten, inte en del');
});
