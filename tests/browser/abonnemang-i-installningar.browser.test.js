'use strict';
// EN KUND MÅSTE KUNNA SÄGA UPP FRÅN INSTÄLLNINGARNA.
//
// Panelen i billing-client.js bar redan knapparna "Säg upp abonnemang", "Ångra uppsägning" och
// "Fakturor & betalmetod". Men dess EGEN öppningsknapp skapas med `hidden=true`
// (`mount()`: `button.hidden = true`), och det enda stället som anropade `VyraBilling.open()` var
// provperiodens onboarding. En betalande kund hade alltså ingen synlig väg till sin prenumeration:
// uppsägning krävde kontoborttagning (som raderar allt) eller PayPals egen sida.
//
// David letade efter den i inställningarna 2026-09-10 och hittade ingenting. Det här provet
// mäter tre saker som var och en kunde falla för sig:
//   1. Sektionen finns i inställningsvyn och är SYNLIG — inte bara i DOM:en.
//   2. Texten säger "säg upp" i klartext. Det är ordet kunden söker efter.
//   3. Knappen anropar VyraBilling.open() — panelens innehåll ägs av billing-client.js och
//      provas inte om här, men vägen dit måste gå att bevisa.
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
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

async function installningarna() {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#view'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(1500);
  // Via navknappen, inte via go() — då provas även att posten går att nå som en kund når den.
  await page.click('[data-view="settings"]');
  await page.waitForFunction(() => !!document.querySelector('[data-sektion="abonnemang"]'), null,
    { timeout: 15000, polling: 100 });
  return page;
}

test('inställningarna har en synlig väg till abonnemanget', { skip }, async () => {
  const page = await installningarna();
  try {
    const m = await page.evaluate(() => {
      const sektion = document.querySelector('[data-sektion="abonnemang"]');
      const knapp = document.querySelector('[data-oppna-abonnemang]');
      if (!sektion || !knapp) return { fel: 'sektionen eller knappen saknas' };
      const r = knapp.getBoundingClientRect(), cs = getComputedStyle(knapp);
      return {
        synlig: !knapp.hidden && cs.display !== 'none' && cs.visibility !== 'hidden'
          && Number(cs.opacity) > 0 && r.width > 0 && r.height > 0,
        matt: `${Math.round(r.width)}x${Math.round(r.height)}`,
        text: (sektion.textContent || '').toLowerCase(),
      };
    });
    assert.ok(!m.fel, m.fel);
    assert.equal(m.synlig, true,
      `knappen finns men syns inte (${m.matt}) — panelens egen öppningsknapp är hidden=true, `
      + 'och en osynlig väg är ingen väg');
    assert.ok(m.text.includes('säg upp'),
      'sektionen nämner inte "säg upp" — det är ordet kunden söker efter i inställningarna');
  } finally { await page.close(); }
});

test('knappen öppnar abonnemangspanelen', { skip }, async () => {
  const page = await installningarna();
  try {
    // Panelens innehåll ägs av billing-client.js och kräver en inloggad arbetsyta. Här bevisas
    // VÄGEN: att klicket når VyraBilling.open(). Utan spionen hade provet mätt en toast.
    const anrop = await page.evaluate(() => {
      window.__oppnadesAbonnemang = 0;
      window.VyraBilling = window.VyraBilling || {};
      window.VyraBilling.open = () => { window.__oppnadesAbonnemang++; };
      document.querySelector('[data-oppna-abonnemang]').click();
      return window.__oppnadesAbonnemang;
    });
    assert.equal(anrop, 1, 'klicket nådde inte VyraBilling.open() — knappen är obunden');
  } finally { await page.close(); }
});

test('panelen bär både uppsägning och ångra', { skip }, async () => {
  // Vaktar att knapparna finns kvar i billing-client.js. Försvinner de är vägen ovan meningslös,
  // och det felet syns ingen annanstans förrän en kund försöker säga upp.
  const page = await installningarna();
  try {
    const finns = await page.evaluate(() => {
      const kalla = [...document.scripts].map(s => s.src).find(s => /billing-client\.js/.test(s));
      return fetch(kalla).then(r => r.text()).then(t => ({
        sagUpp: /billing-cancel/.test(t) && /Säg upp abonnemang/.test(t),
        angra: /billing-resume/.test(t),
        fakturor: /billing-manage/.test(t),
      }));
    });
    assert.equal(finns.sagUpp, true, 'billing-client.js har ingen "Säg upp abonnemang"-knapp längre');
    assert.equal(finns.angra, true, 'ingen "Ångra uppsägning" — en uppsägning måste gå att ta tillbaka');
    assert.equal(finns.fakturor, true, 'ingen väg till fakturor och betalmetod');
  } finally { await page.close(); }
});
