'use strict';
// STUDION GAR ATT ANVANDA SOM LAYOUTEDITOR PA SMAL SKARM (granskning 2026-10-18 F05).
//
// UPPMATT FORE, 390 x 844 i riktig Chrome: sidomenyn 210 px och lagerlistan 176 px tog hela
// bredden. .workarea borjade pa X=397 med bredden 0, sa duken och egenskaperna lag utanfor bild.
//
// KRAVEN, under 768 px (vyra-mobil.js + vyra-mobil.css):
//   * duken syns helt inom bredden, och sidan rullar inte i sidled
//   * flikarna Lager / Duk / Egenskaper visar en yta i taget
//   * sidomenyn ar en lada bakom en hamburgare som oppnas, stangs, och stanger sig efter val
//   * en vald widget har en vag fran duken till sina egenskaper
//   * nya tryckytor ar minst 44 px
// och lika viktigt:
//   * >= 768 px ar geometrin OFORANDRAD — samma sida med och utan vyra-mobil.js ger samma rektanglar
//   * overlay-laget (?overlay=1) far ingen flikrad, ingen hamburgare och ingen andring alls
//
// VARFOR RIKTIG WEBBLASARE: allt har ar getBoundingClientRect, matchMedia och scrollWidth.
// jsdom saknar layout och svarar 0 — provet hade varit gront utan implementation.
//
// "UTAN AndRINGEN" byggs genom att blockera vyra-mobil.js med page.route. Det ar filens enda
// vag in (laddaren i media.js), sa en sida utan den ar sidan fore F05.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const { seedaStudioState } = require('../helpers/seed-studio-state.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp' };

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
const skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

async function layouten(bredd, hojd, { utanMobil = false } = {}) {
  const page = await browser.newPage({ viewport: { width: bredd, height: hojd } });
  const laddade = [];
  page.on('request', r => laddade.push(r.url()));
  if (utanMobil) await page.route(/vyra-mobil\.(js|css)/, r => r.abort());
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  // projectLocalSession() FORE seedningen, annars ar save() 'not-writable' (docs/tech-debt.md §16).
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await seedaStudioState(page, ['catalog:topgift', 'catalog:battlemvp:inferno'],
    { placering: [{ x: 40, y: 60 }, { x: 120, y: 420 }] });
  await page.waitForTimeout(800);
  page.laddade = laddade;
  return page;
}

const ruta = sel => document.querySelector(sel) && (r => ({ l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }))(document.querySelector(sel).getBoundingClientRect());

/* ---- 390 x 844 ------------------------------------------------------------------------------ */

test('390 x 844: duken syns helt inom bredden och sidan rullar inte i sidled', { skip, timeout: 120000 }, async () => {
  const page = await layouten(390, 844);
  try {
    const m = await page.evaluate(ruta => {
      const r = new Function('sel', 'return (' + ruta + ')(sel)');
      return {
        bredd: innerWidth,
        docSW: document.documentElement.scrollWidth, bodySW: document.body.scrollWidth,
        main: r('main'), workarea: r('.workarea'), canvas: r('.canvas'),
        waSW: document.querySelector('.workarea') && document.querySelector('.workarea').scrollWidth,
        waCW: document.querySelector('.workarea') && document.querySelector('.workarea').clientWidth,
      };
    }, ruta.toString());
    assert.ok(m.workarea && m.workarea.w > 300, `arbetsytan syns inte: ${JSON.stringify(m.workarea)}`);
    assert.ok(m.workarea.l >= 0 && m.workarea.r <= m.bredd, `arbetsytan ligger utanfor bredden: ${JSON.stringify(m.workarea)}`);
    assert.ok(m.canvas.l >= 0 && m.canvas.r <= m.bredd + 0.5, `duken ar klippt i sidled: ${JSON.stringify(m.canvas)}`);
    assert.ok(m.canvas.w > 0.75 * m.bredd, `duken ar onodigt liten: ${Math.round(m.canvas.w)} px`);
    assert.ok(m.main.l >= 0 && m.main.r <= m.bredd, `main ar bredare an fonstret: ${JSON.stringify(m.main)}`);
    assert.ok(m.docSW <= m.bredd && m.bodySW <= m.bredd, `sidan rullar i sidled: ${m.docSW}/${m.bodySW} mot ${m.bredd}`);
    assert.ok(m.waSW <= m.waCW + 1, `arbetsytan har en vagrat rullningslist: ${m.waSW} mot ${m.waCW}`);
  } finally { await page.close(); }
});

