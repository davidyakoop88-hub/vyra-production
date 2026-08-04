'use strict';
// Reproduktion av tva rapporterade fel, bada med samma rot.
//
//   1. "nar jag tar bort alla widgets fran layouten kommer de tillbaka — och widgets jag inte valt"
//   2. "jag lagger till en widget, loggar ut och in, och alla mina widgets ar borta"
//
// cloud-sync.js:81:
//
//     }else if(!ownsLocal||!local?.widgets?.length){ await apply(overlay.state) }
//
// "Lokalt har noll widgets" behandlas ALLTID som "den har enheten har inget — hamta molnets".
// Grenen finns for en ny dator utan lokal layout, vilket ar rimligt. Men den kan inte skilja
// "har ingen layout an" fran "anvandaren raderade precis allt" eller "utloggningen neutraliserade
// staten". Alla tre ser ut som widgets.length === 0.
//
// __vyraUserEmptiedWidgets, flaggan som VET skillnaden, lases bara i push() — aldrig har.
//
// Testerna nedan kor den riktiga cloud-sync.js mot ett styrt API. De ar skrivna for att FALLA sa
// lange felet finns kvar.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'cloud-sync.js'), 'utf8');

const WS = 'ws_test';
const OVERLAY = 'ov_test';
const MINA = [{ id: 'w-mina-1', type: 'templateHeartGoal' }, { id: 'w-mina-2', type: 'templateTopGift' }];
const SERVERNS = [{ id: 'w-server-1', type: 'templateLikeFountain' }, { id: 'w-server-2', type: 'templateTopGift' }];

function makeEnv({ local, meta = true, parked = null, serverWidgets = SERVERNS, projectOk = true, emptied = false }) {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i],
    get length() { return store.size }
  };
  if (local) localStorage.setItem('vyra-state', JSON.stringify(local));
  if (meta) localStorage.setItem(`vyra-cloud-sync-meta:${WS}`,
    JSON.stringify({ workspaceId: WS, overlayId: OVERLAY, version: 1, updatedAt: '', lastLocal: null }));
  if (parked) localStorage.setItem(`vyra-session-backup:${WS}`, JSON.stringify(parked));

  const puts = [];
  const api = async (p, options = {}) => {
    if (options.method === 'PUT') {
      puts.push(JSON.parse(options.body));
      return { overlay: { id: OVERLAY, name: 'x', version: 2, state: JSON.parse(options.body).state } };
    }
    if (/\/overlays\/[^/]+$/.test(p)) {
      return { overlay: { id: OVERLAY, name: 'x', version: 1, state: { widgets: serverWidgets } } };
    }
    return { overlays: [{ id: OVERLAY, name: 'x', version: 1 }] };
  };

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Map, Set, Boolean, Error, Promise, Date, isNaN,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    localStorage,
    location: { search: '' },
    document: { querySelectorAll: () => [], querySelector: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, append() {}, querySelector: () => null, querySelectorAll: () => [] }), body: { append() {} }, addEventListener() {} },
    addEventListener: () => {},
    VyraAuth: { api },
    VyraSessionState: {
      canPush: () => true,
      canQueue: () => true,
      beginProjection: () => ({ projectionId: 'p1' }),
      // Emulerar den riktiga: en lyckad projektion SKRIVER staten, en misslyckad ror ingenting.
      // projectOk:false faller BARA aterlamningen av det parkerade arbetet (reason
      // 'backup-restored'). Lat den falla allt skulle apply() ocksa misslyckas, och testet skulle
      // bli gront for att ingenting skrevs — inte for att ratt sak skrevs. Det hande i forsta
      // versionen av det har testet.
      projectActive: async (token, opts) => {
        if (!projectOk && opts.reason === 'backup-restored') return { ok: false, reason: 'test' };
        localStorage.setItem('vyra-state', JSON.stringify(opts.state));
        return { ok: true };
      },
      projectLocalSession: async () => ({ ok: true })
    }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.root = sandbox;
  if (emptied) sandbox.__vyraUserEmptiedWidgets = true;
  vm.runInNewContext(SOURCE, sandbox, { filename: 'cloud-sync.js' });

  const widgetsNow = () => {
    try { return (JSON.parse(localStorage.getItem('vyra-state') || '{}').widgets || []).map(w => w.id) }
    catch { return null }
  };
  return { sandbox, localStorage, puts, widgetsNow };
}

const settle = () => new Promise(r => setImmediate(r));

// ---- fel 1: raderade widgets kommer tillbaka ------------------------------------------------------
test('en layout som anvandaren sjalv tomt hamtar INTE hem serverns widgets', async () => {
  // Anvandaren har raderat allt. Flaggan ar satt, precis som studio.js och media.js gor.
  const env = makeEnv({ local: { widgets: [] }, emptied: true });
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();

  assert.deepEqual(env.widgetsNow(), [],
    `layouten fylldes med serverns widgets: ${JSON.stringify(env.widgetsNow())}`);
});

test('widgets anvandaren aldrig valt dyker inte upp i hens layout', async () => {
  const env = makeEnv({ local: { widgets: [] }, emptied: true });
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();

  const ids = env.widgetsNow() || [];
  assert.ok(!ids.includes('w-server-1'),
    'templateLikeFountain kom tillbaka trots att den aldrig lagts till lokalt');
});

// ---- fel 2: widgets forsvinner vid ut- och inloggning ---------------------------------------------
test('en parkerad layout aterlamnas vid inloggning', async () => {
  // Utloggningen neutraliserar staten och parkerar den under vyra-session-backup:<workspaceId>.
  const env = makeEnv({ local: { widgets: [] }, parked: { state: { widgets: MINA }, extras: {} } });
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();

  assert.deepEqual(env.widgetsNow(), ['w-mina-1', 'w-mina-2'],
    'den parkerade layouten kom inte tillbaka');
});

test('en parkerad layout kastas inte tyst nar aterlamningen misslyckas', async () => {
  // cloud-sync.js:81 har en reservvag: gar projectActive fel anvands molnets layout i stallet.
  // Anvandarens arbete forsvinner da utan att nagot syns.
  const env = makeEnv({ local: { widgets: [] }, parked: { state: { widgets: MINA }, extras: {} }, projectOk: false });
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();

  const ids = env.widgetsNow() || [];
  assert.ok(!ids.includes('w-server-1'),
    'molnets layout ersatte den parkerade utan att anvandaren tillfragades');
  assert.ok(env.localStorage.getItem(`vyra-session-backup:${WS}`),
    'backupen togs bort trots att den aldrig aterlamnades — arbetet ar da borta for gott');
});

test('utan parkering ersatts en tom lokal layout anda inte tyst', async () => {
  // Saknas workspaceId vid utloggning skrivs ingen backup alls (session-state.js:388).
  // Da ser inloggningen bara en tom lokal layout — och tar molnets.
  const env = makeEnv({ local: { widgets: [] }, parked: null, emptied: false });
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();

  assert.deepEqual(env.widgetsNow(), [],
    'molnets layout skrevs in i en tom lokal state utan att nagon fragade');
});

// ---- det som MASTE fortsatta fungera --------------------------------------------------------------
test('en genuint ny enhet hamtar fortfarande molnets layout', async () => {
  // Grenen finns av ett skal. Ingen meta = den har enheten har aldrig agt den har layouten.
  const env = makeEnv({ local: null, meta: false });
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();

  assert.deepEqual(env.widgetsNow(), ['w-server-1', 'w-server-2'],
    'en ny dator ska hamta molnets layout — den grenen far inte gå sönder');
});
