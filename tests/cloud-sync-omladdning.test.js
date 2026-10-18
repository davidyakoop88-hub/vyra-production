'use strict';
// En ändring som följs av en omladdning eller ett sidbyte inom någon sekund får inte försvinna.
//
// UPPMÄTT I EDGE 2026-10-18 mot en versionerad mock-backend: Guardian Grön aura lades in via
// Anpassa -> "Klar · lägg till i Layout", och ändringen nådde aldrig molnet eller overlayn i TikTok
// LIVE Studio. Förlorad i 2 av 8 körningar när Klar trycktes 100–900 ms efter Anpassa, och i 2 av 3
// när en annan PUT redan var på väg. Statusraden sade ändå 'synced'.
//
// GRUNDFELET satt i initialize(): tickern (1 s) och debouncen (1,8 s) dör med sidan, så en ändring
// som ännu inte skickats ligger bara kvar i vyra-state. Nästa sida gick till sista else-grenen,
// körde apply(local) — som flyttar fram lastLocal — och saveMeta(). Därmed blev den OSKICKADE
// staten meta.lastLocal, alltså "det servern senast bekräftat", och den var stämplad som synkad
// för gott. Ingen tick hittade den igen.
//
// Proven kör den riktiga cloud-sync.js två gånger mot SAMMA localStorage och SAMMA server — det
// är vad en omladdning är.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'cloud-sync.js'), 'utf8');
const WS = 'ws_test', OVERLAY = 'ov_test';
const layout = (...ids) => ({ widgets: ids.map(id => ({ id, type: 'templateTopLike' })) });
const settle = () => new Promise(r => setImmediate(r));

function skapaServer(startState) {
  const srv = { version: 1, state: startState, putar: [], hall: null };
  srv.api = async (p, options = {}) => {
    if (options.method === 'PUT') {
      const kropp = JSON.parse(options.body);
      if (srv.hall) { const h = srv.hall; srv.hall = null; await new Promise(r => { h.slapp = r }) }
      // Samma optimistiska versionskontroll som servern: fel version -> 409.
      if (kropp.version !== srv.version) throw Object.assign(new Error('Versionskonflikt'), { status: 409 });
      srv.version += 1; srv.state = kropp.state; srv.putar.push(kropp.state);
      return { overlay: { id: OVERLAY, name: 'x', version: srv.version, state: srv.state } };
    }
    if (/\/overlays\/[^/]+$/.test(p)) return { overlay: { id: OVERLAY, name: 'x', version: srv.version, state: srv.state } };
    return { overlays: [{ id: OVERLAY, name: 'x', version: srv.version }] };
  };
  srv.hallNasta = () => { const h = {}; srv.hall = h; return h };
  return srv;
}

function skapaStore() {
  const store = new Map();
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i],
    get length() { return store.size }
  };
}

// En "sida": cloud-sync.js laddad i en egen kontext. Timrar fångas i stället för att köras, så att
// en omladdning kan simuleras exakt där den gör ont — innan tickern eller debouncen hunnit gå.
function laddaSida(localStorage, srv) {
  const schemalagda = [], tickare = [];
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Map, Set, Boolean, Error, Promise, Date, isNaN,
    setTimeout: fn => { schemalagda.push(fn); return schemalagda.length },
    clearTimeout: () => {},
    setInterval: fn => { tickare.push(fn); return tickare.length },
    clearInterval: () => {},
    localStorage,
    location: { search: '' },
    document: { querySelectorAll: () => [], querySelector: () => null,
      // Konfliktbanderollen hämtar sina knappar med querySelector — de måste finnas.
      createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, append() {}, remove() {},
        querySelector: () => ({}), querySelectorAll: () => [] }),
      body: { append() {} }, addEventListener() {} },
    addEventListener: () => {},
    VyraAuth: { api: (p, o) => srv.api(p, o) },
    VyraSessionState: {
      canPush: () => true, canQueue: () => true,
      beginProjection: () => ({ projectionId: 'p1' }),
      mode: () => 'studio-committed',
      projectActive: async (token, opts) => { localStorage.setItem('vyra-state', JSON.stringify(opts.state)); return { ok: true } },
      projectLocalSession: async () => ({ ok: true })
    }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: 'cloud-sync.js' });
  schemalagda.length = 0;                     // uppstartens auth-fallbacks räknas inte
  const cs = sandbox.VyraCloudSync;
  return {
    cs, schemalagda, tickare,
    boota: async () => { await cs.initialize({ workspaces: [{ id: WS }] }); await settle() },
    tick: () => tickare.forEach(fn => fn()),
    korSchemalagda: async () => { const k = schemalagda.splice(0); for (const fn of k) await fn() },
  };
}

// Utgångsläge: en enhet som är i fas med molnet (version 1, en widget).
async function iFas() {
  const ls = skapaStore(), srv = skapaServer(layout('a'));
  const sida = laddaSida(ls, srv);
  await sida.boota();
  assert.equal(sida.cs.status(), 'synced');
  srv.putar.length = 0;
  return { ls, srv, sida };
}
const redigera = (ls, ...ids) => ls.setItem('vyra-state', JSON.stringify(layout(...ids)));
const meta = ls => JSON.parse(ls.getItem(`vyra-cloud-sync-meta:${WS}`));
const ids = state => state.widgets.map(w => w.id).join(',');

// ---- (a) ändring + omladdning inom 1 s ----------------------------------------------------------