test('390 x 844: flikarna Lager / Duk / Egenskaper visar en yta i taget', { skip, timeout: 120000 }, async () => {
  const page = await layouten(390, 844);
  try {
    const flikar = await page.evaluate(() => [...document.querySelectorAll('[role="tablist"] [role="tab"]')]
      .map(k => ({ text: k.textContent.trim(), h: k.getBoundingClientRect().height, w: k.getBoundingClientRect().width })));
    assert.deepEqual(flikar.map(f => f.text), ['Lager', 'Duk', 'Egenskaper']);
    flikar.forEach(f => assert.ok(f.h >= 44 && f.w >= 44, `fliken ${f.text} ar mindre an 44 px: ${f.w}x${f.h}`));

    const synligt = () => page.evaluate(() => {
      const syns = sel => { const e = document.querySelector('.editor-shell>' + sel); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth + 0.5; };
      return { lager: syns('.elements'), duk: syns('.workarea'), egenskaper: syns('.properties'),
        vald: (document.querySelector('[role="tab"][aria-selected="true"]') || {}).textContent };
    });
    assert.deepEqual(await synligt(), { lager: false, duk: true, egenskaper: false, vald: 'Duk' }, 'duken ska vara forvald');
    await page.click('[role="tab"]:has-text("Lager")');
    assert.deepEqual(await synligt(), { lager: true, duk: false, egenskaper: false, vald: 'Lager' });
    await page.click('[role="tab"]:has-text("Egenskaper")');
    assert.deepEqual(await synligt(), { lager: false, duk: false, egenskaper: true, vald: 'Egenskaper' });
    await page.click('[role="tab"]:has-text("Duk")');
    assert.deepEqual(await synligt(), { lager: false, duk: true, egenskaper: false, vald: 'Duk' });

    // Valet overlever en render: layout-safe.js skriver om hela #view vid varje val.
    await page.click('[role="tab"]:has-text("Egenskaper")');
    await page.evaluate(() => render());
    await page.waitForTimeout(200);
    assert.equal((await synligt()).egenskaper, true, 'en render tappade valet av yta');
  } finally { await page.close(); }
});

test('390 x 844: en vald widget pa duken leder till dess egenskaper', { skip, timeout: 120000 }, async () => {
  const page = await layouten(390, 844);
  try {
    await page.evaluate(() => { selected = null; render(); });
    await page.waitForTimeout(200);
    assert.equal(await page.isVisible('.vy-till-egenskaper'), false, 'knappen syns utan vald widget');
    await page.click('.canvas .widget');
    await page.waitForTimeout(300);
    const k = await page.evaluate(() => { const b = document.querySelector('.vy-till-egenskaper'); const r = b.getBoundingClientRect(); return { syns: !b.hidden && r.width > 0, h: r.height, r: r.right, text: b.textContent }; });
    assert.ok(k.syns, 'ingen vag till egenskaperna efter att en widget valts');
    assert.ok(k.h >= 44 && k.r <= 390, `knappen ar for liten eller utanfor: ${JSON.stringify(k)}`);
    await page.click('.vy-till-egenskaper');
    await page.waitForTimeout(200);
    const efter = await page.evaluate(() => ({
      vald: (document.querySelector('[role="tab"][aria-selected="true"]') || {}).textContent,
      bredd: document.querySelector('.editor-shell>.properties').getBoundingClientRect().width,
    }));
    assert.equal(efter.vald, 'Egenskaper');
    assert.ok(efter.bredd > 300, 'egenskaperna syns inte');
  } finally { await page.close(); }
});

