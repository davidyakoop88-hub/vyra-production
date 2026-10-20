'use strict';
// SLUTGRANSKNINGEN 2026-10-20, GRANSKARE C — MEDELFELEN (C-005 till C-020) SOM GÅR ATT MÄTA.
//
// Varje prov mäter det granskaren såg: tomt läge och dialog i Automationer, Esc i
// abonnemangsdialogen, sidled vid 390 px (Chatbot, Stream Deck, Avancerat i A&E), klippta knappar i
// katalogen, sökikonen över platshållaren, Event Inspector-raden som bröts ord för ord, toppkort utan
// inre marginal, rubrikradens knappar utanför skärmen, YouTube-reglerna i tre spalter,
// lagerlistans text och "1 saker", engelska vynamn och "Alltid"/"All tid".
// Inloggat mot riggens mock-backend, så att molnstate och auth-kedjan kör som i drift.
const test = require('node:test'), assert = require('node:assert/strict');
const { servera } = require('../rigg/servera.js');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

let browser;
const skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
});
test.after(async () => { if (browser) await browser.close() });

const HOJD = { 390: 844, 1024: 768, 1440: 900 };

async function studion(bredd, { vy, extra } = {}) {
  const rigg = await servera({ backend: true });
  const context = await browser.newContext({ viewport: { width: bredd, height: HOJD[bredd] || 900 } });
  const page = await context.newPage();
  await page.goto(`${rigg.bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.VyraAuth?.currentUser?.() && typeof window.render === 'function',
    null, { timeout: 30000, polling: 100 });
  // Provperiodens påminnelse ligger över nedre högra hörnet; den hör inte till det som mäts här.
  await page.addStyleTag({ content: '[data-trial-prompt]{display:none!important}' });
  await page.waitForTimeout(1500);
  if (vy) await page.evaluate(v => go(v), vy);
  if (extra) await page.evaluate(x => document.querySelector(`aside [data-extra="${x}"]`).click(), extra);
  await page.waitForTimeout(1200);
  return { page, stang: async () => { await context.close(); await rigg.stang() } };
}

const sidled = page => page.evaluate(() => document.documentElement.scrollWidth);

test('C-005: Automationer har ett tomt läge, och "Ny automation" öppnar en dialog', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion(1440);
  try {
    await page.evaluate(() => { state.flows = []; go('flows') });
    await page.waitForTimeout(300);
    assert.ok(await page.$('[data-flows-tom]'), 'inget tomt läge i Automationer');
    await page.click('#newFlow');
    await page.waitForFunction(() => document.querySelector('#flowModal')?.open, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => state.flows.length), 0, '"Ny automation" lade till en rad direkt');
    await page.fill('#flowTrigger', 'Ny följare');
    await page.fill('#flowAction', 'Spela ljud + TTS');
    await page.click('#flowSave');
    await page.waitForTimeout(300);
    const efter = await page.evaluate(() => ({ flows: state.flows, text: document.querySelector('#view').innerText }));
    assert.deepEqual(efter.flows, [{ trigger: 'Ny följare', action: 'Spela ljud + TTS', on: true }]);
    assert.doesNotMatch(efter.text, /TRIGGER|ACTION/, 'raden är fortfarande märkt på engelska');
    assert.match(efter.text, /Utlösare/);

    await page.click('[data-flow-andra="0"]');
    await page.fill('#flowAction', 'Visa animation');
    await page.click('#flowSave');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => state.flows[0].action), 'Visa animation', 'Ändra fungerar inte');

    await page.click('#newFlow');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.querySelector('#flowModal').open), false, 'Esc stängde inte dialogen');

    // Ta bort frågar först i raden (N-C-007), sedan tas raden bort.
    await page.click('[data-flow-ta-bort="0"]');
    await page.click('[data-flow-bekrafta="0"]');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => state.flows.length), 0, 'Ta bort fungerar inte');
    assert.ok(await page.$('[data-flows-tom]'));
  } finally { await stang() }
});

test('C-006: abonnemangsdialogen stängs med Esc och klick utanför', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion(1440);
  try {
    await page.evaluate(() => window.VyraBilling.open());
    await page.waitForSelector('.billing-modal', { timeout: 5000 });
    await page.keyboard.press('Escape');
    assert.equal(await page.$('.billing-modal'), null, 'Esc stängde inte abonnemangsdialogen');
    await page.evaluate(() => window.VyraBilling.open());
    await page.waitForSelector('.billing-modal', { timeout: 5000 });
    await page.mouse.click(6, 6);
    assert.equal(await page.$('.billing-modal'), null, 'klick utanför stängde inte abonnemangsdialogen');
  } finally { await stang() }
});

test('C-007/C-008/C-029: Chatbot — å/ä/ö, inget sidled vid 390 px, läsbar text', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion(390, { extra: 'chatbot' });
  try {
    const ut = await page.evaluate(() => ({
      text: document.querySelector('#view').innerText,
      small: parseFloat(getComputedStyle(document.querySelector('.command small')).fontSize),
      knapp: parseFloat(getComputedStyle(document.querySelector('.command button')).fontSize),
      knappar: [...document.querySelectorAll('.command button')].map(b => b.getBoundingClientRect()).map(r => [r.left, r.right]),
    }));
    assert.match(ut.text, /Följ mig på Instagram/);
    assert.doesNotMatch(ut.text, /Folj mig pa|laten som spelas pa|poang och niva/);
    assert.ok(await sidled(page) <= 390, `Chatbot rullar i sidled: ${await sidled(page)}`);
    assert.ok(ut.small >= 11 && ut.knapp >= 11, `för liten text: ${ut.small}/${ut.knapp} px`);
    // Aktiv och Testa får inte ligga ovanpå varandra.
    const [a, b] = ut.knappar;
    assert.ok(a[1] <= b[0] || b[1] <= a[0], 'Aktiv och Testa överlappar');
  } finally { await stang() }
});

test('C-009: sökfältets förstoringsglas ligger inte över platshållaren', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion(1440, { vy: 'overlay' });
  try {
    const pl = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.overlay-widget-gallery .search-input .widget-search')).paddingLeft));
    assert.ok(pl >= 34, `padding-left ${pl} px räcker inte för ikonen`);
  } finally { await stang() }
});

test('C-010: katalogkortens knappar klipps inte vid 390 px', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion(390, { vy: 'overlay' });
  try {
    const klippta = await page.evaluate(() => [...document.querySelectorAll('.overlay-widget-gallery .owg-add, .overlay-widget-gallery .owg-preview')]
      .filter(b => b.offsetWidth && b.scrollWidth > b.clientWidth + 1).map(b => b.textContent.trim()).slice(0, 5));
    assert.deepEqual(klippta, []);
  } finally { await stang() }
});

test('C-011/C-019: LIVE-kontrollens tomma rad spänner hela tabellen, och rubrikerna är svenska', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion(1440, { extra: 'liveControl' });
  try {
    const ut = await page.evaluate(() => {
      const td = document.querySelector('.lc-empty'), t = td && td.closest('table');
      return { td: td && td.getBoundingClientRect().width, t: t && t.getBoundingClientRect().width, text: document.querySelector('#view').innerText };
    });
    assert.ok(ut.td && ut.td >= ut.t - 2, `tomma raden är ${ut.td} px av ${ut.t}`);
    assert.doesNotMatch(ut.text, /LIVE Control Center|Event Inspector|Match Monitor/);
  } finally { await stang() }
});

test('C-012: toppkorten i Statistik har inre marginal', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion(1440, { vy: 'analytics' });
  try {
    const p = await page.evaluate(() => [...document.querySelectorAll('#view .card.statistics-head, #view .card.stream-time-card')]
      .map(c => parseFloat(getComputedStyle(c).paddingLeft)));
    assert.ok(p.length >= 1 && p.every(v => v >= 16), `padding: ${p}`);
    const text = await page.evaluate(() => document.querySelector('#view').innerText);
    assert.doesNotMatch(text, /Alltid/);
  } finally { await stang() }
});

test('C-013: rubrikradens knappar ligger inom skärmen vid 390 px', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion(390);
  try {
    const ut = await page.evaluate(() => {
      const rad = document.querySelector('main>header .head-actions');
      return { rullar: rad.scrollWidth > rad.clientWidth + 1,
        utanfor: [...rad.children].filter(e => e.offsetWidth).filter(e => e.getBoundingClientRect().right > innerWidth + 0.5).map(e => e.textContent.trim()) };
    });
    assert.equal(ut.rullar, false, 'knappraden rullar fortfarande i sidled');
    assert.deepEqual(ut.utanfor, []);
  } finally { await stang() }
});

for (const [namn, opts, klick] of [
  ['C-014: Stream Deck', { extra: 'streamdeck' }, null],
  ['C-015: Avancerat i Action & Event', { extra: 'actions' }, 'summary:has-text("Avancerat")'],
  ['C-016: YouTube', { extra: 'youtube' }, null],
]) {
  test(`${namn} rullar inte i sidled vid 390 px`, { skip, timeout: 90000 }, async () => {
    const { page, stang } = await studion(390, opts);
    try {
      if (klick) { await page.click(klick); await page.waitForTimeout(400) }
      const sw = await sidled(page);
      assert.ok(sw <= 390, `${namn}: scrollWidth ${sw}`);
      if (opts.extra === 'youtube') {
        const spalter = await page.evaluate(() => getComputedStyle(document.querySelector('.music-rules')).gridTemplateColumns.split(' ').length);
        assert.equal(spalter, 1, 'reglerna står fortfarande i flera spalter');
      }
    } finally { await stang() }
  });
}

test('C-017/C-018: lagerlistan — "1 sak sparad" och ingen klippt status', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion(1024, { vy: 'editor' });
  try {
    const ut = await page.evaluate(() => ({
      rubrik: document.querySelector('.live-layer-panel header span')?.textContent,
      klippt: [...document.querySelectorAll('.live-layer-list .layer-select b, .live-layer-list .layer-select small')]
        .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent),
      lagerRubrikHojd: document.querySelector('.live-layer-panel header b').getBoundingClientRect().height,
    }));
    assert.match(ut.rubrik, /^1 sak sparad i din live$/);
    assert.deepEqual(ut.klippt, []);
    assert.ok(ut.lagerRubrikHojd < 24, `"LIVE-LAGER" bryts: ${ut.lagerRubrikHojd} px hög`);
  } finally { await stang() }
});

test('C-019/C-020: sidomenyn och Översikt', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion(1440);
  try {
    const ut = await page.evaluate(() => ({ meny: document.querySelector('aside').innerText, vy: document.querySelector('#view').innerText }));
    assert.doesNotMatch(ut.meny, /Performance Wizard/);
    assert.doesNotMatch(ut.vy, /Alltid/);
  } finally { await stang() }
});
