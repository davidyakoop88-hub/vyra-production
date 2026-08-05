'use strict';
// "Vad händer om cloud-syncen tappar anslutning? Får användaren veta det?"
//
// Nej. Och orsaken ar densamma som for "man vet inte om synken hunnit skicka":
//
//     function mountStatus(){}                            cloud-sync.js:21
//
// En tom stubb. setStatus() skriver till document.querySelectorAll('.cloud-status') — och det
// finns inget sadant element pa sidan, for ingen skapar det. Hela statusmaskinen fungerar: den
// raknar ut synced / saving / offline / conflict helt korrekt och skickar resultatet till noll
// element. cloud-sync.css har till och med fardig styling for varje lage, gron prick for synced
// och barnstensgul for offline, som aldrig har ritats en enda gang.
//
// Foljden ar precis den David beskriver: man sparar, ser ingenting, refreshar OBS for tidigt och
// tror att widgeten ar trasig. Tappar synken anslutningen ser det likadant ut — andringarna
// hamnar i kon pa den har datorn och OBS far dem aldrig, utan ett ord om saken.
//
// Det ar samma monster som fyra tidigare buggar i den har kodbasen: ena sidan flyttade, den andra
// foljde inte med, och ingenting kraschade hogljutt.
//
// ROTT NU.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'cloud-sync.js'), 'utf8');
const WS = 'ws_test', OVERLAY = 'ov_test';

const levande = [];
test.after(() => { while (levande.length) { const e = levande.pop();
  e.teardowns.forEach(fn => { try { fn() } catch (_) {} }); e.dom.window.close() } });

// Lankraden som media.js bygger, i den form mountStatus() ska hitta den.
const LANKRAD = `<div class="overlay-link-bar">
  <div><span><i></i> OVERLAYLÄNK · HELA OVERLAYN ELLER EN WIDGET</span>
  <select id="overlayLinkTarget"></select><input id="overlayLinkValue" readonly></div>
  <button id="copyObsLink">Kopiera till OBS</button>
  <button id="copyTikTokLink">Kopiera till TikTok</button>
  <button id="previewOverlayLink">Förhandsvisa ↗</button>
</div>`;

function makeEnv({ barPresent = true, putFails = false, realTimers = false } = {}) {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i],
    get length() { return store.size }
  };
  const local = { widgets: [{ id: 'w1', type: 'templateTopGift' }] };
  localStorage.setItem('vyra-state', JSON.stringify(local));
  localStorage.setItem(`vyra-cloud-sync-meta:${WS}`, JSON.stringify({
    workspaceId: WS, overlayId: OVERLAY, version: 1, updatedAt: '',
    lastLocal: JSON.stringify(local)
  }));

  const dom = new JSDOM(`<!doctype html><body>${barPresent ? LANKRAD : ''}</body>`);
  const api = async (p, options = {}) => {
    if (options.method === 'PUT') {
      if (putFails) { const e = new Error('natverk'); e.status = 0; throw e }
      return { overlay: { id: OVERLAY, name: 'x', version: 2, state: JSON.parse(options.body).state } };
    }
    if (/\/overlays\/[^/]+$/.test(p)) return { overlay: { id: OVERLAY, name: 'x', version: 1, state: local } };
    return { overlays: [{ id: OVERLAY, name: 'x', version: 1 }] };
  };

  // Tickern kors med riktig setInterval i ett av testerna. Utan att riva den lever den vidare och
  // node --test avslutas aldrig. resetSession registreras via registerTeardown, sa stubben maste
  // faktiskt ta emot den — optional-chainas den bort finns ingen vag att stanga ner.
  const teardowns = [];
  let mode = 'boot-neutral';
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Map, Set, Boolean, Error, Promise, Date, isNaN,
    setTimeout: realTimers ? setTimeout : () => 0,
    clearTimeout: realTimers ? clearTimeout : () => {},
    setInterval: realTimers ? setInterval : () => 0,
    clearInterval: realTimers ? clearInterval : () => {},
    localStorage,
    location: { search: '' },
    document: dom.window.document,
    addEventListener: () => {},
    VyraAuth: { api },
    VyraSessionState: {
      canPush: () => true, canQueue: () => true,
      beginProjection: () => ({ projectionId: 'p1' }),
      mode: () => mode,
      projectActive: async (token, opts) => {
        localStorage.setItem('vyra-state', JSON.stringify(opts.state));
        mode = opts.mode || 'studio-committed';
        return { ok: true };
      },
      projectLocalSession: async () => ({ ok: true }),
      registerTeardown: (name, fn) => teardowns.push(fn)
    }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.root = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: 'cloud-sync.js' });

  levande.push({ teardowns, dom });
  return { sandbox, dom, document: dom.window.document, localStorage };
}

