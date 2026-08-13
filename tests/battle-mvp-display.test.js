'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
const ROOT = path.join(__dirname, '..');
const MEDIA = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));
test.after(closeAll);

// STILMODELLERNA ar OFORANDRADE: namn och poang ar avstangda som standard.
for (const key of ['catalog:battlemvp:inferno','catalog:battlemvp:royal-purple']) {
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

// RAMMODELLERNA har ett ANNAT kontrakt sedan 2026-08-13: de visar MVP, profilbild och namn,
// och bar ingen giftdata alls. Kravet andrades av David — provet ar darfor inte urvattnat
// utan uppdelat: stilmodellerna ovan har kvar sitt gamla krav, oforandrat.
test('catalog:battlemvp:frame:gold-crown visar MVP och namn, men ingen giftdata', () => {
  const w = VyraWidgets.create('catalog:battlemvp:frame:gold-crown');
  w.id = 'ram-gold-crown';
  assert.equal(w.mvpLabel, 'MVP');
  assert.equal(w.mvpShowName, true, 'namnet ska vara pa som standard for ramarna');
  const h = createDom({ state: { widgets: [w], projectName: 'test' } });
  h.load('overlay-sanitize.js');
  const box = h.paint([w]).querySelector(`[data-id="${w.id}"]`);
  assert.equal(box.querySelector('.mvpf-plate small').textContent.trim(), 'MVP');
  const name = box.querySelector('.mvpf-row strong');
  assert.doesNotMatch(name.getAttribute('style') || '', /display:none/,
    'namnet ska synas utan att anvandaren behover slå pa det');
  assert.equal(box.querySelector('.mvpf-row b'), null,
    'coinselementet ska inte finnas i DOM — dolt racker inte, det kan tandas av gammal state');
});

test('äldre BATTLE MVP-state visas som MVP utan migration', () => {
  assert.match(MEDIA, /trim\(\)\.toUpperCase\(\)==='BATTLE MVP'\?'MVP':label/);
});

test('panelkontroller kan slå på namn och coins', () => {
  for (const id of ['mvpShowLabelMain','mvpShowNameMain','mvpShowCoins']) assert.match(MEDIA, new RegExp(`id="${id}"`));
  assert.match(MEDIA, /\['#mvpShowNameMain','mvpShowName'\]/);
  assert.match(MEDIA, /w\.mvpShowCoins===true\?'checked':''/);
});
