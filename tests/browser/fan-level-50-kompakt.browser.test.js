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
// 2026-10-16: forsta losningen bytte ut mallen mot en mork inzoomad bild — DAVID: "bilden kommer upp
// och inte designen". Mallen ska alltid synas orord; i ett litet kort vaxer bara fotot ut ur ringen.
//
// Provet mater den renderade sidan i overlay-lage: under troskeln (190 px kort) ska mallen vara
// orord (ingen transform/filter pa konsten), fotot minst 30 % av kortet (mot ~19 % i ringen) och
// namnet storre an i stora vyn — oavsett om widgeten gjorts smal med bredden, med zoomen
// (dra-handtaget) eller ligger i bandlaget. Standardkortet (bandet, bredd 300 -> 200 px kort) ar
// Davids "tydliga" vy och ska vara orort: fotot kvar i mallens ring.
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
function mat({ bredd, zoom = 1, mode = 'slideshow', kompakt = false }) {
  return sida.evaluate(async ({ bredd, zoom, mode, kompakt }) => {
    const st = window.eval('state'); st.widgets = [];
    const w = VyraWidgets.create('catalog:fanlevel50:royal');
    Object.assign(w, { x: 8, y: 8, width: bredd, widgetScale: zoom, fanl50Mode: mode, fanl50Source: 'manual', kompaktLage: kompakt,
      fanl50Manual: [{ name: 'Sara Lindqvist', avatar: 'assets/images/test-profile.svg' }] });
    st.widgets.push(w); render();
    await new Promise(r => setTimeout(r, 700));
    const box = document.querySelector(`[data-id="${w.id}"]`);
    const card = box.querySelector('.fl50-card'), foto = box.querySelector('.fl50-photo');
    const namn = box.querySelector('.fl50-name span'), konst = getComputedStyle(box.querySelector('.fl50-art'));
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
      // namnets storlek i cqw (andel av kortets bredd) — jamfors mot stora vyns 7,4cqw * faktor
      namnCqw: parseFloat(getComputedStyle(namn).fontSize) * egenZoom / skala / (r(card).width / skala) * 100,
      mallOrord: konst.transform === 'none' && konst.filter === 'none'
    };
  }, { bredd, zoom, mode, kompakt });
}

const SMALA = [
  { namn: 'slideshow, smal bredd (160)', bredd: 160 },
  { namn: 'slideshow, minsta bredd (120)', bredd: 120 },
  { namn: 'slideshow, normal bredd men dragen till 50 % (zoom)', bredd: 320, zoom: 0.5 },
  { namn: 'bandet, smal bredd (180)', bredd: 180, mode: 'band' },
  { namn: 'bandet, standardbredd dragen till 60 % (zoom)', bredd: 300, zoom: 0.6, mode: 'band' }
];

// KOMPAKTLÄGET ÄR ETT VAL (granskningen 2026-10-25): det stora fotot gäller när streamern valt Kompakt
// läge. Utan valet behåller ett litet kort mallens proportioner — fotot sitter kvar i ringen.
for (const fall of SMALA) {
  test(`utan valt kompaktläge: ${fall.namn} — samma mall och fotoproportion som i stora vyn`, { skip }, async () => {
    const m = await mat(fall);
    assert.ok(m.mallOrord, 'mallen ska synas orord');
    assert.ok(m.foto < m.kort * 0.22, `fotot växte ur ringen av storleken: ${m.foto.toFixed(1)} av ${m.kort.toFixed(1)} px`);
  });
  test(`valt kompaktläge: ${fall.namn} — fotot och namnet bär kortet`, { skip }, async () => {
    const m = await mat({ ...fall, kompakt: true });
    assert.ok(m.kort < 190, `kortet skulle vara smalt men ar ${m.kort.toFixed(1)} px`);
    assert.ok(m.mallOrord, 'mallen ska synas orord — ingen inzoomning eller dampning av bilden');
    assert.ok(m.foto >= m.kort * 0.30, `fotot ar ${m.foto.toFixed(1)} px av ${m.kort.toFixed(1)} px kort — under 30 %`);
    // "Sara Lindqvist" (14 tecken): stora vyn ger 7,4 * 0,79 = 5,8cqw, litet kort 9,5 * 0,57 -> golvet 5,8
    assert.ok(m.namnCqw >= 5.8 - 0.1, `namnet ar ${m.namnCqw.toFixed(2)}cqw — mindre an i stora vyn`);
    assert.equal(m.namnText, 'Sara Lindqvist');
    assert.ok(m.namnSyns, 'namnet syns inte');
    assert.ok(!m.klipptBredd, 'namnet klipps i sidled');
  });
}

