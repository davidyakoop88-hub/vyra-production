'use strict';
// F03 (granskningen 2026-10-18, P1): "Molnsynk och session kan skilja editor från utsändning".
//
// Observerat: raden sade först "Sparat i molnet", sedan "Ingen kontakt med molnet" och till sist
// "Synkkonflikt". Editorn visade X=100 medan serverutgången — den OBS läser — stod kvar på X=20.
// Först efter ny inloggning, återställning och konfliktval syntes X=100 i utgången. Konflikten
// uppstod med en ENDA Studio-flik.
//
// Proven kör den riktiga cloud-sync.js (och auth-client.js för CSRF-delen) mot en versionerad
// mockserver med samma optimistiska versionskontroll som server/index.js. Ingen riktig server,
// inga konton.
//
//   A. Indikatorn skiljer lokalt från serverbekräftat, och markerar en osynkad ändring direkt.
//   B. En utgången session ger "Logga in igen" — inte "Ingen kontakt" — och ändringen skickas
//      efter inloggningen. En bortroterad CSRF-token (sessionen lever) botas tyst.
//   C. Konflikten med en ensam flik: egna skrivningar vars svar aldrig kom fram, och följaren som
//      läste listan medan en egen PUT var ute. Båda gav banderollen "ändrades på en annan dator".
//   D. En återlämnad (parkerad) layout stämplades som synkad utan att skickas.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'cloud-sync.js'), 'utf8');
const AUTH = fs.readFileSync(path.join(ROOT, 'auth-client.js'), 'utf8');
const WS = 'ws_f03', OVERLAY = 'ov_f03';
const layout = x => ({ widgets: [{ id: 'g1', type: 'guardianEmblem', x, y: 40 }] });
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)) };

const LANKRAD = `<div class="overlay-link-bar"><div><span>OVERLAYLÄNK</span></div></div>`;

