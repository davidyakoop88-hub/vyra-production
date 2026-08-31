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
// Darfor mater provet vad webblasaren FAKTISKT kor, inte vad filen sager.
//
// Omskrivningen ar bevisad beteendebevarande: opaciteten spardes vid 0/10/18/50/80/84/88/100 %
// for alla fyra ytor, fore och efter, och varje varde var identiskt.
//
// EN BILLIG FIL MED FLIT. Browsersviten kor 62 filer parallellt och varje fil startar en EGEN
// webblasare; pa CI:s fa karnor ar den redan pa grasen. Forsta versionen av den har filen la till
// bade en webblasare OCH en HTTP-server, och da foll test-client TVA ganger pa samma commit — pa
// tva OLIKA prov (livesession respektive gifter-fas Bc), medan main var gron elva korningar i rad.
// Tva olika prov pekar pa trangsel, inte pa en defekt, och min fil var det som tippade den.
// Darav: CSS:en lases fran disk och injiceras inline (ingen server), och alla pastaenden delar EN
// sida i ETT prov (en sidladdning i stallet for tre).
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), fs = require('fs');

const CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'gift-fireworks.css'), 'utf8');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

let browser;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
});
test.after(async () => { if (browser) await browser.close() });

// Bada DOM-formerna som gift-fireworks.js faktiskt bygger (rad 69-70): MED avatar blir gavan ett
// BARNBARN till .fw-rocket, utan avatar ett direktbarn. Skillnaden ar hela poangen med den doda
// selektorn — den siktade pa det andra fallet.
const SIDA = `<style>${CSS}</style>
  <div class="widget templateGiftFireworks"><div class="gift-fireworks-fx" style="--speed:.6s">
    <div class="fw-rocket" id="med"><div class="fw-rocket-flip">
      <img class="fw-rocket-avatar"><img class="fw-rocket-gift"></div></div>
    <div class="fw-rocket" id="utan"><img class="fw-rocket-gift"></div>
  </div></div>`;

test('flippen kor ratt animationer och inga kvarglomda', { skip }, async () => {
  const page = await browser.newPage();
  let m;
  try {
    await page.setContent(SIDA, { waitUntil: 'load' });
    m = await page.evaluate(() => {
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
  } finally { await page.close() }

  // En tom keyframe som fwRocketFlip ar inte harmlos: den ser ut som mekanismen for nasta lasare.
  assert.deepEqual(m.flip, ['fwPayloadHold'], 'behallaren kor ' + JSON.stringify(m.flip));

  // De tva sidorna vaxlar pa OPACITET, inte rotateY — filter pa bilderna plattar ut 3D.
  assert.deepEqual(m.avatar, ['fwFaceOut'], 'avsandarsidan: ' + JSON.stringify(m.avatar));
  assert.deepEqual(m.gift, ['fwFaceIn'], 'gavosidan: ' + JSON.stringify(m.gift));

  // UPPMATT pa main FORE omskrivningen: animationName "none", noll animationer. Regeln som pekade
  // hit var alltsa redan dod. Skulle nagon "aterstalla" den faller det har i stallet for att en
  // dod rad smyger tillbaka och ser levande ut.
  assert.deepEqual(m.utanAvatar, [],
    'gavan utan avatar kor nu ' + JSON.stringify(m.utanAvatar) + ' — tidigare noll. Antingen har '
    + 'den doda regeln atervant, eller sa har `animation:none` hogre upp tappat sin specificitet.');
});
