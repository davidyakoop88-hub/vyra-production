'use strict';

// Ornamenten i premium-final.css bar dubbelkodade tecken: originalens UTF-8-bytes hade
// tolkats som latin-1 och kodats om, sa E2 9C A6 (glittertecknet) blev C3A2 C29C C2A6.
// Webblasaren renderade da "a-cirkumflex"-skrap i stallet for symbolerna. Kodningen kom in
// i bdcb7bd, som skrev om hela filen; 0e0e609 och allt fore ar rent.
//
// Fixen ar code-point-escapes, som per definition ar ren ASCII och darfor inte KAN manglas
// av nagon teckenkodning pa vagen. De trasiga originalstrangarna ligger kvar hogre upp i
// filen och overskuggas av reglerna sist — darfor mater provet den EFFEKTIVA deklarationen,
// alltsa den sista i kallordning for varje selektor, precis som kaskaden gor.
//
// Det har ar en kallkodsegenskap och inget annat. Att en strang ar ren ASCII gar att avgora
// ur bytesen; hur den SER ut kraver oga. Provet lovar alltsa bara att tecknen inte kan
// manglas — inte att ornamentet ar snyggt.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CSS = path.join(__dirname, '..', 'premium-final.css');

// Selektor -> tecknen ornamentet ska bestå av, som code points.
const ORNAMENT = {
  '.topgift-fireworks .topgift-ornament:after': [0x2726, 0x00b7, 0x2727, 0x00b7, 0x2726],
  '.goal-constellation .goal-track:after':      [0x2726, 0x00b7, 0x2727, 0x00b7, 0x2726],
};

function effektivContent(kalla, selektor) {
  // Sista traffen vinner, precis som kaskaden vid lika specificitet.
  const re = new RegExp(selektor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{content:"([^"]*)"');
  let sista = null, m;
  const global = new RegExp(re.source, 'g');
  while ((m = global.exec(kalla)) !== null) sista = m[1];
  return sista;
}

for (const [selektor, forvantade] of Object.entries(ORNAMENT)) {
  test(`${selektor}: effektiv content ar ren ASCII`, () => {
    const kalla = fs.readFileSync(CSS, 'utf8');
    const varde = effektivContent(kalla, selektor);
    assert.ok(varde !== null, `hittade ingen content-deklaration for ${selektor}`);
    const icke = [...varde].filter(c => c.charCodeAt(0) > 127);
    assert.equal(icke.length, 0,
      `den gallande deklarationen innehaller ${icke.length} icke-ASCII-tecken `
      + `(${icke.map(c => 'U+' + c.charCodeAt(0).toString(16).toUpperCase()).join(', ')}) `
      + '— anvand code-point-escapes, de kan inte manglas av en teckenkodning');
  });

  test(`${selektor}: escaperna ger ratt symboler`, () => {
    const kalla = fs.readFileSync(CSS, 'utf8');
    const varde = effektivContent(kalla, selektor);
    const kodpunkter = [...varde.matchAll(/\\([0-9a-fA-F]{1,6})/g)].map(m => parseInt(m[1], 16));
    const utanMellanslag = kodpunkter.filter(cp => cp !== 0x00a0 && cp !== 0x0020);
    assert.deepEqual(utanMellanslag, forvantade,
      'ornamentet ska vara glitter, punkt, glitter, punkt, glitter '
      + '(U+2726 U+00B7 U+2727 U+00B7 U+2726)');
  });
}

test('inget nytt dubbelkodat tecken smyger in i en content-strang', () => {
  const raw = fs.readFileSync(CSS);
  // Dubbelkodning ger monstret C3 xx foljt av C2/C5 xx. Vanlig svenska (a-ring, a-umlaut,
  // o-umlaut) ar ocksa C3 xx men foljs av ASCII, sa den falskflaggas inte.
  const dubbel = /Ã[-¿][ÂÅ][-¿]/;
  const trasiga = [];
  for (const m of raw.toString('latin1').matchAll(/content:\s*"([^"]*)"/g)) {
    if (dubbel.test(m[1])) trasiga.push(m[1].slice(0, 24));
  }
  // De tva kanda originalen ligger kvar och overskuggas av escape-reglerna sist i filen.
  // Vaxer antalet har nagon lagt till en ny mangkodad strang.
  assert.ok(trasiga.length <= 2,
    `${trasiga.length} content-strangar ar dubbelkodade (kant lage: 2 overskuggade original)`);
});
