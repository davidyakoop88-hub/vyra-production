'use strict';
// LIVE-kontroll läste `root.state.widgets` — men `state` är en const i studio.js
// (`const state=window.VyraSessionState.activeState();`) och hamnar aldrig på window. Panelen såg
// därför aldrig en enda widget: varje gåva stod som "ej matchad" trots att en widget tog emot den,
// och Match Monitor sa "saknas" för battle-widgetar som fanns i layouten (upptäckt 2026-10-18).
//
// Proven deklarerar `state` som studio.js gör — en const i den delade lexikala miljön, INTE som
// en egenskap på window. Ett prov som sätter `window.state` är grönt medan buggen lever.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const KALLA = fs.readFileSync(path.join(ROOT, 'live-control.js'), 'utf8');

function oppna(widgets) {
  const dom = new JSDOM('<!doctype html><aside></aside><h1 id="title"></h1><main id="view"></main>', { runScripts: 'dangerously' });
  const w = dom.window;
  const kor = src => { const s = w.document.createElement('script'); s.textContent = src; w.document.body.append(s) };
  kor(`const state=${JSON.stringify({ widgets })};`);
  kor(KALLA);
  assert.equal(w.state, undefined, 'provet ska efterlikna studio.js: state får inte ligga på window');
  w.VyraLiveControl.render();
  return w;
}

const glove = (id, kind, over = {}) => Object.assign({ id, type: 'templateGloveSnipe', title: 'Glove ' + kind, battleEventKind: kind }, over);

test('Match Monitor räknar battle-widgetarna i layouten', () => {
  const w = oppna([glove('g1', 'tap'), glove('g2', 'snipe'), glove('g3', 'snipe', { hidden: true })]);
  const klar = w.document.querySelector('.lc-battle-ready').textContent;
  assert.match(klar, /Tap 1/, 'en synlig tap-widget finns men panelen säger "saknas"');
  assert.match(klar, /Snipe 1/, 'den dolda snipe-widgeten ska inte räknas, den synliga ska');
  assert.match(klar, /Glove saknas/);
});

test('en gåva som når en gåvowidget står som triggad, med widgetens namn', () => {
  const w = oppna([{ id: 'gj', type: 'templateGiftJar', group: 'Gift Jar', title: 'Min burk' }]);
  w.VyraLiveControl.record({ id: 1, type: 'gift', username: 'lisa', giftName: 'Rose', count: 1 });
  const rad = w.document.querySelector('#view tbody tr').textContent;
  assert.match(rad, /triggad/, 'gåvan nådde en widget men loggen säger "ej matchad"');
  assert.match(rad, /Min burk/);
});
