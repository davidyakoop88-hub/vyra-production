'use strict';
// OVERLAYEN SKA FYLLA KALLRUTAN - det Studion visar ar det TikTok/OBS visar.
//
// UPPMATT I PRODUKTION 2026-09-20 med Davids riktiga overlaylank i en 1080x1920-vy:
//
//   .canvas   432x768 pa (0,0)   transform: none
//
// Duken lag oskalad i ovre vanstra hornet av TikTok LIVE Studios ruta - 40 % av bredden, resten
// tomt. media.js:s fitOverlayCanvas() skalar och centrerar, men layout-safe.js laddas efter,
// lindar render() utanpa och byter ut hela #view med en NY .canvas - efter skalningen. Varje
// render() forlorade passformen. Davids ord: "den rutan du visar mig i layout i webben ska passa
// in i tiktok studio".
//
// Provet mater det TikTok ser: dukens rekt i viewporten, i riktig Chromium, via ?overlay=1.
// Ett prov som laste canvas.style.transform hade varit gront aven om en senare omritning bytt
// ut noden igen.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

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

let server, browser, bas;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// Dukens rekt i viewporten efter att overlayen ritats, plus en extra render() - den vag som
// tappade passformen i produktion.
async function duken(vy) {
  const context = await browser.newContext({ viewport: vy });
  const page = await context.newPage();
  try {
    await page.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('.canvas') &&
      document.documentElement.classList.contains('overlay-output'), null, { timeout: 20000 });
    await page.waitForTimeout(600);
    return await page.evaluate(() => {
      const las = () => {
        const r = document.querySelector('.canvas').getBoundingClientRect();
        return { left: Math.round(r.left), top: Math.round(r.top), bredd: Math.round(r.width), hojd: Math.round(r.height) };
      };
      const fore = las();
      render();                       // layout-safe.js byter ut #view har
      const efter = las();
      return { fore, efter, vy: [innerWidth, innerHeight] };
    });
  } finally { await context.close() }
}

test('i en 9:16-ruta (TikTok 1080x1920) fyller duken hela rutan - och overlever en render()', { skip, timeout: 90000 }, async () => {
  const m = await duken({ width: 1080, height: 1920 });
  assert.deepEqual(m.fore, { left: 0, top: 0, bredd: 1080, hojd: 1920 }, `fore render: ${JSON.stringify(m.fore)}`);
  assert.deepEqual(m.efter, { left: 0, top: 0, bredd: 1080, hojd: 1920 },
    `efter render(): ${JSON.stringify(m.efter)} - layout-safe.js bytte ut duken utan att passa in den igen`);
});

test('i en 16:9-ruta centreras duken och behaller 9:16', { skip, timeout: 90000 }, async () => {
  // OBS-scen pa 1920x1080: skalan ar min(1920/432, 1080/768) = 1,406 -> 608x1080, centrerad.
  const m = await duken({ width: 1920, height: 1080 });
  for (const [namn, r] of [['fore', m.fore], ['efter', m.efter]]) {
    assert.equal(r.hojd, 1080, `${namn}: hojden ska fylla rutan, blev ${r.hojd}`);
    assert.ok(Math.abs(r.bredd - 608) <= 1, `${namn}: bredden ska vara 608 (432 x 1,406), blev ${r.bredd}`);
    assert.ok(Math.abs(r.left - 656) <= 1, `${namn}: ska vara centrerad pa x=656, blev ${r.left}`);
    assert.equal(r.top, 0, `${namn}: top`);
  }
});

test('duken ar aldrig oskalad 432x768 i en storre ruta', { skip, timeout: 90000 }, async () => {
  // Exakt det tillstand som uppmattes i produktion. Gront har = felet kan inte komma tillbaka
  // utan att synas.
  const m = await duken({ width: 720, height: 1280 });
  assert.notDeepEqual(m.efter, { left: 0, top: 0, bredd: 432, hojd: 768 }, 'duken star oskalad i hornet igen');
  assert.deepEqual(m.efter, { left: 0, top: 0, bredd: 720, hojd: 1280 });
});
