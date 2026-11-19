'use strict';
// GOAL PRO TVINGAR INTE FRAM LAYOUT FÖR DOLDA DESIGNER (2026-11-19).
//
// Goal Pro bygger alla nio designer och döljer de som inte är valda med display:none. Varje bildruta skrev text och bredder
// för alla och läste sedan clientWidth/offsetParent på raderna — vilket tvingar webbläsaren att räkna ut hela layouten efter
// skrivningarna. Uppmätt i Chromium med trafik genom VyraLive.ingest: 82 tvingade layouter på 30 händelser, 1 147 ms, och
// i OBS (som har fler widgetar i samma sida) halveras fyrverkeriets bildtakt. Provet räknar läsningar av clientWidth som
// faktiskt kostar en layout (över 3 ms; en cachad eller ren läsning tar under 0,1 ms) och kräver att nästan inga finns.
// Funktionell likhet (alla nio designer ritar samma markörer och staplar som förut) är mätt separat; se checkpoint 58.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };

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

async function oppna(fel, widgets, vald) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fel.push(String(e && e.message || e)));
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraTestspel && !!window.VyraPlayground,
    null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(([lista, vald]) => {
    state.widgets.length = 0;
    lista.forEach(([id, n, pg], i) => {
      const w = window.VyraWidgets.create(n);
      w.id = id; w.x = 10 + (i % 3) * 140; w.y = 40 + Math.floor(i / 3) * 360; w.width = 130;
      if (pg) w.pg = Object.assign({}, w.pg, pg, { x: Object.assign({}, (w.pg || {}).x, pg.x || {}) });
      state.widgets.push(w);
    });
    selected = vald;
    save();
    render();
  }, [widgets, vald]);
  await page.waitForTimeout(1500);
  return page;
}



const LAYOUT = [
  ['tl-a', 'catalog:pggoal:1', { x: { metric: 'coins', target: 2000 } }],
  ['tl-b', 'catalog:pggoal:5', { x: { metric: 'coins', target: 2000 } }],
  ['tl-c', 'catalog:pgpodium:none'],
];
let lopnummer = 0;
const ingest = (page, e) => page.evaluate(e => window.VyraLive.ingest(Object.assign({ at: Date.now() }, e)), { id: 'tl-' + (++lopnummer), ...e });

test('en ström av händelser tvingar inte fram layout via clientWidth i Goal Pro', { skip, timeout: 180000 }, async () => {
  const fel = [];
  const page = await oppna(fel, LAYOUT, 'tl-a');
  try {
    await page.evaluate(() => {
      window.__dyra = 0; window.__alla = 0;
      const d = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
      const g = d.get;
      Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get() {
        const t = performance.now(); const v = g.call(this); const ms = performance.now() - t;
        window.__alla += 1; if (ms > 3) window.__dyra += 1; return v; } });
    });
    for (let i = 0; i < 30; i++) {
      await ingest(page, { type: 'gift', username: 'givare' + (i % 4), giftName: 'Rose', giftId: 'rose', diamonds: 10, coins: 10, count: 2, repeatEnd: true });
      await ingest(page, { type: 'like', username: 'tittare' + (i % 5), count: 4 });
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => ({ dyra: window.__dyra, alla: window.__alla,
      podium: (document.querySelector('.canvas [data-id="tl-c"] .pcol.r1 .nm') || {}).textContent }));
    // Sanity 1: händelserna nådde widgetarna (annars mäter provet ingenting).
    assert.ok(m.podium, 'podiet fick inga händelser');
    // Sanity 2: mätningen ser en läsning. Efter fixen läser Goal Pro nästan aldrig själv (bredden cachas), så antalet läsningar
    // säger ingenting; kontrollen är att en egen läsning räknas.
    const fore = m.alla;
    await page.evaluate(() => document.body.clientWidth);
    assert.ok(await page.evaluate(() => window.__alla) >= fore + 1, 'mätningen ser inte en läsning av clientWidth — blind');
    // Dyra läsningar räknas FÖRE kontrollen: kontrollläsningen får inte räknas som ett fel.
    assert.ok(m.dyra <= 3, `${m.dyra} läsningar av clientWidth kostade en layout (över 3 ms) på 30 händelser (av ${m.alla} läsningar)`);
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally { await page.close(); }
});
