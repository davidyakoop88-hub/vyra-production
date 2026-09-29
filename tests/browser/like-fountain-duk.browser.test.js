'use strict';
// LIKE FOUNTAIN I RIKTIG LAYOUT: DOM-fontanen ar rorelsen, och det finns inget canvas-lager.
//
// HISTORIKEN, for den som undrar varfor filen heter "duk". Widgeten hade ett canvas-lager
// (like-fountain-particles.js) som ritade egna hjartan ovanpa DOM-fontanen. Filen skrevs for att
// vakta dess geometri: duken lades forst med `inset:0` och blev da 624x70 px — widgetens ruta ar
// ~70 px hog medan hjartana stiger flera hundra pixlar och spiller ut ovanfor den. En canvas kan
// inte spilla ut, sa partiklarna kvavdes i en remsa. jsdom kunde aldrig visa det: dar ar
// getBoundingClientRect() alltid 0x0, sa duken skapades inte alls och allt sag bra ut.
//
// Lagret kopplades sedan ur fran triggern, med skalet utskrivet i media.js: det "ritade
// ytterligare hjärtan ovanpå samma händelse och såg ut som en andra fontän i sändning". Modulen
// lag kvar urkopplad till 2026-09-23 och kostade en duk per widget vid varje render — uppmatt
// 620x657 px backing store som ingenting nagonsin ritade pa. Da togs den bort.
//
// Provet nedan vaktar det som blev kvar att vakta: att en like ROR DOM-fontanen, och att inget
// canvas-lager kommit tillbaka. Kommer det tillbaka ser sandningen ut att ha tva fontaner igen,
// och de visuella referensbilderna blir slumpade — canvas-partiklarna ar slumpade och samma
// raster kommer aldrig igen.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.json': 'application/json', '.woff2': 'font/woff2' };

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
let skip = hoppaOver();          // maste vara let: node:test laser { skip } vid registrering

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

async function studion() {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:likefountain');
    Object.assign(w, { id: 'lf1', x: 60, y: 60, width: 620, fountainHeight: 70 });
    state.widgets.push(w); selected = null; render();
  });
  await page.waitForTimeout(700);
  return page;
}

test('en like rör DOM-fontänen, och inget canvas-lager har kommit tillbaka', { skip }, async () => {
  const page = await studion();
  try {
    const m = await page.evaluate(async () => {
      const box = document.querySelector('.widget.like-fountain');
      if (!box) return { fel: 'fontanen renderades inte' };
      const domFore = box.querySelectorAll('.lf-p').length;
      for (let i = 0; i < 20; i++) {
        triggerLikeFountainPop({ username: '@P' + (i % 5), count: 1 });
        await new Promise(r => setTimeout(r, 45));
      }
      await new Promise(r => setTimeout(r, 300));
      const popp = box.querySelector('.fountain-pop');
      return {
        poppSpelar: !!(popp && popp.classList.contains('play')),
        poppBarn: popp ? popp.children.length : 0,
        dukar: box.querySelectorAll('canvas.lf-duk').length,
        modul: typeof window.VyraLikeFountainFx,
        domFore, domEfter: box.querySelectorAll('.lf-p').length
      };
    });
    if (m.fel) assert.fail(m.fel);
    console.log(`\n    popp ${m.poppSpelar ? 'spelar' : 'stilla'} med ${m.poppBarn} delar · `
      + `dukar ${m.dukar} · modul ${m.modul} · DOM ${m.domFore}->${m.domEfter}\n`);

    // Kontrollmatningen forst: liket maste ha gjort NAGOT, annars bevisar stillheten nedan inget.
    assert.ok(m.poppSpelar && m.poppBarn > 0,
      `DOM-poppen rorde sig inte alls (${m.poppBarn} delar) — da mater provet ingen rorelse, `
      + 'bara en trigger som inte nar fram');

    assert.equal(m.dukar, 0,
      'en canvas.lf-duk har ritats i widgeten — canvas-lagret ar tillbaka. Da ser sandningen ut '
      + 'att ha tva fontaner, och de visuella referenserna blir slumpade. Se media.js dar '
      + 'triggern patchas innan du andrar det har provet.');
    assert.equal(m.modul, 'undefined',
      'like-fountain-particles.js laddas igen — modulen togs bort 2026-09-23 for att den '
      + 'allokerade en duk per render som ingenting ritade pa');

    assert.equal(m.domEfter, m.domFore, 'DOM-fontanens egna hjartan ska inte rubbas av poppen');
  } finally { await page.close(); }
});
