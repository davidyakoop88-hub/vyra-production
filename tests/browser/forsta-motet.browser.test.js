'use strict';
// Stad efter Fas A for forsta-anvandarflodet (Etapp 6A).
//
// Tre fynd ur matrapporten 2026-08-09, alla uppmatta i riktig Chrome mot en helt tom profil:
//
//   1. BRODSMULAN LJUGER I EDITOR-VYN. Uppmatt: view='editor', #title='Layout', aktivt nav='Layout'
//      — och #crumb='VYRA / ÖVERSIKT'. Etapp 1:s fix (PR #149) driver brodsmulan pa KLICK pa
//      [data-view]/[data-extra]. Editorn nas via ?open=layout (snabbstartens egen knapp) och via
//      navets <a href="layout.html">, som ar en helsidesladdning. Inget klick, ingen brodsmula.
//      Det ar den forsta ytan en ny anvandare landar pa.
//
//   2. TVA AV TRE STATUSPILLER AR DEKORATION. Uppmatt i overview-premium.js:
//         <span><i class="${connected ? '' : 'offline'}"></i>${connectionText}</span>
//         <span><i></i>OBS redo</span>
//         <span><i></i>Overlay redo</span>
//      De tva sista ar hardkodade. De lyser gront for varje anvandare, aven en med noll widgets.
//      "Overlay redo" GAR att gora sann — state.widgets finns redan i filen. For OBS finns ingen
//      signal alls (uppmatt: ingen modul exponerar om en lank finns), och da ar ett borttaget
//      pastaende arligare an ett hardkodat.
//
//   3. EGENSKAPSPANELENS TOMMA TILLSTAND SKRIVS IHOP. <strong>Välj en widget</strong><span>Klicka
//      pa…</span> renderas som "Välj en widgetKlicka på en widget…" — bada ar inline utan
//      avskiljare.
//
// ROTT NU: prov 1, 2, 4, 5 och 6. Prov 3 ar en vakt — Oversikts halsning far inte borja lacka in
// i brodsmulan nar den harleds pa ett nytt satt.
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

// Helt tom profil — det ar hela poangen med de har proven.
async function nyAnvandare(sokvag = '/studio.html') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(bas + sokvag, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function', null, { timeout: 20000 });
  await page.evaluate(() => new Promise(r => setTimeout(r, 2200)));
  return { context, page };
}

const LAGE = () => ({
  vy: typeof view !== 'undefined' ? view : '?',
  titel: (document.querySelector('#title')?.textContent || '').trim(),
  brodsmula: (document.querySelector('#crumb')?.textContent || '').trim(),
});

// ---- Prov 1 · brodsmulan i editorn, nadd som snabbstarten gor det ------------------------------
test('brodsmulan foljer editor-vyn nar den nas via ?open=layout', { skip, timeout: 90000 }, async () => {
  const { context, page } = await nyAnvandare('/studio.html?open=layout');
  try {
    const m = await page.evaluate(LAGE);
    assert.equal(m.vy, 'editor', 'kontrollmatning: vi ska sta i editorn');
    assert.equal(m.titel, 'Layout', 'kontrollmatning: titeln ska vara Layout');
    assert.equal(m.brodsmula, 'VYRA / LAYOUT',
      `brodsmulan sager "${m.brodsmula}" pa en sida som heter Layout — det ar den forsta ytan en ` +
      'ny anvandare landar pa via snabbstarten');
  } finally { await context.close() }
});

// ---- Prov 2 · samma sak via navets lank ---------------------------------------------------------
test('brodsmulan foljer editor-vyn nar den nas via layout.html', { skip, timeout: 90000 }, async () => {
  const { context, page } = await nyAnvandare('/layout.html');
  try {
    await page.waitForFunction(() => typeof view !== 'undefined' && view === 'editor',
      null, { timeout: 20000 });
    await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
    const m = await page.evaluate(LAGE);
    assert.equal(m.brodsmula, 'VYRA / LAYOUT',
      `brodsmulan sager "${m.brodsmula}" efter omdirigeringen fran layout.html`);
  } finally { await context.close() }
});

// ---- Prov 3 · vakt: Oversikts halsning far inte lacka in i brodsmulan ---------------------------
test('Oversikt behaller sin brodsmula trots halsningen i titeln', { skip, timeout: 90000 }, async () => {
  const { context, page } = await nyAnvandare();
  try {
    const m = await page.evaluate(LAGE);
    assert.equal(m.vy, 'home', 'kontrollmatning: vi ska sta pa Oversikt');
    assert.match(m.titel, /God (morgon|dag|kväll|natt)/,
      'kontrollmatning: Oversikt visar en halsning, inte sidnamnet');
    assert.equal(m.brodsmula, 'VYRA / ÖVERSIKT',
      `brodsmulan sager "${m.brodsmula}" — halsningen far aldrig bli brodsmula`);
  } finally { await context.close() }
});

