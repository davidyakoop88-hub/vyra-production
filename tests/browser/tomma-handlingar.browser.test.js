'use strict';
// Etapp 6E: de tomma tillstanden fick en rost i Etapp 4 men aldrig hander.
//
// Uppmatt 2026-08-09, fore det har arbetet: tolv tillstand bar data-tom, ETT av dem hade en
// handling (automatik-scenlank). Resten sa "Skapa den forsta", "Lagg till en", "Anslut TikTok
// LIVE" utan att nagot gick att klicka pa.
//
// Fas A matte i korande app att varje mekanism finns OCH ar synlig i samma vy som sitt tomma
// tillstand, sa ingen ny knapp behover uppfinnas - de befintliga ska bara na fram dit ogat ar.
//
// HANDLINGEN AR ETT SYSKON till [data-tom]-noden, aldrig ett barn: rostprovet i
// tomma-tillstand.browser.test.js jamfor nodens textContent EXAKT mot fixturen, och en knapp
// inuti noden hade fallt det. Provet nedan vaktar bade det och att handlingen fungerar.
const test = require('node:test'), assert = require('node:assert/strict');
const { servera } = require('../rigg/servera.js');
// NABAR, inte SYNLIG: Automatik-vyn ar 2763 px hog och tillstanden ligger langt ner. Kravet ar
// att handlingen gar att na, inte att den rakar ligga ovanfor vikningen. Se fixturens kommentar
// - det har ar tredje gangen samma matning behovts, sa den bor numera dar.
const { NABAR } = require('../fixtures/synlighet.js');
const { TOMMA, PER_VY } = require('../fixtures/tomma-tillstand.js');

const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

let browser;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
});
test.after(async () => { if (browser) await browser.close() });

// Vilken vy varje nyckel bor i, harlett ur PER_VY sa listan aldrig kan sara sig fran fixturen.
const VY_FOR = {};
for (const [vy, nycklar] of Object.entries(PER_VY)) for (const n of nycklar) VY_FOR[n] = vy;

const MED_HANDLING = Object.entries(TOMMA).filter(([, d]) => d.handling);

async function oppnaStudio() {
  const rigg = await servera();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  // 90 s: den lokala riggen laddar studio.html pa 15-25 s (121 forfragningar mot en
  // enkeltradad filserver). Uppmatt 2026-08-09 - CI ar snabbare, taket ar for marginalen.
  await page.goto(`${rigg.bas}/studio.html`, { waitUntil: 'load', timeout: 90000 });
  await page.evaluate(() => new Promise(r => setTimeout(r, 3200)));
  return { rigg, context, page, stang: async () => { await context.close(); await rigg.stang() } };
}

async function tillVy(page, vy) {
  const traffade = await page.evaluate(v => {
    const knapp = document.querySelector(`aside [data-view="${v}"], aside [data-extra="${v}"]`);
    if (!knapp) return false;
    knapp.click();
    return true;
  }, vy);
  assert.equal(traffade, true, `kontrollmatning: sidonavigeringen har ingen "${vy}"`);
  await page.waitForTimeout(1600);
}

// ---- Prov 1 - varje deklarerad handling finns, syns och ar ett syskon --------------------------
test('varje tomt tillstand med handling bar den som synligt syskon', { skip, timeout: 300000 }, async () => {
  const s = await oppnaStudio();
  try {
    const fel = [];
    for (const [nyckel, def] of MED_HANDLING) {
      const vy = VY_FOR[nyckel];
      assert.ok(vy, `${nyckel} saknas i PER_VY - fixturen ar osammanhangande`);
      await tillVy(s.page, vy);
      const m = await s.page.evaluate(`(() => {
        const tom = document.querySelector('[data-tom="${nyckel}"]');
        if (!tom) return { tomtSaknas: true };
        const inuti = tom.querySelector('[data-tom-handling]');
        const syskon = tom.parentElement &&
          [...tom.parentElement.children].find(el => el !== tom && el.matches('[data-tom-handling]'));
        if (!syskon) return { handlingSaknas: true, barnIStallet: !!inuti };
        return { mal: syskon.getAttribute('data-tom-handling'),
          etikett: syskon.textContent.replace(/\\s+/g, ' ').trim(),
          synlig: (${NABAR})(syskon), barnIStallet: !!inuti };
      })()`);

      if (m.tomtSaknas) { fel.push(`${nyckel}: det tomma tillstandet visas inte i vyn ${vy}`); continue }
      if (m.handlingSaknas) {
        fel.push(`${nyckel}: ingen handling` + (m.barnIStallet
          ? ' som syskon - den ligger INUTI [data-tom] och faller rostprovet' : ''));
        continue;
      }
      if (m.barnIStallet) fel.push(`${nyckel}: handling inuti [data-tom] - rostprovet kommer falla`);
      if (m.mal !== def.handling.mal) fel.push(`${nyckel}: pekar pa "${m.mal}", fixturen sager "${def.handling.mal}"`);
      if (m.etikett !== def.handling.etikett) fel.push(`${nyckel}: sager "${m.etikett}", fixturen sager "${def.handling.etikett}"`);
      if (!m.synlig.ok) fel.push(`${nyckel}: handlingen gar inte att na (${m.synlig.skal})`);
    }
    assert.deepEqual(fel, [], 'tomma tillstand utan fungerande handling:\n  ' + fel.join('\n  '));
  } finally { await s.stang() }
});

