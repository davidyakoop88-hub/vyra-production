'use strict';
// REDIGERAREN FOLJER MOLNET (Davids beslut 2026-10-10: "layout i webben och appen ska synkas
// tillsammans sa att man inte ska valja").
//
// Appen och webben delar redan molnets layout (appens lokala server proxar layoutanropen med den
// bryggade sessionen). Men tva OPPNA redigerare foljde inte varandra: den som sparade sist vann
// versionen, och den andra fick 409 pa sin nasta sparning och dialogen "valj version" — fast den
// inte hade nagot eget att valja. Uppmatt: webbens Studio oppen dygnet runt, appen under
// sandningen.
//
// Foljaren (cloud-sync.js foljMolnet) fragar molnet efter overlayens version och:
//   · hamtar och projicerar molnets layout TYST nar den har enheten inte har osparat arbete
//   · visar konflikten nar enheten HAR osparat arbete — aldrig en tyst overskrivning
//   · gor ingenting nar versionerna ar lika
//
// Proven kor den riktiga cloud-sync.js i samma rigg som cloud-sync-steady-state.test.js, med en
// server vars version gar att flytta mellan anropen. Timern ar stubbad (setInterval: () => 0), sa
// foljaren anropas direkt via VyraCloudSync.foljMolnet — det ar funktionen som provas, inte
// klockan.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'cloud-sync.js'), 'utf8');

const WS = 'ws_folj', OVERLAY = 'ov_folj';
const MINA = [{ id: 'w-mina-1', type: 'templateHeartGoal' }, { id: 'w-mina-2', type: 'templateTopGift' }];
const ANDRA_ENHETENS = [{ id: 'w-andra-1', type: 'templateLikeFountain' }];

function makeEnv({ local = MINA, version = 7 } = {}) {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i],
    get length() { return store.size }
  };
  const serialisedLocal = JSON.stringify({ widgets: local });
  localStorage.setItem('vyra-state', serialisedLocal);
  localStorage.setItem(`vyra-cloud-sync-meta:${WS}`, JSON.stringify({
    workspaceId: WS, overlayId: OVERLAY, version, updatedAt: '', lastLocal: serialisedLocal }));

  // Servern ar MUTERBAR: provet flyttar fram versionen mellan anropen, som en annan enhet gor.
  const server = { version, widgets: local, anrop: [] };
  const api = async (p, options = {}) => {
    server.anrop.push((options.method || 'GET') + ' ' + p);
    if (options.method === 'PUT') {
      server.version += 1; server.widgets = JSON.parse(options.body).state.widgets;
      return { overlay: { id: OVERLAY, name: 'x', version: server.version, state: { widgets: server.widgets } } };
    }
    if (/\/overlays\/[^/]+$/.test(p))
      return { overlay: { id: OVERLAY, name: 'x', version: server.version, state: { widgets: server.widgets } } };
    return { overlays: [{ id: OVERLAY, name: 'x', version: server.version }] };
  };

  const projections = [];
  const toasts = [];
  const dom = new JSDOM('<!doctype html><body></body>').window.document;
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Map, Set, Boolean, Error, Promise, Date, isNaN,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    localStorage, location: { search: '' }, document: dom, addEventListener: () => {},
    toast: t => toasts.push(t),
    VyraAuth: { api },
    VyraSessionState: {
      canPush: () => true, canQueue: () => true,
      beginProjection: () => ({ projectionId: 'p1' }),
      projectActive: async (token, opts) => {
        projections.push({ reason: opts.reason, widgets: (opts.state && opts.state.widgets || []).map(w => w.id) });
        localStorage.setItem('vyra-state', JSON.stringify(opts.state));
        return { ok: true };
      },
      projectLocalSession: async () => ({ ok: true })
    }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.root = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: 'cloud-sync.js' });
  return { sandbox, localStorage, server, projections, toasts, dom,
    widgetsNow: () => (JSON.parse(localStorage.getItem('vyra-state') || '{}').widgets || []).map(w => w.id),
    metaVersion: () => JSON.parse(localStorage.getItem(`vyra-cloud-sync-meta:${WS}`)).version };
}

const settle = () => new Promise(r => setImmediate(r));
async function boota(env) {
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();
  assert.equal(env.sandbox.VyraCloudSync.status(), 'synced', 'riggen: boot ska landa i synced');
  return env;
}

test('en nyare molnversion utan lokala andringar hamtas och projiceras tyst', async () => {
  const env = await boota(makeEnv());
  const fore = env.projections.length;
  // En annan enhet sparar.
  env.server.version = 8; env.server.widgets = ANDRA_ENHETENS;
  const r = await env.sandbox.VyraCloudSync.foljMolnet();
  await settle();
  assert.equal(r.reason, 'hamtad', `foljaren hamtade inte: ${JSON.stringify(r)}`);
  assert.deepEqual(env.widgetsNow(), ['w-andra-1'], 'molnets layout projicerades inte');
  assert.equal(env.projections.length, fore + 1, 'exakt en projektion');
  assert.equal(env.metaVersion(), 8, 'meta.version foljde inte med — nasta boot hade sett en konflikt');
  assert.equal(env.sandbox.VyraCloudSync.status(), 'synced');
  assert.equal(env.dom.querySelector('.cs-conflict'), null, 'ingen konfliktbanderoll nar inget lokalt star pa spel');
  assert.ok(env.toasts.some(t => /annan enhet/.test(t)), 'anvandaren ska fa veta att layouten byttes');
});

