'use strict';
// Radavståndet i Top Like-listan med profilram får inte växa för varje placeringspass — skrivet
// RÖTT FÖRST (2026-09-08), mot Davids skärmbild: tre rader med amethyst-oracle och ett gap mellan
// dem nästan lika stort som raden själv.
//
// UPPMÄTT FÖRE, like-clean + amethyst-oracle (foto 58 px, konst 119,7 px):
//   konsten sticker ut 40,8 px över raden och 11,0 px under — men raden fick margin-top 81,5 och
//   margin-bottom 21,9, exakt DUBBELT, och varje extra anrop av vyraPlaceraTopLikeRamar lade på
//   ytterligare 40,8 + 11,0. Radavståndet blev 177,5 px i stället för 125,7, och 229 / 281 / 333
//   efter ett, två, tre pass till.
//
// ORSAKEN: steg 2 i vyraPlaceraTopLikeRamar (media.js) ADDERADE utsticket till radens befintliga
// marginal. Konstens läge i raden beror inte på radens marginal, så varje pass mäter samma utstick
// och adderar det igen — och passet körs minst två gånger per render: en gång från render() och en
// gång från ResizeObserverns första anrop vid observe().
//
// KONTRAKTET: marginalen SÄTTS till utsticket. Grannramarna ska stå listans gap (6 px) från
// varandra, konst mot konst, oavsett hur många pass som körts.
//
// VARFÖR RIKTIG WEBBLÄSARE: pixelmått av getBoundingClientRect efter async-injicerade ramfiler.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

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

// Samma rigg som ram-ror-inte-bildmatt: editorn direkt, 2500 ms för de injicerade ramfilerna,
// animationer av så att måtten är vilolägen.
async function editorMedToplike(tema, ram) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: '.canvas .widget, .canvas .widget *, .canvas .widget *:before, .canvas .widget *:after { animation: none !important; transition: none !important; }' });
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(([tema, ram]) => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:toplike:' + tema);
    w.x = 100; w.y = 60; w.likeCount = 3; w.profileFrame = ram;
    state.widgets.push(w);
    selected = w.id;
    render();
  }, [tema, ram]);
  // Både render() och observerns första anrop ska ha hunnit köra — det är just dubbelkörningen provet mäter.
  await page.waitForTimeout(1500);
  return page;
}

// Konstens och radernas rutor, i skärm-px.
const mat = page => page.evaluate(() => {
  const px = el => el.getBoundingClientRect();
  return [...document.querySelectorAll('.canvas .widget.vyra-toplike .toplike-row')].map(rad => {
    const art = rad.querySelector('img.tl-frame-art');
    const r = px(rad), a = art ? px(art) : null;
    return { top: r.top, bottom: r.bottom, art: a && { top: a.top, bottom: a.bottom, height: a.height } };
  });
});

const GAP = 6; // profile-frames-premium.css: .vyra-toplike:not(.like-center)>.toplike-list{gap:6px}

test('like-clean + amethyst-oracle: grannramarna står listans gap från varandra, inte dubbla utsticket', { skip }, async () => {
  const page = await editorMedToplike('clean', 'amethyst-oracle');
  const rader = await mat(page);
  assert.equal(rader.length, 3, 'tre rader');
  assert.ok(rader.every(r => r.art), 'varje rad har ramkonst');
  for (let i = 1; i < rader.length; i++) {
    const luft = rader[i].art.top - rader[i - 1].art.bottom;
    assert.ok(Math.abs(luft - GAP) <= 1.5,
      `rad ${i}→${i + 1}: luften mellan ramarna är ${luft.toFixed(1)} px, förväntat ${GAP} ± 1,5 (konsten ${rader[i].art.height.toFixed(1)} px hög)`);
  }
  await page.close();
});

test('like-clean + amethyst-oracle: tre extra placeringspass flyttar inte en enda rad', { skip }, async () => {
  const page = await editorMedToplike('clean', 'amethyst-oracle');
  const fore = await mat(page);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => vyraPlaceraTopLikeRamar(false));
    await page.waitForTimeout(100);
  }
  const efter = await mat(page);
  fore.forEach((r, i) => {
    assert.ok(Math.abs(efter[i].top - r.top) <= 0.5,
      `rad ${i + 1} flyttade ${(efter[i].top - r.top).toFixed(1)} px efter tre extra pass`);
  });
  await page.close();
});

test('like-center + amethyst-oracle: kollisionsknuffen är också stabil över pass, och ramarna går inte in i varandra', { skip }, async () => {
  const page = await editorMedToplike('center', 'amethyst-oracle');
  const fore = await mat(page);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => vyraPlaceraTopLikeRamar(false));
    await page.waitForTimeout(100);
  }
  const efter = await mat(page);
  fore.forEach((r, i) => {
    assert.ok(Math.abs(efter[i].top - r.top) <= 0.5,
      `like-center rad ${i + 1} flyttade ${(efter[i].top - r.top).toFixed(1)} px efter tre extra pass`);
  });
  // Ingen ramkonst får ligga vertikalt inne i en tidigare rads konst när de överlappar i sidled.
  const arter = await page.evaluate(() => [...document.querySelectorAll('.canvas .widget.vyra-toplike img.tl-frame-art')]
    .map(a => { const r = a.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
  for (let j = 1; j < arter.length; j++) for (let i = 0; i < j; i++) {
    const a = arter[j], b = arter[i];
    const kors = a.left < b.right && a.right > b.left && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
    assert.ok(!kors, `ram ${i + 1} och ${j + 1} går in i varandra`);
  }
  await page.close();
});
