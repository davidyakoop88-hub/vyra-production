'use strict';
// Gift Fireworks: triggern, tiden och rörelsen ska styras av panelens inställningar.
//
// Panelen visade fyra kontroller som ingen kod läste. "Minsta gift-värde" (fwMin) renderades,
// sparades och hade ett default i widget-factory — men varken triggerGiftFireworks eller
// action-runtime tittade på det, så en Rose värd 1 smällde lika hårt som en Universe. "Vid avslutad
// streak" (fwStreak) fanns på exakt två rader i hela kodbasen: den som ritade kryssrutan och den som
// sparade den. Och anonymfiltret fungerade bara när någon råkade anropa funktionen med ett helt
// event — action-runtime.js:62 skickade `payload.combo||payload.repeatcount||1`, ett TAL, så
// isAnonymous och textmallens {user}/{gift} nådde aldrig fram på den enda vägen som är live.
//
// Dessutom:
//   - runtime-controls.js köade fyrverkeriet på hårdkodade 6000 ms medan grannarna läste sin
//     widgets egen tid. Vid fwDuration 10 släpptes nästa alert fyra sekunder för tidigt.
//   - vid varje sidladdning raderades alla fyrverkeri-widgetar utom den sist tillagda, och den
//     kvarvarande tvingades till x:120 y:380 — användarens position skrevs över varje omladdning.
//
// fwStreak går INTE att laga och ska därför bort ur panelen: bridge.js:241 släpper bara igenom
// den sista frame:n av en streak, så varje gåva en widget någonsin ser ÄR en avslutad streak.
// Kryssrutan lovar en skillnad som inte finns nedströms.
//
// RÖTT NU.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const ACTION_RUNTIME = fs.readFileSync(path.join(ROOT, 'action-runtime.js'), 'utf8');
const RUNTIME_CONTROLS = fs.readFileSync(path.join(ROOT, 'runtime-controls.js'), 'utf8');

test.after(closeAll);

const fw = (id, extra = {}) => Object.assign({
  id, type: 'templateGiftFireworks', x: 10, y: 10, width: 360, title: 'Gift Fireworks',
  fwMotion: 'magnetic', fwMin: 1, fwSpeed: 0.6, fwDuration: 5, fwGiftSize: 110,
  fwExplosion: 100, fwDensity: 70, fwColor: '#ff4fa3', fwColor2: '#ffd45b', fwSound: false
}, extra);

// Målar ALLA widgetar, inte bara den första — flera fyrverkerier ska kunna samexistera.
function boot(widgets, selectedId = widgets[0].id) {
  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout',
    state: { widgets, projectName: 'fw' } });
  h.load('overlay-sanitize.js');
  h.load('gift-fireworks.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`state.widgets.length=0;${widgets.map(w => `state.widgets.push(${JSON.stringify(w)})`).join(';')};`
    + `selected=${JSON.stringify(selectedId)};view='editor';`);
  run(`document.querySelector('#view').innerHTML='<div class="editor-shell"><div class="canvas">'
    +state.widgets.map(wh).join('')+'</div><div class="properties">'+props()+'</div></div>';bind();`);
  return { h, run, d: h.document };
}
const spelar = (d, id) => !!d.querySelector(`[data-id="${id}"] .gift-fireworks-fx.play`);
const läsWidget = (h, run, i = 0) => {
  run(`window.__w = JSON.parse(JSON.stringify(state.widgets[${i}]))`);
  return h.window.__w;
};

// ---- 1. minsta gift-värde ---------------------------------------------------------------------

test('en gåva under minsta gift-värde tänder inget fyrverkeri', () => {
  const { h, d } = boot([fw('fw1', { fwMin: 100 })]);
  h.window.triggerGiftFireworks({ username: 'liten', coins: 50, combo: 1 });
  assert.equal(spelar(d, 'fw1'), false, 'fwMin lästes inte — 50 mynt smällde trots gränsen 100');
});

