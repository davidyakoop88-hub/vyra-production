'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MEDIA = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'studio.css'), 'utf8');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));

function bodyOf(name) {
  const start = MEDIA.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, name + ' saknas');
  const open = MEDIA.indexOf('{', MEDIA.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < MEDIA.length; i += 1) {
    if (MEDIA[i] === '{') depth += 1;
    if (MEDIA[i] === '}' && --depth === 0) return MEDIA.slice(open + 1, i);
  }
  throw new Error(name + ' har obalanserade klamrar');
}

test('Gift Jar har exakt de sju separata modellerna', () => {
  assert.deepEqual(Object.keys(VyraWidgets.variants('giftjar.model')),
    ['crystal', 'royal', 'neon', 'fire', 'ice', 'heart', 'galaxy']);
  for (const model of Object.keys(VyraWidgets.variants('giftjar.model'))) {
    const widget = VyraWidgets.create('catalog:giftjar:' + model);
    assert.equal(widget.type, 'templateGiftJar');
    assert.equal(widget.jarModel, model);
  }
});

test('livevägen patchar Gift Jar utan save, render, innerHTML eller localStorage', () => {
  const live = [bodyOf('dropIntoGiftJar'), bodyOf('triggerGiftJarDrop'), bodyOf('resetGiftJar')].join('\n');
  assert.doesNotMatch(live, /\bsave\s*\(/);
  assert.doesNotMatch(live, /\brender\s*\(/);
  assert.doesNotMatch(live, /innerHTML|localStorage/);
  assert.match(live, /document\.createElement/);
  assert.match(live, /textContent/);
});

test('Gift Jar använder exakt widget-id och en canvas-begränsad rot', () => {
  const root = bodyOf('giftJarRoot');
  assert.match(root, /\.canvas \.gift-jar-widget/);
  assert.match(root, /dataset\.id===String\(w\.id\)/);
  assert.doesNotMatch(root, /querySelector\(`[^`]*\$\{w\.id\}/);
});

test('gåvor faller och alla sju modeller har egen CSS', () => {
  assert.match(CSS, /@keyframes giftJarDrop/);
  ['royal', 'neon', 'fire', 'ice', 'heart', 'galaxy'].forEach(model =>
    assert.match(CSS, new RegExp('\\.jar-' + model + '\\b')));
  assert.match(MEDIA, /window\.addEventListener\('vyra-live-event'/);
});
