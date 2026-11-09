'use strict';
// GRANSKNINGEN 2026-10-17, steg 1: inloggningssidans YTA (index.html + styles.css).
//
// Tre fynd som bara går att mäta i en riktig motor. Ett prov per fynd, alla RÖDA FÖRST mot main.
//
//   F28  små klickytor: "Glömt lösenord?" ~14 px, butikslänken 16 px, sidfotens länkar ~15 px
//        (WCAG 2.2 · 2.5.8 målstorlek minst 24 × 24 px; på mobil 44 px för kortets knappar)
//   F29  10,5–12 px finstilt bar etiketter, hjälprader och förnyelsevillkoret
//   F30  registreringskortet låg över introduktionstexten, prisraden över kortet, och
//        illustrationen nuddade underrubriken
//
// Kortets beteende (flikar, tvåsteg, glömt) har egna prov i tests/framsida-konto-granskning.test.js.
// API:t är en attrapp via page.route — inga riktiga konton, ingen produktion.
const test = require('node:test'), assert = require('node:assert/strict');
const { servera } = require('../rigg/servera.js');
const { KONTRAST } = require('../fixtures/synlighet.js');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

let browser, rigg;
const skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
  rigg = await servera();
});
test.after(async () => { if (browser) await browser.close(); if (rigg) await rigg.stang() });

