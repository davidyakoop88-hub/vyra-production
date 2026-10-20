'use strict';
// WIDGETSOKNINGEN FILTRERAR HELA KATALOGEN.
//
// Granskning 2026-10-17 F06 och 2026-10-18 F09: sokningen "xyz-granskning-ingen" (och
// "qa-ingen-widget-20261018") dolde rankingkorten men lamnade Koi Pearl Lagoon och de andra
// VIDEO FX-paketen synliga. Orsaken: sokfiltret i media.js tog bara `.widget-catalog>section`,
// och VIDEO FX-paketen ligger i en egen omslagsdiv (`[data-video-packs]`) — deras sektioner ar
// alltsa barnbarn och sags aldrig. Sektioner som kommer in sent (premium-final.js m.fl. laddas
// asynkront) filtrerades inte heller, och vid noll traffar stod katalogen bara tom.
//
// Kraven: noll synliga kort vid nolltraff, ett tydligt "Inga widgets hittades" med Rensa,
// paketen filtreras som vilket kort som helst, och en sektion som dyker upp efter att man
// skrivit i rutan foljer sokningen.
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
  const n = await page.evaluate(async () => {
    await window.VyraSessionState.projectLocalSession();
    let forra = -1, n = 0;
    for (let t = 0; t < 40; t++) {
      go('overlay'); await new Promise(r => setTimeout(r, 250));
      n = document.querySelectorAll('.widget-catalog [data-catalog-key]').length;
      if (n > 100 && n === forra) break; forra = n;
    }
    return n;
  });
  assert.ok(n > 100, `katalogen byggdes inte (${n} kort)`);
  return page;
}

// Synliga katalogkort och deras namn. Knappar inne i en miniatyr ar en del av en ritad widget.
const matKatalog = () => {
  const kort = [...document.querySelectorAll('.overlay-widget-gallery .widget-catalog button')]
    .filter(b => !b.closest('.owg-thumb') && b.getClientRects().length > 0);
  const tom = document.querySelector('[data-katalog-nolltraff]');
  return {
    antal: kort.length,
    namn: kort.map(b => (b.querySelector('b')?.textContent || b.textContent).trim()),
    tom: tom && tom.getClientRects().length ? tom.textContent.replace(/\s+/g, ' ').trim() : null,
  };
};
const sok = (page, q) => page.evaluate(q => {
  const s = document.querySelector('.overlay-widget-gallery .widget-search');
  s.value = q; s.dispatchEvent(new Event('input', { bubbles: true }));
}, q);

test('nolltraff doljer VIDEO FX-paketen och visar Inga widgets hittades med Rensa', { skip, timeout: 120000 }, async () => {
  const page = await overlayKatalog();
  try {
    const fore = await page.evaluate(matKatalog);
    assert.ok(fore.namn.some(n => /Pink Princess/.test(n)), 'provet mater inget: Pink Princess-paketet finns inte i katalogen');
    assert.equal(fore.tom, null, 'nolltraffslaget syns utan sokning');

    await sok(page, 'xyz-granskning-ingen');
    const under = await page.evaluate(matKatalog);
    assert.deepEqual(under.namn, [], 'kort som inte matchar sokningen star kvar');
    assert.equal(under.tom, 'Inga widgets hittades. Rensa sökningen eller prova ett annat ord.');

    // Rensa ar ett syskon till tomt-noden och nollstaller sokningen.
    const rensad = await page.evaluate(() => {
      const knapp = document.querySelector('[data-katalog-rensa]');
      if (!knapp || !knapp.getClientRects().length) return null;
      knapp.click();
      return document.querySelector('.overlay-widget-gallery .widget-search').value;
    });
    assert.equal(rensad, '', 'Rensa sökning saknas eller tommer inte rutan');
    const efter = await page.evaluate(matKatalog);
    assert.equal(efter.antal, fore.antal, 'katalogen kom inte tillbaka efter Rensa');
    assert.equal(efter.tom, null);
  } finally { await page.close(); }
});

test('sokningen traffar paketen som vilket kort som helst', { skip, timeout: 120000 }, async () => {
  const page = await overlayKatalog();
  try {
    // Koi Pearl Lagoon och Masquerade Ball ar avvecklade (slutgranskning B-001/B-002): de finns inte i
    // katalogen alls, sa sokningen provas pa Pink Princess.
    await sok(page, 'pink princess');
    const m = await page.evaluate(matKatalog);
    assert.ok(m.namn.some(n => /Pink Princess/.test(n)), 'Pink Princess hittas inte');
    assert.ok(!m.namn.some(n => /Koi Pearl|Masquerade|Cloud Fox|Royal Ruby/.test(n)), 'orelaterade paket star kvar: ' + m.namn.join(', '));
    assert.equal(m.tom, null);
  } finally { await page.close(); }
});

// Rankingsektionen delar sina kort i designgrupper med egen rubrik (<h5>). Forut stod rubrikerna
// "Basic v2", "Prism", "Celestial" ... kvar pa en rad nar bara Voltage matchade.
test('en undergrupp utan traffar doljs med sin rubrik', { skip, timeout: 120000 }, async () => {
  const page = await overlayKatalog();
  try {
    await sok(page, 'voltage');
    const m = await page.evaluate(() => {
      const syns = el => el.getClientRects().length > 0;
      const grupper = [...document.querySelectorAll('.overlay-widget-gallery .widget-catalog section > *')]
        .filter(g => !g.matches('h4,button,article') && g.querySelector('button') && syns(g));
      return {
        grupper: grupper.length,
        tomma: grupper.filter(g => ![...g.querySelectorAll('button')].some(b => !b.closest('.owg-thumb') && syns(b)))
          .map(g => (g.querySelector('h5,h4')?.textContent || g.className).trim()),
      };
    });
    assert.ok(m.grupper > 0, 'provet mater inget: ingen grupp matchade "voltage"');
    assert.deepEqual(m.tomma, [], 'grupprubriker utan traffar star kvar');
  } finally { await page.close(); }
});

test('en sektion som kommer in efter sokningen foljer filtret', { skip, timeout: 120000 }, async () => {
  const page = await overlayKatalog();
  try {
    await sok(page, 'xyz-granskning-ingen');
    await page.evaluate(async () => {
      const omslag = document.createElement('div');
      omslag.innerHTML = '<section class="sen-sektion"><h4>SEN SEKTION</h4><div><button data-catalog-key="catalog:sen:prov"><i>★</i><span><b>Sent kort</b><small>Prov</small></span></button></div></section>';
      document.querySelector('.overlay-widget-gallery .widget-catalog').append(omslag);
      await new Promise(r => setTimeout(r, 300));
    });
    const m = await page.evaluate(matKatalog);
    assert.deepEqual(m.namn, [], 'ett sent inkommet kort ignorerar sokningen');
    assert.ok(m.tom, 'nolltraffslaget forsvann nar en sen sektion kom in');
  } finally { await page.close(); }
});
