'use strict';
// DUKENS GRÄNS — räknesättet.
//
// Regeln är INTE full inneslutning. Widgetarna renderar 220 × 388 oavsett `width`, så två av
// dem får inte plats sida vid sida i en 432 bred duk — och kant-mot-kant-snappen
// (snapp.browser.test.js prov 4) är byggd med flit. Inneslutning hade tagit bort den
// funktionen. Regeln är i stället: origo måste ligga kvar på duken med minst en rutnätsruta
// (8 px) kvar, så att en widget aldrig kan dras bort ur bilden.
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

test('x långt bortom högerkanten stannar med en rutnätsruta kvar på duken', () => {
  // Davids Top Like stod på x=688 i en duk som är 432 bred.
  assert.equal(G.klamp(688, 200, MOBIL).vanster, 432 - G.MIN_KVAR);
});

test('y på nederkanten stannar med en rutnätsruta kvar', () => {
  // Battle MVP stod på y=768 i bandet från sändningen — exakt på kanten, alltså helt utanför.
  assert.equal(G.klamp(16, 768, MOBIL).topp, 768 - G.MIN_KVAR);
});

test('gränsen följer formatet i stället för en hårdkodad siffra', () => {
  assert.equal(G.klamp(600, 10, DATOR).vanster, 600, 'ryms i en 768 bred duk');
  assert.equal(G.klamp(600, 10, MOBIL).vanster, 432 - G.MIN_KVAR, 'ryms inte i en 432 bred duk');
});

test('ogiltiga tal blir 0 i stället för NaN i layouten', () => {
  // parseInt('') ger NaN, och ett NaN i layouten gör widgeten oplacerbar för alltid.
  assert.deepEqual(G.klamp(NaN, undefined, MOBIL), { vanster: 0, topp: 0 });
});

test('kant mot kant är fortfarande tillåtet — snappen får inte brytas', () => {
  // snapp.browser.test.js prov 4: d1 dras sa dess vansterkant landar pa m1:s hogerkant,
  // 203 + 220 = 423 i en 432 bred duk. Klamps det bort faller det provet.
  assert.equal(G.klamp(423, 535, MOBIL).vanster, 423);
  assert.equal(G.klamp(423, 535, MOBIL).topp, 535);
});

test('stickerUt() ser alla fyra hållen', () => {
  assert.equal(G.stickerUt(72, 144, 220, 388, MOBIL), false, 'helt inne');
  assert.equal(G.stickerUt(-16, 144, 220, 388, MOBIL), true, 'ut till vanster');
  assert.equal(G.stickerUt(72, -4, 220, 388, MOBIL), true, 'ut upptill');
  assert.equal(G.stickerUt(300, 144, 220, 388, MOBIL), true, 'ut till hoger');
  assert.equal(G.stickerUt(72, 600, 220, 388, MOBIL), true, 'ut nedtill');
});

test('stickerUt() flaggar det kant-mot-kant-läge som klampen släpper igenom', () => {
  // Gransen och markeringen ar OLIKA starka med flit: gransen slapper igenom laget,
  // markeringen sager att det inte kommer synas. Utan det har provet kunde nagon gora dem
  // lika starka och tro att det var en forenkling.
  assert.equal(G.klamp(423, 535, MOBIL).vanster, 423, 'gransen slapper igenom');
  assert.equal(G.stickerUt(423, 535, 220, 388, MOBIL), true, 'markeringen sager ifran');
});

test('utan DOM faller duken tillbaka på mobilformatet i stället för att krascha', () => {
  // duken() anropas mitt i ett drag och far aldrig kasta.
  assert.deepEqual(G.duken(), { bredd: 432, hojd: 768 });
});
