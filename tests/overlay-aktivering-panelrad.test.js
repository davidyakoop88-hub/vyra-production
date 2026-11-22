// PANELRADEN "Syns i sändningen först när …" REGISTRERAS ÄVEN NÄR PANELRAMEN LADDAS SENT.
//
// overlay-aktivering.js läggs in dynamiskt ur media.js och körs så fort den hämtats — ibland innan
// parsern nått vyra-panelram.js längre ned i studio.html. Förut registrerades raden bara om
// window.VyraPanelram redan fanns, så den saknades för hela den sidladdningen. Det föll i CI på main
// 2026-11-20 och -21 (overlay-aktivering.browser.test.js, "panelen i studion", null).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const KALLA = fs.readFileSync(path.join(__dirname, '..', 'overlay-aktivering.js'), 'utf8');

function sida(url) {
  const dom = new JSDOM('<!doctype html><body></body>', { url, runScripts: 'outside-only' });
  const tillagg = [];
  const omritningar = { n: 0 };
  dom.window.VyraRitaSnart = () => { omritningar.n++; };
  return { dom, tillagg, omritningar, panelram: () => { dom.window.VyraPanelram = { tillagg: (nr, fn) => tillagg.push({ nr, fn }) }; } };
}

test('panelramen finns redan: raden registreras direkt, utan extra omritning', () => {
  const s = sida('http://vyra.test/studio.html?open=layout');
  s.panelram();
  s.dom.window.eval(KALLA);
  assert.equal(s.tillagg.length, 1);
  assert.equal(s.tillagg[0].nr, 2, 'raden hör till sektion 2, Innehåll');
  assert.equal(s.omritningar.n, 0, 'den vanliga vägen ska inte rita om');
  s.dom.window.dispatchEvent(new s.dom.window.Event('load'));
  assert.equal(s.tillagg.length, 1, 'registrerades två gånger');
});

test('panelramen kommer efter filen: raden registreras vid load och panelen ritas om', () => {
  const s = sida('http://vyra.test/studio.html?open=layout');
  s.dom.window.eval(KALLA);
  assert.equal(s.tillagg.length, 0);
  s.panelram();
  s.dom.window.dispatchEvent(new s.dom.window.Event('load'));
  assert.equal(s.tillagg.length, 1, 'raden registrerades aldrig när panelramen laddades sent');
  assert.equal(s.omritningar.n, 1, 'panelen ritades inte om efter den sena registreringen');
  const p = s.tillagg[0].fn({ id: 'w1', type: 'templateTopGift' });
  assert.ok(p && p.dataset.aktiveringRad === '1', 'tillägget ger ingen rad');
  assert.match(p.textContent, /^Syns i sändningen först när /);
});

test('overlay-utgången registrerar ingen panelrad', () => {
  const s = sida('http://vyra.test/studio.html?overlay=1');
  s.dom.window.eval(KALLA);
  s.panelram();
  s.dom.window.dispatchEvent(new s.dom.window.Event('load'));
  assert.equal(s.tillagg.length, 0);
});