// ---- Prov 2 - malet finns och ar natt ----------------------------------------------------------
// En handling som pekar pa en selektor som inte finns i vyn ar en dod knapp - samma sort som de
// fyra doda panelkontrollerna i Gift Fireworks (PR #94).
test('varje handlings mal finns och gar att na i samma vy', { skip, timeout: 300000 }, async () => {
  const s = await oppnaStudio();
  try {
    const fel = [];
    for (const [nyckel, def] of MED_HANDLING) {
      await tillVy(s.page, VY_FOR[nyckel]);
      const m = await s.page.evaluate(`(() => {
        const mal = document.querySelector('${def.handling.mal}');
        if (!mal) return { saknas: true };
        return { synlig: (${NABAR})(mal) };
      })()`);
      if (m.saknas) { fel.push(`${nyckel}: malet ${def.handling.mal} finns inte i vyn`); continue }
      if (!m.synlig.ok) fel.push(`${nyckel}: malet ${def.handling.mal} gar inte att na (${m.synlig.skal})`);
    }
    assert.deepEqual(fel, [], 'handlingar som pekar pa ingenting:\n  ' + fel.join('\n  '));
  } finally { await s.stang() }
});

// ---- Prov 3 - klicket gor samma sak som malet --------------------------------------------------
test('klick pa handlingen utloser malet', { skip, timeout: 300000 }, async () => {
  const s = await oppnaStudio();
  try {
    const fel = [];
    for (const [nyckel, def] of MED_HANDLING) {
      await tillVy(s.page, VY_FOR[nyckel]);
      const m = await s.page.evaluate(`(async () => {
        const mal = document.querySelector('${def.handling.mal}');
        const tom = document.querySelector('[data-tom="${nyckel}"]');
        const knapp = tom && tom.parentElement &&
          [...tom.parentElement.children].find(el => el !== tom && el.matches('[data-tom-handling]'));
        if (!mal || !knapp) return { saknas: true };
        // Raknar klick PA MALET i stallet for att gissa vad malet gor. Vad knappen oppnar ar
        // malets ensak - det enda vi vaktar ar att den verkligen trycker pa den.
        let traffar = 0;
        const lyssnare = () => { traffar++ };
        mal.addEventListener('click', lyssnare);
        knapp.click();
        await new Promise(r => setTimeout(r, 350));
        mal.removeEventListener('click', lyssnare);
        return { traffar };
      })()`);
      if (m.saknas) { fel.push(`${nyckel}: handling eller mal saknas`); continue }
      if (m.traffar !== 1) fel.push(`${nyckel}: malet klickades ${m.traffar} ggr, forvantat 1`);
      // Stang det som eventuellt oppnades sa nasta varv startar rent.
      await s.page.keyboard.press('Escape').catch(() => {});
      await s.page.waitForTimeout(250);
    }
    assert.deepEqual(fel, [], 'handlingar som inte utloser sitt mal:\n  ' + fel.join('\n  '));
  } finally { await s.stang() }
});

// ---- Prov 4 - rosten ar orord ------------------------------------------------------------------
// Hela skalet att handlingen ar ett syskon. Provet duplicerar rostprovets krav med flit: om en
// framtida andring flyttar in knappen i noden ska DET har provet saga varfor.
test('handlingen andrar inte det tomma tillstandets text', { skip, timeout: 300000 }, async () => {
  const s = await oppnaStudio();
  try {
    const fel = [];
    for (const [nyckel, def] of MED_HANDLING) {
      await tillVy(s.page, VY_FOR[nyckel]);
      const text = await s.page.evaluate(n => {
        const el = document.querySelector(`[data-tom="${n}"]`);
        return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
      }, nyckel);
      if (text === null) { fel.push(`${nyckel}: saknas`); continue }
      if (text !== def.text) fel.push(`${nyckel}: "${text.slice(0, 80)}" - inte fixturens rost`);
    }
    assert.deepEqual(fel, [], 'roster som andrats av sin handling:\n  ' + fel.join('\n  '));
  } finally { await s.stang() }
});

// ---- Prov 5 - inga odeklarerade handlingar -----------------------------------------------------
// Vakten at andra hallet: en knapp som dykt upp utan att sta i fixturen ar en rost ingen beslutat.
test('ingen handling finns utan att vara deklarerad i fixturen', { skip, timeout: 300000 }, async () => {
  const s = await oppnaStudio();
  try {
    const odeklarerade = [];
    for (const vy of Object.keys(PER_VY)) {
      await tillVy(s.page, vy);
      const funna = await s.page.evaluate(() =>
        [...document.querySelectorAll('#view [data-tom-handling]')].map(el => {
          const syskon = el.parentElement &&
            [...el.parentElement.children].find(x => x.matches('[data-tom]'));
          return syskon ? syskon.getAttribute('data-tom') : '(utan tomt tillstand bredvid)';
        }));
      for (const n of funna) if (!TOMMA[n] || !TOMMA[n].handling) odeklarerade.push(`${vy}/${n}`);
    }
    assert.deepEqual(odeklarerade, [],
      'handlingar utan post i fixturen: ' + odeklarerade.join(', '));
  } finally { await s.stang() }
});
