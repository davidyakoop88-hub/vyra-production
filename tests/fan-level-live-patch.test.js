'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const media = fs.readFileSync(path.join(root, 'media.js'), 'utf8');
const widgets = require(path.join(root, 'widget-factory.js'));

function functionBody(name) {
  const start = media.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, name + ' saknas');
  const open = media.indexOf('){', start) + 1;
  let depth = 0;
  for (let i = open; i < media.length; i += 1) {
    if (media[i] === '{') depth += 1;
    if (media[i] === '}' && --depth === 0) return media.slice(open + 1, i);
  }
  throw new Error(name + ' har obalanserade klamrar');
}

test('Fan Level-livevägen patchar befintlig DOM utan save, render eller innerHTML', () => {
  const body = functionBody('triggerFanLevelUp');
  assert.match(body, /querySelectorAll\('\.canvas \.fan-level-up'\)/);
  assert.match(body, /textContent/);
  assert.doesNotMatch(body, /\bsave\s*\(/);
  assert.doesNotMatch(body, /\brender\s*\(/);
  assert.doesNotMatch(body, /innerHTML/);
  assert.doesNotMatch(body, /w\.fan(?:Name|Level)\s*=/);
});

test('Fan Level-katalogen innehåller exakt referensens sju modeller', () => {
  assert.deepEqual(Object.keys(widgets.variants('fanlevel.layout')), [
    'stack', 'heartbeat', 'badgereveal', 'loyalty', 'hearts', 'ribbon', 'duo'
  ]);
});
