'use strict';
// BERTIL PAKET (bertil-paket.js) — gåvoscenen som widget. Paketets egen modell (gift-scene.js) provas i
// tests/gift-scene.test.js; här provas det VYRA lägger till: inga förvalda gåvor, att streamerns val
// träffar på giftId och namn, att en gåva bara kastar en sak, att bara OBS reagerar på riktiga gåvor,
// att historik och dubbletter inte kastar igen, att en combo ger ett kast per gåva och att ett kast som
// inte kunde spelas ligger kvar i kön.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
test.after(closeAll);

const ROT = path.join(__dirname, '..');
const T0 = Date.now();
function rigg({ overlay = false, widgets = [] } = {}) {
  const h = createDom({ url: 'https://vyralive.app/studio.html' + (overlay ? '?overlay=1' : ''), state: { widgets, projectName: 'bp' } });
  const plays = [];
  // jsdom spelar ingen video: varje klipp är "laddat", och play() noteras.
  Object.defineProperty(h.window.HTMLMediaElement.prototype, 'readyState', { get() { return 4; }, configurable: true });
  h.window.HTMLMediaElement.prototype.load = function () {};
  h.window.HTMLMediaElement.prototype.pause = function () {};
  h.window.HTMLMediaElement.prototype.play = function () { plays.push(this); return (h.blockera ? (h.blockera = false, Promise.reject(new Error('autoplay'))) : Promise.resolve()); };
  h.load('gift-scene.js');
  h.load('bertil-paket.js');
  return { h, plays, BP: h.window.VyraBertilPaket };
}
const ny = (h, over = {}) => ({ ...h.window.VyraWidgets.create('catalog:bertilpaket'), id: 'bp1', ...over });
const gava = (over = {}) => ({ type: 'gift', id: 'g' + Math.random(), giftName: 'Rose', giftId: '5655', username: 'alice', count: 1, at: T0, ...over });
const tick = () => new Promise(r => setTimeout(r, 0));
const skicka = (h, e) => h.window.dispatchEvent(new h.window.CustomEvent('vyra-live-event', { detail: e }));
const rita = h => { h.window.eval('render()'); };

test('katalognyckeln skapar Bertil paket med Davids förval: Munk, Mishka Bear, Twinkling Star, Corgi', () => {
  const { h, BP } = rigg();
  const w = ny(h);
  assert.equal(w.type, 'templateBertilPaket');
  assert.equal(w.title, 'Bertil paket');
  assert.equal(BP.namn, 'Bertil paket');
  assert.equal(BP.kastFor(w, gava({ giftName: 'Munk', giftId: '1' })), 'egg');
  assert.equal(BP.kastFor(w, gava({ giftName: 'Doughnut', giftId: '1' })), 'egg');
  assert.equal(BP.kastFor(w, gava({ giftName: 'Misja', giftId: '5465' })), 'icecream', 'Mishka Bear träffar på id även med annat namn');
  assert.equal(BP.kastFor(w, gava({ giftName: 'Mishka Bear', giftId: '7264' })), 'icecream');
  assert.equal(BP.kastFor(w, gava({ giftName: 'Blinkande stjärna', giftId: '14242' })), 'melon');
  assert.equal(BP.kastFor(w, gava({ giftName: 'Corgi', giftId: '6267' })), 'finale');
  assert.equal(BP.kastFor(w, gava({ giftName: 'Rose', giftId: '5655' })), undefined, 'en gåva utanför förvalen kastade');
  assert.equal(JSON.stringify([w.x, w.y, w.width]), '[0,0,432]', 'scenen fyller duken');
  for (const k of BP.KAST) for (const g of w.bpGavor[k]) assert.ok(fs.existsSync(path.join(ROT, g.image)), g.image + ' saknas');
});

test('streamern kan tömma ett kast, och ett tömt kast kastar inget', () => {
  const { h, BP } = rigg();
  const w = ny(h);
  w.bpGavor.egg = [];
  assert.equal(BP.kastFor(w, gava({ giftName: 'Munk', giftId: '1' })), undefined);
});

test('alla 16 klipp finns på disk och delas korrekt per språk', () => {
  const { BP } = rigg();
  const alla = new Set();
  for (const k of BP.KAST) {
    assert.equal(BP.klipp(k, 'en').length, 3, k + ': engelska ska ha tre repliker');
    assert.equal(BP.klipp(k, 'sv').length, 1, k + ': svenska ska ha en replik');
    [...BP.klipp(k, 'en'), ...BP.klipp(k, 'sv')].forEach(f => alla.add(f));
  }
  assert.equal(alla.size, 16);
  for (const f of alla) assert.ok(fs.existsSync(path.join(ROT, f)), f + ' saknas');
  assert.ok(fs.existsSync(path.join(ROT, 'assets/gift-scene/berra-neutral-v2.png')), 'grundbilden saknas');
  assert.ok(fs.existsSync(path.join(ROT, 'assets/gift-scene/bertil-paket-katalog.webp')), 'katalogbilden saknas');
});

