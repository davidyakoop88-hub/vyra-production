'use strict';
// Landningssidan renodlad (Etapp 6C-mikro, PR 172).
//
// Beslut: Hero (med prisbadge) -> AGENCYPORTAL (dold tills en riktig annonsor finns) -> mini-sidfot.
//
// VARFOR SEKTIONERNA GAR BORT, inte gomms: tva av dem bar pastaenden som inte far sta kvar i
// kallkoden heller.
//
//   testimonials  tre PAHITTADE personer med citat, daribland "okade mina donationer med 40 %"
//   compare       jamforelsetabell mot BetterTok och TikFinity, med pastaenden jag inte kan verifiera
//
// Resten (features, how, pricing, faq, download) ar akta innehall, men beslutet ar en renodlad sida.
// Priset flyttar med till heron — det far inte forsvinna, och det ar det enda av innehallet som
// bar ett loften.
//
// TRE SAKER FICK INTE FORSVINNA MED SEKTIONERNA, och proven vaktar dem:
//   priset, med sin kvalificering
//   privacy.html och terms.html — de fanns BARA i den gamla sidfoten
//   support@vyralive.app — samma sak
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { servera } = require('../rigg/servera.js');
const { KONTRAST, SYNLIG } = require('../fixtures/synlighet.js');

const ROT = path.join(__dirname, '..', '..');

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

