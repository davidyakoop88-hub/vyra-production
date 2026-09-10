'use strict';
// PRESTANDAVALET FINNS INTE LÄNGRE — och preset står kvar (2026-09-10).
//
// Steg 7 flyttade prestandaväljaren från varje widgets panel till Inställningar. David tittade på
// resultatet och sa nej: konkurrenten har inget sådant val, och tre lägen som ingen ställer in är
// tre lägen som bara kan bli fel. Valet är borttaget helt.
//
// MEN FLYTTEN FICK INTE TA MED SIG NÅGOT ANNAT. Den ursprungliga mätningen sa att hela gruppen
// "PRESET & PRESTANDA" var scen-global; en närläsning visade att bara prestandaväljaren var det:
//   * "Spara preset" tar en kopia av widgeten, lagrad under w.type
//   * "Ladda senaste" hämtar tillbaka den
//   * "Återställ widget" nollställer widgetens skala, opacitet, dolt-läge och lager
//   * Presetnamnet skriver inte till w, men LÄSES när presetet sparas — därför såg det dött ut
// Alla fyra ska stå kvar i panelen. En bortstädning som tar med sig fel saker är lika mycket ett
// fel som ingen bortstädning alls, och hälften av proven här mäter just det.
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

test('prestandavalet finns ingenstans i gränssnittet', { skip }, async () => {
  const page = await studion();
  try {
    // Båda vyerna, eftersom väljaren bott i båda: först i widgetpanelen, sedan i Inställningar.
    await seeda(page, 'catalog:topgift:premium:royal');
    const iPanelen = await page.evaluate(() => !!document.querySelector('#runtimePerformance'));
    assert.equal(iPanelen, false, 'prestandaväljaren finns kvar i widgetpanelen');

    await page.evaluate(() => { view = 'settings'; render(); });
    await page.waitForTimeout(800);
    const iInstallningar = await page.evaluate(() => !!document.querySelector('#runtimePerformance'));
    assert.equal(iInstallningar, false, 'prestandaväljaren finns kvar i Inställningar');
  } finally { await page.close(); }
});

test('ett gammalt sparat lågläge låser inte in någon', { skip }, async () => {
  // Utan den här raden hade den som en gång valde "Låg" suttit fast i ett läge som släcker skuggor
  // och partiklar, utan något sätt att ta sig ur det när väljaren försvann.
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await page.goto(bas + '/studio.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('vyra-performance-mode', 'low'));
    await page.goto(bas + '/studio.html?open=layout', { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
      { timeout: 30000, polling: 100 });
    await page.waitForTimeout(1200);
    const ut = await page.evaluate(() => ({
      attribut: document.documentElement.dataset.performance,
      sparat: localStorage.getItem('vyra-performance-mode'),
    }));
    assert.notEqual(ut.attribut, 'low',
      'data-performance står kvar på "low" — widgetarna ritas utan skuggor och partiklar');
    // Nyckeln raderas och skrivs direkt tillbaka som "standard" av applyPerformance(). Det som
    // spelar roll är att det gamla lågläget är borta, inte att raden i localStorage försvinner —
    // en nyckel med värdet "standard" matchar ingen CSS-regel och gör ingenting.
    assert.notEqual(ut.sparat, 'low', 'det gamla lågläget ligger kvar i localStorage');
  } finally { await page.close(); }
});