// reducedMotion: 'reduce' med flit — mobilens sväv och gåvobanan står då still, så mätningen
// gäller layouten och inte en bildruta i en animation.
async function sidan(vy) {
  const context = await browser.newContext({ viewport: vy, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.route('**/api/auth/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, csrfToken: 'prov', mfaRequired: true }),
  }));
  await page.goto(`${rigg.bas}/index.html`, { waitUntil: 'load' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => new Promise(r => setTimeout(r, 400)));
  return { context, page };
}

// Kortets fyra lägen, i samma ordning som en besökare når dem.
async function lage(page, namn) {
  if (namn === 'register') await page.click('[data-login-flik="register"]');
  if (namn === 'forgot') await page.click('[data-login-glomt]');
  if (namn === 'mfa') {
    await page.fill('#loginEmail', 'prov@example.test');
    await page.fill('#loginPassword', 'provlosenord123');
    await page.click('[data-login] form button[type="submit"]');
    await page.waitForSelector('[data-login-mfa]:not([hidden])');
  }
  await page.evaluate(() => new Promise(r => setTimeout(r, 250)));
}

const YTA = `(sel) => [...document.querySelectorAll(sel)].filter(el => {
  for (let e = el; e; e = e.parentElement) if (e.hidden) return false;
  return getComputedStyle(el).display !== 'none';
}).map(el => { const r = el.getBoundingClientRect();
  return { text: el.textContent.trim().slice(0, 40), b: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 } })`;

test('F28 · viktiga länkar och knappar har minst 24 × 24 px klickyta, 44 px på mobil',
  { skip, timeout: 90000 }, async () => {
  const brott = [];
  for (const [vy, kort] of [[{ width: 1440, height: 900 }, 24], [{ width: 390, height: 844 }, 44]]) {
    for (const l of ['login', 'register', 'forgot', 'mfa']) {
      const { context, page } = await sidan(vy);
      try {
        // Butikslänken döljs tills servern svarat med en version — riggen har ingen server, så
        // den tänds här för att mätas som den ser ut i produktion.
        await page.evaluate(() => document.querySelectorAll('[data-hamta-desktop]').forEach(a => { a.hidden = false }));
        await lage(page, l);
        const mal = [
          ['[data-login-glomt]', kort], ['[data-login-tillbaka]', kort], ['[data-login-visa]', kort],
          ['[data-login-mfa-avbryt]', kort], ['[data-login-reserv]', kort],
          ['[data-login-flik]', kort],
          ['[data-hamta-desktop]', 24], ['[data-mini-sidfot] a', 24],
        ];
        for (const [sel, min] of mal) {
          for (const y of await page.evaluate(`(${YTA})(${JSON.stringify(sel)})`)) {
            if (y.h < min || y.b < 24) brott.push(`${vy.width}px ${l}: "${y.text}" ${y.b}×${y.h} px (krav ${min} px hög, 24 px bred)`);
          }
        }
      } finally { await context.close() }
    }
  }
  assert.deepEqual([...new Set(brott)], [], 'för små klickytor:\n  ' + [...new Set(brott)].join('\n  '));
});

test('F29 · etiketter, hjälprader och förnyelsevillkoret är läsbara',
  { skip, timeout: 90000 }, async () => {
  const brott = [];
  for (const vy of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    for (const l of ['login', 'register', 'mfa']) {
      const { context, page } = await sidan(vy);
      try {
        await lage(page, l);
        const m = await page.evaluate(`(() => {
          const kontrast = ${KONTRAST};
          const ut = [];
          const synlig = el => { for (let e = el; e; e = e.parentElement) if (e.hidden) return false;
            const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 };
          // Varje element som självt bär text, i kortet och i prisraden.
          for (const rot of document.querySelectorAll('[data-login], .hero-prisrad')) {
            for (const el of rot.querySelectorAll('*')) {
              if (!synlig(el) || el.matches('input, svg *, .login-dorr *')) continue;
              const egen = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
              if (!egen) continue;
              const cs = getComputedStyle(el);
              ut.push({ text: el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 50), px: parseFloat(cs.fontSize) });
            }
          }
          const fin = document.querySelector('.price-fineprint');
          return { ut, fin: fin ? { px: parseFloat(getComputedStyle(fin).fontSize), k: kontrast(fin) } : null };
        })()`);
        for (const t of m.ut) if (t.px < 13) brott.push(`${vy.width}px ${l}: ${t.px} px "${t.text}"`);
        assert.ok(m.fin, 'kontrollmätning: .price-fineprint saknas');
        // Förnyelsevillkoret är det enda som kvalificerar "3 dagar gratis" — det ska vara större än
        // resten av finstilten, inte lika litet.
        if (m.fin.px < 14) brott.push(`${vy.width}px: förnyelsevillkoret är ${m.fin.px} px (krav 14)`);
        if (!m.fin.k.klararAA) brott.push(`${vy.width}px: förnyelsevillkoret har kontrast ${m.fin.k.kvot}:1`);
      } finally { await context.close() }
    }
  }
  assert.deepEqual([...new Set(brott)], [], 'för liten text:\n  ' + [...new Set(brott)].join('\n  '));
});

test('F30 · kortet, rubriken, underrubriken, bilden och prisraden har var sin yta i alla lägen',
  { skip, timeout: 180000 }, async () => {
  const brott = [];
  const vyer = [{ width: 1145, height: 720 }, { width: 1280, height: 800 }, { width: 1366, height: 768 },
    { width: 1440, height: 900 }, { width: 1920, height: 1080 }];
  for (const vy of vyer) {
    for (const l of ['login', 'register', 'forgot', 'mfa']) {
      const { context, page } = await sidan(vy);
      try {
        await lage(page, l);
        const m = await page.evaluate(() => {
          const ruta = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom } };
          // Textens RADER, inte rubrikboxen: .hero-topp är 900 px bred men texten är centrerad,
          // så det är glyferna kortet inte får ligga över.
          const rader = el => { const rg = document.createRange(); rg.selectNodeContents(el);
            return [...rg.getClientRects()].filter(r => r.width > 2).map(r => ({ l: r.left, t: r.top, r: r.right, b: r.bottom })) };
          const krock = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
          const kort = ruta(document.querySelector('[data-login]'));
          const ut = [];
          for (const [namn, sel] of [['rubriken', '.hero h1'], ['underrubriken', '.hero .lead']]) {
            if (rader(document.querySelector(sel)).some(r => krock(kort, r))) ut.push(`kortet ligger över ${namn}`);
          }
          const pris = ruta(document.querySelector('.hero-prisrad'));
          if (krock(kort, pris)) ut.push('prisraden ligger över kortet');
          const fot = ruta(document.querySelector('[data-mini-sidfot]'));
          if (krock(kort, fot)) ut.push('kortet ligger över sidfoten');
          const mobil = ruta(document.querySelector('.hero-mobil'));
          if (krock(kort, mobil)) ut.push('kortet ligger över mobilbilden');
          const lead = rader(document.querySelector('.hero .lead'));
          const leadBotten = Math.max(...lead.map(r => r.b));
          if (mobil.t - leadBotten < 16) ut.push(`bilden börjar ${Math.round(mobil.t - leadBotten)} px under underrubriken (krav 16)`);
          return ut;
        });
        for (const b of m) brott.push(`${vy.width}×${vy.height} ${l}: ${b}`);
      } finally { await context.close() }
    }
  }
  assert.deepEqual(brott, [], 'ytor som konkurrerar:\n  ' + brott.join('\n  '));
});

