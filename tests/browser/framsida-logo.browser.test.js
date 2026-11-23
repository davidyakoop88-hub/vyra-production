'use strict';
// FRAMSIDANS LOGOTYP — och höjden den kostar.
//
// Fram till nu har VYRA inte haft någon logotyp alls: `electron-app/icon.ico` var hela beståndet,
// och rubriken i toppen var bokstaven V i en CSS-ruta. Den här filen vaktar att märket finns,
// att det LADDAR, och — viktigast — att det inte trycker ner sidans sista rad under vecket.
//
// VARFÖR DEN TREDJE FRÅGAN HAR ETT EGET PROV. Prisraden har hamnat under vecket TVÅ gånger
// (uppmätt y=936 i en 900px-vy), båda gångerna för att någon la till höjd i heron utan att mäta.
// `landningssida.browser.test.js` fångar det via SYNLIG på prisbadgen, och det räcker för att bli
// röd — men felmeddelandet där pekar på priset, inte på det som orsakade det. Att lägga en
// logotyp överst i heron är precis den sortens ändring, så vakten formuleras här med rätt skäl:
// om raden faller ska provet säga att MÄRKET kostade för mycket höjd.
//
// VARFÖR naturalWidth. En <img> med fel sökväg ger inget fel i konsolen som ett prov ser, tar
// plats i layouten via width/height-attributen och ser i en DOM-dump ut som ett fungerande
// element. `naturalWidth > 0` är den enda frågan som skiljer "bilden finns" från "taggen finns".
const test = require('node:test'), assert = require('node:assert/strict');
const { servera } = require('../rigg/servera.js');
const { SYNLIG } = require('../fixtures/synlighet.js');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

let browser, rigg;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
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

test('märket ligger överst i heron, syns, och bilden laddar faktiskt',
  { skip, timeout: 60000 }, async () => {
  const { context, page } = await sidan();
  try {
    const m = await page.evaluate(`(() => {
      const marke = document.querySelector('[data-hero-marke]');
      if (!marke) return { saknas: true };
      const bild = marke.matches('img') ? marke : marke.querySelector('img');
      const ogonbryn = document.querySelector('.hero .eyebrow');
      return {
        synlig: (${SYNLIG})(marke),
        laddad: !!bild && bild.complete && bild.naturalWidth > 0,
        kalla: bild ? bild.getAttribute('src') : null,
        alt: bild ? bild.getAttribute('alt') : null,
        overOgonbrynet: !!ogonbryn &&
          (marke.compareDocumentPosition(ogonbryn) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        y: Math.round(marke.getBoundingClientRect().top),
        hojd: Math.round(marke.getBoundingClientRect().height),
      };
    })()`);

    assert.ok(!m.saknas, '[data-hero-marke] saknas — framsidan har ingen logotyp');
    assert.equal(m.synlig.ok, true, `märket syns inte: ${m.synlig.skal}`);
    assert.equal(m.laddad, true,
      `bilden laddade inte (src="${m.kalla}"). En <img> med fel sökväg tar plats i layouten och `
      + 'ser hel ut i DOM:en — naturalWidth är det enda som skiljer bild från tagg.');
    assert.ok(m.alt && m.alt.trim().length > 0,
      'märket saknar alt-text; för en skärmläsare är sidan då namnlös');
    assert.equal(m.overOgonbrynet, true,
      `märket ska stå FÖRE ögonbrynet i dokumentet — det är sidans avsändare, inte en dekoration `
      + `mitt i texten (märket ligger på y=${m.y})`);
  } finally { await context.close() }
});

// STARTSIDAN 2026-11-22: prisraden blev hjältens erbjudande — knappen "Testa 3 dagar gratis" med
// villkoren under ([data-hero-pris]). Löftet är detsamma: det får inte kräva rullning.
test('märket trycker inte ner erbjudandet under vecket i en 900px-vy',
  { skip, timeout: 60000 }, async () => {
  const { context, page } = await sidan({ width: 1440, height: 900 });
  try {
    const m = await page.evaluate(`(() => {
      const rad = document.querySelector('[data-hero-pris]');
      const marke = document.querySelector('[data-hero-marke]');
      if (!rad) return { saknas: true };
      const r = rad.getBoundingClientRect();
      const mr = marke ? marke.getBoundingClientRect() : null;
      return {
        topp: Math.round(r.top), botten: Math.round(r.bottom), vy: innerHeight,
        markeshojd: mr ? Math.round(mr.height) : 0,
      };
    })()`);

    assert.ok(!m.saknas, '[data-hero-pris] saknas');
    assert.ok(m.botten <= m.vy,
      `erbjudandet slutar på y=${m.botten} i en ${m.vy}px-vy — det ligger under vecket. Märket är `
      + `${m.markeshojd} px högt; antingen krymper det i @media (max-height:1000px) eller så måste `
      + 'annan höjd ge vika. Raden är sidans löfte om tre gratisdagar och får inte kräva rullning.');
  } finally { await context.close() }
});

