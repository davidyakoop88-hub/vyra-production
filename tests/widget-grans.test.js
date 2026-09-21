'use strict';
// DUKENS GRÄNS — räknesättet.
//
// SEDAN 2026-09-20 AR REGELN FULL INNESLUTNING: hela widgetens box ska rymmas pa duken.
// Davids ord: "den ytan man lagger widget den ska man se". Gift Fireworks lag pa 540 px bredd
// i hans 432 px ruta - synlig i editorn, avklippt i sandningen. Origo-regeln (8 px kvar) ar
// bara reserven nar anroparen inte kanner widgetens storlek (storlek utelamnad), och nar
// widgeten ar STORRE an duken gar origo till 0 - da far bredden krympas (flyttaInAlla, eller
// resize-klampen i widget-handles.js).
// Kant-mot-kant-snappen (snapp.browser.test.js prov 4) provas numera med widgetar sma nog att
// bada ryms.
//
// Provet för dragningen och markeringen ligger i tests/browser/widget-grans.browser.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../widget-grans.js');

const MOBIL = { bredd: 432, hojd: 768 };
const DATOR = { bredd: 768, hojd: 432 };

test('ett läge inne på duken lämnas orört', () => {
  assert.deepEqual(G.klamp(72, 144, MOBIL), { vanster: 72, topp: 144 });
});

test('negativt x dras in till kanten', () => {
  // Davids Top Gift stod på x=-16 den 2026-09-19.
  assert.equal(G.klamp(-16, 376, MOBIL).vanster, 0);
});

test('x långt bortom högerkanten stannar sa att HELA widgeten ryms', () => {
  // Davids Top Like stod på x=688 i en duk som är 432 bred. Med storleken kand klamps till
  // duk minus bredd; utan storlek galler origo-reserven (en rutnatsruta kvar).
  assert.equal(G.klamp(688, 200, MOBIL, { bredd: 220, hojd: 388 }).vanster, 432 - 220);
  assert.equal(G.klamp(688, 200, MOBIL).vanster, 432 - G.MIN_KVAR, 'reserven utan storlek');
});

test('en widget bredare an duken hamnar pa 0 - inte pa ett negativt tal', () => {
  // Gift Fireworks 540 och Glove Snipe 760 i Davids layout 2643. 432-540 < 0 far aldrig
  // bli ett lage; origo gar till 0 och bredden ar flyttaInAllas sak.
  assert.equal(G.klamp(100, 0, MOBIL, { bredd: 540, hojd: 450 }).vanster, 0);
  assert.equal(G.klamp(0, 500, MOBIL, { bredd: 200, hojd: 900 }).topp, 0);
});

test('y på nederkanten stannar sa att hela hojden ryms', () => {
  // Battle MVP stod på y=768 i bandet från sändningen — exakt på kanten, alltså helt utanför.
  assert.equal(G.klamp(16, 768, MOBIL, { bredd: 400, hojd: 400 }).topp, 768 - 400);
});

test('gränsen följer formatet i stället för en hårdkodad siffra', () => {
  const S = { bredd: 150, hojd: 100 };
  assert.equal(G.klamp(600, 10, DATOR, S).vanster, 600, 'ryms i en 768 bred duk');
  assert.equal(G.klamp(600, 10, MOBIL, S).vanster, 432 - 150, 'ryms inte i en 432 bred duk');
});

test('ogiltiga tal blir 0 i stället för NaN i layouten', () => {
  // parseInt('') ger NaN, och ett NaN i layouten gör widgeten oplacerbar för alltid.
  assert.deepEqual(G.klamp(NaN, undefined, MOBIL), { vanster: 0, topp: 0 });
});

test('kant mot kant är tillåtet nar bada ryms', () => {
  // snapp.browser.test.js prov 4 med 180 x 260-widgetar: m1 pa (20,20), d1 landar pa
  // (200,280) - hogerkant 380, nederkant 540, allt inne. Klampen ror det inte.
  const k = G.klamp(200, 280, MOBIL, { bredd: 180, hojd: 260 });
  assert.deepEqual(k, { vanster: 200, topp: 280 });
});

test('stickerUt() ser alla fyra hållen', () => {
  assert.equal(G.stickerUt(72, 144, 220, 388, MOBIL), false, 'helt inne');
  assert.equal(G.stickerUt(-16, 144, 220, 388, MOBIL), true, 'ut till vanster');
  assert.equal(G.stickerUt(72, -4, 220, 388, MOBIL), true, 'ut upptill');
  assert.equal(G.stickerUt(300, 144, 220, 388, MOBIL), true, 'ut till hoger');
  assert.equal(G.stickerUt(72, 600, 220, 388, MOBIL), true, 'ut nedtill');
});

