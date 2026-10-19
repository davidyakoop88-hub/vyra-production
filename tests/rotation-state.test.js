'use strict';
// Rotationens state-kontrakt i jsdom — skrivet RÖTT FÖRST.
//
// Serialiseringen är gratis (save() skriver hela state, servern validerar bara widgets-id,
// historiken diffar hela arrayen) — men gratis är inte bevisat. Här bevisas:
//
//   * save()-payloaden bär w.rotation (spion på writeActive — dom-harnessen är MED FLIT utan
//     persistens: navigator.locks saknas, ägaren faller till read-only, så ett
//     localStorage-påstående kan aldrig bita här; §7 säger då: bevisa sidoeffektens PAYLOAD).
//   * vyra-historik återställer exakt vinkel vid ångra (helt i minnet — notera() läser state
//     direkt, före writeActive).
//   * komposörens inline-kontrakt: `rotate(θ)` med !important på roten, och FRÅNVARO när
//     rotationen är neutral (bakåtkompatibiliteten). Sedan 2026-10-18 ALDRIG scaleY — sparad
//     widgetScaleY migreras till en likformig skala (tests/storlek-migrering.test.js).
//
// RIGGREGEL: måla canvasen INNAN fler skript laddas — varje h.load() är en childList-mutation
// som fyrar media.js-observatörer, och utan .canvas kraschar de och fäller fel test.
// Layoutberoende bevis (computed matrix, origin, sändningsvägen) bor i
// tests/browser/widget-rotation.browser.test.js — jsdom svarar 0 på all layout.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness');

test.after(closeAll);

const widget = (over = {}) => ({ id: 'rot1', type: 'templateTopLike', theme: 'clean',
  x: 10, y: 20, width: 320, ...over });

function rigg(w) {
  const h = createDom({ state: { widgets: [w] } });
  h.paint([w]);
  h.load('vyra-rotation.js');
  // Harnessens sessionsägare (utan Web Locks → read-only) hinner nollställa projektionen
  // efter boot — seeda om EFTER laddningarna, och trigga målaren genom en riktig
  // render-mutation (paint), aldrig genom att anropa appliceraAlla direkt (§7).
  h.window.eval('state.widgets = ' + JSON.stringify([w]));
  h.paint([w]);
  return h;
}

const vanta = () => new Promise(r => setTimeout(r, 50));

test('save-payloaden bär w.rotation exakt', () => {
  const h = rigg(widget({ rotation: 33.5 }));
  let payload = null;
  const original = h.window.VyraSessionState.writeActive;
  h.window.VyraSessionState.writeActive = (nyckel, varde) => { payload = { nyckel, varde }; return 'ok'; };
  try { h.window.eval('save()'); } finally { h.window.VyraSessionState.writeActive = original; }
  assert.ok(payload, 'save() nådde aldrig writeActive');
  assert.equal(payload.nyckel, 'vyra-state');
  assert.equal(JSON.parse(payload.varde).widgets[0].rotation, 33.5,
    'rotationen försvann ur save-payloaden');
});

test('ångra återställer exakt vinkel', () => {
  const h = rigg(widget({ rotation: 15 }));
  h.load('vyra-historik.js');
  h.window.eval('save()');                                  // snapshot: 15°
  h.window.eval('state.widgets[0].rotation = 90; save()');  // snapshot: 90°
  h.window.VyraHistorik.angra();
  assert.equal(h.window.eval('state.widgets[0].rotation'), 15,
    'ångra återställde inte vinkeln — rotationen ligger utanför historikens projektion');
});

// ÄNDRAT 2026-10-18: provet krävde förr `scaleY(1.5)` i matrisen — sträckningen var en avsiktlig
// funktion (Davids beslut 2026-08-13). Beslutet 2026-10-18 ersätter det: inget innehåll får
// sträckas. Rotationen ska fortfarande skrivas inline med !important; sträckningen aldrig, och den
// sparade widgetScaleY 1.5 ska ha blivit en likformig skala √1.5.
test('komposören skriver rotationen inline med !important — och aldrig en sträckning', () => {
  const h = rigg(widget({ rotation: 30, widgetScaleY: 1.5 }));
  const el = h.document.querySelector('[data-id="rot1"]');
  return vanta().then(() => {
    const t = el.style.getPropertyValue('transform');
    assert.equal(t, 'rotate(30deg)', `inline-transform ska vara bara rotationen: "${t}"`);
    assert.equal(el.style.getPropertyPriority('transform'), 'important',
      'utan !important förlorar inline-transformen kaskaden (uppmätt i widget-handles)');
    const w = h.window.eval('state.widgets[0]');
    assert.equal('widgetScaleY' in w, false, 'sparad sträckning migrerades inte');
    assert.equal(w.widgetScale, Math.round(Math.sqrt(1.5) * 1000) / 1000);
  });
});

