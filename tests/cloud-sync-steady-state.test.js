'use strict';
// "nar jag valjer min widget i min layout, nar jag loggar ut och in, alla mina widget fran layout
// forsvinner"
//
// Uppmatt i produktion, i den riktiga Studion, med lokalt och moln overens:
//
//     gren:              6 else — saveMeta+synced
//     ownsLocal: true    lastLocalMatchar: true
//     metaVersion: 1077  molnVersion: 1077
//     widgets pa disk: 1 widgets i minnet: 0   widgets pa canvas: 0
//     lage: boot-neutral      save() -> {ok:false, reason:'not-writable'}
//
// initialize() i cloud-sync.js har sex grenar. Tre projicerar sessionen. Projektionen ar det som
// gor tva saker: den laddar layouten fran disk in i det aktiva stateobjektet — alltsa det canvasen
// ritar — OCH den satter laget till studio-committed, vilket ar det enda skrivbara laget
// (session-state.js:123).
//
// Gren 6 gor ingetdera. Och gren 6 ar NORMALLAGET: lokalt och moln overens, alltsa varje inloggning
// dar ingenting andrats sedan sist. Foljden ar att anvandaren ser en tom canvas medan layouten
// ligger kvar pa disk, och att allt hen gor darefter tyst inte nar disken — ny widget, flytt,
// storleksandring. Nasta omladdning ser likadan ut.
//
// Layouten ar alltsa aldrig borta. Den visas bara aldrig, och kan inte skrivas.
//
// Testerna nedan kor den riktiga cloud-sync.js. De ar skrivna for att FALLA sa lange felet finns.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'cloud-sync.js'), 'utf8');

const WS = 'ws_test';
const OVERLAY = 'ov_test';
const MINA = [{ id: 'w-mina-1', type: 'templateHeartGoal' }, { id: 'w-mina-2', type: 'templateTopGift' }];
const SERVERNS = [{ id: 'w-server-1', type: 'templateLikeFountain' }];

// metaVersion och serverVersion ar separata med flit. Det ar deras FORHALLANDE som valjer gren, och
// ett test som inte kan stalla in bada kan inte trafffa gren 6 avsiktligt.
// Konfliktgrenen ritar en dialog och avgors av ett klick, sa den kraver en DOM som faktiskt kan
// hitta sina knappar. En stubb med querySelector: () => null skulle gora testet gront utan att
// nagon knapp nagonsin trycktes.
const { JSDOM } = require('jsdom');

function makeEnv({ local, metaVersion = 1, serverVersion = 1, lastLocalMatchar = true,
                   serverWidgets = SERVERNS, meta = true, riktigDom = false }) {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i],
    get length() { return store.size }
  };
  const serialisedLocal = local ? JSON.stringify(local) : null;
  if (serialisedLocal) localStorage.setItem('vyra-state', serialisedLocal);
  if (meta) localStorage.setItem(`vyra-cloud-sync-meta:${WS}`, JSON.stringify({
    workspaceId: WS, overlayId: OVERLAY, version: metaVersion, updatedAt: '',
    lastLocal: lastLocalMatchar ? serialisedLocal : '{"widgets":[{"id":"nagot-annat"}]}'
  }));

  const api = async (p, options = {}) => {
    if (options.method === 'PUT') {
      return { overlay: { id: OVERLAY, name: 'x', version: serverVersion + 1, state: JSON.parse(options.body).state } };
    }
    if (/\/overlays\/[^/]+$/.test(p)) {
      return { overlay: { id: OVERLAY, name: 'x', version: serverVersion, state: { widgets: serverWidgets } } };
    }
    return { overlays: [{ id: OVERLAY, name: 'x', version: serverVersion }] };
  };

  // Varje projektion registreras. Det ar sjalva mattet: en session som aldrig projiceras ar varken
  // synlig eller skrivbar, hur ratt innehallet pa disk an ar.
  const projections = [];
  let mode = 'boot-neutral';

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Map, Set, Boolean, Error, Promise, Date, isNaN,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    localStorage,
    location: { search: '' },
    document: riktigDom
      ? new JSDOM('<!doctype html><body></body>').window.document
      : { querySelectorAll: () => [], querySelector: () => null,
          createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, append() {},
            querySelector: () => null, querySelectorAll: () => [] }),
          body: { append() {} }, addEventListener() {} },
    addEventListener: () => {},
    VyraAuth: { api },
    VyraSessionState: {
      canPush: () => true,
      canQueue: () => true,
      beginProjection: () => ({ projectionId: 'p1' }),
      mode: () => mode,
      projectActive: async (token, opts) => {
        projections.push({ mode: opts.mode, reason: opts.reason,
          widgets: (opts.state && opts.state.widgets || []).map(w => w.id) });
        localStorage.setItem('vyra-state', JSON.stringify(opts.state));
        mode = opts.mode || 'studio-committed';
        return { ok: true };
      },
      projectLocalSession: async () => ({ ok: true })
    }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.root = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: 'cloud-sync.js' });

  return { sandbox, localStorage, projections, laget: () => mode,
    widgetsNow: () => {
      try { return (JSON.parse(localStorage.getItem('vyra-state') || '{}').widgets || []).map(w => w.id) }
      catch { return null }
    } };
}

