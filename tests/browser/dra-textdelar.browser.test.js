'use strict';
// RUBRIK, NAMN OCH VÄRDE DRAS PÅ DUKEN — RÖTT FÖRST (2026-09-09).
//
// DAVIDS ORD om Top Likes sex nummerfält: "det jag tycker om man göra bättre". Och efter demon:
// "jag tycker om känslan jag vill den ska funka på top liks och top strake också".
//
// LÄGET FÖRE. Top Like och Ranking kunde flytta rubrik, namn och värde — men bara genom att skriva
// sex tal i en grupp på 285 px, utan att se vad man gjorde förrän efteråt. Top Gift och Top Streak
// kunde inte flytta något alls, trots att de har samma tre delar.
//
// KONTRAKTET:
//   1. Rubrik, namn och värde går att ta tag i och dra, i alla tre familjerna.
//   2. Draget skriver till SAMMA fält som nummerrutorna redan använder — titleOffsetX/Y,
//      nameOffsetX/Y, valueOffsetX/Y — så ångra fungerar och Top Likes befintliga panel
//      fortsätter styra samma sak.
//   3. Att dra en text flyttar inte widgeten. Det är den fällan mönstret har: duken lyssnar redan
//      på pointerdown för att flytta widgeten, och utan att stoppa den skulle båda röra sig.
//   4. Texten snappar mot widgetens mittlinje, och Skift stänger av snappen — samma regel som
//      gäller när man drar själva widgeten.
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

const WIDGETS = [
  'catalog:topgift:premium:royal',
  'catalog:topstreak:premium:liquid',
  'catalog:toplike:clean',
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

async function seeda(page, nyckel) {
  await page.evaluate(n => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(n);
    w.x = 320; w.y = 260;
    state.widgets.push(w);
    selected = w.id;
    render();
  }, nyckel);
  await page.waitForTimeout(700);
}

// Drar en av widgetens textdelar med riktiga pekarhändelser och returnerar vad som hände.
async function dra(page, roll, dx, dy, skift) {
  return page.evaluate(([r, x, y, s]) => {
    const rot = document.querySelector(`.canvas [data-id="${state.widgets[0].id}"]`);
    if (!rot) return { fel: 'widgeten renderades inte' };
    const del = rot.querySelector(`[data-textdel="${r}"]`);
    if (!del) return { fel: `ingen [data-textdel="${r}"] i widgeten` };

    const w = state.widgets[0];
    const wFore = { x: w.x, y: w.y };
    const box = del.getBoundingClientRect();
    const start = { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
    const ny = (typ, p, extra) => new PointerEvent(typ, Object.assign({
      bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
      clientX: p.x, clientY: p.y, shiftKey: !!s,
    }, extra || {}));

    del.dispatchEvent(ny('pointerdown', start));
    const mitt = { x: start.x + Math.round(x / 2), y: start.y + Math.round(y / 2) };
    const slut = { x: start.x + x, y: start.y + y };
    (del.ownerDocument || document).dispatchEvent(ny('pointermove', mitt));
    del.dispatchEvent(ny('pointermove', mitt));
    (del.ownerDocument || document).dispatchEvent(ny('pointermove', slut));
    del.dispatchEvent(ny('pointermove', slut));
    del.dispatchEvent(ny('pointerup', slut));

    const falt = { title: 'title', name: 'name', value: 'value' }[r];
    return {
      offsetX: w[falt + 'OffsetX'] || 0,
      offsetY: w[falt + 'OffsetY'] || 0,
      widgetFlyttad: w.x !== wFore.x || w.y !== wFore.y,
      widgetFore: wFore, widgetEfter: { x: w.x, y: w.y },
    };
  }, [roll, dx, dy, skift]);
}

for (const nyckel of WIDGETS) {
  test(`${nyckel}: rubrik, namn och värde är märkta som dragbara`, { skip }, async () => {
    const page = await editorn();
    try {
      await seeda(page, nyckel);
      const delar = await page.evaluate(() => {
        const rot = document.querySelector(`.canvas [data-id="${state.widgets[0].id}"]`);
        return rot ? [...rot.querySelectorAll('[data-textdel]')].map(el => el.dataset.textdel) : null;
      });
      assert.ok(delar, `${nyckel}: widgeten renderades inte`);
      for (const roll of ['title', 'name', 'value']) {
        assert.ok(delar.includes(roll),
          `${nyckel}: ingen textdel märkt "${roll}". Hittade: ${delar.join(', ') || '(inga)'}`);
      }
    } finally { await page.close(); }
  });

  for (const roll of ['title', 'name', 'value']) {
    test(`${nyckel}: ${roll} går att dra utan att widgeten följer med`, { skip }, async () => {
      const page = await editorn();
      try {
        await seeda(page, nyckel);
        // 40 px åt sidan, långt förbi snapptröskeln, så värdet inte fastnar i mitten.
        const ut = await dra(page, roll, 40, 24, true);
        assert.ok(!ut.fel, `${nyckel}/${roll}: ${ut.fel}`);
        assert.equal(ut.widgetFlyttad, false,
          `${nyckel}/${roll}: widgeten flyttades med, ${JSON.stringify(ut.widgetFore)} -> ${JSON.stringify(ut.widgetEfter)}`);
        assert.ok(Math.abs(ut.offsetX - 40) <= 3,
          `${nyckel}/${roll}: ${roll}OffsetX blev ${ut.offsetX}, väntade 40`);
        assert.ok(Math.abs(ut.offsetY - 24) <= 3,
          `${nyckel}/${roll}: ${roll}OffsetY blev ${ut.offsetY}, väntade 24`);
      } finally { await page.close(); }
    });
  }

  test(`${nyckel}: namnet snappar till mitten, och Skift stänger av det`, { skip }, async () => {
    const page = await editorn();
    try {
      await seeda(page, nyckel);
      // 4 px är inom snapptröskeln: utan Skift ska det dras tillbaka till 0.
      const medSnapp = await dra(page, 'name', 4, 0, false);
      assert.ok(!medSnapp.fel, `${nyckel}: ${medSnapp.fel}`);
      assert.equal(medSnapp.offsetX, 0,
        `${nyckel}: 4 px snappade inte till mitten (blev ${medSnapp.offsetX})`);

      await seeda(page, nyckel);
      const utanSnapp = await dra(page, 'name', 4, 0, true);
      assert.ok(Math.abs(utanSnapp.offsetX - 4) <= 1,
        `${nyckel}: Skift stängde inte av snappen (blev ${utanSnapp.offsetX}, väntade 4)`);
    } finally { await page.close(); }
  });
}
