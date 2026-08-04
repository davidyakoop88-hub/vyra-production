'use strict';
// Desktopappen slapper aldrig in — och sager aldrig varfor.
//
// main.js laddar vyralive.app och pollar varje sekund tills kontot ar behorigt. Sonden returnerade
// `null` for VARJE misslyckande, och Node-sidan gjorde `if(account)` — sa allt som inte var en
// fullstandig traff blev tyst vantan, for alltid, utan ett ord till anvandaren.
//
// Tre lagen slas ihop till samma null, trots att de kraver helt olika svar:
//
//   401                        du haller pa att logga in            -> vanta
//   403 + mfaRequired:true     du ska fylla i MFA i fonstret        -> vanta
//   plan:'free'                kontot kommer ALDRIG in av sig sjalv -> sag det
//
// Den sista ar den som gor att appen ser ut att kasta ut en: inloggningen lyckas, sidan star kvar,
// ingenting hander. is_platform_admin (som gar forbi billing) ar dessutom en DB-kolumn med default
// false som ingen kod nagonsin satter.
//
// Sonden ska darfor lamna ett SKAL, inte null, och Node-sidan ska skilja pa vanta och sag-till.
//
// ROTT NU: sonden returnerar null for allt.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const MAIN = fs.readFileSync(path.join(ROOT, 'electron-app/main.js'), 'utf8');

// Sidskriptet plockas ut deterministiskt via sin markor, inte med en regex over hela filen.
const MARKER = '/* desktop-entry-probe */';
function probeSource() {
  const at = MAIN.indexOf(MARKER);
  assert.notEqual(at, -1, `hittade ingen ${MARKER} i electron-app/main.js`);
  const start = MAIN.indexOf('`', at);
  const end = MAIN.indexOf('`', start + 1);
  assert.ok(start !== -1 && end !== -1, 'sonden ligger inte i en template-literal');
  return MAIN.slice(start + 1, end);
}

// Kor sonden med ett pahittat fetch-svar per endpoint.
function runProbe(routes) {
  const sandbox = {
    JSON, Object, Array, String, Number, Boolean, Promise, Error, encodeURIComponent,
    console: { log() {}, warn() {}, error() {} },
    fetch: async (url) => {
      const hit = Object.keys(routes).find(k => String(url).includes(k));
      if (!hit) throw new Error('ingen rutt for ' + url);
      const r = routes[hit];
      if (r.throws) throw new Error(r.throws);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
    }
  };
  vm.createContext(sandbox);
  return vm.runInContext(probeSource(), sandbox, { filename: 'desktop-entry-probe.js' });
}

const ME_OK = { ok: true, user: { id: 'u1', email: 'a@b.c', isPlatformAdmin: false }, workspaces: [{ id: 'ws1' }] };

test('inloggad med premium slapps in', async () => {
  const v = await runProbe({
    '/api/auth/me': { status: 200, body: ME_OK },
    '/billing': { status: 200, body: { plan: 'premium', subscription: { status: 'active' } } }
  });
  assert.equal(v.ok, true, 'ett behorigt konto slapptes inte in');
  assert.equal(v.account.workspace.id, 'ws1');
  assert.equal(v.account.plan, 'premium');
});

test('plattformsadmin gar forbi billing helt', async () => {
  const v = await runProbe({
    '/api/auth/me': { status: 200, body: { ...ME_OK, user: { ...ME_OK.user, isPlatformAdmin: true } } }
  });
  assert.equal(v.ok, true);
  assert.equal(v.account.plan, 'admin');
});

test('401 ar "vanta", inte ett fel', async () => {
  const v = await runProbe({ '/api/auth/me': { status: 401, body: { ok: false } } });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'not-logged-in');
  assert.equal(v.wait, true, 'inloggning pagar — appen ska vanta ut den, inte klaga');
});

test('MFA ar "vanta", och far inte se ut som utloggad', async () => {
  const v = await runProbe({
    '/api/auth/me': { status: 403, body: { ok: false, error: 'MFA krävs', mfaRequired: true } }
  });
  assert.equal(v.reason, 'mfa', 'MFA slogs ihop med inte-inloggad');
  assert.equal(v.wait, true);
});

test('utan premium sags det rakt ut, och pollningen ar meningslos', async () => {
  const v = await runProbe({
    '/api/auth/me': { status: 200, body: ME_OK },
    '/billing': { status: 200, body: { plan: 'free', subscription: { status: 'active' } } }
  });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'not-premium');
  assert.equal(v.wait, false, 'ett gratiskonto blir aldrig premium av att pollas en gang till');
  assert.equal(v.plan, 'free', 'skalet ska bara med vad kontot faktiskt har');
});

test('premium men avslutad prenumeration ar ocksa terminalt', async () => {
  const v = await runProbe({
    '/api/auth/me': { status: 200, body: ME_OK },
    '/billing': { status: 200, body: { plan: 'premium', subscription: { status: 'canceled' } } }
  });
  assert.equal(v.reason, 'not-premium');
  assert.equal(v.status, 'canceled');
});

test('konto utan workspace far sitt eget skal', async () => {
  const v = await runProbe({
    '/api/auth/me': { status: 200, body: { ...ME_OK, workspaces: [] } }
  });
  assert.equal(v.reason, 'no-workspace');
  assert.equal(v.wait, false);
});

test('natverksfel ar vanta, inte terminalt', async () => {
  const v = await runProbe({ '/api/auth/me': { throws: 'Failed to fetch' } });
  assert.equal(v.reason, 'network');
  assert.equal(v.wait, true, 'en tillfallig natverksglapp far inte slapa upp appen permanent');
});

// ---- Node-sidan: skal maste faktiskt anvandas ------------------------------------------------------
test('terminala skal stoppar pollningen och visar en ruta', () => {
  // Fran markoren till dar pollningen startas — handlerns faktiska slut, inte ett magiskt antal
  // tecken som rostnar sa fort sonden vaxer.
  const at = MAIN.indexOf(MARKER);
  const after = MAIN.slice(at, MAIN.indexOf('desktopAuthTimer=setInterval', at));
  assert.match(after, /verdict\?\.ok|verdict\.ok/, 'Node-sidan laser inte sondens svar');
  assert.match(after, /verdict\.wait|!verdict\.wait/, 'wait-flaggan anvands inte — allt blir tyst vantan igen');
  assert.match(after, /showMessageBox|dialog\./,
    'inget visas for anvandaren — det ar hela buggen');
});

test('rutan visas en gang, inte varje sekund', () => {
  // Fran markoren till dar pollningen startas — handlerns faktiska slut, inte ett magiskt antal
  // tecken som rostnar sa fort sonden vaxer.
  const at = MAIN.indexOf(MARKER);
  const after = MAIN.slice(at, MAIN.indexOf('desktopAuthTimer=setInterval', at));
  assert.match(after, /clearInterval\(desktopAuthTimer\)/,
    'pollningen stoppas inte, sa rutan skulle poppa upp en gang i sekunden');
});
