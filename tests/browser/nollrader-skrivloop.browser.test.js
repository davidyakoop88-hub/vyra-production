'use strict';
// EN TOM TOPPLISTA SKA STA STILL, INTE SKRIVA OM SIG SJALV VARJE SEKUND.
//
// UPPMATT 2026-08-21. `catalog:ranking:templateTopPoints:podium` gav 15 DOM-mutationer pa 3
// sekunder utan att nagot hant pa sidan: fem rader × tre varv, alla samma varde tillbaka.
// Anropsstacken pekade rakt pa live-leaderboard.js:214, som laste ikonen ur elementet och skrev
// `ikon + ' 0'` tillbaka UTAN att jamfora. Att satta textContent byter ut textnoden aven nar
// strangen ar identisk, sa varje varv blev en riktig mutation — som vacker observatorer som
// kallar hit igen.
//
// KOSTNADEN VAR DUBBEL:
//
//   I OBS: fem onodiga DOM-skrivningar i sekunden sa lange overlayn ar uppe, i evighet.
//
//   I den visuella riggen: widgetens text blev ALDRIG tyst. Ett forsok att fotografera "nar sidan
//   star still" slog i sitt tak varje varv och tog sviten fran 25 s till 79 s per prov. Det var
//   ocksa halva forklaringen till att ranking:templateTopPoints flackade i CI — fotot kunde landa
//   fore eller efter en omskrivning.
//
// live-zero-state.js bar redan exakt den har vakten, med kommentaren "Writing the same value back
// still counts as a DOM mutation, which would wake the observer that called us and spin forever".
// Regeln fanns alltsa nedskriven i repot; den galde bara inte har.
//
// Provet mater BETEENDET, inte koden: en kallnara sokning efter `!==` hade blivit gron sa fort
// nagon skrev om raden pa ett annat satt.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');

const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

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

// Overlay-lage med flit: nollstallningen i live-leaderboard.js kors bara dar (VYRA_OVERLAY), och
// det ar ocksa i overlay-vyn katalogen bor och den visuella riggen fotograferar.
async function widgetIOverlay(nyckel) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => typeof window.VyraWidgets !== 'undefined' && typeof render === 'function',
    null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.evaluate(n => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(n);
    w.x = 40; w.y = 30;
    state.widgets.push(w); selected = null; render();
  }, nyckel);
  // Lat forsta nollstallningen ske. Den ska hanga med EN gang — det ar upprepningen som ar felet.
  await page.waitForTimeout(1500);
  return page;
}

const MAT_MUTATIONER = (ms) => new Promise(klar => {
  const box = document.querySelector('[data-id]');
  if (!box) return klar(-1);
  let antal = 0;
  const obs = new MutationObserver(poster => { antal += poster.length });
  obs.observe(box, { childList: true, characterData: true, subtree: true });
  setTimeout(() => { obs.disconnect(); klar(antal) }, ms);
});

for (const nyckel of ['catalog:ranking:templateTopPoints:podium',
                      'catalog:ranking:templateTopPoints:neon']) {
  const kort = nyckel.split(':').pop();
  test(`en tom topplista (${kort}) star still nar ingenting hander`, { skip, timeout: 90000 },
    async () => {
    const page = await widgetIOverlay(nyckel);
    const antal = await page.evaluate(MAT_MUTATIONER, 3000);
    await page.close();
    assert.notEqual(antal, -1, 'ingen widget renderades');
    assert.equal(antal, 0,
      `${antal} DOM-mutationer pa 3 sekunder utan att nagot hant. Nollstallningen skriver samma `
      + 'varde tillbaka i stallet for att lata bli — det ar fem onodiga skrivningar i sekunden i '
      + 'OBS, och det gor widgetens text omojlig att vanta ut i den visuella riggen.');
  });
}
