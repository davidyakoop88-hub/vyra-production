'use strict';
// VERIFIERINGEN AV STORLEKSRÄTTNINGEN (2026-10-18) — logiken som går att prova utan layout.
//
// tests/browser/storlek-verifiering.browser.test.js mäter samma fel i riktig Chrome. Här provas
// reglerna för hela katalogen och för de delar där jsdom räcker:
//   * Panelens klasser är handtagens klasser (VyraTransform.klass) — det fanns fyra, och tre av dem
//     skrev w.width/w.height på färdiga kompositioner.
//   * Panelen skriver aldrig style.height på en fast komposition.
//   * Förankringen räknas ur lådan (style.left/top, offsetmått, MÅLzoom) och håller ankaret även när
//     noden byts mot en med annan höjd — läsbarhetslägena byter layout först i render().
//   * satSkala skriver zoomen när roten har en, även om en död --tc-scale ligger kvar i stilen.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness');
const VyraWidgets = require('../widget-factory.js');
const { kravNycklar } = require('./helpers/katalognycklar.js');

test.after(closeAll);
const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Chromes zoom-semantik, uppmätt 2026-10-18: zoom multiplicerar storlek OCH left/top; offsetmåtten
// är ozoomade. Samma stubbe som tests/storlek-likformig.test.js.
function stubbaLayout(window) {
  const P = window.HTMLElement.prototype;
  const matt = el => ({ z: parseFloat(el.style.zoom) || 1, b: parseFloat(el.style.width) || 300,
    h: parseFloat(el.style.height) || 200, x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0 });
  Object.defineProperty(P, 'offsetWidth', { configurable: true, get() { return this.classList.contains('widget') ? matt(this).b : 10; } });
  Object.defineProperty(P, 'offsetHeight', { configurable: true, get() { return this.classList.contains('widget') ? matt(this).h : 10; } });
  P.getBoundingClientRect = function () {
    if (!this.classList.contains('widget')) return { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 };
    const m = matt(this), left = m.x * m.z, top = m.y * m.z, width = m.b * m.z, height = m.h * m.z;
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
  };
}

function rigg() {
  const h = createDom({ state: { widgets: [] } });
  h.paint([]);
  h.load('vyra-rotation.js');
  h.window.eval('render = function () {}; view = "editor";');
  h.load('vyra-proportioner.js');
  stubbaLayout(h.window);
  return h;
}

test('panelens klasser är handtagens: fast, text (content) och media — för varje katalognyckel', () => {
  const h = rigg();
  const { VyraProportioner: P, VyraTransform: T } = h.window;
  const fel = [];
  const antal = { fast: 0, content: 0, media: 0 };
  for (const k of kravNycklar()) {
    const w = VyraWidgets.create(k);
    const vantat = { fast: 'fast', text: 'content', media: 'media' }[T.klass(w)];
    const k2 = P.kalla(w);
    antal[k2] = (antal[k2] || 0) + 1;
    if (k2 !== vantat) fel.push(`${k}: panelen ${k2}, handtagen ${T.klass(w)}`);
    if (P.lasbar(k2) !== (k2 !== 'fast')) fel.push(`${k}: lasbar(${k2})`);
  }
  assert.deepEqual(fel, []);
  assert.ok(antal.fast > 150 && antal.content >= 1 && antal.media >= 2, JSON.stringify(antal));
});

test('panelen skriver aldrig style.height på en fast komposition, men gör det på egen text/media', async () => {
  const h = rigg();
  const vy = h.document.getElementById('view');
  const fast = { id: 'f1', type: 'templateTopLike', x: 10, y: 10, width: 250, height: 999 };
  const text = { id: 't1', type: 'templateCustomText', x: 10, y: 10, width: 300, height: 120 };
  h.window.eval('state').widgets.push(fast, text);
  vy.innerHTML = '<div class="editor-shell"><div class="canvas"><div class="widget" data-id="f1" style="left:10px;top:10px;width:250px"></div>'
    + '<div class="widget" data-id="t1" style="left:10px;top:10px;width:300px"></div></div></div>';
  await new Promise(r => setTimeout(r, 20));          // observern i vyra-proportioner.js
  assert.equal(vy.querySelector('[data-id="f1"]').style.height, '', 'en sparad w.height tvingades på en fast komposition');
  assert.equal(vy.querySelector('[data-id="t1"]').style.height, '120px', 'egen text fick inte sin riktiga höjd');
});

test('laset fångar lådans kvot och skriver ingen höjd — inte profilbildens 1:1', () => {
  const h = rigg();
  const P = h.window.VyraProportioner;
  const vy = h.document.getElementById('view');
  // Lådan 340x78 med en kvadratisk profilbild inuti: forr blev aspectRatio 1 och hojden 340.
  vy.innerHTML = '<div class="canvas"><div class="widget" data-id="m1" style="left:0;top:0;width:340px;height:78px">'
    + '<img src="assets/images/test-profile.svg" width="150" height="150"></div></div>';
  const w = { id: 'm1', type: 'templateCustomText', width: 340 };
  assert.ok(Math.abs(P.fangaRatio(w) - 340 / 78) < 1e-9, `kvoten ${w.aspectRatio}`);
  assert.equal('height' in w, false, 'låsklicket skrev en höjd');
  // utan sparad kvot faller låset tillbaka på lådan (w.width/w.height)
  assert.equal(P.kvotFor({ id: 'x', width: 400, height: 100 }), 4);
});

