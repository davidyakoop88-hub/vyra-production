'use strict';
// BAKGRUNDEN FÅR FÄRG, HÖRN OCH INNERKANT — RÖTT FÖRST (2026-09-09).
//
// DAVIDS ORD om Egen text: "jag vill lägga till bakrund bakom test". Mätningen bekräftade att det
// inte gick: `.custom-text-widget{background:transparent!important}` i studio.css, och den enda
// bakgrundskontroll som fanns — widget-background.js — kunde bara välja hur SVART bakgrunden skulle
// vara (`rgba(0,0,0,${bgStrength/100})`). Ingen färg, ingen hörnradie, ingen luft mellan text och
// kant. Av 21 widgetfamiljer hade 0 en riktig bakgrund bakom texten.
//
// VARFÖR DET SPELAR ROLL PÅ TIKTOK: vit text mot en ljus video är oläslig. En platta bakom texten
// är det som gör overlayen läsbar mot rörligt underlag, och är därför inte en dekoration.
//
// KONTRAKTET: färg med genomskinlighet, hörnradie och innerkant, på ALLA widgets — samma grupp
// överallt, precis som textgruppen. Genomskinligheten återanvänder `bgStrength`, som redan finns
// och redan är sparad i användarnas layouter; den betyder nu "hur ogenomskinlig plattan är",
// vilket är exakt vad den betydde förut, bara att färgen inte längre måste vara svart.
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

// catalog:custom:text ligger först med flit: den är hårdkodad transparent i CSS och är därför det
// enda fall som bevisar att inline-stilen faktiskt vinner.
const WIDGETS = [
  'catalog:custom:text',
  'catalog:topgift:premium:royal',
  'catalog:toplike:clean',
  'catalog:lastx:card',
  'catalog:heartgoal:classic',
];

async function editorn() {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  return page;
}

async function seeda(page, nyckel, falt) {
  await page.evaluate(([n, f]) => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(n);
    w.x = 200; w.y = 200;
    Object.assign(w, f || {});
    state.widgets.push(w);
    selected = w.id;
    render();
  }, [nyckel, falt]);
  await page.waitForTimeout(700);
}

const ytan = page => page.evaluate(() => {
  const el = document.querySelector(`.canvas [data-id="${state.widgets[0].id}"]`);
  if (!el) return null;
  const cs = getComputedStyle(el);
  return {
    bakgrund: cs.backgroundColor,
    horn: parseFloat(cs.borderTopLeftRadius) || 0,
    innerkant: parseFloat(cs.paddingTop) || 0,
  };
});

// "rgb(17, 34, 51)" / "rgba(17, 34, 51, 0.5)" -> [17,34,51,alpha]
function delar(farg) {
  const m = String(farg).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const t = m[1].split(',').map(x => parseFloat(x.trim()));
  return { r: t[0], g: t[1], b: t[2], a: t.length > 3 ? t[3] : 1 };
}

for (const nyckel of WIDGETS) {
  test(`${nyckel}: bakgrundsfärgen slår igenom`, { skip }, async () => {
    const page = await editorn();
    try {
      await seeda(page, nyckel, { bgColor: '#112233', bgStrength: 100 });
      const yta = await ytan(page);
      assert.ok(yta, `${nyckel}: widgeten renderades inte`);
      const f = delar(yta.bakgrund);
      assert.ok(f, `${nyckel}: kunde inte läsa bakgrunden (${yta.bakgrund})`);
      assert.deepEqual([f.r, f.g, f.b], [17, 34, 51],
        `${nyckel}: bakgrunden blev ${yta.bakgrund}, inte #112233`);
    } finally { await page.close(); }
  });

  test(`${nyckel}: genomskinligheten gäller den valda färgen`, { skip }, async () => {
    const page = await editorn();
    try {
      await seeda(page, nyckel, { bgColor: '#112233', bgStrength: 40 });
      const yta = await ytan(page);
      const f = delar(yta.bakgrund);
      assert.ok(f, `${nyckel}: kunde inte läsa bakgrunden (${yta.bakgrund})`);
      assert.deepEqual([f.r, f.g, f.b], [17, 34, 51],
        `${nyckel}: färgen tappades när styrkan sattes (${yta.bakgrund})`);
      assert.ok(Math.abs(f.a - 0.4) < 0.03,
        `${nyckel}: genomskinligheten blev ${f.a}, väntade 0,4`);
    } finally { await page.close(); }
  });

  test(`${nyckel}: hörnradie och innerkant slår igenom`, { skip }, async () => {
    const page = await editorn();
    try {
      await seeda(page, nyckel, { bgColor: '#112233', bgRadius: 22, bgPadding: 14 });
      const yta = await ytan(page);
      assert.ok(Math.abs(yta.horn - 22) < 1,
        `${nyckel}: hörnradien blev ${yta.horn}px, väntade 22`);
      assert.ok(Math.abs(yta.innerkant - 14) < 1,
        `${nyckel}: innerkanten blev ${yta.innerkant}px, väntade 14`);
    } finally { await page.close(); }
  });

  test(`${nyckel}: "Ta bort bakgrund" vinner över färgvalet`, { skip }, async () => {
    // Ordningen mellan de två är inte självklar och måste vara låst: kryssrutan är en nödbroms och
    // ska gälla även när en färg står kvar i fälten.
    const page = await editorn();
    try {
      await seeda(page, nyckel, { bgColor: '#112233', bgStrength: 100, hideBackground: true });
      const f = delar((await ytan(page)).bakgrund);
      assert.ok(f && f.a === 0,
        `${nyckel}: bakgrunden syns fortfarande trots "Ta bort bakgrund" (${JSON.stringify(f)})`);
    } finally { await page.close(); }
  });
}

test('panelen har färg, hörn och innerkant i BAKGRUND-gruppen', { skip }, async () => {
  const page = await editorn();
  try {
    await seeda(page, 'catalog:custom:text');
    const kontroller = await page.evaluate(() => {
      const g = [...document.querySelectorAll('.properties .property-group')]
        .find(x => /^BAKGRUND/i.test((x.querySelector('h4, .pg-toggle')?.textContent || '').trim()));
      if (!g) return null;
      return [...g.querySelectorAll('input, select')].map(el => el.id).filter(Boolean);
    });
    assert.ok(kontroller, 'ingen BAKGRUND-grupp i panelen');
    for (const id of ['wbColor', 'wbRadius', 'wbPadding']) {
      assert.ok(kontroller.includes(id),
        `BAKGRUND-gruppen saknar #${id}. Den har: ${kontroller.join(', ')}`);
    }
  } finally { await page.close(); }
});
