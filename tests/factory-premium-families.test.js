'use strict';
// Sista luckan i katalogen: Top Streaks sju premiumdesigner och Top Gifters tjugoen byggde sina
// widgets med handknackade objekt i premium-final.js i stallet for ur widget-factory.
//
// Uppmatt: 7 av 7 respektive 21 av 36 knappar utan katalognyckel. En knapp utan nyckel gar varken
// att mata, forhandsvisa eller aterskapa - previewen i overlay-preview.js bygger sin miniatyr ur
// nyckeln, katalogtestet raknar unika widgets ur nyckeln, och en sparad layout identifierar sin
// variant med createdFrom.
//
// Fabriken hade redan familjerna topgift.theme och topstreak.theme, men deras tabeller kande bara
// till fyra respektive noll av premiumnamnen - och deras defaults ar andra (bredd 280 mot 340).
// Premiumdesignerna far darfor egna familjer i stallet for att tryckas in i de befintliga.
//
// Kravet som gor andringen ofarlig: en widget ur fabriken maste bli EXAKT det knappen byggde
// forut, falt for falt. Annars byter varje befintlig anvandare utseende nasta gang de lagger till
// en design.
//
// ROTT NU.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));

// Tva kvar sedan 2026-09-23 (David: "behall neon, royal o ta bort resten"). Listan star kvar som
// literal — den ar provets FACIT mot fabriken, och ett facit som laser ur det den provar bevisar
// ingenting. Faller provet for att fabriken andrats ska listan andras medvetet, inte automatiskt.
const TOPGIFT = ['royal', 'neon'];
const STREAK = { liquid: '#d9a441', momentum: '#d8dee9', tier: '#c68cff', thread: '#e7bc63',
  chrono: '#9db7d0', chain: '#d2d5da', thermo: '#ff8a36' };

// Exakt vad knapparna i premium-final.js byggde innan den har andringen.
const gammalTopGift = theme => ({ type: 'templateTopGift', theme, x: 70, y: 140, width: 340,
  title: 'Top Gifter', templateTitle: 'TOP GIFTER', dataName: '@StreamQueen', dataValue: '44 999',
  accent: '#d9a441', giftSize: 110, dataSize: 20, topGiftFlipSpeed: 1, topGiftGlow: 55 });
const gammalStreak = (streakTheme, accent) => ({ type: 'templateTopStreak', streakTheme, x: 65,
  y: 170, width: 520, title: 'Top Streak', templateTitle: 'TOP STREAK', dataName: '@StreamQueen',
  dataValue: 18, accent, giftSize: 64, streakSpeed: 1, streakGlow: 50 });

const utanId = w => { const k = { ...w }; delete k.id; delete k.createdFrom; return k };

// ---- nycklarna finns ----------------------------------------------------------------------------
test('varje Top Gifter-premiumdesign gar att skapa ur en nyckel', () => {
  const fel = [];
  for (const t of TOPGIFT) {
    try { VyraWidgets.create('catalog:topgift:premium:' + t) } catch (e) { fel.push(t + ': ' + e.message) }
  }
  assert.deepEqual(fel, [], 'dessa loser inte upp:\n  ' + fel.join('\n  '));
});

test('varje Top Streak-premiumdesign gar att skapa ur en nyckel', () => {
  const fel = [];
  for (const t of Object.keys(STREAK)) {
    try { VyraWidgets.create('catalog:topstreak:premium:' + t) } catch (e) { fel.push(t + ': ' + e.message) }
  }
  assert.deepEqual(fel, [], 'dessa loser inte upp:\n  ' + fel.join('\n  '));
});

