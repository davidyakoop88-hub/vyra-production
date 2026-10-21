'use strict';
// SLUTGRANSKNINGEN 2026-10-20, GRANSKARE C — DE FYRA HÖGA FELEN.
//
// Alla fyra provas inloggat, mot riggens mock-backend (tests/rigg/servera.js { backend: true }),
// så att den riktiga auth-kedjan och molnsynken kör.
//
//   C-001  "🎨 Färgschema" gjorde ingenting och kastade "reading 'background'" när state saknade
//          brandKit — vilket molnstate (/api/state, mock-layouten) och äldre layouter gör.
//          Rättat i fargschema-prov.js utan att röra studio.js; ett befintligt värde skrivs inte över.
//   C-002  Tvåstegsdialogen ("Aktivera") gick inte att stänga: ingen ×, ingen Avbryt, Esc och klick
//          utanför gjorde ingenting.
//   C-003  Samma för "Radera konto" — och att avbryta får inte planera någon borttagning.
//   C-004  Det fanns ingen Logga ut-knapp i studion. Nu en i kontofoten och en i Inställningar, båda
//          via VyraAuth.logout(); osynkade ändringar ger en varning först.
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

async function studion() {
  const logg = [];
  const rigg = await servera({ backend: true, logg });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const fel = [];
  page.on('pageerror', e => fel.push(String(e.message)));
  // MFA-starten finns inte i fixturen; svaret har serverns form (uri, secret, qr).
  await page.route('**/api/auth/mfa/setup', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, uri: 'otpauth://totp/VYRA:mock?secret=ABC', secret: 'ABCDEFGH', qr: null }) }));
  await page.goto(`${rigg.bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.VyraAuth?.currentUser?.() && typeof window.render === 'function',
    null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(1500);
  return { page, logg, fel, stang: async () => { await context.close(); await rigg.stang() } };
}

async function installningar(page) {
  await page.click('aside button[data-view="settings"]');
  await page.waitForSelector('.settings-page', { timeout: 10000 });
}

const modalOppen = page => page.evaluate(() => !!document.querySelector('.security-modal'));

test('C-001: Färgschema öppnas även när sparad state saknar brandKit', { skip, timeout: 90000 }, async () => {
  const { page, fel, stang } = await studion();
  try {
    await page.evaluate(() => { delete state.brandKit });
    await page.click('#openBrandKit');
    await page.waitForTimeout(400);
    const ut = await page.evaluate(() => ({
      oppen: !!document.querySelector('#brandKitModal')?.open,
      bakgrund: document.querySelector('#bkBackground').value,
      highlight: document.querySelector('#bkHighlight').value,
    }));
    assert.deepEqual(fel.filter(m => /background/.test(m)), [], 'dialogen kastade: ' + fel.join(' | '));
    assert.equal(ut.oppen, true, 'Färgschema-dialogen öppnades inte');
    assert.equal(ut.bakgrund, '#1c1028');
    assert.equal(ut.highlight, '#ff58d6');
  } finally { await stang() }
});

test('C-001: ett befintligt men ofullständigt färgschema skrivs inte över', { skip, timeout: 90000 }, async () => {
  const { page, fel, stang } = await studion();
  try {
    await page.evaluate(() => { state.brandKit = { highlight: '#123456' } });
    await page.click('#openBrandKit');
    await page.waitForTimeout(400);
    const ut = await page.evaluate(() => ({
      oppen: !!document.querySelector('#brandKitModal')?.open,
      highlight: document.querySelector('#bkHighlight').value,
      text: document.querySelector('#bkText').value,
      kit: state.brandKit.highlight,
    }));
    assert.deepEqual(fel, []);
    assert.equal(ut.oppen, true);
    assert.equal(ut.highlight, '#123456', 'det sparade highlight-värdet skrevs över');
    assert.equal(ut.kit, '#123456');
    assert.equal(ut.text, '#f7f2ff', 'saknat fält fick inte standardvärdet');
  } finally { await stang() }
});

async function oppnaMfa(page) {
  await page.waitForSelector('.mfa-settings .enable', { timeout: 10000 });
  await page.click('.mfa-settings .enable');
  await page.waitForSelector('.security-modal', { timeout: 5000 });
}

test('C-002: tvåstegsdialogen stängs med Esc, ×, Avbryt och klick utanför', { skip, timeout: 90000 }, async () => {
  const { page, stang } = await studion();
  try {
    await installningar(page);
    await oppnaMfa(page);
    await page.keyboard.press('Escape');
    assert.equal(await modalOppen(page), false, 'Esc stängde inte tvåstegsdialogen');

    await oppnaMfa(page);
    await page.click('.security-modal .security-stang');
    assert.equal(await modalOppen(page), false, '× stängde inte tvåstegsdialogen');

    await oppnaMfa(page);
    await page.click('.security-modal .security-avbryt');
    assert.equal(await modalOppen(page), false, 'Avbryt stängde inte tvåstegsdialogen');

    await oppnaMfa(page);
    await page.mouse.click(8, 8);
    assert.equal(await modalOppen(page), false, 'klick utanför stängde inte tvåstegsdialogen');

    await oppnaMfa(page);
    const etikett = await page.getAttribute('.security-modal .security-stang', 'aria-label');
    assert.equal(etikett, 'Stäng');
  } finally { await stang() }
});

async function oppnaRadera(page) {
  await page.waitForSelector('.privacy-settings .delete-account', { timeout: 10000 });
  await page.click('.privacy-settings .delete-account');
  await page.waitForSelector('.security-modal', { timeout: 5000 });
}

test('C-003: "Radera konto" går att avbryta utan att något planeras', { skip, timeout: 90000 }, async () => {
  const { page, logg, stang } = await studion();
  try {
    await installningar(page);
    await oppnaRadera(page);
    await page.keyboard.press('Escape');
    assert.equal(await modalOppen(page), false, 'Esc stängde inte raderingsdialogen');

    await oppnaRadera(page);
    await page.click('.security-modal .security-stang');
    assert.equal(await modalOppen(page), false, '× stängde inte raderingsdialogen');

    await oppnaRadera(page);
    await page.fill('.security-modal input[type=password]', 'hemligt-losenord');
    await page.check('.security-modal .delete-confirm input');
    await page.click('.security-modal .security-avbryt');
    assert.equal(await modalOppen(page), false, 'Avbryt stängde inte raderingsdialogen');

    await oppnaRadera(page);
    await page.mouse.click(8, 8);
    assert.equal(await modalOppen(page), false, 'klick utanför stängde inte raderingsdialogen');

    await page.waitForTimeout(300);
    const planerat = logg.filter(r => r.metod === 'POST' && r.sokvag === '/api/auth/account/deletion');
    assert.deepEqual(planerat, [], 'att avbryta skickade en kontoborttagning till servern');
  } finally { await stang() }
});

test('C-004: Logga ut finns i kontofoten och i Inställningar och loggar ut', { skip, timeout: 90000 }, async () => {
  const { page, logg, stang } = await studion();
  try {
    const fot = await page.evaluate(() => {
      const b = document.querySelector('aside .aside-bottom .user .logga-ut-fot');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { etikett: b.getAttribute('aria-label'), b: r.width, h: r.height };
    });
    assert.ok(fot, 'ingen Logga ut-knapp i kontofoten');
    assert.equal(fot.etikett, 'Logga ut');
    assert.ok(fot.b >= 24 && fot.h >= 24, `klickytan är för liten: ${fot.b}×${fot.h}`);

    await installningar(page);
    await page.waitForSelector('.logout-settings .logga-ut', { timeout: 10000 });
    assert.match(await page.textContent('.logout-settings .logga-ut'), /Logga ut/);

    await page.click('.logout-settings .logga-ut');
    await page.waitForSelector('.auth-gate', { timeout: 10000 });
    assert.ok(logg.some(r => r.metod === 'POST' && r.sokvag === '/api/auth/logout'), 'POST /api/auth/logout skickades inte');
    assert.equal(await page.evaluate(() => !!document.querySelector('.logga-ut-fot')), false,
      'utloggningsknappen ligger kvar efter utloggningen');
  } finally { await stang() }
});

test('C-004: osynkade ändringar ger en varning innan utloggningen', { skip, timeout: 90000 }, async () => {
  const { page, logg, stang } = await studion();
  try {
    await page.waitForSelector('.logga-ut-fot', { timeout: 10000 });
    await page.evaluate(() => {
      window.VyraCloudSync.status = () => 'offline';
      window.VyraCloudSync.push = async () => ({ ok: false, reason: 'fel' });
    });
    await page.click('.logga-ut-fot');
    await page.waitForSelector('.security-modal [data-stanna]', { timeout: 5000 });
    await page.click('.security-modal [data-stanna]');
    await page.waitForTimeout(300);
    assert.equal(logg.some(r => r.sokvag === '/api/auth/logout'), false, '"Stanna kvar" loggade ut ändå');
    assert.equal(await page.evaluate(() => !!document.querySelector('.auth-gate')), false);

    await page.click('.logga-ut-fot');
    await page.waitForSelector('.security-modal [data-ut]', { timeout: 5000 });
    await page.click('.security-modal [data-ut]');
    await page.waitForSelector('.auth-gate', { timeout: 10000 });
    assert.ok(logg.some(r => r.metod === 'POST' && r.sokvag === '/api/auth/logout'));
  } finally { await stang() }
});

test('C-004: ingen utloggningsknapp i overlay-läget', { skip, timeout: 90000 }, async () => {
  const logg = [];
  const rigg = await servera({ backend: true, logg });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  try {
    await page.goto(`${rigg.bas}/studio.html?overlay=1`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    assert.equal(await page.evaluate(() => document.querySelectorAll('.logga-ut-fot,.logout-settings').length), 0);
  } finally { await context.close(); await rigg.stang() }
});
