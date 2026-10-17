'use strict';
// ETT OVERIFIERAT KONTO FICK HÖRA "INGEN KONTAKT MED MOLNET" — RÖTT FÖRST (2026-10-17).
//
// server/index.js svarar 403 {emailVerificationRequired:true} på varje skrivning från ett konto vars
// e-post inte är verifierad. Det gäller också den allra första: POST /api/workspaces/<id>/overlays,
// som cloud-sync.js initialize() gör automatiskt för ett nytt konto utan overlay.
//
// FÖRE: catch-grenen i initialize() satte status 'offline'. Användaren såg "Ingen kontakt med
// molnet" och en ruta om att synken skulle komma tillbaka — den kommer aldrig tillbaka förrän
// e-posten är verifierad. Sessionen projicerades aldrig heller, så studion var inte skrivbar
// (session-state.js: writeActive → not-writable) och inget hen byggde sparades ens lokalt.
// Ingen overlay skapades, alltså fanns ingen OBS-länk att kopiera.
//
// Spärren står kvar. Det som provas här är att studion säger sanningen och låter arbetet ligga
// kvar på datorn tills e-posten är verifierad — då laddar create() upp det som första overlay.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'cloud-sync.js'), 'utf8');
const WS = 'ws_ny';

function epostfel() {
  return Object.assign(new Error('Verifiera din e-postadress innan du sparar eller publicerar.'),
    { status: 403, emailVerificationRequired: true });
}

function makeEnv({ local, overlays = [], putFel, postFel = epostfel } = {}) {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i],
    get length() { return store.size }
  };
  if (local) localStorage.setItem('vyra-state', JSON.stringify(local));
  const anrop = [];
  const api = async (p, options = {}) => {
    anrop.push({ method: options.method || 'GET', path: p });
    if (options.method === 'POST' && /\/overlays$/.test(p)) throw postFel();
    if (options.method === 'PUT') throw putFel();
    const m = p.match(/\/overlays\/([^/]+)$/);
    if (m) return { overlay: overlays.find(o => o.id === m[1]) };
    return { overlays: overlays.map(o => ({ id: o.id, name: o.name, version: o.version })) };
  };
  const projektioner = [];
  // Minimal DOM: bara det som behövs för att läsa vad användaren faktiskt ser.
  const tillagda = [];
  const element = () => {
    const el = { style: {}, dataset: {}, className: '', html: '', classList: { add() {}, remove() {}, toggle() {} },
      append() {}, remove() { const i = tillagda.indexOf(el); if (i >= 0) tillagda.splice(i, 1) },
      querySelector: () => null, querySelectorAll: () => [] };
    Object.defineProperty(el, 'innerHTML', { get: () => el.html, set: v => { el.html = String(v) } });
    return el;
  };
  const statusSpan = { textContent: '' };
  const statusEl = { dataset: {}, querySelector: s => (s === 'span' ? statusSpan : null) };
  const linkBar = { querySelector: s => (s === '.cloud-status' ? statusEl : null), append() {} };
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Map, Set, Boolean, Error, Promise, Date, isNaN,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    localStorage, location: { search: '' },
    document: {
      querySelectorAll: s => (s === '.cloud-status' ? [statusEl] : []),
      querySelector: s => {
        if (s === '.overlay-link-bar') return linkBar;
        const klass = s.startsWith('.') ? s.slice(1) : null;
        return tillagda.find(e => e.className === klass) || null;
      },
      createElement: element,
      body: { append: e => tillagda.push(e) }
    },
    addEventListener: () => {},
    VyraAuth: { api },
    VyraSessionState: { canPush: () => true, canQueue: () => true, beginProjection: () => ({ projectionId: 'p1' }),
      projectActive: async (t, opts) => { projektioner.push(opts); localStorage.setItem('vyra-state', JSON.stringify(opts.state)); return { ok: true } },
      projectLocalSession: async () => ({ ok: true }) },
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.root = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: 'cloud-sync.js' });
  const synligText = () => [statusSpan.textContent, ...tillagda.map(e => e.html)].join(' | ');
  return { sandbox, localStorage, anrop, projektioner, synligText };
}
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r)) };

test('ny overifierad användare: statusen är INTE "Ingen kontakt med molnet"', async () => {
  const env = makeEnv({});
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();
  assert.ok(env.anrop.some(a => a.method === 'POST'), 'förutsättning: första overlayn försöktes skapas');
  assert.notEqual(env.sandbox.VyraCloudSync.status(), 'offline');
  assert.doesNotMatch(env.synligText(), /Ingen kontakt med molnet/);
});

test('ny overifierad användare: det som syns säger att e-posten ska verifieras', async () => {
  const env = makeEnv({});
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();
  assert.equal(env.sandbox.VyraCloudSync.status(), 'verifiering');
  assert.match(env.synligText(), /[Vv]erifiera din e-post/);
  assert.match(env.synligText(), /OBS/, 'beskedet ska säga vad det betyder för OBS-länken');
});

test('ny overifierad användare: studion blir skrivbar lokalt i stället för död', async () => {
  const env = makeEnv({});
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();
  assert.equal(env.projektioner.length, 1, 'sessionen måste projiceras, annars sparas ingenting alls');
  assert.equal(env.projektioner[0].mode, 'studio-committed');
  assert.equal(env.projektioner[0].workspaceId, WS);
  assert.equal(env.projektioner[0].overlayId, null, 'ingen overlay finns — inget id får hittas på');
  assert.ok(Array.isArray(env.projektioner[0].state.widgets));
});

test('lokalt arbete från förra besöket ligger kvar och skrivs inte över', async () => {
  const env = makeEnv({ local: { widgets: [{ id: 'w1', type: 'templateHeartGoal' }] } });
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();
  assert.deepEqual(env.projektioner[0].state.widgets.map(w => w.id), ['w1']);
});

test('ett riktigt nätverksfel är fortfarande "offline"', async () => {
  const env = makeEnv({ postFel: () => Object.assign(new Error('Failed to fetch'), { status: 0 }) });
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();
  assert.equal(env.sandbox.VyraCloudSync.status(), 'offline');
});

test('overifierad medlem i ett workspace med overlay: sparningen säger sanningen och köar', async () => {
  const ov = { id: 'ov1', name: 'Min', version: 1, state: { widgets: [{ id: 'w1' }] } };
  const env = makeEnv({ overlays: [ov], putFel: epostfel });
  await env.sandbox.VyraCloudSync.initialize({ workspaces: [{ id: WS }] });
  await settle();
  env.localStorage.setItem('vyra-state', JSON.stringify({ widgets: [{ id: 'w1' }, { id: 'w2' }] }));
  const out = await env.sandbox.VyraCloudSync.push();
  assert.equal(out.ok, false);
  assert.equal(env.sandbox.VyraCloudSync.status(), 'verifiering');
  assert.doesNotMatch(env.synligText(), /Ingen kontakt med molnet/);
  const ko = [...Array(env.localStorage.length).keys()].map(i => env.localStorage.key(i)).filter(k => /queue/i.test(k));
  assert.ok(ko.length, 'ändringen ska ligga kvar i kön tills e-posten är verifierad');
});

test('cachebusten höjdes med filen', () => {
  const v = (fs.readFileSync(path.join(ROOT, 'studio.html'), 'utf8').match(/cloud-sync\.js\?v=([^"]+)"/) || [])[1];
  assert.notEqual(v, '20261011-2', 'studio.html måste ladda den nya cloud-sync.js');
});
