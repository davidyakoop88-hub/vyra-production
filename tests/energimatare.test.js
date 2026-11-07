'use strict';
// ENERGIMÄTAREN / HEALTH BAR (energimatare.js, David 2026-11-07). Proven vaktar det som skiljer den från ett
// mål: streamerns egna regler fyller på, nivån töms över tid, chatten har spamskydd, bara färska händelser
// räknas, nivån överlever en omladdning, och nivån stannar alltid inom 0–100.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const F = require(path.join(ROOT, 'widget-factory.js'));

function sida(url = 'https://vyralive.app/studio.html?overlay=1', lagring) {
  const dom = new JSDOM('<!doctype html><head></head><body></body>', { url, runScripts: 'dangerously' });
  const w = dom.window;
  if (lagring) for (const [k, v] of Object.entries(lagring)) w.localStorage.setItem(k, v);
  w.eval('var wh=function(){return ""};var render=function(){};var props=function(){return ""};var bind=function(){};var selected=null;var view="editor";');
  w.state = { widgets: [] };
  w.setInterval = () => 0;
  w.eval(fs.readFileSync(path.join(ROOT, 'energimatare.js'), 'utf8'));
  return dom;
}
const ny = (m = 'vital', id = 'em1', extra = {}) => Object.assign(F.create('catalog:vyrapaket:energi:' + m), { id }, extra);

test('fabriken: tre modeller, liggande inom duken, chatten avslagen från början', () => {
  for (const m of ['vital', 'arcade', 'minimal']) {
    const w = F.create('catalog:vyrapaket:energi:' + m);
    assert.equal(w.type, 'templateEnergyBar');
    assert.equal(w.emModell, m);
    assert.equal(w.emChatt, 0);
    assert.ok(w.x >= 0 && w.x + w.width <= 432);
  }
  assert.throws(() => F.create('catalog:vyrapaket:energi:neon'), /vital, arcade, minimal/);
});

test('reglerna: likes per tio, gåvor per diamant med tak, delning och följare', () => {
  const dom = sida(), E = dom.window.VyraEnergimatare;
  try {
    const r = E.regler(ny());
    assert.equal(E.poang(r, { type: 'like', count: 20 }, 0, {}), 2);
    assert.equal(E.poang(r, { type: 'gift', diamonds: 10 }, 0, {}), 5);
    assert.equal(E.poang(r, { type: 'gift', diamonds: 30000 }, 0, {}), E.MAX_PER_GAVA, 'en jättegåva får inte fylla allt');
    assert.equal(E.poang(r, { type: 'share' }, 0, {}), 5);
    assert.equal(E.poang(r, { type: 'follow' }, 0, {}), 5);
    assert.equal(E.poang(r, { type: 'chat', username: 'a' }, 0, {}), 0, 'chatten är avslagen från början');
    assert.equal(E.poang(r, { type: 'member', username: 'a' }, 0, {}), 0);
  } finally { dom.window.close(); }
});

test('chattens spamskydd: samma tittare räknas en gång per paus, andra räknas', () => {
  const dom = sida(), E = dom.window.VyraEnergimatare;
  try {
    const r = E.regler(ny('vital', 'em1', { emChatt: 2, emChattPaus: 10 })), senast = {};
    assert.equal(E.poang(r, { type: 'chat', userId: 'u1' }, 1000, senast), 2);
    assert.equal(E.poang(r, { type: 'chat', userId: 'u1' }, 5000, senast), 0);
    assert.equal(E.poang(r, { type: 'chat', userId: 'u2' }, 5000, senast), 2);
    assert.equal(E.poang(r, { type: 'chat', userId: 'u1' }, 12000, senast), 2);
  } finally { dom.window.close(); }
});

test('tömningen: poäng per minut, aldrig under noll', () => {
  const dom = sida(), E = dom.window.VyraEnergimatare;
  try {
    const r = E.regler(ny());
    assert.equal(E.tomt(50, r, 60000), 44);
    assert.equal(E.tomt(3, r, 600000), 0);
    assert.equal(E.tomt(50, E.regler(ny('vital', 'x', { emTomning: 0 })), 3600000), 50);
  } finally { dom.window.close(); }
});

test('livehändelser fyller mätaren; gamla händelser och dolda widgetar räknas inte; taket är 100', () => {
  const dom = sida(), E = dom.window.VyraEnergimatare, w = ny(), dold = ny('arcade', 'dold', { hidden: true });
  try {
    dom.window.state.widgets.push(w, dold);
    const skicka = e => dom.window.dispatchEvent(new dom.window.CustomEvent('vyra-live-event', { detail: e }));
    skicka({ type: 'follow', at: Date.now() });
    assert.ok(Math.abs(E.lage(w).niva - 55) < 0.1);
    skicka({ type: 'follow', at: Date.now() - 60000 });
    assert.ok(Math.abs(E.lage(w).niva - 55) < 0.1, 'en gammal händelse fyllde på');
    for (let i = 0; i < 20; i++) skicka({ type: 'gift', diamonds: 1000, at: Date.now() });
    assert.equal(E.lage(w).niva, 100);
    assert.ok(Math.abs(E.lage(dold).niva - 50) < 0.1, 'en dold widget räknade');
  } finally { dom.window.close(); }
});

test('nivån överlever en omladdning, med tömningen för tiden som gått', () => {
  const sparat = { 'vyra-energi-em1': JSON.stringify({ niva: 80, at: Date.now() - 60000 }) };
  const dom = sida(undefined, sparat), E = dom.window.VyraEnergimatare, w = ny();
  try {
    dom.window.state.widgets.push(w);
    const n = E.lage(w).niva;
    assert.ok(n > 73.5 && n < 74.5, 'väntade cirka 74, fick ' + n);
  } finally { dom.window.close(); }
});

test('renderingen: modell, stående, tom är röd, namnet escapas', () => {
  const dom = sida('https://vyralive.app/studio.html');
  try {
    const w = ny('arcade', 'em1', { emRiktning: 'staende', emNamn: '<b>X</b>' });
    dom.window.state.widgets.push(w);
    dom.window.VyraEnergimatare.satt(w, 0);
    const box = dom.window.document.createElement('div'); box.innerHTML = dom.window.wh(w);
    const rot = box.querySelector('.vyra-energi');
    assert.ok(rot.classList.contains('em-arcade') && rot.classList.contains('em-staende') && rot.classList.contains('em-tom'));
    assert.equal(box.querySelector('b'), null);
    assert.equal(box.querySelector('.em-varde').textContent, '0%');
    assert.equal(box.querySelector('.em-tips').textContent, 'Energin är slut');
    assert.match(rot.getAttribute('style'), /--niva:0%/);
  } finally { dom.window.close(); }
});

test('CSS: stående fylls uppåt, kortramen kommer inte från studion, overlayn väntar inte på en händelse', () => {
  const css = fs.readFileSync(path.join(ROOT, 'energimatare.css'), 'utf8');
  assert.match(css, /\.em-staende \.em-fyll\{top:auto;right:0;width:100%;height:var\(--niva,50%\)\}/);
  assert.match(css, /\.widget\.vyra-energi\{background:transparent!important/);
  assert.match(fs.readFileSync(path.join(ROOT, 'overlay-aktivering.js'), 'utf8'), /'templateEnergyBar'\]\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8'), /energimatare\.js\?v=\d{8}-\d+/);
});