// ---- Prov 4 · "Overlay redo" ska spegla verkligheten --------------------------------------------
test('overlay-statusen speglar verkligt widgetantal', { skip, timeout: 90000 }, async () => {
  const { context, page } = await nyAnvandare();
  try {
    const tomt = await page.evaluate(() => {
      const rad = document.querySelector('.live-status');
      return { finns: !!rad, text: (rad?.textContent || '').replace(/\s+/g, ' ').trim(),
        widgets: state.widgets.length };
    });
    assert.equal(tomt.finns, true, 'kontrollmatning: statusraden ska finnas');
    assert.equal(tomt.widgets, 0, 'kontrollmatning: en ny anvandare har noll widgets');
    assert.doesNotMatch(tomt.text, /Overlay redo/,
      `statusraden sager "Overlay redo" med noll widgets: "${tomt.text}"`);

    const fyllt = await page.evaluate(async () => {
      state.widgets = [{ id: 'x1', type: 'templateTopLike', x: 10, y: 10, width: 300 }];
      view = 'home'; render(); if (typeof bind === 'function') bind();
      await new Promise(r => setTimeout(r, 600));
      return (document.querySelector('.live-status')?.textContent || '').replace(/\s+/g, ' ').trim();
    });
    assert.match(fyllt, /Overlay/, 'med en widget ska overlay-statusen namna overlayen');
    assert.notEqual(fyllt, tomt.text,
      'statusen ska ANDRAS med widgetantalet — annars ar den fortfarande dekoration');
  } finally { await context.close() }
});

// ---- Prov 5 · inget pastaende utan signal --------------------------------------------------------
test('ingen hardkodad OBS-status', { skip, timeout: 90000 }, async () => {
  const { context, page } = await nyAnvandare();
  try {
    const m = await page.evaluate(() =>
      (document.querySelector('.live-status')?.textContent || '').replace(/\s+/g, ' ').trim());
    assert.doesNotMatch(m, /OBS redo/,
      `statusraden pastar "OBS redo" utan att nagon modul vet om en OBS-lank finns: "${m}"`);
  } finally { await context.close() }
});

// ---- Prov 7 · Layout-lanken slappar sin markering nar man lamnar editorn -----------------------
// Fjarde fyndet, sett pa SKARM under stad-arbetet och darefter uppmatt: Layout ar ett
// <a href="layout.html">, alltsa varken [data-view] eller [data-extra]. go() rensar bara de tva,
// sa markeringen blir kvar for alltid. Uppmatt: i overlay-vyn lyste bade "Overlay" och "Layout",
// och pa Oversikt bade "Översikt" och "Layout". Det ar A3 fran Etapp 1 pa ett element den fixen
// inte natte.
test('bara ett navval ar markerat aven nar man kommer fran Layout', { skip, timeout: 90000 }, async () => {
  const { context, page } = await nyAnvandare('/studio.html?open=layout');
  try {
    const iEditorn = await page.evaluate(() =>
      [...document.querySelectorAll('aside .active')].map(e => e.textContent.trim()));
    assert.deepEqual(iEditorn, ['Layout'], 'kontrollmatning: i editorn ska Layout vara markerad');

    const efter = await page.evaluate(async () => {
      const k = [...document.querySelectorAll('button')].find(b => /lägg till widget/i.test(b.textContent));
      k.click();
      await new Promise(r => setTimeout(r, 1600));
      return { vy: view, aktiva: [...document.querySelectorAll('aside .active')].map(e => e.textContent.trim()) };
    });
    assert.equal(efter.vy, 'overlay', 'kontrollmatning: vi ska ha bytt till overlay-vyn');
    assert.deepEqual(efter.aktiva, ['Overlay'],
      `${efter.aktiva.length} navval lyser samtidigt: ${efter.aktiva.join(', ')}`);

    const hem = await page.evaluate(async () => {
      document.querySelector('aside [data-view="home"]').click();
      await new Promise(r => setTimeout(r, 1400));
      return [...document.querySelectorAll('aside .active')].map(e => e.textContent.trim());
    });
    assert.deepEqual(hem, ['Översikt'], `pa Oversikt lyser: ${hem.join(', ')}`);
  } finally { await context.close() }
});

// ---- Prov 6 · egenskapspanelens tomma tillstand skrivs inte ihop --------------------------------
test('egenskapspanelens tomma tillstand har avskiljare mellan rubrik och text',
  { skip, timeout: 90000 }, async () => {
  const { context, page } = await nyAnvandare('/studio.html?open=layout');
  try {
    const m = await page.evaluate(() => {
      const box = document.querySelector('.properties-empty');
      if (!box) return { saknas: true };
      const rubrik = box.querySelector('strong');
      return {
        text: box.textContent.replace(/\s+/g, ' ').trim(),
        rubrikDisplay: rubrik ? getComputedStyle(rubrik).display : null,
        rubrikNederkant: rubrik ? Math.round(rubrik.getBoundingClientRect().bottom) : null,
        textOverkant: box.querySelector('span')
          ? Math.round(box.querySelector('span').getBoundingClientRect().top) : null,
      };
    });
    assert.ok(!m.saknas, 'kontrollmatning: .properties-empty ska finnas for en ny anvandare');
    assert.doesNotMatch(m.text, /widgetKlicka/,
      `rubrik och brodtext skrivs ihop pa skarmen: "${m.text}"`);
    // Radbrytning, inte bara ett mellanslag: de ar tva olika saker och ska se ut som det.
    assert.ok(m.textOverkant >= m.rubrikNederkant,
      `brodtexten borjar pa samma rad som rubriken (rubrik slutar ${m.rubrikNederkant}, ` +
      `text borjar ${m.textOverkant})`);
  } finally { await context.close() }
});