// ---- och ger EXAKT samma widget som forut --------------------------------------------------------
test('Top Gifter-widgeten ur fabriken ar identisk med den knappen byggde', () => {
  const avvikande = [];
  for (const t of TOPGIFT) {
    const fran = utanId(VyraWidgets.create('catalog:topgift:premium:' + t));
    const till = gammalTopGift(t);
    try { assert.deepEqual(fran, till) } catch (e) { avvikande.push(t) }
  }
  assert.deepEqual(avvikande, [],
    `dessa skiljer sig fran vad knappen byggde forut: ${avvikande.join(', ')} — ` +
    'befintliga anvandare skulle da fa ett annat utseende');
});

test('Top Streak-widgeten ur fabriken ar identisk med den knappen byggde', () => {
  const avvikande = [];
  for (const [t, accent] of Object.entries(STREAK)) {
    const fran = utanId(VyraWidgets.create('catalog:topstreak:premium:' + t));
    try { assert.deepEqual(fran, gammalStreak(t, accent)) } catch (e) { avvikande.push(t) }
  }
  assert.deepEqual(avvikande, [], `dessa skiljer sig: ${avvikande.join(', ')}`);
});

// ---- en felstavning far inte tyst bli en annan design ---------------------------------------------
test('en okand premiumdesign kastar i stallet for att bygga nagot tomt', () => {
  // Samma kontrakt som resten av fabriken: pick() kastar hellre an bygger en widget utan accent,
  // for det ser ut som ett renderingsfel i stallet for ett stavfel i en nyckel.
  assert.throws(() => VyraWidgets.create('catalog:topgift:premium:finnsinte'), /Okänd/);
  assert.throws(() => VyraWidgets.create('catalog:topstreak:premium:finnsinte'), /Okänd/);
});

// ---- de gamla nycklarna far inte ga sonder ---------------------------------------------------------
test('de befintliga tema- och ramnycklarna fungerar som forut', () => {
  const fel = [];
  // cyber och glass togs ur listan 2026-09-23: de pensionerades med de nitton andra, och en nyckel
  // utan tvillingdesign kastar numera — med flit. Kvar star de tva som lever plus Top Streaks.
  for (const n of ['catalog:topgift:royal', 'catalog:topgift:neon',
    'catalog:topstreak:inferno', 'catalog:topstreak:royal', 'catalog:topstreak:storm']) {
    try { const w = VyraWidgets.create(n); if (!w.type) fel.push(n + ': ingen typ') }
    catch (e) { fel.push(n + ': ' + e.message) }
  }
  assert.deepEqual(fel, [], fel.join('\n  '));
});

// 'premiumnyckeln och den gamla temanyckeln ar INTE samma widget' — provet gjorde sitt jobb, och
// svaret blev ja.
//
// Det stod dar for att svara pa en fraga: "Skulle de ge samma sak vore den ena familjen
// overflodig, och da ar det battre att veta det." Widgetarna skilde sig i FORVALDA MATT (bredd 280
// mot 340, egen accent, egen rubriktext) men inte i `theme` — och det ar `theme` som avgor skinnet:
// premium-final.js ritar `topgift-${w.theme||'royal'}`. Katalogen visade alltsa samma design tva
// ganger med olika standardbredd.
//
// 2026-09-23 pensionerades topgift.theme och topgift.extra av just det skalet. Den gamla nyckeln
// pekar nu pa sin tvilling, sa provet kan inte langre falla — och ett prov som inte kan falla
// vaktar ingenting. Provet under ('de befintliga tema- och ramnycklarna fungerar som forut') mater
// att omdirigeringen haller.
test('den gamla temanyckeln pekar pa sin premiumtvilling', () => {
  const gammal = VyraWidgets.create('catalog:topgift:royal');
  const premium = VyraWidgets.create('catalog:topgift:premium:royal');
  assert.equal(gammal.theme, premium.theme, 'omdirigeringen ger inte samma skinn');
  assert.equal(gammal.width, premium.width, 'omdirigeringen ger inte premiumdesignens matt');
  assert.equal(gammal.createdFrom, 'catalog:topgift:royal',
    'createdFrom ska bevara den nyckel anroparen faktiskt anvande');
});
