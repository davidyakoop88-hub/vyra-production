'use strict';
// AGENCIES (TEST): DETALJEN FOLJER TRAFFLISTAN, OCH TESTPROFILERNA LANKAR INTE UT.
//
// Granskning 2026-10-17 F25 / 2026-10-18 F11: sokningen "QA-ingen-agency" gav "Ingen test-agency
// matchar filtret" i listan, men detaljpanelen visade fortfarande Test Agency North med
// kontaktlankar. Orsaken: detail() slog upp den valda profilen i HELA listan, inte i traffarna.
//
// Granskning 2026-10-17 F38: vyn ar markt TEST men visade fungerande mailto- och sociala lankar
// (bland annat instagram.com/testagency_north, en riktig doman) for profiler som inte finns.
// Kontaktvagarna ska synas som forhandsvisning, inte ga att klicka ut pa.
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

async function agencies() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.VyraAgencyTest && !!document.querySelector('aside [data-extra="agencies"]'), null, { timeout: 30000, polling: 100 });
  await page.click('aside [data-extra="agencies"]');
  await page.waitForSelector('#agencyTestSearch', { timeout: 10000 });
  return page;
}
const matDetalj = () => {
  const d = document.querySelector('#agencyTestDetail');
  return {
    text: d ? d.textContent.replace(/\s+/g, ' ').trim() : null,
    profil: d ? d.querySelector('h3')?.textContent || null : null,
    lankar: d ? d.querySelectorAll('a[href]').length : -1,
    lista: document.querySelectorAll('.agency-test-list [data-agency-id]').length,
  };
};

test('F25: noll traffar tommer detaljpanelen', { skip, timeout: 90000 }, async () => {
  const page = await agencies();
  try {
    const fore = await page.evaluate(matDetalj);
    assert.equal(fore.profil, 'Test Agency North', 'provet mater inget: ingen profil vald fran borjan');
    await page.fill('#agencyTestSearch', 'QA-ingen-agency');
    await page.waitForTimeout(200);
    const m = await page.evaluate(matDetalj);
    assert.equal(m.lista, 0, 'provet mater inget: sokningen gav traffar');
    assert.equal(m.profil, null, 'detaljpanelen visar en profil som inte ingar i traffarna: ' + m.text);
    assert.equal(m.lankar, 0, 'detaljpanelen har kvar kontaktvagar vid noll traffar');
    assert.ok(/ändra sökningen/i.test(m.text), 'detaljpanelen sager inte vad man kan gora: ' + m.text);

    // Tillbaka till alla: en profil visas igen, och sokrutan behaller fokus som forut.
    await page.fill('#agencyTestSearch', '');
    await page.waitForTimeout(200);
    const efter = await page.evaluate(() => ({ ...(() => { const d = document.querySelector('#agencyTestDetail'); return { profil: d.querySelector('h3')?.textContent || null } })(), fokus: document.activeElement && document.activeElement.id }));
    assert.equal(efter.profil, 'Test Agency North');
    assert.equal(efter.fokus, 'agencyTestSearch');
  } finally { await page.close(); }
});

test('F25: region utan den valda profilen visar en profil ur traffarna', { skip, timeout: 90000 }, async () => {
  const page = await agencies();
  try {
    await page.selectOption('#agencyTestRegion', 'Europa');
    await page.waitForTimeout(200);
    const m = await page.evaluate(matDetalj);
    assert.equal(m.profil, 'Test Agency Europe');
  } finally { await page.close(); }
});

test('F38: testprofilernas kontaktvagar ar forhandsvisning, inte lankar ut', { skip, timeout: 90000 }, async () => {
  const page = await agencies();
  try {
    const m = await page.evaluate(() => {
      const vy = document.querySelector('.agency-test');
      const ut = [...vy.querySelectorAll('a[href]')].map(a => a.getAttribute('href'));
      const rad = vy.querySelector('.agency-test-contact-links');
      return { ut, text: rad ? rad.textContent.replace(/\s+/g, ' ').trim() : null };
    });
    assert.deepEqual(m.ut, [], 'aktiva kontaktvagar i testlaget: ' + m.ut.join(', '));
    // Uppgifterna syns fortfarande — det ar sjalva forhandsvisningen.
    assert.ok(m.text && m.text.includes('north@example.test') && m.text.includes('testagency_north'), 'kontaktuppgifterna syns inte: ' + m.text);
    assert.ok(/avstängda i testläget/i.test(m.text), 'det sags inte att kontaktvagarna ar avstangda: ' + m.text);
  } finally { await page.close(); }
});
