'use strict';
// LEVEL-LARMEN SKA GÅ ATT LÄSA I LITEN STORLEK — Gifter Level Up och Fan Level Up, alla layouter.
//
// Davids ord 2026-10-12: "ramarna syns knappt så tydliga — overlaylive.app har ramar som ser
// tydligt på liven men inte mina" och "grejen är när man har dem i mini läge (liten storlek) så
// ser man inte dem tydligt". Uppmätt före ändringen: namnet stod i 14-20 px oavsett bredd men
// krympte med storlekshandtagets zoom (zoom .5 gav 7-9 px), Fan Duo sköt ut texten över högerkanten
// ("FAN LEVEL U", "TROGEN SUPPOR") och Gifter Duo tryckte ihop texten under en rad med fyra
// smala kolumner.
//
// Proven låser:
//   1. minsta namn- och nivåstorlek, 12 designpixlar EFTER zoom, i alla layouter och storlekar
//   2. namnplattan (mörk, rundad, tunn kant, fet vit text) vid smal bredd
//   3. att duo-layouterna inte klipps och att profilbilden syns i båda
//   4. kompaktläget: tänds under tröskeln (bredd ELLER zoom), profilbild >= 55 % av bredden,
//      nivån som "LV. 9" — och tänds INTE i stor vy
//
// VARFÖR RIKTIG WEBBLÄSARE: allt här är pixelmått och container-enheter; jsdom svarar 0.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg' };

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

const GIFTER = ['profile', 'number', 'stack', 'sidebadge', 'reveal', 'orbitlevel', 'risingtier', 'flip', 'duo'];
const FAN = ['hero', 'stack', 'heartbeat', 'badgereveal', 'loyalty', 'hearts', 'ribbon', 'duo'];
const NYCKLAR = [...GIFTER.map(l => 'catalog:gifterlevel:' + l), ...FAN.map(l => 'catalog:fanlevel:layout:' + l)];

