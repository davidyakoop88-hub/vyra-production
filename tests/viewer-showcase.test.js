'use strict';
// VIEWER SHOWCASE (viewer-showcase.js, David 2026-11-07). Proven vaktar kontraktet:
//   * tre kompositioner med runda profiler; långa namn får mindre text, utan bild blir det initialer,
//   * tittarlistan bygger på riktiga livehändelser — aldrig testhändelser, och chattens text blir aldrig ett namn,
//   * en tittare i taget, högst fem i kö, paus mellan presentationerna,
//   * studion skickar bara namn, bild, rubrik och budskap till servern; OBS spelar bara en widget som finns och
//     inte är dold, och samma besked spelas aldrig två gånger,
//   * i OBS syns widgeten bara under ett firande.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const F = require(path.join(ROOT, 'widget-factory.js'));

function sida(url, extra = () => ({})) {
  const dom = new JSDOM('<!doctype html><head></head><body><div class="properties"></div></body>', { url, runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;
  w.eval('var wh=function(){return ""};var render=function(){};var props=function(){return ""};var bind=function(){};var selected=null;var view="editor";');
  w.state = { widgets: [] };
  Object.assign(w, extra(w));
  w.eval(fs.readFileSync(path.join(ROOT, 'viewer-showcase.js'), 'utf8'));
  return dom;
}
const ny = (d = 'takeover', id = 'vs1') => Object.assign(F.create('catalog:vyrapaket:showcase:' + d), { id });

test('fabriken: tre kompositioner, 300 bred inom duken, 8 sekunder', () => {
  for (const d of ['takeover', 'halo', 'spotlight']) {
    const w = F.create('catalog:vyrapaket:showcase:' + d);
    assert.equal(w.type, 'templateViewerShowcase');
    assert.equal(w.vsDesign, d);
    assert.equal(w.vsSek, 8);
    assert.ok(w.x >= 0 && w.x + w.width <= 432, 'utanför den 432 breda duken');
  }
  assert.throws(() => F.create('catalog:vyrapaket:showcase:ram'), /takeover, halo, spotlight/);
});

test('namnets storlek följer längden; utan bild blir det initialer', () => {
  const dom = sida('https://vyralive.app/studio.html'), V = dom.window.VyraViewerShowcase;
  try {
    assert.equal(V.namnKlass('Anna'), 'vs-n1');
    assert.equal(V.namnKlass('Alexandra Lund'), 'vs-n3');
    assert.equal(V.namnKlass('Ett_väldigt_långt_tittarnamn_123'), 'vs-n4');
    assert.equal(V.initialer('@sara'), 'SA');
    const w = ny('halo'); dom.window.state.widgets.push(w);
    dom.window.VyraViewerShowcase.spela(w, { namn: 'Leo', avatar: '' });
    const box = dom.window.document.createElement('div'); box.innerHTML = dom.window.wh(w);
    assert.equal(box.querySelector('.vs-avatar').textContent, 'LEO'.slice(0, 2));
    assert.equal(box.querySelector('.vs-avatar img'), null);
    assert.ok(box.querySelector('.vyra-showcase.vs-halo.vs-spelar'));
  } finally { dom.window.close(); }
});

test('text och bild kan aldrig bli HTML eller en främmande adress', () => {
  const dom = sida('https://vyralive.app/studio.html'), w = ny();
  try {
    dom.window.state.widgets.push(w);
    dom.window.VyraViewerShowcase.spela(w, { namn: '<img src=x onerror=alert(1)>', avatar: 'javascript:alert(1)', meddelande: '<script>x</script>' });
    const box = dom.window.document.createElement('div'); box.innerHTML = dom.window.wh(w);
    assert.equal(box.querySelector('script'), null);
    assert.equal(box.querySelector('[onerror]'), null);
    assert.equal(box.querySelector('.vs-avatar img'), null, 'javascript: får aldrig bli en bild');
  } finally { dom.window.close(); }
});

test('tittarlistan: riktiga händelser, aldrig test, och chattens text blir aldrig ett namn', () => {
  const dom = sida('https://vyralive.app/studio.html'), V = dom.window.VyraViewerShowcase;
  try {
    assert.equal(V.tittareAv({ type: 'chat', username: 'sara', name: 'hej allihop!', profileImage: 'https://p16.tiktokcdn.com/a.jpg' }).namn, 'sara');
    assert.equal(V.tittareAv({ type: 'chat', username: 'sara', nickname: 'Sara ✨', name: 'hej' }).namn, 'Sara ✨');
    assert.equal(V.tittareAv({ type: 'gift', username: 'leo', name: 'Leo L' }).namn, 'Leo L');
    assert.equal(V.tittareAv({ type: 'like', username: 'x', __test: true }), null);
    assert.equal(V.tittareAv({ type: 'like' }), null);
    for (let i = 0; i < 40; i++) dom.window.dispatchEvent(new dom.window.CustomEvent('vyra-live-event', { detail: { type: 'like', username: 'u' + i } }));
    dom.window.dispatchEvent(new dom.window.CustomEvent('vyra-live-event', { detail: { type: 'like', username: 'u5' } }));
    assert.equal(V._tittare.length, 30, 'listan ska hålla de 30 senaste');
    assert.equal(V._tittare[0].anv, 'u5', 'den som var aktiv senast hamnar först, utan dubblett');
    assert.equal(V._tittare.filter(t => t.anv === 'u5').length, 1);
  } finally { dom.window.close(); }
});

test('en i taget: kö på högst fem, ogiltigt namn spelas inte', () => {
  const dom = sida('https://vyralive.app/studio.html'), V = dom.window.VyraViewerShowcase, w = ny();
  try {
    dom.window.state.widgets.push(w);
    assert.equal(V.spela(w, { namn: '   ' }), 'ogiltig');
    assert.equal(V.spela(w, { namn: 'A' }), 'spelar');
    for (let i = 0; i < 5; i++) assert.equal(V.spela(w, { namn: 'K' + i }), 'ko');
    assert.equal(V.spela(w, { namn: 'för många' }), 'kon-full');
    assert.equal(V._spel.get('vs1').ko.length, 5);
    V.stoppa('vs1');
    assert.equal(V._spel.get('vs1').ko.length, 0);
  } finally { dom.window.close(); }
});

test('studion skickar bara namn, bild, rubrik och budskap till servern', async () => {
  const skickat = [];
  const dom = sida('https://vyralive.app/studio.html', () => ({
    VyraAuth: { lastDetail: () => ({ workspaces: [{ id: 'ws-1' }] }), api: async (url, opt) => { skickat.push([url, JSON.parse(opt.body)]); return { ok: true }; } }
  }));
  const w = ny('spotlight');
  try {
    dom.window.state.widgets.push(w);
    const r = await dom.window.VyraViewerShowcase.visaIObs(w, { namn: 'Anna', avatar: 'https://p16-sign-va.tiktokcdn.com/a.jpg' });
    assert.equal(r.ok, true);
    assert.equal(skickat[0][0], '/api/workspaces/ws-1/showcase');
    assert.deepEqual(Object.keys(skickat[0][1]).sort(), ['avatar', 'meddelande', 'namn', 'rubrik', 'spelId', 'widgetId']);
    assert.equal(skickat[0][1].rubrik, 'VÄLKOMMEN');
    assert.equal(skickat[0][1].meddelande, 'Kul att du är här!');
  } finally { dom.window.close(); }
});

test('OBS spelar bara en widget som finns och inte är dold, och aldrig samma besked två gånger', () => {
  const dom = sida('https://vyralive.app/studio.html?overlay=1'), V = dom.window.VyraViewerShowcase;
  const synlig = ny('takeover', 'syns'), dold = Object.assign(ny('halo', 'dold'), { hidden: true });
  try {
    dom.window.state.widgets.push(synlig, dold);
    const skicka = d => dom.window.dispatchEvent(new dom.window.CustomEvent('vyra-showcase-overlay', { detail: d }));
    skicka({ widgetId: 'dold', namn: 'X', spelId: 'a1' });
    skicka({ widgetId: 'finns-inte', namn: 'X', spelId: 'a2' });
    assert.equal(V._spel.size, 0);
    skicka({ widgetId: 'syns', namn: 'Anna', spelId: 'b1' });
    skicka({ widgetId: 'syns', namn: 'Anna', spelId: 'b1' });
    assert.equal(V._spel.get('syns').nu.person.namn, 'Anna');
    assert.equal(V._spel.get('syns').ko.length, 0, 'samma spelId spelades två gånger');
    const box = dom.window.document.createElement('div'); box.innerHTML = dom.window.wh(synlig);
    assert.ok(!box.querySelector('.vs-studio'), 'ingen studioram i OBS');
  } finally { dom.window.close(); }
});

test('i OBS syns widgeten bara under ett firande; kompositionen har ingen kortram', () => {
  const css = fs.readFileSync(path.join(ROOT, 'viewer-showcase.css'), 'utf8');
  assert.match(css, /\.overlay-output \.vyra-showcase:not\(\.vs-spelar\):not\(\.vs-stilla\)\{visibility:hidden\}/);
  assert.match(css, /\.widget\.vyra-showcase\{background:transparent!important;border:0!important/);
  assert.match(css, /border-radius:50%/, 'profilerna ska vara runda');
  assert.match(css, /animation:vsHela var\(--vs-dur,8s\)/);
});

test('overlayn tar emot beskedet och grinden väntar inte på en händelse', () => {
  const access = fs.readFileSync(path.join(ROOT, 'overlay-access.js'), 'utf8');
  assert.match(access, /source\.addEventListener\('showcase',message=>\{try\{root\.dispatchEvent\(new CustomEvent\('vyra-showcase-overlay'/);
  assert.match(fs.readFileSync(path.join(ROOT, 'overlay-aktivering.js'), 'utf8'), /'templateViewerShowcase'\]\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8'), /viewer-showcase\.js\?v=\d{8}-\d+/);
});

test('pixelvaktens stillbild: syns i OBS utan firande, och ett nytt firande tar över', () => {
  const dom = sida('https://vyralive.app/studio.html?overlay=1'), V = dom.window.VyraViewerShowcase, w = ny();
  try {
    dom.window.state.widgets.push(w);
    V.stilla();
    let box = dom.window.document.createElement('div'); box.innerHTML = dom.window.wh(w);
    assert.ok(box.querySelector('.vyra-showcase.vs-stilla:not(.vs-spelar)'));
    V.spela(w, { namn: 'Anna' });
    box = dom.window.document.createElement('div'); box.innerHTML = dom.window.wh(w);
    assert.ok(box.querySelector('.vyra-showcase.vs-spelar:not(.vs-stilla)'));
  } finally { dom.window.close(); }
});
