'use strict';
// Top Gift: kryssrutan "Värde" ska faktiskt dölja coins.
//
// VARFOR PROVET MATER DEN RENDERADE NODEN OCH INTE FALTET. Kryssrutan
// #universalShowValue fanns och var korrekt kopplad: den satte w.showDataValue och anropade
// save() + render(). Ett prov som stannat vid "faltet blev false" hade varit gront hela tiden.
//
// Men coins forsvann inte. media.js grindar vardenoden pa faltet — pa TVA stallen — medan den
// nod som faktiskt renderas kommer fran premium-final.js, som laddas dynamiskt och saknade
// grinden. Kontrollen skrev alltsa ratt falt till en renderare som inte laste det.
//
// Darfor: matningen ar getComputedStyle(...).display pa noden i DOM. Det ar det anvandaren ser,
// och det ar den enda matning som kunde skilja "kopplad" fran "fungerar".
const test = require('node:test'), assert = require('node:assert/strict');
const { servera } = require('../rigg/servera.js');

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

async function forlopp(page) {
  return page.evaluate(async () => {
    state.widgets.length = 0;
    const w = VyraWidgets.create('catalog:topgift:royal');
    w.x = 60; w.y = 60;
    state.widgets.push(w);
    selected = null;
    render();
    await new Promise(r => setTimeout(r, 400));
    // Panelen byggs av appens egen valjvag, inte av render() ensam.
    document.querySelector('[data-id="' + w.id + '"]')?.click();
    await new Promise(r => setTimeout(r, 700));

    const nod = () => document.querySelector('[data-id="' + w.id + '"] em');
    const las = () => {
      const e = nod();
      return e ? { display: getComputedStyle(e).display, text: (e.textContent || '').trim() } : null;
    };

    const ruta = document.querySelector('#universalShowValue');
    if (!ruta) return { kryssrutaSaknas: true };

    const fore = las();
    ruta.checked = false;
    ruta.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 600));
    const av = las();
    const faltAv = w.showDataValue;

    document.querySelector('#universalShowValue').checked = true;
    document.querySelector('#universalShowValue').dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 600));

    return { fore, av, faltAv, pa: las(),
      flipp: !!document.querySelector('[data-id="' + w.id + '"] .vyra-flip') };
  });
}

async function oppna() {
  const rigg = await servera();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${rigg.bas}/studio.html?open=layout`, { waitUntil: 'load', timeout: 120000 });
  // Villkorsstyrt, inte en timeout: premium-final.js laddas dynamiskt och maste hinna skriva
  // over renderaren innan vi mater — annars mats fel kodvag.
  await page.waitForFunction(() => typeof window.VyraWidgets?.create === 'function'
    && typeof window.render === 'function', null, { timeout: 60000, polling: 100 });
  return { rigg, context, page, stang: async () => { await context.close(); await rigg.stang() } };
}

test('kryssrutan Värde döljer och visar coins i DOM', { skip, timeout: 120000 }, async () => {
  const s = await oppna();
  try {
    const m = await forlopp(s.page);
    assert.ok(!m.kryssrutaSaknas, '#universalShowValue saknas i Top Gift-panelen');
    assert.ok(m.fore, 'kontrollmatning: vardenoden ska finnas fran borjan');
    assert.equal(m.fore.display !== 'none', true,
      'kontrollmatning: coins ska vara synliga innan nagon rort kryssrutan');
    assert.match(m.fore.text, /\d/, 'kontrollmatning: noden ska bara ett varde');

    // Sjalva buggen: faltet blev false men noden syntes anda.
    assert.equal(m.faltAv, false, 'kryssrutan skrev inte w.showDataValue');
    assert.equal(m.av.display, 'none',
      'coins ar fortfarande synliga efter avmarkering — grindar renderaren pa showDataValue? ' +
      'premium-final.js skriver over media.js renderare och maste bara samma villkor');

    assert.notEqual(m.pa.display, 'none', 'coins kom inte tillbaka nar rutan markerades igen');
    assert.equal(m.flipp, true, 'flippen forsvann — synlighetsvalet far inte rora flippmekaniken');
  } finally { await s.stang() }
});