test('en ändring följd av omladdning innan tickern gått skickas ändå till molnet', async () => {
  const { ls, srv } = await iFas();
  redigera(ls, 'a', 'aura');                  // save() skriver localStorage — sedan laddas sidan om

  const ny = laddaSida(ls, srv);
  const hall = srv.hallNasta();               // PUT:en hålls i luften så att statusen kan läsas
  const boot = ny.boota();
  await settle(); await settle();
  assert.notEqual(ny.cs.status(), 'synced',
    'statusen sade "synced" innan ändringen lämnat maskinen — det är exakt vad användaren litade på');
  assert.equal(srv.putar.length, 0);
  assert.equal(typeof hall.slapp, 'function',
    'ingen PUT startades för den osynkade ändringen — den stämplades som synkad vid uppstarten');
  hall.slapp();
  await boot; await settle();

  assert.equal(srv.putar.length, 1, 'ändringen nådde aldrig molnet');
  assert.equal(ids(srv.putar[0]), 'a,aura');
  assert.equal(ny.cs.status(), 'synced');
  assert.equal(meta(ls).lastLocal, ls.getItem('vyra-state'));
  assert.equal(meta(ls).version, srv.version);
});

test('även om PUT:en misslyckas stämplas ändringen inte som synkad — nästa sida försöker igen', async () => {
  const { ls, srv } = await iFas();
  redigera(ls, 'a', 'aura');
  const bekraftad = meta(ls).lastLocal;

  const riktig = srv.api;
  srv.api = async (p, o = {}) => { if (o.method === 'PUT') throw Object.assign(new Error('nere'), { status: 0 }); return riktig(p, o) };
  const ny = laddaSida(ls, srv);
  await ny.boota();
  assert.equal(ny.cs.status(), 'offline');
  assert.equal(meta(ls).lastLocal, bekraftad, 'meta.lastLocal flyttades fram utan att servern bekräftat något');

  srv.api = riktig;
  const tredje = laddaSida(ls, srv);
  await tredje.boota();
  assert.equal(srv.putar.length, 1);
  assert.equal(ids(srv.putar[0]), 'a,aura');
});

test('en oförändrad layout skickar ingenting vid omladdning', async () => {
  const { ls, srv } = await iFas();
  const ny = laddaSida(ls, srv);
  await ny.boota();
  assert.equal(srv.putar.length, 0);
  assert.equal(ny.schemalagda.length, 0);
  assert.equal(ny.cs.status(), 'synced');
});

// ---- (b) ny sparning under en pågående PUT ------------------------------------------------------

test('en sparning under en pågående PUT går inte förlorad, inte ens om sidan laddas om direkt efter', async () => {
  const { ls, srv, sida } = await iFas();
  redigera(ls, 'a', 'b');
  sida.tick();
  const hall = srv.hallNasta();
  const pushen = sida.korSchemalagda();
  await settle();
  redigera(ls, 'a', 'b', 'aura');             // "Klar" mitt i nätverksrundan
  hall.slapp();
  await pushen; await settle();

  assert.equal(srv.putar.length, 1);
  assert.equal(ids(srv.putar[0]), 'a,b');
  assert.ok(JSON.parse(ls.getItem(`vyra-cloud-sync-queue:${WS}`)),
    'den nya sparningen lades inte i kön när PUT:en kom tillbaka');

  // Sidbyte innan debouncen hunnit gå.
  const ny = laddaSida(ls, srv);
  await ny.boota();
  assert.equal(srv.putar.length, 2, 'sparningen under PUT:en nådde aldrig molnet');
  assert.equal(ids(srv.putar[1]), 'a,b,aura');
  assert.equal(ny.cs.status(), 'synced');
  assert.equal(ls.getItem(`vyra-cloud-sync-queue:${WS}`), null);
});

// ---- (d) konflikt: en nyare molnversion skrivs inte över ----------------------------------------

test('en gammal osynkad lokal ändring skriver inte över en nyare molnversion', async () => {
  const { ls, srv } = await iFas();
  redigera(ls, 'a', 'lokal');
  // En annan dator sparade emellan.
  srv.version = 5; srv.state = layout('a', 'annan', 'dator');

  const ny = laddaSida(ls, srv);
  await ny.boota();
  assert.equal(srv.putar.length, 0, 'den lokala ändringen skrevs över molnets nyare version');
  assert.equal(ids(srv.state), 'a,annan,dator');
  assert.equal(ny.cs.status(), 'conflict');
  assert.equal(ids(JSON.parse(ls.getItem('vyra-state'))), 'a,lokal', 'den lokala ändringen kastades utan att någon valt');
});

test('versionskontrollen stoppar den osynkade ändringen om molnet hinner ändras under uppstarten', async () => {
  const { ls, srv } = await iFas();
  redigera(ls, 'a', 'lokal');
  const riktig = srv.api;
  // Någon annan skriver mellan GET och PUT.
  srv.api = async (p, o = {}) => { if (o.method === 'PUT' && srv.version === 1) { srv.version = 2; srv.state = layout('annan') } return riktig(p, o) };
  const ny = laddaSida(ls, srv);
  await ny.boota();
  assert.equal(srv.putar.length, 0);
  assert.equal(ids(srv.state), 'annan');
  assert.equal(ny.cs.status(), 'conflict');
  assert.ok(JSON.parse(ls.getItem(`vyra-cloud-sync-queue:${WS}`)), 'ändringen låg inte kvar i kön efter 409');
});
