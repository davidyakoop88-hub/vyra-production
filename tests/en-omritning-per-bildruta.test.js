'use strict';
// EN OMRITNING PER BILDRUTA VID LADDNINGEN.
//
// approved-rankings.js, ranking-sixpack.js och spellayout.js lägger sig ytterst runt wh/bind/props
// igen efter varje sent skript (capture-lyssnaren på document). Tidigare ritade var och en om HELA
// studion varje gång: uppmätt 2026-11-08, ~30 omritningar per fil under laddningen, 11 s blockerad
// huvudtråd lokalt med 12 widgetar och 22 s tom duk i Davids studio under en sändning.
//
// Regeln: omlindningen sker direkt (ordningen ytterst måste stå sig), men omritningen samlas till
// en enda, gemensam för alla tre filerna (window.VyraRitaSnart).
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
test.after(closeAll);

const vanta = ms => new Promise(r => setTimeout(r, ms));

function rigg() {
  const h = createDom({ state: { widgets: [], projectName: 'omritning' } });
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s); };
  for (const f of ['approved-rankings.js', 'ranking-sixpack.js', 'spellayout.js']) h.load(f);
  run(`window.__ritningar = 0; { const r = render; render = function () { window.__ritningar++; return r.apply(this, arguments); }; }`);
  // Ett sent skript som lindar om wh utan att vara ytterst — exakt det som får de tre att lägga
  // sig ytterst igen — och sedan fyrar load som ett riktigt <script src>.
  const sentSkript = n => {
    run(`wh = (function (o) { const f = function (w) { return o(w); }; f.__sent = ${n}; return f; })(wh);`);
    const s = h.document.createElement('script'); s.src = 'sent-' + n + '.js'; h.document.body.append(s);
    s.dispatchEvent(new h.window.Event('load'));
  };
  return { h, run, sentSkript, ritningar: () => h.window.__ritningar };
}

test('trettio sena skript ger en omritning, inte nittio', async () => {
  const { sentSkript, ritningar, h } = rigg();
  for (let i = 0; i < 30; i++) sentSkript(i);
  assert.equal(ritningar(), 0, 'omritningen ska vänta till nästa bildruta, inte ske per skript');
  await vanta(150);
  assert.equal(ritningar(), 1, 'de tre filerna delar en enda väntande omritning');
  assert.equal(typeof h.window.VyraRitaSnart, 'function');
});

test('lindningen sker ändå direkt: de tre ligger ytterst efter varje sent skript', () => {
  const { sentSkript, h } = rigg();
  sentSkript(1);
  assert.ok(h.window.eval('wh.__vyraYtter') > 0, 'wh är inte längre en av de tre filernas lager efter ett sent skript');
  assert.equal(h.window.eval('wh.__sent'), undefined, 'det sena skriptets lager ligger ytterst');
});

test('ritar något annat om studion först, stryks den väntande omritningen', async () => {
  // CI 2026-11-08 (command-center-alltime): provet bytte vy med render() och läste listan direkt,
  // och den väntande omritningen kom 100 ms senare och byggde om vyn mitt i läsningen.
  const { sentSkript, ritningar, run } = rigg();
  sentSkript(1); sentSkript(2);
  run('render()');
  assert.equal(ritningar(), 1);
  await vanta(150);
  assert.equal(ritningar(), 1, 'den väntande omritningen kom ändå, efter en omritning som redan använde de yttersta lagren');
});

test('en ny omgång sena skript efter omritningen ritar om igen', async () => {
  const { sentSkript, ritningar } = rigg();
  sentSkript(1); await vanta(150);
  sentSkript(2); sentSkript(3); await vanta(150);
  assert.equal(ritningar(), 2);
});
