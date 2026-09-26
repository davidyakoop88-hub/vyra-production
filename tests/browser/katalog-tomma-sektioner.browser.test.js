'use strict';
// INGA TOMMA RAMAR I KATALOGEN.
//
// Uppmätt 2026-09-26 i Davids studio: två sektioner stod som tomma ramar sist i katalogen —
// "VYRA TOP RANKING · VARJE DESIGN SEPARAT" (bara rubriken) och Top Like-sektionen (helt tom).
// Båda är markörer som hålls kvar med flit och sätts `hidden` (approved-rankings.js,
// ranking-sixpack.js), men studio.css gav varje katalogsektion display:flex, och det vann över
// [hidden]. Provet kräver att varje SYNLIG sektion har minst ett kort att klicka på.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp' };
function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''), fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' }); fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}
let server, browser, bas, skip = hoppaOver();
test.before(async () => { if (skip) return; browser = await startaWebblasare(); if (!browser) throw new Error('webblasaren kunde inte starta'); server = await servera(); bas = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });

test('varje synlig katalogsektion har minst ett kort', { skip, timeout: 90000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  try {
    await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState, null, { timeout: 30000, polling: 100 });
    const m = await page.evaluate(async () => {
      await window.VyraSessionState.projectLocalSession();
      // Katalogen byggs av många syskonfiler som laddas i tur och ordning; bygg om tills den står still.
      let forra = -1, n = 0;
      for (let t = 0; t < 40; t++) {
        view = 'overlay'; render(); bind(); await new Promise(r => setTimeout(r, 250));
        n = document.querySelectorAll('.widget-catalog [data-catalog-key]').length;
        if (n > 100 && n === forra) break; forra = n;
      }
      const sektioner = [...document.querySelectorAll('.widget-catalog > *')];
      return {
        kort: n,
        dolda: sektioner.filter(s => s.hidden).length,
        tomma: sektioner.filter(s => s.getBoundingClientRect().height > 0 && !s.querySelector('button, [data-catalog-key]'))
          .map(s => (s.querySelector('h4')?.textContent || '').trim() || `<${s.tagName.toLowerCase()} class="${s.className}">`)
      };
    });
    assert.ok(m.kort > 100, `katalogen byggdes inte (${m.kort} kort)`);
    assert.ok(m.dolda >= 1, 'provet mäter inget: markörerna finns inte längre — skriv om provet');
    assert.deepEqual(m.tomma, [], 'tomma sektioner syns i katalogen');
  } finally { await page.close(); }
});
