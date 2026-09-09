'use strict';
// TÖM WIDGET, OCH EN TOM WIDGET SYNS INTE I SÄNDNINGEN — RÖTT FÖRST (2026-09-09).
//
// DAVIDS BESLUT: "vi ska ha töma widget och profilbild och använder namn kommer när första giften
// kommer", och på frågan om beteendet: töm automatiskt när en ny sändning startar, och en tom
// widget ska vara HELT OSYNLIG i sändningen.
//
// VARFÖR DET BEHÖVS. Två skrivare fyller Top Gift och Top Streak med riktiga tittare:
// live-leaderboard.js (rad 199-202) och gift-event-images.js (rad 218-232). Båda sparar sedan
// layouten. Efter en sändning står alltså en riktig persons namn och avatar kvar i widgeten, och
// nästa gång studion öppnas ser David deras namn i stället för "@StreamQueen". Gåvorekordet
// (records.giftCoins / records.streakCount) nollställs redan vid live:start i gift-event-images.js
// — men widgetens data har ingen sådan nollställare alls.
//
// KONTRAKTET, tre delar:
//   1. Knappen "Töm widget" nollställer namn, värde, profilbild, gåvobild och gåvonamn.
//   2. En ny sändning (live:start) tömmer samma fält automatiskt, i takt med rekordet.
//   3. En tom widget renderas inte alls i overlay-läge. I EDITORN syns den fortfarande — annars
//      går det inte att rigga en widget man inte ser.
//
// Punkt 3 är den som lätt blir fel åt fel håll: att dölja den i editorn också hade gjort widgeten
// omöjlig att placera.
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

// De två familjer som livedata faktiskt skriver till.
const WIDGETS = ['catalog:topgift:premium:royal', 'catalog:topstreak:premium:liquid'];
const FALT = ['dataName', 'dataValue', 'profileImage', 'giftImage', 'giftName'];

async function studion(vy) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const url = `${bas}/studio.html?open=layout` + (vy === 'overlay' ? '&overlay=1' : '');
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#view'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  return page;
}

// Seedar en widget som om en sändning just fyllt den med en riktig tittare.
async function seedaFylld(page, nyckel) {
  await page.evaluate(n => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(n);
    w.x = 200; w.y = 200;
    w.dataName = '@EnRiktigTittare';
    w.dataValue = 12345;
    w.profileImage = 'assets/images/test/test-profile.png';
    w.giftImage = 'assets/gifts/events/0001_Rose.png';
    w.giftName = 'Rose';
    state.widgets.push(w);
    selected = w.id;
    render();
  }, nyckel);
  await page.waitForTimeout(700);
}

const las = page => page.evaluate(f => {
  const w = state.widgets[0], ut = {};
  for (const k of f) ut[k] = w[k] === undefined ? null : w[k];
  return ut;
}, FALT);

const kvarstaende = efter =>
  FALT.filter(f => efter[f] !== null && efter[f] !== '' && efter[f] !== 0);

for (const nyckel of WIDGETS) {
  test(`${nyckel}: knappen "Töm widget" nollställer tittarens data`, { skip }, async () => {
    const page = await studion('editor');
    try {
      await seedaFylld(page, nyckel);
      const fore = await las(page);
      assert.equal(fore.dataName, '@EnRiktigTittare', 'seedningen tog inte');

      const knapp = await page.evaluate(() => {
        const b = [...document.querySelectorAll('.properties button')]
          .find(x => /töm widget/i.test(x.textContent || ''));
        if (!b) return null;
        b.click();
        return b.textContent.trim();
      });
      assert.ok(knapp, `${nyckel}: hittade ingen knapp "Töm widget" i panelen`);
      await page.waitForTimeout(600);

      const kvar = kvarstaende(await las(page));
      assert.deepEqual(kvar, [], `${nyckel}: dessa fält stod kvar efter tömningen: ${kvar.join(', ')}`);
    } finally { await page.close(); }
  });

  test(`${nyckel}: en ny sändning tömmer widgeten automatiskt`, { skip }, async () => {
    const page = await studion('editor');
    try {
      await seedaFylld(page, nyckel);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('vyra-live-session',
        { detail: { event: 'live:start' } })));
      await page.waitForTimeout(700);

      const kvar = kvarstaende(await las(page));
      assert.deepEqual(kvar, [],
        `${nyckel}: live:start lämnade kvar ${kvar.join(', ')} — gåvorekordet nollställs där, `
        + 'widgetens data måste följa med');
    } finally { await page.close(); }
  });

  test(`${nyckel}: tom widget syns inte i overlay men syns i editorn`, { skip }, async () => {
    // I EDITORN måste en tom widget synas, annars går den inte att placera.
    const editorn = await studion('editor');
    try {
      const iEditorn = await editorn.evaluate(n => {
        state.widgets.length = 0;
        const w = window.VyraWidgets.create(n);
        w.x = 200; w.y = 200;
        for (const k of ['dataName', 'dataValue', 'profileImage', 'giftImage', 'giftName']) delete w[k];
        state.widgets.push(w); selected = w.id;
        render();
        const el = document.querySelector('[data-id="' + w.id + '"]');
        if (!el) return { finns: false };
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        return { finns: true, synlig: cs.display !== 'none' && r.width > 0 && r.height > 0 };
      }, nyckel);
      assert.equal(iEditorn.finns, true, `${nyckel}: tom widget renderades inte alls i editorn`);
      assert.equal(iEditorn.synlig, true,
        `${nyckel}: tom widget är osynlig i EDITORN — då går den inte att placera`);
    } finally { await editorn.close(); }

    // I OVERLAY ska den inte synas alls.
    const overlay = await studion('overlay');
    try {
      const iOverlay = await overlay.evaluate(n => {
        state.widgets.length = 0;
        const w = window.VyraWidgets.create(n);
        w.x = 200; w.y = 200;
        for (const k of ['dataName', 'dataValue', 'profileImage', 'giftImage', 'giftName']) delete w[k];
        state.widgets.push(w); selected = null;
        render();
        const el = document.querySelector('[data-id="' + w.id + '"]');
        if (!el) return { synlig: false, hur: 'renderades inte' };
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        return {
          synlig: cs.display !== 'none' && cs.visibility !== 'hidden'
            && Number(cs.opacity) > 0 && r.width > 0 && r.height > 0,
          hur: `display=${cs.display} opacity=${cs.opacity} ${Math.round(r.width)}x${Math.round(r.height)}`,
        };
      }, nyckel);
      assert.equal(iOverlay.synlig, false,
        `${nyckel}: tom widget SYNS i overlay (${iOverlay.hur}) — tittarna ska inte se en tom plats`);
    } finally { await overlay.close(); }
  });
}
