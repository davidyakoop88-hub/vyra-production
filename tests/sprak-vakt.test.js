'use strict';
// Sprakvaktens KALLKODSLAGER: snabb grind i npm test som skannar klientfilerna i repots rot
// mot precisionsmonstren i tests/fixtures/sprak-ordlista.js.
//
// Skannern ar medvetet begransad till entydiga monster (fraser, markupkontext) — enstaka ord
// som "Preview" lever legitimt i identifierare och kommentarer och vaktas i stallet av
// DOM-vandraren i tests/browser/sprak-vakt.browser.test.js, som ser det anvandaren ser.
//
// Kommentarer strips fore matchning: overlay-preview.js:4 beskriver t.ex. Preview/Configure
// i en kommentar, och en vakt som faller pa dokumentation av det gamla laget vaktar fel sak.
//
// ROTT NU (Etapp 4 PR A, mot 24a989b): elva syndare pa atta filer.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { KALLKOD_MONSTER } = require('./fixtures/sprak-ordlista.js');

const ROOT = path.join(__dirname, '..');

// Klientfilerna ar rotens .js/.html — server/, electron-app/, tiktok-bridge/, tests/ och
// scripts/ ar inte anvandarvand Studio-yta.
const FILER = fs.readdirSync(ROOT)
  .filter(f => (f.endsWith('.js') || f.endsWith('.html')) && fs.statSync(path.join(ROOT, f)).isFile())
  .sort();

function utanKommentarer(kalla, fil) {
  let s = kalla.replace(/\/\*[\s\S]*?\*\//g, '');
  if (fil.endsWith('.js')) s = s.replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
  if (fil.endsWith('.html')) s = s.replace(/<!--[\s\S]*?-->/g, '');
  return s;
}

test('klientkoden innehaller inga forbjudna engelska UI-strangar', () => {
  const traffar = [];
  for (const fil of FILER) {
    const kalla = utanKommentarer(fs.readFileSync(path.join(ROOT, fil), 'utf8'), fil);
    const rader = kalla.split(/\r?\n/);
    for (const m of KALLKOD_MONSTER) {
      rader.forEach((rad, i) => {
        if (m.re.test(rad)) traffar.push(`${fil}:${i + 1}  [${m.namn}]`);
      });
    }
  }
  assert.deepEqual(traffar, [],
    'forbjudna engelska UI-strangar i klientkoden (se tests/fixtures/sprak-ordlista.js):\n  ' +
    traffar.join('\n  '));
});