// Servern: optimistisk versionskontroll (fel version -> 409), och JSONB-lik nyckelordning i
// svaren (nycklarna sorteras — en strängjämförelse mot det skickade håller alltså aldrig).
function sortera(v) {
  if (Array.isArray(v)) return v.map(sortera);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortera(v[k])]));
  return v;
}
function skapaServer(startState) {
  const srv = { version: 1, state: startState, putar: [], anrop: [], sessionUte: false, csrfRoterad: false,
    tappaSvar: false, hall: null, hallLista: null };
  srv.overlay = () => ({ id: OVERLAY, name: 'x', version: srv.version, state: sortera(srv.state) });
  srv.api = async (p, options = {}) => {
    const metod = options.method || 'GET';
    srv.anrop.push(metod + ' ' + p);
    if (p === '/api/auth/me') {
      if (srv.sessionUte) throw Object.assign(new Error('Inte inloggad'), { status: 401 });
      srv.csrfRoterad = false;
      return { ok: true, user: { id: 'u1' }, workspaces: [{ id: WS }], csrfToken: 'ny-token' };
    }
    if (srv.sessionUte) throw Object.assign(new Error('Inte inloggad'), { status: 401 });
    if (metod === 'PUT') {
      if (srv.csrfRoterad) throw Object.assign(new Error('Inte inloggad'), { status: 401 });
      const kropp = JSON.parse(options.body);
      if (kropp.version !== srv.version) throw Object.assign(new Error('Overlayn har ändrats i en annan session'), { status: 409 });
      srv.version += 1; srv.state = kropp.state; srv.putar.push(kropp.state);
      const svar = { ok: true, overlay: srv.overlay() };
      if (srv.hall) { const h = srv.hall; srv.hall = null; await new Promise(r => { h.slapp = r }) }
      // Skrivningen är gjord på servern, men svaret når aldrig klienten.
      if (srv.tappaSvar) { srv.tappaSvar = false; throw new TypeError('Failed to fetch') }
      return svar;
    }
    if (/\/overlays\/[^/]+$/.test(p)) return { ok: true, overlay: srv.overlay() };
    if (srv.hallLista) { const h = srv.hallLista; srv.hallLista = null; await new Promise(r => { h.slapp = r }) }
    return { ok: true, overlays: [{ id: OVERLAY, name: 'x', version: srv.version }] };
  };
  srv.hallNasta = () => { const h = {}; srv.hall = h; return h };
  srv.hallNastaLista = () => { const h = {}; srv.hallLista = h; return h };
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

function laddaSida(ls, srv, { ss = {} } = {}) {
  const dom = new JSDOM(`<!doctype html><body>${LANKRAD}</body>`);
  const lyssnare = {}, schemalagda = [], gate = [], tickare = [];
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Map, Set, Boolean, Error, Promise, Date, isNaN, TypeError,
    setTimeout: fn => { schemalagda.push(fn); return schemalagda.length },
    clearTimeout: () => {}, setInterval: fn => { tickare.push(fn); return tickare.length }, clearInterval: () => {},
    localStorage: ls, location: { search: '' }, document: dom.window.document,
    addEventListener: (namn, fn) => { (lyssnare[namn] ||= []).push(fn) },
    VyraAuth: { api: (p, o) => srv.api(p, o), showGate: m => gate.push(m) },
    VyraSessionState: {
      canPush: () => true, canQueue: () => true,
      beginProjection: () => ({ projectionId: 'p1' }),
      projectActive: async (token, opts) => { ls.setItem('vyra-state', JSON.stringify(opts.state)); return { ok: true } },
      projectLocalSession: async () => ({ ok: true }),
      ...ss
    }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.root = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: 'cloud-sync.js' });
  schemalagda.length = 0;
  const cs = sandbox.VyraCloudSync, doc = dom.window.document;
  const sida = {
    cs, doc, gate, schemalagda, sandbox,
    boota: async (ws = WS) => { await cs.initialize({ workspaces: [{ id: ws }] }); await settle() },
    skicka: (namn, detail) => (lyssnare[namn] || []).forEach(fn => fn({ detail })),
    // En sparning i editorn: session-state skriver vyra-state och annonserar sedan skrivningen.
    redigera: x => { ls.setItem('vyra-state', JSON.stringify(layout(x))); sida.skicka('vyra-session-state-saved', { at: Date.now() }) },
    tick: () => tickare.forEach(fn => fn()),
    korSchemalagda: async () => { const k = schemalagda.splice(0); for (const fn of k) await fn(); await settle() },
    status: () => doc.querySelector('.cloud-status'),
    text: () => doc.querySelector('.cloud-status span').textContent,
    not: () => doc.querySelector('.cs-offline-note'),
    banderoll: () => doc.querySelector('.cs-conflict'),
  };
  return sida;
}

async function iFas(x = 20) {
  const ls = skapaStore(), srv = skapaServer(layout(x));
  ls.setItem('vyra-state', JSON.stringify(layout(x)));
  ls.setItem(`vyra-cloud-sync-meta:${WS}`, JSON.stringify({ workspaceId: WS, overlayId: OVERLAY, version: 1,
    updatedAt: '', lastLocal: JSON.stringify(layout(x)) }));
  const sida = laddaSida(ls, srv);
  await sida.boota();
  assert.equal(sida.cs.status(), 'synced', 'kontrollmätning: utgångsläget ska vara i fas');
  return { ls, srv, sida };
}
const xPaServern = srv => srv.state.widgets[0].x;

// ---- A · indikatorn ----------------------------------------------------------------------------

test('A1 · i fas: raden säger att OBS har allt och bär serverns version och bekräftelsetid', async () => {
  const { sida } = await iFas();
  const el = sida.status();
  assert.match(sida.text(), /Sparat i molnet ✓ · syns i OBS/);
  assert.equal(el.dataset.osynkade, '0');
  assert.equal(el.dataset.serverVersion, '1');
  assert.ok(Number(el.dataset.bekraftadVid) > 0, 'ingen tidpunkt för serverns bekräftelse');
  assert.match(el.title, /OBS visar serverns version \(v1\)/);
});

