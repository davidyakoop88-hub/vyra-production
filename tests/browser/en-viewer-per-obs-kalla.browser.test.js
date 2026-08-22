'use strict';
// EN OBS-KÄLLA = EN VIEWER OCH EN EVENTSOURCE.
//
// UPPMÄTT PÅ SERVERSIDAN 2026-08-22, före fixen: en enda OBS-källa öppnade **två**
// konfigurationshämtningar (490 och 1683 ms) och **två** SSE-anslutningar (819 och 1984 ms) —
// båda kvar öppna. Orsaken låg i sista raden av overlay-access.js:
//
//   function mount(){ if(access) return startViewer();          <- ingen vakt
//                     if(document.querySelector('.oa-open')) return;   <- vakt, men bara för knappen
//   ...
//   if(readyState==='loading') addEventListener('DOMContentLoaded',mount); else mount();
//   setTimeout(mount,1200);                                     <- monterar en andra gång
//
// Kostnaden var dubbla Redis-prenumerationer per källa: tio widgetar i OBS gav tjugo strömmar.
// Filen bar dessutom redan en kommentar om att målruntimen LÅNAR strömmen just för att
// "en andra EventSource skulle ge en andra Redis-prenumeration per browserkälla".
//
// MÄTS PÅ SERVERN, inte i sidan. En anslutning som webbläsaren öppnat går inte att missa där, och
// en räkning i sidan hade kunnat missa en EventSource som skapats men inte exponerats.
//
// Den fördröjda monteringen är borttagen, och det är mätt i alla tre lägen:
//   Studio-läget      knappen finns ändå, och överlever fyra vybyten (1 st hela vägen)
//   OBS-läget         den skapade bara den andra anslutningen
//   misslyckad start  den räddar ingenting — felrutan skriver över <body>, så omförsökets
//                     apply() har ingen DOM att rita i: 0 widgetar och 0 strömmar båda vägarna
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.gif': 'image/gif' };

const TOKEN = 'provtoken';
const OVERLAY_ID = 'OV-1';
const STATE = { widgets: [{ id: 'w1', type: 'templateTopLike', x: 40, y: 40, width: 320, height: 240 }] };

function rigg() {
  const spar = { konfig: 0, strommar: [] };
  const server = http.createServer((req, res) => {
    const u = String(req.url || '').split('?')[0];
    if (u === `/api/overlay-access/${TOKEN}`) {
      spar.konfig += 1;
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, overlay: { id: OVERLAY_ID, version: 1, state: STATE } }));
      return;
    }
    if (u === `/api/overlay-access/${TOKEN}/events/stream`) {
      const post = { oppen: true, res };
      spar.strommar.push(post);
      req.once('close', () => { post.oppen = false });
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform', connection: 'keep-alive' });
      res.write(': hej\n\n');
      return;
    }
    const rel = decodeURIComponent(u).replace(/^\/+/, '') || 'index.html';
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return { server, spar };
}

const oppna = spar => spar.strommar.filter(s => s.oppen).length;

let browser, r, bas;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  r = rigg();
  await new Promise(res => r.server.listen(0, '127.0.0.1', res));
  bas = `http://127.0.0.1:${r.server.address().port}`;
});
test.after(async () => {
  if (browser) await browser.close();
  if (r) {
    for (const s of r.strommar || []) { try { s.res.end() } catch (e) {} }
    await new Promise(res => r.server.close(res));
  }
});

test('en OBS-kalla ger EN hamtning och EN anslutning, aven efter 1200 ms',
  { skip, timeout: 120000 }, async () => {
  r.spar.konfig = 0;
  r.spar.strommar.length = 0;
  const sida = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await sida.goto(`${bas}/studio.html?overlay=1&access=${TOKEN}`, { waitUntil: 'load' });
    await sida.waitForFunction(
      () => document.documentElement.dataset.overlayConnection === 'connected',
      null, { timeout: 30000 });

    // VANTA FORBI 1200 ms MED MARGINAL. Det var precis dar den andra monteringen slog till:
    // uppmatt oppnade den sin strom vid 1984 ms.
    await sida.waitForTimeout(3500);

    assert.equal(r.spar.konfig, 1,
      `${r.spar.konfig} konfigurationshamtningar for EN kalla — det ska vara en`);
    assert.equal(r.spar.strommar.length, 1,
      `${r.spar.strommar.length} SSE-anslutningar oppnades for EN kalla — varje extra ar en extra `
      + 'Redis-prenumeration som star kvar hela sandningen');
    assert.equal(oppna(r.spar), 1, 'fler an en strom star oppen samtidigt');
  } finally { await sida.close() }
});

test('efter ett verkligt avbrott finns HOGST en aktiv anslutning',
  { skip, timeout: 120000 }, async () => {
  // Ateranslutningen ska fungera — men den far inte lamna den gamla kvar. Provet mater bada:
  // att en NY strom oppnas (annars ar overlayn dod resten av sandningen), och att antalet OPPNA
  // aldrig blir tva.
  r.spar.konfig = 0;
  r.spar.strommar.length = 0;
  const sida = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await sida.goto(`${bas}/studio.html?overlay=1&access=${TOKEN}`, { waitUntil: 'load' });
    await sida.waitForFunction(
      () => document.documentElement.dataset.overlayConnection === 'connected',
      null, { timeout: 30000 });
    await sida.waitForTimeout(3500);
    const foreAvbrott = r.spar.strommar.length;
    assert.equal(foreAvbrott, 1, 'utgangslaget ar inte en enda strom');

    // Klipp den pa riktigt fran serversidan.
    for (const s of r.spar.strommar) { try { s.res.end() } catch (e) {} }
    await sida.waitForFunction(
      () => document.documentElement.dataset.overlayConnection === 'reconnecting',
      null, { timeout: 20000 });

    // EventSource ateransluter sjalv.
    await sida.waitForFunction(
      () => document.documentElement.dataset.overlayConnection === 'connected',
      null, { timeout: 30000 });
    await sida.waitForTimeout(2000);

    assert.ok(r.spar.strommar.length > foreAvbrott,
      'ingen ny strom oppnades efter avbrottet — overlayn hade varit dod resten av sandningen');
    assert.equal(oppna(r.spar), 1,
      `${oppna(r.spar)} strommar star oppna efter ateranslutningen — den gamla ska vara borta`);
  } finally { await sida.close() }
});
