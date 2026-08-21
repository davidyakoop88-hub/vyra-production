'use strict';
// OVERLAYLÄNKEN MÅSTE GÅ ATT LÄSA — den ska klistras in i OBS.
//
// Davids buggrapport 2026-08-21: "halva länken syns inte". UPPMÄTT i editorvyn med en riktig
// token-länk:
//
//   1920 px vy   fältet 1009 px, innehållet 1007   ryms
//   1440 px vy   fältet  529 px, innehållet  527   ryms med 2 px
//   1280 px vy   fältet  369 px, innehållet  389   KLIPPT
//
// Raden är fem kolumner: väljare + fält + fyra knappar. Knapparna tar 449 px, plus gap och en
// 170 px väljare — under ~1500 px finns det inte plats för hela adressen. Att bara krympa
// väljaren flyttar gränsen några tiotal pixlar; det löser inte problemet.
//
// Länken får därför hela bredden på egen rad under 1500 px, och knapparna flyttar ner.
//
// PROVET MÄTER TVÅ SAKER, för fixen kan gå sönder åt två håll:
//   1. länken får inte vara klippt
//   2. knapparna får inte hamna utanför skärmen när raden blir högre
//
// Det andra hände faktiskt under bygget: `.overlay-link-bar{height:132px!important}` tog inte,
// eftersom `body:has(.editor-shell) .overlay-link-bar{height:68px!important}` har högre
// specificitet. Raden blev 68 px hög medan innehållet krävde 128, och knapparna hamnade på y=962
// i en 900 px vy. Det syns inte i koden och knappt i en skärmbild.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');

const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.json': 'application/json', '.woff2': 'font/woff2' };

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
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// Formen är uppmätt ur produktionen: overlay-länkarna bär en permanent åtkomsttoken, så de är
// betydligt längre än den korta localhost-adressen riggen annars får. Ett prov mot den korta
// adressen hade varit grönt hela tiden — den ryms alltid.
const RIKTIG_LANK = 'https://vyralive.app/overlay.html?access=8f3c1d7a94b25e60af11c8d3e7b409';

async function editornMedLank(bredd) {
  const page = await browser.newPage({ viewport: { width: bredd, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ccReady === '1',
    null, { timeout: 20000 });
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('aside nav a')]
      .find(e => (e.textContent || '').trim().startsWith('Layout'));
    if (el) el.click();
  });
  await page.waitForSelector('.overlay-link-bar', { timeout: 10000 });
  await page.evaluate(l => {
    const inp = document.querySelector('.overlay-link-bar input');
    if (inp) inp.value = l;
  }, RIKTIG_LANK);
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  return page;
}

const BREDDER = [1280, 1440, 1680, 1920];

test('hela overlaylanken syns, i alla fonsterbredder', { skip, timeout: 120000 }, async () => {
  for (const bredd of BREDDER) {
    const page = await editornMedLank(bredd);
    const m = await page.evaluate(() => {
      const inp = document.querySelector('.overlay-link-bar input');
      if (!inp) return { saknas: true };
      return { falt: Math.round(inp.clientWidth), innehall: inp.scrollWidth,
               klippt: inp.scrollWidth > inp.clientWidth + 1 };
    });
    await page.close();
    assert.ok(!m.saknas, `inget lankfalt vid ${bredd} px`);
    assert.equal(m.klippt, false,
      `lanken ar klippt vid ${bredd} px vy: faltet ar ${m.falt} px men adressen behover `
      + `${m.innehall}. Lanken ska klistras in i OBS — halva adressen ar vardelos.`);
  }
});

test('knapparna hamnar inte utanfor skarmen nar raden blir hogre', { skip, timeout: 120000 },
  async () => {
  // Fixen gor raden hogre pa smala fonster. Blir den for hog hamnar knapparna under vecket, och
  // raden ar fixed sa det gar inte att rulla dit. Det hande under bygget (y=962 i en 900 px vy).
  for (const bredd of BREDDER) {
    const page = await editornMedLank(bredd);
    const m = await page.evaluate(() => {
      const bar = document.querySelector('.overlay-link-bar');
      const r = bar.getBoundingClientRect();
      return {
        barBotten: Math.round(r.bottom), barTop: Math.round(r.top),
        barHojd: Math.round(r.height), innehall: bar.scrollHeight,
        utanfor: [...bar.querySelectorAll('button')]
          .filter(k => k.getBoundingClientRect().height > 2)
          .filter(k => Math.round(k.getBoundingClientRect().bottom) > innerHeight)
          .map(k => (k.textContent || '').trim().slice(0, 18)),
        vy: innerHeight
      };
    });
    await page.close();
    assert.deepEqual(m.utanfor, [],
      `knappar utanfor skarmen vid ${bredd} px: ${m.utanfor.join(', ')}. Raden ar ${m.barHojd} px `
      + `hog med ${m.innehall} px innehall och slutar pa y=${m.barBotten} i en ${m.vy} px vy.`);
    // HOJDEN, inte bara bredden. Davids skarmbild 2026-08-21 visade valjaren och adressfaltet
    // halva: raden var 68 px hog medan innehallet krävde 80, och de tolv pixlarna spillde ut
    // NEDANFOR. Raden ar position:fixed med bottom:0, sa det gick inte att rulla fram dem.
    // Faltet var inte klippt i sidled i det laget — provet ovan var gront hela tiden.
    assert.ok(m.barHojd + 1 >= m.innehall,
      `raden ar ${m.barHojd} px men innehallet kraver ${m.innehall} — nagot spiller ut nedanfor. `
      + 'Kontrollera att hojdregeln har minst lika hog specificitet som '
      + 'body:has(.editor-shell) .overlay-link-bar.');
  }
});