test('A2 · en ändring markeras DIREKT som osynkad — inte "Sparat i molnet" i väntan på tickern', async () => {
  const { sida, srv } = await iFas();
  sida.redigera(100);                         // ingen tick, ingen debounce har gått
  const el = sida.status();
  assert.doesNotMatch(sida.text(), /Sparat i molnet/,
    `raden sade "${sida.text()}" om en ändring servern aldrig sett — editorn X=100, OBS X=20`);
  assert.match(sida.text(), /1 ändring syns inte i OBS än/);
  assert.equal(el.dataset.osynkade, '1');
  assert.notEqual(el.dataset.state, 'synced');
  assert.equal(xPaServern(srv), 20, 'kontrollmätning: servern har fortfarande X=20');
});

test('A3 · klockslaget i molnläge är serverns bekräftelse, inte den lokala sparningen', async () => {
  const { sida } = await iFas();
  sida.redigera(100);
  // Granskningsbilden 17: "Ingen kontakt med molnet · sparat 17:18" — 17:18 var disken.
  assert.doesNotMatch(sida.text(), /sparat \d/, `raden blandar ihop disk och server: "${sida.text()}"`);
});

test('A4 · när servern bekräftat står raden i fas igen', async () => {
  const { sida, srv } = await iFas();
  sida.redigera(100);
  await sida.cs.push(); await settle();
  assert.equal(xPaServern(srv), 100);
  assert.match(sida.text(), /syns i OBS/);
  assert.equal(sida.status().dataset.osynkade, '0');
  assert.equal(sida.status().dataset.serverVersion, '2');
});

test('A5 · utan kontakt säger förklaringen hur mycket som saknas i OBS och när servern senast bekräftade', async () => {
  const { sida, srv } = await iFas();
  const riktig = srv.api;
  srv.api = async (p, o = {}) => { if (o.method === 'PUT') throw Object.assign(new Error('nere'), { status: 0 }); return riktig(p, o) };
  sida.redigera(100);
  await sida.cs.push(); await settle();
  assert.equal(sida.cs.status(), 'offline');
  assert.match(sida.text(), /Ingen kontakt med molnet · 1 ändring syns inte i OBS än/);
  assert.match(sida.not().textContent, /1 ändring syns inte i OBS än/);
  assert.match(sida.not().textContent, /Senast bekräftat av servern kl\. \d{2}[:.]\d{2}/);
});

// ---- B · utgången session -------------------------------------------------------------------

test('B1 · utgången session: "Logga in igen", inte "Ingen kontakt med molnet"', async () => {
  const { sida, srv, ls } = await iFas();
  srv.sessionUte = true;
  sida.redigera(100);
  await sida.cs.push(); await settle();
  assert.equal(sida.cs.status(), 'utloggad',
    `laget blev "${sida.cs.status()}" — användaren tror att det är nätet och att OBS följer efter`);
  assert.match(sida.text(), /utloggad/i);
  const knapp = sida.not() && sida.not().querySelector('[data-cs-logga-in]');
  assert.ok(knapp, 'ingen "Logga in igen"-knapp');
  assert.match(knapp.textContent, /Logga in igen/);
  assert.match(sida.not().textContent, /OBS/);
  knapp.click();
  assert.deepEqual(sida.gate, ['login'], 'knappen öppnar inte inloggningsrutan');
  // Det lokala arbetet ligger kvar, och kön också.
  assert.equal(JSON.parse(ls.getItem('vyra-state')).widgets[0].x, 100);
  assert.ok(ls.getItem(`vyra-cloud-sync-queue:${WS}`), 'kön kastades');
});

test('B2 · efter ny inloggning skickas den osynkade ändringen — utan omladdning', async () => {
  const { sida, srv } = await iFas();
  srv.sessionUte = true;
  sida.redigera(100);
  await sida.cs.push(); await settle();
  assert.equal(sida.cs.status(), 'utloggad');

  srv.sessionUte = false;                       // användaren loggade in i rutan
  sida.skicka('vyra-auth-ready', { user: { id: 'u1' }, workspaces: [{ id: WS }] });
  await settle();
  assert.equal(xPaServern(srv), 100, 'ändringen nådde aldrig servern efter inloggningen');
  assert.equal(sida.cs.status(), 'synced');
  assert.equal(sida.not(), null, 'utloggningsrutan ligger kvar');
});

