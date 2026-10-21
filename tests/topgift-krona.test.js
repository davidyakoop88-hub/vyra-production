'use strict';
// TOP GIFT · DESIGN 1: KRONAN GÅR ATT VÄLJA (David 2026-10-21: "varför kan jag inte ändra kronan på top gift?").
//
//   * listan ägs av renderaren (topgift-designer.js), som laddas i studion OCH i overlayn — annars hade
//     overlayn alltid ritat standardkronan oavsett val,
//   * varje krona i listan finns som fil och har samma bredd, så den fyller samma plats utan förvrängning,
//   * panelen (Design 1, sektion 5 · Utseende) har valet Krona, bara när Visa krona är på,
//   * ett okänt värde blir standardkronan — fältet blir aldrig en fri sökväg,
//   * Återställ utseende tar med kronan.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function kronlista() {
  const src = las('topgift-designer.js');
  const m = /window\.VyraTopGiftKronor = (\[[\s\S]*?\]);/.exec(src);
  assert.ok(m, 'topgift-designer.js definierar window.VyraTopGiftKronor');
  return vm.runInNewContext(m[1]);
}

test('renderaren äger kronlistan, och varje krona finns som fil', () => {
  const lista = kronlista();
  assert.ok(lista.length >= 12, 'tolv kronor');
  assert.equal(lista[0][0], 'neon-valkyrie', 'standardkronan står först');
  for (const [id, namn] of lista) {
    assert.match(id, /^[a-z-]+$/, id);
    assert.ok(namn, id + ' saknar namn');
    assert.ok(fs.existsSync(path.join(ROOT, 'assets/playground', id + '-crown.webp')), id + '-crown.webp saknas');
  }
});

test('renderaren bygger sökvägen bara ur listan', () => {
  const src = las('topgift-designer.js');
  assert.match(src, /kronor\.includes\(w\.tgdKrona\) \? w\.tgdKrona : 'neon-valkyrie'/);
  assert.match(src, /assets\/playground\/' \+ krona \+ '-crown\.webp/);
  assert.doesNotMatch(src, /src="assets\/playground\/neon-valkyrie-crown\.webp"/, 'kronan är inte längre hårdkodad');
});

test('panelen: Krona i Design 1, bara med Visa krona, och i Återställ utseende', () => {
  const src = las('vyra-topgift-panel.js');
  assert.match(src, /falt: 'tgdKrona', etikett: 'Krona', om: w => w\.showTitle !== false/);
  assert.match(src, /get alternativ\(\) \{ return window\.VyraTopGiftKronor/);
  assert.match(src, /\.\.\.\(neon \? \[kronval\] : \[\]\)/);
  assert.match(src, /utseendeFalt: \['accent', 'accent2', 'tgdKrona'/);
});
