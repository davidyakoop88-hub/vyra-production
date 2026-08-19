'use strict';
// Profile — "Rise & Pop" — rörelsevakterna i riktig Chrome, skrivna RÖTT FÖRST.
//
// UPPMÄTT PÅ MAIN FÖRE BYGGET (scratchpad/mat-profile.json, 2026-08-19): profile är mains nakna
// DEFAULTMODELL — vid 40 ms står ALLT på sina vilovärden (badge, h2, h3, p och porträttet på
// opacitet 1,00, ekolagren gd-2/gd-3 på designens 0,28) och inga entréanimationer spelar alls,
// bara heartSpark-gnistorna. Widgeten snäpper på. Eftersom profile är renderarens default
// (`w.gifterLayout||'profile'`) är det här entrén varje användare får som aldrig öppnar
// modellväljaren — den lugnaste av nio, per wt-g-storyboarden 'Classic Rise & Pop'.
//
// FASERNA (glimt 400 → stigning 480 → pop 340, totalt 1220 ms):
//   glimt      ringen tonar upp ensam till 0,35 — allt annat väntar släckt
//   stigning   kroppen (medaljong, diamantrad, rubrik, meddelande) stiger som EN kropp;
//              namnet och brickan väntar
//   pop        namnet fram i kort egen resa, brickan poppar ÖVER 1 (en "pop" som bara växer
//              till 1 är en intoning)
//
// PORTRÄTTET SLÄCKS ALDRIG SJÄLVT (wt-g:s G1-läxa): det ÄRVER medaljongens opacitet. Cb vaktar
// att bildens EGNA beräknade värde står på 1 genom hela entrén — profile TONAR IN porträttet,
// avslöjar det inte (den regeln gäller reveal/flip/duo).
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

async function tandProfile() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:gifterlevel:profile');
    Object.assign(w, { x: 60, y: 90 });
    state.widgets.push(w);
    selected = null;
    render();
  });
  await page.waitForTimeout(600);
  return page;
}

// Opaciteter för de delar vakterna bryr sig om, plus lådans fasklasser och brickans transform.
const MATNING = `(() => {
  const box = document.querySelector('.gifter-level-up');
  const o = sel => { const el = box.querySelector(sel); return el ? +(+getComputedStyle(el).opacity).toFixed(2) : null; };
  const badgeEl = box.querySelector('.gifter-level-badge');
  const m = badgeEl ? getComputedStyle(badgeEl).transform : 'none';
  const skala = m && m.startsWith('matrix(') ? +(+m.slice(7).split(',')[0]).toFixed(3) : 1;
  return {
    faser: [...box.classList].filter(k => k.startsWith('gifter-fas-')),
    badge: o('.gifter-level-badge'), h2: o('h2'), h3: o('h3'), p: o('p'),
    orbit: o('.gifter-orbit'), portratt: o('.gifter-orbit > img'), rad: o('.gifter-diamond-row'),
    brickSkala: skala,
  };
})()`;

test('Ca: faserna spelar i ordning genom den riktiga triggern', { skip }, async () => {
  const page = await tandProfile();
  await page.evaluate(() => window.triggerGifterLevelUp({ __test: true, level: 12, name: 'Prov', username: 'prov' }));
  const vid = async ms => { await page.waitForTimeout(ms); return page.evaluate(MATNING); };
  const f1 = await vid(60);
  const f2 = await vid(440);   // 500 ms — inne i stigningen (400–880)
  const f3 = await vid(450);   // 950 ms — inne i poppen (880–1220)
  const slut = await vid(470); // 1420 ms — sekvensen klar
  await page.close();
  assert.deepEqual(f1.faser, ['gifter-fas-glimt'], `fas 1 fel: ${f1.faser}`);
  assert.deepEqual(f2.faser, ['gifter-fas-stigning'], `fas 2 fel: ${f2.faser}`);
  assert.deepEqual(f3.faser, ['gifter-fas-pop'], `fas 3 fel: ${f3.faser}`);
  assert.deepEqual(slut.faser, [], `fasklasser kvar efter sekvensen: ${slut.faser}`);
});

