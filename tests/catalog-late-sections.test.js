'use strict';
// Sektioner som kommer efter kortstylingen far aldrig nagon miniatyr.
//
// media.js injicerar overlay-preview.js och premium-final.js som TVA oberoende dynamiska skript:
//
//     Promise.resolve().then(()=>{ ...js.src='overlay-preview.js'; document.body.append(js) })
//     ...
//     Promise.resolve().then(()=>{ ...scripts=['premium-final.js',...] })
//
// Dynamiskt skapade <script> har async=true som standard, sa de kor i den ordning de HINNER
// laddas — inte i den ordning de laggs till. Vilken bind()-wrapper som hamnar sist avgors alltsa
// av natverket.
//
// Landar premium-final.js sist byggs dess tva sektioner — VYRA TOP STREAK · PREMIUM och
// TOP GIFTER · DESIGNVAL — EFTER att styleOverlayCatalogCards() redan gatt igenom galleriet. De
// knapparna observeras da aldrig, far ingen miniatyr, och behaller sin generiska ikon. Det ar
// precis vad Davids skarmbilder fran produktion visar: de tva sektionerna har varken miniatyr
// eller Configure/Preview-knappar, medan alla andra sektioner har bada.
//
// Lokalt reproducerades det inte — dar var allt cachat och bada skripten hann fore. Ett lopp som
// bara syns pa riktiga natverk ar anda ett lopp.
//
// LOSNINGEN AR INTE ATT ORDNA SKRIPTEN. Att tvinga en ordning gor det ratt i dag och gar sonder
// nasta gang nagon lagger till en sektion. Katalogen ska i stallet ta hand om kort som dyker upp
// nar som helst.
//
// ROTT NU.
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.after(closeAll);

const vantaPaObservatorn = () => new Promise(r => setTimeout(r, 30));

function galleri() {
  const h = createDom({ state: { widgets: [], projectName: 'sent' } });
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };

  // FORE overlay-preview.js: den skapar sin observator pa modulniva, sa utan stubben kastar hela
  // filen ReferenceError vid laddning och installerar aldrig sin render/bind. Da byggs ingen
  // katalog alls och testet mater noll — vilket ar precis hur det sag ut forsta forsoket.
  // Stubben loser ut direkt, sa kedjan knapp -> miniatyr mats hela vagen.
  run(`window.IntersectionObserver = function (cb) {
    this.observe = el => cb([{ isIntersecting: true, target: el }], this);
    this.unobserve = () => {}; this.disconnect = () => {};
  };`);

  h.load('overlay-sanitize.js');
  // Sektionsfilerna. Utan dem bygger galleriet noll knappar och testet mater ingenting — samma
  // last som lat "varje knapp bar en katalognyckel" sta gron medan elva knappar saknade en.
  h.load('custom-widgets.js');
  h.load('last-x-alerts.js');
  h.load('gift-fireworks.js');
  h.load('premium-final.js');
  h.load('overlay-preview.js');

  run(`view='overlay';selected=null;render();bind();`);
  return h;
}

// Sa har ser en sektion ut som premium-final.js injicerar: en rubrik och knappar med katalognyckel.
function senSektion(h, rubrik, nycklar) {
  const katalog = h.document.querySelector('.overlay-widget-gallery .widget-catalog');
  const box = h.document.createElement('div');
  box.innerHTML = `<h4>${rubrik}</h4>` + nycklar
    .map(n => `<button data-catalog-key="${n}"><i>◆</i><b>${n}</b></button>`).join('');
  katalog.append(box);
  const knappar = [...box.querySelectorAll('button')];
  // Riktiga katalogknappar bar en onclick — den ar villkoret for stjarna och Configure/Preview
  // (styleOverlayCatalogCards: `if (!originalClick) return`). Utan den mater fixturen en knapp som
  // inte finns i produkten.
  knappar.forEach(b => { b.onclick = () => {} });
  return knappar;
}

test('galleriet finns och styles vid forsta bind', () => {
  const h = galleri();
  const knappar = h.document.querySelectorAll('.overlay-widget-gallery .widget-catalog button');
  assert.ok(knappar.length > 40, `bara ${knappar.length} knappar — riggen bygger inte katalogen`);
  const owrappade = [...knappar].filter(b => !b.dataset.owgWrapped);
  assert.deepEqual(owrappade.map(b => b.dataset.catalogKey), [],
    'knappar som fanns vid bind blev inte wrappade');
});

test('en sektion som kommer EFTER bind far ocksa miniatyrer', async () => {
  const h = galleri();
  // Premiumsektionerna, exakt som de ser ut nar premium-final.js vinner loppet.
  const sena = [
    ...senSektion(h, 'VYRA TOP STREAK · PREMIUM',
      ['catalog:topstreak:premium:liquid', 'catalog:topstreak:premium:thermo']),
    ...senSektion(h, 'TOP GIFTER · DESIGNVAL',
      ['catalog:topgift:royal', 'catalog:topgift:neon'])
  ];
  await vantaPaObservatorn();

  const owrappade = sena.filter(b => !b.dataset.owgWrapped);
  assert.deepEqual(owrappade.map(b => b.dataset.catalogKey), [],
    'sektioner som injiceras efter kortstylingen observeras aldrig — knapparna behaller sin ' +
    'generiska ikon for alltid');

  const utanMiniatyr = sena.filter(b => !b.querySelector('.owg-thumb'));
  assert.deepEqual(utanMiniatyr.map(b => b.dataset.catalogKey), [],
    'sena knappar wrappades men fick ingen miniatyr');
});

test('ikonen ersatts pa de sena korten', async () => {
  const h = galleri();
  const sena = senSektion(h, 'VYRA TOP STREAK · PREMIUM', ['catalog:topstreak:premium:liquid']);
  await vantaPaObservatorn();
  const kvar = sena.filter(b => [...b.children].some(c => c.tagName === 'I'));
  assert.deepEqual(kvar.length, 0,
    'kortet har bade miniatyr och den generiska ikonen kvar');
});

test('omstylingen skapar ingen andlos loop', async () => {
  // styleOverlayCatalogCards() muterar sjalv knapparna (stjarna, actions). En observator som
  // reagerar pa sina egna andringar hade snurrat. Vakten ar att en knapp bara wrappas EN gang.
  const h = galleri();
  const sena = senSektion(h, 'TOP GIFTER · DESIGNVAL', ['catalog:topgift:royal']);
  await vantaPaObservatorn();
  const forsta = sena[0].querySelectorAll('.owg-actions').length;
  await vantaPaObservatorn();
  await vantaPaObservatorn();
  assert.equal(sena[0].querySelectorAll('.owg-actions').length, forsta,
    'kortet fick fler actions-rader vid varje varv — omstylingen triggar sig sjalv');
  assert.equal(forsta, 1, `kortet har ${forsta} actions-rader, ska ha 1`);
});

test('omstylingen ror inte anvandarens layout', async () => {
  // #86 igen: allt som kanns av katalogen maste halla sig utanfor state och disk.
  const h = galleri();
  senSektion(h, 'TOP GIFTER · DESIGNVAL', ['catalog:topgift:royal', 'catalog:topgift:neon']);
  await vantaPaObservatorn();

  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`window.__l = { minnet: state.widgets.length,
    lagring: (JSON.parse(localStorage.getItem('vyra-state') || '{}').widgets || []).length }`);
  assert.deepEqual({ ...h.window.__l }, { minnet: 0, lagring: 0 },
    'sena kort la widgets i layouten nar de fick sina miniatyrer');
});
