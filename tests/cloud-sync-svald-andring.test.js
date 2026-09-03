'use strict';
// "när man ändrar på storlek eller flyttar på widget i layout ska den ändringen komma till TikTok
// Studio automatiskt"
//
// Den gjorde inte det. UPPMÄTT I PRODUKTION 2026-09-03, mot Davids riktiga arbetsyta:
//
//     flytta widget 1 px, save()      -> servern gick 1938 -> 1939 pa under 6 s   ✓
//     flytta tillbaka, save()         -> INGENTING pa 7 s, status sa 'synced'     ✗
//     explicit VyraCloudSync.push()   -> 1939 -> 1940, kom fram direkt            ✓
//
// Andra sparningen svaldes tyst. Orsaken satt i EN rad: tickern flyttade fram `lastLocal` nar en
// andring UPPTACKTES, alltsa innan nagot skickats —
//
//     if(current && current!==lastLocal){ lastLocal=current; ...ko...; schedule() }
//
// — och success-grenen las SEDAN om localStorage och kallade det "skickat":
//
//     lastLocal = localStorage.getItem('vyra-state')
//
// Andrade anvandaren nagot medan pushen var i luften blev alltsa DEN andringen markerad som synkad
// utan att ha skickats. Nasta tick sag ingen skillnad, och den var borta.
//
// VARFOR DET DRABBAR JUST DRAGNING OCH STORLEKSANDRING: de sparar manga ganger i foljd. De sista
// sparningarna landar mitt i natverksrundan — alltsa SLUTPOSITIONEN, den enda som betyder nagot.
// Studion visar dar du slappte, servern har mellanlaget, och OBS visar serverns.
//
// SAMMA RAD GAV ETT ANDRA FEL: misslyckades pushen var `lastLocal` redan framflyttad, sa tickern
// kunde aldrig hitta andringen igen. Den lag kvar i kon och vantade pa nasta initialize().
//
// PROVET MATER TICKERN, INTE ETT MANUELLT push(). Skillnaden syns bara dar: push() bygger alltid
// sin nyttolast fars fran localStorage, sa ett manuellt anrop skickar ratt varde aven med den
// trasiga koden. Det som var trasigt var att ingen NAGONSIN anropade det igen.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'cloud-sync.js'), 'utf8');

const WS = 'ws_test', OVERLAY = 'ov_test';
const layout = namn => ({ widgets: [{ id: 'w1', type: 'templateTopLike', x: namn }] });

function makeEnv() {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i],
    get length() { return store.size }
  };
  const start = JSON.stringify(layout(0));
  localStorage.setItem('vyra-state', start);
  localStorage.setItem(`vyra-cloud-sync-meta:${WS}`, JSON.stringify({
    workspaceId: WS, overlayId: OVERLAY, version: 1, updatedAt: '', lastLocal: start }));

  const putar = [];              // varje PUT som nadde "servern", i ordning
  let slappPut = null;           // satts nar en PUT ska hallas i luften
  const api = async (p, options = {}) => {
    if (options.method === 'PUT') {
      const kropp = JSON.parse(options.body);
      putar.push(kropp.state);
      if (slappPut) { const vanta = new Promise(r => { slappPut.slapp = r }); slappPut = null; await vanta }
      return { overlay: { id: OVERLAY, name: 'x', version: 1 + putar.length, state: kropp.state } };
    }
    if (/\/overlays\/[^/]+$/.test(p)) {
      return { overlay: { id: OVERLAY, name: 'x', version: 1, state: JSON.parse(start) } };
    }
    return { overlays: [{ id: OVERLAY, name: 'x', version: 1 }] };
  };

  // Timers fangas i stallet for att kora: da gar det att SE om modulen schemalade en ny push.
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
      createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, append() {},
        querySelector: () => null, querySelectorAll: () => [] }),
      body: { append() {} }, addEventListener() {} },
    addEventListener: () => {},
    VyraAuth: { api },
    VyraSessionState: {
      canPush: () => true, canQueue: () => true,
      beginProjection: () => ({ projectionId: 'p1' }),
      mode: () => 'studio-committed',
      projectActive: async (token, opts) => {
        localStorage.setItem('vyra-state', JSON.stringify(opts.state));
        return { ok: true };
      },
      projectLocalSession: async () => ({ ok: true })
    }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.root = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: 'cloud-sync.js' });

  return {
    sandbox, localStorage, putar, schemalagda, tickare,
    // Simulerar en anvandarredigering: save() skriver localStorage, inget annat.
    redigera: x => localStorage.setItem('vyra-state', JSON.stringify(layout(x))),
    tick: () => tickare.forEach(fn => fn()),
    korSchemalagda: async () => { const kopia = schemalagda.splice(0); for (const fn of kopia) await fn() },
    hallPut: () => { const h = {}; slappPut = h; return h },
    xIPut: i => (putar[i] && putar[i].widgets[0] ? putar[i].widgets[0].x : null),
  };
}

