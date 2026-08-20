'use strict';
// Ett skript som utokar bind() efter sista bind()-anropet far aldrig kora.
//
// Uppmatt i Davids inloggade produktion, fore nagon atgard:
//
//     .streak-template-section   rubrik: "VYRA TOP STREAK · REDIGERBARA"
//                                dataset.finalPremium: null
//     .prototype-section         rubrik: "VYRA ORIGINAL · REDIGERBARA"
//                                dataset.finalPremium: null
//     katalogen: 142 knappar
//
// finalPremium: null betyder att premium-final.js sektionskod aldrig kordes. Filen VAR laddad —
// window.VyraStreakPremium fanns med sina sju designer. Ett enda extra bind() gav:
//
//     "VYRA TOP STREAK · PREMIUM"    7 knappar
//     "TOP GIFTER · DESIGNVAL"      21 knappar
//
// Orsaken: media.js injicerar ett tjugotal skript som var och ett utokar bind(). Overlay-vyn
// renderas och binder medan de fortfarande laddas. Ingenting anropar bind() igen, sa allt som
// installerats efter den sista bindningen ar dod kod tills anvandaren byter vy.
//
// #89 loste halva problemet — den fangar knappar som TILLKOMMER. Men har tillkom aldrig nagra
// knappar, sa den kunde inte fyra. Det har ar den andra halvan.
//
// VARFOR EN LYSSNARE OCH INTE TJUGO ONLOAD-HAKAR
//
// Att haka i varje injektionsstalle gor det ratt for de tjugo som finns i dag och missar det
// tjugoforsta. En lyssnare i capture-fasen pa document fangar varje skript som laddas, aven
// sadana som ingen kommer ihag att haka i. load bubblar inte fran <script>, men den kan fangas.
//
// ROTT NU.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
test.after(closeAll);

const settle = () => new Promise(r => setTimeout(r, 40));

function studioIOverlay() {
  const h = createDom({ state: { widgets: [], projectName: 'rebind' } });
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`window.IntersectionObserver = function (cb) {
    this.observe = el => cb([{ isIntersecting: true, target: el }], this);
    this.unobserve = () => {}; this.disconnect = () => {};
  };`);
  h.load('overlay-sanitize.js');
  h.load('overlay-preview.js');
  run(`view='overlay';selected=null;render();bind();`);
  return h;
}

// Sa laddas ett sent skript pa riktigt: elementet laggs i dokumentet och fyrar load nar filen
// kommit. Harnessens h.load() kor koden direkt utan load-event, sa eventet dispatchas separat.
function ladddaSent(h, fil) {
  h.load(fil);
  const s = h.document.createElement('script');
  s.src = fil;
  h.document.body.append(s);
  s.dispatchEvent(new h.window.Event('load'));
}

test('premiumsektionerna byggs nar filen kommer efter bind', async () => {
  const h = studioIOverlay();
  const forst = h.document.querySelector('.streak-template-section');
  assert.ok(forst, 'ingen streak-sektion i katalogen — riggen bygger inte overlay-vyn');
  assert.equal(forst.dataset.finalPremium, undefined,
    'premium hade redan kort; testet mater da inte det sena fallet');

  ladddaSent(h, 'premium-final.js');
  await settle();

  const sek = h.document.querySelector('.streak-template-section');
  assert.equal(sek.dataset.finalPremium, '1',
    'premium-final.js laddades efter sista bind() och dess sektionskod kordes aldrig — ' +
    'exakt det som gjorde att TOP STREAK · PREMIUM och TOP GIFTER · DESIGNVAL saknades helt ' +
    'i produktion');
  // Sektionen bar sedan 2026-08-13 TVA rubriker: media.js bygger "REDIGERBARA" (7 klassiska
  // stilar + 8 ramar) och premium-final.js lagger till "PREMIUM" efter den. Bada anvander nu
  // tillagg i stallet for `innerHTML =`, sa ingen raderar den andra. querySelector('h4') tar
  // den FORSTA rubriken och sager darfor REDIGERBARA — kravet ar att PREMIUM finns, inte att
  // den ar ensam.
  const rubriker = [...sek.querySelectorAll('h4')].map(h => h.textContent.trim());
  assert.ok(rubriker.some(t => /PREMIUM/.test(t)),
    `ingen PREMIUM-rubrik; rubrikerna ar: ${rubriker.join(' | ') || '(inga)'}`);
  assert.equal(sek.querySelectorAll('[data-pf-streak]').length, 7);

  // .prototype-section har TVA rubriker, och det ar med flit. Forut satte premium-final.js
  // innerHTML pa sektionen och tog darmed bort "VYRA ORIGINAL · REDIGERBARA" tillsammans med
  // media.js:129:s atta extrateman och sju Top Gift-ramar — femton knappar som forsvann vid varje
  // forsta bind-pass. Vid ett andra bind blockerade finalPremium-flaggan overskrivningen och
  // knapparna kom tillbaka, vilket fick felet att se ut som ett ombindningsproblem.
  // Uppmatt i Chromium: 145 knappar vid navigering, 164 efter rattelsen.
  const proto = h.document.querySelector('.prototype-section');
  const protoRubriker = [...proto.querySelectorAll('h4')].map(el => el.textContent);
  assert.ok(protoRubriker.some(t => /TOP GIFTER/.test(t)),
    `ingen TOP GIFTER-rubrik i sektionen: ${JSON.stringify(protoRubriker)}`);
  assert.ok(protoRubriker.some(t => /VYRA ORIGINAL/.test(t)),
    'premium-final.js skrev over sektionen igen — "VYRA ORIGINAL" och dess femton knappar ar borta:\n  ' +
    JSON.stringify(protoRubriker));
  assert.ok(proto.querySelectorAll('[data-pf-topgift]').length >= 21,
    `bara ${proto.querySelectorAll('[data-pf-topgift]').length} Top Gifter-knappar`);
});

