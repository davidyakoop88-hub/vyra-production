'use strict';
// OBS-LÄNKRADEN FÅR INTE SAMLA PÅ SIG LYSSNARE.
//
// `bind()` körs vid VARJE render. Bindaren för OBS-länkraden (media.js:219) hade en
// dedup-vakt som letade efter `.overlay-link-bar` — men `render()` bygger om skalet,
// så noden är en NY nod varje gång och vakten släppte igenom varje gång.
//
// UPPMÄTT före fixen, med `addEventListener` räknad på window och document:
//
//   1 render    2 på window, 1 på document
//   25 render   50 på window, 25 på document        linjärt, inget tak
//
// Och noden de stängde om: `samma12:false, samma23:false, urkopplad:true, antal:1`.
// Raden var frånkopplad men varje closure höll kvar den, tillsammans med `manage`,
// `target` och `input` ur ett dött DOM-träd.
//
// Det är ingen fara under sändning — `render()` drivs av redigering i studion, inte av
// gåvoflödet (live-client.js, studio-live.js, goal-client.js och action-runtime.js
// anropar den noll gånger). Men en lång redigeringskväll samlar hundratals lyssnare.
//
// PROVET MÄTER TVÅ SAKER, för fixen kan gå sönder åt två håll:
//   1. lyssnarna får inte växa   — annars är läckan tillbaka
//   2. raden måste fortfarande reagera — annars är läckan "löst" genom att ta bort
//      funktionen, vilket inte syns i en ren räkning
//
// Mutationsprovat: med de globala registreringarna återinförda faller punkt 1 på
// 75 lyssnare. Med vidarebefordran borttagen faller punkt 2.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.json': 'application/json', '.woff2': 'font/woff2' };

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
let skip = hoppaOver();          // maste vara let: node:test laser { skip } vid registrering

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

async function studion() {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForFunction(() => !!document.querySelector('.overlay-link-bar'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(600);
  return page;
}

test('OBS-lankraden lagger inga nya lyssnare per render', { skip }, async () => {
  const page = await studion();
  try {
    const r = await page.evaluate(() => {
      const räknare = { window: 0, document: 0 };
      for (const [mål, namn] of [[window, 'window'], [document, 'document']]) {
        const orig = mål.addEventListener.bind(mål);
        mål.addEventListener = function (...a) { räknare[namn]++; return orig(...a); };
      }
      state.widgets.length = 0;
      state.widgets.push({ id: 'l1', type: 'templateTopLike', x: 40, y: 40, width: 460, layer: 1 });
      selected = null;
      for (let i = 0; i < 25; i++) render();
      return { ...räknare, rader: document.querySelectorAll('.overlay-link-bar').length };
    });
    console.log('\n    efter 25 render: ' + r.window + ' pa window, ' + r.document +
                ' pa document, ' + r.rader + ' lankrad(er) i DOM\n');

    assert.equal(r.rader, 1, 'det ska finnas exakt en lankrad, hittade ' + r.rader);
    assert.equal(r.window, 0,
      'raden lade ' + r.window + ' nya window-lyssnare over 25 render - lackan ar tillbaka');
    assert.equal(r.document, 0,
      'raden lade ' + r.document + ' nya document-lyssnare over 25 render - lackan ar tillbaka');
  } finally { await page.close(); }
});

// Utan det har provet gar punkt 1 att "fixa" genom att ta bort funktionen. Raden ska
// fortfarande reagera pa att en saker lank skapats - efter att render() har bytt ut den.
test('raden reagerar fortfarande pa vyra-overlay-access-created efter omrendering', { skip }, async () => {
  const page = await studion();
  try {
    const r = await page.evaluate(async () => {
      state.widgets.length = 0;
      state.widgets.push({ id: 'l1', type: 'templateTopLike', x: 40, y: 40, width: 460, layer: 1 });
      selected = null;
      render(); render();               // raden ar nu en ANNAN nod an vid sidladdning

      const falt = document.querySelector('.overlay-link-bar #overlayLinkValue');
      if (!falt) return { fel: 'hittade ingen lankrad efter omrendering' };
      const innan = falt.value;
      falt.value = 'SKRAP';             // om ingen uppdaterar raden star SKRAP kvar
      dispatchEvent(new CustomEvent('vyra-overlay-access-created'));
      await new Promise(r => setTimeout(r, 50));
      return { innan, efter: document.querySelector('.overlay-link-bar #overlayLinkValue').value };
    });
    if (r.fel) assert.fail(r.fel);
    console.log('    faltet efter omrendering: ' + JSON.stringify(r.efter.slice(0, 48)) + '\n');

    assert.notEqual(r.efter, 'SKRAP',
      'raden reagerade inte pa vyra-overlay-access-created - vidarebefordran ar borta');
    assert.equal(r.efter, r.innan, 'raden skrev nagot annat an lanken: ' + r.efter);
  } finally { await page.close(); }
});
