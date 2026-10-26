'use strict';
// FLYTTA FRAM / BAK: ordna() i widget-ordning.js flyttar en widget i stapeln och numrerar om w.layer
// till 1..n. Stapeln är målningsordningen: lägre lager under, lika lager avgörs av ordningen i state.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'widget-ordning.js'), 'utf8');

function ordna() {
  const window = {};
  vm.runInNewContext(SOURCE, { window, document: {}, Number, Math, Object, addEventListener() {} });
  return window.VyraWidgetOrdning.ordna;
}
const lager = ws => Object.fromEntries(ws.map(w => [w.id, w.layer]));

test('fram ett steg: molnet över, Top Like flyttas fram förbi det', () => {
  const ws = [{ id: 'topLike', layer: 1 }, { id: 'moln', layer: 1 }];
  const r = ordna()(ws, 'topLike', 1);
  assert.equal(r.flyttad, true);
  assert.deepEqual(lager(ws), { moln: 1, topLike: 2 });
  assert.equal(r.plats, 2);
});

test('bak ett steg och längst fram/bak behåller de andras inbördes ordning', () => {
  const ws = [{ id: 'a', layer: 5 }, { id: 'b', layer: 40 }, { id: 'c' }, { id: 'd', layer: 5 }];
  const f = ordna();
  f(ws, 'b', -1);                       // stapel c,a,d,b -> c,a,b,d
  assert.deepEqual(lager(ws), { c: 1, a: 2, b: 3, d: 4 });
  f(ws, 'c', 'topp');
  assert.deepEqual(lager(ws), { a: 1, b: 2, d: 3, c: 4 });
  f(ws, 'c', 'botten');
  assert.deepEqual(lager(ws), { c: 1, a: 2, b: 3, d: 4 });
});

test('redan längst fram: ingen flytt, okänt id rör ingenting', () => {
  const ws = [{ id: 'a', layer: 1 }, { id: 'b', layer: 2 }];
  const f = ordna();
  assert.equal(f(ws, 'b', 1).flyttad, false);
  assert.equal(f(ws, 'saknas', 1).andrad, false);
  assert.deepEqual(lager(ws), { a: 1, b: 2 });
});
