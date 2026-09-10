'use strict';
// PROFILBILD OCH GÅVOBILD LIGGER INTE FRAMME — RÖTT FÖRST (2026-09-10).
//
// David, om de två fälten i INNEHÅLL: *"måste de vara synliga?"*
//
// Nej. Uppmätt 2026-09-10:
//   * TikTok skriver över båda vid första gåvan — `person.profileImage || w.profileImage`
//   * En widget med TOMMA fält renderar exakt samma bilder, eftersom renderaren anropar
//     `safeImg(w.profileImage, fallbackProfile)` och har en egen reservbild
//   * Det är sökvägar man skriver för hand, i ett fält man rör en gång eller aldrig
// Kvar finns ett enda syfte: att välja en EGEN reservbild som visas innan första gåvan. Sällsynt,
// men inte värdelöst — därför göms fälten i stället för att tas bort, samma val som "Töm widget".
//
// VILKA FÄLT, OCH VARFÖR INTE FLER. Regeln läser etiketten och kräver att den BÖRJAR med
// "Profilbild" eller "Gåvobild". En vidare regel på "bild" eller "url" fångade tre fält som måste
// stanna:
//   * Egen bild-widgetens "Bild" — det är widgetens HELA innehåll, inte en reserv
//   * "Video-URL" under VIDEO PER NIVÅ — en egen widgetfunktion i en egen grupp
//   * kryssrutan "Profil" och reglaget "Profil/gåva" — de handlar om att visa och skala, inte om
//     någon sökväg alls
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
  await page.waitForTimeout(900);
  return page;
}

// Widget, fält-id, och vad etiketten börjar med.
const GOMS = [
  ['catalog:topgift:premium:royal', 'pfTopGiftProfile'],
  ['catalog:topgift:premium:royal', 'pfTopGiftGift'],
  ['catalog:topstreak:premium:liquid', 'pfStreakProfile'],
  ['catalog:followeralert', 'followProfile'],
  ['catalog:fanlevel:gold', 'fanProfile'],
  ['catalog:battlemvp:inferno', 'mvpProfile'],
];

// Fält som INTE får hamna i gruppen.
const STANNAR = [
  ['catalog:custom:image', 'cwFile', 'widgetens hela innehåll, inte en reservbild'],
  ['catalog:fanlevel:gold', 'fanLevelVideoUrl', 'en egen funktion i en egen grupp'],
];

const gruppFor = (page, id) => page.evaluate(f => {
  const el = document.querySelector('.properties #' + f);
  if (!el) return { finns: false };
  const g = el.closest('.property-group');
  return {
    finns: true,
    grupp: g ? (g.querySelector('h4, .pg-toggle')?.textContent || '').replace(/[▸▾›]/g, '').trim() : '(ingen grupp)',
    hopfalld: !!(g && g.classList.contains('collapsible') && !g.classList.contains('open')),
  };
}, id);

for (const [nyckel, falt] of GOMS) {
  test(`${nyckel} #${falt}: ligger i en hopfälld BILDER-grupp`, { skip }, async () => {
    const page = await panelen(nyckel);
    try {
      const ut = await gruppFor(page, falt);
      assert.ok(ut.finns, `${nyckel}: fältet #${falt} finns inte i panelen`);
      assert.match(ut.grupp, /^BILDER/,
        `${nyckel}: #${falt} ligger i "${ut.grupp}", inte i BILDER`);
      assert.equal(ut.hopfalld, true,
        `${nyckel}: BILDER-gruppen är utfälld — fälten ska finnas, inte ligga framme`);
    } finally { await page.close(); }
  });
}

for (const [nyckel, falt, varfor] of STANNAR) {
  test(`${nyckel} #${falt}: flyttas INTE (${varfor})`, { skip }, async () => {
    const page = await panelen(nyckel);
    try {
      const ut = await gruppFor(page, falt);
      assert.ok(ut.finns, `${nyckel}: fältet #${falt} finns inte i panelen`);
      assert.doesNotMatch(ut.grupp, /^BILDER/,
        `${nyckel}: #${falt} hamnade i BILDER, men är ${varfor}`);
    } finally { await page.close(); }
  });
}

test('en tom profilbild ändrar inte hur widgeten ser ut', { skip }, async () => {
  // Grunden för hela beslutet: fälten kan gömmas eftersom renderaren har en egen reservbild.
  // Skulle den försvinna vore det rätt att visa fälten igen, och då ska det här provet falla.
  const page = await panelen('catalog:topgift:premium:royal');
  try {
    const ut = await page.evaluate(() => {
      const las = () => [...document.querySelectorAll('.canvas [data-id] img')]
        .map(i => i.getAttribute('src') || '');
      const med = las();
      const w = state.widgets[0];
      delete w.profileImage; delete w.giftImage;
      render();
      return { med, utan: las() };
    });
    assert.ok(ut.med.length >= 2, 'hittade inte widgetens bilder');
    assert.deepEqual(ut.utan, ut.med,
      'widgeten ritar andra bilder när fälten är tomma — då är fälten inte längre en ren reserv');
  } finally { await page.close(); }
});
