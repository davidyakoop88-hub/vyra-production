'use strict';
// REGEL NR 1 · PLATSHÅLLAREN ÄR TOMHET I OVERLAY (2026-10-11).
//
// Fabriken skickar Top Gift/Top Streak med '@StreamQueen · 44 999' så att editorn har något att
// designa mot. live:start tömmer fälten — men en widget som läggs till MITT I SÄNDNINGEN får inget
// live:start och bar platshållaren in i OBS (uppmätt: "TOP GIFTER ◉ 0" med demogåvans bild, och en
// ros med "×0 STREAK"). I overlay räknas platshållarnamnet som inget namn; i editorn syns den.
//
// Browserproven (tests/browser/regel-1-*.browser.test.js) mäter beteendet på den körande sidan;
// det här provet är den snabba vakten på regeln och på att cachebustarna följde med filerna.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const js = las('vyra-tom-widget.js');

// `sandning` = en pågående sändning (VyraLiveSession.runtime().aktivSession()). Regeln gäller bara då:
// den visuella riggen öppnar ?overlay=1 UTAN sändning och ska se platshållaren (CI 2026-10-11:
// utan grinden blev Top Gift/Top Streak "0×0, dold" i referenserna).
function rigg({ overlay = true, sandning = true } = {}) {
  const dom = new JSDOM('<!doctype html><body><div class="canvas"></div></body>',
    { url: 'http://localhost/studio.html' + (overlay ? '?overlay=1' : ''), runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(`var view='editor',selected=null,state={widgets:[]},save=()=>{},render=()=>{},
    liveWidget=id=>state.widgets.find(x=>x.id===id),bind=()=>{},
    wh=w=>'<div class="widget vyra-topgift" data-id="'+w.id+'" style="left:0"><strong>'+(w.dataName||'')+'</strong></div>';`);
  if (sandning) w.VyraLiveSession = { runtime: () => ({ aktivSession: () => '0f3f2a8e-9c6d-4b0a-8e2d-1a2b3c4d5e6f' }) };
  w.eval(js);
  return w;
}

test('fabrikens platshållare döljs i overlay, men inte i editorn', () => {
  const demo = { id: 'g1', type: 'templateTopGift', dataName: '@StreamQueen', dataValue: '44 999' };
  assert.match(rigg().eval('wh')(demo), /style="display:none!important;/, 'overlay: @StreamQueen är ingen tittare');
  assert.doesNotMatch(rigg({ overlay: false }).eval('wh')(demo), /display:none/, 'editorn designar mot platshållaren');
  assert.doesNotMatch(rigg({ sandning: false }).eval('wh')(demo), /display:none/, 'overlay utan sändning (den visuella riggen) ska visa platshållaren');
  // En FAKTISKT tom widget döljs i overlay oavsett sändning — det är den gamla regeln, orörd.
  assert.match(rigg({ sandning: false }).eval('wh')({ id: 'g3', type: 'templateTopGift' }), /display:none!important/);
  const streak = { id: 's1', type: 'templateTopStreak', dataName: '@StreamQueen', dataValue: 18 };
  assert.match(rigg().eval('wh')(streak), /display:none!important/, 'Top Streak bär samma platshållare');
});

test('en riktig tittare med samma mönster i namnet döljs inte', () => {
  const w = rigg();
  assert.doesNotMatch(w.eval('wh')({ id: 'g1', type: 'templateTopGift', dataName: 'wpwer17', dataValue: 10 }), /display:none/);
  assert.doesNotMatch(w.eval('wh')({ id: 'g2', type: 'templateTopGift', dataName: 'StreamQueen_88', dataValue: 10 }), /display:none/, 'bara exakt platshållarnamnet räknas');
  assert.equal(w.VyraTomWidget.platshallare('@StreamQueen'), true);
  assert.equal(w.VyraTomWidget.platshallare('Anna'), false);
});

test('cachebustarna höjdes med filerna', () => {
  const html = las('studio.html'), media = las('media.js');
  assert.match(html, /vyra-tom-widget\.js\?v=20261021-1/);
  assert.match(html, /media\.js\?v=20261025-16/);  // 20261011-6: busten foljde med nasta andring i samma fil
  assert.match(media, /live-leaderboard\.js\?v=20261025-1/);
  assert.match(media, /playground-widgets\.js\?v=20261022-2/);
  assert.match(media, /fan-level-50\.js\?v=20261020-23/);  // 20261019-1: ▶ Testa widget och deltagarlistan (PR 14); 20261018-1: slideshowen laser studions state
});

test('raderna i topplistan döljs med !important, inte med en vanlig inline-stil', () => {
  // Temana deklarerar radens display med !important (31 regler); `row.style.display='none'`
  // förlorade mot dem och fyra tomma rader stod under den enda likaren.
  const src = las('live-leaderboard.js');
  assert.match(src, /if \(person\) row\.style\.removeProperty\('display'\);\r?\n\s*else row\.style\.setProperty\('display', 'none', 'important'\);/);
  // Podium/streak-flip och Fan Level 50 döljs bara under pågående sändning — samma grind.
  assert.match(las('playground-widgets.js'), /if \(!r \|\| !r\.inst \|\| typeof r\.inst\.tom !== 'function' \|\| !iOverlay\(\) \|\| !aktivSandning\(\)\) return;/);
  assert.match(las('fan-level-50.js'), /return out\.length \? out : \(iOverlay\(\) && aktivSandning\(\) \? \[\] : demo\(\)\);/);
  assert.doesNotMatch(src, /row\.style\.display = person \? '' : 'none'/);
});
