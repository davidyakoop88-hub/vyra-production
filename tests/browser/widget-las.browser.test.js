'use strict';
// LÅS WIDGET (widget-las.js). Davids önskan 2026-09-25: "man kan låsa widget så den inte flyttar
// på sig ... på säkert sätt, inte störa hela layout".
//
// VARFÖR RIKTIG WEBBLÄSARE: det som ska bevisas är att en riktig musdragning (pointerdown →
// pointermove → pointerup genom studio.js:s el.onpointerdown och alla lindningar runt den) INTE
// flyttar en låst widget, att klicket fortfarande markerar, och att lagerraden inte blir bredare.
// jsdom saknar både layout och pointer capture.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const { seedaStudioState } = require('../helpers/seed-studio-state.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

// Overlayprovet: en LÅST widget som den kommer från molnet, via samma åtkomstväg som OBS använder.
const TOKEN = 'las-prov-token';
const OVERLAY_STATE = { widgets: [{ id: 'lw1', type: 'templateTopLike', x: 40, y: 40, width: 320, height: 240, locked: true }] };

function servera() {
  const server = http.createServer((req, res) => {
    const u = String(req.url || '').split('?')[0];
    if (u === `/api/overlay-access/${TOKEN}`) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, overlay: { id: 'OV-LAS', version: 1, state: OVERLAY_STATE } }));
      return;
    }
    if (u === `/api/overlay-access/${TOKEN}/events/stream`) {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' });
      res.write(': hej\n\n');
      return;
    }
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
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

async function editorn() {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await seedaStudioState(page, 'catalog:topgift', { placering: { x: 40, y: 60 } });
  await page.waitForFunction(() => !!document.querySelector('.live-layer-list .layer-lock'), null,
    { timeout: 15000, polling: 100 });
  return page;
}

const lage = page => page.evaluate(() => {
  const w = state.widgets[0];
  return { id: w.id, x: w.x, y: w.y, locked: w.locked === true, selected };
});

async function dra(page, id, dx, dy) {
  const box = await page.locator(`.canvas .widget[data-id="${id}"]`).boundingBox();
  const sx = box.x + box.width / 2, sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(sx + dx * i / 8, sy + dy * i / 8);
  await page.mouse.up();
  await page.waitForTimeout(200);
}

test('lagerraden är namn + tre ikoner (lås, öga, ta bort), och raden blir inte bredare', { skip }, async () => {
  const page = await editorn();
  try {
    const m = await page.evaluate(() => {
      const rad = document.querySelector('.live-layer-list article[data-layer-id]');
      const barn = [...rad.children].map(n => n.className.split(' ')[0]);
      const r = rad.getBoundingClientRect(), lista = rad.parentElement.getBoundingClientRect();
      const rects = [...rad.children].map(n => n.getBoundingClientRect());
      const overlapp = rects.some((a, i) => rects.slice(i + 1).some(b => a.right > b.left + 0.5 && b.right > a.left + 0.5));
      return { barn, ryms: r.right <= lista.right + 0.5, overlapp,
        titel: rad.querySelector('.layer-lock').title,
        textIKnappar: [...rad.querySelectorAll('.layer-lock,.layer-eye,.layer-delete')].map(n => n.innerText.trim()).join(''),
        bredder: [...rad.querySelectorAll('.layer-lock,.layer-eye,.layer-delete')].map(n => Math.round(n.getBoundingClientRect().width)) };
    });
    assert.deepEqual(m.barn, ['layer-select', 'layer-lock', 'layer-eye', 'layer-delete']);
    assert.ok(m.ryms, 'raden ska rymmas i listan');
    assert.equal(m.overlapp, false, 'knapparna får inte överlappa');
    assert.equal(m.titel, 'Lås position och storlek');
    assert.equal(m.textIKnappar, '', 'bara ikoner — ingen text mellan symbolerna');
    assert.equal(new Set(m.bredder).size, 1, `ikonerna ska vara lika breda: ${m.bredder}`);
  } finally { await page.close(); }
});