test('de sena knapparna far bade koppling och miniatyr', async () => {
  // Halvorna ihop: den har PR:en far sektionerna att byggas, #89 ser till att knapparna kopplas.
  const h = studioIOverlay();
  ladddaSent(h, 'premium-final.js');
  await settle();

  const kn = [...h.document.querySelectorAll('[data-pf-streak], [data-pf-topgift]')];
  assert.ok(kn.length >= 28, `bara ${kn.length} premiumknappar`);
  const okopplade = kn.filter(b => !b.dataset.owgWrapped);
  assert.equal(okopplade.length, 0, `${okopplade.length} premiumknappar kopplades aldrig`);
  const utanMiniatyr = kn.filter(b => !b.querySelector('.owg-thumb'));
  assert.equal(utanMiniatyr.length, 0, `${utanMiniatyr.length} premiumknappar fick ingen miniatyr`);
});

test('ombindningen ror inte anvandarens layout', async () => {
  const h = studioIOverlay();
  ladddaSent(h, 'premium-final.js');
  await settle();
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`window.__l = { minnet: state.widgets.length,
    lagring: (JSON.parse(localStorage.getItem('vyra-state') || '{}').widgets || []).length }`);
  assert.deepEqual({ ...h.window.__l }, { minnet: 0, lagring: 0 },
    'ombindningen la widgets i layouten');
});

test('ombindningen snurrar inte', async () => {
  const h = studioIOverlay();
  ladddaSent(h, 'premium-final.js');
  await settle();
  const sek = h.document.querySelector('.streak-template-section');
  const forst = sek.querySelectorAll('[data-pf-streak]').length;

  // Fem skriptladdningar till ska inte dubblera nagot: dataset-vakterna gor sektionsbygget
  // idempotent och #89 hoppar over redan kopplade knappar.
  for (let i = 0; i < 5; i++) {
    const s = h.document.createElement('script');
    h.document.body.append(s);
    s.dispatchEvent(new h.window.Event('load'));
  }
  await settle();
  assert.equal(sek.querySelectorAll('[data-pf-streak]').length, forst,
    'sektionen byggdes om vid varje skriptladdning');
  const dubbla = [...h.document.querySelectorAll('[data-pf-streak]')]
    .filter(b => b.querySelectorAll('.owg-actions').length > 1);
  assert.equal(dubbla.length, 0, `${dubbla.length} knappar fick dubbla actions-rader`);
});

test('vakten sitter pa document och tacker alla skript', () => {
  // Strukturellt: en lyssnare i capture-fasen tacker aven de injektionsstallen som annu inte
  // finns. Tjugo enskilda onload-hakar hade tackt de tjugo som finns i dag.
  const media = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
  // Forsta forsoket lat bara 200 tecken passera mellan 'load' och true — lyssnarkroppen ar dubbelt
  // sa lang, sa testet var rott for korrekt kod. Matfel, inte kodfel.
  assert.match(media, /addEventListener\('load'[\s\S]{0,800}?\}\s*,\s*true\s*\)/,
    'ingen capture-lyssnare for skriptladdningar i media.js');
  // ...och den maste faktiskt binda om, inte bara lyssna.
  const block = media.slice(media.indexOf("addEventListener('load'"));
  assert.match(block.slice(0, 800), /tagName\s*!==\s*'SCRIPT'/,
    'lyssnaren skiljer inte ut skriptladdningar');
  assert.match(block.slice(0, 800), /bind\s*\(\s*\)/,
    'lyssnaren binder aldrig om');
});
