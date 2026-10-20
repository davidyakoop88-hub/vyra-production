'use strict';
// SPOTIFY-KOMMANDOT OCH DESS FÖRKLARING STÅR PÅ VAR SIN RAD.
//
// Granskningen 2026-10-17 (F24) läste "!songVisa aktuell låt i chatten" och "!skipModeratorer kan
// byta låt". `.music-rules article` hade bara padding: kommandots <b> och förklaringens <small> var
// båda inline och hamnade direkt efter varandra utan mellanrum. YouTube-vyn hade redan lagat samma
// sak för sin egen ruta (`.youtube-card .music-rules b{display:block}`), Spotify aldrig.
//
// Provet mäter i en riktig webbläsare: kommandot ska ligga OVANFÖR förklaringen (egen rad), och
// kommandot ska vara kodstil (<code>, monospace) så att det läses som något man skriver i chatten.
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

test('kommandot står på egen rad, i kodstil, ovanför förklaringen', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  try {
    await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('aside [data-extra="spotify"]'), null,
      { timeout: 30000, polling: 100 });
    await page.waitForTimeout(800);
    await page.click('aside [data-extra="spotify"]');
    await page.waitForFunction(() => document.querySelectorAll('.spotify-card .music-rules article').length >= 2,
      null, { timeout: 15000, polling: 100 });
    const rutor = await page.evaluate(() => [...document.querySelectorAll('.spotify-card .music-rules article')].map(a => {
      const kommando = a.firstElementChild, forklaring = a.querySelector('small');
      const k = kommando.getBoundingClientRect(), f = forklaring.getBoundingClientRect();
      return { text: a.textContent.trim(), tagg: kommando.tagName, typsnitt: getComputedStyle(kommando).fontFamily,
        kommandoBotten: Math.round(k.bottom), forklaringTopp: Math.round(f.top),
        kommandoText: kommando.textContent.trim() };
    }));
    assert.ok(rutor.length >= 3, `hittade ${rutor.length} musikrutor`);
    for (const r of rutor) {
      assert.ok(r.forklaringTopp >= r.kommandoBotten - 1,
        `"${r.text}": förklaringen (topp ${r.forklaringTopp}) ligger på samma rad som kommandot `
        + `(botten ${r.kommandoBotten}) — de läses ihop`);
    }
    for (const r of rutor.filter(x => x.kommandoText.startsWith('!'))) {
      assert.equal(r.tagg, 'CODE', `"${r.kommandoText}" är inte märkt som kod`);
      assert.match(r.typsnitt, /mono|consolas|courier/i, `"${r.kommandoText}" visas inte i monospace (${r.typsnitt})`);
    }
    assert.ok(rutor.some(r => r.kommandoText === '!song') && rutor.some(r => r.kommandoText === '!skip'),
      'chattkommandona !song och !skip ska finnas kvar');
  } finally { await page.close(); }
});
