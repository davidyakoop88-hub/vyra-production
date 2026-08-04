'use strict';
// Att oppna widgetkatalogen lade till widgets i anvandarens layout.
//
// Reproducerat i produktion: ETT klick pa "Lägg till i Layout" gav 9 widgets i localStorage medan
// state.widgets i minnet stod pa 0. Blandningen — templateLastX x2, templateGiftFireworks,
// templateGiftCampaign x5, templateLikeFountain — ar katalogens forsta sektioner i ordning, inte
// nagot anvandaren valt.
//
// Mekanismen ar en avsiktlig TORRKORNING i overlay-preview.js: for att rita ett korts miniatyr
// anropas kortets riktiga onclick, widgeten som skapas renderas med wh(), och sedan aterstalls
// state.widgets. render och toast byts mot no-ops. Men save() ar `const` i studio.js och gar inte
// att byta — den skriver pa riktigt.
//
// Det var hanterat sa lange alla miniatyrer ritades i en batch: styleOverlayCatalogCards() gjorde
// EN korrigerande save() pa slutet (rad 270, `if (generatedAny) save()`). Sedan blev miniatyrerna
// lazy — owgThumbObserver ritar ett kort i taget nar det scrollas in, alltsa LANGT efter att den
// korrigerande sparningen redan kort. Varje lat renderat kort lamnar darfor kvar sin
// engangswidget i localStorage, och cloud-syncs sekundtickare laser localStorage direkt och
// skickar upp den till servern.
//
// ROTT NU: torrkorningen lamnar lagringen smutsig.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'overlay-preview.js'), 'utf8');

// Sandladan speglar studio.js:s globaler sa nara torrkorningen kraver: ett state-objekt, en save()
// som skriver till en fejkad localStorage, och de funktioner overlayCatalogPreviewHtml ror.
function makeEnv() {
  const store = new Map();
  const state = { widgets: [] };
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
        append() {}, appendChild() {}, querySelector: () => null, querySelectorAll: () => [] }),
      addEventListener() {}, body: { append() {} }
    },
    addEventListener() {},
    state, selected: null, overlayPreviewWidgetId: null,
    view: 'overlay',
    wh: w => `<div data-id="${w.id}"></div>`,
    liveLayerName: () => 'Namn',
    render() {}, toast() {},
    // save() ar den riktiga vagen till lagring — den enda som INTE gar att byta ut i produktion.
    save() { sandbox.localStorage.setItem('vyra-state', JSON.stringify({ widgets: state.widgets })) }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.root = sandbox;
  vm.createContext(sandbox);
  // Bara funktionen under test plockas ut — resten av filen kraver en hel Studio.
  const at = SOURCE.indexOf('function overlayCatalogPreviewHtml');
  assert.notEqual(at, -1, 'hittade inte overlayCatalogPreviewHtml');
  const end = SOURCE.indexOf('\nfunction ', at + 10);
  vm.runInContext(SOURCE.slice(at, end === -1 ? SOURCE.length : end), sandbox,
    { filename: 'overlay-preview.js' });
  return sandbox;
}

// En katalogknapps riktiga onclick: skapar en widget, lagger den i layouten, sparar och ritar om.
// Exakt vad media.js:568 och last-x-alerts.js:375 gor.
function catalogClick(env, type) {
  return () => {
    const w = { id: type + '-' + env.state.widgets.length, type };
    env.state.widgets.push(w);
    env.selected = w.id;
    env.save();
    env.render();
  };
}

const stored = env => {
  const raw = env.localStorage.getItem('vyra-state');
  return raw ? (JSON.parse(raw).widgets || []).map(w => w.type) : null;
};

test('en torrkord miniatyr lamnar ingen widget kvar i lagringen', () => {
  const env = makeEnv();
  env.save();                                   // utgangslage: tom layout, sparad
  assert.deepEqual(stored(env), []);

  env.overlayCatalogPreviewHtml(catalogClick(env, 'templateGiftCampaign'));

  assert.deepEqual(env.state.widgets.map(w => w.type), [],
    'minnet ficks tillbaka — det fungerade redan');
  assert.deepEqual(stored(env), [],
    'lagringen har kvar torrkorningens widget: den dyker upp i layouten och synkas till servern');
});

test('en anvandares egna widgets overlever en torrkorning', () => {
  const env = makeEnv();
  env.state.widgets.push({ id: 'min-1', type: 'templateTopGift' });
  env.save();

  env.overlayCatalogPreviewHtml(catalogClick(env, 'templateLastX'));

  assert.deepEqual(stored(env), ['templateTopGift'],
    'anvandarens layout ska sta oforandrad efter att ett kort ritats');
});

test('sjutton lat renderade kort lamnar lagringen ororad', () => {
  // Katalogen har 17 sektioner. Lat rendering betyder att varje kort ar sin EGEN batch — det
  // finns ingen gemensam korrigerande save() langre.
  const env = makeEnv();
  env.state.widgets.push({ id: 'min-1', type: 'templateTopGift' });
  env.save();

  for (let i = 0; i < 17; i += 1) {
    env.overlayCatalogPreviewHtml(catalogClick(env, 'templateGiftCampaign'));
  }
  assert.deepEqual(stored(env), ['templateTopGift'],
    `lagringen innehaller ${JSON.stringify(stored(env))} efter 17 miniatyrer`);
});

test('en onclick som kastar lamnar inte heller nagot kvar', () => {
  const env = makeEnv();
  env.save();
  env.overlayCatalogPreviewHtml(() => {
    env.state.widgets.push({ id: 'halv', type: 'templateLikeFountain' });
    env.save();
    throw new Error('handlern sprack mitt i');
  });
  assert.deepEqual(stored(env), [],
    'ett undantag mitt i torrkorningen lamnade widgeten i lagringen');
});

test('miniatyren genereras fortfarande', () => {
  // Fixen far inte losa lackan genom att sluta rita korten.
  const env = makeEnv();
  env.save();
  const out = env.overlayCatalogPreviewHtml(catalogClick(env, 'templateGiftCampaign'));
  assert.match(String(out.html), /data-id=/, 'ingen miniatyr genererades langre');
  assert.equal(out.name, 'Namn');
});
