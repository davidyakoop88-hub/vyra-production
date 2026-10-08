'use strict';
// TOP POINTS I RIKTIG WEBBLASARE — DET HAR PROVET FINNS FOR ATT jsdom-PROVET INTE RACKTE.
//
// tests/toppoints-v2.test.js var gront medan widgeten var trasig i produktion. Det laser HTML och
// CSS som TEXT, och kan darfor inte se vilken regel som VINNER. Uppmatt 2026-09-21 i riktig
// Chromium, tva fel i rad som bada var osynliga for kallkodsprovet:
//
//   1. SPECIFICITET. Widgeten bar `vyra-toplike` (livedata hittas via `.vyra-toplike[data-id]`),
//      sa approved-rankings.js klammer in `skin-clean-bar` (okand skin -> clean-bar). Det tandde
//      toplike-studio.css `.widget.vyra-toplike.skin-clean-bar .toplike-row` (0,4,0), som slog
//      mina `html body .widget.vyra-toppoints-new ...` (0,3,2) TROTS !important. Raden ritades som
//      clean-bars rutnat: display blev `grid`, inte `flex`, och bakgrunden en gradient.
//      Grannregeln `... .toplike-row > span:not(.pro-avatar)` ar (0,5,1) och stal dessutom
//      bredden med `width:100%!important` — en deklaration utan !important forlorar mot en med,
//      oavsett specificitet.
//   2. FARGEN. Riggen skapar widgeten med `VyraWidgets.create(nyckel)` rakt ur fabriken och kor
//      aldrig katalogknappens handler. Fabrikens generiska lila `accent` vann darfor over
//      designens egen, och podiets trappsteg och neons brickor blev lila.
//
// Provet mater alltsa BERAKNADE varden, inte kallkod: vad webblasaren faktiskt kom fram till.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const { ALERTS } = require('../helpers/katalognycklar.js');
const V = require('../helpers/visuell.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp' };

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

const NYCKEL = d => 'catalog:ranking:templateTopPoints:' + d;
// Top Points fyra egna designer PENSIONERADES 2026-09-24 (Davids beslut, docs/ranking-gallringen.md).
// Filen matte tidigare deras berakade geometri; nu mater den att ingen av dem kommer tillbaka: en
// widget ur en gammal nyckel ritas som sin ersattare, utan den gamla designens klasser och struktur.
const ERSATTARE = { clean: 'voltage', center: 'prism-horizontal', podium: 'prism-horizontal', neon: 'voltage' };

let browser, server, sida;
const skip = hoppaOver();

// ⚠️ `before(fn, options)`, inte tvartom — med optionsobjektet forst kor hooken ALDRIG och hela
// filen blir gron pa ingenting (uppmatt 2026-09-03, star i tests/helpers/webblasare.js).
test.before(async () => {
  if (skip) return;
  server = await servera();
  const bas = `http://127.0.0.1:${server.address().port}`;
  browser = await startaWebblasare();
  sida = await browser.newPage({ viewport: V.VIEWPORT });
  await sida.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  await sida.waitForFunction(() => document.documentElement.classList.contains('overlay-output'),
    null, { timeout: 30000, polling: 100 });
  await sida.waitForFunction(() => typeof window.render === 'function', null, { timeout: 30000, polling: 100 });
  await sida.waitForTimeout(2500);
  await sida.evaluate(V.RIGG);
}, { timeout: 120000 });

test.after(async () => {
  if (browser) await browser.close().catch(() => {});
  if (server) await new Promise(r => server.close(r));
});

async function matUpp(design) {
  const byggd = await sida.evaluate(k => window.__visBygg(k), NYCKEL(design));
  if (byggd.fel) return { fel: byggd.fel };
  return sida.evaluate(() => {
    const el = document.querySelector('.vyra-templatetoppoints[data-id]');
    if (!el) return { fanns: false };
    return {
      fanns: true,
      rk6: el.dataset.rk6 || null,
      klasser: [...el.classList],
      gammalStruktur: el.querySelectorAll('.tp-chip, .tp-portratt, .tp-podium-steg, .tp-glod').length,
      rader: el.querySelectorAll('.toplike-row').length,
      ramar: el.querySelectorAll('.toplike-row .rk6-ring').length
    };
  });
}

test('de fyra pensionerade Top Points-designerna ritas som sina ersattare — aldrig som de gamla', { skip, timeout: 180000 }, async () => {
  for (const [gammal, ny] of Object.entries(ERSATTARE)) {
    const m = await matUpp(gammal);
    assert.ok(!m.fel, `${gammal}: ${m.fel}`);
    assert.ok(m.fanns, `${gammal}: widgeten renderades inte alls`);
    assert.equal(m.rk6, ny, `${gammal} ritades som ${m.rk6}, inte ${ny}`);
    assert.deepEqual(m.klasser.filter(c => /^toppoints-|^vyra-toppoints-new$|^skin-/.test(c)), [],
      `${gammal}: den gamla designens klasser sitter kvar: ${m.klasser.join(' ')}`);
    assert.equal(m.gammalStruktur, 0, `${gammal}: den gamla designens noder (tp-chip/tp-podium-steg/tp-glod) ritas fortfarande`);
    assert.equal(m.ramar, m.rader, `${gammal}: varje rad ska ha den nya designens ram`);
  }
});