let server, browser, sida;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  sida = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await sida.goto(`http://127.0.0.1:${server.address().port}/studio.html?overlay=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sida.waitForFunction(() => document.documentElement.classList.contains('overlay-output')
    && typeof window.render === 'function' && !!window.VyraLevelLasbar
    && !!document.querySelector('link[data-lv-las]')?.sheet, null, { timeout: 90000, polling: 100 });
  // Duken oskalad på (0,0) så att getBoundingClientRect är designpixlar, och ingen rörelse: ett
  // mått mitt i en entréskala är godtyckligt.
  await sida.addStyleTag({ content: '.canvas{transform:none!important;left:0!important;top:0!important}'
    + '.canvas .widget,.canvas .widget *{animation:none!important;transition:none!important}' });
  await sida.waitForTimeout(600);
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

/* Bygger widgeten ur katalogen, tänder den utan kön (klassen sätts direkt — det är synligheten
   och layouten som mäts, inte triggern) och läser av allt som proven behöver. */
function mat(nyckel, bredd, zoom) {
  return sida.evaluate(([nyckel, bredd, zoom]) => {
    state.widgets.length = 0;
    const w = VyraWidgets.create(nyckel);
    w.x = 20; w.y = 20; if (bredd) w.width = bredd; w.widgetScale = zoom;
    w.gifterName = w.fanName = 'NovaStorm_99'; w.gifterLevel = w.fanLevel = 9;
    state.widgets.push(w); selected = null; render();
    const box = document.querySelector(`[data-id="${w.id}"]`);
    box.classList.add(w.type === 'templateGifterLevel' ? 'gifter-active' : 'fan-active');
    if (w.type === 'templateGifterLevel' && typeof gifterSattNiva === 'function') gifterSattNiva(box, 9, '1 → 9');
    const br = box.getBoundingClientRect();
    const syns = el => { if (!el) return false; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
      for (let n = el; n && n !== document.body; n = n.parentElement) { const c = getComputedStyle(n);
        if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.05) return false } return true };
    // Effektiv textstorlek = beräknad storlek × hur mycket elementet faktiskt ritas förminskat.
    const text = el => { if (!syns(el)) return null; const r = el.getBoundingClientRect(), c = getComputedStyle(el);
      const skala = el.offsetWidth ? r.width / el.offsetWidth : 1;
      return { px: +(parseFloat(c.fontSize) * skala).toFixed(2), vanster: r.left - br.left, hoger: br.right - r.right,
        klippt: el.scrollWidth > el.clientWidth + 1, bg: c.backgroundColor, kant: c.borderTopWidth, kantStil: c.borderTopStyle,
        radie: parseFloat(c.borderTopLeftRadius), vikt: +c.fontWeight, farg: c.color, synligText: el.innerText.trim() } };
    const fam = w.type === 'templateGifterLevel';
    const nivaEl = fam ? box.querySelector('.gifter-level-badge strong') : box.querySelector('.fan-level-pill');
    const bilder = [...box.querySelectorAll('img')].filter(i => !/diamond|heart-character/.test(i.src) && syns(i));
    const bild = bilder.map(i => i.getBoundingClientRect()).sort((a, b) => b.width - a.width)[0];
    return { kompakt: box.classList.contains('lv-kompakt'), bredd: br.width,
      namn: text(box.querySelector('h3')), niva: text(nivaEl),
      rubrik: text(box.querySelector('h2')), under: text(box.querySelector('p')),
      bild: bild ? { b: bild.width, vanster: bild.left - br.left, hoger: br.right - bild.right } : null,
      nivaText: nivaEl ? nivaEl.textContent.trim() : null };
  }, [nyckel, bredd, zoom]);
}

test('minsta storlek: namn och nivå är minst 12 designpixlar efter zoom i alla layouter', { skip }, async () => {
  const fel = [];
  for (const nyckel of NYCKLAR) {
    for (const [bredd, zoom] of [[120, 1], [160, 1], [200, 1], [260, 1], [320, 1], [0, 0.5], [0, 0.7]]) {
      const m = await mat(nyckel, bredd, zoom);
      const fall = `${nyckel} bredd ${bredd || 'standard'} zoom ${zoom}`;
      if (!m.namn) fel.push(`${fall}: namnet syns inte`);
      else if (m.namn.px < 11.95) fel.push(`${fall}: namnet ${m.namn.px} px`);
      // Ribbon bär nivån i banderollen och döljer pillen i stor vy — men inte i kompaktläget.
      if (!m.niva) { if (!(nyckel.endsWith(':ribbon') && !m.kompakt)) fel.push(`${fall}: nivån syns inte`) }
      else if (m.niva.px < 11.95) fel.push(`${fall}: nivån ${m.niva.px} px`);
    }
  }
  assert.deepEqual(fel, []);
});

test('namnplattan vid smal bredd: mörk, rundad, tunn kant, fet vit text', { skip }, async () => {
  for (const nyckel of NYCKLAR) {
    for (const [bredd, zoom] of [[120, 1], [0, 0.5]]) {
      const { namn } = await mat(nyckel, bredd, zoom);
      const fall = `${nyckel} bredd ${bredd || 'standard'} zoom ${zoom}`;
      const [r, g, b, a = 1] = namn.bg.match(/[\d.]+/g).map(Number);
      assert.ok(r <= 20 && g <= 20 && b <= 30 && a >= 0.8, `${fall}: plattan är inte mörk (${namn.bg})`);
      assert.ok(parseFloat(namn.kant) >= 1 && namn.kantStil === 'solid', `${fall}: plattan saknar kant`);
      assert.ok(namn.radie >= 6, `${fall}: plattan är inte rundad (${namn.radie})`);
      assert.ok(namn.vikt >= 700, `${fall}: namnet är inte fett (${namn.vikt})`);
      assert.equal(namn.farg, 'rgb(255, 255, 255)', `${fall}: namnet är inte vitt`);
    }
  }
});

test('duo-layouterna klipps inte och visar profilbilden', { skip }, async () => {
  for (const nyckel of ['catalog:gifterlevel:duo', 'catalog:fanlevel:layout:duo']) {
    for (const [bredd, zoom] of [[0, 1], [320, 1], [260, 1], [0, 0.8]]) {
      const m = await mat(nyckel, bredd, zoom);
      const fall = `${nyckel} bredd ${bredd || 'standard'} zoom ${zoom}`;
      for (const [del, t] of Object.entries({ rubrik: m.rubrik, namn: m.namn, niva: m.niva, under: m.under })) {
        if (!t) { if (!(m.kompakt && del === 'under')) assert.fail(`${fall}: ${del} syns inte`); continue }
        assert.ok(t.vanster >= -1 && t.hoger >= -1, `${fall}: ${del} sticker ut (${t.vanster.toFixed(1)}/${t.hoger.toFixed(1)})`);
        assert.ok(!t.klippt || del === 'under', `${fall}: ${del} klipps ("${t.synligText}")`);
      }
      assert.ok(m.bild && m.bild.b >= 30, `${fall}: profilbilden syns inte (${m.bild && m.bild.b})`);
      assert.ok(m.bild.vanster >= -1 && m.bild.hoger >= -1, `${fall}: profilbilden sticker ut`);
    }
  }
});

test('kompaktläget: tänds vid smal bredd och vid liten zoom, stor bild, LV. 9', { skip }, async () => {
  for (const nyckel of NYCKLAR) {
    for (const [bredd, zoom] of [[120, 1], [160, 1], [200, 1], [0, 0.5], [0, 0.6]]) {
      const m = await mat(nyckel, bredd, zoom);
      const fall = `${nyckel} bredd ${bredd || 'standard'} zoom ${zoom}`;
      assert.ok(m.kompakt, `${fall}: kompaktläget tändes inte`);
      assert.ok(m.bild && m.bild.b >= 0.55 * m.bredd - 0.5, `${fall}: profilbilden ${m.bild && m.bild.b.toFixed(1)} av ${m.bredd.toFixed(1)}`);
      assert.equal(m.niva.synligText.replace(/\s+/g, ' '), 'LV. 9', `${fall}: nivån visar "${m.niva.synligText}"`);
      if (nyckel.startsWith('catalog:gifterlevel:')) assert.equal(m.nivaText, 'LV. 1 → 9', `${fall}: textContent ändrades`);
      for (const t of [m.namn, m.niva]) assert.ok(t.vanster >= -1 && t.hoger >= -1, `${fall}: texten sticker ut`);
    }
  }
});

test('stor vy är orörd: inget kompaktläge vid standardbredd och full storlek', { skip }, async () => {
  for (const nyckel of NYCKLAR) {
    const m = await mat(nyckel, 0, 1);
    assert.equal(m.kompakt, false, `${nyckel}: kompaktläget tändes i stor vy`);
  }
});
