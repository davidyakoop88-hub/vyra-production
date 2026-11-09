'use strict';
// I OBS RITAR EN WIDGET ALDRIG OM HELA LAYOUTEN (2026-11-09, Davids sändning).
//
// render() bygger om varje widget i layouten. Match 1 vs 1 gjorde det varje sekund under en match:
// Battle MVP syntes 0,8 s i stället för 10 s och Top Gifts gåvovideo kom aldrig igång. Quiz, Ordjakten
// och Viewer Showcase gjorde samma sak när något hände i dem (ett svar, ett löst ord, en framlyft
// tittare). I overlay-läget skriver de nu bara om sin egen nod; i studion är det render() som förut,
// eftersom panelen ska följa med.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const F = require(path.join(ROOT, 'widget-factory.js'));

const FALL = [
  { fil: 'quiz.js', nyckel: 'catalog:vyrapaket:quiz:quizshow', api: 'VyraQuiz', gor: (A, w) => A.starta(w, Date.now()) },
  { fil: 'ordjakten.js', nyckel: 'catalog:vyrapaket:ordjakten', api: 'VyraOrdjakten', gor: (A, w) => A.nasta(w) },
  { fil: 'viewer-showcase.js', nyckel: 'catalog:vyrapaket:showcase:spotlight', api: 'VyraViewerShowcase', gor: (A, w) => A.spela(w, { namn: 'Lisa', avatar: '' }) },
];

function sida(fil, url) {
  const dom = new JSDOM('<!doctype html><head></head><body><div class="properties"></div></body>', { url, runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;
  w.eval('var wh=function(){return ""};var render=function(){};var props=function(){return ""};var bind=function(){};var selected=null;var view="editor";');
  w.state = { widgets: [] };
  w.setInterval = () => 0;
  w.setTimeout = () => 0;
  w.eval(fs.readFileSync(path.join(ROOT, fil), 'utf8'));
  return dom;
}

for (const fall of FALL) {
  test(`${fall.fil} i OBS: bara widgetens egen nod skrivs om, render() anropas inte`, () => {
    const dom = sida(fall.fil, 'https://vyralive.app/studio.html?overlay=1'), win = dom.window;
    try {
      const w = Object.assign(F.create(fall.nyckel), { id: 'egen-1' });
      win.state.widgets.push(w);
      win.document.body.insertAdjacentHTML('beforeend', win.wh(w) + '<div class="widget vyra-topgift" data-id="annan"><canvas></canvas></div>');
      const fore = win.document.querySelector('.widget[data-id="egen-1"]'), annan = win.document.querySelector('[data-id="annan"]');
      assert.ok(fore, 'widgeten ritades inte alls');
      const foreHtml = fore.outerHTML;
      let renders = 0;
      win.render = () => { renders += 1; };
      fall.gor(win[fall.api], w);
      assert.equal(renders, 0, 'hela layouten ritades om i OBS');
      const efter = win.document.querySelector('.widget[data-id="egen-1"]');
      assert.ok(efter, 'widgetens nod försvann');
      assert.notEqual(efter.outerHTML, foreHtml, 'widgetens nod skrevs inte om — det nya läget syns inte');
      // --vs-off är Showcasens förlopp i sekunder sedan starten och skiljer sig mellan två anrop.
      const utanTid = h => h.replace(/--vs-off:-?[0-9.]+s/, '--vs-off:T');
      assert.equal(utanTid(efter.outerHTML), utanTid((() => { const b = win.document.createElement('div'); b.innerHTML = win.wh(w); return b.firstElementChild.outerHTML; })()), 'noden ska vara exakt det wh() ritar');
      assert.equal(win.document.querySelector('[data-id="annan"]'), annan, 'en annan widget i layouten byttes ut');
      assert.equal(win.document.querySelectorAll('.widget[data-id="egen-1"]').length, 1);
    } finally { dom.window.close(); }
  });

  test(`${fall.fil} i OBS: saknas widgetens nod ritas hela layouten, så att den kommer fram`, () => {
    const dom = sida(fall.fil, 'https://vyralive.app/studio.html?overlay=1'), win = dom.window;
    try {
      const w = Object.assign(F.create(fall.nyckel), { id: 'egen-2' });
      win.state.widgets.push(w);
      let renders = 0;
      win.render = () => { renders += 1; };
      fall.gor(win[fall.api], w);
      assert.equal(renders, 1);
    } finally { dom.window.close(); }
  });

  test(`${fall.fil} i studion: render() som förut, panelen ska följa med`, () => {
    const dom = sida(fall.fil, 'https://vyralive.app/studio.html'), win = dom.window;
    try {
      const w = Object.assign(F.create(fall.nyckel), { id: 'egen-3' });
      win.state.widgets.push(w);
      win.document.body.insertAdjacentHTML('beforeend', win.wh(w));
      let renders = 0;
      win.render = () => { renders += 1; };
      fall.gor(win[fall.api], w);
      assert.equal(renders, 1);
    } finally { dom.window.close(); }
  });
}