// Slutgranskningen 2026-10-21: "prisraden kräver en kort rullning i låga fönster". 1366 x 768 med
// Chromes list ger ~657 px vy. STARTSIDAN 2026-11-22: kortet ligger inte längre i hjälten utan i
// ett lager som Logga in öppnar, så det som ska synas utan rullning är erbjudandet självt.
test('erbjudandet syns utan rullning på en laptop med webbläsarlist (1366 x 657)',
  { skip, timeout: 60000 }, async () => {
  const { context, page } = await sidan({ width: 1366, height: 657 });
  try {
    const m = await page.evaluate(`(() => {
      const r = document.querySelector('[data-hero-pris]').getBoundingClientRect();
      const lager = document.querySelector('[data-konto-lager]');
      return { botten: Math.round(r.bottom), vy: innerHeight, lagerStangt: !lager || lager.hidden,
        bredd: document.documentElement.scrollWidth, vyBredd: innerWidth };
    })()`);
    assert.ok(m.botten <= m.vy, `erbjudandet slutar på y=${m.botten} i en ${m.vy}px-vy`);
    assert.ok(m.lagerStangt, 'inloggningslagret är öppet innan besökaren tryckt — det täcker erbjudandet');
    assert.ok(m.bredd <= m.vyBredd, `sidan rullar i sidled: ${m.bredd} > ${m.vyBredd}`);
  } finally { await context.close() }
});

test('märket krymper i ett kort fönster i stället för att äta prisraden',
  { skip, timeout: 60000 }, async () => {
  // Kontrollmätning mot föregående prov: det ska vara MÄRKET som ger vika i korta fönster, inte
  // något annat. Utan den här raden kan someone lösa höjdproblemet genom att krympa priset.
  const stor = await sidan({ width: 1440, height: 1200 });
  const liten = await sidan({ width: 1440, height: 760 });
  try {
    const mat = p => p.evaluate(`(() => {
      const m = document.querySelector('[data-hero-marke]');
      return m ? Math.round(m.getBoundingClientRect().height) : 0;
    })()`);
    const [h1, h2] = [await mat(stor.page), await mat(liten.page)];
    assert.ok(h1 > 0 && h2 > 0, `märket mättes till ${h1} px respektive ${h2} px`);
    assert.ok(h2 < h1,
      `märket är ${h2} px i ett 760px-fönster och ${h1} px i ett 1200px — det krymper inte, så all `
      + 'höjd som behövs måste tas från något annat på sidan');
  } finally { await stor.context.close(); await liten.context.close() }
});

test('bilden star i mitten och inloggningsrutan ligger overst nar den oppnas', { skip, timeout: 60000 }, async () => {
  // Formen andrades 2026-08-21 (kortet till vanster, bilden i MITTEN) och igen 2026-11-22: kortet
  // flyttade ut ur hjalten till ett lager som Logga in oppnar. Kvar av det gamla kravet: bilden
  // centreras i VYN, och kortet far aldrig hamna under scenen — annars stjal en gava klicket fran
  // faltet. Det mats nu med en traff: mitt i det oppna kortets falt ska klicket landa i faltet.
  const { context, page } = await sidan({ width: 1440, height: 900 });
  try {
    const fore = await page.evaluate(`(() => {
      const scen = document.querySelector('.hero-mobil-scen');
      if (!scen) return { saknas: true };
      const s2 = scen.getBoundingClientRect();
      return { bildMitt: s2.left + s2.width / 2, vyMitt: innerWidth / 2 };
    })()`);
    assert.ok(!fore.saknas, 'scenen saknas');
    assert.ok(Math.abs(fore.bildMitt - fore.vyMitt) <= 8,
      `bilden har sin mitt pa ${Math.round(fore.bildMitt)} men vyns mitt ar ${Math.round(fore.vyMitt)}`);
    await page.evaluate(() => scrollTo(0, 0));
    await page.click('[data-konto-oppna="login"]');
    await page.waitForTimeout(400);
    const m = await page.evaluate(`(() => {
      const falt = document.querySelector('#loginEmail');
      const r = falt.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const traff = document.elementFromPoint(x, y);
      return { syns: r.width > 0 && r.height > 0 && y > 0 && y < innerHeight, traffFaltet: !!traff && (traff === falt || falt.contains(traff)) };
    })()`);
    assert.ok(m.syns, 'e-postfaltet syns inte i vyn nar rutan oppnats');
    assert.ok(m.traffFaltet, 'ett klick mitt i e-postfaltet landar pa nagot annat — rutan ligger under scenen');
  } finally { await context.close() }
});
