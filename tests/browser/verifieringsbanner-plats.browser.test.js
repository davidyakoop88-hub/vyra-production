'use strict';
// Verifieringsbannern far inte tacka studions huvud.
//
// Bannern (auth-security.js) ar position:fixed hogst upp med z-index 9000. Uppmatt 2026-10-17
// mot mock-backenden, 1280x900, ovetifierat konto:
//
//   oversikt          banner 0-60 px   .connect 25-56 px   -> helt under bannern
//   ?open=layout      banner 0-60 px   .connect 13-44 px   -> helt under bannern
//   ?overlay=1        banner 0-60 px synlig i OBS-utgangen
//
// Det ar just "Anslut TikTok" som doljs — knappen bannern sjalv sager at en att anvanda efter
// verifieringen. Provet kraver att sidan gor plats for bannerns UPPMATTA hojd, att platsen
// lamnas tillbaka nar bannern stangs, att layoutvyn inte far extra rullning och att bannern
// aldrig finns i overlay-utgangen.
const test = require('node:test'), assert = require('node:assert/strict');
const { servera } = require('../rigg/servera.js');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

let browser;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
});
test.after(async () => { if (browser) await browser.close() });

async function oppna(sokvag, vy = { width: 1280, height: 900 }) {
  const rigg = await servera({ backend: true });
  const context = await browser.newContext({ viewport: vy });
  const page = await context.newPage();
  try {
    await page.goto(`${rigg.bas}${sokvag}`, { waitUntil: 'load' });
    await page.evaluate(() => new Promise(r => setTimeout(r, 2500)));
  } catch (e) { await context.close(); await rigg.stang(); throw e }
  return { page, stang: async () => { await context.close(); await rigg.stang() } };
}

// Allt mats i sidan. `tackt` ar elementet som faktiskt ligger overst mitt pa knappen — det ar
// vad en klickande anvandare traffar, oberoende av hur rutorna raknas.
const MAT = () => {
  const ruta = s => { const e = document.querySelector(s); if (!e) return null;
    const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: b.height } };
  const knapp = document.querySelector('.connect');
  let overst = null;
  if (knapp) { const b = knapp.getBoundingClientRect();
    const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    overst = knapp.contains(el) ? 'knappen' : (el && el.closest('.verification-banner') ? 'bannern' : String(el && el.tagName)) }
  const se = document.scrollingElement;
  return { banner: ruta('.verification-banner'), connect: ruta('.connect'), aside: ruta('aside'),
    skal: ruta('.editor-shell'), overst, rullning: se.scrollHeight - se.clientHeight,
    hojd: innerHeight, scrollY };
};

const STANG = async page => page.evaluate(async () => {
  document.querySelector('.verification-banner [data-stang]').click();
  await new Promise(r => setTimeout(r, 300));
});

for (const [namn, sokvag] of [['oversikten', '/studio.html'], ['layoutvyn', '/studio.html?open=layout']]) {
  test(`${namn}: Anslut TikTok ligger under bannern, inte bakom den`, { skip, timeout: 90000 }, async () => {
    const s = await oppna(sokvag);
    try {
      const m = await s.page.evaluate(MAT);
      assert.ok(m.banner && m.banner.h > 0, 'kontrollmatning: mock-kontot ar overifierat, bannern ska synas');
      assert.ok(m.connect && m.connect.h > 0, 'kontrollmatning: .connect ska finnas i huvudet');
      assert.ok(m.connect.top >= m.banner.bottom - 0.5,
        `.connect borjar pa y=${m.connect.top} men bannern slutar pa y=${m.banner.bottom}`);
      assert.equal(m.overst, 'knappen', `mitt pa Anslut TikTok ligger "${m.overst}" overst`);
      assert.ok(m.aside.top >= m.banner.bottom - 0.5 && m.aside.bottom <= m.hojd + 0.5,
        `sidomenyn ska borja under bannern och sluta inom fonstret: ${m.aside.top}-${m.aside.bottom}`);
    } finally { await s.stang() }
  });
}

test('layoutvyn: bannern ger ingen extra rullning och skalet ryms i fonstret', { skip, timeout: 90000 }, async () => {
  const s = await oppna('/studio.html?open=layout');
  try {
    const m = await s.page.evaluate(MAT);
    assert.ok(m.banner && m.banner.h > 0, 'kontrollmatning: bannern ska synas');
    assert.ok(m.skal, 'kontrollmatning: layoutredigeraren ska vara oppen');
    assert.equal(m.rullning, 0, `layoutvyn ska inte rulla, men sidan ar ${m.rullning}px for hog`);
    assert.ok(m.skal.top >= m.banner.bottom && m.skal.bottom <= m.hojd + 0.5,
      `redigeraren ska ligga mellan bannern och fonsterkanten: ${m.skal.top}-${m.skal.bottom}`);
  } finally { await s.stang() }
});

test('nar bannern stangs lamnas platsen tillbaka', { skip, timeout: 90000 }, async () => {
  const s = await oppna('/studio.html?open=layout');
  try {
    const fore = await s.page.evaluate(MAT);
    await STANG(s.page);
    const efter = await s.page.evaluate(MAT);
    const kvar = await s.page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--verifiering-hojd').trim());
    assert.equal(efter.banner, null, 'kontrollmatning: bannern ska vara borta efter x');
    assert.ok(!kvar || kvar === '0px', `--verifiering-hojd ska vara borttagen, ar "${kvar}"`);
    assert.ok(efter.connect.top < fore.connect.top, 'huvudet ska flytta upp nar bannern stangs');
    assert.ok(efter.aside.top <= 0.5, `sidomenyn ska borja hogst upp igen, borjar pa ${efter.aside.top}`);
    assert.equal(efter.rullning, 0, 'och layoutvyn ska fortfarande inte rulla');
  } finally { await s.stang() }
});

test('overlay-utgangen visar aldrig bannern och flyttar inte duken', { skip, timeout: 90000 }, async () => {
  const s = await oppna('/studio.html?overlay=1');
  try {
    const m = await s.page.evaluate(() => {
      const b = document.querySelector('.verification-banner');
      const synlig = !!b && b.getBoundingClientRect().height > 0 && getComputedStyle(b).display !== 'none';
      return { synlig, padding: getComputedStyle(document.body).paddingTop,
        varde: getComputedStyle(document.documentElement).getPropertyValue('--verifiering-hojd').trim(),
        overlay: document.documentElement.classList.contains('overlay-output') };
    });
    assert.ok(m.overlay, 'kontrollmatning: sidan ska vara i overlay-lage');
    assert.equal(m.synlig, false, 'verifieringsbannern syns i OBS-utgangen');
    assert.equal(m.padding, '0px', `overlayns body har padding-top ${m.padding}`);
    assert.ok(!m.varde || m.varde === '0px', `--verifiering-hojd ar satt i overlayn: "${m.varde}"`);
  } finally { await s.stang() }
});
