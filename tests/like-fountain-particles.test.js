'use strict';
// Canvas-lagret for Like Fountain, matt i jsdom.
//
// Provet tackar det som gar att avgora UTAN en riktig duk: paletterna, poppkurvan,
// och att modulen kan frysas. Sjalva ritningen provas i webblasaren; jsdom har
// ingen canvas-kontext och kan darfor inte saga nagot om den.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
const factory = require('../widget-factory.js');

test.after(closeAll);

const ROOT = path.join(__dirname, '..');
// Radsluten normaliseras VID INLASNINGEN, inte i varje enskild vakt. En Windows-checkout
// med core.autocrlf=true ger CRLF i arbetskopian aven om bloben i Git ar LF, och da
// slutar varje radbaserad regex harnere att bita. Se kommentaren i sista provet.
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const KALLA = las('like-fountain-particles.js');
const MEDIA = las('media.js');

function starta(overrides = {}) {
  const w = factory.create('catalog:likefountain');
  Object.assign(w, { id: 'lf1' }, overrides);
  const h = createDom({ state: { widgets: [w], projectName: 'test' } });
  h.paint([w]);
  h.load('like-fountain-particles.js');
  return { h, w, fx: h.window.VyraLikeFountainFx };
}

test('modulen exponerar samma kontrakt som de andra partikelmotorerna', () => {
  const { fx } = starta();
  assert.ok(fx, 'VyraLikeFountainFx saknas');
  for (const namn of ['pop', 'scan', 'still', 'aktiva', 'antal', 'paletter', 'poppskala']) {
    assert.equal(typeof fx[namn], namn === 'paletter' ? 'object' : 'function',
      `${namn} saknas i det publika kontraktet`);
  }
});

test('paletterna ar samma atta som media.js bygger DOM-fontanen med', () => {
  const { fx } = starta();
  // media.js: `let palettes={rainbow:[...],neon:[...],...,custom:...}`
  const rad = MEDIA.split('\n').find(r => r.includes('function likeFountainHtml'));
  assert.ok(rad, 'hittade inte likeFountainHtml i media.js');
  const iMedia = [...rad.matchAll(/([a-z]+):\['#/g)].map(m => m[1]);
  assert.ok(iMedia.length >= 8, `forvantade minst atta paletter i media.js, fick ${iMedia.length}`);

  for (const namn of iMedia) {
    assert.ok(fx.paletter[namn], `paletten ${namn} finns i media.js men inte i motorn`);
  }
  // `custom` byggs av anvandarens egna falt och hor inte hemma i en fast tabell.
  assert.equal(fx.paletter.custom, undefined, 'custom ska inte vara en fast palett');
});

test('varje palettfarg ar en ren hexkod — de hamnar i canvas, inte i ett style-attribut', () => {
  const { fx } = starta();
  for (const [namn, farger] of Object.entries(fx.paletter)) {
    assert.ok(Array.isArray(farger) && farger.length >= 3, `${namn} har for fa farger`);
    for (const f of farger) {
      assert.match(f, /^#[0-9a-f]{6}$/i, `${namn} bar ett varde som inte ar en hexkod: ${f}`);
    }
  }
});

test('poppkurvan skjuter over och landar exakt pa ett', () => {
  const { fx } = starta();
  assert.equal(fx.poppskala(0), 0, 'borjar pa noll');
  assert.equal(fx.poppskala(1), 1, 'vilar pa ett');
  assert.equal(fx.poppskala(4), 1, 'stannar pa ett efter poppen');

  let max = 0;
  for (let t = 0; t <= 1; t += 0.01) max = Math.max(max, fx.poppskala(t));
  assert.ok(max > 1.2, `overskjutningen uteblev — hogsta vardet var ${max.toFixed(3)}`);
  assert.ok(max < 1.45, `overskjutningen ar for stor — ${max.toFixed(3)}`);
});

test('still() gar att anropa och ar idempotent', () => {
  const { fx } = starta();
  assert.equal(fx.still(), true);
  assert.equal(fx.still(), true, 'en andra frysning far inte kasta');
  assert.equal(fx.aktiva(), 0);
  assert.equal(fx.antal(), 0);
});

test('scan() fragar om modulen ar frusen innan den forvarmer', () => {
  // DET HAR AR EN STRUKTURVAKT, INTE EN BETEENDEVAKT, och det ar med flit.
  //
  // Forsta forsoket provade beteendet: frys, kor scan(), rakna dukar. Det provet var
  // GRONT AVEN MED VAKTEN BORTTAGEN — jsdom har ingen layout, sa getBoundingClientRect()
  // ger 0x0, matt() returnerar false och ingen duk skapas oavsett. Mutationsprovet
  // avslojade det. Beteendet hor darfor hemma i ett browserprov.
  //
  // Det HAR gar att avgora i jsdom: att kontrollen finns kvar i koden. Tas den bort
  // bygger nasta render tillbaka duken efter en frysning, och den visuella
  // regressionen borjar flacka — precis som den gjorde for Battle MVP.
  const kropp = KALLA.slice(KALLA.indexOf('function scan()'));
  const slut = kropp.indexOf('\n  }');
  assert.ok(slut > 0, 'hittade inte scan()');
  assert.match(kropp.slice(0, slut), /if\s*\(\s*frusen/,
    'scan() maste returnera tidigt nar modulen ar frusen');
});

test('duken heter lf-duk och krockar inte med widgetens lf-fx-klasser', () => {
  // .lf-fx-burst, .lf-fx-sparkle, .lf-fx-ring med flera ar modifierare pa
  // widgetroten. En duk som hette .lf-fx hade legat i vagen for dem.
  assert.ok(KALLA.includes("'lf-duk'"), 'duken ska heta lf-duk');
  assert.ok(!/['"]lf-fx['"]/.test(KALLA), 'lf-fx ar upptaget av widgetens egna modifierare');
});

test('motorn ror inte likeFountainHtml', () => {
  // Hela poangen med ett separat lager: DOM-fontanen ar reserven och ska vara orord.
  // Namnet FAR forekomma i en kommentar -- den forklarar just att filen lamnar
  // DOM-byggaren ifred. Det som inte far finnas ar ett ANROP.
  //
  // OM DEN HAR VAKTEN FALLER UTAN ATT MOTORN HAR ANDRATS: kolla radsluten forst.
  // `.*$` kan inte matcha en rad som slutar pa CRLF -- `.` stannar FORE `\r` (det ar ett
  // radslut for regexmotorn) och `$` matchar inte dar. Strippningen blev alltsa en tyst
  // no-op pa en Windows-checkout, hela filhuvudets kommentar overlevde, och vakten fallde
  // pa sin egen forklarande kommentar. CI ar gron for exakt samma kod eftersom Linux
  // checkar ut LF. Darav normaliseringen i `las()` ovan -- och ingen `$`-ankare har.
  const utanKommentarer = KALLA
    .split('\n').map(rad => rad.replace(/\/\/.*/, '')).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/likeFountainHtml\s*\(/.test(utanKommentarer),
    'motorn ska inte anropa DOM-byggaren');
  assert.ok(!utanKommentarer.includes('likeFountainHtml'),
    'motorn ska inte referera DOM-byggaren utanfor kommentarer');
  assert.ok(MEDIA.includes('function likeFountainHtml'),
    'DOM-fontanen ska finnas kvar som reserv');
});