test('neutralläget är frånvaro: rotation 0 (och ett neutralt widgetScaleY 1) ger ingen inline-transform', () => {
  const h = rigg(widget({ rotation: 0, widgetScaleY: 1 }));
  const el = h.document.querySelector('[data-id="rot1"]');
  return vanta().then(() => {
    assert.equal(el.style.getPropertyValue('transform'), '',
      'neutral widget bär en inline-transform — gamla layouter ska vara orörda');
  });
});

test('korrupt rotationsvärde från molnet tålas: ingen transform, ingen krasch', () => {
  const fall = ['snett', {}, [30], Infinity, NaN];
  return fall.reduce((p, korrupt) => p.then(() => {
    const h = rigg(widget({ rotation: korrupt }));
    const el = h.document.querySelector('[data-id="rot1"]');
    assert.ok(el, 'rendern kraschade på korrupt rotationsvärde');
    return vanta().then(() => {
      assert.equal(el.style.getPropertyValue('transform'), '',
        `korrupt värde ${JSON.stringify(korrupt)} gav en transform`);
    });
  }), Promise.resolve());
});

test('komposören är transformens enda skrivare — satStrackning delegerar', () => {
  // Strukturellt bevis: widget-handles.js får inte längre bära en egen
  // style.setProperty('transform', ...) — den vägen klobbrar komposörens rotation.
  const handles = fs.readFileSync(path.join(__dirname, '..', 'widget-handles.js'), 'utf8');
  assert.doesNotMatch(handles, /setProperty\(\s*['"]transform['"]/,
    'widget-handles.js skriver fortfarande transform själv — två skrivare klobbrar varandra tyst');
  assert.match(handles, /VyraTransform/,
    'widget-handles.js delegerar inte till komposören');
});

// TRANSFORMSKALAN KOMPONERAS IN (2026-10-19). Top Coins Halo/Signal Orbit skalar med
// `transform: scale(var(--tc-scale))` (topcoins-v2.css). En ensam `rotate(θ) !important` ersatte den
// regeln och widgeten föll till skala 1 när den roterades. Formen är nu translate((s−1)·50 %)
// rotate(θ) scale(s): samma s på båda axlarna, mitten där den oroterade regeln har den.
test('Top Coins transformskala: rotationen komponerar rotate(θ) scale(s), aldrig skala per axel', () => {
  const h = rigg(widget());
  const T = h.window.VyraTransform;
  const el = h.document.createElement('div');
  el.className = 'widget vyra-topcoins-new topcoins-halo';
  el.setAttribute('style', 'left:10px;top:20px;width:230px;--tc-scale:1.6');
  assert.equal(T.cssSkala(el), 1.6);
  T.applicera({ rotation: 15 }, el);
  assert.equal(el.style.getPropertyValue('transform'), 'translate(30%, 30%) rotate(15deg) scale(1.6)');
  assert.equal(el.style.getPropertyPriority('transform'), 'important');
  assert.doesNotMatch(el.style.getPropertyValue('transform'), /scale[XY]\(/);
  // Draget skriver skalan utan render(): den roterade transformen följer med.
  const w = { rotation: 15, widgetScale: 1.6 };
  T.satSkala(w, el, 2);
  assert.equal(el.style.getPropertyValue('--tc-scale'), '2');
  assert.equal(el.style.getPropertyValue('transform'), 'translate(50%, 50%) rotate(15deg) scale(2)');
  // Neutral rotation: ingen inline-transform alls, CSS-regeln skalar som förut.
  T.applicera({ rotation: 0 }, el);
  assert.equal(el.style.getPropertyValue('transform'), '');
  // rk6 tar bort klassen och skalar med zoom — då finns ingen transformskala att komponera.
  const rk6 = h.document.createElement('div');
  rk6.className = 'widget rk6 rk6-voltage';
  rk6.setAttribute('style', 'zoom:1.6');
  T.applicera({ rotation: 15 }, rk6);
  assert.equal(rk6.style.getPropertyValue('transform'), 'rotate(15deg)');
});
