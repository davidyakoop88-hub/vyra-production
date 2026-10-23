'use strict';
// LAST-X · ROYAL VISAR NAMNET (slutgranskningen, 2026-10-23).
//
// Royal Coronation visade bara profilbilden och "SENASTE GÅVOGIVARE": last-x-alerts.css dolde
// .last-x-name i royal (och OBS-widgeten #name). Den som gav gåvan syntes alltså inte. Nu står namnet
// under rubriken, i guld som rubriken, på en rad med ellips när det är för långt.
//
// Provet låser fast fyra saker:
//   1. renderaren skriver namnet i royal, och en riktig gåva byter det (samma väg som i sändningen),
//   2. studions CSS visar namnet i royal, på en rad med ellips — meddelandet är fortfarande dolt,
//   3. OBS-widgeten (public/widgets/last-x-alerts.html) gör samma sak,
//   4. panelen säger inte längre att royal döljer namnet.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CSS = las('last-x-alerts.css');
const OBS = las('public/widgets/last-x-alerts.html');

test.after(closeAll);

function royal(f = {}) {
  return Object.assign({ id: 'lx1', type: 'templateLastX', x: 10, y: 20, width: 500, title: 'Last-X Alerts',
    lastXType: 'gifter', lastXDesign: 'royal', lastXEntrance: 'slide-left', followDuration: 5 }, f);
}
function boot(widget) {
  const h = createDom({ state: { widgets: [widget], projectName: 'test' } });
  h.load('overlay-sanitize.js');
  h.load('last-x-alerts.js');
  const canvas = h.paint([widget]);
  const s = h.document.createElement('script');
  s.textContent = `state.widgets.length=0;state.widgets.push(${JSON.stringify(widget)})`;
  h.document.body.append(s);
  return { h, box: canvas.querySelector('[data-id="lx1"]') };
}

test('renderaren skriver namnet i royal', () => {
  const { box } = boot(royal({ followName: 'Anna' }));
  assert.ok(box, 'widgeten ritades inte ut');
  assert.ok(box.classList.contains('design-royal'));
  assert.equal(box.querySelector('.last-x-name')?.textContent, 'Anna');
  assert.equal(box.querySelector('.last-x-label')?.textContent, 'SENASTE GÅVOGIVARE');
});

test('en riktig gåva byter namnet i royal', () => {
  const { h, box } = boot(royal());
  h.window.routeLiveBattleEvent({ type: 'gift', username: 'kungen_88', coins: 500 });
  assert.equal(box.querySelector('.last-x-name')?.textContent, 'kungen_88');
});

test('ett namn med HTML skrivs som text i royal', () => {
  const { box } = boot(royal({ followName: '<b>x</b>' }));
  assert.equal(box.querySelector('.last-x-name b'), null);
  assert.equal(box.querySelector('.last-x-name')?.textContent, '<b>x</b>');
});

// ---- studions CSS ------------------------------------------------------------------------------
function regel(dom, selektor) {
  for (const ark of dom.window.document.styleSheets) for (const r of ark.cssRules) if (r.selectorText === selektor) return r.style;
  return null;
}

test('studions CSS visar namnet i royal, på en rad med ellips', () => {
  const dom = new JSDOM(`<!doctype html><html><head><style>${CSS}</style></head><body>
    <div class="widget last-x-widget design-royal last-x-active" data-id="r"><div class="last-x-tilt"><div class="last-x-copy">
      <div class="last-x-label">SENASTE GÅVOGIVARE</div><div class="last-x-name">Anna</div><div class="last-x-message">skickade 5 Rose</div>
    </div></div></div></body></html>`);
  try {
    const d = dom.window.document, cs = sel => dom.window.getComputedStyle(d.querySelector(sel));
    assert.notEqual(cs('.last-x-name').display, 'none', 'namnet är dolt i royal');
    assert.equal(cs('.last-x-message').display, 'none', 'meddelandet ska fortfarande vara dolt i royal');
    const r = regel(dom, '.last-x-widget.design-royal .last-x-name');
    assert.ok(r, 'royal saknar en egen regel för namnet');
    assert.equal(r.getPropertyValue('white-space'), 'nowrap');
    assert.equal(r.getPropertyValue('overflow'), 'hidden');
    assert.equal(r.getPropertyValue('text-overflow'), 'ellipsis');
    assert.equal(r.getPropertyValue('max-width'), '100%');
  } finally { dom.window.close(); }
});

test('studion och OBS-widgeten ger royal samma proportioner och samma namnstil', () => {
  const studioRatio = CSS.match(/design-royal \.last-x-tilt\{[^}]*aspect-ratio:([\d/]+)/);
  const obsRatio = OBS.match(/data-design="royal"\] #tilt\{[^}]*aspect-ratio:([\d/]+)/);
  assert.ok(studioRatio && obsRatio);
  assert.equal(studioRatio[1], obsRatio[1]);
  const studioAvatar = CSS.match(/design-royal \.last-x-avatar\{[^}]*top:([\d.]+%)/);
  const obsAvatar = OBS.match(/data-design="royal"\] #avatar\{[^}]*top:([\d.]+%)/);
  assert.equal(studioAvatar[1], obsAvatar[1], 'profilbilden ska sitta i samma hål i båda');
});

// ---- OBS-widgeten --------------------------------------------------------------------------------
test('OBS-widgeten visar namnet i royal, på en rad med ellips', () => {
  const stilar = [...OBS.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  const dom = new JSDOM(`<!doctype html><html data-design="royal"><head><style>${stilar}</style></head><body>
    <div id="card"><div id="tilt"><div id="copy"><div id="label">SENASTE GÅVOGIVARE</div><div id="name">Anna</div>
    <div id="message">x</div></div></div></div></body></html>`);
  try {
    const cs = id => dom.window.getComputedStyle(dom.window.document.getElementById(id));
    assert.notEqual(cs('name').display, 'none', 'OBS-widgeten döljer namnet i royal');
    assert.equal(cs('message').display, 'none');
    const r = regel(dom, 'html[data-design="royal"] #name');
    assert.ok(r, 'royal saknar en egen regel för #name');
    assert.equal(r.getPropertyValue('text-overflow'), 'ellipsis');
    assert.equal(r.getPropertyValue('white-space'), 'nowrap');
  } finally { dom.window.close(); }
});

// ---- panelen ---------------------------------------------------------------------------------------
test('panelen säger inte längre att royal döljer namnet', () => {
  const { h } = boot(royal());
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`selected='lx1';view='editor'`);
  const host = h.document.createElement('div');
  host.innerHTML = h.window.props();
  const info = host.querySelector('#lastXDoltInfo');
  assert.ok(info, 'raden om vad designen inte visar saknas');
  assert.doesNotMatch(info.textContent, /inte namnet/);
  assert.match(info.textContent, /namnet och profilbilden/);
  assert.doesNotMatch(las('vyra-lastx-panel.js'), /profilbilden för den senaste personen av varje vald typ/,
    'LIVE-raden för royal nämner bara profilbilden');
});