test('förankringen ur lådan håller motsatt kant även när noden byts mot en högre', () => {
  const h = rigg();
  const T = h.window.VyraTransform;
  const vy = h.document.getElementById('view');
  const w = { id: 'a1', type: 'templateTopLike', x: 100, y: 200, widgetScale: 0.6 };
  vy.innerHTML = '<div class="canvas"><div class="widget" data-id="a1" style="left:100px;top:200px;width:200px;height:300px;zoom:0.6"></div></div>';
  let el = vy.querySelector('.widget');
  const fore = el.getBoundingClientRect();
  const ankare = T.ankareLada(el, 'n', false);           // n-handtaget: underkanten och mitten-x står still
  T.satSkala(w, el, 0.9);
  T.hallLada(w, el, ankare, 'n', false);
  let r = el.getBoundingClientRect();
  assert.ok(Math.abs(r.bottom - fore.bottom) <= 1, `underkanten ${fore.bottom} -> ${r.bottom}`);
  assert.ok(Math.abs((r.left + r.right) / 2 - (fore.left + fore.right) / 2) <= 1, 'mitten flyttade sig i sidled');
  // render() byter noden: läsbarhetsläget ger lådan en annan höjd (300 -> 220)
  vy.innerHTML = `<div class="canvas"><div class="widget" data-id="a1" style="left:${w.x}px;top:${w.y}px;width:200px;height:220px;zoom:0.9"></div></div>`;
  el = vy.querySelector('.widget');
  T.hallLada(w, el, ankare, 'n', false);
  r = el.getBoundingClientRect();
  assert.ok(Math.abs(r.bottom - fore.bottom) <= 1, `efter render: underkanten ${fore.bottom} -> ${r.bottom}`);
});

test('förankringen läser målzoomen, inte en zoom på väg (transition på roten)', () => {
  const h = rigg();
  const T = h.window.VyraTransform;
  const vy = h.document.getElementById('view');
  vy.innerHTML = '<div class="canvas"><div class="widget" data-id="b1" style="left:60px;top:80px;width:280px;height:280px;zoom:2"></div></div>';
  const el = vy.querySelector('.widget');
  // getComputedStyle visar ett mellanläge under en transition — lådan ska ändå räknas med 2
  const orig = h.window.getComputedStyle;
  h.window.getComputedStyle = e => ({ zoom: '1', transform: 'none', getPropertyValue: () => '' });
  try {
    const r = T.lada(el);
    assert.equal(r.zoom, 2);
    assert.equal(r.width, 560);
    assert.equal(r.left, 120);
  } finally { h.window.getComputedStyle = orig; }
});

test('satSkala skriver zoomen när roten har en, även med en kvarglömd --tc-scale', () => {
  const h = rigg();
  const T = h.window.VyraTransform;
  const vy = h.document.getElementById('view');
  vy.innerHTML = '<div class="canvas"><div class="widget" data-id="c1" style="left:0;top:0;width:390px;height:157px;--tc-scale:1;zoom:1"></div></div>';
  const el = vy.querySelector('.widget');
  const w = { id: 'c1', type: 'templateTopCoins', widgetScale: 1 };
  T.satSkala(w, el, 1.25);
  assert.equal(parseFloat(el.style.zoom), 1.25, 'zoomen skrevs inte — draget syntes inte förrän släppet');
  assert.equal(el.style.getPropertyValue('--tc-scale'), '1', 'variabeln skrevs i stället för zoomen');
  // utan zoom är variabeln fortfarande mekanismen (Top Coins Halo/Signal Orbit)
  vy.innerHTML = '<div class="canvas"><div class="widget" data-id="c2" style="left:0;top:0;width:230px;--tc-scale:1"></div></div>';
  const el2 = vy.querySelector('.widget');
  T.satSkala({ id: 'c2', widgetScale: 1 }, el2, 1.5);
  assert.equal(el2.style.getPropertyValue('--tc-scale'), '1.5');
});

test('källvakter: rk6 bär ingen död skalvariabel, Pro-roten omsluter designen, cirkeln i Guardian', () => {
  assert.match(las('ranking-sixpack.js'), /\(\?:zoom\|--tc-scale\|--tp-scale\):/, 'rk6 rensar inte --tc-scale/--tp-scale ur stilen');
  const pg = las('playground-widgets.js');
  assert.match(pg, /podium: \{ w: 940, ut: 980, h: 900 \}, streak: \{ w: 760, h: 944 \}/, 'Pro-podiets/Streak Pros designyta');
  assert.match(pg, /width = Math\.round\(\(n\.ut \|\| n\.w\) \* s\)/, 'roten följer inte innehållets bredd');
  assert.match(las('media.js'), /c=geCirkel\(geo\)/, 'Guardians profilbild ritas inte som cirkel');
  assert.match(las('battle-mvp-celebrations.css'), /\.mvp-celebration \.mvc-portrait\{[^}]*width:min\(var\(--mvc-photo-width,42%\),var\(--mvc-photo-height,42%\)\);height:auto;aspect-ratio:1/);
  assert.doesNotMatch(las('studio.css'), /\.follower-spotlight\.selected\{opacity:0!important;visibility:hidden!important/, 'den valda Follower Alert döljs igen');
  assert.match(las('gift-fireworks.js'), /closest\('\.resize-handle,\.vyra-handle'\)\)return;let w=state/, 'Follower Alerts drag startar på handtagen');
});
