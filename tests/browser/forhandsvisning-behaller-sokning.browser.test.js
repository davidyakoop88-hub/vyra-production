'use strict';
// FORHANDSVISNING RENSAR INTE SOKNINGEN.
//
// Granskning 2026-10-17 F08: efter sokning pa "Voltage" och klick pa ▶ Förhandsvisa tomdes
// sokfaltet och hela katalogen kom tillbaka. Samma sak efter paketpreview. Orsaken: Preview satter
// utkastet och anropar render(), som bygger om hela Overlay-vyn — sokrutan ar ny och tom, och
// katalogen ritas ofiltrerad.
//
// Kravet: soktexten och filtret star kvar efter Preview, och previewytan visar det valda kortet.
// Ett byte TILL Overlay fran en annan vy borjar daremot med en tom sokning, som forut.
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

async function overlayKatalog() {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState, null, { timeout: 30000, polling: 100 });
  await page.evaluate(async () => {
    await window.VyraSessionState.projectLocalSession();
    let forra = -1, n = 0;
    for (let t = 0; t < 40; t++) {
      go('overlay'); await new Promise(r => setTimeout(r, 250));
      n = document.querySelectorAll('.widget-catalog [data-catalog-key]').length;
      if (n > 100 && n === forra) break; forra = n;
    }
  });
  return page;
}

const las = () => {
  const s = document.querySelector('.overlay-widget-gallery .widget-search');
  const kort = [...document.querySelectorAll('.overlay-widget-gallery .widget-catalog button')]
    .filter(b => !b.closest('.owg-thumb') && b.getClientRects().length > 0);
  return {
    q: s ? s.value : null,
    namn: kort.map(b => (b.querySelector('b')?.textContent || '').trim()),
    stage: document.querySelector('.overlay-live-preview .section-header-eyebrow')?.textContent || null,
  };
};
async function sokOchForhandsvisa(page, q, kortRegex) {
  await page.evaluate(q => {
    const s = document.querySelector('.overlay-widget-gallery .widget-search');
    s.value = q; s.dispatchEvent(new Event('input', { bubbles: true }));
  }, q);
  const fore = await page.evaluate(las);
  const klickad = await page.evaluate(src => {
    const re = new RegExp(src, 'i');
    const kort = [...document.querySelectorAll('.overlay-widget-gallery .widget-catalog button')]
      .find(b => !b.closest('.owg-thumb') && b.getClientRects().length > 0 && re.test(b.textContent));
    const p = kort && kort.querySelector('.owg-preview');
    if (!p) return null;
    p.click();
    return kort.querySelector('b').textContent.trim();
  }, kortRegex.source);
  await page.waitForTimeout(400);
  return { fore, klickad, efter: await page.evaluate(las) };
}

test('Förhandsvisa behaller soktext och filter', { skip, timeout: 120000 }, async () => {
  const page = await overlayKatalog();
  try {
    const { fore, klickad, efter } = await sokOchForhandsvisa(page, 'voltage', /voltage/);
    assert.ok(fore.namn.length > 0, 'provet mater inget: inget kort matchar "voltage"');
    assert.ok(klickad, 'hittade inget Förhandsvisa pa ett Voltage-kort');
    assert.ok(efter.stage, 'previewytan visades inte');
    assert.equal(efter.q, 'voltage', 'sokfaltet tomdes av Förhandsvisa');
    assert.deepEqual(efter.namn, fore.namn, 'katalogen visar annat an sokresultatet efter Förhandsvisa');
  } finally { await page.close(); }
});

test('paketpreview behaller ocksa sokningen', { skip, timeout: 120000 }, async () => {
  const page = await overlayKatalog();
  try {
    const { fore, klickad, efter } = await sokOchForhandsvisa(page, 'pink princess', /hela paketet/);
    assert.ok(klickad, 'hittade inget Förhandsvisa pa Pink Princess-paketet (Koi och Masquerade togs ur katalogen i slutgranskningen B-001)');
    assert.equal(efter.q, 'pink princess', 'sokfaltet tomdes av paketpreview');
    assert.deepEqual(efter.namn, fore.namn);
  } finally { await page.close(); }
});

test('ett byte till Overlay fran en annan vy borjar med tom sokning', { skip, timeout: 120000 }, async () => {
  const page = await overlayKatalog();
  try {
    await sokOchForhandsvisa(page, 'voltage', /voltage/);
    await page.evaluate(async () => { go('home'); await new Promise(r => setTimeout(r, 200)); go('overlay'); await new Promise(r => setTimeout(r, 400)); });
    const m = await page.evaluate(las);
    assert.equal(m.q, '', 'sokningen foljde med till ett nytt besok i Overlay');
    assert.ok(m.namn.length > 100, 'hela katalogen visas inte efter ett nytt besok');
  } finally { await page.close(); }
});
