'use strict';
// Den visuella vakten håller sidans timers stilla medan kontrollfotona tas (tests/helpers/visuell.js).
//
// Ett levelkort med 6 s visning fotograferas i sin utgång, och kortets egen timer släcker det 0,5 s
// senare. Landade släckningen mellan de två kontrollfotona (140 ms isär) blev de olika, och
// catalog:gifterlevel:reveal föll ibland i CI med "stod aldrig stilla". Återskapat lokalt med
// sexfaldigt strypt processor. Frysningen pausar CSS-animationerna; __visHall pausar JS-timers.
const test = require('node:test'), assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { RIGG } = require('./helpers/visuell.js');

function sida(widgets = []) {
  const dom = new JSDOM('<!doctype html><body><div data-id="w1"></div></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.eval('var state = { widgets: ' + JSON.stringify(widgets) + ' };');
  dom.window.eval(RIGG);
  return dom;
}
const vanta = ms => new Promise(r => setTimeout(r, ms));

test('en timer som löper ut medan sidan hålls körs först när den släpps', async () => {
  const dom = sida();
  try {
    assert.equal(typeof dom.window.__visHall, 'function', 'riggen saknar __visHall');
    dom.window.eval('window.__korde = 0; setTimeout(() => { window.__korde++ }, 20);');
    dom.window.__visHall(true);
    await vanta(80);
    assert.equal(dom.window.__korde, 0, 'timern körde medan sidan hölls — widgeten kan släckas mellan kontrollfotona');
    dom.window.__visHall(false);
    assert.equal(dom.window.__korde, 1, 'timern kördes inte när sidan släpptes');
  } finally { dom.window.close(); }
});

test('utan hållning går timers som vanligt', async () => {
  const dom = sida();
  try {
    dom.window.eval('window.__korde = 0; setTimeout(() => { window.__korde++ }, 10);');
    await vanta(60);
    assert.equal(dom.window.__korde, 1);
  } finally { dom.window.close(); }
});

test('bara levelkort med kort visning hålls: Gifter Level 6 s ja, Fan Level 11 s nej, annat nej', () => {
  const sek = w => { const d = sida([w]); try { return d.window.__visKortSek() } finally { d.window.close() } };
  assert.equal(sek({ type: 'templateGifterLevel' }), 6, 'Gifter Level utan satt tid ska räknas som 6 s');
  assert.equal(sek({ type: 'templateFanLevel', fanDuration: 11 }), 11);
  assert.equal(sek({ type: 'templateTopGift' }), 0);
});
