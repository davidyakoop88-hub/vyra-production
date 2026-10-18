'use strict';
// SPARAD STRACKNING MIGRERAS BORT — EN GANG, IDEMPOTENT, UTAN ATT RORA NAGOT ANNAT (2026-10-18).
//
// Fore 2026-10-18 skrev over/under-handtaget w.widgetScaleY och vyra-rotation.js ritade
// transform:scaleY. Uppmatt i Davids sparade layout samma dag:
//   Guardian       left 280, top 49, width 717, height 570, zoom 0.35, scaleY(0.3)  — platt i sandningen
//   Fan Level 50   left 488, top 477, width 260, zoom 0.57, scaleY(0.8)              — dold
//   Top Like Voltage  scaleY(0.8) efter ett drag med laset PA
//
// REGELN (vyra-rotation.js migrera()):
//   * widgetScaleY tas bort
//   * fast komposition: ny widgetScale = widgetScale x sqrt(sy) — samma yta, naturlig form
//   * den synliga MITTPUNKTEN star kvar (strackningen gick kring mitten)
//   * egen text/media: sy blir riktig hojd (hojd x sy), samma mittpunkt
//   * inga andra falt skrivs; andra korningen gor ingenting
//
// Webblasarprovet (tests/browser/storlek-proportioner.browser.test.js) visar samma Guardian i
// den separata overlayn och mater att den inte ar platt och att mitten star kvar.
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness');

test.after(closeAll);

function rigg(widgets = []) {
  const h = createDom({ state: { widgets } });
  h.paint(widgets);
  h.load('vyra-rotation.js');
  return h;
}

// Synlig mittpunkt i dukens koordinater for en zoomad rot: (x + B/2) * z. Strackningen gick kring
// lådans mitt, sa den mittpunkten ar densamma fore och efter strackningen.
const mitt = (x, b, z) => (x + b / 2) * z;

const GUARDIAN = () => ({ id: 'templateGuardianEmblem-mvdvhtgu-9f68ff697e82', type: 'templateGuardianEmblem',
  x: 280, y: 49, width: 717, height: 570, widgetScale: 0.35, widgetScaleY: 0.3,
  guardianStep: 4, guardianUsername: '@Guardian', guardianShowUsername: true, textColor: '#ffd36b', layer: 9 });
const TOP_LIKE = () => ({ id: 'tl1', type: 'templateTopLike', skin: 'voltage', x: 40, y: 120, width: 189,
  widgetScale: 1, widgetScaleY: 0.8, aspectLocked: true, accent: '#00e5ff', likeCount: 5 });
const FAN50 = () => ({ id: 'templateFanLevel50-mvcr7at3-793578d6dde2', type: 'templateFanLevel50', x: 488, y: 477,
  width: 260, widgetScale: 0.57, widgetScaleY: 0.8, hidden: true, fl50Speed: 5 });

const utan = (w, ...nycklar) => { const k = { ...w }; nycklar.forEach(n => delete k[n]); return k; };

test('Guardian 0.3: platt blir naturlig form, ytan bevaras, mittpunkten star kvar, inget annat rors', () => {
  const T = rigg().window.VyraTransform;
  const fore = GUARDIAN(), w = GUARDIAN();
  const r = T.migrera(w, { bredd: 717, hojd: 570 });
  assert.ok(r, 'migreringen korde inte');
  assert.equal('widgetScaleY' in w, false, 'widgetScaleY finns kvar');
  assert.equal(w.widgetScale, Math.round(0.35 * Math.sqrt(0.3) * 1000) / 1000);
  // ytan: B*z * H*z*sy fore, B*z' * H*z' efter
  const ytaFore = 717 * 0.35 * 570 * 0.35 * 0.3, ytaEfter = 717 * w.widgetScale * 570 * w.widgetScale;
  assert.ok(Math.abs(ytaEfter / ytaFore - 1) < 0.01, `ytan ${ytaFore} -> ${ytaEfter}`);
  // mittpunkten, inom en enhet i widgetens rum (avrundningen av x/y)
  assert.ok(Math.abs(mitt(w.x, 717, w.widgetScale) - mitt(fore.x, 717, 0.35)) <= w.widgetScale,
    `x-mitten flyttade sig: ${mitt(fore.x, 717, 0.35)} -> ${mitt(w.x, 717, w.widgetScale)}`);
  assert.ok(Math.abs(mitt(w.y, 570, w.widgetScale) - mitt(fore.y, 570, 0.35)) <= w.widgetScale,
    `y-mitten flyttade sig: ${mitt(fore.y, 570, 0.35)} -> ${mitt(w.y, 570, w.widgetScale)}`);
  assert.deepEqual(utan(w, 'x', 'y', 'widgetScale'), utan(fore, 'x', 'y', 'widgetScale', 'widgetScaleY'),
    'migreringen skrev om andra falt an skala och lage');
});