const settle = () => new Promise(r => setImmediate(r));

async function boota() {
  const env = makeEnv();
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();
  env.schemalagda.length = 0;   // allt fran uppstarten raknas inte
  env.putar.length = 0;
  return env;
}

// ---- 1. sjalva felet ---------------------------------------------------------------------------

test('en ändring som görs medan pushen är i luften skickas ändå', async () => {
  const env = await boota();

  env.redigera(1);                       // användaren flyttar widgeten
  env.tick();                            // tickern upptäcker och schemalägger
  assert.equal(env.schemalagda.length, 1, 'tickern schemalade ingen push för den första ändringen');

  const hall = env.hallPut();            // nästa PUT fastnar i luften
  const pushen = env.korSchemalagda();
  await settle();

  env.redigera(2);                       // ← släpper widgeten HÄR, mitt i nätverksrundan
  hall.slapp();                          // servern svarar på den FÖRSTA
  await pushen; await settle();

  assert.equal(env.xIPut(0), 1, 'första PUT bar inte den första ändringen');

  // Kärnan: systemet måste av SIG SJÄLVT förstå att x=2 aldrig skickades.
  env.tick();
  await env.korSchemalagda();
  await settle();

  assert.equal(env.putar.length, 2,
    'x=2 skickades aldrig — den markerades som synkad utan att ha lämnat maskinen. '
    + 'Det är exakt det som gör att en dragnings SLUTPOSITION inte når TikTok Studio.');
  assert.equal(env.xIPut(1), 2, 'andra PUT bar fel värde');
});

// ---- 2. samma rad, andra felet -----------------------------------------------------------------

test('en misslyckad push glömmer inte ändringen', async () => {
  const env = await boota();
  env.sandbox.VyraAuth.api = async (p, options = {}) => {
    if (options.method === 'PUT') { const e = new Error('nere'); e.status = 500; throw e }
    return { overlay: { id: OVERLAY, name: 'x', version: 1, state: layout(0) } };
  };

  env.redigera(7);
  env.tick();
  await env.korSchemalagda();
  await settle();

  // Servern är uppe igen.
  const putar = [];
  env.sandbox.VyraAuth.api = async (p, options = {}) => {
    if (options.method === 'PUT') { const k = JSON.parse(options.body); putar.push(k.state);
      return { overlay: { id: OVERLAY, name: 'x', version: 9, state: k.state } } }
    return { overlay: { id: OVERLAY, name: 'x', version: 1, state: layout(0) } };
  };

  env.tick();
  await env.korSchemalagda();
  await settle();

  assert.equal(putar.length, 1,
    'ändringen hittades aldrig igen efter ett misslyckat försök — lastLocal var redan framflyttad, '
    + 'så tickern såg ingen skillnad kvar att skicka');
  assert.equal(putar[0].widgets[0].x, 7);
});

// ---- 3. inget onödigt arbete -------------------------------------------------------------------

test('en oförändrad layout schemalägger ingenting', async () => {
  const env = await boota();
  env.tick(); env.tick(); env.tick();
  assert.equal(env.schemalagda.length, 0, 'tickern schemalade en push utan att något ändrats');
});

test('samma ändring köas inte om vid varje tick', async () => {
  // Utan `current!==koadLokal` skulle varje sekund lägga en ny kö och skjuta debouncen framåt —
  // pushen hade då aldrig blivit av så länge tickern gick.
  const env = await boota();
  env.redigera(3);
  env.tick(); env.tick(); env.tick();
  assert.equal(env.schemalagda.length, 1,
    `${env.schemalagda.length} scheman för EN ändring — varje tick sköt pushen framför sig`);
});
