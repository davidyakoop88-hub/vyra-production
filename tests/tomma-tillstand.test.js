'use strict';
// Formelprovet: varje tomt tillstand i fixturen foljer [vad/varfor] + [handling] —
// minst tva delar atskilda av punkt, utropstecken eller tankstreck, bada med innehall.
// Det har ar vad som hindrar en trettonde rost fran att smyga in i fixturen; DOM-provet
// i tests/browser/tomma-tillstand.browser.test.js hindrar texter UTANFOR fixturen.
const test = require('node:test'), assert = require('node:assert/strict');
const { TOMMA, PER_VY } = require('./fixtures/tomma-tillstand.js');

const FORMEL = /^[^.!—]{8,}[.!—]\s+\S.{7,}$/;

test('varje tomt tillstand foljer formeln mening + handling', () => {
  const fel = [];
  for (const [nyckel, def] of Object.entries(TOMMA)) {
    const text = def.text || def.exempel;
    if (!text) { fel.push(`${nyckel}: saknar bade text och exempel`); continue }
    if (def.monster && !def.monster.test(def.exempel))
      fel.push(`${nyckel}: exemplet matchar inte sitt eget monster`);
    if (!FORMEL.test(text))
      fel.push(`${nyckel}: "${text}" har inte tva delar [vad/varfor] + [handling]`);
  }
  assert.deepEqual(fel, [], 'fixturen bryter formeln:\n  ' + fel.join('\n  '));
});

test('varje nyckel i PER_VY finns i TOMMA, och tvartom', () => {
  const anvanda = new Set(Object.values(PER_VY).flat());
  const definierade = new Set(Object.keys(TOMMA));
  const saknas = [...anvanda].filter(n => !definierade.has(n));
  const oanvanda = [...definierade].filter(n => !anvanda.has(n));
  assert.deepEqual(saknas, [], 'PER_VY pekar pa odefinierade nycklar');
  assert.deepEqual(oanvanda, [], 'TOMMA har nycklar ingen vy anvander');
});