const settle = () => new Promise(r => setImmediate(r));
const boota = async env => {
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();
  return env;
};

// ---- buggen ---------------------------------------------------------------------------------------
test('lokalt och moln overens: sessionen committas, sa layouten gar att spara', async () => {
  const env = await boota(makeEnv({ local: { widgets: MINA } }));

  assert.equal(env.laget(), 'studio-committed',
    `laget blev "${env.laget()}" — i boot-neutral returnerar varje save() not-writable, sa allt ` +
    'anvandaren gor efter inloggning nar aldrig disken');
});

test('lokalt och moln overens: anvandarens layout ar den som projiceras', async () => {
  const env = await boota(makeEnv({ local: { widgets: MINA } }));

  assert.equal(env.projections.length, 1,
    'sessionen projicerades aldrig — canvasen ritas da fran ett tomt neutrallage medan layouten ' +
    'ligger kvar pa disk, vilket ar precis symptomet: "alla mina widget forsvinner"');
  assert.deepEqual(env.projections[0].widgets, ['w-mina-1', 'w-mina-2'],
    'fel layout projicerades — lokalt AGS redan av det har workspacet och ar sanningen har');
});

test('lokalt och moln overens: ingenting pa disk rors', async () => {
  // Gren 6 far bli skrivbar utan att bli en tyst omskrivning. Fixen ska projicera det som redan
  // star dar, inte byta ut det.
  const env = await boota(makeEnv({ local: { widgets: MINA } }));

  assert.deepEqual(env.widgetsNow(), ['w-mina-1', 'w-mina-2'],
    `disken blev ${JSON.stringify(env.widgetsNow())}`);
});

// ---- samma hal i tva andra grenar ------------------------------------------------------------------
// Grenarna skiljer sig i vad de gor med SERVERN. Ingen av dem gor nagot med SESSIONEN, och det ar
// det som avgor om anvandaren kan andra nagot.
test('en layout anvandaren sjalv tomt gar att bygga upp igen i samma session', async () => {
  // Ko + push skriver till servern. Utan projektion blir sessionen aldrig skrivbar, och den som
  // precis rensat sin layout kan inte lagga tillbaka en enda widget forran hen laddar om.
  const env = await boota(makeEnv({ local: { widgets: [] }, lastLocalMatchar: false }));

  assert.equal(env.laget(), 'studio-committed',
    `laget blev "${env.laget()}" — anvandaren kan da inte lagga till nagot efter att ha rensat`);
  assert.deepEqual(env.widgetsNow(), [],
    'tomningen ska sta kvar — molnets widgets far inte smyga tillbaka har');
});

test('"behall den har datorn" i konfliktdialogen lamnar en skrivbar session', async () => {
  const env = await boota(makeEnv({ local: { widgets: MINA }, metaVersion: 1, serverVersion: 9,
    lastLocalMatchar: false, riktigDom: true }));

  const knapp = env.sandbox.document.querySelector('.cs-conflict [data-cs-local]');
  assert.ok(knapp, 'konfliktdialogen ritades aldrig — testet mater ingenting');
  await knapp.onclick();
  await settle();

  assert.equal(env.laget(), 'studio-committed',
    `laget blev "${env.laget()}" — anvandaren behaller sin layout men kan inte andra den`);
  assert.deepEqual(env.widgetsNow(), ['w-mina-1', 'w-mina-2'],
    'den lokala layouten skulle behallas');
});

// ---- det som MASTE fortsatta fungera ---------------------------------------------------------------
// Gren 6 ar den enda som ska andras. Bevisas genom att varje annan gren fortfarande valjs och gor
// samma sak — annars kan fixen ha flyttat granserna mellan dem utan att nagot sager till.
test('en genuint ny enhet hamtar fortfarande molnets layout', async () => {
  const env = await boota(makeEnv({ local: null, meta: false }));

  assert.deepEqual(env.widgetsNow(), ['w-server-1'], 'en ny dator ska hamta molnets layout');
  assert.equal(env.laget(), 'studio-committed');
});

test('ar molnet nyare an lokalt hamtas molnets layout, inte den lokala', async () => {
  const env = await boota(makeEnv({ local: { widgets: MINA }, metaVersion: 1, serverVersion: 9 }));

  assert.deepEqual(env.widgetsNow(), ['w-server-1'],
    'en nyare molnversion ska vinna — den grenen far inte tappas nar gren 6 borjar projicera');
});

test('osynkat lokalt arbete mot en nyare molnversion ger fortfarande konflikt, inte ett tyst val',
  async () => {
    const env = await boota(makeEnv({ local: { widgets: MINA }, metaVersion: 1, serverVersion: 9,
      lastLocalMatchar: false }));

    assert.deepEqual(env.widgetsNow(), ['w-mina-1', 'w-mina-2'],
      'det osynkade lokala arbetet skrevs over utan att anvandaren tillfragades');
    assert.equal(env.projections.length, 0,
      'konfliktdialogen ska avgora vilken layout som vinner — inte boot');
  });
