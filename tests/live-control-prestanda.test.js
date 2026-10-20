'use strict';
// PRESTANDARADEN I LIVE-KONTROLL ÄR MÅTT, INTE EN TEXTSTRÄNG.
//
// Granskningen 2026-10-17 (F23) läste "Stabil0% köbelastning" och "Kö 0/2000Bearbetade 0Fördröjning
// 0 ms…" som två täta rader. Orsaken var dubbel: `.lc-performance` hade ingen enda regel i
// live-control.css, så rubrikens <small>/<b>/<em> och måttens <span> låg inline efter varandra; och
// måtten var bara etikett och värde i samma span, utan plats för enheten.
//
// Proven läser DOM:en som live-control.js bygger (jsdom, samma rigg som live-control-state) och
// stilmallen den laddar. Layouten i sig mäts inte här — men utan en regel för sektionen finns det
// ingen layout att mäta, och det är exakt det läget som var felet.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const KALLA = fs.readFileSync(path.join(ROOT, 'live-control.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'live-control.css'), 'utf8');

function oppna() {
  const dom = new JSDOM('<!doctype html><aside></aside><h1 id="title"></h1><main id="view"></main>', { runScripts: 'dangerously' });
  const w = dom.window;
  const kor = src => { const s = w.document.createElement('script'); s.textContent = src; w.document.body.append(s) };
  kor('const state={widgets:[]};');
  kor(KALLA);
  w.dispatchEvent(new w.CustomEvent('vyra-server-status', { detail: { connection: {}, client: {
    queueDepth: 120, maxQueue: 2000, processed: 4312, pollLatency: 41, dropped: 3 } } }));
  w.VyraLiveControl.render();
  return w;
}

test('varje prestandamått har en egen ruta med etikett, värde och enhet', () => {
  const w = oppna();
  const sektion = w.document.querySelector('.lc-performance');
  assert.ok(sektion, 'prestandasektionen ritades inte');
  const matt = [...sektion.querySelectorAll('[data-lc-matt]')];
  assert.ok(matt.length >= 4,
    `hittade ${matt.length} mått med [data-lc-matt] — kö, bearbetade, fördröjning och droppade ska vara egna fält`);
  for (const m of matt) {
    const etikett = m.querySelector('small'), varde = m.querySelector('b');
    assert.ok(etikett && etikett.textContent.trim(), `måttet ${m.dataset.lcMatt} saknar etikett`);
    assert.ok(varde && varde.textContent.trim(), `måttet ${m.dataset.lcMatt} saknar värde`);
    assert.ok(!etikett.contains(varde) && !varde.contains(etikett),
      `etikett och värde ligger i varandra i ${m.dataset.lcMatt}`);
  }
  const fordrojning = sektion.querySelector('[data-lc-matt="fordrojning"]');
  assert.ok(fordrojning, 'fördröjningen saknar eget fält');
  assert.equal(fordrojning.querySelector('b').textContent.replace(/\s/g, ''), '41ms');
  assert.equal(fordrojning.querySelector('b em')?.textContent.trim(), 'ms', 'enheten ska vara ett eget element');
});

test('statusordet och köbelastningen är två separata fält', () => {
  const w = oppna();
  const huvud = w.document.querySelector('.lc-performance header');
  const status = huvud.querySelector('[data-lc-belastning-status]'), last = huvud.querySelector('[data-lc-belastning]');
  assert.ok(status && last, 'rubriken saknar egna fält för status och köbelastning');
  assert.equal(status.textContent.trim(), 'Stabil');
  assert.match(last.textContent, /^\s*6\s*%\s*köbelastning\s*$/);
  assert.ok(!status.contains(last) && !last.contains(status));
});

test('stilmallen ger sektionen samma kortstruktur som statuskorten', () => {
  assert.match(CSS, /\.lc-performance\s*\{/, 'live-control.css har ingen regel för .lc-performance — allt ligger inline');
  assert.match(CSS, /\.lc-performance header\s*\{[^}]*display\s*:\s*(flex|grid)/,
    'rubriken i prestandasektionen är inte flex/grid — statusordet och lasten hamnar ihop');
  assert.match(CSS, /\.lc-perf-grid\s*\{[^}]*display\s*:\s*grid/, 'måtten ligger inte i ett rutnät');
  assert.match(CSS, /\.lc-perf-grid article\s*\{/, 'måtten har ingen kortstil');
});
