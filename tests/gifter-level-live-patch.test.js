'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'media.js'), 'utf8');
const start = source.indexOf('function triggerGifterLevelUp');
const end = source.indexOf('window.triggerGifterLevelUp', start);
const handler = source.slice(start, end);

test('Gifter Level-livevägen patchar befintlig DOM utan save, render eller innerHTML', () => {
  assert.notEqual(start, -1, 'triggerGifterLevelUp saknas');
  assert.match(handler, /querySelectorAll\('\.canvas \.gifter-level-up'\)/,
    'handlern söker inte riktat i canvasens Gifter Level-widgetar');
  assert.match(handler, /textContent=/, 'livevärden patchas inte med textContent');
  assert.doesNotMatch(handler, /\bsave\s*\(/, 'liveeventet får inte spara overlay-state');
  assert.doesNotMatch(handler, /\brender\s*\(/, 'liveeventet får inte rita om hela canvasen');
  assert.doesNotMatch(handler, /innerHTML\s*=/, 'liveeventet får inte ersätta markup');
});

test('katalogen innehåller exakt referensens sju modeller', () => {
  const registry = require(path.join(__dirname, '..', 'widget-factory.js'));
  assert.deepEqual(Object.keys(registry.variants('gifterlevel.layout')),
    ['stack', 'sidebadge', 'reveal', 'orbitlevel', 'risingtier', 'flip', 'duo']);
  assert.throws(() => registry.create('catalog:gifterlevel:profile'), /Okänd gifter level-layout/);
  assert.throws(() => registry.create('catalog:gifterlevel:number'), /Okänd gifter level-layout/);
});