test('B3 · en bortroterad CSRF-token (sessionen lever) botas tyst och PUT:en går fram', async () => {
  // GET /api/auth/me roterar token. En annan flik eller "Jag har verifierat" räcker.
  const { sida, srv } = await iFas();
  srv.csrfRoterad = true;
  sida.redigera(100);
  await sida.cs.push(); await settle();
  assert.equal(xPaServern(srv), 100, 'PUT:en gick aldrig fram — raden sade "Ingen kontakt med molnet"');
  assert.equal(sida.cs.status(), 'synced');
  assert.ok(srv.anrop.includes('GET /api/auth/me'));
});

test('B4 · under utloggning köas och skickas inget — ingen 401-storm', async () => {
  const { sida, srv } = await iFas();
  srv.sessionUte = true;
  sida.redigera(100);
  await sida.cs.push(); await settle();
  const fore = srv.anrop.length;
  sida.redigera(140);
  sida.tick(); sida.tick();
  await sida.korSchemalagda();
  assert.equal(srv.anrop.length, fore, `nya anrop under utloggning: ${srv.anrop.slice(fore).join(', ')}`);
  assert.match(sida.text(), /1 ändring syns inte i OBS än/);
});

test('B5 · följaren märker en session som gått ut även utan att något redigerats', async () => {
  const { sida, srv } = await iFas();
  srv.sessionUte = true;
  await sida.cs.foljMolnet();
  assert.equal(sida.cs.status(), 'utloggad');
});

test('B6 · ett ANNAT konto i inloggningsrutan får aldrig A:s layout i sin overlay', async () => {
  let utloggad = 0;
  const ls = skapaStore(), srv = skapaServer(layout(20));
  ls.setItem('vyra-state', JSON.stringify(layout(20)));
  ls.setItem(`vyra-cloud-sync-meta:${WS}`, JSON.stringify({ workspaceId: WS, overlayId: OVERLAY, version: 1,
    updatedAt: '', lastLocal: JSON.stringify(layout(20)) }));
  const sida = laddaSida(ls, srv, { ss: { beginLogout: async () => { utloggad++; ls.setItem('vyra-state', JSON.stringify({ widgets: [] })) } } });
  await sida.boota();
  srv.sessionUte = true; sida.redigera(100); await sida.cs.push(); await settle();
  srv.sessionUte = false;
  sida.skicka('vyra-auth-ready', { user: { id: 'u2' }, workspaces: [{ id: 'ws_annan' }] });
  await settle();
  assert.equal(utloggad, 1, 'den gamla sessionen revs inte innan det nya kontot initierades');
  assert.ok(!srv.putar.some(s => s.widgets.some(w => w.x === 100)), 'A:s osynkade layout skickades efter kontobytet');
});

test('B7 · auth-client.js sparar den nya CSRF-token när /api/auth/me svarar', async () => {
  const sessionStorage = skapaStore();
  sessionStorage.setItem('vyra-csrf', 'gammal');
  const sandbox = {
    console, JSON, Object, Promise, Error, URLSearchParams,
    sessionStorage, location: { search: '?access=x' },   // ?access= stoppar init() — bara api() provas
    document: { querySelector: () => null }, dispatchEvent() {}, CustomEvent: function () {},
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, user: { id: 'u1' }, csrfToken: 'farsk' }) })
  };
  sandbox.window = sandbox;
  vm.runInNewContext(AUTH, sandbox, { filename: 'auth-client.js' });
  await sandbox.VyraAuth.api('/api/auth/me');
  assert.equal(sessionStorage.getItem('vyra-csrf'), 'farsk',
    'den roterade token kastades — varje skrivning från fliken får sedan 401 "Inte inloggad"');
});

// ---- C · konflikten med en ensam flik ----------------------------------------------------------

