'use strict';
// PRESTANDALÄGET HÖR TILL STUDION, INTE TILL WIDGETEN — RÖTT FÖRST (2026-09-09).
//
// Steg 7 i Davids plan. Ursprungsformuleringen var "flytta ut preset och prestanda ur panelen",
// byggd på en mätning som visade att gruppens två kontroller inte skrev något till widgeten.
//
// DEN MÄTNINGEN VAR FÖR GROV, och det är värt att skriva ut: bara PRESTANDA är global. Den skriver
// `localStorage['vyra-performance-mode']` och sätter `data-performance` på dokumentroten — ett läge
// för hela studion, upprepat i varje widgets panel. De tre andra kontrollerna är widgetspecifika:
//   * "Spara preset" tar en kopia av widgeten och lägger den under `w.type`
//   * "Ladda senaste" hämtar tillbaka den
//   * "Återställ widget" nollställer widgetens skala, opacitet, dolt-läge och lager
// Presetnamnet skriver inte till `w` men LÄSES när presetet sparas — det var därför det såg dött ut
// i mätningen. Alla fyra stannar därför i panelen; bara prestandaväljaren flyttar.
//
// KONTRAKTET:
//   1. Ingen prestandaväljare i widgetpanelen.
//   2. Den finns i Inställningar, och ändrar där både `data-performance` och localStorage.
//   3. Preset och Återställ widget står kvar i panelen — de gäller widgeten.
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

async function studion() {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  return page;
}

async function seeda(page, nyckel) {
  await page.evaluate(n => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(n);
    w.x = 200; w.y = 200;
    state.widgets.push(w);
    selected = w.id;
    render();
  }, nyckel);
  await page.waitForTimeout(700);
}

const WIDGETS = ['catalog:topgift:premium:royal', 'catalog:custom:text', 'catalog:lastx:card'];

for (const nyckel of WIDGETS) {
  test(`${nyckel}: ingen prestandaväljare i widgetpanelen`, { skip }, async () => {
    const page = await studion();
    try {
      await seeda(page, nyckel);
      const funnen = await page.evaluate(() => {
        const p = document.querySelector('.properties');
        const el = p && p.querySelector('#runtimePerformance');
        if (!el) return null;
        const g = el.closest('.property-group');
        return (g && (g.querySelector('h4, .pg-toggle')?.textContent || '').trim()) || '(utan grupp)';
      });
      assert.equal(funnen, null,
        `${nyckel}: prestandaväljaren ligger kvar i panelen, i gruppen "${funnen}" — `
        + 'den gäller hela studion och upprepas i varje widgets panel');
    } finally { await page.close(); }
  });

  test(`${nyckel}: preset och Återställ widget står kvar i panelen`, { skip }, async () => {
    // Motsatsen till provet ovan, och minst lika viktig: flytten får inte ta med sig det som
    // faktiskt hör till widgeten.
    const page = await studion();
    try {
      await seeda(page, nyckel);
      const kvar = await page.evaluate(() => {
        const p = document.querySelector('.properties');
        return {
          namn: !!p.querySelector('#runtimePresetName'),
          spara: !!p.querySelector('#runtimeSavePreset'),
          ladda: !!p.querySelector('#runtimeLoadPreset'),
          aterstall: !!p.querySelector('#runtimeResetWidget'),
        };
      });
      const saknas = Object.entries(kvar).filter(([, v]) => !v).map(([k]) => k);
      assert.deepEqual(saknas, [],
        `${nyckel}: dessa widgetkontroller försvann ur panelen: ${saknas.join(', ')}`);
    } finally { await page.close(); }
  });
}

test('prestandaläget finns i Inställningar och fungerar där', { skip }, async () => {
  const page = await studion();
  try {
    await page.evaluate(() => { view = 'settings'; render(); });
    await page.waitForTimeout(800);

    const fanns = await page.evaluate(() => !!document.querySelector('#runtimePerformance'));
    assert.ok(fanns, 'ingen prestandaväljare i Inställningar');

    const ut = await page.evaluate(() => {
      const el = document.querySelector('#runtimePerformance');
      const fore = document.documentElement.dataset.performance;
      const nytt = [...el.options].map(o => o.value).find(v => v !== el.value);
      el.value = nytt;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        fore, valt: nytt,
        attribut: document.documentElement.dataset.performance,
        sparat: localStorage.getItem('vyra-performance-mode'),
      };
    });
    assert.equal(ut.attribut, ut.valt,
      `data-performance blev "${ut.attribut}", väntade "${ut.valt}" (var "${ut.fore}")`);
    assert.equal(ut.sparat, ut.valt,
      `localStorage blev "${ut.sparat}", väntade "${ut.valt}"`);
  } finally { await page.close(); }
});
