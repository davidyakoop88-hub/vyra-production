'use strict';
// FÄRGSCHEMAT VISAR EN PROVBILD — OCH SÄGER IFRÅN NÄR TEXTEN INTE GÅR ATT LÄSA.
//
// Granskningen 2026-10-17 (F37): dialogen visade fyra färgränder och en typsnittslista men ingen
// widget, så man fick spara och leta upp en widget med "Ärv färgschema" för att se resultatet.
// Färgkoderna syntes inte, det fanns ingen väg tillbaka till standard, och ingenting varnade när
// text och bakgrund blev nästan samma färg.
//
// fargschema-prov.js lägger till en levande provbild, läsbara färgkoder, en kontrastvarning och
// "Återställ standard". Inget sparas förrän man trycker Spara färgschema, precis som förut.
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

async function dialogen() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState, null,
    { timeout: 30000, polling: 100 });
  await page.evaluate(() => window.VyraSessionState.projectLocalSession());
  await page.waitForTimeout(1500);
  await page.click('#openBrandKit');
  await page.waitForFunction(() => document.querySelector('#brandKitModal')?.open, null, { timeout: 10000, polling: 100 });
  await page.waitForTimeout(200);
  return page;
}

const satt = (page, sel, varde) => page.evaluate(([s, v]) => {
  const el = document.querySelector(s); el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, [sel, varde]);

const provet = page => page.evaluate(() => {
  const prov = document.querySelector('#brandKitModal [data-bk-prov]');
  if (!prov) return null;
  const cs = el => el && getComputedStyle(el);
  const r = prov.getBoundingClientRect();
  return {
    synlig: r.width > 120 && r.height > 40,
    bakgrund: cs(prov).backgroundColor,
    text: cs(prov.querySelector('[data-bk-prov-text]'))?.color,
    sekundar: cs(prov.querySelector('[data-bk-prov-sekundar]'))?.color,
    highlight: cs(prov.querySelector('[data-bk-prov-highlight]'))?.backgroundColor,
    typsnitt: cs(prov.querySelector('[data-bk-prov-text]'))?.fontFamily,
    koder: [...document.querySelectorAll('#brandKitModal [data-bk-hex]')].map(o => o.textContent.trim().toLowerCase()),
    varning: (() => { const v = document.querySelector('#brandKitModal [data-bk-varning]'); return v && !v.hidden ? v.textContent : '' })(),
  };
});

test('dialogen visar en provwidget i de valda färgerna och typsnittet', { skip }, async () => {
  const page = await dialogen();
  try {
    const fore = await provet(page);
    assert.ok(fore, 'färgschemat har ingen provbild — man ser inte hur kombinationen fungerar');
    assert.ok(fore.synlig, 'provbilden ritas inte i en läsbar storlek');
    await satt(page, '#bkBackground', '#102030');
    await satt(page, '#bkText', '#fafafa');
    await satt(page, '#bkSecondaryText', '#a0b0c0');
    await satt(page, '#bkHighlight', '#33cc99');
    await page.selectOption('#bkFontFamily', 'Georgia, serif');
    const efter = await provet(page);
    assert.equal(efter.bakgrund, 'rgb(16, 32, 48)', 'provbildens bakgrund följer inte Bakgrund');
    assert.equal(efter.text, 'rgb(250, 250, 250)', 'provbildens text följer inte Text');
    assert.equal(efter.sekundar, 'rgb(160, 176, 192)', 'provbildens sekundära text följer inte Sekundär text');
    assert.equal(efter.highlight, 'rgb(51, 204, 153)', 'provbildens markering följer inte Highlight');
    assert.match(efter.typsnitt, /Georgia/, 'provbilden följer inte Typsnitt');
    assert.deepEqual(efter.koder, ['#102030', '#33cc99', '#fafafa', '#a0b0c0'], 'färgkoderna visas inte läsbart');
  } finally { await page.close(); }
});

test('svårläst text mot bakgrunden ger en varning med kontrasttalet', { skip }, async () => {
  const page = await dialogen();
  try {
    await satt(page, '#bkBackground', '#1c1028');
    await satt(page, '#bkText', '#f7f2ff');
    assert.equal((await provet(page)).varning, '', 'standardfärgerna ska inte varna');
    await satt(page, '#bkText', '#2a1f38');
    const m = await provet(page);
    assert.match(m.varning, /svår att läsa/i, 'ingen varning när texten nästan försvinner i bakgrunden');
    assert.match(m.varning, /\d+,\d+:1/, 'varningen säger inte hur låg kontrasten är');
  } finally { await page.close(); }
});

test('Återställ standard sätter tillbaka standardfärgerna utan att spara', { skip }, async () => {
  const page = await dialogen();
  try {
    const sparatFore = await page.evaluate(() => JSON.stringify(state.brandKit));
    await satt(page, '#bkHighlight', '#000000');
    await page.click('#brandKitModal [data-bk-aterstall]');
    const v = await page.evaluate(() => ['#bkBackground', '#bkHighlight', '#bkText', '#bkSecondaryText', '#bkFontFamily']
      .map(s => document.querySelector(s).value.toLowerCase()));
    assert.deepEqual(v, ['#1c1028', '#ff58d6', '#f7f2ff', '#b9a6dd', '']);
    assert.equal(await page.evaluate(() => JSON.stringify(state.brandKit)), sparatFore,
      'återställningen sparade direkt — det ska fortfarande krävas Spara färgschema');
  } finally { await page.close(); }
});
