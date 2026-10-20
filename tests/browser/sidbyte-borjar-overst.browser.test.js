'use strict';
// ETT SIDBYTE BORJAR OVERST PA DEN NYA SIDAN.
//
// Granskning 2026-10-17 F09: efter att en FAQ oppnats langt ned i Guide visades Overlay mitt i
// katalogen. Samma monster mellan flera menyval. Uppmatt 2026-10-20: det ar dokumentet som
// scrollar, och varken go() i studio.js eller extra-vyernas egna ritare ror scrollen — den nya
// sidan arvde den gamlas scrollY. Fokus lag kvar pa body.
//
// Kravet: ett klick i sidomenyn ger scrollY 0 och fokus pa den nya sidans rubrik (#title), bade
// till vanliga vyer och extra-vyer. Ett render() utan sidbyte far INTE flytta scrollen — det
// ropas sent och oombett av manga moduler.
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

async function studio() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState && !!document.querySelector('aside [data-extra="guide"]'), null, { timeout: 30000, polling: 100 });
  await page.evaluate(() => window.VyraSessionState.projectLocalSession());
  await page.waitForTimeout(1500);
  return page;
}
// Klicka i sidomenyn, scrolla langst ned, klicka vidare. Svarar med scroll och fokus efterat.
const byt = (page, fran, till) => page.evaluate(async ([fran, till]) => {
  const sl = ms => new Promise(r => setTimeout(r, ms));
  const knapp = k => document.querySelector(`aside [data-view="${k}"],aside [data-extra="${k}"]`);
  knapp(fran).click(); await sl(700);
  window.scrollTo(0, document.scrollingElement.scrollHeight); await sl(150);
  const fore = window.scrollY;
  knapp(till).click(); await sl(700);
  const a = document.activeElement;
  return { fore, efter: window.scrollY, fokus: a ? (a.id ? '#' + a.id : a.tagName) : null, rubrik: document.querySelector('#title')?.textContent.trim() };
}, [fran, till]);

test('Guide -> Overlay borjar overst med fokus pa rubriken', { skip, timeout: 120000 }, async () => {
  const page = await studio();
  try {
    const m = await byt(page, 'guide', 'overlay');
    assert.ok(m.fore > 200, 'provet mater inget: Guide gick inte att scrolla (' + m.fore + ')');
    assert.equal(m.rubrik, 'Overlay');
    assert.equal(m.efter, 0, 'Overlay arvde Guides scrollposition');
    assert.equal(m.fokus, '#title', 'fokus flyttades inte till den nya sidans rubrik');
  } finally { await page.close(); }
});

test('Overlay -> Guide (extra-vy) borjar ocksa overst', { skip, timeout: 120000 }, async () => {
  const page = await studio();
  try {
    const m = await byt(page, 'overlay', 'guide');
    assert.ok(m.fore > 200, 'provet mater inget: Overlay gick inte att scrolla');
    assert.equal(m.efter, 0, 'Guide arvde Overlays scrollposition');
    assert.equal(m.fokus, '#title');
  } finally { await page.close(); }
});

test('ett render() utan sidbyte flyttar inte scrollen', { skip, timeout: 120000 }, async () => {
  const page = await studio();
  try {
    const m = await page.evaluate(async () => {
      const sl = ms => new Promise(r => setTimeout(r, ms));
      document.querySelector('aside [data-view="overlay"]').click(); await sl(700);
      window.scrollTo(0, 600); await sl(150);
      const fore = window.scrollY;
      render(); await sl(300);
      return { fore, efter: window.scrollY };
    });
    assert.ok(m.fore > 200, 'provet mater inget');
    assert.equal(m.efter, m.fore, 'ett vanligt render() hoppade till toppen');
  } finally { await page.close(); }
});
