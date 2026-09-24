'use strict';
// RANKING-SIXPACK: sex godkanda Claude Artifact-prototyper (Voltage, Basic v2, Prism vertikal,
// Prism horisontal, Celestial, Royal Rose) integrerade som valbara designer for Top Like/Top
// Coins/Top Points. Samma regel som skinn-bara-top-like.test.js provar galler fortfarande: bara
// Top Like far en `skin-<id>`-klass, Top Coins/Top Points bar sin egen design i EGET falt.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
test.after(closeAll);

const SIXPACK = ['voltage', 'basic-v2', 'prism-vertical', 'prism-horizontal', 'celestial', 'royal-rose'];

let harness = null;
function rigg() {
  if (harness) return harness;
  const h = createDom({ state: { widgets: [], projectName: 'ranking-sixpack' } });
  h.load('overlay-sanitize.js');
  h.load('toplike-design.js');
  h.load('topcoins-v2.js');
  h.load('toppoints-v2.js');
  h.load('toplike-studio.js');
  harness = h;
  return h;
}

function klasser(w) {
  const h = rigg();
  const host = h.document.createElement('div');
  host.innerHTML = h.window.wh(w);
  const el = host.querySelector('[data-id]');
  assert.ok(el, 'widgeten renderades inte alls — provet mater ingenting');
  return [...el.classList];
}

test('toplike-design.js listar alla sex nya skinn en gang var', () => {
  const h = rigg();
  const ids = h.window.VYRA_TOPLIKE_STYLES.map(([id]) => id);
  for (const id of SIXPACK) {
    assert.ok(ids.includes(id), `saknar ${id} i VYRA_TOPLIKE_STYLES`);
    assert.equal(ids.filter(x => x === id).length, 1, `${id} listad mer an en gang`);
  }
});

test('Top Like far skin-<id> for alla sex nya, precis som de fyra gamla', () => {
  for (const id of SIXPACK) {
    const w = { id: 'tl-' + id, type: 'templateTopLike', x: 0, y: 0, width: 300, likeCount: 3, skin: id };
    assert.ok(klasser(w).includes('skin-' + id), `Top Like fick inte skin-${id}`);
  }
});

test('Top Coins/Top Points far ALDRIG en skin-klass for de sex nya (samma regel som halo/podium)', () => {
  for (const id of SIXPACK) {
    const tc = { id: 'tc-' + id, type: 'templateTopCoins', x: 0, y: 0, width: 300, likeCount: 1, topCoinsDesign: id };
    const tp = { id: 'tp-' + id, type: 'templateTopPoints', x: 0, y: 0, width: 300, likeCount: 5, topPointsDesign: id };
    assert.deepEqual(klasser(tc).filter(c => c.startsWith('skin-')), []);
    assert.deepEqual(klasser(tp).filter(c => c.startsWith('skin-')), []);
    // och de BAR sin egen design-klass, sa ranking-sixpack.css faktiskt traffar noden
    assert.ok(klasser(tc).includes('topcoins-' + id), `Top Coins saknar topcoins-${id}`);
    assert.ok(klasser(tp).includes('toppoints-' + id), `Top Points saknar toppoints-${id}`);
  }
});

test('topcoins-v2.js och toppoints-v2.js DESIGNS-tabeller har alla sex nya nycklar', () => {
  const h = rigg();
  for (const id of SIXPACK) {
    assert.ok(Object.prototype.hasOwnProperty.call(h.window.VyraTopCoins.designs, id), `Top Coins saknar ${id}`);
    assert.ok(Object.prototype.hasOwnProperty.call(h.window.VyraTopPoints.designs, id), `Top Points saknar ${id}`);
  }
});

test('riktnings-/spegelvaxeln (rankingMirror) galler for alla tre familjerna, inte bara skinnbararen', () => {
  const topLike = { id: 'm-tl', type: 'templateTopLike', x: 0, y: 0, width: 300, likeCount: 3, skin: 'voltage', rankingMirror: true };
  const topCoins = { id: 'm-tc', type: 'templateTopCoins', x: 0, y: 0, width: 300, likeCount: 1, topCoinsDesign: 'halo', rankingMirror: true };
  const topPoints = { id: 'm-tp', type: 'templateTopPoints', x: 0, y: 0, width: 300, likeCount: 5, topPointsDesign: 'clean', rankingMirror: true };
  for (const w of [topLike, topCoins, topPoints]) {
    assert.ok(klasser(w).includes('ranking-mirrored'), `${w.type} fick inte ranking-mirrored`);
  }
  const utanMirror = { id: 'm-off', type: 'templateTopLike', x: 0, y: 0, width: 300, likeCount: 3, skin: 'voltage' };
  assert.ok(!klasser(utanMirror).includes('ranking-mirrored'), 'ranking-mirrored satt aven utan att valjas');
});

test('bildassets kopierade till assets/images/ranking-sixpack/, samma mapp-konvention som profile-frames', () => {
  assert.ok(fs.existsSync('assets/images/ranking-sixpack/celestial-wing-ring.png'));
  assert.ok(fs.existsSync('assets/images/ranking-sixpack/gold-crown-rose-ring.png'));
  const css = fs.readFileSync('ranking-sixpack.css', 'utf8');
  assert.match(css, /assets\/images\/ranking-sixpack\/celestial-wing-ring\.png/);
  assert.match(css, /assets\/images\/ranking-sixpack\/gold-crown-rose-ring\.png/);
});

test('ranking-sixpack.css laddas i studio.html efter toppoints-v2.css', () => {
  const html = fs.readFileSync('studio.html', 'utf8');
  assert.match(html, /ranking-sixpack\.css\?v=/);
  assert.ok(html.indexOf('toppoints-v2.css?v=') < html.indexOf('ranking-sixpack.css?v='),
    'ranking-sixpack.css maste laddas efter toppoints-v2.css for att kunna komplettera dess klasser');
});
