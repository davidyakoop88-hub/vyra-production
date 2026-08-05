'use strict';
// Tre sektioner visade fortfarande tomma kort: Gift Fireworks och de tva VIDEO FX-paketen.
//
// Forra svepet sa 151/151 synliga och missade dem. Skalet ar att svepet matte fel sak, och att
// jsdom inte KAN mata ratt sak:
//
//   - Svepet laste computed opacity och visibility pa widgetens ROT. En widget vars rot ar synlig
//     men vars innehall inte ritar nagot ser identisk ut for den matningen.
//   - jsdom har ingen layout alls. getBoundingClientRect ar 0x0 for varje element, sa "ritar detta
//     nagot" gar inte att avgora dar. Den fragan kan bara stallas i en riktig webblasare.
//
// Uppmatt i webblasaren, med ytmatning (synligt barn med storlek > 1x1):
//
//   battlemvp    9 ritande barn      giftcampaign 39      topgift 28
//   giftfireworks 0 ritande barn     <- tomt kort
//
// TVA OLIKA ORSAKER:
//
// 1. GIFT FIREWORKS
//    .gift-fireworks-fx har opacity 0 i vila - effekten tands nar den spelar. Miniatyrregeln
//    tvingar bara ROTEN synlig; barnens egna opacity lamnades med flit, sa partiklarna inte alla
//    skulle lysa samtidigt. Effektlagret ar dock inte en partikel utan hela innehallet.
//
// 2. VIDEO FX
//    Videon har redan autoplay, loop, muted och playsinline och laddar klart (readyState 4), men
//    Chrome pausar video-only bakgrundsmedia for att spara strom: play() avbryts, currentTime
//    star kvar pa 0, och utan poster ritas ingen bildruta. Att soka till en tidpunkt tvingar fram
//    en avkodad ruta aven nar videon ar pausad.
//
// ROTT NU.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));

test.after(closeAll);

function medCss() {
  const h = createDom({ url: 'https://vyralive.app/studio.html', state: { widgets: [], projectName: 't' } });
  h.load('overlay-sanitize.js');
  // gift-fireworks.js ager renderaren for fyrverkeriet. Utan den finns inget .gift-fireworks-fx
  // att mata pa, och testet hade fallit med "hittades inte" i stallet for pa opacity.
  h.load('gift-fireworks.js');
  const css = fs.readdirSync(ROOT).filter(f => f.endsWith('.css'))
    .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const s = h.document.createElement('style'); s.textContent = css; h.document.head.append(s);
  return h;
}

function iMiniatyr(h, nyckel) {
  const w = VyraWidgets.create(nyckel);
  const box = h.document.createElement('div');
  box.className = 'overlay-widget-gallery';
  box.innerHTML = '<div class="widget-catalog"><button><div class="owg-thumb">' +
    '<div class="owg-thumb-inner"></div></div></button></div>';
  h.document.body.append(box);
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`document.querySelector('.overlay-widget-gallery .owg-thumb-inner').innerHTML = wh(${JSON.stringify(w)})`);
  return { box, el: box.querySelector('.owg-thumb-inner').firstElementChild, h };
}

test('fyrverkeriets effektlager syns i miniatyren', () => {
  const h = medCss();
  const { box, el } = iMiniatyr(h, 'catalog:giftfireworks:magnetic');
  const fx = el.querySelector('.gift-fireworks-fx');
  assert.ok(fx, 'effektlagret hittades inte — testet mater ingenting');
  const s = h.window.getComputedStyle(fx);
  box.remove();

  assert.ok(Number(s.opacity) > 0.5,
    `.gift-fireworks-fx har opacity ${s.opacity} i miniatyren — kortet ritar da en tom ruta`);
});

test('effektlagret ar fortfarande slackt UTANFOR en miniatyr', () => {
  // Annars skulle fyrverkeriet ligga och lysa pa overlayen utan att nagon gett en gava.
  const h = medCss();
  const w = VyraWidgets.create('catalog:giftfireworks:magnetic');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`document.body.insertAdjacentHTML('beforeend', '<div id="ute"></div>');
       document.querySelector('#ute').innerHTML = wh(${JSON.stringify(w)})`);
  const fx = h.document.querySelector('#ute .gift-fireworks-fx');
  const s = h.window.getComputedStyle(fx);

  assert.ok(Number(s.opacity) < 0.5,
    `effektlagret syns utanfor miniatyren: opacity ${s.opacity}`);
});

test('miniatyren tvingar fram en bildruta ur sina videor', () => {
  // Strukturell kontroll. Att bildrutan faktiskt MALAS gar bara att se i en webblasare - jsdom har
  // varken layout eller mediauppspelning. Det som gar att lasa har ar att koden gor forsoket.
  const kall = fs.readFileSync(path.join(ROOT, 'overlay-preview.js'), 'utf8');

  assert.match(kall, /owg-thumb[\s\S]{0,600}querySelectorAll\('video'\)/,
    'miniatyren ror inte sina videor alls — utan poster och utan sokning ritas ingen bildruta');
  assert.match(kall, /currentTime\s*=/,
    'ingen sokning till en tidpunkt; en pausad video utan poster malar ingenting');
});