test('valda gåvor träffar på giftId och namn, och en gåva hör bara till ett kast', () => {
  const { BP } = rigg();
  const w = { type: 'templateBertilPaket', bpGavor: {
    egg: [{ name: 'Rose', giftId: '5655' }, { name: 'Coffee', giftId: '' }],
    melon: [{ name: 'Rose', giftId: '5655' }, { name: 'Galaxy', giftId: '11046' }],
  } };
  assert.equal(BP.kastFor(w, gava()), 'egg');
  assert.equal(BP.kastFor(w, gava({ giftName: 'Ros' })), 'egg', 'id:t träffar även när TikTok skickar namnet på svenska');
  assert.equal(BP.kastFor(w, gava({ giftName: 'coffee', giftId: '' })), 'egg');
  assert.equal(BP.kastFor(w, gava({ giftName: 'Galax', giftId: '11046' })), 'melon');
  assert.equal(BP.kastFor(w, gava({ giftName: 'GG', giftId: '6064' })), undefined);
  assert.equal(BP.kastFor(w, { ...gava(), type: 'like' }), undefined);
  assert.deepEqual(BP.gavor(w).melon.map(g => g.name), ['Galaxy'], 'Rose stod under två kast');
});

test('studion reagerar inte på riktiga gåvor — bara OBS gör det', async () => {
  const w = { id: 'bp1', type: 'templateBertilPaket', x: 0, y: 0, width: 432, bpGavor: { egg: [{ name: 'Rose', giftId: '5655' }] } };
  const { h, plays } = rigg({ widgets: [w] });
  rita(h); skicka(h, gava()); await tick();
  assert.equal(plays.length, 0, 'studion spelade ett kast — streamern hade hört det två gånger');
});

test('en combo på 55 ger 55 kast, en upprepning och kvällens historik ger inga', async () => {
  const w = { id: 'bp1', type: 'templateBertilPaket', x: 0, y: 0, width: 432, bpGavor: { egg: [{ name: 'Rose', giftId: '5655' }] } };
  const { h, plays, BP } = rigg({ overlay: true, widgets: [w] });
  rita(h);
  const combo = gava({ id: 'combo', count: 55 });
  skicka(h, combo); await tick();
  skicka(h, combo); await tick();
  skicka(h, gava({ id: 'gammal', at: T0 - 10 * 60000 })); await tick();
  assert.equal(plays.length, 1);
  assert.equal(BP.iKo(w), 54);
  for (let i = 0; i < 54; i++) { plays.at(-1).dispatchEvent(new h.window.Event('ended')); await tick(); }
  assert.equal(plays.length, 55);
  plays.at(-1).dispatchEvent(new h.window.Event('ended')); await tick();
  assert.equal(BP.iKo(w), 0);
  assert.equal(new Set(plays.slice(0, 3).map(v => v.src)).size, 3, 'samma engelska replik kom två gånger innan alla tre spelats');
});

test('blockerat ljud lägger tillbaka kastet i kön i stället för att tappa det', async () => {
  const w = { id: 'bp1', type: 'templateBertilPaket', x: 0, y: 0, width: 432, bpGavor: { finale: [{ name: 'Lion', giftId: '6369' }] } };
  const { h, plays, BP } = rigg({ overlay: true, widgets: [w] });
  rita(h); h.blockera = true;
  skicka(h, gava({ giftName: 'Lion', giftId: '6369' })); await tick(); await tick();
  assert.equal(plays.length, 1);
  assert.equal(BP.iKo(w), 1, 'det blockerade kastet försvann ur kön');
  assert.match(BP._live.get('bp1').status, /blockerades/);
});

test('dold widget kastar inget i OBS, och pausad kö väntar', async () => {
  const dold = { id: 'bp1', type: 'templateBertilPaket', hidden: true, x: 0, y: 0, width: 432, bpGavor: { egg: [{ name: 'Rose', giftId: '5655' }] } };
  const a = rigg({ overlay: true, widgets: [dold] });
  rita(a.h); skicka(a.h, gava()); await tick();
  assert.equal(a.plays.length, 0);
  assert.equal(a.h.document.querySelector('.vyra-bertil'), null, 'en dold widget renderades i OBS');

  const pausad = { ...dold, hidden: false, bpPausad: true };
  const b = rigg({ overlay: true, widgets: [pausad] });
  rita(b.h); skicka(b.h, gava({ count: 3 })); await tick();
  assert.equal(b.plays.length, 0);
  assert.equal(b.BP.iKo(pausad), 3);
});

test('OBS-scenen visar bara kast med valda gåvor, och märkningen syns alltid', () => {
  const w = { id: 'bp1', type: 'templateBertilPaket', x: 0, y: 0, width: 432, bpGavor: { melon: [{ name: 'Galaxy', giftId: '11046', image: 'https://p16-webcast.tiktokcdn.com/galaxy.png' }] } };
  const { h } = rigg({ overlay: true, widgets: [w] });
  rita(h);
  const rot = h.document.querySelector('.vyra-bertil');
  assert.ok(rot);
  assert.equal(rot.querySelectorAll('.bp-val').length, 1);
  assert.match(rot.querySelector('.bp-val').textContent, /Melonplask/);
  assert.match(rot.querySelector('.bp-ai').textContent, /AI-ANIMERAD/);
  assert.equal(rot.querySelector('.bp-status'), null, 'studions statusrad syns i OBS');
});