test('C1 · PUT:en kom fram men svaret inte: nästa sparning är ingen "synkkonflikt"', async () => {
  const { sida, srv } = await iFas();
  srv.tappaSvar = true;
  sida.redigera(100);
  await sida.cs.push(); await settle();
  assert.equal(sida.cs.status(), 'offline', 'kontrollmätning: svaret tappades');
  assert.equal(srv.version, 2, 'kontrollmätning: servern har ändå tagit emot skrivningen');

  sida.redigera(120);
  await sida.cs.push(); await settle();
  assert.equal(sida.banderoll(), null,
    'banderollen "Layouten ändrades på en annan dator" visades om vår egen skrivning');
  assert.notEqual(sida.cs.status(), 'conflict');
  await sida.korSchemalagda();
  assert.equal(xPaServern(srv), 120, 'den senaste ändringen nådde aldrig servern');
  assert.equal(sida.cs.status(), 'synced');
});

test('C2 · samma sak utan ny ändring: återförsöket känner igen sin egen version', async () => {
  const { sida, srv } = await iFas();
  srv.tappaSvar = true;
  sida.redigera(100);
  await sida.cs.push(); await settle();
  await sida.cs.push(); await settle();
  assert.equal(sida.banderoll(), null);
  assert.equal(sida.cs.status(), 'synced');
  assert.equal(srv.putar.length, 1, 'samma ändring skrevs två gånger');
});

test('C3 · svaret tappat och sidan omladdad: ingen konflikt, och resten skickas', async () => {
  const { sida, srv, ls } = await iFas();
  srv.tappaSvar = true;
  sida.redigera(100);
  await sida.cs.push(); await settle();
  ls.setItem('vyra-state', JSON.stringify(layout(130)));   // en ändring till, sedan omladdning

  const ny = laddaSida(ls, srv);
  await ny.boota();
  assert.equal(ny.banderoll(), null, 'konfliktbanderollen visades vid omladdningen — om vår egen skrivning');
  assert.equal(xPaServern(srv), 130);
  assert.equal(ny.cs.status(), 'synced');
});

test('C4 · följaren läser listan medan en egen PUT är ute: ingen konflikt', async () => {
  // Följaren frågar efter listan; medan svaret är på väg sparar användaren och PUT:en hinner
  // skrivas på servern. Listan svarar med version 2 innan PUT-svaret flyttat fram overlay.version
  // — och den egna, ännu obekräftade ändringen såg ut som osynkat arbete mot en annan enhet.
  const { sida, srv } = await iFas();
  const lista = srv.hallNastaLista();
  const foljer = sida.cs.foljMolnet();
  await settle();
  sida.redigera(100);
  const put = srv.hallNasta();                  // servern skriver, svaret hålls kvar
  const pagaende = sida.cs.push();
  await settle();
  assert.equal(srv.version, 2, 'kontrollmätning: servern har redan skrivit');
  lista.slapp();
  const r = await foljer; await settle();
  assert.notEqual(r.reason, 'konflikt', 'följaren kallade vår egen pågående skrivning en konflikt');
  assert.equal(sida.banderoll(), null);
  put.slapp(); await pagaende; await settle();
  assert.equal(sida.cs.status(), 'synced');
  assert.equal(xPaServern(srv), 100);
});

test('C5 · en ÄKTA konflikt (annan enhet, annat innehåll) visas fortfarande', async () => {
  const { sida, srv } = await iFas();
  srv.version = 2; srv.state = layout(55);      // någon annan skrev
  sida.redigera(100);
  await sida.cs.push(); await settle();
  assert.equal(sida.cs.status(), 'conflict');
  assert.ok(sida.banderoll(), 'den riktiga konflikten svaldes');
  assert.equal(xPaServern(srv), 55, 'den andra enhetens version skrevs över utan val');
});

test('C6 · under en konflikt skickar tickern inget på egen hand', async () => {
  const { sida, srv } = await iFas();
  srv.version = 2; srv.state = layout(55);
  sida.redigera(100);
  await sida.cs.push(); await settle();
  const putar = srv.putar.length;
  sida.redigera(110);
  sida.tick(); sida.tick();
  await sida.korSchemalagda();
  assert.equal(srv.putar.length, putar);
  assert.equal(xPaServern(srv), 55);
});

// ---- D · återlämnad layout -------------------------------------------------------------------

