'use strict';
// EN OMRITNING MEDAN NOLLNINGEN PÅGÅR FÅR INTE LÄMNA DEMODATA I OBS.
//
// Hittat 2026-09-27 i svepet över hela katalogen (bilder inne vs laddade): i en körning av sex
// stod Battle MVP kvar med "TestAlpha" och 1500 i OBS-läget i över tre sekunder, och krympte
// sedan 24 px när namnet väl nollades. live-zero-state.js vaktar sina egna skrivningar med en
// `writing`-flagga som släpps först i nästa setTimeout. En render() som landade i det fönstret
// väckte observatören medan flaggan var satt — och mutationen KASTADES, inte sköts upp. Ingen
// ny mutation kom, så demodatan stod kvar tills något annat råkade ändra sidan.
//
// Provet framkallar fönstret med flit: två render() direkt efter varandra, den andra medan
// nollningen från den första fortfarande håller flaggan.
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

test('Battle MVP nollas även när render() landar mitt i en nollning', { skip, timeout: 90000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const fel = []; page.on('pageerror', e => fel.push(e.message));
  try {
    await page.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraWidgets && !!window.VyraSessionState, null, { timeout: 30000, polling: 100 });
    await page.waitForTimeout(1500);
    const namn = await page.evaluate(async () => {
      await VyraSessionState.projectLocalSession(); window.toast = () => {};
      state.widgets.length = 0;
      const w = VyraWidgets.create('catalog:battlemvp:aurora'); w.x = 40; w.y = 30;
      state.widgets.push(w); selected = null;
      const vila = () => new Promise(r => setTimeout(r, 200));
      const ut = [];
      for (let varv = 0; varv < 5; varv++) {
        render();
        await Promise.resolve(); await Promise.resolve();   // observatören nollar, flaggan är satt
        render();                                            // ... och här ritas demodatan tillbaka
        await vila();
        ut.push(document.querySelector(`.widget[data-id="${w.id}"] .mvp-copy h2`).textContent);
      }
      return ut;
    });
    assert.deepEqual(namn, ['', '', '', '', ''], `demonamnet stod kvar i OBS efter en omritning: ${JSON.stringify(namn)}`);
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});
