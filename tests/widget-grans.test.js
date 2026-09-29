'use strict';
// DUKENS GRÄNS — räknesättet.
//
// SEDAN 2026-09-26 AR REGELN FRI PLACERING MED EN SYNLIG DEL. Davids ord: "om jag vill gora den
// stor widget och lite hamnar utanfor den ska inte vara problem, men att man stoppar widget
// flytta vart man vill ar problem". En widget far dras delvis utanfor och goras storre an duken;
// det enda som stoppas ar att den FORSVINNER - minst MIN_SYNLIG px (eller hela, om den ar mindre)
// ligger alltid kvar pa duken i bada leder. Top Like pa x=688 i en 432-duk (2026-09-19) hade
// inte gatt att dra dit.
//
// Fore det (2026-09-20 till 09-26) kravdes FULL INNESLUTNING, och den stoppade widgetar vid
// kanten. Origo-regeln (8 px kvar) ar fortfarande reserven nar storleken ar okand.
//
// Provet för dragningen och markeringen ligger i tests/browser/widget-grans.browser.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../widget-grans.js');

const MOBIL = { bredd: 432, hojd: 768 };
const DATOR = { bredd: 768, hojd: 432 };
const S = G.MIN_SYNLIG;
const TOPLIKE = { bredd: 220, hojd: 388 };

test('ett läge inne på duken lämnas orört', () => {
  assert.deepEqual(G.klamp(72, 144, MOBIL, TOPLIKE), { vanster: 72, topp: 144 });
});

test('delvis utanför är tillåtet - åt alla fyra hållen', () => {
  // Davids Top Gift stod på x=-16 den 2026-09-19: det är nu ett giltigt läge, inte ett fel.
  assert.deepEqual(G.klamp(-16, 376, MOBIL, TOPLIKE), { vanster: -16, topp: 376 });
  assert.equal(G.klamp(300, 40, MOBIL, TOPLIKE).vanster, 300, 'ut till höger');
  assert.equal(G.klamp(40, -100, MOBIL, TOPLIKE).topp, -100, 'ut upptill');
  assert.equal(G.klamp(40, 600, MOBIL, TOPLIKE).topp, 600, 'ut nedtill');
});

test('men widgeten kan inte försvinna: MIN_SYNLIG px ligger alltid kvar', () => {
  // Davids Top Like stod på x=688 i en duk som är 432 bred - helt borta.
  assert.equal(G.klamp(688, 200, MOBIL, TOPLIKE).vanster, 432 - S);
  assert.equal(G.klamp(-9999, 200, MOBIL, TOPLIKE).vanster, -(220 - S));
  assert.equal(G.klamp(40, 9999, MOBIL, TOPLIKE).topp, 768 - S);
  assert.equal(G.klamp(40, -9999, MOBIL, TOPLIKE).topp, -(388 - S));
  // Battle MVP stod på y=768 i bandet från sändningen — exakt på kanten, alltså helt utanför.
  assert.equal(G.klamp(16, 768, MOBIL, { bredd: 400, hojd: 400 }).topp, 768 - S);
});

test('en widget större än duken får ett fritt läge i stället för att tvingas till 0', () => {
  // Förr gick origo till 0 och widgeten gick inte att dra i den ledden alls.
  const fw = { bredd: 540, hojd: 450 };
  assert.equal(G.klamp(-50, 0, MOBIL, fw).vanster, -50);
  assert.equal(G.klamp(100, 0, MOBIL, fw).vanster, 100);
  assert.equal(G.klamp(0, 500, MOBIL, { bredd: 200, hojd: 900 }).topp, 500);
});

test('en widget mindre än MIN_SYNLIG måste synas helt', () => {
  const liten = { bredd: 30, hojd: 20 };
  assert.deepEqual(G.klamp(-99, -99, MOBIL, liten), { vanster: 0, topp: 0 });
  assert.deepEqual(G.klamp(999, 999, MOBIL, liten), { vanster: 432 - 30, topp: 768 - 20 });
});

test('gränsen följer formatet i stället för en hårdkodad siffra', () => {
  const st = { bredd: 150, hojd: 100 };
  assert.equal(G.klamp(9999, 10, DATOR, st).vanster, 768 - S);
  assert.equal(G.klamp(9999, 10, MOBIL, st).vanster, 432 - S);
});

test('okänd storlek: origo-reserven, en rutnätsruta kvar', () => {
  assert.equal(G.klamp(688, 200, MOBIL).vanster, 432 - G.MIN_KVAR);
  assert.equal(G.klamp(-16, 200, MOBIL).vanster, 0);
});