test('en gåva på eller över gränsen tänder fyrverkeriet', () => {
  const { h, d } = boot([fw('fw1', { fwMin: 100 })]);
  h.window.triggerGiftFireworks({ username: 'stor', coins: 500, combo: 1 });
  assert.equal(spelar(d, 'fw1'), true, '500 mynt borde ha passerat gränsen 100');
});

test('gränsen läser även värdet när det kommer som value', () => {
  // Molnets kontrakt döper coins till value. live-client.js lappar tillbaka det, men triggern ska
  // inte vara beroende av att just den lappningen har hunnit köra.
  const { h, d } = boot([fw('fw1', { fwMin: 100 })]);
  h.window.triggerGiftFireworks({ username: 'moln', value: 500, combo: 1 });
  assert.equal(spelar(d, 'fw1'), true, 'värdet i `value` ignorerades');
});

test('utan satt gräns tänds fyrverkeriet av vilken gåva som helst', () => {
  const { h, d } = boot([fw('fw1')]);
  h.window.triggerGiftFireworks({ username: 'nybörjare', coins: 1, combo: 1 });
  assert.equal(spelar(d, 'fw1'), true);
});

// ---- 2. action-runtime skickar hela eventet ----------------------------------------------------

test('action-runtime skickar eventet vidare, inte bara ett tal', () => {
  const anrop = ACTION_RUNTIME.match(/triggerGiftFireworks\?\.\(([^)]*)\)/);
  assert.ok(anrop, 'anropet till triggerGiftFireworks hittades inte');
  assert.doesNotMatch(anrop[1], /payload\.combo/,
    'payload reduceras fortfarande till ett tal — isAnonymous, fwMin och {user}/{gift} tappas');
  assert.match(anrop[1], /^payload$/, `skickar "${anrop[1]}" i stället för hela payload`);
});

// ---- 3. kön reserverar widgetens egen tid ------------------------------------------------------

test('alertkön läser fyrverkeriets egen visningstid', () => {
  assert.match(RUNTIME_CONTROLS, /triggerGiftFireworks'\)[^;]*fwDuration/,
    'kön kör fortfarande på hårdkodade 6000 ms — vid 10 s överlappar nästa alert');
});

// ---- 4. flera fyrverkerier får finnas ----------------------------------------------------------

// Rensningen och positionstvånget körs EN gång, när gift-fireworks.js laddas. boot() ovan sår
// state efter laddningen, så den kan inte se dem — de här två sår före och laddar sedan.
function bootVidLaddning(widgets) {
  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout',
    state: { widgets, projectName: 'fw' } });
  h.load('overlay-sanitize.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`state.widgets.length=0;${widgets.map(w => `state.widgets.push(${JSON.stringify(w)})`).join(';')};`
    + `selected=${JSON.stringify(widgets[0].id)};view='editor';`);
  h.load('gift-fireworks.js');
  return { h, run };
}

test('två fyrverkeri-widgetar överlever att filen laddas', () => {
  const { h, run } = bootVidLaddning([fw('fw1'), fw('fw2', { x: 700 })]);
  run('window.__antal = state.widgets.filter(w=>w.type==="templateGiftFireworks").length');
  assert.equal(h.window.__antal, 2, 'den ena raderades tyst vid laddning');
});

test('en gåva tänder alla fyrverkeri-widgetar, inte bara den första', () => {
  const { h, d } = boot([fw('fw1'), fw('fw2', { x: 700 })]);
  h.window.triggerGiftFireworks({ username: 'alla', coins: 500, combo: 1 });
  assert.equal(spelar(d, 'fw1'), true, 'första tändes inte');
  assert.equal(spelar(d, 'fw2'), true, 'andra widgeten hoppades över');
});

