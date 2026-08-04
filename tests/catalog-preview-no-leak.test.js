'use strict';
// Att oppna widgetkatalogen lade till widgets i anvandarens layout.
//
// Reproducerat i produktion med stackspar: ETT klick i katalogen gav 9 widgets i localStorage
// medan state.widgets stod pa 0. Blandningen — templateLastX x2, templateGiftFireworks,
// templateGiftCampaign x5, templateLikeFountain — var katalogens forsta sektioner i ordning.
//
//   at b.onclick                 (last-x-alerts.js:375)
//   at overlayCatalogPreviewHtml (overlay-preview.js:98)
//   at owgRenderCardThumb        (overlay-preview.js:124)
//
// overlay-preview.js ritade ett korts miniatyr genom att anropa kortets RIKTIGA onclick — alltsa
// "lagg till i layout" — och sedan angra. render och toast byttes mot no-ops, men save() ar `const`
// i studio.js och skrev pa riktigt. Sa lange alla kort ritades i en batch tackte en avslutande
// korrigerande save() det. Sedan blev miniatyrerna lazy, ritade ett kort i taget vid scroll, langt
// efter den sparningen.
//
// Ratt fix ar inte att stada efter torrkorningen. Det ar att inte torrkora alls: en miniatyr
// behover bara ETT widgetobjekt att rendera, och varje kort bar redan vilket objekt det
// representerar — data-catalog-key, data-last-x-add eller data-cw.
//
// ROTT NU: previewen gar via anvandarens layout.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'overlay-preview.js'), 'utf8');

function makeEnv() {
  const store = new Map();
  const state = { widgets: [] };
  const calls = { saves: 0, renders: 0 };
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Map, Set, Boolean, Error, Date,
    setTimeout: fn => { fn(); return 0 }, clearTimeout() {},
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    },
    document: {
      querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {} },
        append() {}, appendChild() {}, prepend() {}, remove() {},
        querySelector: () => null, querySelectorAll: () => [] }),
      addEventListener() {}, body: { append() {} }
    },
    addEventListener() {},
    state, selected: null, overlayPreviewWidgetId: null, view: 'overlay',
    wh: w => `<div class="widget" data-id="${w.id}" data-type="${w.type}"></div>`,
    liveLayerName: w => 'Namn:' + w.type,
    render() { calls.renders += 1 }, toast() {},
    save() { calls.saves += 1; sandbox.localStorage.setItem('vyra-state', JSON.stringify({ widgets: state.widgets })) },
    VyraWidgets: {
      create(key) {
        if (!String(key).startsWith('catalog:')) throw new Error('okand nyckel');
        return { id: 'created-' + key, type: 'templateGiftCampaign', width: 430 };
      }
    }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.root = sandbox;
  vm.createContext(sandbox);
  // Plocka ut previewfunktionerna. Resten av filen kraver en hel Studio.
  const from = SOURCE.indexOf('function overlayPreviewWidget');
  const at = from !== -1 ? from : SOURCE.indexOf('function overlayCatalogPreviewHtml');
  const stop = SOURCE.indexOf('function scaleThumbnailToFit');
  assert.notEqual(at, -1); assert.notEqual(stop, -1);
  vm.runInContext(SOURCE.slice(at, stop), sandbox, { filename: 'overlay-preview.js' });
  return Object.assign(sandbox, { calls });
}

// Ett kort, sa som katalogen bygger det. onclick ar den RIKTIGA lagg-till-handlern och far aldrig
// anropas for att rita en miniatyr — anropas den hamnar widgeten i anvandarens layout.
function card(dataset) {
  return {
    dataset,
    _owgOriginalClick() { throw new Error('onclick anropades — previewen gick via layouten') },
    querySelector: () => null, querySelectorAll: () => [],
    closest: () => null, prepend() {}, cloneNode: () => ({ querySelector: () => null,
      querySelectorAll: () => [], textContent: '' })
  };
}

const stored = env => {
  const raw = env.localStorage.getItem('vyra-state');
  return raw ? (JSON.parse(raw).widgets || []).map(w => w.type) : null;
};

// ---- de tre sorternas kort ---------------------------------------------------------------------
const KORT = [
  ['katalognyckel', { catalogKey: 'catalog:giftcampaign:neon:landscape' }],
  ['Last-X', { lastXAdd: 'card' }],
  ['eget innehall', { cw: 'text' }]
];

for (const [namn, dataset] of KORT) {
  test(`${namn}: miniatyren ritas utan att rora layouten`, () => {
    const env = makeEnv();
    env.state.widgets.push({ id: 'min-1', type: 'templateTopGift' });
    env.save();
    const saveFore = env.calls.saves;

    const w = env.overlayPreviewWidget(card(dataset));

    assert.ok(w && w.type, `inget widgetobjekt for ${namn}: ${JSON.stringify(w)}`);
    assert.deepEqual(env.state.widgets.map(x => x.type), ['templateTopGift'],
      'previewen andrade layouten i minnet');
    assert.deepEqual(stored(env), ['templateTopGift'], 'previewen andrade lagringen');
    assert.equal(env.calls.saves, saveFore, 'previewen sparade — det ar sa widgetarna lackte ut');
    assert.equal(env.calls.renders, 0, 'previewen ritade om canvasen');
  });
}

test('previewen anropar aldrig kortets lagg-till-handler', () => {
  const env = makeEnv();
  // card()._owgOriginalClick kastar. Kommer vi hit utan undantag har den aldrig rorts.
  for (const [, dataset] of KORT) env.overlayPreviewWidget(card(dataset));
});

test('ett kort utan igenkant markning ger null, inte ett undantag', () => {
  const env = makeEnv();
  assert.equal(env.overlayPreviewWidget(card({})), null,
    'okanda kort ska falla tillbaka pa sin ikon, inte krascha katalogen');
});

test('en trasig katalognyckel valter inte katalogen', () => {
  const env = makeEnv();
  assert.equal(env.overlayPreviewWidget(card({ catalogKey: 'trasig' })), null);
  assert.deepEqual(env.state.widgets, []);
});

// ---- kravet: en widget man valt sjalv star kvar --------------------------------------------------
test('anvandarens layout ar orord efter att hela katalogen ritats', () => {
  const env = makeEnv();
  env.state.widgets.push({ id: 'min-1', type: 'templateTopGift' },
                         { id: 'min-2', type: 'templateHeartGoal' });
  env.save();
  // 108 kort, sa som katalogen faktiskt ser ut.
  for (let i = 0; i < 108; i += 1) {
    env.overlayPreviewWidget(card(KORT[i % KORT.length][1]));
  }
  assert.deepEqual(stored(env), ['templateTopGift', 'templateHeartGoal'],
    `lagringen blev ${JSON.stringify(stored(env))} efter 108 miniatyrer`);
  assert.equal(env.calls.saves, 1, 'bara den forsta egna sparningen far ha skett');
});
