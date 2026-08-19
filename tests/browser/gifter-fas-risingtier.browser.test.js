'use strict';
// Risingtier — "Stigningen" — rörelsevakterna i riktig Chrome, skrivna RÖTT FÖRST.
//
// UPPMÄTT PÅ MAIN FÖRE BYGGET (scratchpad/mat-risingtier.json, 2026-08-19): hela avläsningen
// snäpper — badge, h2, h3, p och porträttet står på opacitet 1,00 redan vid 40 ms medan stapeln
// klättrar. Widgeten berättar slutet före början, samma sjukdom som varje Fan-modell hade.
// Och stapelns trappa syns aldrig: gd-2/gd-3 ligger STILLA på sin designade vila 0,28 genom hela
// entrén (statiskt !important, studio.css:1219, vinner över keyframen — Fan-läxan) i stället för
// att tändas nedifrån mot den.
//
// VIKTIGT OM 0,28: det är AVSIKTLIG design — ekolagren bakom toppdiamanten SKA vila på 0,28.
// Koreografin ändrar inte designens sluttillstånd; den ger vägen dit: allt börjar släckt,
// trappan tänds nedifrån mot sina DESIGNADE slutopaciteter, och avläsningen kommer sist.
//
// §7: proven går via window.triggerGifterLevelUp({__test:true,...}) — den riktiga triggervägen
// med gate-bypass — aldrig via fasfunktionerna direkt.
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

async function tandRisingtier() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:gifterlevel:risingtier');
    Object.assign(w, { x: 60, y: 90 });
    state.widgets.push(w);
    selected = null;
    render();
  });
  await page.waitForTimeout(600);
  return page;
}

// Opaciteter för de delar vakterna bryr sig om, plus lådans fasklasser.
const MATNING = `(() => {
  const box = document.querySelector('.gifter-level-up');
  const o = sel => { const el = box.querySelector(sel); return el ? +(+getComputedStyle(el).opacity).toFixed(2) : null; };
  return {
    faser: [...box.classList].filter(k => k.startsWith('gifter-fas-')),
    badge: o('.gifter-level-badge'), h2: o('h2'), h3: o('h3'), p: o('p'),
    portratt: o('.gifter-orbit > img'),
    gd1: o('.gd-1'), gd2: o('.gd-2'), gd3: o('.gd-3'),
  };
})()`;

test('Ba: faserna spelar i ordning genom den riktiga triggern', { skip }, async () => {
  const page = await tandRisingtier();
  await page.evaluate(() => window.triggerGifterLevelUp({ __test: true, level: 12, name: 'Prov', username: 'prov' }));
  const vid = async ms => { await page.waitForTimeout(ms); return page.evaluate(MATNING); };
  const f1 = await vid(60);
  const f2 = await vid(400);   // 460 ms — inne i materialisering (340–700)
  const f3 = await vid(390);   // 850 ms — inne i avläsning (700–1040)
  const slut = await vid(400); // 1250 ms — sekvensen klar
  await page.close();
  assert.deepEqual(f1.faser, ['gifter-fas-stralar'], `fas 1 fel: ${f1.faser}`);
  assert.deepEqual(f2.faser, ['gifter-fas-materialisering'], `fas 2 fel: ${f2.faser}`);
  assert.deepEqual(f3.faser, ['gifter-fas-avlasning'], `fas 3 fel: ${f3.faser}`);
  assert.deepEqual(slut.faser, [], `fasklasser kvar efter sekvensen: ${slut.faser}`);
});

test('Bb: avläsningen snäpper inte — släckt i strålfasen, framme efter sekvensen', { skip }, async () => {
  const page = await tandRisingtier();
  await page.evaluate(() => window.triggerGifterLevelUp({ __test: true, level: 12, name: 'Prov', username: 'prov' }));
  await page.waitForTimeout(60);
  const tidigt = await page.evaluate(MATNING);
  await page.waitForTimeout(1200);
  const sent = await page.evaluate(MATNING);
  await page.close();
  for (const del of ['badge', 'h2', 'h3', 'p', 'portratt']) {
    assert.ok(tidigt[del] !== null, `${del} saknas i markupen`);
    assert.ok(tidigt[del] <= 0.15,
      `${del} står på ${tidigt[del]} i strålfasen — slutet berättas före början`);
    assert.ok(sent[del] >= 0.95, `${del} nådde aldrig fram: ${sent[del]}`);
  }
});

test('Bc: trappan tänds nedifrån mot sina DESIGNADE slutopaciteter', { skip }, async () => {
  const page = await tandRisingtier();
  await page.evaluate(() => window.triggerGifterLevelUp({ __test: true, level: 12, name: 'Prov', username: 'prov' }));
  await page.waitForTimeout(50);
  const tidigt = await page.evaluate(MATNING);
  await page.waitForTimeout(140);          // ~190 ms — nedersta steget ska ha börjat, översta inte nått
  const mitt = await page.evaluate(MATNING);
  await page.waitForTimeout(1100);
  const sent = await page.evaluate(MATNING);
  await page.close();
  // Nedersta steget startar sin stigning DIREKT by design (trappan tänds nedifrån) — vid
  // mätögonblicket är gd3 på väg (under sin vila 0,28), medan gd2 (100 ms fördröjd) och
  // gd1 (200 ms) fortfarande ska vara släckta.
  assert.ok(tidigt.gd3 !== null && tidigt.gd2 !== null && tidigt.gd1 !== null, 'trappsteg saknas');
  assert.ok(tidigt.gd3 <= 0.25, `gd3 börjar på ${tidigt.gd3} — över sin vila, ingen stigning`);
  assert.ok(tidigt.gd2 <= 0.12, `gd2 börjar på ${tidigt.gd2} — fördröjningen saknas`);
  assert.ok(tidigt.gd1 <= 0.12, `gd1 börjar på ${tidigt.gd1} — toppen ska tändas sist`);
  assert.ok(mitt.gd3 >= tidigt.gd3 + 0.05 && mitt.gd3 > mitt.gd1 - 0.05,
    `nedifrån-ordningen syns inte: gd3 ${tidigt.gd3}→${mitt.gd3}, gd1 ${mitt.gd1}`);
  assert.ok(sent.gd1 >= 0.95, `toppdiamanten nådde aldrig 1,0: ${sent.gd1}`);
  assert.ok(Math.abs(sent.gd2 - 0.28) <= 0.07, `gd2 vilar på ${sent.gd2}, designen säger 0,28`);
  assert.ok(Math.abs(sent.gd3 - 0.28) <= 0.07, `gd3 vilar på ${sent.gd3}, designen säger 0,28`);
});

test('Bd: exiten är orörd — gifter-exit spelar mains gl-descend som förut', { skip }, async () => {
  const page = await tandRisingtier();
  await page.evaluate(() => window.triggerGifterLevelUp({ __test: true, level: 12, name: 'Prov', username: 'prov' }));
  await page.waitForTimeout(1300);
  const exit = await page.evaluate(() => {
    const box = document.querySelector('.gifter-level-up');
    box.classList.add('gifter-exit');
    const cs = getComputedStyle(box.querySelector('.gifter-diamond-stack'));
    return cs.animationName;
  });
  await page.close();
  assert.match(exit, /gl-descend/, `exiten spelar inte gl-descend: ${exit}`);
});
