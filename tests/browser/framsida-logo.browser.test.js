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

test('märket trycker inte ner prisraden under vecket i en 900px-vy',
  { skip, timeout: 60000 }, async () => {
  const { context, page } = await sidan({ width: 1440, height: 900 });
  try {
    const m = await page.evaluate(`(() => {
      const rad = document.querySelector('.hero-prisrad');
      const marke = document.querySelector('[data-hero-marke]');
      if (!rad) return { saknas: true };
      const r = rad.getBoundingClientRect();
      const mr = marke ? marke.getBoundingClientRect() : null;
      return {
        topp: Math.round(r.top), botten: Math.round(r.bottom), vy: innerHeight,
        markeshojd: mr ? Math.round(mr.height) : 0,
      };
    })()`);

    assert.ok(!m.saknas, '.hero-prisrad saknas');
    assert.ok(m.botten <= m.vy,
      `prisraden slutar på y=${m.botten} i en ${m.vy}px-vy — den ligger under vecket. Märket är `
      + `${m.markeshojd} px högt; antingen krymper det i @media (max-height:1000px) eller så måste `
      + 'annan höjd ge vika. Raden är sidans löfte om tre gratisdagar och får inte kräva rullning.');
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

test('kortet star till vanster och bilden i mitten', { skip, timeout: 60000 }, async () => {
  // Formen andrades TVA ganger 2026-08-21 och provet foljer med, annars vaktar det ett beslut som
  // inte galler: forst ett centrerat kort med mobilen bakom (efter en referens David visade), och
  // sedan hans omval — glaset kvar, men kortet till VANSTER och bilden synlig i MITTEN.
  //
  // Bilden centreras i VYN, inte i "det som blir over". Lag kortet i floden hamnade mobilen 200 px
  // hoger om mitten (uppmatt: x=804 i en 1440-vy), for den centrerades i ytan bredvid kortet.
  // Kortet ar darfor lyft ur floden pa breda fonster.
  const { context, page } = await sidan({ width: 1440, height: 900 });
  try {
    const m = await page.evaluate(`(() => {
      const kort = document.querySelector('.login-kort');
      const scen = document.querySelector('.hero-mobil-scen');
      if (!kort || !scen) return { saknas: true };
      const k = kort.getBoundingClientRect(), s2 = scen.getBoundingClientRect();
      return {
        kortMitt: k.left + k.width / 2,
        bildMitt: s2.left + s2.width / 2,
        vyMitt: innerWidth / 2,
        overlapp: k.right > s2.left,
        kortZ: Number(getComputedStyle(kort).zIndex) || 0,
        scenZ: Number(getComputedStyle(scen).zIndex) || 0
      };
    })()`);
    assert.ok(!m.saknas, 'kortet eller scenen saknas');
    assert.ok(m.kortMitt < m.vyMitt - 100,
      `kortet star pa ${Math.round(m.kortMitt)} i en ${Math.round(m.vyMitt * 2)} px vy — det ska `
      + 'ligga tydligt till vanster');
    assert.ok(Math.abs(m.bildMitt - m.vyMitt) <= 8,
      `bilden har sin mitt pa ${Math.round(m.bildMitt)} men vyns mitt ar ${Math.round(m.vyMitt)} — `
      + 'den ska centreras i VYN, inte i ytan som blir over bredvid kortet');
    assert.equal(m.overlapp, false,
      'kortet lapper over bilden; pa breda fonster ska de sta bredvid varandra utan att krocka');
    assert.ok(m.kortZ >= m.scenZ,
      `kortet (z=${m.kortZ}) ligger under scenen (z=${m.scenZ}) — pa smalare fonster gar kortet `
      + 'tillbaka i floden och maste anda ligga overst, annars stjal en gava klicket fran faltet');
  } finally { await context.close() }
});
