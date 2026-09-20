'use strict';
// EN TOMD WIDGET DOLJS I OVERLAY - OCH FORSTA GAVAN VISAR DEN IGEN.
//
// Uppmatt 2026-09-20 i overlay (Chromium 1080x1920): Top Gift tomd -> display:none!important;
// efter en gava stod "wpwer17 ◉ 10" i noden och display var fortfarande none. Livedatan ar en
// riktad DOM-patch, aldrig en render(), sa ingenting tog bort doljningen - och varje sandning
// borjar med live:start som tommer. Top Gift syntes darfor aldrig under en hel sandning.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const js = fs.readFileSync(path.join(__dirname, '..', 'vyra-tom-widget.js'), 'utf8');

function rigg({ overlay = true } = {}) {
  const dom = new JSDOM('<!doctype html><body><div class="canvas"></div></body>',
    { url: 'http://localhost/studio.html' + (overlay ? '?overlay=1' : ''), runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(`var view='editor',selected=null,state={widgets:[]},save=()=>{},render=()=>{},
    liveWidget=id=>state.widgets.find(x=>x.id===id),bind=()=>{},
    wh=w=>'<div class="widget vyra-topgift" data-id="'+w.id+'" style="'+(w.hidden?'display:none;':'')+'left:0"><strong>'+(w.dataName||'')+'</strong></div>';`);
  w.eval(js);
  return w;
}
const montera = (w, widget) => {
  w.eval('state').widgets.push(widget);
  const box = w.document.querySelector('.canvas');
  box.innerHTML = w.eval('wh')(widget);
  return box.querySelector('[data-id="' + widget.id + '"]');
};
const tick = () => new Promise(r => setTimeout(r, 5));

test('tomd Top Gift doljs i overlay med !important, inte i editorn', () => {
  const tomd = { id: 'g1', type: 'templateTopGift' };
  assert.match(rigg().eval('wh')(tomd), /style="display:none!important;/);
  assert.doesNotMatch(rigg({ overlay: false }).eval('wh')(tomd), /display:none/);
  // 0 ar inget varde: en nolla pa skarmen ser ut som ett fel.
  assert.match(rigg().eval('wh')({ id: 'g2', type: 'templateTopGift', dataValue: 0 }), /display:none!important/);
});

test('forsta livehandelsen visar en tomd widget igen nar skrivaren gett den ett namn', async () => {
  const w = rigg();
  const widget = { id: 'g1', type: 'templateTopGift' };
  const el = montera(w, widget);
  assert.equal(el.style.display, 'none', 'utgangslaget: dold');
  // gift-event-images.js/live-leaderboard.js skriver state synkront i sin lyssnare och patchar
  // DOM:en - utan att rora display. Har spelas bara state-skrivningen.
  widget.dataName = 'wpwer17'; widget.dataValue = 10;
  w.dispatchEvent(new w.CustomEvent('vyra-live-event', { detail: { type: 'gift', username: 'wpwer17' } }));
  await tick();
  assert.equal(el.style.display, '', 'display:none!important ska vara borttagen efter forsta gavan');
});

test('en widget streamern sjalv dolt (w.hidden) rors inte av avslojandet', async () => {
  const w = rigg();
  const widget = { id: 'g1', type: 'templateTopGift', hidden: true, dataName: 'wpwer17', dataValue: 10 };
  const el = montera(w, widget);
  assert.equal(el.style.display, 'none');
  w.dispatchEvent(new w.CustomEvent('vyra-live-event', { detail: { type: 'gift', username: 'wpwer17' } }));
  await tick();
  assert.equal(el.style.display, 'none', 'w.hidden ar streamerns val och ska besta');
});

test('en fortfarande tom widget forblir dold aven om ett event kommer', async () => {
  const w = rigg();
  const widget = { id: 'g1', type: 'templateTopGift' };
  const el = montera(w, widget);
  w.dispatchEvent(new w.CustomEvent('vyra-live-event', { detail: { type: 'viewer' } }));
  await tick();
  assert.equal(el.style.display, 'none', 'ett event utan namn ska inte avsloja en tom widget');
});

test('dolj() ar exporterad sa att approved-rankings.js kan dolja Clean Flip med samma regel', () => {
  const TW = rigg().eval('window.VyraTomWidget');
  assert.equal(typeof TW.dolj, 'function');
  assert.match(TW.dolj('<div class="widget" data-id="x" style="left:0">'), /style="display:none!important;left:0"/);
});
