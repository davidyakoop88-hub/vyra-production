'use strict';
// GUIDEN PEKAR PÅ MENYVAL SOM FINNS, OCH SÄGER VAD SOM KRÄVER DESKTOP.
//
// Granskning 2026-10-17:
//   F26  Guiden beskrev "Automationer" som en egen väg. Menynoden finns i DOM:en men är
//        display:none — det fanns inget att klicka på. Platsangivelserna var dessutom bara text.
//   F15  FAQ:n sa att alla funktioner "fungerar identiskt" i webben och Desktop med få undantag.
//        Det stämde inte (backup, OBS-styrning och Stream Deck utan kod kräver Desktop), och
//        läsaren fick ingen lista att gå efter.
//
// Proven läser den renderade guiden och den renderade menyn i en riktig webbläsare, så de faller
// om guiden nämner ett menyval som inte syns — oavsett om det döljs i CSS eller tas bort.
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

async function guiden() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState && !!document.querySelector('aside [data-extra="guide"]'), null, { timeout: 30000, polling: 100 });
  await page.evaluate(() => window.VyraSessionState.projectLocalSession());
  await page.waitForTimeout(1200);
  await page.click('aside [data-extra="guide"]');
  await page.waitForSelector('.guide-features-grid', { timeout: 15000 });
  return page;
}
// Synliga menyval i sidomenyn, med sin text.
const menyn = () => [...document.querySelectorAll('aside [data-view], aside [data-extra], aside a[href]')]
  .filter(e => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden')
  .map(e => ({ nyckel: e.dataset.view || e.dataset.extra || '', text: (e.querySelector('span') || e).textContent.replace(/\s+/g, ' ').trim() }));

test('F26: varje plats i guiden är ett menyval som syns', { skip, timeout: 120000 }, async () => {
  const page = await guiden();
  try {
    const { platser, meny, hela } = await page.evaluate(m => ({
      platser: [...document.querySelectorAll('.guide-feature-where')].map(e => e.textContent.replace('📍', '').trim()),
      meny: new Function('return (' + m + ')()')(),
      hela: document.querySelector('#view').innerText,
    }), menyn.toString());
    assert.ok(platser.length >= 8, `för få platsangivelser hittades (${platser.length})`);
    assert.ok(!/Automationer/.test(hela), 'guiden nämner fortfarande "Automationer", som inte finns i menyn');
    const namn = new Set(meny.map(m => m.text));
    for (const plats of platser) {
      if (/^Knappen /.test(plats)) continue; // toppradens knappar, inte sidomenyn
      for (const del of plats.split('→')[0].split('/').map(s => s.trim())) {
        assert.ok(namn.has(del), `guiden pekar på "${del}" (${plats}), men menyn har bara: ${[...namn].join(', ')}`);
      }
    }
  } finally { await page.close(); }
});

test('F26: platsangivelserna går att klicka och leder till rätt sida', { skip, timeout: 120000 }, async () => {
  const page = await guiden();
  try {
    const mal = await page.evaluate(m => {
      const meny = new Function('return (' + m + ')()')();
      return [...document.querySelectorAll('[data-guide-nav]')].map(b => ({ nav: b.dataset.guideNav, finns: meny.some(x => x.nyckel === b.dataset.guideNav), text: b.textContent }));
    }, menyn.toString());
    assert.ok(mal.length >= 8, `för få klickbara platser (${mal.length}) — platsangivelserna är bara text`);
    for (const m of mal) assert.ok(m.finns, `"${m.text}" pekar på menyvalet ${m.nav}, som inte syns`);

    // Poängsystemet: guiden säger Action & Event → Avancerat → Poängsystem. Klicka och se efter.
    await page.click('[data-guide-nav="actions"]:has-text("Poängsystem")');
    await page.waitForSelector('#newAeAction', { timeout: 15000 });
    await page.waitForTimeout(800);
    const avancerat = await page.evaluate(() => {
      const d = document.querySelector('details.ae-advanced');
      return { summary: d && d.querySelector('summary').textContent, rubriker: d ? [...d.querySelectorAll('h3')].map(h => h.textContent.trim()) : [] };
    });
    assert.match(avancerat.summary || '', /Avancerat/);
    for (const rubrik of ['Poängsystem', 'OBS-anslutning', 'Event Simulator']) {
      assert.ok(avancerat.rubriker.includes(rubrik), `guiden säger att ${rubrik} ligger under Avancerat, men där finns: ${avancerat.rubriker.join(', ')}`);
    }
  } finally { await page.close(); }
});

test('F15: FAQ:n listar vad som fungerar i webben, vad som kräver Desktop och vad som kräver OBS', { skip, timeout: 120000 }, async () => {
  const page = await guiden();
  try {
    const svar = await page.evaluate(() => {
      const d = [...document.querySelectorAll('.guide-faq-item')].find(x => /webbläsaren.*skrivbordsappen/i.test(x.querySelector('summary').textContent));
      if (!d) return null;
      d.open = true;
      return d.innerText;
    });
    assert.ok(svar, 'frågan om webbläsare och skrivbordsapp saknas');
    assert.ok(!/identiskt/i.test(svar), `svaret lovar fortfarande att allt fungerar identiskt: "${svar.slice(0, 200)}"`);
    assert.match(svar, /I webbläsaren:/);
    assert.match(svar, /Kräver VYRA Desktop:/);
    assert.match(svar, /Kräver OBS/);
    // De tre Desktop-kraven som faktiskt finns i koden idag (state-backup.js, obs-client.js, streamdeck.js).
    const desktop = svar.split('Kräver VYRA Desktop:')[1].split('Kräver OBS')[0];
    for (const ord of [/OBS/, /Stream Deck/, /backup|versionshistorik/i]) assert.match(desktop, ord);
    // Testevent fungerar i webben sedan F03 (live-client.js send → /api/test/event).
    assert.match(svar.split('Kräver VYRA Desktop:')[0], /testevent|Skicka testgåva/i);
  } finally { await page.close(); }
});
