'use strict';
// Raketens flip: EN animation per yta, och ingen kvarglomd (#146).
//
// Blocket i gift-fireworks.css bar spar av tre forsok. Tva av dem levde kvar utan att gora nagot:
//
//   * `@keyframes fwRocketFlip{0%,100%{transform:none}}` — tomma keyframes fran 3D-forsoket. De
//     upptog en animationsplats pa behallaren och gjorde ingenting.
//   * `.fw-rocket-flip,.fw-rocket>.fw-rocket-gift{animation-name:fwRocketFlip,fwPayloadHold}` —
//     dess ANDRA selektor var redan overkord: `.gift-fireworks-fx .fw-rocket>.fw-rocket-gift`
//     hogre upp satter `animation:none!important` med tre klasser mot tva och vinner pa
//     specificitet.
//
// DET GAR INTE ATT SE I KALLKODEN. Bada reglerna ser verksamma ut; det ar kaskaden som avgor.
// Darfor mater det har provet vad webblasaren FAKTISKT kor, inte vad filen sager.
//
// Omskrivningen ar bevisad beteendebevarande: opaciteten spardes vid 0/10/18/50/80/84/88/100 %
// for alla fyra ytor, fore och efter, och varje varde var identiskt.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

let browser, server, bas;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': 'text/css' });
    fs.createReadStream(fil).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  bas = 'http://127.0.0.1:' + server.address().port;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// Bada DOM-formerna som gift-fireworks.js faktiskt bygger (rad 69-70): MED avatar blir gavan ett
// BARNBARN till .fw-rocket, utan avatar ett direktbarn. Skillnaden ar hela poangen med den doda
// selektorn — den siktade pa det andra fallet.
const SIDA = () => `<link rel="stylesheet" href="${bas}/gift-fireworks.css">
  <div class="widget templateGiftFireworks"><div class="gift-fireworks-fx" style="--speed:.6s">
    <div class="fw-rocket" id="med"><div class="fw-rocket-flip">
      <img class="fw-rocket-avatar"><img class="fw-rocket-gift"></div></div>
    <div class="fw-rocket" id="utan"><img class="fw-rocket-gift"></div>
  </div></div>`;

async function mat() {
  const page = await browser.newPage();
  await page.setContent(SIDA(), { waitUntil: 'load' });
  const ut = await page.evaluate(() => {
    const namn = sel => {
      const el = document.querySelector(sel);
      return el ? el.getAnimations().map(a => a.animationName) : null;
    };
    return {
      flip: namn('.fw-rocket-flip'),
      avatar: namn('.fw-rocket-flip .fw-rocket-avatar'),
      gift: namn('.fw-rocket-flip .fw-rocket-gift'),
      utanAvatar: namn('#utan > .fw-rocket-gift'),
    };
  });
  await page.close();
  return ut;
}

test('behallaren kor EN animation, inte en tom plus en verksam', { skip }, async () => {
  const m = await mat();
  assert.deepEqual(m.flip, ['fwPayloadHold'],
    'behallaren kor ' + JSON.stringify(m.flip) + '. En tom keyframe som fwRocketFlip ar inte '
    + 'harmlos: den ser ut som mekanismen for nasta lasare.');
});

test('de tva sidorna vaxlar pa opacitet, en animation var', { skip }, async () => {
  const m = await mat();
  assert.deepEqual(m.avatar, ['fwFaceOut'], 'avsandarsidan: ' + JSON.stringify(m.avatar));
  assert.deepEqual(m.gift, ['fwFaceIn'], 'gavosidan: ' + JSON.stringify(m.gift));
});

test('gavan utan avatar animeras inte — kaskaden stanger av den', { skip }, async () => {
  // UPPMATT pa main FORE omskrivningen: animationName "none", noll animationer. Regeln som pekade
  // hit var alltsa redan dod. Skulle nagon "aterstalla" den faller det har provet i stallet for
  // att en dod rad smyger tillbaka och ser levande ut.
  const m = await mat();
  assert.deepEqual(m.utanAvatar, [],
    'gavan utan avatar kor nu ' + JSON.stringify(m.utanAvatar) + ' — tidigare noll. Antingen har '
    + 'den doda regeln atervant, eller sa har `animation:none` hogre upp tappat sin specificitet.');
});
