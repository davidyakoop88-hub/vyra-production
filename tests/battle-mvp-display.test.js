'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
const ROOT = path.join(__dirname, '..');
const MEDIA = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));
test.after(closeAll);

for (const key of ['catalog:battlemvp:inferno','catalog:battlemvp:royal-purple','catalog:battlemvp:frame:gold-crown']) {
  test(`${key} visar endast MVP som standard`, () => {
    const w = VyraWidgets.create(key); w.id = key.replaceAll(':','-');
    assert.equal(w.mvpLabel, 'MVP');
    assert.equal(w.mvpShowName, false);
    assert.equal(w.mvpShowCoins, false);
    const h = createDom({ state: { widgets: [w], projectName: 'test' } });
    h.load('overlay-sanitize.js');
    const box = h.paint([w]).querySelector(`[data-id="${w.id}"]`);
    const label = box.querySelector('.mvp-copy small,.mvpf-plate small');
    assert.equal(label.textContent.trim(), 'MVP');
    const name = box.querySelector('.mvp-copy h2,.mvpf-row strong');
    const score = box.querySelector('.mvp-copy>strong,.mvpf-row b');
    assert.match(name.getAttribute('style') || '', /display:none/);
    assert.match(score.getAttribute('style') || '', /display:none/);
  });
}

test('äldre BATTLE MVP-state visas som MVP utan migration', () => {
  assert.match(MEDIA, /trim\(\)\.toUpperCase\(\)==='BATTLE MVP'\?'MVP':label/);
});

test('panelkontroller kan slå på namn och coins', () => {
  for (const id of ['mvpShowLabelMain','mvpShowNameMain','mvpShowCoins']) assert.match(MEDIA, new RegExp(`id="${id}"`));
  assert.match(MEDIA, /\['#mvpShowNameMain','mvpShowName'\]/);
  assert.match(MEDIA, /w\.mvpShowCoins===true\?'checked':''/);
});
