'use strict';
// Vaktprov for matfixturen (tech-debt 8).
//
// Fixturen ar bara vard nagot om den FALLER pa de fall den finns for. De fyra nedan ar
// aterskapade ur verkliga buggar i Etapp 5 och 6 — varje prov bygger om felet i en tom sida och
// kraver att ratt matning sager ifran, och att de OVRIGA matningarna sager ok. Det sista ar
// poangen: det var precis darfor ett enda synlighetssvep inte hade rackt.
//
//   1. autospar-indikatorn pa y=902 i ett 900px fonster   -> synlig() ska falla
//   2. snappvaxeln, bada lagen likadana                    -> utseende() ska vara lika
//   3. verifieringsbannern under vecket i en rullande yta  -> inom() ska falla, synlig() sager ok
//   4. verifieringsbannern strackt av tva CSS-regler       -> matt() ska visa det, synlig() ok
const test = require('node:test'), assert = require('node:assert/strict');
const { SYNLIG, INOM, UTSEENDE, MATT } = require('../fixtures/synlighet.js');

let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

async function startaWebblasare() {
  for (const channel of ['chrome', 'msedge', 'chromium']) {
    try { return await chromium.launch({ channel }) } catch (_) {}
  }
  try { return await chromium.launch() } catch (_) {}
  return null;
}

let browser;
let skip = chromium ? false : 'playwright-core saknas — kor `npm i` (hoppar, faller inte)';

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) skip = 'ingen Chrome/Edge/Chromium hittades pa maskinen (hoppar, faller inte)';
});
test.after(async () => { if (browser) await browser.close() });

async function sida(html, vy = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport: vy });
  const page = await context.newPage();
  await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0">${html}</body>`);
  return { context, page };
}

// ---- Fall 1 · under vecket ---------------------------------------------------------------------
test('synlig() faller pa ett element som ligger utanfor vyn', { skip, timeout: 60000 }, async () => {
  const { context, page } = await sida(
    '<div style="height:3000px"></div>' +
    '<b id="mal" style="position:absolute;top:902px;left:10px;padding:4px">sparat 07:45</b>');
  try {
    const m = await page.evaluate(`(() => {
      const el = document.querySelector('#mal');
      return { synlig: (${SYNLIG})(el), matt: (${MATT})(el) };
    })()`);
    assert.equal(m.synlig.ok, false, 'ett element pa y=902 i ett 900px fonster ska falla');
    assert.match(m.synlig.skal, /utanfor vyn i hojdled/, `skalet var "${m.synlig.skal}"`);
    // Kontrollmatning: elementet FINNS och har storlek — det ar hela poangen med fallet.
    assert.ok(m.matt.h > 0 && m.matt.b > 0, 'elementet ska ha en ruta, bara pa fel plats');
  } finally { await context.close() }
});

// ---- Fall 2 · tva lagen som ser likadana ut ----------------------------------------------------
test('utseende() avslojar tva lagen som ser likadana ut', { skip, timeout: 60000 }, async () => {
  const { context, page } = await sida(`
    <style>
      .vaxel{background:#160c1f;border:1px solid #4c285e;color:#d6bddf;padding:6px 10px}
      .vaxel.av{background:#160c1f;border-color:#4c285e;color:#d6bddf}
      .battre{background:#160c1f;border:1px solid #4c285e;color:#d6bddf;padding:6px 10px}
      .battre.av{background:#2a1140;border-color:#cd55f4;color:#fff}
    </style>
    <button id="lika" class="vaxel" aria-pressed="true">A</button>
    <button id="olika" class="battre" aria-pressed="true">B</button>`);
  try {
    const m = await page.evaluate(`(() => {
      const las = el => (${UTSEENDE})(el);
      const lika = document.querySelector('#lika'), olika = document.querySelector('#olika');
      const forePa = { lika: las(lika), olika: las(olika) };
      lika.classList.add('av'); lika.setAttribute('aria-pressed','false');
      olika.classList.add('av'); olika.setAttribute('aria-pressed','false');
      return { forePa, efterAv: { lika: las(lika), olika: las(olika) },
        ariaLika: lika.getAttribute('aria-pressed'), synlig: (${SYNLIG})(lika) };
    })()`);
    assert.equal(m.ariaLika, 'false', 'kontrollmatning: attributet ska ha vaxlat');
    assert.equal(m.synlig.ok, true, 'kontrollmatning: knappen ar fullt synlig — den ar inte gomd');
    assert.equal(m.forePa.lika, m.efterAv.lika,
      'utseende() ska ge SAMMA strang for tva lagen som ser likadana ut — det ar sa buggen syns');
    assert.notEqual(m.forePa.olika, m.efterAv.olika,
      'och OLIKA strangar nar lagena faktiskt skiljer sig');
  } finally { await context.close() }
});

