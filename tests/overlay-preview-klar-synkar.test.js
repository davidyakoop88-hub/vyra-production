'use strict';
// Anpassa -> "Klar · lägg till i Layout" ska nå molnet INNAN sidan byts till layout.html.
//
// UPPMÄTT I EDGE 2026-10-18: Guardian Grön aura lades in och nådde aldrig overlayn i TikTok LIVE
// Studio. closeConfigureModal(true) körde save() och satte location.href direkt, utan att vänta.
// Sidbytet river cloud-syncs ticker (1 s) och debounce (1,8 s), så ändringen hann aldrig upp:
// förlorad i 2 av 8 körningar, och i 2 av 3 när en annan PUT redan var på väg. Med väntan på
// save() + push() (och nytt försök medan push svarar 'busy') gav samma rigg 7 av 7.
//
// Provet kör den riktiga closeConfigureModal ur overlay-preview.js mot den riktiga cloud-sync.js
// och en server med versionskontroll, och läser av molnet I DET ÖGONBLICK sidan byts.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CS = fs.readFileSync(path.join(ROOT, 'cloud-sync.js'), 'utf8');
const OP = fs.readFileSync(path.join(ROOT, 'overlay-preview.js'), 'utf8');
const WS = 'ws_test', OVERLAY = 'ov_test';
const settle = () => new Promise(r => setImmediate(r));
const vanta = ms => new Promise(r => setTimeout(r, ms));

// closeConfigureModal och det den anropar, utan resten av filen (som kräver hela studion).
function stycke() {
  const slut = OP.indexOf('function renderConfigureModal');
  const hjalp = OP.indexOf('const OWG_SYNK_TAK_MS');
  const start = hjalp >= 0 && hjalp < slut ? hjalp : OP.indexOf('function closeConfigureModal');
  assert.ok(start >= 0 && slut > start, 'hittar inte closeConfigureModal i overlay-preview.js');
  return OP.slice(start, slut);
}

function rigg() {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i],
    get length() { return store.size }
  };
  const srv = { version: 1, state: { widgets: [{ id: 'a' }] }, putar: [], hall: null };
  srv.api = async (p, o = {}) => {
    if (o.method === 'PUT') {
      const k = JSON.parse(o.body);
      if (srv.hall) { const h = srv.hall; srv.hall = null; await new Promise(r => { h.slapp = r }) }
      if (k.version !== srv.version) throw Object.assign(new Error('Versionskonflikt'), { status: 409 });
      srv.version += 1; srv.state = k.state; srv.putar.push(k.state);
      return { overlay: { id: OVERLAY, name: 'x', version: srv.version, state: srv.state } };
    }
    if (/\/overlays\/[^/]+$/.test(p)) return { overlay: { id: OVERLAY, name: 'x', version: srv.version, state: srv.state } };
    return { overlays: [{ id: OVERLAY, name: 'x', version: srv.version }] };
  };

  // cloud-sync: timrar fångas, så att bara Klar-flödet självt kan få upp ändringen.
  const csTimrar = [];
  const sessionState = {
    canPush: () => true, canQueue: () => true,
    beginProjection: () => ({ projectionId: 'p1' }),
    projectActive: async (t, o) => { localStorage.setItem('vyra-state', JSON.stringify(o.state)); return { ok: true } },
    projectLocalSession: async () => ({ ok: true }),
    // writeActive är asynkron i verkligheten (lås + markör); save() returnerar dess promise.
    writeActive: (k, v) => new Promise(r => setTimeout(() => { localStorage.setItem(k, v); r({ ok: true }) }, 30))
  };
  const dok = { querySelectorAll: () => [], querySelector: () => null,
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, append() {}, remove() {},
      querySelector: () => ({}), querySelectorAll: () => [] }),
    body: { append() {} }, addEventListener() {} };
  const csBox = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Map, Set, Boolean, Error, Promise, Date, isNaN,
    setTimeout: fn => { csTimrar.push(fn); return csTimrar.length }, clearTimeout: () => {},
    setInterval: () => 0, clearInterval: () => {},
    localStorage, location: { search: '' }, document: dok, addEventListener: () => {},
    VyraAuth: { api: (p, o) => srv.api(p, o) }, VyraSessionState: sessionState
  };
  csBox.window = csBox; csBox.globalThis = csBox;
  vm.runInNewContext(CS, csBox, { filename: 'cloud-sync.js' });

  // overlay-preview: riktiga timrar (väntan, omförsök och taket är verkliga).
  const nav = { href: null, at: null, putarVid: null };
  const opBox = {
    console, Promise, Date, JSON, Array, Object, setTimeout, clearTimeout,
    state: JSON.parse(localStorage.getItem('vyra-state') || '{"widgets":[{"id":"a"}]}'),
    document: dok, render() {},
    VyraCloudSync: csBox.VyraCloudSync, VyraSessionState: sessionState,
    location: {
      get href() { return nav.href },
      set href(v) { nav.href = v; nav.at = Date.now(); nav.putarVid = srv.putar.map(s => s.widgets.map(w => w.id).join(',')) }
    }
  };
  opBox.window = opBox; opBox.globalThis = opBox;
  opBox.save = () => opBox.VyraSessionState.writeActive('vyra-state', JSON.stringify(opBox.state));
  vm.runInNewContext(`let owgConfigureWidgetId = null, owgConfigureIsNew = false, selected = null;\n${stycke()}\n`
    + 'globalThis.__oppna = (id, ny) => { owgConfigureWidgetId = id; owgConfigureIsNew = ny };'
    + 'globalThis.__klar = () => closeConfigureModal(true);', opBox, { filename: 'overlay-preview.js' });

  return {
    srv, nav, opBox, localStorage, cs: csBox.VyraCloudSync,
    boota: async () => {
      localStorage.setItem('vyra-state', JSON.stringify({ widgets: [{ id: 'a' }] }));
      await csBox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] }); await settle();
      opBox.state = JSON.parse(localStorage.getItem('vyra-state'));
      srv.putar.length = 0;
    },
    // Anpassa: widgeten läggs in i state och modalen öppnas för den.
    anpassa: id => { opBox.state.widgets.push({ id, type: 'guardianEmblem' }); opBox.__oppna(id, true) },
    klar: () => opBox.__klar(),
    vantaPaNavigering: async (tak = 6000) => { const t0 = Date.now(); while (!nav.href && Date.now() - t0 < tak) await vanta(10) },
  };
}