test('ögat är öppet när widgeten syns och stängt när den är dold, och klicket döljer fortfarande', { skip }, async () => {
  const page = await editorn();
  try {
    const oga = () => page.evaluate(() => {
      const b = document.querySelector('.live-layer-list .layer-eye');
      return { hidden: !!state.widgets[0].hidden, stangt: !b.querySelector('circle'), titel: b.title };
    });
    const fore = await oga();
    assert.equal(fore.hidden, false);
    assert.equal(fore.stangt, false, 'synlig widget = öppet öga');
    assert.match(fore.titel, /^Synlig/);
    await page.click('.live-layer-list .layer-eye');
    await page.waitForFunction(() => state.widgets[0].hidden === true, null, { timeout: 5000 });
    const efter = await oga();
    assert.equal(efter.stangt, true, 'dold widget = stängt öga');
    assert.match(efter.titel, /^Dold/);
    await page.click('.live-layer-list .layer-eye');
    await page.waitForFunction(() => !state.widgets[0].hidden, null, { timeout: 5000 });
    assert.equal((await oga()).stangt, false);
  } finally { await page.close(); }
});

test('en låst widget flyttar sig inte, men går att markera — och upplåst går den att dra igen', { skip }, async () => {
  const page = await editorn();
  try {
    const fore = await lage(page);
    await page.click('.live-layer-list .layer-lock');
    await page.waitForFunction(() => state.widgets[0].locked === true
      && !!document.querySelector('.canvas .widget.widget-last'), null, { timeout: 5000 });

    await page.evaluate(() => { selected = null; render(); });
    await dra(page, fore.id, 120, 90);
    const last = await lage(page);
    assert.equal(last.x, fore.x, 'x ska stå still');
    assert.equal(last.y, fore.y, 'y ska stå still');

    await page.click(`.canvas .widget[data-id="${fore.id}"]`);
    await page.waitForTimeout(150);
    assert.equal((await lage(page)).selected, fore.id, 'klicket ska fortfarande markera widgeten');

    const handtag = await page.evaluate(id => [...document.querySelectorAll(
      `.canvas .widget[data-id="${id}"] .resize-handle, .canvas .widget[data-id="${id}"] [data-vyra-handle]`)]
      .filter(n => getComputedStyle(n).display !== 'none').length, fore.id);
    assert.equal(handtag, 0, 'handtagen ska vara dolda på en låst widget');

    await page.click('.live-layer-list .layer-lock');
    await page.waitForFunction(() => !state.widgets[0].locked
      && !document.querySelector('.canvas .widget.widget-last'), null, { timeout: 5000 });
    await dra(page, fore.id, 120, 90);
    const upp = await lage(page);
    assert.notEqual(`${upp.x},${upp.y}`, `${fore.x},${fore.y}`, 'upplåst ska den gå att dra');
    assert.equal('locked' in (await page.evaluate(() => state.widgets[0])), false,
      'upplåsning tar bort fältet i stället för att spara locked:false');
  } finally { await page.close(); }
});

test('overlayn ritar den låsta widgeten som vanligt och ser aldrig låset', { skip, timeout: 90000 }, async () => {
  const sida = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await sida.goto(`${bas}/studio.html?overlay=1&access=${TOKEN}`, { waitUntil: 'load' });
    await sida.waitForFunction(() => !!document.querySelector('[data-id="lw1"]'), null, { timeout: 30000 });
    await sida.waitForTimeout(1500);
    const m = await sida.evaluate(() => ({
      last: document.querySelectorAll('.widget-last').length,
      knappar: document.querySelectorAll('.layer-lock').length,
      synlig: getComputedStyle(document.querySelector('[data-id="lw1"]')).display !== 'none'
    }));
    assert.equal(m.synlig, true, 'den låsta widgeten ska synas i sändningen');
    assert.equal(m.last, 0, 'klassen widget-last får inte nå overlayn');
    assert.equal(m.knappar, 0, 'lås-knappen får inte nå overlayn');
  } finally { await sida.close(); }
});
