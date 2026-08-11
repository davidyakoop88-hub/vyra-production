'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
const ROOT = path.join(__dirname, '..');
const MEDIA = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'studio.css'), 'utf8');
const LIVE = fs.readFileSync(path.join(ROOT, 'gift-event-images.js'), 'utf8');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));
test.after(closeAll);

test('alla Gift Campaign-teman får samma kontinuerliga källa', () => {
  for (const theme of ['neon','royal','glass','minimal','aurora','retro','goldrush','crystal-garden']) {
    const w = VyraWidgets.create(`catalog:giftcampaign:${theme}:landscape`); w.id = `gc-${theme}`;
    const h = createDom({ state: { widgets: [w], projectName: 'test' } });
    h.load('overlay-sanitize.js');
    const box = h.paint([w]).querySelector(`[data-id="${w.id}"]`);
    assert.ok(box.querySelector('.campaign-flow>b'), `${theme} saknar källa`);
    assert.equal(box.querySelectorAll('.campaign-flow>i').length, 12, `${theme} saknar partiklar`);
  }
});

test('partiklarna kommer från samma punkt och rörelsen loopar', () => {
  assert.match(CSS, /\.campaign-flow i\{[^}]*left:50%;[^}]*bottom:3px/);
  assert.match(CSS, /animation:campaignFountainRise 2\.2s linear infinite/);
  assert.match(CSS, /@keyframes campaignFountainRise\{/);
  assert.match(CSS, /@keyframes campaignSourcePulse\{/);
  assert.match(MEDIA, /class="campaign-flow" aria-hidden="true"/);
});

test('reducerad rörelse stoppar bara animationen', () => {
  assert.match(CSS, /@media\(prefers-reduced-motion:reduce\)\{\.campaign-flow i,\.campaign-flow b\{animation:none!important\}/);
});

test('kampanjens liveväg förblir en riktad DOM-patch', () => {
  const source = LIVE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(source, /\bsave\s*\(/);
  assert.doesNotMatch(source, /\brender\s*\(/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
});