test('klampen och markeringen ar ense: det klampen slapper igenom sticker inte ut', () => {
  // Sedan inneslutningen ar de lika starka - med flit. Ett lage som passerar klampen med
  // kand storlek far aldrig flaggas av markeringen, annars ljuger banderollen.
  for (const [x, y] of [[688, 200], [-16, 376], [16, 768], [300, 600]]) {
    const k = G.klamp(x, y, MOBIL, { bredd: 220, hojd: 388 });
    assert.equal(G.stickerUt(k.vanster, k.topp, 220, 388, MOBIL), false, x + ',' + y + ' -> ' + k.vanster + ',' + k.topp);
  }
});

test('utan DOM faller duken tillbaka på mobilformatet i stället för att krascha', () => {
  // duken() anropas mitt i ett drag och far aldrig kasta.
  assert.deepEqual(G.duken(), { bredd: 432, hojd: 768 });
});

// ---- WIDGETENS EGEN NEDSKALNING --------------------------------------------------------
// UPPMATT 2026-09-21 i Davids layout, i riktig Chrome: Top Gift hade offsetWidth 340 men
// syntes bara 119 px bred, for widgeten bar `zoom:0.35` som inline-stil. Inneslutningen
// reserverade 340 och slappte darfor aldrig widgeten forbi x=92 i en 432 bred duk, trots att
// den hade fatt plats anda till 313. Top Likes stoppades vid 50, Top Streak vid 212.
//
// Ratt rakning ar ett KOORDINATBYTE: `x` och `width` lever i widgetens egna oskalade rum, sa
// duken uttrycks i samma rum innan jamforelsen. Regeln "hela widgeten ska synas" ar oforandrad.
test('duken uttryckt i widgetens eget rum vaxer nar widgeten ar nedskalad', () => {
  assert.deepEqual(G.dukIWidgetens(MOBIL, 0.35), { bredd: 432 / 0.35, hojd: 768 / 0.35 });
  assert.deepEqual(G.dukIWidgetens(MOBIL, 1), MOBIL, 'oskalad widget raknar precis som forut');
});

test('en saknad eller orimlig skala behandlas som 1 i stallet for att ge NaN', () => {
  // getComputedStyle().zoom svarar 'normal' i en webblasare utan stod, och parseFloat ger NaN.
  // Ett NaN har hade gjort varje lage oplacerbart.
  for (const trasig of [undefined, null, NaN, 0, -1, Infinity]) {
    assert.deepEqual(G.dukIWidgetens(MOBIL, trasig), MOBIL, String(trasig));
  }
});

test('KARNFALLET: en widget med zoom 0.35 nar anda ut till hogerkanten', () => {
  // Top Gift: offsetWidth 340, zoom 0.35 => syns 119 av 432. Hogsta tillatna x ska vara det
  // som lagger den SYNLIGA hogerkanten pa dukens kant: (432 - 119) / 0.35 = 894.
  const duk = G.dukIWidgetens(MOBIL, 0.35);
  const max = G.klamp(99999, 0, duk, { bredd: 340, hojd: 260 }).vanster;
  assert.equal(Math.round(max), Math.round((432 - 340 * 0.35) / 0.35));
  // Och det motsvarar en synlig hogerkant precis pa 432 — varken innanfor eller utanfor.
  assert.equal(Math.round(max * 0.35 + 340 * 0.35), 432);
  // Gamla berakningen stannade pa 92 och lamnade 281 px oanvanda.
  assert.ok(max > 92, 'klampen slapper fortfarande inte forbi den gamla gransen: ' + max);
});

test('regeln ar inte losare: en nedskalad widget far anda inte sticka ut', () => {
  const duk = G.dukIWidgetens(MOBIL, 0.35);
  const max = G.klamp(99999, 99999, duk, { bredd: 340, hojd: 260 });
  assert.equal(G.stickerUt(max.vanster, max.topp, 340, 260, duk), false, 'hogsta laget ryms');
  // Ett steg utanfor det klampade laget sticker ut — gransen finns kvar, den ligger bara ratt.
  assert.equal(G.stickerUt(max.vanster + 1, max.topp, 340, 260, duk), true);
  assert.equal(G.stickerUt(max.vanster, max.topp + 1, 340, 260, duk), true);
});
