'use strict';
// PANELRAMEN ÄR EN NO-OP FÖR MODELLER UTAN REGISTERPOST (PR 1 i panelspecifikationen).
//
// Spec 0.2: "En modell som inte har någon post i registret får exakt dagens panel." Provet laddar
// studion två gånger — en gång med ramen och registret blockerade i nätet, en gång som vanligt — och
// kräver att egenskapspanelens DOM är tecken för tecken densamma för en modell per familj.
//
// Sedan PR 4 har Top Gift · Design 1–3 och Signal Orbit poster (vyra-topgift-panel.js), och sedan
// PR 5 alla elva Last-X (vyra-lastx-panel.js). Familjens
// representant är därför den första katalognyckeln vars modell SAKNAR post; en typ där alla modeller
// har post (Top Gift) provas i stället av panel-krav.browser.test.js.
//
// FAMILJERNA RÄKNAS FRAM UR KATALOGEN, inte ur en handskriven lista: varje katalognyckel i
// docs/katalogkarta.md byggs med fabriken, och den första nyckeln per widgettyp får representera
// sin familj. En ny familj ärver därmed provet utan att någon behöver minnas det.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const { kravNycklar } = require('../helpers/katalognycklar.js');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));
const vm = require('vm');

// Registret med familjernas poster, utan webbläsare: samma två filer som studio.html laddar.
function registret() {
  const window = {};
  const kod = ['vyra-panelregister.js', 'vyra-topgift-panel.js', 'vyra-lastx-panel.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  vm.runInNewContext(kod, { window });
  return window.VyraPanelregister;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

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

// En nyckel per widgettyp, i katalogens ordning — den första vars modell saknar registerpost.
function familjer() {
  const R = registret();
  const per = new Map();
  for (const nyckel of kravNycklar()) {
    let w;
    try { w = VyraWidgets.create(nyckel); } catch (_) { continue; }
    if (!w || !w.type || per.has(w.type) || R.hitta(w)) continue;
    per.set(w.type, nyckel);
  }
  return [...per.entries()].map(([typ, nyckel]) => ({ typ, nyckel }));
}

let server, browser, bas;
const skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// Laddar studion och fotograferar panelen för varje familj i samma sida. Med `utanRam` blockeras
// ramen, registret och familjernas poster i nätet, så att sidan är exakt den som fanns före PR 1.
async function panelerna(lista, { utanRam }) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
  try {
    if (utanRam) await page.route(/\/vyra-(panelram|panelregister|topgift-panel|lastx-panel)\.js/, r => r.abort());
    await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null, { timeout: 30000, polling: 100 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
    await page.waitForTimeout(400);

    const lage = await page.evaluate(() => ({
      ram: typeof window.VyraPanelram, register: typeof window.VyraPanelregister,
      poster: window.VyraPanelregister ? window.VyraPanelregister.poster().length : null,
    }));

    const ut = {};
    for (const { typ, nyckel } of lista) {
      await page.evaluate(n => {
        state.widgets.length = 0;
        const w = window.VyraWidgets.create(n);
        w.id = 'panelram-noop'; w.x = 200; w.y = 200;
        state.widgets.push(w);
        selected = w.id;
        render();
      }, nyckel);
      await page.waitForTimeout(500);
      ut[typ] = await page.evaluate(() => {
        const p = document.querySelector('.properties');
        return p ? p.outerHTML : null;
      });
    }
    return { lage, ut };
  } finally {
    await page.close();
  }
}

test('panelens DOM är identisk med och utan ramen, en modell per familj', { skip, timeout: 600000 }, async () => {
  const lista = familjer();
  assert.ok(lista.length >= 20, `bara ${lista.length} familjer räknades fram ur katalogen`);

  const utan = await panelerna(lista, { utanRam: true });
  const med = await panelerna(lista, { utanRam: false });

  // Kontrollmätning: blockeringen fungerade, och ramen var verkligen laddad i den andra körningen.
  assert.equal(utan.lage.ram, 'undefined', 'ramen laddades trots blockeringen');
  assert.equal(med.lage.ram, 'object', 'vyra-panelram.js laddades inte i studion');
  assert.equal(med.lage.register, 'object', 'vyra-panelregister.js laddades inte i studion');
  assert.equal(med.lage.poster, registret().poster().length, 'studion har samma poster som registerfilerna');

  const olika = [], tomma = [];
  for (const { typ, nyckel } of lista) {
    const a = utan.ut[typ], b = med.ut[typ];
    if (!a || !b) { tomma.push(`${typ} (${nyckel})`); continue; }
    if (a !== b) {
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      olika.push(`${typ} (${nyckel}) skiljer vid tecken ${i}:\n      utan: …${a.slice(Math.max(0, i - 80), i + 120)}\n      med:  …${b.slice(Math.max(0, i - 80), i + 120)}`);
    }
    assert.ok(!/data-panelram/.test(b), `${typ}: ramen satte ett attribut trots att modellen saknar post`);
  }
  assert.deepEqual(tomma, [], 'panelen byggdes inte för dessa familjer');
  assert.deepEqual(olika, [], `ramen ändrade panelen:\n  - ${olika.join('\n  - ')}`);
});
