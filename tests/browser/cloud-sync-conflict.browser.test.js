'use strict';
// Synkkonflikt-banderollen kan tystas utan att konflikten losts. Uppmatt i produktion 2026-08-09
// (tech-debt.md sektion 5): efter klicket pa "Den har datorn" hade servern kvar 4 widgets i
// stallet for valda 5, VyraCloudSync.status() sa 'conflict' — men ingen banderoll fanns.
//
// Kedjan bakom: push() (cloud-sync.js:63) returnerar {ok:false,status:409} UTAN att kasta nar
// servern svarar 409 igen. Knapphanteraren i showConflict() (cloud-sync.js:74) kor
// `await push();await apply(payload());bar.remove()` i ett try-block, sa kedjan fortsatter forbi
// den misslyckade pushen och tar bort banderollen anda. Dubbelfelet: 409-vagen i push() forsoker
// visa en NY banderoll, men showConflict()-vakten `if(document.querySelector('.cs-conflict'))return`
// ser den gamla — som annu ar kvar i DOM i det ogonblicket — och undertrycker den nya. Strax darpa
// tas den gamla bort. Tyst permanent konflikt: anvandarens val nar aldrig servern.
//
// Varfor riktig webblasare: pastaendet som ljog ar vad anvandaren SER — banderollens narvaro i
// DOM efter en riktig klickkedja. Repo-regeln efter fyra falskt-grona prov ar att UI-pastaenden
// bevisas i riktig Chrome, inte i en rigg som anropar hanterare direkt. Och banderollens franvaro
// ensam racker inte som matt — den var exakt det som ljog — darfor mater proven OCKSA vad servern
// faktiskt tagit emot.
//
// Det ar den AKTA cloud-sync.js som laddas over http fran repotroten. Bara natverket (VyraAuth.api,
// samma felform som auth-client.js:7: kastat Error med .status) och sessionsmaskineriet ar stubbat.
//
// ROTT NU: prov 1 och 2. Prov 3 och 4 ar kontroller som ska sta grona bade fore och efter fixen.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');

let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

async function startaWebblasare() {
  for (const channel of ['chrome', 'msedge', 'chromium']) {
    try { return await chromium.launch({ channel }) } catch (_) {}
  }
  try { return await chromium.launch() } catch (_) {}
  return null;
}

let server, browser, bas;
let skip = chromium ? false : 'playwright-core saknas — kor `npm i` (hoppar, faller inte)';

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) { skip = 'ingen Chrome/Edge/Chromium hittades pa maskinen (hoppar, faller inte)'; return }
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

const WS = 'ws1', OV = 'ov1';
// 5 lokala mot 4 pa servern — samma siffror som produktionsfallet, sa ett fel i provet inte kan
// forvaxla riktningarna.
const LOKALA = ['w-lokal-1', 'w-lokal-2', 'w-lokal-3', 'w-lokal-4', 'w-lokal-5'];
const SERVERNS = ['w-server-1', 'w-server-2', 'w-server-3', 'w-server-4'];

// Harnesset satter upp konfliktlaget INNAN cloud-sync.js laddas: lokal state med osynkat arbete
// (vyra-state skiljer sig fran meta.lastLocal) och en meta-version bakom serverns. Da valjer
// initialize() konfliktgrenen och ritar banderollen — samma vag som i produktion, inget direkt-
// anrop av showConflict().
//
// antal409 styr servern: de forsta N PUT:arna svarar 409 (kastat fel med .status, samma form som
// auth-client.js), darefter accepteras skrivningen och registreras i __server.mottagna. Det ar
// mottagna-listan som ar sanningen om vad servern fatt — inte nagot UI-tillstand.
function harness(antal409) {
  return `<!doctype html><meta charset="utf-8"><title>cs-konflikt-prov</title><body>
<script>
  const CFG = { ws: '${WS}', ov: '${OV}', antal409: ${antal409},
    lokala: ${JSON.stringify(LOKALA)}, serverns: ${JSON.stringify(SERVERNS)} };
  localStorage.clear();
  localStorage.setItem('vyra-state', JSON.stringify({ widgets: CFG.lokala.map(id => ({ id })) }));
  localStorage.setItem('vyra-cloud-sync-meta:' + CFG.ws, JSON.stringify({
    workspaceId: CFG.ws, overlayId: CFG.ov, version: 1, updatedAt: '',
    lastLocal: '{"widgets":[{"id":"nagot-osynkat"}]}'
  }));
  window.__server = { version: 2, state: { widgets: CFG.serverns.map(id => ({ id })) },
    puts: 0, mottagna: [] };
  window.VyraSessionState = {
    canPush: () => true, canQueue: () => true,
    beginProjection: () => ({}),
    projectActive: async (_t, o) => {
      localStorage.setItem('vyra-state', JSON.stringify(o.state)); return { ok: true };
    },
    projectLocalSession: async () => ({ ok: true }),
    registerTeardown: () => {}
  };
  window.VyraAuth = {
    lastDetail: () => null,
    api: async (p, options = {}) => {
      const s = window.__server;
      if (options.method === 'PUT') {
        s.puts += 1;
        if (s.puts <= CFG.antal409)
          throw Object.assign(new Error('Versionen har andrats'), { status: 409 });
        const body = JSON.parse(options.body);
        s.state = body.state; s.version += 1;
        s.mottagna.push(body.state.widgets.map(w => w.id));
        return { overlay: { id: CFG.ov, name: 'x', version: s.version, state: s.state } };
      }
      if (p.endsWith('/overlays/' + CFG.ov))
        return { overlay: { id: CFG.ov, name: 'x', version: s.version, state: s.state } };
      return { overlays: [{ id: CFG.ov, name: 'x', version: s.version }] };
    }
  };
<\/script>
<script src="/cloud-sync.js"><\/script>`;
}

