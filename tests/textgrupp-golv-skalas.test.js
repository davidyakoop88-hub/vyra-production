'use strict';
// TEXTSKALAN TÅL LÄSBARHETSGOLVET (2026-10-12).
//
// ranking-sixpack.js skriver Top Gifts namn som `font-size:max(20px,calc(12px / var(--rk-z,1)))`
// så att det aldrig blir mindre än 12 synliga px. vyra-textgrupp.js:s skala() läste storleken
// med parseFloat, fick NaN och hoppade tyst över elementet — uppmätt i CI (text-grupp.browser):
// "@StreamQueen" 20px -> 20px (1.00x) vid textScale 1,5. Nu skalas det första px-talet och golvet
// står kvar; vid skala 1 lämnas renderarens värde tillbaka oförändrat.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(ROOT, 'vyra-textgrupp.js'), 'utf8');

function rigg() {
  const dom = new JSDOM('<!doctype html><body><div class="widget vyra-topgift premium-topgift" data-id="g1" style="--rk-z:0.5">'
    + '<div class="topgift-copy"><strong style="font-size:max(20px,calc(12px / var(--rk-z,1)));color:#fff">@StreamQueen</strong>'
    + '<em style="font-size:14px">◉ 48 210</em></div></div></body>', { url: 'http://localhost/studio.html', runScripts: 'outside-only' });
  const w = dom.window;
  w.eval("var state={widgets:[]},selected=null,bind=()=>{},liveWidget=()=>null,view='editor';");
  w.eval(js);
  return w;
}

test('ett max()-golv skalas i sitt första px-tal och behåller golvet', () => {
  const w = rigg();
  const rot = w.document.querySelector('.widget'), namn = rot.querySelector('strong'), varde = rot.querySelector('em');
  w.VyraTextgrupp.applicera(rot, { textScale: 1.5 });
  assert.match(namn.style.fontSize, /^max\(30px,\s*calc\(12px \/ var\(--rk-z,\s*1\)\)\)$/, namn.style.fontSize);
  // (!important vaktas inte här: jsdom:s cssstyle tappar prioriteten på max()-värden. Browserprovet
  //  text-grupp.browser mäter det beräknade resultatet i riktig Chromium.)
  assert.equal(varde.style.fontSize, '21px', 'ett vanligt px-värde skalas som förut');
  // Tillbaka till 1: renderarens värde lämnas tillbaka, golvet intakt.
  w.VyraTextgrupp.applicera(rot, { textScale: 1 });
  assert.equal(namn.style.fontSize, 'max(20px,calc(12px / var(--rk-z,1)))');
  assert.equal(varde.style.fontSize, '14px');
});

test('cachebusten höjdes med filen', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'studio.html'), 'utf8'), /vyra-textgrupp\.js\?v=20261017-festival1/);
});
