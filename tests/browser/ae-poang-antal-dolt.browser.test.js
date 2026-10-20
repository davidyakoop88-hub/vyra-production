'use strict';
// POÄNGRUTORNA I NY ACTION SYNS BARA NÄR POÄNG ÄR IKRYSSAT.
//
// action-event.js ritar antalsrutorna (#aeAddPointsAmount, #aeRemovePointsAmount) med `hidden`
// när "Lägg till poäng"/"Ta bort poäng" inte är ikryssat, och växlar `hidden` när kryssrutan
// ändras. Men `.ae-modal input[type=number]{display:block}` i action-event.css har högre
// specificitet än webbläsarens `[hidden]{display:none}`, så rutorna syntes ändå — två lösa
// sifferfält utan förklaring bredvid två tomma kryssrutor (upptäckt 2026-10-20).
//
// Provet mäter den beräknade stilen i en riktig webbläsare: källtexten säger `hidden` även när
// felet finns, så bara det renderade resultatet kan avgöra.
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

const las = () => ['#aeAddPointsAmount', '#aeRemovePointsAmount'].map(sel => {
  const el = document.querySelector(sel);
  return { sel, finns: !!el, hidden: !!(el && el.hidden), display: el ? getComputedStyle(el).display : null, bredd: el ? el.getBoundingClientRect().width : 0 };
});

test('Ny Action: antalsrutorna för poäng är dolda tills poäng kryssas i', { skip, timeout: 120000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  try {
    await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState && !!document.querySelector('aside [data-extra="actions"]'), null, { timeout: 30000, polling: 100 });
    await page.evaluate(() => window.VyraSessionState.projectLocalSession());
    await page.waitForTimeout(1200);
    await page.click('aside [data-extra="actions"]');
    await page.waitForSelector('#newAeAction', { timeout: 15000 });
    await page.click('#newAeAction');
    await page.waitForSelector('.ae-modal #aeAddPoints', { state: 'attached', timeout: 5000 });

    for (const r of await page.evaluate(las)) {
      assert.ok(r.finns, `${r.sel} saknas i dialogen`);
      assert.equal(r.hidden, true, `${r.sel} ritas inte med hidden`);
      assert.equal(r.display, 'none', `${r.sel} syns trots att poäng inte är ikryssat (display:${r.display})`);
      assert.equal(r.bredd, 0, `${r.sel} tar plats trots hidden`);
    }

    // Kryssa i "Lägg till poäng": bara den rutan ska synas.
    await page.evaluate(() => { const k = document.querySelector('#aeAddPoints'); k.checked = true; k.dispatchEvent(new Event('change', { bubbles: true })); k.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(100);
    const [add, rem] = await page.evaluate(las);
    assert.notEqual(add.display, 'none', 'antalsrutan syns inte när Lägg till poäng är ikryssat');
    assert.ok(add.bredd > 0, 'antalsrutan har ingen bredd när Lägg till poäng är ikryssat');
    assert.equal(rem.display, 'none', 'Ta bort poäng-rutan syns fast bara Lägg till är ikryssat');

    // Och tillbaka.
    await page.evaluate(() => { const k = document.querySelector('#aeAddPoints'); k.checked = false; k.dispatchEvent(new Event('change', { bubbles: true })); k.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(100);
    assert.equal((await page.evaluate(las))[0].display, 'none', 'antalsrutan döljs inte igen när krysset tas bort');
  } finally { await page.close(); }
});
