'use strict';
// LÅS WIDGET (widget-las.js). Webbläsarprovet (tests/browser/widget-las) bevisar dragningen på
// riktigt; det här bevisar reglerna snabbt i vm, utan DOM-layout.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const KALLA = fs.readFileSync(path.join(__dirname, '..', 'widget-las.js'), 'utf8');

function ladda({ overlay = false, widgets = [] } = {}) {
  const lyssnare = [];
  const ctx = {
    URLSearchParams, console,
    location: { search: overlay ? '?overlay=1' : '?open=layout' },
    state: { widgets }, view: 'editor', document: { querySelectorAll: () => [] },
    addEventListener() {},
    wh: w => `<div class="widget vyra-x" data-id="${w.id}"></div>`,
    bind() {}
  };
  ctx.window = ctx;
  ctx.window.addEventListener = (typ, fn, fangst) => lyssnare.push({ typ, fn, fangst });
  vm.createContext(ctx);
  vm.runInContext(KALLA, ctx);
  return { ctx, lyssnare };
}

function handelse(id) {
  const e = { stoppad: 0, target: { closest: () => (id ? { dataset: { id } } : null) } };
  e.stopPropagation = () => { e.stoppad++; };
  e.stopImmediatePropagation = () => { e.stoppad++; };
  return e;
}

test('stoppet sitter i fångstfasen på window, för pointerdown', () => {
  const { lyssnare } = ladda();
  const l = lyssnare.find(x => x.typ === 'pointerdown');
  assert.ok(l, 'pointerdown-lyssnaren saknas');
  assert.equal(l.fangst, true, 'måste vara fångstfas, annars hinner dragningen starta');
});

test('bara en låst widget stoppas — olåst, locked:"true" och tom yta går igenom', () => {
  const { ctx } = ladda({ widgets: [{ id: 'a', locked: true }, { id: 'b' }, { id: 'c', locked: 'true' }] });
  const { stoppaDrag } = ctx.VyraWidgetLas;
  const a = handelse('a'), b = handelse('b'), c = handelse('c'), tom = handelse(null);
  [a, b, c, tom].forEach(stoppaDrag);
  assert.ok(a.stoppad > 0);
  assert.equal(b.stoppad, 0);
  assert.equal(c.stoppad, 0, 'bara exakt true låser — ett trasigt värde ska inte frysa en widget');
  assert.equal(tom.stoppad, 0);
});

test('stoppet gör ingenting i overlayn', () => {
  const { ctx } = ladda({ overlay: true, widgets: [{ id: 'a', locked: true }] });
  const e = handelse('a');
  ctx.VyraWidgetLas.stoppaDrag(e);
  assert.equal(e.stoppad, 0);
});

test('wh stämplar widget-last i editorn men aldrig i overlayn, och rör inte olåsta', () => {
  const ed = ladda().ctx, ov = ladda({ overlay: true }).ctx;
  assert.match(ed.wh({ id: 'a', locked: true }), /^<div class="widget widget-last vyra-x"/);
  assert.doesNotMatch(ed.wh({ id: 'b' }), /widget-last/);
  assert.doesNotMatch(ov.wh({ id: 'a', locked: true }), /widget-last/);
});

test('widget-las.js rör aldrig position eller storlek', () => {
  assert.doesNotMatch(KALLA, /\.(x|y|width|height)\s*=[^=]/, 'låset får bara läsa och skriva fältet locked');
});
