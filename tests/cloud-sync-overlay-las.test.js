'use strict';
// OVERLAY-UTGÅNGEN TOG STUDIONS SPARLÅS — RÖTT FÖRST (uppmätt 2026-11-26 på lokala kedjan).
//
// overlay.html är studio.html?overlay=1 och laddar samma cloud-sync.js. Öppnad i samma webbläsare
// som en inloggad studio (en vanlig flik, eller ramen i Overlay-kontrollen) projicerade den molnets
// layout med VyraSessionState.projectActive och mode 'studio-committed' — och vann markören.
// Studions nästa sparning svarade då {ok:false,reason:'lost-ownership'}, fliken gick till
// 'studio-readonly' och varje ändring därefter nekades med 'not-writable'. Inget i UI:t sa det.
// Uppmätt med gammal kod: skrivning 1 lost-ownership, skrivning 2 not-writable. Med ny kod: ok,
// och studion står kvar i studio-committed medan overlayn visar 2 widgetar i läsläge och följer
// en flytt från studion (x 0 -> 37) inom en följarrunda.
//
// Overlayn ska bara VISA: projectReadonlyOverlay (minne, inget lås, ingen markör), aldrig skapa
// en overlay, aldrig skicka, aldrig skriva meta och aldrig röra studions kö.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'cloud-sync.js'), 'utf8');
const WS = 'ws_a';

function makeEnv({ search = '', overlayer = [{ id: 'ov_a', name: 'A', version: 4 }] } = {}) {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i],
    get length() { return store.size }
  };
  const anrop = [], aktiva = [], lasande = [], intervaller = [];
  let moln = overlayer.map(o => ({ ...o, state: { widgets: [{ id: 'w1', type: 'templateTopGift', x: 0 }] } }));
  const api = async (p, options = {}) => {
    anrop.push({ metod: options.method || 'GET', p });
    if (options.method === 'POST') { const o = { id: 'ov_ny', name: 'ny', version: 1, state: JSON.parse(options.body).state }; moln.push(o); return { overlay: o } }
    if (options.method === 'PUT') throw new Error('overlayn får aldrig skicka');
    const m = p.match(/\/overlays\/([^/]+)$/);
    if (m) return { overlay: JSON.parse(JSON.stringify(moln.find(o => o.id === m[1]))) };
    return { overlays: moln.map(({ id, name, version }) => ({ id, name, version })) };
  };
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, append() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [], set innerHTML(v) {}, dataset: {} });
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Map, Set, Boolean, Error, Promise, Date, isNaN, URLSearchParams,
    setTimeout: () => 0, clearTimeout: () => {},
    setInterval: fn => { intervaller.push(fn); return intervaller.length }, clearInterval: () => {},
    localStorage, location: { search },
    document: { hidden: false, documentElement: { classList: { contains: () => false } }, querySelectorAll: () => [], querySelector: () => null, createElement: el, body: { append() {} } },
    addEventListener: () => {},
    VyraAuth: { api },
    VyraSessionState: {
      canPush: () => false, canQueue: () => false,
      beginProjection: () => ({ projectionId: 'p' }),
      projectActive: async (token, opts) => { aktiva.push(opts.mode); return { ok: true } },
      projectReadonlyOverlay: async req => { lasande.push(req.state); return { ok: true } },
      projectLocalSession: async () => ({ ok: true }),
    },
    render() {},
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.root = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: 'cloud-sync.js' });
  return { sandbox, localStorage, anrop, aktiva, lasande, intervaller, flytta: x => { moln[0] = { ...moln[0], version: moln[0].version + 1, state: { widgets: [{ ...moln[0].state.widgets[0], x }] } } } };
}
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r)) };

test('overlay-läget projicerar läsande — aldrig studio-committed', async () => {
  const env = makeEnv({ search: '?overlay=1' });
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();
  assert.deepEqual(env.aktiva, [], `overlayn anropade projectActive (${env.aktiva}) — det är så den tog studions sparlås`);
  assert.equal(env.lasande.length, 1, 'overlayn ska visa molnets layout via projectReadonlyOverlay');
  assert.equal(env.lasande[0].widgets.length, 1);
});

test('overlay-läget skriver ingenting: ingen meta, ingen kö, ingen POST eller PUT', async () => {
  const env = makeEnv({ search: '?overlay=1' });
  env.localStorage.setItem(`vyra-cloud-sync-queue:${WS}`, '{"at":1,"state":{"widgets":[]}}');
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();
  assert.equal(env.anrop.filter(a => a.metod !== 'GET').length, 0, JSON.stringify(env.anrop));
  assert.equal(env.localStorage.getItem(`vyra-cloud-sync-meta:${WS}`), null, 'overlayn skrev studions meta');
  assert.ok(env.localStorage.getItem(`vyra-cloud-sync-queue:${WS}`), 'overlayn tömde studions kö med osparade ändringar');
});

test('overlay-läget skapar ingen overlay när kontot saknar en', async () => {
  const env = makeEnv({ search: '?overlay=1', overlayer: [] });
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();
  assert.equal(env.anrop.filter(a => a.metod === 'POST').length, 0);
  assert.deepEqual(env.aktiva, []);
});

test('overlayn följer molnet: en flytt i studion når utgången, fortfarande läsande', async () => {
  const env = makeEnv({ search: '?overlay=1' });
  const fore = env.intervaller.length;   // modulens egen monteringstimer
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();
  assert.equal(env.intervaller.length, fore + 1, 'overlayn ska ha en egen följare');
  env.flytta(37);
  await env.intervaller[fore](); await settle();
  assert.equal(env.lasande.length, 2);
  assert.equal(env.lasande[1].widgets[0].x, 37);
  assert.deepEqual(env.aktiva, []);
});

test('studion är oförändrad: projicerar studio-committed som förut', async () => {
  const env = makeEnv({ search: '' });
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();
  assert.deepEqual(env.aktiva, ['studio-committed']);
  assert.equal(env.lasande.length, 0);
});

test('cachebusten höjdes med filen', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'studio.html'), 'utf8'), /cloud-sync\.js\?v=20261127-1/);
});
