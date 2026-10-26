'use strict';
// FLYTTA FRAM / BAK (widget-ordning.js). Davids önskan 2026-10-26: Top Like ska kunna läggas över molnet.
//
// VAD PROVET MÄTER. Två överlappande widgetar i studion. ▲ på den som ligger under ska lägga den överst
// i målningsordningen (document.elementsFromPoint mitt i överlappet), ▼ ska lägga tillbaka den, och
// lagerraden ska rymmas utan att knapparna överlappar.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const { seedaStudioState } = require('../helpers/seed-studio-state.js');

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

test('▲ lägger den undre widgeten överst, ▼ lägger tillbaka den, och raden rymms', { skip, timeout: 60000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null, { timeout: 30000, polling: 100 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
    await seedaStudioState(page, ['catalog:topgift', 'catalog:toplike:center']);
    await page.waitForFunction(() => document.querySelectorAll('.canvas .widget[data-id]').length >= 2
      && !!document.querySelector('.live-layer-list .layer-ordning'), null, { timeout: 15000, polling: 100 });

    const toppen = () => page.evaluate(() => {
      const r = document.querySelector(`.canvas .widget[data-id="${state.widgets[1].id}"]`).getBoundingClientRect();
      const traff = document.elementsFromPoint(Math.round(r.x + 14), Math.round(r.y + 14))
        .map(e => e.closest && e.closest('.canvas .widget[data-id]')).filter(Boolean);
      return traff[0] ? traff[0].dataset.id : null;
    });
    const ids = await page.evaluate(() => {
      state.widgets[0].x = 120; state.widgets[0].y = 160;
      state.widgets[1].x = 150; state.widgets[1].y = 190;
      save(); render();
      return state.widgets.map(w => w.id);
    });
    const fore = await toppen();
    assert.ok(ids.includes(fore), `en av widgetarna ska ligga överst: ${fore}`);
    const under = ids.find(id => id !== fore);

    await page.click(`.live-layer-list article[data-layer-id="${under}"] .layer-fram`);
    await page.waitForFunction(id => state.widgets.find(w => w.id === id).layer === 2, under, { timeout: 5000 });
    assert.equal(await toppen(), under, '▲ ska lägga den undre överst');

    await page.click(`.live-layer-list article[data-layer-id="${under}"] .layer-bak`);
    await page.waitForFunction(id => state.widgets.find(w => w.id === id).layer === 1, under, { timeout: 5000 });
    assert.equal(await toppen(), fore, '▼ ska lägga tillbaka den');

    const rad = await page.evaluate(() => {
      const rad = document.querySelector('.live-layer-list article[data-layer-id]');
      const r = rad.getBoundingClientRect(), lista = rad.parentElement.getBoundingClientRect();
      const rects = [...rad.children].map(n => n.getBoundingClientRect());
      const overlapp = rects.some((a, i) => rects.slice(i + 1).some(b => a.right > b.left + 0.5 && b.right > a.left + 0.5));
      return { ryms: r.right <= lista.right + 0.5, overlapp, namnBredd: Math.round(rects[0].width) };
    });
    assert.ok(rad.ryms, 'raden ska rymmas i listan');
    assert.equal(rad.overlapp, false, 'knapparna får inte överlappa');
    assert.ok(rad.namnBredd >= 60, `namnet ska få plats: ${rad.namnBredd}px`);
  } finally { await page.close(); }
});