const settle = () => new Promise(r => setImmediate(r));
const boota = async env => {
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();
  return env;
};

// Elementet setStatus redan skriver till. Det ar inte nytt — cloud-sync.css:1 har haft styling for
// varje lage hela tiden. Det har bara aldrig funnits nagot att styla.
const status = doc => doc.querySelector('.overlay-link-bar .cloud-status');

test('synkstatusen syns i lankraden', async () => {
  const env = await boota(makeEnv());
  const el = status(env.document);

  assert.ok(el, 'ingen .cloud-status i lankraden — mountStatus() ar en tom stubb, sa setStatus() ' +
    'skriver till noll element och anvandaren ser aldrig om synken hunnit skicka');
  assert.ok(el.querySelector('span'), 'setStatus() gor el.querySelector(\'span\').textContent — ' +
    'utan span kastar den och tar med sig resten av setStatus');
});

test('statusen sager "sparad" nar molnet tagit emot', async () => {
  const env = await boota(makeEnv());
  await env.sandbox.VyraCloudSync.push();
  await settle();
  const el = status(env.document);

  assert.equal(el && el.dataset.state, 'synced');
  // Skarpt fran /[Ss]parad/: den slapp igenom vilket "sparat" som helst. Poangen ar att texten
  // maste bekrafta att MOLNET tagit emot — skillnaden mellan "det ligger pa min disk" och "det ar
  // tryggt att refresha OBS" ar hela anledningen till att rutan finns.
  assert.match(el.querySelector('span').textContent, /[Ss]para[dt].*moln|moln.*[Ss]para[dt]/i,
    'texten bekraftar inte att molnet tagit emot');
});

test('tappad anslutning sager vad det betyder for OBS', async () => {
  const env = await boota(makeEnv({ putFails: true }));
  await env.sandbox.VyraCloudSync.push();
  await settle();
  const el = status(env.document);

  assert.equal(el && el.dataset.state, 'offline', 'push() misslyckades men laget blev inte offline');

  // "Offline" i sig sager inte varfor OBS ser gammalt ut. Det ar konsekvensen som ar poangen:
  // andringarna finns kvar har, men OBS hamtar sin layout fran servern och far dem inte forran
  // synken ar tillbaka. Utan den meningen felsoker man widgeten i stallet for anslutningen.
  const varning = env.document.querySelector('.cloud-status-warning, .cs-offline-note');
  assert.ok(varning, 'ingen forklaring vid tappad anslutning — anvandaren tror att OBS ar trasig ' +
    'nar det egentligen ar synken');
  assert.match(varning.textContent, /OBS/,
    'varningen maste namna OBS, annars kopplar man den inte till det man faktiskt ser');
});

test('varningen forsvinner nar synken ar tillbaka', async () => {
  const env = await boota(makeEnv({ putFails: true }));
  await env.sandbox.VyraCloudSync.push();
  await settle();
  assert.ok(env.document.querySelector('.cloud-status-warning, .cs-offline-note'), 'ingen varning att rensa');

  // Samma env, men PUT lyckas nu. En varning som ligger kvar efter aterstalld anslutning ar
  // precis lika vilseledande som ingen varning alls.
  env.sandbox.VyraAuth.api = async (p, options = {}) => {
    if (options.method === 'PUT') return { overlay: { id: OVERLAY, name: 'x', version: 3, state: JSON.parse(options.body).state } };
    if (/\/overlays\/[^/]+$/.test(p)) return { overlay: { id: OVERLAY, name: 'x', version: 1, state: { widgets: [] } } };
    return { overlays: [] };
  };
  await env.sandbox.VyraCloudSync.push();
  await settle();

  assert.equal(env.document.querySelector('.cloud-status-warning, .cs-offline-note'), null,
    'varningen ligger kvar trots att synken ar tillbaka');
});