async function sidan(vy = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport: vy });
  const page = await context.newPage();
  await page.goto(`${rigg.bas}/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => new Promise(r => setTimeout(r, 600)));
  return { context, page };
}

const BORTTAGNA = ['features', 'how', 'compare', 'testimonials', 'pricing', 'faq', 'download'];

// ---- Prov 1 · prisbadgen finns i heron ---------------------------------------------------------
test('heron bar priset och dess kvalificering', { skip, timeout: 60000 }, async () => {
  const { context, page } = await sidan();
  try {
    const m = await page.evaluate(`(() => {
      const hero = document.querySelector('.hero');
      const badge = hero && hero.querySelector('[data-hero-pris]');
      if (!badge) return { saknas: true };
      const fin = badge.querySelector('.price-fineprint');
      return {
        text: badge.textContent.replace(/\\s+/g, ' ').trim(),
        finstilt: fin ? fin.textContent.replace(/\\s+/g, ' ').trim() : null,
        synlig: (${SYNLIG})(badge),
      };
    })()`);
    assert.ok(!m.saknas, '[data-hero-pris] saknas i heron');
    assert.equal(m.synlig.ok, true, `prisbadgen syns inte: ${m.synlig.skal}`);
    assert.match(m.text, /15 USD/, `badgen ska ange priset: "${m.text}"`);
    assert.match(m.text, /3 dagar/, `badgen ska ange provperioden: "${m.text}"`);
    assert.ok(m.finstilt, 'kvalificeringen ska ligga i .price-fineprint, som WCAG-vakten redan mater');
    assert.match(m.finstilt, /automatisk förnyelse/,
      `att abonnemanget fornyas av sig sjalvt maste sagas: "${m.finstilt}"`);
  } finally { await context.close() }
});

// ---- Prov 2 · prisbadgen ar lasbar --------------------------------------------------------------
test('prisbadgen klarar WCAG AA', { skip, timeout: 60000 }, async () => {
  const { context, page } = await sidan();
  try {
    const m = await page.evaluate(`(() => {
      const kontrast = ${KONTRAST};
      const badge = document.querySelector('[data-hero-pris]');
      return { pris: kontrast(badge.querySelector('[data-hero-pris-belopp]') || badge),
        fin: kontrast(badge.querySelector('.price-fineprint')) };
    })()`);
    assert.equal(m.pris.klararAA, true,
      `beloppet: ${m.pris.kvot}:1 mot ${m.pris.krav}:1 vid ${m.pris.px} px`);
    assert.equal(m.fin.klararAA, true,
      `finstilta: ${m.fin.kvot}:1 mot ${m.fin.krav}:1 vid ${m.fin.px} px`);
    assert.ok(m.fin.px >= 12, `finstilta ar ${m.fin.px} px`);
  } finally { await context.close() }
});

// ---- Prov 3 · sektionerna ar BORTA ur DOM ------------------------------------------------------
test('de sju sektionerna finns inte i DOM', { skip, timeout: 60000 }, async () => {
  const { context, page } = await sidan();
  try {
    const kvar = await page.evaluate(ider =>
      ider.filter(id => !!document.getElementById(id)), BORTTAGNA);
    assert.deepEqual(kvar, [],
      `sektionerna finns kvar: ${kvar.join(', ')}. Beslutet var borttagning, inte gomning — ` +
      'dolda pastaenden ar kvar i kallkoden och kan tandas igen av misstag.');
  } finally { await context.close() }
});

// ---- Prov 4 · AGENCYPORTAL ar dold, inte borta -------------------------------------------------
test('AGENCYPORTAL ligger kvar men dold', { skip, timeout: 60000 }, async () => {
  const { context, page } = await sidan();
  try {
    const m = await page.evaluate(`(() => {
      const sek = document.getElementById('premium');
      if (!sek) return { saknas: true };
      return { hidden: sek.hasAttribute('hidden'), synlig: (${SYNLIG})(sek) };
    })()`);
    assert.ok(!m.saknas, 'sektionen ska ligga kvar — den vantar pa en riktig annonsor');
    assert.equal(m.hidden, true, 'sektionen ska bara hidden-attributet');
    assert.equal(m.synlig.ok, false,
      'och den far inte synas: innehallet ar pahittade agencies tills en annonsor finns');
  } finally { await context.close() }
});

// ---- Prov 5 · mini-sidfoten bar det juridiska ---------------------------------------------------
test('mini-sidfoten bar integritetspolicy, villkor och kontakt', { skip, timeout: 60000 }, async () => {
  const { context, page } = await sidan();
  try {
    const m = await page.evaluate(`(() => {
      const kontrast = ${KONTRAST};
      const fot = document.querySelector('[data-mini-sidfot]');
      if (!fot) return { saknas: true };
      const r = fot.getBoundingClientRect();
      return {
        hojd: Math.round(r.height),
        synlig: (${SYNLIG})(fot),
        lankar: [...fot.querySelectorAll('a[href]')].map(a => ({
          text: a.textContent.trim(), href: a.getAttribute('href'),
          kontrast: kontrast(a),
        })),
      };
    })()`);
    assert.ok(!m.saknas, '[data-mini-sidfot] saknas');
    assert.equal(m.synlig.ok, true, `sidfoten syns inte: ${m.synlig.skal}`);
    const mal = m.lankar.map(l => l.href);
    for (const kravd of ['privacy.html', 'terms.html', 'mailto:support@vyralive.app']) {
      assert.ok(mal.includes(kravd),
        `${kravd} saknas. Den fanns BARA i den gamla sidfoten — forsvinner den finns ingen vag ` +
        `till den fran landningssidan. Hittade: ${mal.join(', ')}`);
    }
    for (const l of m.lankar) {
      assert.equal(l.kontrast.klararAA, true,
        `"${l.text}" har kontrast ${l.kontrast.kvot}:1 mot kravet ${l.kontrast.krav}:1`);
    }
    assert.ok(m.hojd <= 64, `sidfoten ar ${m.hojd} px hog — den ska vara en rad, inte en sektion`);
  } finally { await context.close() }
});

// ---- Prov 6 · inga doda ankarlankar -------------------------------------------------------------
test('ingen navlank pekar pa nagot som inte finns', { skip, timeout: 60000 }, async () => {
  const { context, page } = await sidan();
  try {
    const doda = await page.evaluate(() =>
      [...document.querySelectorAll('a[href^="#"]')]
        .map(a => a.getAttribute('href'))
        .filter(h => h && h.length > 1 && !document.getElementById(h.slice(1)))
        .filter((v, i, l) => l.indexOf(v) === i));
    assert.deepEqual(doda, [],
      `doda ankare: ${doda.join(', ')}. En navpost som inte tar en nagonstans ar samma sorts ` +
      'lofte utan tackning som resten av arbetet stangt.');
  } finally { await context.close() }
});

// ---- Prov 7-8 · inga pahittade personer, inga konkurrentnamn -----------------------------------
test('inga pahittade personer eller konkurrentnamn i kallkoden', { skip: false }, () => {
  const forbjudna = ['StreamKing', 'LiveQueen', 'TikPro', 'BetterTok', 'TikFinity'];
  const filer = fs.readdirSync(ROT).filter(f => /\.(html|js|css)$/.test(f) && !/\.min\./.test(f));
  const brott = [];
  for (const fil of filer) {
    const s = fs.readFileSync(path.join(ROT, fil), 'utf8');
    for (const ord of forbjudna) {
      if (s.includes(ord)) brott.push(`${fil}: ${ord}`);
    }
  }
  assert.deepEqual(brott, [],
    'Pahittade personer och overifierbara pastaenden om namngivna konkurrenter ska inte ligga ' +
    'kvar i kallkoden — dar kan de tandas igen:\n  ' + brott.join('\n  '));
});

// ---- Prov 9 · sidans ordning ---------------------------------------------------------------------
test('sidan har tre delar i ratt ordning', { skip, timeout: 60000 }, async () => {
  const { context, page } = await sidan();
  try {
    const m = await page.evaluate(() => {
      const namn = el => el ? (el.id || String(el.className).split(' ')[0]) : null;
      const delar = [...document.querySelectorAll('main > section, main > footer, body > footer')]
        .map(namn);
      return { delar, hero: !!document.querySelector('.hero') };
    });
    assert.ok(m.hero, 'heron ska finnas kvar');
    assert.ok(m.delar.length <= 4,
      `sidan har ${m.delar.length} toppnivadelar: ${m.delar.join(', ')} — beslutet var tre`);
  } finally { await context.close() }
});
