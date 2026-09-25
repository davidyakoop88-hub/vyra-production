'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function boot() {
  const images = [];
  const scope = { Image: class { constructor() { images.push(this); } set src(value) { this.source = value; } },
    VyraSafe: { src(value, fallback) { return /^(javascript:|data:text\/html)/i.test(value || '') ? fallback : value || fallback; } } };
  scope.window = scope;
  vm.createContext(scope);
  for (const file of ['vfx-rng.js', 'gift-natural-engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), scope);
  return { api: scope.VyraNatural, images };
}
function context() {
  const calls = [];
  const ctx = new Proxy({}, { get(target, key) {
    if (key === 'calls') return calls;
    if (key === 'createRadialGradient') return () => ({ addColorStop() {} });
    return (...args) => calls.push([key, ...args]);
  }, set(target, key, value) { calls.push([key, value]); target[key] = value; return true; } });
  return ctx;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('same event seed reproduces geometry and drawing, next variant changes the show', () => {
  const { api } = boot();
  for (const theme of ['royal', 'ice', 'rose', 'comet', 'supernova']) {
    const options = { theme, combo: 10, seed: 1234, variantIndex: 1 };
    const a = api.create(options), b = api.create(options), next = api.create({ ...options, seed: 5678, variantIndex: 2 });
    assert.deepEqual(plain(a.inspect()), plain(b.inspect()));
    const ca = context(), cb = context();
    a.render(ca, 540, 450, 3); b.render(cb, 540, 450, 3);
    assert.deepEqual(ca.calls, cb.calls);
    assert.notDeepEqual(plain(a.inspect().events), plain(next.inspect().events));
    assert.notDeepEqual(plain(a.inspect().shapes), plain(next.inspect().shapes));
    assert.ok(a.inspect().glitter > 0);
  }
});

test('single events cycle heart, smile and star with distinct protected colors', () => {
  const { api } = boot();
  const shapes = [], colors = [];
  for (let singleIndex = 0; singleIndex < 4; singleIndex++) {
    const renderer = api.create({ seed: 42, combo: 1, singleIndex, customPalette: true, primary: '#ffffff', secondary: '#000000' });
    const event = renderer.inspect().events[0];
    shapes.push(event.shape); colors.push(event.primary);
    assert.equal(renderer.inspect().shells, 1);
    assert.ok(event.glitter > 0);
  }
  assert.deepEqual(shapes, ['heart', 'smile', 'star', 'heart']);
  assert.deepEqual(colors, ['#ff419c', '#ffc247', '#379fff', '#ff419c']);
});

test('all tiers clear the canvas at the full duration and reduced quality still renders', () => {
  const { api } = boot();
  for (const theme of ['royal', 'ice', 'rose', 'comet', 'supernova']) for (const [combo, duration] of [[1, 7], [10, 11], [100, 20]]) {
    const renderer = api.create({ theme, combo, seed: 77 });
    assert.equal(renderer.duration(), duration);
    const active = context(); renderer.setQuality(4); renderer.render(active, 540, 450, 2.5);
    assert.ok(active.calls.some(call => call[0] === 'stroke'));
    assert.ok(renderer.inspect().stride >= 4);
    for (const time of [duration, duration + 1]) {
      const ended = context(); renderer.render(ended, 540, 450, time);
      assert.deepEqual(ended.calls, [['clearRect', 0, 0, 540, 450]]);
    }
  }
});

test('sender images load independently, settle on errors, and custom palettes cannot leak', async () => {
  const { api, images } = boot();
  const a = api.create({ combo: 10, seed: 1, customPalette: true, primary: '#abcdef', giftImage: 'gift-a.png', profileImage: 'face-a.png' });
  const b = api.create({ combo: 10, seed: 2, giftImage: 'gift-b.png', profileImage: 'javascript:alert(1)' });
  assert.deepEqual(images.map(image => image.source), ['gift-a.png', 'face-a.png', 'gift-b.png', 'assets/images/test-profile.svg']);
  let settled = false; a.ready.then(() => { settled = true; });
  images[0].onload(); await Promise.resolve(); assert.equal(settled, false);
  images[1].onerror(); await Promise.resolve();
  assert.equal(images[1].source, 'assets/images/test-profile.svg'); assert.equal(settled, false);
  images[1].onerror(); images[2].onload(); images[3].onerror();
  await Promise.all([a.ready, b.ready]); assert.equal(settled, true);
  a.setOptions({ primary: '#112233', secondary: '#ffeedd' });
  assert.equal(a.inspect().events[0].primary, '#112233');
  assert.notEqual(b.inspect().events[0].primary, '#112233');
  a.setOptions({ primary: 'red' }); assert.equal(a.getOptions().primary, '#112233');
});