// GRANSKNINGEN 2026-11-09 (David: "fixa alla tre"): på en telefon var första skärmen rubrik och
// inloggningsformulär — produkten syntes inte. Datorns regler för KORTA fönster (max-height 1000 /
// 820 px) slog till även på telefoner, som också är korta: bilden krympte till min(168px, 20vw) =
// 94 px på en iPhone och 72 px på en 360-bred Android, och låg UNDER kortet på y=819 av 844. Samma
// läcka gav rubriken datorns 50 px i stället för telefonens 42 px.
// Kravet: bilden kommer före kortet, är minst 200 px bred och står i sin helhet på första skärmen,
// och rubriken har telefonens storlek. Kortet ligger aldrig över bilden.
test('F33 · på telefon visar första skärmen produkten — bilden före inloggningen, och hel',
  { skip, timeout: 120000 }, async () => {
  const brott = [];
  for (const vy of [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 414, height: 896 }]) {
    const { context, page } = await sidan(vy);
    try {
      const m = await page.evaluate(() => {
        const r = sel => document.querySelector(sel).getBoundingClientRect();
        const bild = r('.hero-mobil'), kort = r('[data-login]');
        return { bildB: Math.round(bild.width), bildT: Math.round(bild.top), bildBotten: Math.round(bild.bottom),
          kortT: Math.round(kort.top), h1: parseFloat(getComputedStyle(document.querySelector('.hero h1')).fontSize) };
      });
      const vid = `${vy.width}×${vy.height}`;
      if (m.bildB < 200) brott.push(`${vid}: bilden är ${m.bildB} px bred (minst 200)`);
      if (m.bildT >= m.kortT) brott.push(`${vid}: bilden (y=${m.bildT}) kommer efter inloggningen (y=${m.kortT})`);
      if (m.bildBotten > vy.height) brott.push(`${vid}: bilden slutar på y=${m.bildBotten}, under första skärmen (${vy.height})`);
      if (m.h1 > 42) brott.push(`${vid}: rubriken är ${m.h1} px — datorns storlek, inte telefonens 42`);
    } finally { await context.close() }
  }
  assert.deepEqual(brott, [], 'första skärmen på telefon:\n  ' + brott.join('\n  '));
});

// GRANSKNINGEN 2026-11-09: sidans enda stora knapp var "Logga in" — "Skapa konto" en flik bredvid,
// "3 dagar gratis" bara text, och efter exemplen längst ner fanns ingen knapp alls. Två knappar
// "Skapa konto — 3 dagar gratis" (prisrutan och sidans slut) går genom SAMMA kort: de byter till
// fliken Skapa konto, tar kortet i bild och lägger markören i första fältet. Inget nytt flöde.
test('F34 · "Skapa konto — 3 dagar gratis" i prisrutan och längst ner leder till registreringen',
  { skip, timeout: 120000 }, async () => {
  for (const vy of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    for (const vilken of ['forsta', 'sista']) {
      const { context, page } = await sidan(vy);
      try {
        const knappar = await page.$$('[data-prova-gratis]');
        assert.ok(knappar.length >= 2, `${vy.width}: ${knappar.length} knappar — en i prisrutan och en längst ner`);
        assert.ok(await page.$('.hero-prisrad [data-prova-gratis]'), 'prisrutan saknar knappen');
        const knapp = vilken === 'forsta' ? knappar[0] : knappar[knappar.length - 1];
        await knapp.scrollIntoViewIfNeeded();
        assert.match(await knapp.innerText(), /Skapa konto.*3 dagar gratis/);
        await knapp.click();
        await page.waitForTimeout(700);
        const m = await page.evaluate(() => {
          const kort = document.querySelector('[data-login]').getBoundingClientRect();
          return {
            flik: document.querySelector('[data-login-flik="register"]').getAttribute('aria-selected'),
            fokus: document.activeElement && document.activeElement.id,
            kortSyns: kort.top < innerHeight && kort.bottom > 0,
          };
        });
        const vid = `${vy.width} ${vilken}`;
        assert.equal(m.flik, 'true', `${vid}: fliken Skapa konto valdes inte`);
        assert.equal(m.fokus, 'loginName', `${vid}: markören står i ${m.fokus}, inte i första fältet`);
        assert.ok(m.kortSyns, `${vid}: kortet syns inte efter klicket`);
      } finally { await context.close() }
    }
  }
});