test('390 x 844: sidomenyn oppnas, stangs och stanger sig efter val', { skip, timeout: 120000 }, async () => {
  const page = await layouten(390, 844);
  try {
    const meny = () => page.evaluate(() => {
      const a = document.querySelector('body>aside').getBoundingClientRect();
      const k = document.querySelector('[aria-controls][aria-expanded]');
      return { syns: a.right > 0 && getComputedStyle(document.querySelector('body>aside')).visibility === 'visible',
        expanded: k && k.getAttribute('aria-expanded'), knapp: k && k.getBoundingClientRect().toJSON(), main: document.querySelector('main').getBoundingClientRect().left };
    });
    let m = await meny();
    assert.equal(m.syns, false, 'sidomenyn tar plats nar den ar stangd');
    assert.equal(m.main, 0, 'main borjar inte vid vansterkanten');
    assert.ok(m.knapp.width >= 44 && m.knapp.height >= 44, `menyknappen ar mindre an 44 px: ${m.knapp.width}x${m.knapp.height}`);

    await page.click('#vyMenyKnapp');
    await page.waitForTimeout(350);
    m = await meny();
    assert.deepEqual([m.syns, m.expanded], [true, 'true'], 'menyn oppnades inte');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    m = await meny();
    assert.deepEqual([m.syns, m.expanded], [false, 'false'], 'Escape stangde inte menyn');
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'vyMenyKnapp', 'fokus gick inte tillbaka till menyknappen');

    await page.click('#vyMenyKnapp');
    await page.waitForTimeout(350);
    await page.click('.vy-meny-skugga', { position: { x: 360, y: 400 } });
    await page.waitForTimeout(350);
    assert.equal((await meny()).syns, false, 'ett tryck utanfor stangde inte menyn');

    await page.click('#vyMenyKnapp');
    await page.waitForTimeout(350);
    await page.click('aside [data-view="overlay"]');
    await page.waitForTimeout(500);
    m = await meny();
    assert.equal(m.syns, false, 'menyn stangde sig inte efter val');
    assert.equal(await page.evaluate(() => view), 'overlay', 'valet i menyn byttes inte till');
    assert.equal(await page.isVisible('[role="tablist"]'), false, 'flikraden syns utanfor layoutlaget');
  } finally { await page.close(); }
});

/* ---- >= 768 px: oforandrat ------------------------------------------------------------------ */

// Strukturens rektanglar: skalet, menyn, huvudet, editorns tre ytor och allt i dem utom dukens
// INNEHALL (widgetarnas animationer ar inte layout och hade gjort jamforelsen flakig).
function geometri() {
  const urval = ['html', 'body', 'body>aside', 'body>aside *', 'main', 'main>header', 'main>header *', '#view',
    '.editor-shell', '.editor-shell>*', '.elements *', '.properties *', '.editor-toolbar *', '.overlay-link-bar *', '.canvas'];
  const ut = [];
  const sett = new Set();
  for (const sel of urval) document.querySelectorAll(sel).forEach(e => {
    if (sett.has(e)) return;
    sett.add(e);
    const r = e.getBoundingClientRect();
    ut.push(`${sel} ${e.tagName}.${String(e.className).slice(0, 40)}#${e.id} ${r.left.toFixed(2)},${r.top.toFixed(2)},${r.width.toFixed(2)},${r.height.toFixed(2)}`);
  });
  return { rader: ut, docSW: document.documentElement.scrollWidth, docSH: document.documentElement.scrollHeight,
    zoom: window.VyraZoom ? window.VyraZoom.niva() : null };
}

