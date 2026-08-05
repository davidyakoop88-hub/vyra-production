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

const TOPGIFT = ['royal', 'neon', 'cyber', 'glass', 'sakura', 'fire', 'ice', 'galaxy', 'aurora',
  'retro', 'goldrush', 'hall', 'throne', 'champion', 'pedestal', 'arch', 'phoenix', 'signal',
  'fireworks', 'bloom', 'comet'];
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
  for (const n of ['catalog:topgift:royal', 'catalog:topgift:neon', 'catalog:topgift:cyber',
    'catalog:topgift:glass', 'catalog:topstreak:inferno', 'catalog:topstreak:royal',
    'catalog:topstreak:storm']) {
    try { const w = VyraWidgets.create(n); if (!w.type) fel.push(n + ': ingen typ') }
    catch (e) { fel.push(n + ': ' + e.message) }
  }
  assert.deepEqual(fel, [], fel.join('\n  '));
});

test('premiumnyckeln och den gamla temanyckeln ar INTE samma widget', () => {
  // topgift:royal och topgift:premium:royal delar namn men har olika defaults - bredd 280 mot 340.
  // Skulle de ge samma sak vore den ena familjen overflodig, och da ar det battre att veta det.
  const gammal = utanId(VyraWidgets.create('catalog:topgift:royal'));
  const premium = utanId(VyraWidgets.create('catalog:topgift:premium:royal'));

  assert.notDeepEqual(gammal, premium,
    'de tva familjerna bygger samma widget — da behovs bara en av dem');
});
