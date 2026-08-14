'use strict';
// Goal-modell 3 ("Minimal Glow") ar ritad som ENKOLUMNS i studio.css:213 —
// `grid-template-columns:1fr!important`, ikonen `display:none`, sparet medvetet
// `grid-column:1!important`. Den har alltsa INGEN ikonkolumn att ligga bredvid.
//
// PR #183 gjorde den tvakolumns med tva regler i premium-final.css:
//   1. `.social-goal.premium-goal.goal-landscape{grid-template-columns:auto 1fr!important}`
//      (0-3-0) slar `.goal-3{...1fr!important}` (0-1-0) — bada ar !important, sa det
//      avgors pa specificitet.
//   2. `.premium-goal>.goal-copy{grid-column:2}` skapar en IMPLICIT kolumn 2 aven om
//      mallen sätts tillbaka till 1fr. Darfor racker det inte att laga bara den forsta.
// Sparet, last till kolumn 1, kladdes darmed fran 404 px till 54 px.
//
// VARFOR DET SLAPP IGENOM: goal-geometri.browser.test.js loopar over modell 1, 2 och 4.
// Undantaget for modell 3 ardes fran en tid da modellen var oskadd. Alla sju CI-jobb var
// grona medan sparet var 54 px brett.
//
// Provet mater BREDD, inte kolumnnummer: modell 3:s spar SKA ligga i kolumn 1 — det ar
// dess design — men det ska spanna widgetens innehallsbredd.
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
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

async function matModell3(kind) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);

  const matt = await page.evaluate(k => {
    const w = window.VyraWidgets.create(`catalog:socialgoal:${k}:3:landscape`);
    w.x = 20; w.y = 20;
    state.widgets.length = 0; state.widgets.push(w);
    render();
    const rot = document.querySelector(`[data-id="${w.id}"]`);
    if (!rot) return { fel: 'widgeten renderades inte' };
    const spar = rot.querySelector('.goal-track');
    if (!spar) return { fel: '.goal-track saknas' };
    const cs = getComputedStyle(rot);
    const rr = rot.getBoundingClientRect(), sr = spar.getBoundingClientRect();
    const vadd = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    return {
      rotBredd: rr.width, innehallsbredd: rr.width - vadd, sparBredd: sr.width,
      kolumner: cs.gridTemplateColumns,
      antalKolumner: cs.gridTemplateColumns.trim().split(/\s+/).length
    };
  }, kind);
  await page.close();
  return matt;
}

for (const kind of ['followers', 'likes']) {
  test(`Goal-modell 3 (${kind}): sparet spanner widgetens bredd, inte en klamd kolumn`, { skip }, async () => {
    const m = await matModell3(kind);
    assert.ok(!m.fel, m.fel);
    assert.ok(m.sparBredd >= m.innehallsbredd * 0.9,
      `sparet ar ${Math.round(m.sparBredd)} px mot en innehallsbredd pa `
      + `${Math.round(m.innehallsbredd)} px — det har klamts in i en kolumn `
      + `(grid-template-columns: ${m.kolumner})`);
  });

  test(`Goal-modell 3 (${kind}): behaller sitt enkolumnsgrid`, { skip }, async () => {
    const m = await matModell3(kind);
    assert.ok(!m.fel, m.fel);
    assert.equal(m.antalKolumner, 1,
      `modell 3 ar ritad enkolumns men fick ${m.antalKolumner} kolumner `
      + `(${m.kolumner}) — nagon regel med hogre specificitet har skrivit over `
      + '`.goal-3{grid-template-columns:1fr!important}`');
  });
}