test('statusen mountas aven nar lankraden kommer efterat', async () => {
  // I verkligheten byggs lankraden av media.js bind(), efter att cloud-sync redan bootat. Darfor
  // anropas mountStatus() ocksa fran tickern varje sekund. Utan den vagen ser en anvandare som
  // laddar Studion aldrig nagon status alls — vilket ar det normala fallet, inte ett kantfall.
  const env = await boota(makeEnv({ barPresent: false, realTimers: true }));
  assert.equal(status(env.document), null, 'ingen lankrad an, sa ingen status');

  env.document.body.innerHTML = LANKRAD;
  await new Promise(r => setTimeout(r, 1200));

  assert.ok(status(env.document), 'tickern mountade aldrig statusen i lankraden som dok upp');
});

test('statusen syns aven utan konto', async () => {
  // Uppmatt i webblasaren pa den har grenen: lankraden fanns, .cloud-status fanns inte, laget var
  // 'local'. mountStatus() naddes bara via initialize() och startTicker(), och bada kraver ett
  // workspace. Desktopappen har inget kontosystem (vyra-auth-local -> projectLocalSession), sa den
  // hade aldrig fatt nagon status alls — och det ar den anvandaren som mest behover veta att
  // ingenting gar till molnet. Web/desktop-pariteten ar ett uttalat krav i det har projektet.
  const env = makeEnv({ realTimers: true });   // INGEN initialize(): ingen inloggning har hant
  await new Promise(r => setTimeout(r, 1200));
  const el = status(env.document);

  assert.ok(el, 'ingen status utan konto — desktopappen visar da ingenting');
  assert.equal(el.dataset.state, 'local');
  assert.ok(el.querySelector('span').textContent.trim().length > 0,
    'statusrutan ar tom — en tom ruta sager mindre an ingen ruta');
});

test('lankraden har en synlig vag till tokenhanteraren', () => {
  // .oa-open skapas med button.hidden = true (overlay-access.js), sa enda vagen in ar att trycka
  // Kopiera utan token och fa den oppnad at sig av en fallback. Det ar den luckan som gjort att
  // David trott att han maste skapa en ny lank varje gang — han har aldrig sett hanteraren, och
  // darmed aldrig sett att den befintliga token racker for alltid.
  const media = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
  const bar = media.match(/class = *'overlay-link-bar'|className *= *'overlay-link-bar'/);
  assert.ok(bar, 'hittade inte lankraden i media.js');

  // Las hela bind-wrappern. En gissad slice pa 2600 tecken slutade mitt i och gjorde testet rott
  // for korrekt kod — matfelet, inte koden.
  const start = media.indexOf('overlay-link-bar');
  const slut = media.indexOf("bar.querySelector('#copyObsLink')", start);
  assert.ok(slut > start, 'hittade inte slutet pa lankradens uppsattning');
  const markup = media.slice(start, slut);
  assert.match(markup, /id="manageObsLinks"/,
    'lankraden har ingen egen knapp for att oppna tokenhanteraren');
  // Knappen ska OPPNA hanteraren, inte bara finnas. Testade forst en exakt stavning
  // (`manageObsLinks').onclick`) och missade att handlern gar via en variabel — det matte
  // formuleringen, inte funktionen.
  const wired = /manage\.onclick|manageObsLinks'\)\.onclick/.test(markup);
  assert.ok(wired, 'knappen finns i markupen men har ingen klickhanterare');
  assert.match(markup, /oa-open/,
    'knappen ar kopplad men oppnar inte tokenhanteraren');

  // Sjalva missforstandet som ska ratas: att en ny lank behovs vid varje andring. Knappen ska saga
  // motsatsen dar man staller sig for att lasa den.
  assert.match(markup, /fortsätter gälla|gäller tills/,
    'inget som forklarar att den befintliga lanken fortsatter gälla');
});