// Tickern skickar allt dar vyra-state skiljer sig fran lastLocal. Hamtar foljaren molnets layout
// utan att flytta lastLocal ser tickern den som en LOKAL andring och skickar molnets egen layout
// tillbaka till molnet. lastLocal persisteras i metan (saveMeta), sa det gar att mata.
test('den hamtade layouten raknas som synkad, inte som en lokal andring', async () => {
  const env = await boota(makeEnv());
  env.server.version = 8; env.server.widgets = ANDRA_ENHETENS;
  await env.sandbox.VyraCloudSync.foljMolnet();
  await settle();
  const meta = JSON.parse(env.localStorage.getItem(`vyra-cloud-sync-meta:${WS}`));
  assert.equal(meta.lastLocal, env.localStorage.getItem('vyra-state'),
    'lastLocal foljde inte med — tickern hade skickat molnets layout tillbaka till molnet');
});

test('Online-knappen i konfliktbanderollen raknar ocksa den hamtade layouten som synkad', async () => {
  const env = await boota(makeEnv());
  env.localStorage.setItem('vyra-state', JSON.stringify({ widgets: [...MINA, { id: 'w-ny', type: 'templateTopLike' }] }));
  env.server.version = 8; env.server.widgets = ANDRA_ENHETENS;
  await env.sandbox.VyraCloudSync.foljMolnet();
  const knapp = env.dom.querySelector('[data-cs-online]');
  assert.ok(knapp, 'riggen: banderollen med Online-knappen ska finnas');
  await knapp.onclick();
  await settle();
  assert.deepEqual(env.widgetsNow(), ['w-andra-1'], 'Online projicerade inte molnets layout');
  const meta = JSON.parse(env.localStorage.getItem(`vyra-cloud-sync-meta:${WS}`));
  assert.equal(meta.lastLocal, env.localStorage.getItem('vyra-state'),
    'efter Online skickade tickern molnets layout tillbaka (uppmatt 2026-10-10: PUT 200 sju sekunder efter klicket)');
  assert.equal(env.dom.querySelector('.cs-conflict'), null, 'banderollen ska bort nar valet ar gjort');
});

test('med osparade lokala andringar ersatts ingenting — konflikten visas i stallet', async () => {
  const env = await boota(makeEnv());
  // Anvandaren flyttar en widget: vyra-state skiljer sig fran det senast synkade.
  env.localStorage.setItem('vyra-state', JSON.stringify({ widgets: [...MINA, { id: 'w-ny', type: 'templateTopLike' }] }));
  env.server.version = 8; env.server.widgets = ANDRA_ENHETENS;
  const fore = env.projections.length;
  const r = await env.sandbox.VyraCloudSync.foljMolnet();
  await settle();
  assert.equal(r.reason, 'konflikt', JSON.stringify(r));
  assert.equal(env.projections.length, fore, 'lokalt arbete skrevs over tyst');
  assert.deepEqual(env.widgetsNow(), ['w-mina-1', 'w-mina-2', 'w-ny']);
  assert.equal(env.sandbox.VyraCloudSync.status(), 'conflict');
  assert.ok(env.dom.querySelector('.cs-conflict'), 'konfliktbanderollen ska visas sa anvandaren kan valja');
});

test('lika version: ingenting hamtas och ingenting projiceras', async () => {
  const env = await boota(makeEnv());
  const fore = env.projections.length, anrop = env.server.anrop.length;
  const r = await env.sandbox.VyraCloudSync.foljMolnet();
  assert.equal(r.reason, 'lika');
  assert.equal(env.projections.length, fore);
  assert.equal(env.server.anrop.length, anrop + 1, 'bara listan fragas, aldrig hela overlayen');
});

test('foljaren ar tyst fore initialize och medan konfliktbanderollen visas', async () => {
  const env = makeEnv();
  assert.equal((await env.sandbox.VyraCloudSync.foljMolnet()).reason, 'upptagen', 'fore initialize');
  await boota(env);
  env.localStorage.setItem('vyra-state', JSON.stringify({ widgets: [...MINA, { id: 'w-ny', type: 'templateTopLike' }] }));
  env.server.version = 8; env.server.widgets = ANDRA_ENHETENS;
  assert.equal((await env.sandbox.VyraCloudSync.foljMolnet()).reason, 'konflikt');
  // Banderollen star kvar: foljaren far inte tjata, och far framfor allt inte hamta bakom den.
  const fore = env.projections.length;
  assert.equal((await env.sandbox.VyraCloudSync.foljMolnet()).reason, 'konflikt-visas');
  assert.equal(env.projections.length, fore);
});