test('Top Like Voltage och Fan Level 50 med 0.8: likformig skala ur sqrt(0.8), mitt kvar', () => {
  const T = rigg().window.VyraTransform;
  const tl = TOP_LIKE(), tlFore = TOP_LIKE();
  T.migrera(tl, { bredd: 189, hojd: 278 });
  assert.equal('widgetScaleY' in tl, false);
  assert.equal(tl.widgetScale, Math.round(Math.sqrt(0.8) * 1000) / 1000);
  assert.ok(Math.abs(mitt(tl.x, 189, tl.widgetScale) - mitt(40, 189, 1)) <= 1);
  assert.ok(Math.abs(mitt(tl.y, 278, tl.widgetScale) - mitt(120, 278, 1)) <= 1);
  assert.deepEqual(utan(tl, 'x', 'y', 'widgetScale'), utan(tlFore, 'x', 'y', 'widgetScale', 'widgetScaleY'));

  // Fan Level 50 ar DOLD (display:none) — inga layoutmatt. Bredden finns i state och haller x-mitten;
  // hojden finns ingenstans, sa y forankras i sin skalade overkant i stallet for att gissas.
  const fl = FAN50(), flFore = FAN50();
  T.migrera(fl, null);
  assert.equal('widgetScaleY' in fl, false);
  assert.equal(fl.widgetScale, Math.round(0.57 * Math.sqrt(0.8) * 1000) / 1000);
  assert.ok(Math.abs(mitt(fl.x, 260, fl.widgetScale) - mitt(488, 260, 0.57)) <= 1);
  assert.ok(Math.abs(fl.y * fl.widgetScale - 477 * 0.57) <= 1, 'overkanten flyttade sig');
  assert.equal(fl.hidden, true, 'en dold widget ska forbli dold');
  assert.deepEqual(utan(fl, 'x', 'y', 'widgetScale'), utan(flFore, 'x', 'y', 'widgetScale', 'widgetScaleY'));
});

test('andra korningen gor ingenting (idempotent)', () => {
  const T = rigg().window.VyraTransform;
  for (const skapa of [GUARDIAN, TOP_LIKE, FAN50]) {
    const w = skapa();
    T.migrera(w, { bredd: 300, hojd: 300 });
    const efterForsta = JSON.stringify(w);
    assert.equal(T.migrera(w, { bredd: 300, hojd: 300 }), null);
    assert.equal(JSON.stringify(w), efterForsta, `${w.type}: andra korningen andrade widgeten`);
  }
});

test('egen text och egen media: sy blir riktig hojd, inte skala', () => {
  const T = rigg().window.VyraTransform;
  const text = { id: 'ct', type: 'templateCustomText', x: 10, y: 100, width: 420, height: 90, widgetScaleY: 0.5, customText: 'Hej' };
  T.migrera(text);
  assert.equal('widgetScaleY' in text, false);
  assert.equal(text.height, 45);
  assert.equal(text.y, 123, 'mittpunkten (100 + 90/2) ska sta kvar: 122.5 avrundat');
  assert.equal(text.widgetScale, undefined, 'egen text ska inte fa en skala');
  assert.equal(text.width, 420);
  assert.equal(text.customText, 'Hej');

  // utan sparad hojd: renderarens standard (bild 300)
  const bild = { id: 'ci', type: 'templateCustomImage', x: 0, y: 0, width: 300, widgetScaleY: 2, mediaFit: 'contain' };
  T.migrera(bild);
  assert.equal(bild.height, 600);
  assert.equal(bild.y, -150);
  assert.equal(bild.mediaFit, 'contain');
});

test('neutralt eller korrupt widgetScaleY tas bara bort', () => {
  const T = rigg().window.VyraTransform;
  for (const v of [1, 1.002, 'snett', null, -2, 0, Infinity]) {
    const w = { id: 'n', type: 'templateTopLike', x: 5, y: 6, width: 200, widgetScale: 1.3, widgetScaleY: v };
    T.migrera(w, { bredd: 200, hojd: 100 });
    assert.deepEqual(w, { id: 'n', type: 'templateTopLike', x: 5, y: 6, width: 200, widgetScale: 1.3 }, `varde ${v}`);
  }
});

test('nar widgeten ritas migreras den direkt: noden blir ratt fore forsta malningen', async () => {
  const h = rigg();
  const w = TOP_LIKE();
  h.window.eval('state.widgets = ' + JSON.stringify([w]));
  h.paint([w]);
  await new Promise(r => setTimeout(r, 30));
  const s = h.window.eval('state.widgets[0]');
  assert.equal('widgetScaleY' in s, false, 'den ritade widgeten migrerades inte');
  assert.equal(s.widgetScale, Math.round(Math.sqrt(0.8) * 1000) / 1000);
  const el = h.document.querySelector('.canvas [data-id="tl1"]');
  assert.doesNotMatch(el.style.transform || '', /scale/, 'roten bar fortfarande en strackning');
  assert.equal(parseFloat(el.style.zoom), s.widgetScale, 'noden fick inte den nya skalan');
  assert.equal(el.style.left, s.x + 'px');
});

test('migreringen sparar inte — den skriver aldrig vid inlasning', async () => {
  // tests/inga-mount-migreringar.test.js: en ren inlasning far inte skriva till molnet. Vardet
  // foljer med nasta sparning anvandaren sjalv gor.
  const h = rigg();
  let skrivningar = 0;
  const original = h.window.VyraSessionState.writeActive;
  h.window.VyraSessionState.writeActive = (...a) => { skrivningar++; return original.apply(h.window.VyraSessionState, a); };
  const w = TOP_LIKE();
  h.window.eval('state.widgets = ' + JSON.stringify([w]));
  h.paint([w]);
  await new Promise(r => setTimeout(r, 30));
  assert.equal('widgetScaleY' in h.window.eval('state.widgets[0]'), false, 'kontroll: migreringen korde');
  assert.equal(skrivningar, 0, 'migreringen sparade vid inlasning');
});
