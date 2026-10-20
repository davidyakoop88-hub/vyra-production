'use strict';
// FRAMSIDAN VISAR ARBETSFLÖDET OCH FÖRKLARAR PROVPERIODEN — FÖRE INLOGGNING.
//
// Granskning 2026-10-17:
//   F31  Landningen visade effekter och en streambild, men ingen väg från widget till OBS och inget
//        om när VYRA Desktop behövs. Rekommendation: tre steg — välj widget, anpassa, lägg i OBS —
//        och Desktop-kravet tidigt.
//   F32  "3 dagar gratis" och "15 USD/månad" stod utan förklaring: när börjar dagarna, behövs en
//        betalmetod, hur hanteras skatt och valuta? Rekommendation: förklara nära erbjudandet och
//        länka till detaljer, utan att lova en fast kostnad i annan valuta.
//
// Texten om provperioden följer terms.html (PayPal, saldo eller kort, "Skatter och eventuell
// valutaväxling kan tillkomma") och entitlement-gate.js (provperioden startas i appen efter
// verifierad e-post). Inloggningskortet får inte röras — provet kontrollerar att det står kvar.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp', '.ico': 'image/x-icon' };
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

async function lasFramsidan(viewport) {
    const page = await browser.newPage({ viewport });
    try {
      await page.goto(`${bas}/index.html`, { waitUntil: 'load' });
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const synlig = el => !!el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden';
        const steg = [...document.querySelectorAll('#sa-funkar-det ol li')];
        const prov = document.querySelector('#provperioden');
        return {
          sektion: synlig(document.querySelector('#sa-funkar-det')),
          stegRubriker: steg.map(li => (li.querySelector('h3') || {}).innerText || ''),
          stegSynliga: steg.every(synlig),
          sektionText: (document.querySelector('#sa-funkar-det') || {}).innerText || '',
          prov: prov ? prov.innerText : '',
          provVillkorLank: !!(prov && prov.querySelector('a[href="terms.html"]')),
          prisLankar: [...document.querySelectorAll('[data-hero-pris] ~ * a, .hero-prisrad a')].filter(synlig).map(a => a.getAttribute('href')),
          loginKvar: synlig(document.querySelector('.login-kort[data-login] form #loginEmail')) && synlig(document.querySelector('.login-kort .login-knapp')),
        };
      });
      return m;
    } finally { await page.close(); }
}

for (const [namn, viewport] of [['dator', { width: 1366, height: 900 }], ['mobil', { width: 390, height: 844 }]]) {
  test(`F31 framsidan (${namn}): tre steg från widget till OBS och Desktop-kravet`, { skip, timeout: 60000 }, async () => {
      const m = await lasFramsidan(viewport);
      assert.ok(m.loginKvar, 'inloggningskortet syns inte längre');
      assert.ok(m.sektion, 'ingen synlig sektion som visar arbetsflödet före inloggning');
      assert.deepEqual(m.stegRubriker, ['Välj widget', 'Anpassa', 'Lägg i OBS']);
      assert.ok(m.stegSynliga, 'stegen ritas men syns inte');
      assert.match(m.sektionText, /VYRA Desktop/, 'Desktop-kravet beskrivs inte');
      assert.match(m.sektionText, /OBS-scenstyrning/);
  });
  test(`F32 framsidan (${namn}): provperiodens start, betalning, valuta och skatt förklaras nära erbjudandet`, { skip, timeout: 60000 }, async () => {
      const m = await lasFramsidan(viewport);
      assert.match(m.prov, /börjar när du startar provperioden/i, 'det står inte när de tre dagarna börjar');
      assert.match(m.prov, /inte när du skapar kontot/i);
      assert.match(m.prov, /PayPal/, 'det står inte hur betalningen görs');
      assert.match(m.prov, /debiteras i USD/i, 'debiteringsvalutan står inte');
      assert.match(m.prov, /Skatter och eventuell valutaväxling kan tillkomma/, 'skatt och valuta förklaras inte (samma ord som terms.html)');
      assert.ok(!/\d+\s*(kr|SEK)\b/i.test(m.prov), 'provperiodstexten lovar en kostnad i SEK');
      assert.ok(m.provVillkorLank, 'ingen länk till villkoren');
      assert.ok(m.prisLankar.includes('#provperioden'), `prisrutan länkar inte till provperiodens villkor: ${JSON.stringify(m.prisLankar)}`);
  });
}