for (const [bredd, hojd] of [[1440, 900], [800, 900], [768, 900]]) {
  test(`${bredd} x ${hojd}: geometrin ar densamma med och utan vyra-mobil.js`, { skip, timeout: 180000 }, async () => {
    const utan = await layouten(bredd, hojd, { utanMobil: true });
    let fore;
    try { fore = await utan.evaluate(geometri); } finally { await utan.close(); }
    const med = await layouten(bredd, hojd);
    try {
      assert.ok(med.laddade.some(u => /vyra-mobil\.js/.test(u)), 'vyra-mobil.js laddades aldrig — jamforelsen hade varit tom');
      const efter = await med.evaluate(geometri);
      assert.ok(fore.rader.length > 100, `for fa element att jamfora: ${fore.rader.length}`);
      const skillnad = efter.rader.filter((r, i) => r !== fore.rader[i]).slice(0, 5);
      assert.equal(efter.rader.length, fore.rader.length, 'antalet element andrades');
      assert.deepEqual(skillnad, [], 'layouten andrades pa desktop');
      assert.deepEqual([efter.docSW, efter.docSH, efter.zoom], [fore.docSW, fore.docSH, fore.zoom]);
      assert.equal(await med.evaluate(() => document.documentElement.classList.contains('vy-mobil')), false);
    } finally { await med.close(); }
  });
}

test('fran 390 till 1440 px: smal-lagets klass, zoom och flikrad slapper', { skip, timeout: 120000 }, async () => {
  const page = await layouten(1440, 900);
  try {
    const zoomFore = await page.evaluate(() => window.VyraZoom.niva());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('vy-mobil')), true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => ({
      klass: document.documentElement.classList.contains('vy-mobil'),
      flikar: (() => { const e = document.querySelector('.vy-mobilflikar'); return e ? e.getBoundingClientRect().height : 0; })(),
      knapp: (() => { const e = document.querySelector('#vyMenyKnapp'); return e ? e.getBoundingClientRect().width : 0; })(),
      zoom: window.VyraZoom.niva(),
      aside: document.querySelector('body>aside').getBoundingClientRect().width,
    }));
    assert.deepEqual(m, { klass: false, flikar: 0, knapp: 0, zoom: zoomFore, aside: 210 });
  } finally { await page.close(); }
});

/* ---- overlay-laget -------------------------------------------------------------------------- */

test('?overlay=1 pa 390 x 844: ingen flikrad, ingen hamburgare och ingen andring', { skip, timeout: 120000 }, async () => {
  const las = async utanMobil => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const laddade = [];
    page.on('request', r => laddade.push(r.url()));
    if (utanMobil) await page.route(/vyra-mobil\.(js|css)/, r => r.abort());
    try {
      await page.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
      await page.waitForTimeout(3000);
      const m = await page.evaluate(() => {
        const r = sel => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(v => v.toFixed(2)).join(','); };
        return {
          html: r('html'), body: r('body'), main: r('main'), view: r('#view'), canvas: r('.canvas'),
          bakgrund: [getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body).backgroundColor],
          klass: document.documentElement.className,
          flikrad: !!document.querySelector('.vy-mobilflikar, [role="tablist"]'),
          hamburgare: !!document.querySelector('#vyMenyKnapp, .vy-menyknapp'),
          mobilCss: !!document.querySelector('link[data-vy-mobil]'),
        };
      });
      return { m, laddade };
    } finally { await page.close(); }
  };
  const utan = await las(true), med = await las(false);
  // Filen laddas av media.js aven i overlay-laget och ska sjalv avsta — annars provar provet ingenting.
  assert.ok(med.laddade.some(u => /vyra-mobil.js/.test(u)), 'vyra-mobil.js begardes aldrig i overlay-laget');
  assert.equal(med.m.flikrad, false, 'flikraden ritades i overlay-laget');
  assert.equal(med.m.hamburgare, false, 'menyknappen ritades i overlay-laget');
  assert.equal(med.m.mobilCss, false, 'mobil-CSS:en laddades i overlay-laget');
  assert.ok(!/vy-mobil/.test(med.m.klass), 'smal-lagets klass sattes i overlay-laget');
  assert.deepEqual(med.m, utan.m, 'overlay-laget andrades');
});