test('ogiltiga tal blir 0 i stället för NaN i layouten', () => {
  // parseInt('') ger NaN, och ett NaN i layouten gör widgeten oplacerbar för alltid.
  assert.deepEqual(G.klamp(NaN, undefined, MOBIL), { vanster: 0, topp: 0 });
  assert.deepEqual(G.klamp(NaN, undefined, MOBIL, TOPLIKE), { vanster: 0, topp: 0 });
});

test('kant mot kant är tillåtet', () => {
  const k = G.klamp(200, 280, MOBIL, { bredd: 180, hojd: 260 });
  assert.deepEqual(k, { vanster: 200, topp: 280 });
});

test('stickerUt() ser alla fyra hållen - den används för nyskapade widgetar', () => {
  assert.equal(G.stickerUt(72, 144, 220, 388, MOBIL), false, 'helt inne');
  assert.equal(G.stickerUt(-16, 144, 220, 388, MOBIL), true, 'ut till vanster');
  assert.equal(G.stickerUt(72, -4, 220, 388, MOBIL), true, 'ut upptill');
  assert.equal(G.stickerUt(300, 144, 220, 388, MOBIL), true, 'ut till hoger');
  assert.equal(G.stickerUt(72, 600, 220, 388, MOBIL), true, 'ut nedtill');
});

test('forsvunnen() markerar bara det som inte går att se - inte det som sticker ut lite', () => {
  assert.equal(G.forsvunnen(72, 144, 220, 388, MOBIL), false, 'helt inne');
  assert.equal(G.forsvunnen(300, 144, 220, 388, MOBIL), false, '132 px syns - ett val, inte ett fel');
  assert.equal(G.forsvunnen(-100, -200, 540, 450, MOBIL), false, 'större än duken, mitt i');
  assert.equal(G.forsvunnen(688, 200, 220, 388, MOBIL), true, 'Top Like på x=688: borta');
  assert.equal(G.forsvunnen(16, 768, 400, 400, MOBIL), true, 'Battle MVP på y=768: borta');
  assert.equal(G.forsvunnen(432 - 20, 100, 220, 388, MOBIL), true, 'bara 20 px kvar: för lite');
});

test('klampen och markeringen är ense: det klampen släpper igenom är aldrig försvunnet', () => {
  for (const [x, y] of [[688, 200], [-9999, 376], [16, 9999], [300, -9999], [9999, 9999]]) {
    for (const st of [TOPLIKE, { bredd: 540, hojd: 450 }, { bredd: 30, hojd: 20 }]) {
      const k = G.klamp(x, y, MOBIL, st);
      assert.equal(G.forsvunnen(k.vanster, k.topp, st.bredd, st.hojd, MOBIL), false,
        `${x},${y} ${st.bredd}x${st.hojd} -> ${k.vanster},${k.topp}`);
    }
  }
});

test('utan DOM faller duken tillbaka på mobilformatet i stället för att krascha', () => {
  // duken() anropas mitt i ett drag och far aldrig kasta.
  assert.deepEqual(G.duken(), { bredd: 432, hojd: 768 });
});

// ---- WIDGETENS EGEN NEDSKALNING --------------------------------------------------------
// UPPMATT 2026-09-21: Top Gift hade offsetWidth 340 men syntes 119 px bred (`zoom:0.35`).
// `x` och `width` lever i widgetens egna oskalade rum, sa duken - och den synliga delen -
// uttrycks i samma rum innan jamforelsen.
test('duken uttryckt i widgetens eget rum vaxer nar widgeten ar nedskalad', () => {
  assert.deepEqual(G.dukIWidgetens(MOBIL, 0.35), { bredd: 432 / 0.35, hojd: 768 / 0.35 });
  assert.deepEqual(G.dukIWidgetens(MOBIL, 1), MOBIL, 'oskalad widget raknar precis som forut');
});

test('en saknad eller orimlig skala behandlas som 1 i stallet for att ge NaN', () => {
  for (const trasig of [undefined, null, NaN, 0, -1, Infinity]) {
    assert.deepEqual(G.dukIWidgetens(MOBIL, trasig), MOBIL, String(trasig));
  }
});

test('en nedskalad widget behåller lika många SYNLIGA pixlar på duken', () => {
  // Synlig del i widgetens rum = MIN_SYNLIG / skala. Längst till höger ska den synliga
  // vänsterkanten då ligga MIN_SYNLIG skärmpixlar från dukens högerkant.
  const skala = 0.35, duk = G.dukIWidgetens(MOBIL, skala);
  const max = G.klamp(99999, 0, duk, { bredd: 340, hojd: 260 }, S / skala).vanster;
  assert.equal(Math.round(max * skala), 432 - S);
  assert.equal(G.forsvunnen(max, 0, 340, 260, duk, S / skala), false);
  assert.equal(G.forsvunnen(max + 10 / skala, 0, 340, 260, duk, S / skala), true, 'ett steg till och den är borta');
});
