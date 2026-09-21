'use strict';
// SKINNET FICK INTE PLATTA TOP COINS.
//
// toplike-studio.js injicerar en skin-klass i alla RANKING_TYPES och foll tillbaka pa 'clean-bar'
// nar widgetens skin inte var ett kant skinn-id. Top Coins v2 satter w.skin till sin DESIGN
// ('halo' / 'signal-orbit'), som aldrig ar ett skinn-id — sa varje Top Coins-widget fick
// skin-clean-bar, och med den .widget.vyra-toplike.skin-clean-bar{width:250px!important}.
//
// UPPMATT 2026-09-21 i riktig Chrome, samma katalognyckel fore och efter scopningen:
//   catalog:ranking:templateTopCoins:halo          250x42  ->  230x193
//   catalog:ranking:templateTopCoins:signal-orbit  250x42  ->  230x190
//   catalog:toplike:clean-bar / mini-podium / side-rank        IDENTISK
//   catalog:ranking:templateTopPoints:neon                     IDENTISK
//
// Bredden ar det som gick sonder och inte fargerna: topcoins-v2.css har 33 hogspecifika regler
// som vinner over clean-bar pa allt DE satter, men bredden kommer fran en INLINE-stil, och inline
// forlorar mot !important.
//
// DARFOR MATS BADA SIDOR HAR. Ett prov som bara sager "Top Coins ar fri" skulle ocksa bli gront
// om skinnen slutade fungera helt. Top Like-provet ar den andra halvan: regeln ska fortfarande
// galla dar den hor hemma.
//
// MATT, INTE KLASSNAMN. Klassen kollas ocksa, men paståendet som bar ar geometrin — en regel som
// injiceras men inte biter, eller biter utan att synas, fangas bara av ett matt.
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('http'), fs = require('fs'), path = require('path');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const V = require('../helpers/visuell.js');

const ROOT = V.ROOT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2',
  '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

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

let server, browser, sida;
// hoppaOver() avgors SYNKRONT fore registreringen — se tests/helpers/webblasare.js for varfor.
const skip = hoppaOver();

// test.before(fn, options) — aldrig tvartom. Fel ordning gor att hooken aldrig kors.
test.before(async () => {
  server = await servera();
  const bas = `http://127.0.0.1:${server.address().port}`;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  sida = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await sida.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  await sida.waitForFunction(() => document.documentElement.classList.contains('overlay-output'),
    null, { timeout: 30000, polling: 100 });
  await sida.waitForFunction(() => typeof window.render === 'function',
    null, { timeout: 30000, polling: 100 });
  await sida.waitForTimeout(4500);
  await sida.evaluate(V.RIGG);
}, { timeout: 180000 });

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// Bygger en katalognyckel och laser tillbaka klasserna och den MALADE geometrin.
async function mat(nyckel) {
  const byggd = await sida.evaluate(k => window.__visBygg(k), nyckel);
  assert.ok(!byggd.fel, `${nyckel} kunde inte byggas: ${byggd.fel}`);
  return sida.evaluate(() => {
    const el = document.querySelector('[data-id]');
    if (!el) return { fel: 'ingen widgetnod' };
    const rad = el.querySelector('.toplike-row');
    const r = el.getBoundingClientRect();
    return {
      klasser: [...el.classList],
      skinn: [...el.classList].filter(c => c.startsWith('skin-')),
      bredd: Math.round(r.width), hojd: Math.round(r.height),
      raknadBredd: getComputedStyle(el).width,
      radHojd: rad ? Math.round(rad.getBoundingClientRect().height) : null,
    };
  });
}

test('Top Like behaller sitt skinn och clean-bar-geometrin', { skip }, async () => {
  const m = await mat('catalog:toplike:clean-bar');
  assert.ok(!m.fel, m.fel);
  assert.deepEqual(m.skinn, ['skin-clean-bar'],
    `Top Like ska fortfarande fa sitt skinn injicerat. Klasser: ${m.klasser.join(' ')}`);
  // 250 px och 42 px hoga rader ar clean-bar-regelns egna varden i toplike-studio.css.
  // Faller det har har scopningen tagit med sig for mycket.
  assert.equal(m.raknadBredd, '250px', 'clean-bar-bredden galler inte langre for Top Like');
  assert.equal(m.radHojd, 42, 'clean-bar-radens hojd galler inte langre for Top Like');
});

test('Top Coins far inget skinn och behaller sin egen bredd', { skip }, async () => {
  for (const nyckel of ['catalog:ranking:templateTopCoins:halo',
                        'catalog:ranking:templateTopCoins:signal-orbit']) {
    const m = await mat(nyckel);
    assert.ok(!m.fel, m.fel);
    assert.deepEqual(m.skinn, [],
      `${nyckel} fick en skin-klass injicerad. Klasser: ${m.klasser.join(' ')}`);
    // 230 px ar Top Coins egen bredd (DESIGNS[...].width i topcoins-v2.js), satt som inline-stil.
    // Med skin-clean-bar blev den 250 px, och widgeten 42 px hog i stallet for ~190.
    assert.equal(m.raknadBredd, '230px',
      `${nyckel} ritas ${m.raknadBredd} bred — clean-bar tvingar 250px!important over inline-stilen`);
    assert.ok(m.hojd > 150,
      `${nyckel} ar bara ${m.hojd} px hog — designen har plattats till en clean-bar-stapel`);
    assert.notEqual(m.radHojd, 42,
      `${nyckel} har en 42 px rad, alltsa clean-bar-gridden och inte sin egen layout`);
  }
});
