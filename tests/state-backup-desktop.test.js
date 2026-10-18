'use strict';
// F04 (P1): "Hantera backup" i webben visade "Starta VYRA-servern" och "Skapa version nu" svarade
// "Inte inloggad" - aven efter ny inloggning.
//
// /api/state* finns bara i Desktop-processens lokala server (electron-app/local-server.js). Molnet
// (server/index.js) har inga sadana rutter: GET gav 404 och POST fastnade i sessionsspärren (401,
// ingen CSRF). state-backup.js startade anda sin 3-sekundersloop och sitt uppstartsanrop i webben,
// och visade knappar som bara kunde svara fel.
//
// Desktop avgörs pa vardnamnet: Electron laddar Studion fran http://127.0.0.1:<port>/studio.html.
// VyraAuth.isLocalSession() ar INTE signalen - i Desktop vidarebefordrar den lokala servern
// /api/auth/config till molnet, sa isLocalSession() ar false just dar backupen fungerar. Proven
// nedan kor darfor Desktop-fallen med en stub dar isLocalSession() ar false, precis som i appen.
//
// Separat: restore/importFile gjorde `const count=apply(...)` utan await - toasten visade
// "[object Promise] widgets" och ett avvisat lofte fangades aldrig.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'state-backup.js'), 'utf8');
const WEB = 'https://vyralive.app/studio.html';
const DESKTOP = 'http://127.0.0.1:4173/studio.html?desktop=1';
const flush = () => new Promise(r => setTimeout(r, 30));

function studio({ url, localSession = false, state = { widgets: [{ id: 'a' }] }, respond, restoreOk = true } = {}) {
  const dom = new JSDOM('<!doctype html><div id="view"><div class="settings-page"></div></div>', { url, runScripts: 'outside-only' });
  const w = dom.window;
  const calls = [], intervals = [], toasts = [], restored = [];
  w.fetch = (u, opts = {}) => {
    calls.push({ url: String(u), method: opts.method || 'GET' });
    return respond ? respond(String(u), opts) : Promise.reject(new TypeError('Failed to fetch'));
  };
  w.setInterval = fn => { intervals.push(fn); return intervals.length };
  w.VyraAuth = { isLocalSession: () => localSession, isRequired: () => !localSession };
  w.VyraSessionState = { projectRestore: async payload => { restored.push(payload); return { ok: restoreOk } } };
  w.toast = m => toasts.push(String(m));
  w.confirm = () => true;
  w.view = 'settings';
  if (state) w.localStorage.setItem('vyra-state', JSON.stringify(state));
  w.eval(SOURCE);
  return { w, calls, intervals, toasts, restored, close: () => w.close() };
}
const json = (body, status = 200) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
const stateCalls = calls => calls.filter(c => c.url.includes('/api/state'));

// ---- webben ----------------------------------------------------------------------------------
test('webben: ingen loop och inget uppstartsanrop mot /api/state*', async () => {
  const s = studio({ url: WEB, localSession: false });
  await flush();
  assert.deepEqual(stateCalls(s.calls), [], 'molnet har inga /api/state-rutter - inga anrop alls');
  assert.equal(s.intervals.length, 0, '3-sekundersloopen far inte starta i webben');
  s.close();
});

test('webben utan sparad layout: ingen GET /api/state vid start heller', async () => {
  const s = studio({ url: WEB, state: null });
  await flush();
  assert.deepEqual(stateCalls(s.calls), []);
  s.close();
});

test('webben: inställningarna visar Desktop-raden, inga versionsknappar', async () => {
  const s = studio({ url: WEB });
  s.w.VyraBackup.injectSettings();
  const box = s.w.document.querySelector('.vb-settings');
  assert.ok(box, 'raden ska finnas');
  assert.match(box.textContent, /VYRA Desktop/);
  for (const id of ['#openBackupManager', '#vbCreate', '#vbVersions']) {
    assert.equal(s.w.document.querySelector(id), null, `${id} kan bara svara fel i webben`);
  }
  assert.ok(s.w.document.querySelector('#vbExport'), 'export till JSON-fil ar lokal och far finnas kvar');
  assert.ok(s.w.document.querySelector('#vbImport'), 'import fran JSON-fil ar lokal och far finnas kvar');
  s.w.VyraBackup.injectSettings();
  assert.equal(s.w.document.querySelectorAll('.vb-settings').length, 1, 'raden ritas en gang');
  s.close();
});

test('webben: import visar antal widgets och rör inte /api/state*', async () => {
  const s = studio({ url: WEB });
  const file = new s.w.File([JSON.stringify({ widgets: [{ id: 'x' }, { id: 'y' }] })], 'layout.json', { type: 'application/json' });
  s.w.VyraBackup.importFile(file);
  await flush();
  assert.deepEqual(s.toasts, ['2 widgets importerades']);
  assert.equal(s.restored.length, 1);
  assert.deepEqual(stateCalls(s.calls), []);
  s.close();
});

test('import: en misslyckad aterstallning syns som toast, inte som tyst avvisat lofte', async () => {
  const s = studio({ url: WEB, restoreOk: false });
  const file = new s.w.File([JSON.stringify({ widgets: [{ id: 'x' }] })], 'layout.json');
  s.w.VyraBackup.importFile(file);
  await flush();
  assert.equal(s.toasts.length, 1);
  assert.match(s.toasts[0], /kunde inte aterstallas/);
  s.close();
});

// ---- Desktop (dagens beteende) ----------------------------------------------------------------
for (const localSession of [false, true]) {
  test(`Desktop (isLocalSession()=${localSession}): loop och uppstartssynk finns kvar`, async () => {
    const s = studio({ url: DESKTOP, localSession, respond: () => json({ ok: true }) });
    await flush();
    assert.equal(s.intervals.length, 1, 'Desktop ska fortfarande säkerhetskopiera');
    assert.ok(s.calls.some(c => c.url === '/api/state' && c.method === 'POST'), 'uppstartssynken ska gå');
    s.w.VyraBackup.injectSettings();
    assert.ok(s.w.document.querySelector('#openBackupManager'), 'Desktop har kvar Hantera backup');
    s.close();
  });
}

test('Desktop: restore visar antal widgets, inte [object Promise]', async () => {
  const s = studio({
    url: DESKTOP,
    respond: (u, o) => u.startsWith('/api/state/version?id=') ? json({ widgets: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }) : json({ ok: true })
  });
  await flush();
  s.toasts.length = 0;
  await s.w.VyraBackup.restore('123');
  assert.ok(s.toasts.includes('3 widgets återställdes'), JSON.stringify(s.toasts));
  assert.ok(!s.toasts.some(t => t.includes('[object Promise]')));
  s.close();
});

test('Desktop: versionslistan skiljer "finns inte här" från "servern svarar inte"', async () => {
  const off = studio({ url: DESKTOP });                                        // fetch kastar
  await off.w.VyraBackup.openManager();
  assert.match(off.w.document.querySelector('#vbVersions').textContent, /svarar inte/);
  off.close();
  const gone = studio({ url: DESKTOP, respond: () => json({ ok: false }, 404) });
  await gone.w.VyraBackup.openManager();
  const text = gone.w.document.querySelector('#vbVersions').textContent;
  assert.match(text, /finns bara i VYRA Desktop/);
  assert.doesNotMatch(text, /svarar inte/);
  gone.close();
});
