'use strict';
// CANVAS-LAGRET I RIKTIG LAYOUT. Det har gar inte att prova i jsdom, och det ar
// precis darfor provet finns.
//
// BUGGEN SOM GJORDE ATT PROVET SKREVS. Duken lades forst med `inset:0` i .lf-stream.
// Uppmatt i riktig layout blev den da 624x70 px: widgetens ruta ar ~70 px hog, medan
// DOM-fontanens hjartan stiger flera hundra pixlar och SPILLER UT ovanfor den. En
// canvas kan inte spilla ut -- den ar exakt sa stor som sin egen ruta -- sa
// partiklarna kvavdes i en remsa och kulades bort direkt.
//
// jsdom kunde aldrig visa det: dar ar getBoundingClientRect() alltid 0x0, sa duken
// skapades inte alls och allt sag bra ut. Ett prov i jsdom hade varit gront.
//
// Duken ankras nu i nederkanten och vaxer uppat. Provet vaktar tre saker:
//   1. duken ar HOGRE an widgetens ruta
//   2. riktiga likes genom den riktiga triggern ger levande partiklar
//   3. frysningen tar bort duken OCH overlever nasta render
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
  await page.waitForFunction(() => !!window.VyraLikeFountainFx, null,
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

test('duken ar hogre an widgetens ruta — annars kvavs partiklarna i en remsa', { skip }, async () => {
  const page = await studion();
  try {
    const m = await page.evaluate(() => {
      const box = document.querySelector('.widget.like-fountain');
      const duk = box && box.querySelector('canvas.lf-duk');
      if (!duk) return { fel: 'duken forvarmdes inte vid render' };
      const b = box.getBoundingClientRect(), d = duk.getBoundingClientRect();
      return { ruta: Math.round(b.height), duk: Math.round(d.height),
               backing: duk.width + 'x' + duk.height };
    });
    if (m.fel) assert.fail(m.fel);
    console.log(`\n    widgetens ruta ${m.ruta} px · duken ${m.duk} px · backing ${m.backing}\n`);

    assert.ok(m.duk > m.ruta * 2,
      `duken ar ${m.duk} px mot rutans ${m.ruta} px — den maste vaxa uppat forbi rutan`);
    assert.ok(m.duk >= 200, `duken ar bara ${m.duk} px hog`);
  } finally { await page.close(); }
});

test('riktiga likes ger levande partiklar, och DOM-fontanen ar orord', { skip }, async () => {
  const page = await studion();
  try {
    const m = await page.evaluate(async () => {
      const box = document.querySelector('.widget.like-fountain');
      const domFore = box.querySelectorAll('.lf-p').length;
      for (let i = 0; i < 20; i++) {
        triggerLikeFountainPop({ username: '@P' + (i % 5), count: 1 });
        await new Promise(r => setTimeout(r, 45));
      }
      await new Promise(r => setTimeout(r, 300));
      return {
        partiklar: window.VyraLikeFountainFx.antal(),
        motorer: window.VyraLikeFountainFx.aktiva(),
        domFore, domEfter: box.querySelectorAll('.lf-p').length
      };
    });
    console.log(`    partiklar ${m.partiklar} · motorer ${m.motorer} · DOM ${m.domFore}->${m.domEfter}\n`);

    assert.ok(m.partiklar > 8,
      `bara ${m.partiklar} partiklar levde av 20 likes — de kulas bort for tidigt`);
    assert.equal(m.motorer, 1, 'exakt en motor ska vara igang for en widget');
    assert.equal(m.domEfter, m.domFore,
      'DOM-fontanen ar reserven och far inte roras av canvas-lagret');
  } finally { await page.close(); }
});

test('still() tar bort duken, och nasta render bygger inte tillbaka den', { skip }, async () => {
  const page = await studion();
  try {
    const m = await page.evaluate(async () => {
      for (let i = 0; i < 6; i++) triggerLikeFountainPop({ username: '@A', count: 1 });
      await new Promise(r => setTimeout(r, 200));
      const fore = document.querySelectorAll('canvas.lf-duk').length;
      window.VyraLikeFountainFx.still();
      const efterStill = document.querySelectorAll('canvas.lf-duk').length;
      render(); render();
      await new Promise(r => setTimeout(r, 250));
      const box = document.querySelector('.widget.like-fountain');
      return { fore, efterStill,
               efterRender: document.querySelectorAll('canvas.lf-duk').length,
               dom: box.querySelectorAll('.lf-p').length };
    });
    console.log(`    dukar ${m.fore} -> still ${m.efterStill} -> efter render ${m.efterRender}\n`);

    assert.equal(m.fore, 1, 'det skulle finnas en duk att frysa');
    assert.equal(m.efterStill, 0, 'still() ska ta bort duken');
    assert.equal(m.efterRender, 0,
      'frysningen maste overleva nasta render, annars flackar den visuella regressionen');
    assert.ok(m.dom > 0, 'DOM-fontanen ska vara kvar efter frysningen — referensbilderna vilar pa den');
  } finally { await page.close(); }
});
