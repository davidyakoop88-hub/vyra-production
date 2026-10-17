'use strict';
// EFTER FÖRSTA OVERLAYN SPARADES INGENTING — RÖTT FÖRST (2026-10-11, andra halvan av #589).
//
// UPPMÄTT I PRODUKTION, kontot jrofficialswe, 16:03–16:30: overlayn skapades (201), kunden lade
// till widgets i Layout och raden sade "Sparat i molnet ✓" — men molnet låg kvar på version 1 med
// noll widgets och Api-loggen har inte en enda PUT. TikTok Studio visade en tom ruta.
//
// ORSAKEN: cloud-sync.js initialize():
//
//     if(!items.length){await create();if(mine!==session)return;setStatus('synced');startTicker();return}
//
// Vägen med en BEFINTLIG overlay går via apply(), som projicerar sessionen med mode
// 'studio-committed' (VyraSessionState.projectActive). Det är projektionen som commitar identiteten,
// och canPush()/canQueue() är sanna bara när den är committad. Vägen som SKAPAR overlayn projicerar
// aldrig: canPush() förblir falsk, push() svarar {ok:false,reason:'busy'} i tysthet, tickern köar
// aldrig (canQueue() falsk), och statusen står kvar på det 'synced' som sattes efter create().
// Raden ljuger. Nästa sidladdning tar den andra vägen (overlayn finns nu) och allt fungerar — det
// är därför felet bara drabbar den allra första sessionen för ett nytt konto.
//
// Provet kör den riktiga cloud-sync.js mot en VyraSessionState som gör som den riktiga: identiteten
// commitas av projectActive, och canPush/canQueue följer den.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'cloud-sync.js'), 'utf8');
const WS = 'ws_ny';

function makeEnv() {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i],
    get length() { return store.size }
  };
  const posts = [], puts = [], projektioner = [];
  let skapad = null, committed = null;
  const api = async (p, options = {}) => {
    if (options.method === 'POST' && /\/overlays$/.test(p)) {
      const body = JSON.parse(options.body); posts.push(body);
      skapad = { id: 'ov_ny', name: body.name, version: 1, state: body.state, updated_at: 'nu' };
      return { overlay: skapad };
    }
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body); puts.push(body);
      skapad = { ...skapad, version: skapad.version + 1, state: body.state };
      return { overlay: skapad };
    }
    if (/\/overlays\/[^/]+$/.test(p)) return { overlay: skapad };
    return { overlays: skapad ? [{ id: skapad.id, name: skapad.name, version: skapad.version }] : [] };
  };
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, append() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [], set innerHTML(v) {}, dataset: {} });
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Map, Set, Boolean, Error, Promise, Date, isNaN,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    localStorage, location: { search: '' },
    document: { querySelectorAll: () => [], querySelector: () => null, createElement: el, body: { append() {} } },
    addEventListener: () => {},
    VyraAuth: { api },
    VyraSessionState: {
      // SOM DEN RIKTIGA: bara en lyckad projektion commitar, och push/queue kräver committad identitet.
      canPush: () => !!committed, canQueue: () => !!committed,
      beginProjection: () => ({ projectionId: 'p' + (projektioner.length + 1) }),
      projectActive: async (token, opts) => {
        projektioner.push({ mode: opts.mode, overlayId: opts.overlayId, widgets: (opts.state && opts.state.widgets || []).length });
        localStorage.setItem('vyra-state', JSON.stringify(opts.state));
        committed = { mode: opts.mode, overlayId: opts.overlayId };
        return { ok: true };
      },
      projectLocalSession: async () => ({ ok: true }),
    },
    render() {},
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.root = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: 'cloud-sync.js' });
  return { sandbox, localStorage, posts, puts, projektioner, committed: () => committed };
}
const settle = () => new Promise(r => setImmediate(r));

test('första overlayn: sessionen commitas så att sparningar kan skickas', async () => {
  const env = makeEnv();
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle(); await settle();
  assert.equal(env.posts.length, 1, 'overlayn skapades inte');
  assert.ok(env.committed(), 'identiteten commitades aldrig efter create() — canPush() är falsk och ingen sparning når molnet');
  assert.equal(env.committed().mode, 'studio-committed');
  assert.equal(env.committed().overlayId, 'ov_ny');
  assert.equal(env.sandbox.VyraSessionState.canPush(), true);
});

test('en widget som läggs till efter första overlayn når molnet', async () => {
  const env = makeEnv();
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle(); await settle();
  // Kunden lägger till en widget: studio.js save() skriver vyra-state, och cloud-sync pushar.
  env.localStorage.setItem('vyra-state', JSON.stringify({ widgets: [{ id: 'w-topgift', type: 'templateTopGift' }] }));
  const ut = await env.sandbox.VyraCloudSync.push();
  assert.equal(ut.ok, true, `push svarade ${JSON.stringify(ut)} — det var exakt det tysta "busy" som gömde felet`);
  assert.equal(env.puts.length, 1, 'ingen PUT nådde molnet');
  assert.deepEqual(env.puts[0].state.widgets.map(w => w.id), ['w-topgift']);
});

test('befintlig overlay: oförändrat — projektionen commitar som förut', async () => {
  const env = makeEnv();
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });   // skapar
  await settle(); await settle();
  const env2 = makeEnv();
  // Andra sessionen mot ett moln där overlayn redan finns.
  env2.sandbox.VyraAuth.api = env.sandbox.VyraAuth.api;
  await env2.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle(); await settle();
  assert.ok(env2.committed(), 'befintlig-overlay-vägen ska också commita');
});

test('cachebusten höjdes med filen', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'studio.html'), 'utf8'), /cloud-sync\.js\?v=20261017-epost/);
});
