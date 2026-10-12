'use strict';
// FAN LEVEL 50 — PROFILBILD OCH NAMN SKA GA ATT LASA AVEN NAR WIDGETEN AR LITEN (2026-10-12).
//
// DAVIDS ORD: "FAN LEVEL 50 · MILSTOLPE — den i min sidan ser väldigt tydlig men när man kör live
// och hade liten man ser knappt profilbilden eller namn."
//
// UPPMATT FORE: konsten tar hela kortet, fotot ar 17,4 % av kortets bredd och namnet 6,4cqw. Allt
// skalar linjart, sa ett 136 px kort gav ett 24 px foto och 8,7 px text — och dra-handtaget krymper
// med `zoom`, som en container query inte ser (ett 296 px kort ritat i 148 px trodde att det var
// stort). Duken ar 432 designpixlar = en telefonbredd i TikTok, sa designpixlar ar ratt matt.
//
// Provet mater den renderade sidan i overlay-lage: under troskeln (190 px kort) ska fotot vara minst
// 45 % av kortet och namnet minst 14 px — oavsett om widgeten gjorts smal med bredden, med zoomen
// (dra-handtaget) eller ligger i bandlaget. Standardkortet (bandet, bredd 300 -> 200 px kort) ar
// Davids "tydliga" vy och ska vara orort: inget kompaktlage, fotot kvar i mallens ring.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  '.json': 'application/json', '.woff2': 'font/woff2', '.gif': 'image/gif', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
    if (rel.startsWith('api/')) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{}'); return; }
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

let server, browser, sida;
const skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  sida = await browser.newPage({ viewport: { width: 432, height: 768 } });
  await sida.goto(`http://127.0.0.1:${server.address().port}/studio.html?overlay=1`, { waitUntil: 'load', timeout: 90000 });
  await sida.waitForFunction(() => typeof VyraWidgets !== 'undefined' && typeof render === 'function'
    && window.VyraFanLevel50 && document.querySelector('link[data-fl50]'), null, { timeout: 60000 });
  await sida.waitForTimeout(500);
});
test.after(async () => { if (browser) await browser.close(); if (server) server.close(); });

// Renderar en Fan Level 50 med ett riktigt namn och en lokal profilbild och mater forsta kortet.
// Matten ar i designpixlar (duken ar 432 bred i en 432 bred vy, skala 1).
function mat({ bredd, zoom = 1, mode = 'slideshow' }) {
  return sida.evaluate(async ({ bredd, zoom, mode }) => {
    const st = window.eval('state'); st.widgets = [];
    const w = VyraWidgets.create('catalog:fanlevel50:royal');
    Object.assign(w, { x: 8, y: 8, width: bredd, widgetScale: zoom, fanl50Mode: mode, fanl50Source: 'manual',
      fanl50Manual: [{ name: 'Sara Lindqvist', avatar: 'assets/images/test-profile.svg' }] });
    st.widgets.push(w); render();
    await new Promise(r => setTimeout(r, 700));
    const box = document.querySelector(`[data-id="${w.id}"]`);
    const card = box.querySelector('.fl50-card'), foto = box.querySelector('.fl50-photo');
    const namn = box.querySelector('.fl50-name span'), bricka = box.querySelector('.fl50-badge');
    const skala = document.querySelector('.canvas').getBoundingClientRect().width / 432;
    const r = el => el.getBoundingClientRect();
    const egenZoom = namn.currentCSSZoom || 1;
    return {
      kort: r(card).width / skala,
      foto: r(foto).width / skala,
      namnPx: parseFloat(getComputedStyle(namn).fontSize) * egenZoom / skala,
      namnText: namn.textContent,
      namnSyns: r(namn).height > 0 && getComputedStyle(namn).visibility !== 'hidden',
      // ellips/klipp: textens bredd far inte vara bredare an rutan pa en rad (kompakt bryter till tva)
      klipptBredd: namn.scrollWidth > namn.clientWidth + 1,
      bricka: bricka ? getComputedStyle(bricka).display : 'saknas'
    };
  }, { bredd, zoom, mode });
}

const SMALA = [
  { namn: 'slideshow, smal bredd (160)', bredd: 160 },
  { namn: 'slideshow, minsta bredd (120)', bredd: 120 },
  { namn: 'slideshow, normal bredd men dragen till 50 % (zoom)', bredd: 320, zoom: 0.5 },
  { namn: 'bandet, smal bredd (180)', bredd: 180, mode: 'band' },
  { namn: 'bandet, standardbredd dragen till 60 % (zoom)', bredd: 300, zoom: 0.6, mode: 'band' }
];

for (const fall of SMALA) {
  test(`kompakt: ${fall.namn} — fotot och namnet bar kortet`, { skip }, async () => {
    const m = await mat(fall);
    assert.ok(m.kort < 190, `kortet skulle vara smalt men ar ${m.kort.toFixed(1)} px`);
    assert.ok(m.foto >= m.kort * 0.45, `fotot ar ${m.foto.toFixed(1)} px av ${m.kort.toFixed(1)} px kort — under 45 %`);
    assert.ok(m.foto >= 50, `fotot ar bara ${m.foto.toFixed(1)} px`);
    assert.ok(m.namnPx >= 14, `namnet ar bara ${m.namnPx.toFixed(1)} px`);
    assert.equal(m.namnText, 'Sara Lindqvist');
    assert.ok(m.namnSyns, 'namnet syns inte');
    assert.ok(!m.klipptBredd, 'namnet klipps i sidled');
    assert.equal(m.bricka, 'block', 'LEVEL 50-brickan ska synas i kompakt lage');
  });
}

test('stor vy: standardkortet (bandet, bredd 300) ar orort — mallens ring, ingen bricka', { skip }, async () => {
  const m = await mat({ bredd: 300, mode: 'band' });
  assert.equal(Math.round(m.kort), 200, 'standardkortet i bandet ar 200 px');
  assert.ok(m.foto < m.kort * 0.2, `fotot ska sitta i mallens ring (17,4 %), ar ${m.foto.toFixed(1)} px`);
  assert.equal(m.bricka, 'none');
});

test('stor vy: bred slideshow far inget kompaktlage', { skip }, async () => {
  const m = await mat({ bredd: 320 });
  assert.ok(m.kort > 190);
  assert.ok(m.foto < m.kort * 0.2);
  assert.equal(m.bricka, 'none');
});