test('(c) Klar 100 ms efter Anpassa: ändringen är i molnet innan sidan byts', async () => {
  const r = rigg();
  await r.boota();
  r.anpassa('aura');
  await vanta(100);
  r.klar();
  await r.vantaPaNavigering();

  assert.equal(r.nav.href, 'layout.html');
  assert.deepEqual(r.nav.putarVid, ['a,aura'],
    'sidan byttes innan Klar-ändringen nått molnet — nästa sida ser den som redan synkad');
});

test('(c) Klar medan en annan PUT är på väg: väntar ut den och skickar sedan sin egen', async () => {
  const r = rigg();
  await r.boota();
  // En tidigare ändring är på väg upp och hänger i luften.
  r.localStorage.setItem('vyra-state', JSON.stringify({ widgets: [{ id: 'a' }, { id: 'b' }] }));
  r.opBox.state = { widgets: [{ id: 'a' }, { id: 'b' }] };
  const hall = {}; r.srv.hall = hall;
  const forsta = r.cs.push();
  await settle();
  assert.equal(r.cs.status(), 'saving');

  r.anpassa('aura');
  r.klar();
  await vanta(300);
  assert.equal(r.nav.href, null, 'sidan byttes medan en PUT fortfarande var på väg');
  hall.slapp();
  await forsta;
  await r.vantaPaNavigering();

  assert.equal(r.nav.href, 'layout.html');
  assert.deepEqual(r.nav.putarVid, ['a,b', 'a,b,aura'], 'Klar-ändringen svaldes av den pågående PUT:en');
});

test('(c) ett hängande nätverk låser inte kvar användaren: sidan byts efter taket', async () => {
  const r = rigg();
  await r.boota();
  r.srv.hall = {};                             // nästa PUT svarar aldrig
  r.anpassa('aura');
  const t0 = Date.now();
  r.klar();
  await r.vantaPaNavigering(8000);
  const tid = Date.now() - t0;
  assert.equal(r.nav.href, 'layout.html');
  assert.ok(tid >= 3900 && tid < 5500, `sidbytet kom efter ${tid} ms, väntat ~4000`);
});
