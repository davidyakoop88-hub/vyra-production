'use strict';
// VYRA TOP STREAK HAR EN AGARE: approved-rankings.js. Inga gamla designer kommer tillbaka.
//
// Den har filen vaktade forr en "Stil"-meny med fjorton designer (sju klassiska i media.js,
// sju premium i premium-final.js) och att menyn visade ratt design. Sedan #476 (db7b2bb) och
// #481 (approved-rankings) ar Top Streak EN design, Clean Flip, utan stilmeny - med flit,
// Davids beslut. Fem prov beskrev da en funktion som inte finns. De byttes inte for att bli
// grona: forst mattes det faktiska beteendet i Chromium 2026-09-20:
//
//   widget med streakTheme:'inferno' + streakFrame:'gold-wings'
//     klasser:      widget vyra-streak approved-streak      (ingen streak-inferno, ingen ram)
//     stilmeny:     #pfStreakStyle / #streakTheme finns inte
//     katalogen:    exakt ett Top Streak-val, "Clean Flip"
//     animation:    approved-streak-flip 8s infinite
//
// Samma dag togs premium-final.js:s doda generation bort (STREAKS, "simple"-renderaren,
// panelen och katalogsektionen) och top-streak-simple.css med den. media.js:s klassiska lager
// star kvar i kallan for att katalogregistrets prov raknar dess knappar - men det nar aldrig
// skarmen: approved-rankings.js tar bort sektionen och vinner wh(). Proven har laser att det
// forblir sa.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const kall = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test.afterEach(async () => { await new Promise(setImmediate); closeAll(); });

// Gamla nycklar som fortfarande kan ligga i sparade layouter. Alla ska ritas som Clean Flip.
const GAMLA = [
  { streakTheme: 'inferno' }, { streakTheme: 'storm' }, { streakTheme: 'sakura-rail' },
  { streakTheme: 'liquid' }, { streakTheme: 'thermo' },
  { streakFrame: 'gold-wings' }, { streakFrame: 'rose-heart' }, { streakFrame: 'crystal-tiara' }
];

function studio(widgets) {
  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout', state: { widgets, projectName: 'ts' } });
  h.load('overlay-sanitize.js');
  h.load('widget-factory.js');
  h.load('media.js');
  h.load('premium-final.js');
  h.load('approved-rankings.js');
  h.window.dispatchEvent(new h.window.Event('load'));
  return h;
}

test('varje gammal design- och ramnyckel ritas som Clean Flip - inte som den gamla designen', () => {
  const widgets = GAMLA.map((extra, i) => Object.assign(
    { id: 's' + i, type: 'templateTopStreak', x: 10, y: 10, width: 220, dataName: '@Test', dataValue: 18 }, extra));
  const h = studio(widgets);
  for (const w of widgets) {
    const html = h.window.wh(w);
    const nyckel = JSON.stringify(w.streakTheme || w.streakFrame);
    assert.match(html, /class="widget vyra-streak approved-streak/, `${nyckel}: ritas inte av approved-rankings`);
    assert.doesNotMatch(html, /streak-(inferno|neon|ice|royal|sakura-rail|cyber-grid|storm|liquid|momentum|tier|thread|chrono|chain|thermo|framed)\b/,
      `${nyckel}: den gamla designklassen dok upp igen`);
    assert.doesNotMatch(html, /vyra-streak-simple|premium-streak|sframe-art|streak-mechanism/,
      `${nyckel}: en dod generation ritar igen`);
    if (w.streakFrame) assert.ok(!html.includes(w.streakFrame), `${nyckel}: ramen nadde utdatan - ramarna ar avvecklade`);
  }
});

test('ingen stilmeny och inget ramval i panelen', () => {
  const w = { id: 's1', type: 'templateTopStreak', x: 10, y: 10, width: 220, streakTheme: 'inferno' };
  const h = studio([w]);
  // `selected` ar ett lexikalt let i studio.js - inte pa window. Satts via skript, som riggarna gor.
  const sc = h.document.createElement('script'); sc.textContent = "selected='s1'"; h.document.body.append(sc);
  const panel = h.window.props();
  assert.doesNotMatch(panel, /id="pfStreakStyle"|id="streakTheme"|data-streak-frame/, 'stilmenyn ar tillbaka');
  assert.match(panel, /CLEAN FLIP/, 'panelen ar inte approved-rankings:s');
});

test('bara EN kod ritar Top Streak - de doda generationerna ar borta ur kallan', () => {
  // Strukturhalvan. En renderare som ligger kvar men "aldrig vinner" ar precis det som lat tre
  // generationer stapla sig pa varandra i natt. Kallkoden far inte bara pa dem.
  const media = kall('media.js'), premium = kall('premium-final.js');
  // media.js:s klassiska lager (vyraStreak, STREAK_FRAMES, tema-/ramkatalogen) star KVAR i kallan:
  // katalogregistrets prov raknar dess knappar och nycklar. Det nar aldrig skarmen - approved-
  // rankings.js tar bort sektionen och vinner wh() - och det ar det forsta provet har som laser.
  assert.doesNotMatch(premium, /VyraStreakPremium|vyraStreak=function|data-pf-streak|vyra-streak-simple|pfStreakStyle/, 'premium-final.js bar premium-/simple-generationen igen');
  assert.ok(!fs.existsSync(path.join(ROOT, 'top-streak-simple.css')), 'top-streak-simple.css ar tillbaka - den stilar en klass ingen ritar');
  assert.match(kall('approved-rankings.js'), /approved-streak/, 'agaren saknas');
});

test('Clean Flip loopar under hela sandningen', () => {
  // Panelen lovar "Flippen fortsatter under hela LIVE-sandningen". CSS:en ska halla det:
  // infinite, aldrig ett andligt antal iterationer.
  const css = kall('approved-rankings.css');
  const regel = css.match(/\.approved-streak \.streak-flip\s*\{[^}]*\}/);
  assert.ok(regel, 'flipp-regeln saknas');
  assert.match(regel[0], /approved-streak-flip[^;]*infinite/, 'flippen ar inte infinite');
});