// ---- Fall 3 · innanfor foralderns synliga ruta -------------------------------------------------
test('inom() faller pa ett element som ankrats mot innehallets botten', { skip, timeout: 60000 }, async () => {
  // Elementet ligger i FLODET efter ett hogt innehall i en rullande behallare — samma form som
  // vykontrollen fick innan den blev sticky. Behallaren ar lag och innehallet lagom hogt, sa
  // elementet hamnar under behallarens kant men fortfarande innanfor fonstret: det ar just den
  // kombinationen som gor fallet osynligt for ett synlighetssvep.
  const { context, page } = await sida(`
    <div id="yta" style="height:200px;overflow:auto;border:1px solid #333">
      <div style="height:420px"></div>
      <div id="mal" style="margin:8px;padding:6px;background:#222;color:#fff">kontroll</div>
    </div>`);
  try {
    const m = await page.evaluate(`(() => {
      const el = document.querySelector('#mal'), yta = document.querySelector('#yta');
      return { synlig: (${SYNLIG})(el), inom: (${INOM})(el, yta) };
    })()`);
    // Det ar exakt den har kombinationen som gor fallet farligt: synlig sager ok, inom sager nej.
    assert.equal(m.synlig.ok, true,
      'elementet ar synligt i vyn — ett synlighetssvep hade gett gront har');
    assert.equal(m.inom.ok, false, 'men det ligger utanfor arbetsytans synliga ruta');
    assert.match(m.inom.skal, /nedanfor/, `skalet var "${m.inom.skal}"`);
  } finally { await context.close() }
});

// ---- Fall 4 · strackt av tva regler ------------------------------------------------------------
test('matt() avslojar ett element som tva CSS-regler strackt ut', { skip, timeout: 60000 }, async () => {
  const { context, page } = await sida(`
    <style>
      /* Tva filer, samma selektor: den ena satte top, den andra bottom. */
      .banner{position:fixed;left:0;right:0;top:0}
      .banner{position:fixed;bottom:18px;left:50%;width:min(720px,100%);transform:translateX(-50%)}
    </style>
    <div id="mal" class="banner">Kolla din e-post</div>`, { width: 1440, height: 900 });
  try {
    const m = await page.evaluate(`(() => {
      const el = document.querySelector('#mal');
      return { synlig: (${SYNLIG})(el), matt: (${MATT})(el) };
    })()`);
    assert.equal(m.synlig.ok, true,
      'elementet syns — bade synlighetssvep och mitt eget "ligger den overst"-prov gav gront');
    assert.ok(m.matt.andelAvVyn.h > 0.5,
      `en remsa som tacker ${Math.round(m.matt.andelAvVyn.h * 100)} % av hojden ar strackt, ` +
      'inte en remsa');
    assert.ok(m.matt.andelAvVyn.b < 1,
      'och den nar inte ut i kanterna trots left:0/right:0 — den andra regeln vann');
  } finally { await context.close() }
});

// ---- Fixturen ska ge gront pa nagot som faktiskt ar ratt ---------------------------------------
test('alla fyra matningarna sager ok for ett korrekt element', { skip, timeout: 60000 }, async () => {
  const { context, page } = await sida(`
    <div id="yta" style="position:relative;height:400px;overflow:auto">
      <div id="mal" style="position:sticky;top:8px;margin-left:8px;width:200px;padding:8px;background:#222;color:#fff">ok</div>
      <div style="height:1200px"></div>
    </div>`);
  try {
    const m = await page.evaluate(`(() => {
      const el = document.querySelector('#mal'), yta = document.querySelector('#yta');
      return { synlig: (${SYNLIG})(el), inom: (${INOM})(el, yta), matt: (${MATT})(el),
        utseende: (${UTSEENDE})(el) };
    })()`);
    assert.equal(m.synlig.ok, true, `synlig() sa nej: ${m.synlig.skal}`);
    assert.equal(m.inom.ok, true, `inom() sa nej: ${m.inom.skal}`);
    assert.ok(m.matt.andelAvVyn.h < 0.5, 'matt() ska inte larma pa ett rimligt element');
    assert.notEqual(m.utseende, 'saknas', 'utseende() ska ge ett fingeravtryck');
  } finally { await context.close() }
});
