'use strict';
// Gifter Level Ups fasregister och de generella vakterna G1–G3 — skrivna RÖTT FÖRST
// (gifter-fas.js finns inte än). Fyrfasportens PR B, byggplan godkänd 2026-08-19.
//
// Motorformen kommer från fabriken (widget-fas.js); det här är artens sida: registret, tiderna
// och vakterna som håller familjen sluten. G1–G3 är F1–F3:s syskon och skrivna GENERELLT —
// de vaktar varje modell som NÅGONSIN registreras, inte bara dagens.
//
//   G1  varje koreografi hör till en modell som fabrikstabellen känner
//   G2  en modell utan koreografi får ingen fasklass alls — halvfärdigt är sämre än inget
//   G3  varje koreografi ryms i den kortaste visningstiden (gifterDuration-reglagets golv, 2 s)
//
// Rörelsevakterna för risingtier bor i tests/browser/gifter-fas-risingtier.browser.test.js —
// jsdom svarar 0 på all layout.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { PREFIX, FASER, KORTASTE_VISNING } = require('./helpers/gifter-fas-register.js');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.after(closeAll);

const las = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('G1: varje koreografi hör till en registrerad modell', () => {
  // Modellistan ägs av panelens gifterLayout-select i media.js — det är den användaren väljer
  // ur, och renderaren bygger gifter-layout-<värdet> ur samma fält. (widget-factory.js:s
  // 'gifterlevel.layout'-generator tar namnet fritt och är därför ingen lista.)
  const media = las('media.js');
  const select = media.match(/id="gifterLayout"[^;]*?<\/select>/)?.[0] || '';
  assert.ok(select.length > 0, 'hittar inte gifterLayout-selecten i media.js');
  for (const modell of Object.keys(FASER)) {
    assert.ok(select.includes(`value="${modell}"`),
      `koreografin '${modell}' pekar på en modell som panelens modellista inte känner`);
  }
});

test('G2: en modell utan koreografi får ingen fasklass alls', () => {
  const h = createDom({ state: { widgets: [] } });
  h.paint([]);
  h.load('widget-fas.js');
  h.load('gifter-fas.js');
  const box = h.document.createElement('div');
  box.className = 'gifter-level-up gifter-layout-pahittad';
  assert.equal(h.window.VyraGifterFas.spela(box), false,
    'spela() accepterade en modell utan koreografi');
  assert.equal([...box.classList].filter(k => k.startsWith(PREFIX)).length, 0,
    'en okänd modell fick fasklasser — halvfärdig fas är sämre än ingen');
});

test('G3: varje koreografi ryms i den kortaste visningstiden', () => {
  assert.equal(KORTASTE_VISNING, 2000,
    'gifterDuration-reglagets golv är 2 s (media.js min="2") — taket ska spegla det');
  for (const [modell, lista] of Object.entries(FASER)) {
    const total = lista.reduce((s, f) => s + f.ms, 0);
    assert.ok(total <= KORTASTE_VISNING,
      `${modell}: koreografin är ${total} ms — längre än kortaste visningen ${KORTASTE_VISNING}`);
    assert.ok(lista.length >= 2, `${modell}: färre än två faser är ingen koreografi`);
  }
});

test('risingtier är registrerad med byggplanens faser', () => {
  // Byggplanen (godkänd 2026-08-19): strålar 340 → materialisering 360 → avläsning 340.
  assert.ok(FASER.risingtier, 'risingtier saknas i registret');
  assert.deepEqual(FASER.risingtier.map(f => f.namn), ['stralar', 'materialisering', 'avlasning']);
  assert.deepEqual(FASER.risingtier.map(f => f.ms), [340, 360, 340]);
});

test('kopplingen sitter: gifter-fas dekorerar triggerGifterLevelUp innanför kön', () => {
  // Strukturellt: media.js kedjar fabrik→fan→gifter (eller motsvarande) så att arten laddas
  // statiskt före runtime-controls 500 ms-omkoppling — samma krav som fan (uppmätt fälla).
  const media = las('media.js');
  assert.match(media, /gifter-fas\.js/,
    'media.js laddar aldrig gifter-fas.js — koreografin kan inte existera i drift');
  const h = createDom({ state: { widgets: [] } });
  h.paint([]);
  h.load('widget-fas.js');
  h.load('gifter-fas.js');
  assert.equal(typeof h.window.VyraGifterFas.koppla, 'function');
});
