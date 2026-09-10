'use strict';
// RAMVÄLJAREN HAR EN RUBRIK, INTE TVÅ — RÖTT FÖRST (2026-09-09).
//
// Hittades i den allra första granskningen av panelen och stod kvar: gruppen bar `<h4>AVATAR-RAM</h4>`
// och direkt under den ett `<span>AVATAR-RAMAR · VÄLJ RAM</span>` som sa samma sak igen.
//
// ORSAKEN ÄR TVÅ MONTERINGSVÄGAR för samma väljare:
//   * gift-alert-frames.js bygger en EGEN grupp med h4 och lägger väljaren i den
//   * media.js:499 lägger väljaren i panelens FÖRSTA property-group, utan egen rubrik
// Spannet fanns för den andra vägens skull och blev en dubblett i den första. Att bara ta bort det
// hade lämnat rankingens väljare helt utan rubrik, mitt inne i en grupp som handlar om något annat.
//
// KONTRAKTET: väljaren bor i en egen grupp som heter AVATAR-RAM, oavsett väg in. Då har den en
// rubrik, hamnar rätt i panelordningen (vikt 60, bland tilläggen) och fälls ihop som de andra.
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

// En widget per monteringsväg: Top Gift går via gift-alert-frames.js, Ranking via media.js:499.
const WIDGETS = [
  'catalog:topgift:premium:royal',
  'catalog:followeralert',
  'catalog:ranking:templateTopCoins:gold',
];

async function panelen(nyckel) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(n => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(n);
    w.x = 200; w.y = 200;
    state.widgets.push(w);
    selected = w.id;
    render();
  }, nyckel);
  await page.waitForTimeout(800);
  return page;
}

for (const nyckel of WIDGETS) {
  test(`${nyckel}: ramväljaren har en enda rubrik`, { skip }, async () => {
    const page = await panelen(nyckel);
    try {
      const ut = await page.evaluate(() => {
        const picker = document.querySelector('.properties .pro-frame-picker');
        if (!picker) return { finns: false };
        const grupp = picker.closest('.property-group');
        const rubrik = grupp && (grupp.querySelector('h4, .pg-toggle')?.textContent || '')
          .replace(/[▸▾›]/g, '').trim();
        // Text som ser ut som en rubrik INNE i väljaren: versaler, kort, egen rad.
        const inre = [...picker.querySelectorAll('span, h4, h5, b')]
          .map(el => (el.textContent || '').trim())
          .filter(t => t.length > 3 && t.length < 40 && t === t.toUpperCase() && /RAM/.test(t));
        return { finns: true, rubrik, inre };
      });
      assert.ok(ut.finns, `${nyckel}: ingen ramväljare i panelen`);
      assert.deepEqual(ut.inre, [],
        `${nyckel}: väljaren bär en egen rubrik "${ut.inre.join('", "')}" utöver gruppens `
        + `"${ut.rubrik}" — samma sak sagd två gånger`);
    } finally { await page.close(); }
  });

  test(`${nyckel}: ramväljaren ligger i gruppen AVATAR-RAM`, { skip }, async () => {
    const page = await panelen(nyckel);
    try {
      const rubrik = await page.evaluate(() => {
        const picker = document.querySelector('.properties .pro-frame-picker');
        if (!picker) return null;
        const g = picker.closest('.property-group');
        return g ? (g.querySelector('h4, .pg-toggle')?.textContent || '').replace(/[▸▾›]/g, '').trim() : '(ingen grupp)';
      });
      assert.ok(rubrik !== null, `${nyckel}: ingen ramväljare i panelen`);
      assert.match(rubrik, /^AVATAR-RAM/,
        `${nyckel}: väljaren ligger i gruppen "${rubrik}" — den hör hemma i en egen AVATAR-RAM, `
        + 'annars hamnar den fel i panelordningen och fälls inte ihop med de andra tilläggen');
    } finally { await page.close(); }
  });
}
