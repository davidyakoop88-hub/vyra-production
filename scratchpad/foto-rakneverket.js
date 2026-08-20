'use strict';
// Deterministiska fasfoton for Rakneverket (number) (arbetsgangens steg 7).
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const { startaWebblasare } = require(path.join(ROOT, 'tests', 'helpers', 'webblasare.js'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.json': 'application/json' };
function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}
(async () => {
  const browser = await startaWebblasare();
  const server = await servera();
  const bas = `http://127.0.0.1:${server.address().port}`;
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:gifterlevel:number');
    Object.assign(w, { x: 40, y: 40, width: 300 });
    state.widgets.push(w); selected = null; render();
  });
  await page.waitForTimeout(600);
  const klipp = { x: 240, y: 80, width: 560, height: 560 };
  // Stanna klockan mitt i varje fas: pausa alla animationer vid fototillfallet.
  // ETT utspel, fyra tidsatta foton — senare triggrar hamnar i alertkons slot-tid och spelar
  // inte pa minuter; sekvensen ar 1280 ms och fotona tas i flykten.
  await page.evaluate(() => window.triggerGifterLevelUp({ __test: true, level: 12, fromLevel: 11, name: 'Rakneverket', username: 'prov' }));
  const foton = [['fas1-ratt', 240], ['fas2-fore-bytet', 700], ['fas2-efter-bytet', 1120], ['fas3-avlasning', 1520]];
  let forra = 0;
  for (const [namn, vid] of foton) {
    await page.waitForTimeout(vid - forra); forra = vid;
    await page.screenshot({ path: path.join(__dirname, 'rakneverket-' + namn + '.png'), clip: klipp });
  }
  console.log('foton klara');
  await page.close(); await browser.close();
  await new Promise(r => server.close(r));
})();
