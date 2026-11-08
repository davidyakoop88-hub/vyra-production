'use strict';
// MATCH 1 VS 1 (match-1v1.js, David 2026-11-07). Proven vaktar kontraktet:
//   * riktig data från bryggans battle-händelse (scoreUs/scoreThem/winsUs/winsThem/remainingSec/battleStatus),
//   * synlig i OBS bara under en match, slutresultatet en stund, dold när händelserna tystnar,
//   * inga påhittade profiler och inga "Lag Rosa/Blå" — "Du" och "Motståndare" med initialer,
//   * bara 1 vs 1 finns; andra lägen avvisas tydligt tills de är inspelade.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const F = require(path.join(ROOT, 'widget-factory.js'));

function sida(url = 'https://vyralive.app/studio.html?overlay=1') {
  const dom = new JSDOM('<!doctype html><head></head><body></body>', { url, runScripts: 'dangerously' });
  const w = dom.window;
  w.eval('var wh=function(){return ""};var render=function(){};var props=function(){return ""};var bind=function(){};var selected=null;var view="editor";');
  w.state = { widgets: [] };
  w.setInterval = () => 0;
  w.eval(fs.readFileSync(path.join(ROOT, 'match-1v1.js'), 'utf8'));
  return dom;
}
const ny = () => Object.assign(F.create('catalog:vyrapaket:match:1v1'), { id: 'md1' });
const html = (dom, w) => { const b = dom.window.document.createElement('div'); b.innerHTML = dom.window.wh(w); return b; };

test('fabriken: bara 1 vs 1, inom duken, ärliga etiketter', () => {
  const w = F.create('catalog:vyrapaket:match:1v1');
  assert.equal(w.type, 'templateMatchDuel');
  assert.equal(w.mdVi, 'Du');
  assert.equal(w.mdDe, 'Motståndare');
  assert.ok(w.x >= 0 && w.x + w.width <= 432);
  assert.throws(() => F.create('catalog:vyrapaket:match:2v2'), /bara 1v1/);
});

test('en match: start, poäng, ledning och slut', () => {
  const dom = sida(), M = dom.window.VyraMatch1v1, w = ny();
  try {
    const T = 1_000_000;
    M.ta({ type: 'battle', battleId: 'b1', battleStatus: 'battle_started', scoreUs: 0, scoreThem: 0 }, T);
    assert.equal(M.lage(w, T + 1000), 'match');
    M.ta({ type: 'battle', battleId: 'b1', scoreUs: 900, scoreThem: 1200, remainingSec: 120, winsUs: 1 }, T + 2000);
    assert.equal(M.text(w, false), 'Motståndare leder');
    assert.equal(M.klocka(T + 12000), '1:50');
    M.ta({ type: 'battle', battleId: 'b1', battleStatus: 'battle_finished', scoreUs: 1500, scoreThem: 1200 }, T + 3000);
    assert.equal(M.lage(w, T + 4000), 'slut');
    assert.equal(M.text(w, true), 'SLUT · Du vinner');
    assert.equal(M.lage(w, T + 3000 + 11000), null, 'slutresultatet ska tonas bort efter 10 s');
  } finally { dom.window.close(); }
});

test('tystnar händelserna utan slutbesked döljs widgeten', () => {
  const dom = sida(), M = dom.window.VyraMatch1v1, w = ny();
  try {
    M.ta({ type: 'battle', battleStatus: 'battle_started', scoreUs: 10, scoreThem: 5 }, 0);
    assert.equal(M.lage(w, 29000), 'match');
    assert.equal(M.lage(w, 31000), null);
  } finally { dom.window.close(); }
});

test('OBS: dold utan match, synlig under match; inga påhittade profilbilder', () => {
  const dom = sida(), M = dom.window.VyraMatch1v1, w = ny();
  try {
    assert.ok(html(dom, w).querySelector('.vyra-match.md-dold'));
    M.ta({ type: 'battle', battleStatus: 'battle_started', scoreUs: 300, scoreThem: 100 }, Date.now());
    const b = html(dom, w);
    assert.ok(!b.querySelector('.md-dold'));
    assert.equal(b.querySelector('img'), null, 'inga profilbilder — TikTok skickar inga för motståndaren');
    assert.deepEqual([...b.querySelectorAll('.md-avatar')].map(e => e.textContent), ['DU', 'MO']);
    assert.ok(b.querySelector('.md-sida.md-leder .md-namn').textContent === 'Du');
    assert.doesNotMatch(b.textContent, /Lag Rosa|Lag Blå/);
  } finally { dom.window.close(); }
});

test('studion: exempel märkt som exempel när ingen match pågår', () => {
  const dom = sida('https://vyralive.app/studio.html'), w = ny();
  try {
    const b = html(dom, w);
    assert.match(b.textContent, /Exempel · visas i OBS under en match/);
    assert.ok(!b.querySelector('.md-dold'));
  } finally { dom.window.close(); }
});

test('namnen escapas', () => {
  const dom = sida('https://vyralive.app/studio.html'), w = Object.assign(ny(), { mdVi: '<img src=x onerror=alert(1)>' });
  try { assert.equal(html(dom, w).querySelector('[onerror]'), null); } finally { dom.window.close(); }
});

test('CSS och koppling: dold i OBS utan match, ingen kortram, grinden väntar inte', () => {
  const css = fs.readFileSync(path.join(ROOT, 'match-1v1.css'), 'utf8');
  assert.match(css, /\.overlay-output \.vyra-match\.md-dold\{visibility:hidden\}/);
  assert.match(css, /\.widget\.vyra-match\{background:transparent!important/);
  assert.match(fs.readFileSync(path.join(ROOT, 'overlay-aktivering.js'), 'utf8'), /const UNDANTAG = new Set\(\[[^\]]*'templateMatchDuel'/);
  assert.match(fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8'), /match-1v1\.js\?v=\d{8}-\d+/);
});
