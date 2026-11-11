'use strict';
// GALLERIET I OVERLAY-VYN (katalog-scen.js, David 2026-11-11).
//
// Uppmätt före: 164 kort i en lista gav en katalog på ~14 600 px. Galleriet visar en familj i taget
// — scen överst, familjens kort på en rad under. Provet håller fast det som inte får gå sönder:
//   • korten ligger KVAR i katalogen med sina nycklar (kartan, sökningen och layouter bygger på dem),
//   • scenen är inget kort och bär ingen katalognyckel,
//   • en riktig gest VÄLJER ett kort; den lägger inte widgeten i layouten,
//   • ett kodklick och scenens knapp lägger till, precis som kortet alltid gjort,
//   • sökning och växeln Lista ger den gamla listan tillbaka.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' };
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

async function oppna() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState && !!window.VyraKatalogScen && typeof window.owgRenderCardThumb === 'function', null, { timeout: 30000, polling: 100 });
  await page.evaluate(async () => {
    await window.VyraSessionState.projectLocalSession();
    let forra = -1;
    for (let t = 0; t < 40; t++) {
      view = 'overlay'; selected = null; render(); bind(); await new Promise(r => setTimeout(r, 250));
      const n = document.querySelectorAll('.widget-catalog [data-catalog-key]').length;
      if (n > 100 && n === forra) break; forra = n;
    }
    await new Promise(r => setTimeout(r, 400));
  });
  return page;
}
const lage = page => page.evaluate(() => {
  const g = document.querySelector('.overlay-widget-gallery'), c = g.querySelector(':scope > .widget-catalog');
  const synliga = [...c.children].filter(s => s.getBoundingClientRect().height > 0);
  return {
    pa: g.classList.contains('kat-scen-pa'),
    kort: c.querySelectorAll('button[data-catalog-key]').length,
    nycklarUtanfor: document.querySelectorAll('[data-catalog-key]').length - c.querySelectorAll('[data-catalog-key]').length,
    synligaFamiljer: synliga.length,
    kataloghojd: Math.round(c.getBoundingClientRect().height),
    familjeknappar: g.querySelectorAll('.kat-familjer [data-kat-familj]').length,
    scenRitad: !!g.querySelector('.kat-scen-kort .owg-thumb'),
    namn: (g.querySelector('.kat-scen-namn b')?.textContent || '').trim(),
    aktiva: c.querySelectorAll('.kat-scen-aktiv').length,
    widgets: state.widgets.length
  };
});

test('galleriet visar en familj i taget och korten ligger kvar i katalogen', { skip, timeout: 120000 }, async () => {
  const page = await oppna();
  try {
    const g = await lage(page);
    assert.equal(g.pa, true, 'galleriet ska vara förvalt');
    assert.ok(g.kort > 100, `katalogen byggdes inte (${g.kort} kort)`);
    assert.equal(g.synligaFamiljer, 1, 'bara vald familj ska synas');
    assert.ok(g.familjeknappar >= 20, `familjelistan saknar familjer (${g.familjeknappar})`);
    assert.ok(g.kataloghojd < 400, `remsan ska vara en rad, inte en lista (${g.kataloghojd} px)`);
    assert.equal(g.scenRitad, true, 'scenen ritade ingen widget');
    assert.ok(g.namn, 'scenen saknar namn på vald design');
    assert.equal(g.aktiva, 1, 'exakt ett kort ska vara markerat');
    assert.equal(g.nycklarUtanfor, 0, 'scenen får inte bära en katalognyckel — den är inget kort');

    await page.evaluate(() => window.VyraKatalogScen.vy('lista'));
    const l = await lage(page);
    assert.equal(l.pa, false);
    assert.equal(l.kort, g.kort, 'galleriet får inte lägga till eller ta bort kort');
    assert.ok(l.synligaFamiljer >= 20, 'Lista ska visa alla familjer');
    assert.ok(l.kataloghojd > 5000, `Lista ska vara den gamla listan (${l.kataloghojd} px)`);
    await page.evaluate(() => window.VyraKatalogScen.vy('galleri'));
  } finally { await page.close(); }
});

test('en riktig gest väljer kortet; kodklick och scenens knapp lägger till', { skip, timeout: 120000 }, async () => {
  const page = await oppna();
  try {
    await page.evaluate(() => window.VyraKatalogScen.vy('galleri'));
    const fore = await lage(page);
    // Riktig gest på andra kortet i remsan: väljs, läggs inte till.
    const andra = page.locator('.widget-catalog > .kat-scen-vald button[data-catalog-key]').nth(1);
    const nyckel = await andra.getAttribute('data-catalog-key');
    await andra.click();
    await page.waitForTimeout(400);
    const valt = await lage(page);
    assert.equal(valt.widgets, fore.widgets, 'ett klick i remsan ska välja, inte lägga till');
    assert.equal(await page.evaluate(() => window.VyraKatalogScen.vald().kort), nyckel, 'kortet blev inte valt');
    assert.equal(await page.evaluate(() => document.querySelector('.widget-catalog .kat-scen-aktiv')?.dataset.catalogKey), nyckel);

    // Piltangent bläddrar.
    await page.focus('.kat-scen-yta');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    assert.notEqual(await page.evaluate(() => window.VyraKatalogScen.vald().kort), nyckel, 'högerpil bytte inte design');

    // Scenens knapp lägger till genom kortets egen handler.
    await page.click('.kat-scen [data-kat-gor="lagg"]');
    await page.waitForTimeout(600);
    const efterKnapp = await lage(page);
    assert.equal(efterKnapp.widgets, fore.widgets + 1, 'Lägg till i Layout lade inte till widgeten');
    assert.equal(efterKnapp.pa, true, 'galleriet ska stå kvar efter att vyn ritats om');
    assert.equal(efterKnapp.scenRitad, true, 'scenen ska ritas om efter render()');

    // Ett kodklick på ett kort gör som förut — andra skript och prov förlitar sig på det.
    await page.evaluate(() => document.querySelector('.widget-catalog > .kat-scen-vald button[data-catalog-key]').click());
    await page.waitForTimeout(600);
    assert.equal((await lage(page)).widgets, fore.widgets + 2, 'kort.click() från kod ska lägga till widgeten');
  } finally { await page.close(); }
});

test('sökning visar listan, och galleriet kommer tillbaka när sökfältet töms', { skip, timeout: 120000 }, async () => {
  const page = await oppna();
  try {
    await page.evaluate(() => window.VyraKatalogScen.vy('galleri'));
    await page.fill('.overlay-widget-gallery .widget-search', 'heart');
    await page.waitForTimeout(500);
    const s = await lage(page);
    assert.equal(s.pa, false, 'medan man söker ska träffar i flera familjer synas samtidigt');
    assert.ok(s.synligaFamiljer > 1, `sökningen visade bara ${s.synligaFamiljer} familj`);
    await page.fill('.overlay-widget-gallery .widget-search', '');
    await page.waitForTimeout(500);
    const t = await lage(page);
    assert.equal(t.pa, true);
    assert.equal(t.synligaFamiljer, 1);
  } finally { await page.close(); }
});
