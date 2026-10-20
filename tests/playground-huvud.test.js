'use strict';
// playground-widgets.js redigeras i repot sedan 2026-10-19 (PR 11, #662) - huvudet ska saga det.
//
// Filen sa tidigare "Genereras av playgroundens vyra-port/build_port.py - redigera i playgrounden,
// inte har". Porten finns inte i repot, och filen ar sedan PR 11 handredigerad: sandlada() med
// ctx-parametern bar ▶ Testa widget, och testraden (data-pgtest) ar borttagen ur panelen. En ny
// portkorning hade tagit bort sandladan och fort tillbaka testraden - som skrev i sandningens
// session under LIVE. Den har kallvakten faller om det hander, och om huvudet borjar ljuga igen.
// De beteendemassiga vakterna ar tests/browser/testspel-isolering.browser.test.js (pg-delen) och
// tests/browser/pg-livevag.browser.test.js.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const KALLA = fs.readFileSync(path.join(__dirname, '..', 'playground-widgets.js'), 'utf8');
const HUVUD = KALLA.slice(0, KALLA.indexOf('*/') + 2);
const KOD = KALLA.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

test('huvudet sager att filen redigeras har, inte att den genereras', () => {
  assert.doesNotMatch(HUVUD, /redigera i playgrounden, inte här/,
    'huvudet sager fortfarande att filen inte ska redigeras har');
  assert.match(HUVUD, /REDIGERAS HÄR sedan 2026-10-19/);
  assert.match(HUVUD, /sandl[aå]d/i, 'huvudet namner inte sandladan');
  assert.match(HUVUD, /testraden/, 'huvudet namner inte den borttagna testraden');
  // Skrivs inte ut som data-pg+test i huvudet: playground-widgets.test.js tar bara bort //-kommentarer
  // och skulle annars se testraden i blockkommentaren.
  assert.doesNotMatch(HUVUD, /data-pgtest/);
  for (const prov of ['playground-huvud', 'testspel-isolering', 'pg-livevag']) {
    assert.match(HUVUD, new RegExp(prov), `huvudet pekar inte pa ${prov}`);
  }
});

test('sandladan finns kvar och ar exporterad', () => {
  assert.match(KOD, /function sandlada\(/, 'sandlada() ar borta - en ny port har skrivit over filen?');
  assert.match(KOD, /window\.VyraPlayground\s*=\s*\{\s*sandlada\s*\}/, 'VyraPlayground.sandlada exporteras inte');
});

test('panelen har ingen testrad', () => {
  assert.doesNotMatch(KOD, /data-pgtest/,
    'testraden (data-pgtest) ar tillbaka i panelen - den matar sandningens session S under LIVE');
});
