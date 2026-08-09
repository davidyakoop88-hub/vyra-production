'use strict';
// Finstilta som kvalificerar ett loften maste GA ATT LASA (Etapp 6C-mikro, uppfoljning).
//
// CTA-knappen sager "Kom igang gratis". Det ar sant bara for att raden under sager "3 dagar gratis
// provperiod, darefter 15 USD/manad med automatisk fornyelse". Da vilar hela pastaendets arlighet
// pa att den raden gar att lasa — en kvalificering som ingen ser kvalificerar ingenting.
//
// UPPMATT FORE FIXEN, samma varden pa desktop, mobil och vid 200 % zoom:
//   11 px, vikt 400, farg rgb(124,111,143) mot rgb(8,8,8) -> kontrastkvot 4.32:1
// WCAG 2.1 AA kraver 4.5:1 for normaltext (under 24 px, eller under 18.66 px fet). Den foll.
//
// Fargen som valdes, #9a8da8, ar inte pahittad: den anvands redan for dampad text i studio.css,
// och ger 6.44:1 — marginal, inte precis over strecket.
const test = require('node:test'), assert = require('node:assert/strict');
const { servera } = require('../rigg/servera.js');
const { KONTRAST, SYNLIG } = require('../fixtures/synlighet.js');

let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

async function startaWebblasare() {
  for (const channel of ['chrome', 'msedge', 'chromium']) {
    try { return await chromium.launch({ channel }) } catch (_) {}
  }
  try { return await chromium.launch() } catch (_) {}
  return null;
}

let browser, rigg;
let skip = chromium ? false : 'playwright-core saknas — kor `npm i` (hoppar, faller inte)';

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) { skip = 'ingen Chrome/Edge/Chromium hittades pa maskinen (hoppar, faller inte)'; return }
  rigg = await servera();
});
test.after(async () => { if (browser) await browser.close(); if (rigg) await rigg.stang() });

async function landningssidan(vy, zoom) {
  const context = await browser.newContext({ viewport: vy });
  const page = await context.newPage();
  await page.goto(`${rigg.bas}/index.html`, { waitUntil: 'load' });
  if (zoom) await page.evaluate(z => { document.documentElement.style.zoom = z }, zoom);
  await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
  return { context, page };
}

const MAT = `(() => {
  const el = document.querySelector('.price-fineprint');
  if (!el) return { saknas: true };
  const r = el.getBoundingClientRect();
  const belopp = document.querySelector('[data-hero-pris-belopp]');
  const uppmaning = document.querySelector('.hero-actions');
  const avstand = e => e ? Math.round(r.top - e.getBoundingClientRect().bottom) : null;
  return {
    kontrast: (${KONTRAST})(el),
    text: el.textContent.replace(/\\s+/g, ' ').trim(),
    beloppText: belopp ? belopp.textContent.replace(/\\s+/g, ' ').trim() : null,
    avstandTillBelopp: avstand(belopp),
    avstandTillUppmaning: avstand(uppmaning),
  };
})()`;

// ---- Prov 1 · kontrasten klarar WCAG AA pa desktop ---------------------------------------------
test('finstilta klarar WCAG AA pa desktop', { skip, timeout: 60000 }, async () => {
  const { context, page } = await landningssidan({ width: 1440, height: 900 });
  try {
    const m = await page.evaluate(MAT);
    assert.ok(!m.saknas, 'kontrollmatning: .price-fineprint ska finnas');
    // Finstilta flyttade fran priskortet till heron i PR 172. Provet mater darfor NARHET till det
    // den kvalificerar i stallet for att kraeva ett visst syskon — det var avsikten hela tiden,
    // formuleringen var bara bunden till den gamla markupen.
    assert.match(m.beloppText || '', /15 USD/,
      'kontrollmatning: finstilta ska sitta tillsammans med det belopp den kvalificerar');
    assert.equal(m.kontrast.klararAA, true,
      `kontrastkvot ${m.kontrast.kvot}:1 mot kravet ${m.kontrast.krav}:1 ` +
      `(${m.kontrast.px} px, ${m.kontrast.textFarg} mot ${m.kontrast.bakgrund}). ` +
      'En kvalificering som inte gar att lasa kvalificerar ingenting.');
  } finally { await context.close() }
});

// ---- Prov 2 · samma pa mobil -------------------------------------------------------------------
test('finstilta klarar WCAG AA pa mobil', { skip, timeout: 60000 }, async () => {
  const { context, page } = await landningssidan({ width: 390, height: 844 });
  try {
    const m = await page.evaluate(MAT);
    assert.equal(m.kontrast.klararAA, true,
      `mobil: ${m.kontrast.kvot}:1 mot ${m.kontrast.krav}:1 vid ${m.kontrast.px} px`);
  } finally { await context.close() }
});

// ---- Prov 3 · och vid 200 % zoom ----------------------------------------------------------------
test('finstilta klarar WCAG AA vid 200 procent zoom', { skip, timeout: 60000 }, async () => {
  const { context, page } = await landningssidan({ width: 1440, height: 900 }, 2);
  try {
    const m = await page.evaluate(MAT);
    assert.equal(m.kontrast.klararAA, true,
      `200 % zoom: ${m.kontrast.kvot}:1 mot ${m.kontrast.krav}:1`);
  } finally { await context.close() }
});

// ---- Prov 4 · texten sager bade provperiod och loppris -----------------------------------------
test('finstilta namner bade provperiod och loppris', { skip, timeout: 60000 }, async () => {
  const { context, page } = await landningssidan({ width: 1440, height: 900 });
  try {
    const m = await page.evaluate(MAT);
    assert.match(m.text, /3 dagar/, `finstilta: "${m.text}"`);
    assert.match(m.text, /15 USD/, `finstilta: "${m.text}"`);
    assert.match(m.text, /automatisk förnyelse/,
      'att abonnemanget fornyas av sig sjalvt ar det som maste sagas, inte antydas');
    assert.ok(m.avstandTillBelopp !== null && m.avstandTillBelopp <= 24,
      `finstilta ligger ${m.avstandTillBelopp} px fran beloppet — en kvalificering langt bort ` +
      'lases inte tillsammans med det den kvalificerar');
    assert.ok(m.avstandTillUppmaning !== null && m.avstandTillUppmaning <= 140,
      `och ${m.avstandTillUppmaning} px fran narmaste uppmaning`);
  } finally { await context.close() }
});

// ---- Prov 5 · storleken ar inte mindre an ovrig finstilt text ----------------------------------
test('finstilta ar inte mindre an 12 px', { skip, timeout: 60000 }, async () => {
  const { context, page } = await landningssidan({ width: 1440, height: 900 });
  try {
    const m = await page.evaluate(MAT);
    // WCAG satter ingen minsta storlek, men en juridisk kvalificering i 11 px pa en salj-sida
    // laser som nagot man INTE ska lasa. 12 px ar ingen stor sak; det ar en signal om avsikt.
    assert.ok(m.kontrast.px >= 12,
      `finstilta ar ${m.kontrast.px} px — det ar mindre an sidans ovriga smatext`);
  } finally { await context.close() }
});
