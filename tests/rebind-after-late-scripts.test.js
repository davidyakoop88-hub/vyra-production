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
  // Sedan 2026-09-20 ror premium-final.js inte streak-sektionen alls (Top Streaks premiumdesigner
  // ar avvecklade), sa beviset for att den sena filen KORDE sin sektionskod hamtas fran
  // .prototype-section, som den fortfarande marker.
  const proto0 = h.document.querySelector('.prototype-section');
  assert.equal(proto0 && proto0.dataset.finalPremium, '1',
    'premium-final.js laddades efter sista bind() och dess sektionskod kordes aldrig — ' +
    'exakt det som gjorde att TOP GIFTER · DESIGNVAL saknades helt i produktion');
  // Sektionen bar sedan 2026-08-13 TVA rubriker: media.js bygger "REDIGERBARA" (7 klassiska
  // stilar + 8 ramar) och premium-final.js lagger till "PREMIUM" efter den. Bada anvander nu
  // tillagg i stallet for `innerHTML =`, sa ingen raderar den andra. querySelector('h4') tar
  // den FORSTA rubriken och sager darfor REDIGERBARA — kravet ar att PREMIUM finns, inte att
  // den ar ensam.
  // SEDAN 2026-09-20 bygger premium-final.js INGEN streak-sektion: Top Streaks sju premiumdesigner
  // ar avvecklade och approved-rankings.js ager sektionen (Clean Flip, en knapp). Det som ska
  // finnas kvar efter det sena bind-passet ar att sektionen inte fatt nagon gammal knapp tillbaka.
  // Riggen laddar inte approved-rankings.js, sa media.js:s egna tema-/ramknappar star kvar har;
  // i Studion tar approved-rankings bort hela sektionen. Det som INTE far komma tillbaka via den
  // sena filen ar premiumknapparna, som var premium-final.js:s.
  assert.equal(sek.querySelectorAll('[data-pf-streak]').length, 0,
    'premium-final.js byggde Top Streaks avvecklade premiumknappar igen');

  // REGELN SOM PROVAS: premium-final.js ska LAGGA TILL i .prototype-section, aldrig skriva over
  // den. Forut satte den innerHTML pa sektionen och tog darmed bort "VYRA ORIGINAL · REDIGERBARA"
  // med dess knappar vid varje forsta bind-pass; vid ett andra bind blockerade finalPremium-flaggan
  // overskrivningen och knapparna kom tillbaka, vilket fick felet att se ut som ett
  // ombindningsproblem. Uppmatt i Chromium: 145 knappar vid navigering, 164 efter rattelsen.
  //
  // TALEN ar sedan dess andra: media.js:s femton egna knappar (atta extrateman, sju Top Gift-ramar)
  // pensionerades 2026-09-23, och premiumdesignerna gick fran 21 till tva. Regeln ar densamma —
  // bada rubrikerna ska finnas kvar, och Top Gifter-knapparna ska vara de fabriken kanner.
  const proto = h.document.querySelector('.prototype-section');
  const protoRubriker = [...proto.querySelectorAll('h4')].map(el => el.textContent);
  assert.ok(protoRubriker.some(t => /TOP GIFTER/.test(t)),
    `ingen TOP GIFTER-rubrik i sektionen: ${JSON.stringify(protoRubriker)}`);
  // "VYRA ORIGINAL"-RUBRIKEN VAR OVERSKRIVNINGSPROBEN, och den gar inte langre att anvanda.
  // Provet lade den har for att media.js byggde rubriken FORE premium-final.js korde: fanns den
  // kvar efterat hade den sena filen lagt till, inte skrivit over. 2026-09-23 togs sektionens
  // sista egna knapp bort ("Top Gift Flip") och med den rubriken — sektionen ar nu tom nar
  // premium-final.js far den. Da finns ingenting for en `innerHTML =` att radera, och en probe som
  // inte kan falla vaktar ingenting.
  //
  // Regeln ar oforandrad och provas darfor i KALLAN i stallet: premium-final.js ska LAGGA TILL i
  // .prototype-section. Skriver den `gifts.innerHTML =` igen faller raden nedan, och den faller
  // aven om sektionen rakar vara tom just da — vilket DOM-proben inte hade gjort.
  const premiumKalla = fs.readFileSync(path.join(ROOT, 'premium-final.js'), 'utf8');
  assert.match(premiumKalla, /gifts\.insertAdjacentHTML\('beforeend'/,
    'premium-final.js lagger inte langre till i .prototype-section');
  assert.equal(/gifts\.innerHTML\s*=/.test(premiumKalla), false,
    'premium-final.js satter innerHTML pa .prototype-section igen — det raderade forut allt '
    + 'media.js byggt dar, och femton katalogknappar forsvann vid varje forsta bind-pass');
  assert.ok(proto.querySelectorAll('[data-pf-topgift]').length >= 2,
    `bara ${proto.querySelectorAll('[data-pf-topgift]').length} Top Gifter-knappar`);
});

test('de sena knapparna far bade koppling och miniatyr', async () => {
  // Halvorna ihop: den har PR:en far sektionerna att byggas, #89 ser till att knapparna kopplas.
  const h = studioIOverlay();
  ladddaSent(h, 'premium-final.js');
  await settle();

  // Bara Top Gifters 21 sedan Top Streaks sju premiumdesigner avvecklades 2026-09-20.
  const kn = [...h.document.querySelectorAll('[data-pf-streak], [data-pf-topgift]')];
  // 21 -> 2 den 2026-09-23. Regeln ar att knapparna far bade koppling och miniatyr, inte hur
  // manga de ar; golvet finns for att en tom lista annars gor provet gront av ingenting.
  assert.ok(kn.length >= 2, `bara ${kn.length} premiumknappar`);
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
  const forst = sek.querySelectorAll('button').length;

  // Fem skriptladdningar till ska inte dubblera nagot: dataset-vakterna gor sektionsbygget
  // idempotent och #89 hoppar over redan kopplade knappar.
  for (let i = 0; i < 5; i++) {
    const s = h.document.createElement('script');
    h.document.body.append(s);
    s.dispatchEvent(new h.window.Event('load'));
  }
  await settle();
  assert.equal(sek.querySelectorAll('button').length, forst,
    'sektionen byggdes om vid varje skriptladdning');
  const dubbla = [...h.document.querySelectorAll('.streak-template-section button, [data-pf-topgift]')]
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