test('varje widget gör sin egen bedömning av gränsen', () => {
  const { h, d } = boot([fw('fw1', { fwMin: 1 }), fw('fw2', { x: 700, fwMin: 1000 })]);
  h.window.triggerGiftFireworks({ username: 'mellan', coins: 500, combo: 1 });
  assert.equal(spelar(d, 'fw1'), true, 'den med låg gräns skulle ha tänt');
  assert.equal(spelar(d, 'fw2'), false, 'den med hög gräns tände trots att gåvan var för liten');
});

// ---- 5. positionen är användarens -------------------------------------------------------------

test('positionen skrivs inte över när filen laddas', () => {
  const { h, run } = bootVidLaddning([fw('fw1', { x: 700, y: 90, width: 520 })]);
  const w = läsWidget(h, run);
  assert.deepEqual({ x: w.x, y: w.y, width: w.width }, { x: 700, y: 90, width: 520 },
    'widgeten tvingades tillbaka till standardpositionen vid laddning');
});

// ---- 6. intro och outro är riktiga val ---------------------------------------------------------

test('panelen har ett ANIMATION-block med intro och outro', () => {
  const { d } = boot([fw('fw1')]);
  const grupp = [...d.querySelectorAll('.property-group')]
    .find(g => /ANIMATION/i.test(g.querySelector('h4')?.textContent || ''));
  assert.ok(grupp, 'inget ANIMATION-block i panelen');
  assert.ok(grupp.querySelector('#fwIntro'), 'introväljaren saknas');
  assert.ok(grupp.querySelector('#fwOutro'), 'outroväljaren saknas');
});

test('introt erbjuder tona in, zooma in och direkt', () => {
  const { d } = boot([fw('fw1')]);
  const opts = [...d.querySelectorAll('#fwIntro option')].map(o => o.value).sort();
  assert.deepEqual(opts, ['fade', 'instant', 'pop']);
});

test('outrot erbjuder tona bort och klipp bort direkt', () => {
  const { d } = boot([fw('fw1')]);
  const opts = [...d.querySelectorAll('#fwOutro option')].map(o => o.value).sort();
  assert.deepEqual(opts, ['cut', 'fade']);
});

test('intro- och outrotiderna ligger på elementet, inte i procent av speltiden', () => {
  // Fore fixen satt upp- och nedtoningen inbakad i fw-scene som 8% och 12% av --duration, sa en
  // kort effekt fick en kort intro vare sig man ville eller inte.
  const { d } = boot([fw('fw1')]);
  const style = d.querySelector('[data-id="fw1"] .gift-fireworks-fx').getAttribute('style');
  assert.match(style, /--fw-in:\s*\d+ms/, '--fw-in saknas');
  assert.match(style, /--fw-out:\s*\d+ms/, '--fw-out saknas');
});

test('direkt intro och klippt outro ger noll millisekunder', () => {
  const { d } = boot([fw('fw1', { fwIntro: 'instant', fwOutro: 'cut' })]);
  const style = d.querySelector('[data-id="fw1"] .gift-fireworks-fx').getAttribute('style');
  assert.match(style, /--fw-in:\s*0ms/, 'direkt intro tonar fortfarande in');
  assert.match(style, /--fw-out:\s*0ms/, 'klippt outro tonar fortfarande bort');
});

test('zoomad intro märks på elementet', () => {
  const { d } = boot([fw('fw1', { fwIntro: 'pop' })]);
  const fx = d.querySelector('[data-id="fw1"] .gift-fireworks-fx');
  assert.match(fx.className, /fw-intro-pop/, 'zoom-introt syns inte i klasserna');
});

// ---- 7. den döda kryssrutan är borta ----------------------------------------------------------

test('kryssrutan for avslutad streak ar borttagen', () => {
  // bridge.js:241 slapper bara igenom sista frame:n av en streak, sa varje gava en widget ser AR
  // en avslutad streak. Kontrollen kunde aldrig gora nagon skillnad.
  const { d } = boot([fw('fw1')]);
  assert.equal(d.querySelector('#fwStreak'), null,
    'kryssrutan lovar fortfarande en skillnad som inte finns nedstroms');
});