test('D1 · en parkerad layout med osynkade ändringar skickas — den stämplas inte som synkad', async () => {
  // Utloggning medan servern hade X=20 och den här datorn X=100 (synken låg nere).
  const ls = skapaStore(), srv = skapaServer(layout(20));
  ls.setItem('vyra-state', JSON.stringify({ widgets: [] }));
  ls.setItem(`vyra-cloud-sync-meta:${WS}`, JSON.stringify({ workspaceId: WS, overlayId: OVERLAY, version: 1,
    updatedAt: '', lastLocal: JSON.stringify(layout(20)) }));
  ls.setItem(`vyra-session-backup:${WS}`, JSON.stringify({ state: layout(100), extras: {} }));
  const sida = laddaSida(ls, srv);
  await sida.boota();
  assert.equal(xPaServern(srv), 100,
    `servern står kvar på X=${xPaServern(srv)} medan editorn visar X=100 och raden "${sida.text()}"`);
  assert.equal(sida.cs.status(), 'synced');
});

test('D2 · en parkerad layout som redan var synkad ger ingen onödig skrivning', async () => {
  const ls = skapaStore(), srv = skapaServer(layout(20));
  ls.setItem('vyra-state', JSON.stringify({ widgets: [] }));
  ls.setItem(`vyra-cloud-sync-meta:${WS}`, JSON.stringify({ workspaceId: WS, overlayId: OVERLAY, version: 1,
    updatedAt: '', lastLocal: JSON.stringify(layout(20)) }));
  ls.setItem(`vyra-session-backup:${WS}`, JSON.stringify({ state: layout(20), extras: {} }));
  const sida = laddaSida(ls, srv);
  await sida.boota();
  assert.equal(srv.putar.length, 0);
  assert.equal(sida.cs.status(), 'synced');
  assert.equal(JSON.parse(ls.getItem('vyra-state')).widgets[0].x, 20);
});

test('D3 · parkerad osynkad layout OCH ett moln som gått vidare: användaren väljer', async () => {
  const ls = skapaStore(), srv = skapaServer(layout(55));
  srv.version = 3;
  ls.setItem('vyra-state', JSON.stringify({ widgets: [] }));
  ls.setItem(`vyra-cloud-sync-meta:${WS}`, JSON.stringify({ workspaceId: WS, overlayId: OVERLAY, version: 1,
    updatedAt: '', lastLocal: JSON.stringify(layout(20)) }));
  ls.setItem(`vyra-session-backup:${WS}`, JSON.stringify({ state: layout(100), extras: {} }));
  const sida = laddaSida(ls, srv);
  await sida.boota();
  assert.equal(sida.cs.status(), 'conflict');
  assert.equal(xPaServern(srv), 55, 'molnets nyare version skrevs över utan val');
  assert.equal(JSON.parse(ls.getItem('vyra-state')).widgets[0].x, 100, 'det parkerade arbetet försvann');
});

test('D4 · under den konflikten skriver tickern inte över molnet på egen hand', async () => {
  // Återlämningen projicerade sessionen och overlay.version är färsk — utan spärren i tickern
  // hade nästa redigering skickats och vunnit över den andra enhetens version utan något val.
  const ls = skapaStore(), srv = skapaServer(layout(55));
  srv.version = 3;
  ls.setItem('vyra-state', JSON.stringify({ widgets: [] }));
  ls.setItem(`vyra-cloud-sync-meta:${WS}`, JSON.stringify({ workspaceId: WS, overlayId: OVERLAY, version: 1,
    updatedAt: '', lastLocal: JSON.stringify(layout(20)) }));
  ls.setItem(`vyra-session-backup:${WS}`, JSON.stringify({ state: layout(100), extras: {} }));
  const sida = laddaSida(ls, srv);
  await sida.boota();
  assert.equal(sida.cs.status(), 'conflict');
  sida.redigera(110);
  sida.tick(); sida.tick();
  await sida.korSchemalagda();
  assert.equal(srv.putar.length, 0, 'tickern skickade under en öppen konflikt');
  assert.equal(xPaServern(srv), 55);
});