async function oppnaKonflikt(antal409) {
  const page = await browser.newPage();
  await page.route('**/prov-cs-konflikt.html', r =>
    r.fulfill({ contentType: 'text/html', body: harness(antal409) }));
  await page.goto(`${bas}/prov-cs-konflikt.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.VyraCloudSync, null, { timeout: 20000 });
  await page.evaluate(ws => window.VyraCloudSync.initialize({ workspaces: [{ id: ws }] }), WS);
  await page.waitForSelector('.cs-conflict', { timeout: 5000 });
  return page;
}

// Klickkedjan ar asynkron och exponerar inget slut. PUT-raknaren sager nar servern svarat; de
// 500 ms darefter later resten av kedjan (apply, bar.remove) hinna kora klart, sa att "banderollen
// star kvar" inte gar gront bara for att matningen hann fore borttagningen.
async function klickaOchVanta(page, knapp, minstPuts) {
  await page.click(`.cs-conflict [data-cs-${knapp}]`);
  if (minstPuts > 0)
    await page.waitForFunction(n => window.__server.puts >= n, minstPuts, { timeout: 5000 });
  await page.waitForTimeout(500);
}

const laget = page => page.evaluate(ws => ({
  banderoll: !!document.querySelector('.cs-conflict'),
  status: window.VyraCloudSync.status(),
  ko: localStorage.getItem('vyra-cloud-sync-queue:' + ws) != null,
  puts: window.__server.puts,
  mottagna: window.__server.mottagna,
}), WS);

// ---- Prov 1 · dubbel-409 ---------------------------------------------------------------------
test('409 pa nytt vid "Den har datorn": banderollen star kvar sa lange konflikten ar olost',
  { skip, timeout: 90000 }, async () => {
    const page = await oppnaKonflikt(99);
    try {
      await klickaOchVanta(page, 'local', 1);
      const l = await laget(page);

      assert.equal(l.puts, 1, `servern fick ${l.puts} PUT — scenariot kraver exakt en, som far 409`);
      assert.deepEqual(l.mottagna, [], 'servern far inte ha tagit emot nagot — varje PUT ger 409 har');
      assert.equal(l.status, 'conflict', 'status ska sta kvar pa conflict nar valet inte natt servern');
      assert.equal(l.banderoll, true,
        'banderollen togs bort trots att pushen fick 409 — status ar conflict, kon ligger kvar, ' +
        'men anvandaren ser ingenting och tror att valet sparats. Det ar exakt produktionslognen ' +
        'fran 2026-08-09: tyst permanent konflikt');
    } finally { await page.close() }
  });

// ---- Prov 2 · valet nar servern nar konflikten slapper ---------------------------------------
test('409 forsta klicket, ok andra: valet nar servern och forst DA forsvinner banderollen',
  { skip, timeout: 90000 }, async () => {
    const page = await oppnaKonflikt(1);
    try {
      await klickaOchVanta(page, 'local', 1);
      let l = await laget(page);
      assert.equal(l.banderoll, true,
        'forsta klicket fick 409 — banderollen maste sta kvar sa att anvandaren KAN klicka igen; ' +
        'tas den bort finns ingen vag alls till servern langre');

      await klickaOchVanta(page, 'local', 2);
      l = await laget(page);
      assert.deepEqual(l.mottagna, [LOKALA],
        'servern ska ha tagit emot exakt den valda lokala versionen — banderollens franvaro ensam ' +
        'ar inte bevis, det var den som ljog');
      assert.equal(l.status, 'synced', `status blev "${l.status}" — valet ar nu pa servern`);
      assert.equal(l.ko, false, 'kon ska vara tomd nar pushen lyckats');
      assert.equal(l.banderoll, false, 'lost konflikt ska ta bort banderollen');
    } finally { await page.close() }
  });

// ---- Prov 3 · kontroll: rak lyckad push ------------------------------------------------------
test('accepterar servern direkt loses konflikten pa ett klick — far inte regrediera av fixen',
  { skip, timeout: 90000 }, async () => {
    const page = await oppnaKonflikt(0);
    try {
      await klickaOchVanta(page, 'local', 1);
      const l = await laget(page);

      assert.deepEqual(l.mottagna, [LOKALA], 'servern ska ha den valda lokala versionen');
      assert.equal(l.status, 'synced', `status blev "${l.status}"`);
      assert.equal(l.ko, false, 'ingen ko ska ligga kvar');
      assert.equal(l.banderoll, false, 'banderollen ska bort nar konflikten faktiskt ar lost');
    } finally { await page.close() }
  });

// ---- Prov 4 · kontroll: Online-knappens motsvarande kedja ------------------------------------
// Online delar INTE felet: dess apply() KASTAR vid ogiltigt svar, sa catch-grenen behaller
// banderollen. Provet ligger har som vakt sa att den kedjan inte tyst far samma icke-kastande
// form som push() en dag.
test('Online-knappen: molnets version appliceras lokalt och banderollen forsvinner',
  { skip, timeout: 90000 }, async () => {
    const page = await oppnaKonflikt(0);
    try {
      await klickaOchVanta(page, 'online', 0);
      await page.waitForFunction(() => window.VyraCloudSync.status() === 'synced', null,
        { timeout: 5000 });
      const l = await laget(page);
      const lokalt = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('vyra-state')).widgets.map(w => w.id));

      assert.equal(l.puts, 0, 'Online skriver ingenting till servern');
      assert.deepEqual(lokalt, SERVERNS, 'molnets layout ska ha projicerats in lokalt');
      assert.equal(l.ko, false, 'kon ska vara rensad');
      assert.equal(l.banderoll, false, 'lost konflikt ska ta bort banderollen');
    } finally { await page.close() }
  });
