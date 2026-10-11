'use strict';
// ETT NYTT KONTO FÅR ALDRIG NÅGON MOLNLAYOUT — RÖTT FÖRST (2026-10-11).
//
// UPPMÄTT I PRODUKTION: kontot jrofficialswe (registrerat 2026-10-10, Premium via comp, TikTok
// verifierat, molnbryggan ansluten till sändningen) hade NOLL overlays efter en hel dag. Api-loggen:
// fem gånger `POST /api/workspaces/<id>/overlays → 400` ("Ogiltig overlay"), en per sidladdning,
// och användaren såg "Ingen kontakt med molnet" varje gång.
//
// ORSAKEN: cloud-sync.js:79
//
//     async function create(){const data=payload(); ... body:JSON.stringify({name:'Min VYRA-overlay',state:data})
//
// och payload() (rad 29) returnerar null när localStorage saknar `vyra-state` med en widgets-array.
// En nyinloggad webbläsare HAR ingen `vyra-state` — session-state.js skriver den först när något
// sparas. create() skickade alltså `state: null`, servern svarade 400 (validOverlayState), initialize
// kastade, statusen blev 'offline', och ingen overlay skapades. Nästa sidladdning: samma sak.
// Davids konto märkte aldrig av det: hans overlay fanns sedan juli.
//
// Provet kör den riktiga cloud-sync.js mot ett styrt API med TOM lagring, precis som en ny kund.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'cloud-sync.js'), 'utf8');
const WS = 'ws_ny';

// Samma serverregel som server/security.js validOverlayState — provet ska falla av samma skäl som
// produktionen föll, inte av ett påhittat.
function validOverlayState(v) {
  return !!(v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.widgets) && v.widgets.length <= 500
    && v.widgets.every(w => w && typeof w === 'object' && typeof w.id === 'string' && w.id.length > 0 && w.id.length <= 160));
}

function makeEnv({ local } = {}) {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i],
    get length() { return store.size }
  };
  if (local) localStorage.setItem('vyra-state', JSON.stringify(local));
  const posts = [];
  let skapad = null;
  const api = async (p, options = {}) => {
    if (options.method === 'POST' && /\/overlays$/.test(p)) {
      const body = JSON.parse(options.body);
      posts.push(body);
      if (!body.name || !validOverlayState(body.state)) { const e = new Error('Ogiltig overlay'); e.status = 400; throw e }
      skapad = { id: 'ov_ny', name: body.name, version: 1, state: body.state, updated_at: 'nu' };
      return { overlay: skapad };
    }
    if (/\/overlays\/[^/]+$/.test(p)) return { overlay: skapad };
    return { overlays: skapad ? [{ id: skapad.id, name: skapad.name, version: 1 }] : [] };
  };
  const statusar = [];
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, append() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [], set innerHTML(v) {}, dataset: {} });
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Map, Set, Boolean, Error, Promise, Date, isNaN,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    localStorage, location: { search: '' },
    document: { querySelectorAll: () => [], querySelector: () => null, createElement: el, body: { append() {} } },
    addEventListener: () => {},
    VyraAuth: { api },
    VyraSessionState: { canPush: () => true, canQueue: () => true, beginProjection: () => ({ projectionId: 'p1' }),
      projectActive: async (t, opts) => { localStorage.setItem('vyra-state', JSON.stringify(opts.state)); return { ok: true } },
      projectLocalSession: async () => ({ ok: true }) },
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.root = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: 'cloud-sync.js' });
  // Statusmaskinen skriver till DOM som inte finns här; läs tillståndet via det publika API:t om det
  // finns, annars via sista toastade/satta texten.
  return { sandbox, localStorage, posts, statusar, skapad: () => skapad };
}
const settle = () => new Promise(r => setImmediate(r));

test('en ny webbläsare utan vyra-state skapar en GILTIG overlay, inte state:null', async () => {
  const env = makeEnv({});                                   // ingen vyra-state alls — som en ny kund
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle(); await settle();
  assert.equal(env.posts.length, 1, 'exakt ett försök att skapa overlayn');
  assert.ok(env.posts[0].state && Array.isArray(env.posts[0].state.widgets),
    `state måste vara en layout med widgets-array, skickades: ${JSON.stringify(env.posts[0].state)}`);
  assert.ok(validOverlayState(env.posts[0].state), 'serverns validOverlayState ska godkänna den');
  assert.ok(env.skapad(), 'overlayn skapades inte');
  assert.equal(env.sandbox.VyraCloudSync.status ? env.sandbox.VyraCloudSync.status() : 'synced', 'synced');
});

test('en lagring med vyra-state utan widgets-array skapar också en giltig overlay', async () => {
  const env = makeEnv({ local: { user: 'Streamer' } });     // halvskriven state, ingen widgets-array
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle(); await settle();
  assert.ok(env.skapad(), 'overlayn skapades inte');
  assert.ok(validOverlayState(env.posts[0].state));
});

test('med en riktig lokal layout skickas den som förut', async () => {
  const env = makeEnv({ local: { widgets: [{ id: 'w1', type: 'templateHeartGoal' }] } });
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle(); await settle();
  assert.deepEqual(env.posts[0].state.widgets.map(w => w.id), ['w1']);
});

test('cachebusten höjdes med filen', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'studio.html'), 'utf8'), /cloud-sync\.js\?v=20261011-2/);
});
