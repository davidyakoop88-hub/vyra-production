'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
const ROOT = path.join(__dirname, '..');

test.after(closeAll);

test('ramdesigner för mål är riktiga katalogval för båda måltyperna', () => {
  const h = createDom({ state: { widgets: [], projectName: 'goal-frame' } });
  h.load('overlay-sanitize.js'); h.load('premium-final.js');
  for (const kind of ['followers', 'likes']) for (const model of ['rose-frame', 'heart-frame', 'sapphire-frame', 'azure-frame']) {
    const w = h.window.VyraWidgets.create(`catalog:socialgoal:${kind}:${model}:landscape`);
    const html = h.window.wh(w);
    assert.equal(w.goalModel, model);
    assert.match(html, new RegExp(`goal-${model}`));
    assert.match(html, /class="goal-frame-art"/);
  }
});

test('alla fyra transparenta ramassets finns i repot', () => {
  for (const file of ['rose-crystal-frame.webp', 'pink-crown-frame.webp', 'sapphire-dragon-frame.webp', 'azure-wing-frame.webp']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'goal-frames', file)), `${file} saknas`);
  }
});
