'use strict';
// Number — "Räkneverket" — rörelsevakterna i riktig Chrome, skrivna RÖTT FÖRST.
//
// UPPMÄTT PÅ MAIN FÖRE BYGGET (scratchpad/mat-number.json, 2026-08-20): allt står på sina
// vilovärden vid 40 ms — badge, rubrik, namn, meddelande, diamantrad och bottenavatar på
// opacitet 1,00 — men SIFFRAN har redan sin egen koreografi: `.gifter-big-level` är dämpad
// till 0,85 (xform-old) och `gifter-land` spelar i slutet. gifterTransform (media.js) äger
// den mekaniken sedan länge: gamla siffran 0-450, burst 450-750, BYTET vid 750, land till 1250.
//
// KOREOGRAFIN DUPLICERAR INTE DET — den ramar in det:
//   fas 1 · ratt        460 ms   ringen och den GAMLA siffran ÄR anticipationen (enda modellen
//                                vars fas 1 inte är en tom scen); allt annat väntar släckt
//   fas 2 · montering   480 ms   bytet sker 290 ms in i fasen; DÄREFTER monteras diamantraden
//                                och rubriken (väg A), sedan badge/namn/text/bottenavatar (väg B)
//   fas 3 · avlasning   340 ms   sista raderna landar
//
// FAS 1 SLÄCKER FÖRÄLDERN, ALDRIG BILDEN SJÄLV: `.gifter-bottom-profile` är modellens enda
// porträtt (och SYNS bara här) — dess img behåller sitt eget värde, precis som profile-läxan.
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

async function tandNumber() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:gifterlevel:number');
    Object.assign(w, { x: 60, y: 90 });
    state.widgets.push(w);
    selected = null;
    render();
  });
  await page.waitForTimeout(600);
  return page;
}

const MATNING = `(() => {
  const box = document.querySelector('.gifter-level-up');
  const o = sel => { const el = box.querySelector(sel); return el ? +(+getComputedStyle(el).opacity).toFixed(2) : null; };
  const siffra = box.querySelector('.gifter-big-level');
  return {
    faser: [...box.classList].filter(k => k.startsWith('gifter-fas-')),
    xform: [...box.classList].filter(k => k.startsWith('gifter-xform-')),
    siffraText: siffra ? siffra.textContent.trim() : null, siffraOp: o('.gifter-big-level'),
    badge: o('.gifter-level-badge'), h2: o('h2'), h3: o('h3'), p: o('p'),
    rad: o('.gifter-diamond-row'), botten: o('.gifter-bottom-profile'),
    bottenBild: o('.gifter-bottom-profile img'),
  };
})()`;

test('Da: faserna spelar i ordning genom den riktiga triggern', { skip }, async () => {
  const page = await tandNumber();
  await page.evaluate(() => window.triggerGifterLevelUp({ __test: true, level: 12, name: 'Prov', username: 'prov' }));
  const vid = async ms => { await page.waitForTimeout(ms); return page.evaluate(MATNING); };
  const f1 = await vid(60);
  const f2 = await vid(560);   // 620 ms — inne i monteringen (460–940)
  const f3 = await vid(400);   // 1020 ms — inne i avläsningen (940–1280)
  const slut = await vid(450); // 1470 ms — sekvensen klar
  await page.close();
  assert.deepEqual(f1.faser, ['gifter-fas-ratt'], `fas 1 fel: ${f1.faser}`);
  assert.deepEqual(f2.faser, ['gifter-fas-montering'], `fas 2 fel: ${f2.faser}`);
  assert.deepEqual(f3.faser, ['gifter-fas-avlasning'], `fas 3 fel: ${f3.faser}`);
  assert.deepEqual(slut.faser, [], `fasklasser kvar efter sekvensen: ${slut.faser}`);
});

test('Db: fas 1 är den gamla siffrans beat — allt annat väntar släckt', { skip }, async () => {
  const page = await tandNumber();
  await page.evaluate(() => window.triggerGifterLevelUp({ __test: true, level: 12, fromLevel: 11, name: 'Prov', username: 'prov' }));
  await page.waitForTimeout(120);
  const m = await page.evaluate(MATNING);
  await page.close();
  // Siffran ÄR scenen i fas 1 — den ska synas, inte släckas.
  assert.ok(m.siffraOp !== null && m.siffraOp >= 0.6,
    `siffran står på ${m.siffraOp} i fas 1 — den är modellens anticipation och ska synas`);
  assert.equal(m.siffraText, '11', `fas 1 ska visa den GAMLA nivån, visade "${m.siffraText}"`);
  for (const del of ['badge', 'h2', 'h3', 'p', 'rad', 'botten']) {
    assert.ok(m[del] !== null, `${del} saknas i markupen`);
    assert.ok(m[del] <= 0.15, `${del} står på ${m[del]} i fas 1 — monteringen föregriper bytet`);
  }
  // Profile-läxan: föräldern släcks, aldrig bilden själv.
  assert.equal(m.bottenBild, 1,
    `bottenavatarens bild är självsläckt (${m.bottenBild}) — fas 1 ska släcka FÖRÄLDERN`);
});

test('Dc: monteringen börjar efter siffrans byte, inte före', { skip }, async () => {
  const page = await tandNumber();
  await page.evaluate(() => window.triggerGifterLevelUp({ __test: true, level: 12, fromLevel: 11, name: 'Prov', username: 'prov' }));
  await page.waitForTimeout(690);            // strax FÖRE bytet vid 750
  const fore = await page.evaluate(MATNING);
  await page.waitForTimeout(430);            // ~1120 ms — efter bytet, mitt i monteringen
  const efter = await page.evaluate(MATNING);
  await page.waitForTimeout(500);
  const slut = await page.evaluate(MATNING);
  await page.close();
  assert.ok(fore.rad <= 0.5 && fore.h2 <= 0.5,
    `monteringen syns redan före bytet: rad ${fore.rad}, h2 ${fore.h2}`);
  assert.ok(efter.rad >= 0.5 && efter.h2 >= 0.5,
    `monteringen har inte börjat efter bytet: rad ${efter.rad}, h2 ${efter.h2}`);
  assert.equal(slut.siffraText, '12', `siffran ska visa den NYA nivån till slut: "${slut.siffraText}"`);
  for (const del of ['badge', 'h2', 'h3', 'p', 'rad', 'botten']) {
    assert.ok(slut[del] >= 0.95, `${del} nådde aldrig fram: ${slut[del]}`);
  }
});

test('Dd: siffrans egen mekanik är orörd — gifterTransform äger fortfarande bytet', { skip }, async () => {
  const page = await tandNumber();
  await page.evaluate(() => window.triggerGifterLevelUp({ __test: true, level: 12, fromLevel: 11, name: 'Prov', username: 'prov' }));
  const klasser = [];
  for (const ms of [200, 600, 900, 1300]) {
    await page.waitForTimeout(ms === 200 ? 200 : 300);
    klasser.push(await page.evaluate(`[...document.querySelector('.gifter-level-up').classList].filter(k => k.startsWith('gifter-xform-'))`));
  }
  await page.close();
  const platt = klasser.flat();
  assert.ok(platt.includes('gifter-xform-old'), `xform-old spelade aldrig: ${JSON.stringify(klasser)}`);
  assert.ok(platt.includes('gifter-xform-new'), `xform-new spelade aldrig: ${JSON.stringify(klasser)}`);
});
