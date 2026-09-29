'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
const factory = require('../widget-factory.js');
test.after(closeAll);

function paint(overrides = {}) {
  const w = factory.create('catalog:battlemvp:celebration:coronation');
  Object.assign(w, { id: 'winner', mvpName: 'A', profileImage: 'https://example.com/a.png' }, overrides);
  const h = createDom({ state: { widgets: [w], projectName: 'test' } });
  h.load('overlay-sanitize.js');
  h.load('battle-mvp-celebrations.js');
  return { h, w, box: h.paint([w]).querySelector('.mvp-celebration') };
}

test('the particle settings reach the element as CSS variables', () => {
  const { box } = paint({ mvpFxIntensity: 180, mvpFxSpeed: 60, mvpFxSize: 140, mvpFxDepth: 12, mvpFxHole: 150 });
  const s = box.style;
  assert.equal(s.getPropertyValue('--mvc-fx-intensity'), '180');
  assert.equal(s.getPropertyValue('--mvc-fx-speed'), '60');
  assert.equal(s.getPropertyValue('--mvc-fx-size'), '140');
  assert.equal(s.getPropertyValue('--mvc-fx-depth'), '12');
  assert.equal(s.getPropertyValue('--mvc-fx-hole'), '150');
});

test('defaults are used when nothing is set, and out-of-range values are clamped', () => {
  const plain = paint().box.style;
  assert.equal(plain.getPropertyValue('--mvc-fx-intensity'), '100');
  assert.equal(plain.getPropertyValue('--mvc-fx-depth'), '34');

  const wild = paint({ mvpFxIntensity: 9000, mvpFxDepth: -40, mvpFxSize: 'abc' }).box.style;
  assert.equal(wild.getPropertyValue('--mvc-fx-intensity'), '250', 'clamped to the maximum');
  assert.equal(wild.getPropertyValue('--mvc-fx-depth'), '0', 'clamped to the minimum');
  assert.equal(wild.getPropertyValue('--mvc-fx-size'), '100', 'nonsense falls back');
});

test('the tint is allow-listed, because it lands in a style attribute', () => {
  assert.equal(paint({ mvpFxTint: 'violet' }).box.style.getPropertyValue('--mvc-fx-tint'), 'violet');
  for (const bad of ['red;background:url(x)', 'expression(1)', '', 'GOLD', 'auto;--x:1']) {
    const box = paint({ mvpFxTint: bad }).box;
    assert.equal(box.style.getPropertyValue('--mvc-fx-tint'), 'auto',
      'unvetted tint ' + JSON.stringify(bad) + ' must fall back to auto');
  }
});

test('without a 2D context the twenty-element fallback is left alone', () => {
  const { h, box } = paint();
  // jsdom has no canvas: the engine must decline quietly and change nothing.
  assert.doesNotThrow(() => h.load('battle-mvp-particles.js'));
  assert.equal(box.querySelectorAll('.mvc-finale i').length, 20, 'the CSS fallback survives');
  assert.equal(box.querySelectorAll('canvas.mvc-fx').length, 0, 'no dead canvases are left behind');
  assert.ok(!box.querySelector('.mvc-stage').classList.contains('mvc-fx-on'),
    'mvc-fx-on is only set once the engine really started');
});

test('the engine exposes a profile for every celebration the catalog offers', () => {
  const { h } = paint();
  h.load('battle-mvp-particles.js');
  const profiles = h.window.VyraMvpParticles.profiles;
  for (const key of Object.keys(factory.variants('battlemvp.celebration'))) {
    assert.ok(profiles[key], key + ' has no particle profile');
    assert.ok(profiles[key].cols.length, key + ' has no colours');
  }
});

test('emission builds towards the landing instead of running flat', () => {
  const { h } = paint();
  h.load('battle-mvp-particles.js');
  const rateAt = h.window.VyraMvpParticles.rateAt;
  // Phase 1 is the light alone; the build peaks as the face lands at half time;
  // the finale lifts again. A flat curve is exactly the bug this replaces.
  assert.ok(rateAt(0.05) < rateAt(0.35), 'it has to build through the entrance');
  assert.ok(rateAt(0.35) < rateAt(0.50), 'the landing is the loudest moment of the build');
  assert.ok(rateAt(0.70) < rateAt(0.50), 'and it settles again during the hold');
  assert.ok(rateAt(0.95) > rateAt(0.70), 'the finale lifts');
  assert.ok(rateAt(0.05) < 0.2, 'phase one stays quiet');
});
