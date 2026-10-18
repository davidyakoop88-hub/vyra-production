'use strict';
// VARJE KATALOGNYCKEL SKAPAS INOM DUKEN (F02, 2026-10-18).
//
// Granskningsfyndet: Guardian skapades pa x 100 med bredden 400 i den interna 432x768-duken.
// Hogerkanten blev 500 - 68 enheter, 170 px i 1080x1920-utgangen - och beskars i sandningen utan
// att nagon sa det. passaInNya (widget-grans.js) raddade det i editorn i 15 sekunder, men inte i
// forhandsbilden, den fristaende lanken eller nar widgeten skapades nagon annanstans.
//
// Provet kor fabriken i node, utan webblasare: for varje nyckel med KANDA matt (x, y, width och
// height dar den finns) ska x + width <= 432 och y + height <= 768. Hojd som foljer innehallet ar
// okand har; den provas i webblasaren (tests/browser/widget-grans.browser.test.js, katalogkorten).
//
// Nycklarna kommer ur kartan (de kort som faktiskt finns i katalogen), kontrakten och de familjer
// vars nycklar byggs av delar i media.js och darfor inte star som literaler i kartan.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));
const { CONTRACT } = require('./fixtures/catalog-variants.js');
const { kravNycklar } = require('./helpers/katalognycklar.js');

const DUK = { bredd: 432, hojd: 768 };

function allaNycklar() {
  const ut = new Map();
  kravNycklar().forEach(k => ut.set(k, undefined));
  CONTRACT.forEach(r => ut.set(r.key, r.values));
  [1, 2, 3, 4].forEach(s => ut.set('catalog:guardianemblem:' + s, undefined));
  Object.keys(VyraWidgets.variants('guardianemblem.model')).forEach(m => ut.set('catalog:guardianemblem:model:' + m, undefined));
  Object.keys(VyraWidgets.variants('lastx.design')).forEach(d => ut.set('catalog:lastx:' + d, undefined));
  Object.keys(VyraWidgets.variants('giftfireworks.motion')).forEach(m => ut.set('catalog:giftfireworks:' + m, undefined));
  ['neon', 'royal', 'glass', 'minimal', 'aurora', 'retro', 'goldrush', 'crystal-garden', 'gold', 'platinum', 'emerald']
    .forEach(t => ['portrait', 'landscape'].forEach(o => ut.set('catalog:giftcampaign:' + t + ':' + o, undefined)));
  return ut;
}

function utanfor(w) {
  const x = Number(w.x), y = Number(w.y), b = Number(w.width), h = Number(w.height);
  const fel = [];
  if (!(x >= 0)) fel.push('x ' + w.x);
  if (!(y >= 0)) fel.push('y ' + w.y);
  if (y >= DUK.hojd) fel.push('y ' + y + ' ligger nedanfor duken');
  if (Number.isFinite(b) && x + b > DUK.bredd) fel.push(`hogerkant ${x + b} > ${DUK.bredd}`);
  if (Number.isFinite(h) && y + h > DUK.hojd) fel.push(`nederkant ${y + h} > ${DUK.hojd}`);
  return fel;
}

test('varje katalognyckel med kanda matt skapas helt inom 432x768', () => {
  const nycklar = allaNycklar();
  assert.ok(nycklar.size >= 150, `bara ${nycklar.size} nycklar att prova`);
  const ute = [];
  for (const [k, values] of nycklar) {
    const w = VyraWidgets.create(k, values ? { values } : undefined);
    const fel = utanfor(w);
    if (fel.length) ute.push(`${k}: ${fel.join(', ')}`);
  }
  assert.deepEqual(ute, [], `${ute.length} nycklar skapas utanfor duken`);
});

test('Guardian, alla praktsteg och modeller: centrerad pa x 16, hela emblemet pa duken', () => {
  const nycklar = [1, 2, 3, 4].map(s => 'catalog:guardianemblem:' + s)
    .concat(Object.keys(VyraWidgets.variants('guardianemblem.model')).map(m => 'catalog:guardianemblem:model:' + m));
  assert.ok(nycklar.length >= 7);
  for (const k of nycklar) {
    const w = VyraWidgets.create(k);
    assert.equal(w.width, 400, k);
    assert.equal(w.x, 16, `${k}: x ${w.x}`);
    assert.ok(w.x + w.width <= 432, `${k}: hogerkant ${w.x + w.width}`);
    assert.ok(w.y + w.height <= 768, `${k}: nederkant ${w.y + w.height}`);
  }
});

test('praktstegens matt ryms pa x 16 i varje steg, sa ett stegbyte inte kan skjuta ut emblemet', () => {
  // media.js byter bredd och hojd ur samma tabell nar praktsteget andras.
  const matt = VyraWidgets.variants('guardianemblem.matt');
  for (const [steg, [b, h]] of Object.entries(matt)) {
    assert.ok(16 + b <= 432, `steg ${steg}: ${b} bred`);
    assert.ok(80 + h <= 768, `steg ${steg}: ${h} hog`);
  }
});
