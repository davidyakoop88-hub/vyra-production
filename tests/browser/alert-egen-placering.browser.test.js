'use strict';
// F01 (P1): en textalert med scenpanelens "Egen placering" hamnade ändå längst ned.
//
// Uppmätt i overlay-utgången före lagningen: X=100, Y=100, Bredd=300 i 1080×1920-duken gav
// klassen `bottom` och rect left 180 / top 904 / bredd 360 i en 720×1280-källa — showAlert läste
// bara config.alertPosition och lät `scene` ligga orörd. Bild och video gick genom stage() och
// hamnade rätt; samma action, två olika ställen.
//
// Provet kör i riktig Chromium eftersom det är LAYOUTEN som ska bevisas (calc mot vw/vh,
// translate, box-sizing) — det kan jsdom inte. Riggen laddar bara de tre filerna som bär kedjan:
// action-event.css, action-options.js (showAlert) och action-runtime.js (stage + execute).
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const RIGG = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/action-event.css"><style>html,body{margin:0;background:transparent}</style>
</head><body><script>window.VYRA_OVERLAY_SCENE=1</script>
<script src="/action-options.js"></script><script src="/action-runtime.js"></script></body></html>`;

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    if (rel === '__rigg.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(RIGG); return; }
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

let server, browser, bas;
const skip = hoppaOver();

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

// 720×1280 är samma källa som granskningen mätte i: duken 1080×1920 skalas med 2/3.
async function rigg() {
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
  await page.goto(`${bas}/__rigg.html`, { waitUntil: 'load' });
  return page;
}
const rect = (page, sel) => page.evaluate(s => {
  const el = document.querySelector(s); if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, klass: el.className };
}, sel);
const nara = (fatt, vantat, namn, tol = 3) => assert.ok(Math.abs(fatt - vantat) <= tol, `${namn}: ${fatt} skulle vara ≈${vantat}`);
const SCEN = { number: 1, placement: 'custom', x: 100, y: 100, width: 300, layer: 10 };

test('egen placering: textalerten följer scenens x/y/bredd, inte alertPosition', { skip }, async () => {
  const page = await rigg();
  await page.evaluate(scene => document.dispatchEvent(new CustomEvent('vyra:runtime-alert', {
    detail: { action: { types: ['alert'], scene, config: {} }, payload: { username: 'Test' } }
  })), SCEN);
  // Efter in-animationen (.32 s): positionen ska stå där `.show` lämnar den, inte under övergången.
  await page.waitForTimeout(700);
  const r = await rect(page, '.vyra-action-alert');
  assert.ok(r, 'ingen alert ritades');
  assert.doesNotMatch(r.klass, /\bbottom\b/, 'alerten bar fortfarande klassen bottom');
  nara(r.left, 100 * 720 / 1080, 'left');
  nara(r.top, 100 * 1280 / 1920, 'top');
  nara(r.width, 300 * 720 / 1080, 'width');
  await page.close();
});

test('alert och bild från samma action hamnar på samma ställe (samma omräkning som stage)', { skip }, async () => {
  const page = await rigg();
  const ok = await page.evaluate(scene => window.VyraActionRuntime.execute({
    runId: 'f01', action: { id: 'f01', types: ['picture', 'alert'], duration: 6, scene,
      pictureMedia: { packagePath: 'assets/images/test-profile.svg' }, config: {} }, payload: {}
  }), SCEN);
  assert.equal(ok, true, 'runtime tog inte emot actionen');
  await page.waitForTimeout(800);
  const bild = await rect(page, '.vyra-runtime-item');
  const alert = await rect(page, '.vyra-action-alert');
  assert.ok(bild && alert, `saknas: bild=${!!bild} alert=${!!alert}`);
  nara(alert.left, bild.left, 'left mot bilden', 1);
  nara(alert.top, bild.top, 'top mot bilden', 1);
  nara(alert.width, bild.width, 'width mot bilden', 1);
  await page.close();
});

// Scenpanelens FÖRVAL får inte ändra en befintlig alerts utseende (samordnarens krav inför
// sändning): de ger samma centrerade klass som förr. Facit är samma alert UTAN scen med
// motsvarande alertPosition — den vägen är orörd sedan origin/main, så lika rect betyder samma
// rect som på main. Uppmätt på origin/main (720×1280, med användarnamn): bottom L180 T1064.4
// B360, top L180 T89.6 B360. 'scen top utan alertPosition' är den enda raden som skiljer sig
// från main (där blev den bottom) — det är mappningen av förvalet, med avsikt.
const FORVAL = [
  // [namn, scen, config, väntad klass]
  ['förval bottom', { placement: 'bottom', x: 160, y: 1450, width: 760 }, {}, 'bottom'],
  ['förval top', { placement: 'top', x: 160, y: 80, width: 760 }, {}, 'top'],
  ['förval center', { placement: 'center', x: 160, y: 690, width: 760 }, {}, 'center'],
  ['förval fullscreen → bottom', { placement: 'fullscreen', x: 0, y: 0, width: 1080 }, {}, 'bottom'],
  // Scenpanelen sparar 'bottom' där ingen rört den: en gammal "Längst upp"-alert ska stå kvar.
  ['orörd scen bottom + gammal alertPosition top', { placement: 'bottom', x: 160, y: 1450, width: 760 }, { alertPosition: 'top' }, 'top'],
  ['scen top + gammal alertPosition top', { placement: 'top', x: 160, y: 80, width: 760 }, { alertPosition: 'top' }, 'top'],
  // Egen placering är ett aktivt val och vinner även över ett gammalt alertPosition.
  ['custom + gammal alertPosition top', { placement: 'custom', x: 100, y: 100, width: 300 }, { alertPosition: 'top' }, 'scenplacerad'],
];
test('scenpanelens förval ger samma centrerade alert som förr; custom vinner över gammalt läge', { skip }, async () => {
  const page = await rigg();
  const visa = (scene, config) => page.evaluate(([scene, config]) => {
    document.querySelector('#vyraActionAlertHost')?.replaceChildren();
    document.dispatchEvent(new CustomEvent('vyra:runtime-alert', {
      detail: { action: { types: ['alert'], ...(scene ? { scene } : {}), config }, payload: { username: 'Test' } }
    }));
  }, [scene, config]);
  for (const [namn, scene, config, klass] of FORVAL) {
    await visa(scene, config);
    await page.waitForTimeout(600);
    const r = await rect(page, '.vyra-action-alert');
    assert.match(r.klass, new RegExp(`\\b${klass}\\b`), `${namn}: klassen ${klass} saknas (${r.klass})`);
    if (klass === 'scenplacerad') {
      nara(r.left, 100 * 720 / 1080, `${namn}: left`); nara(r.top, 100 * 1280 / 1920, `${namn}: top`);
      continue;
    }
    assert.doesNotMatch(r.klass, /scenplacerad/, `${namn}: förvalet blev egen placering`);
    await visa(null, { alertPosition: klass });
    await page.waitForTimeout(600);
    const facit = await rect(page, '.vyra-action-alert');
    for (const k of ['left', 'top', 'width']) nara(r[k], facit[k], `${namn}: ${k} mot alertPosition ${klass}`, 0.5);
  }
  await page.close();
});

test('gammal action utan scen: alertPosition gäller som förr', { skip }, async () => {
  const page = await rigg();
  for (const [pos, top] of [['top', 0.07 * 1280], ['bottom', null]]) {
    await page.evaluate(p => document.dispatchEvent(new CustomEvent('vyra:runtime-alert', {
      detail: { action: { types: ['alert'], config: { alertPosition: p } }, payload: {} }
    })), pos);
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => {
      const el = document.querySelector('.vyra-action-alert'), b = el.getBoundingClientRect();
      return { klass: el.className, mitt: b.left + b.width / 2, top: b.top, botten: innerHeight - b.bottom };
    });
    assert.match(r.klass, new RegExp(`\\b${pos}\\b`), `klassen ${pos} saknas`);
    nara(r.mitt, 360, `${pos}: centrerad`, 2);
    if (top != null) nara(r.top, top, `${pos}: top`);
    else nara(r.botten, 0.07 * 1280, `${pos}: avstånd till botten`);
  }
  await page.close();
});