test('stor vy: standardkortet (bandet, bredd 300) ar orort — mallens ring, ingen bricka', { skip }, async () => {
  const m = await mat({ bredd: 300, mode: 'band' });
  assert.equal(Math.round(m.kort), 200, 'standardkortet i bandet ar 200 px');
  // Den nya Fly Love-mallen (2026-10-14) har en storre ring: fotot ar 20,1 % av kortet. Kompaktlaget
  // ger 58 %, sa 22 % skiljer fortfarande lagena at med god marginal.
  assert.ok(m.foto < m.kort * 0.22, `fotot ska sitta i mallens ring (20,1 %), ar ${m.foto.toFixed(1)} px`);
  assert.ok(m.mallOrord);
});

// EN WIDGET, ALLA DESIGNER (David 2026-10-16): "lagger alla design tillsammans ... om anvandare vill
// att en design ska visas eller alla". 'alla' ger kort N mall N; en vald design ger samma mall overallt.
test('design "alla" visar alla fyra mallarna, en vald design bara den', { skip }, async () => {
  const mallar = design => sida.evaluate(async design => {
    const st = window.eval('state'); st.widgets = [];
    const w = VyraWidgets.create('catalog:fanlevel50:royal');
    Object.assign(w, { x: 8, y: 8, width: 300, fanl50Mode: 'band', fanl50Design: design, fanl50Source: 'manual',
      fanl50Manual: ['A', 'B', 'C', 'D'].map(name => ({ name, avatar: '' })) });
    st.widgets.push(w); render(); await new Promise(r => setTimeout(r, 300));
    const kort = [...document.querySelectorAll(`[data-id="${w.id}"] .fl50-card`)].slice(0, 4);
    return kort.map(k => [...k.classList].find(c => c.startsWith('fl50-design-')));
  }, design);
  assert.deepEqual(await mallar('alla'), ['fl50-design-royal', 'fl50-design-zeus', 'fl50-design-ornen', 'fl50-design-lejon']);
  assert.deepEqual(await mallar('ornen'), Array(4).fill('fl50-design-ornen'));
});

// SUDDIGT I OBS (2026-10-16): overlayen skalas upp med transform: scale(~2,5). will-change: transform
// pa bandet fryste rastreringen i designstorleken, sa kortet forstorades som en bild — uppmatt i en
// 4x uppskalad duk: allt suddigt med will-change, skarpt utan. Inget i kortet far bara will-change.
test('bandet bar ingen will-change — annars blir kortet suddigt nar overlayen skalas upp', { skip }, async () => {
  const wc = await sida.evaluate(async () => {
    const st = window.eval('state'); st.widgets = [];
    const w = VyraWidgets.create('catalog:fanlevel50:royal');
    Object.assign(w, { x: 8, y: 8, width: 160, fanl50Mode: 'band', fanl50Source: 'manual', fanl50Manual: [{ name: 'A', avatar: '' }] });
    st.widgets.push(w); render(); await new Promise(r => setTimeout(r, 300));
    return [...document.querySelectorAll(`[data-id="${w.id}"], [data-id="${w.id}"] *`)]
      .map(el => getComputedStyle(el).willChange).filter(v => v !== 'auto');
  });
  assert.deepEqual(wc, []);
});

test('valt kompaktläge: kort med kort namn far storre text i litet kort an i stora vyn', { skip }, async () => {
  const m = await sida.evaluate(async () => {
    const st = window.eval('state'); st.widgets = [];
    const w = VyraWidgets.create('catalog:fanlevel50:royal');
    Object.assign(w, { x: 8, y: 8, width: 160, kompaktLage: true, fanl50Source: 'manual', fanl50Manual: [{ name: 'kurdiia6', avatar: '' }] });
    st.widgets.push(w); render(); await new Promise(r => setTimeout(r, 700));
    const box = document.querySelector(`[data-id="${w.id}"]`);
    const namn = box.querySelector('.fl50-name span'), card = box.querySelector('.fl50-card');
    return parseFloat(getComputedStyle(namn).fontSize) * (namn.currentCSSZoom || 1) / (card.getBoundingClientRect().width / (card.currentCSSZoom || 1)) * 100;
  });
  assert.ok(m > 9, `namnet ar ${m.toFixed(2)}cqw — skulle vara ~9,5`);
});

test('stor vy: bred slideshow far inget kompaktlage', { skip }, async () => {
  const m = await mat({ bredd: 320 });
  assert.ok(m.kort > 190);
  assert.ok(m.foto < m.kort * 0.22);
  assert.ok(m.mallOrord);
});