test('Cb: inget snäpp — släckt i glimten, framme efter sekvensen, porträttet aldrig självsläckt', { skip }, async () => {
  const page = await tandProfile();
  await page.evaluate(() => window.triggerGifterLevelUp({ __test: true, level: 12, name: 'Prov', username: 'prov' }));
  await page.waitForTimeout(60);
  const tidigt = await page.evaluate(MATNING);
  await page.waitForTimeout(1400);
  const sent = await page.evaluate(MATNING);
  await page.close();
  for (const del of ['badge', 'h2', 'h3', 'p', 'rad']) {
    assert.ok(tidigt[del] !== null, `${del} saknas i markupen`);
    assert.ok(tidigt[del] <= 0.15,
      `${del} står på ${tidigt[del]} i glimten — slutet berättas före början`);
    assert.ok(sent[del] >= 0.95, `${del} nådde aldrig fram: ${sent[del]}`);
  }
  // Ringen glimmar: containern är på väg mot 0,35 i glimten och står på 1 efter sekvensen.
  assert.ok(tidigt.orbit !== null && tidigt.orbit <= 0.5,
    `medaljongen står på ${tidigt.orbit} i glimten — glimtens intoning saknas`);
  assert.ok(sent.orbit >= 0.95, `medaljongen nådde aldrig 1,0: ${sent.orbit}`);
  // G1-läxan: porträttets EGNA värde rörs aldrig — det ärver containern.
  assert.equal(tidigt.portratt, 1,
    `porträttet är självsläckt (${tidigt.portratt}) — det ska ÄRVA medaljongens opacitet`);
});

test('Cc: kroppen stiger före namnet och brickan — och brickan poppar ÖVER 1', { skip }, async () => {
  const page = await tandProfile();
  await page.evaluate(() => window.triggerGifterLevelUp({ __test: true, level: 12, name: 'Prov', username: 'prov' }));
  await page.waitForTimeout(600);           // 200 ms in i stigningen
  const mitt = await page.evaluate(MATNING);
  await page.waitForTimeout(440);           // ~1040 ms — nära poppens topp (880 + 55 % av 340)
  const popA = await page.evaluate(MATNING);
  await page.waitForTimeout(60);            // ~1100 ms — fortfarande i överslängen
  const popB = await page.evaluate(MATNING);
  await page.waitForTimeout(400);           // klart
  const slut = await page.evaluate(MATNING);
  await page.close();
  assert.ok(mitt.h2 >= 0.5, `rubriken hänger inte med kroppen: ${mitt.h2} vid 600 ms`);
  assert.ok(mitt.rad >= 0.5, `diamantraden hänger inte med kroppen: ${mitt.rad} vid 600 ms`);
  assert.ok(mitt.h3 <= 0.15, `namnet föregriper poppen: ${mitt.h3} vid 600 ms`);
  assert.ok(mitt.badge <= 0.15, `brickan föregriper poppen: ${mitt.badge} vid 600 ms`);
  const topp = Math.max(popA.brickSkala, popB.brickSkala);
  assert.ok(topp > 1.005,
    `brickan passerar aldrig över 1 (${popA.brickSkala}/${popB.brickSkala}) — en pop som bara växer till 1 är en intoning`);
  assert.ok(Math.abs(slut.brickSkala - 1) <= 0.01, `brickan vilar inte på 1: ${slut.brickSkala}`);
});

test('Cd: ingen exit har smugits in — porten gäller entrén, main har ingen exit för profile', { skip }, async () => {
  const page = await tandProfile();
  await page.evaluate(() => window.triggerGifterLevelUp({ __test: true, level: 12, name: 'Prov', username: 'prov' }));
  await page.waitForTimeout(1450);
  const exit = await page.evaluate(() => {
    const box = document.querySelector('.gifter-level-up');
    box.classList.add('gifter-exit');
    const namn = sel => getComputedStyle(box.querySelector(sel)).animationName;
    return { stack: namn('.gifter-diamond-stack'), badge: namn('.gifter-level-badge'),
      orbit: namn('.gifter-orbit'), faser: [...box.classList].filter(k => k.startsWith('gifter-fas-')) };
  });
  await page.close();
  assert.deepEqual(exit.faser, [], `fasklasser kvar vid exit: ${exit.faser}`);
  for (const [del, namn] of Object.entries({ stack: exit.stack, badge: exit.badge, orbit: exit.orbit })) {
    assert.equal(namn, 'none',
      `${del} spelar '${namn}' under gifter-exit — profile ska lämna som förut (ingen exit)`);
  }
});
