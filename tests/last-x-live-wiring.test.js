'use strict';
// Last-X Alerts ÄR kopplad till live. Det här testet låser fast kedjan.
//
// docs/live-readiness-matrix.md klassar Last-X som preview-only med motiveringen att
// window.triggerLastXAlert saknar anropare. Den sökningen letade efter fel namn. Den riktiga vägen
// går inte via triggerLastXAlert alls:
//
//   live-client.js:130   ingest() anropar routeLiveBattleEvent(e) för VARJE live-event
//   last-x-alerts.js:385 last-x-alerts.js skriver om den globala routeLiveBattleEvent och lägger
//                        till showLastX() för gift / like / share / subscribe
//
// Alla fyra är riktiga ingest-typer. Att dölja Last-X ur katalogen hade alltså tagit bort en
// fungerande widgetfamilj. Testet finns för att nästa läsning av matrisen inte ska dra om samma
// felaktiga slutsats.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');

test.after(closeAll);

function lastXWidget(id = 'lx1') {
  return { id, type: 'templateLastX', x: 10, y: 20, width: 500, title: 'Last-X Alerts',
    lastXType: 'all', lastXDesign: 'card', lastXEntrance: 'slide-left', followDuration: 5 };
}

function boot() {
  const widget = lastXWidget();
  const h = createDom({ state: { widgets: [widget], projectName: 'test' } });
  // overlay-sanitize.js definierar VyraSafe, som Last-X-renderaren använder. Utan den kastar wh().
  h.load('overlay-sanitize.js');
  h.load('last-x-alerts.js');
  const canvas = h.paint([widget]);
  // media.js laddar om state efter harnessens injektion, så widgeten måste tillbaka in EFTER det.
  // showLastX() filtrerar på state.widgets; är den tom händer ingenting och testet blir grönt av
  // fel skäl. Skriptet körs på sidan eftersom `state` är en lexikal const, inte window.state.
  const script = h.document.createElement('script');
  script.textContent = `state.widgets.length=0;state.widgets.push(${JSON.stringify(widget)})`;
  h.document.body.append(script);
  return { h, widget, canvas, box: canvas.querySelector('[data-id="lx1"]') };
}

test('last-x-alerts.js skriver om routeLiveBattleEvent', () => {
  const before = createDom({ state: { widgets: [], projectName: 't' } });
  const original = before.window.routeLiveBattleEvent;
  assert.equal(typeof original, 'function', 'media.js ska definiera routeLiveBattleEvent');
  before.load('last-x-alerts.js');
  assert.notEqual(before.window.routeLiveBattleEvent, original,
    'omskrivningen uteblev — då når inga live-events Last-X');
});

const nameIn = box => box.querySelector('.last-x-name')?.textContent;

test('en riktig gåva når Last-X-widgeten', () => {
  const { h, box } = boot();
  assert.ok(box, 'widgeten ritades inte ut');
  assert.equal(nameIn(box), 'Alex', 'utgångsläget ska vara platshållaren');
  h.window.routeLiveBattleEvent({ type: 'gift', username: 'wpwer17', coins: 500 });
  assert.equal(nameIn(box), 'wpwer17',
    'gåvan nådde aldrig fram — Last-X hade då varit preview-only som matrisen påstår');
});

test('like, share och subscribe når också fram', () => {
  for (const [type, user] of [['like', 'mia_l'], ['share', 'leo_s'], ['subscribe', 'sara_s']]) {
    const { h, box } = boot();
    h.window.routeLiveBattleEvent({ type, username: user });
    assert.equal(nameIn(box), user, `${type} nådde inte fram`);
  }
});

test('ny LIVE later synligt kort spela klart men kastar vantande gamla kort', () => {
  const { h, box } = boot();
  const timers = [];
  h.window.setTimeout = fn => { timers.push(fn); return timers.length };
  h.window.clearTimeout = () => {};

  h.window.routeLiveBattleEvent({ type: 'gift', username: 'synlig-gammal', coins: 500 });
  h.window.routeLiveBattleEvent({ type: 'like', username: 'vantande-gammal' });
  assert.equal(nameIn(box), 'synlig-gammal', 'positiv kontroll: inget kort visades');
  assert.ok(box.classList.contains('last-x-active'));
  assert.deepEqual([...box._lx.order], ['liker'], 'positiv kontroll: inget gammalt kort vantade');

  h.window.dispatchEvent(new h.window.CustomEvent('vyra-live-session', {
    detail: { event: 'live:start', sessionId: '22222222-2222-4222-8222-222222222222' }
  }));
  assert.equal(nameIn(box), 'synlig-gammal', 'det synliga kortet rycktes bort vid sessionsbytet');
  assert.ok(box.classList.contains('last-x-active'), 'det synliga kortets animation avbröts');
  assert.deepEqual([...box._lx.order], [], 'den gamla kön tömdes inte');
  assert.equal(Object.keys(box._lx.slots).length, 0, 'gamla slots tömdes inte');

  // Spela fasmaskinens riktiga callbacks till slut utan att vanta fem sekunder. Om det vantande
  // like-kortet overlevde sessionsbytet skulle advanceLX() byta namnet till "vantande-gammal".
  while (timers.length) timers.shift()();
  assert.equal(nameIn(box), 'synlig-gammal', 'ett väntande kort fran forra LIVE:n visades efterat');
  assert.ok(!box.classList.contains('last-x-active'), 'det synliga kortet fick inte spela klart');
});

test('den ursprungliga battle-routingen körs fortfarande', () => {
  // Omskrivningen anropar den sparade funktionen först. Gjorde den inte det skulle Glove Snipe
  // sluta fungera från battle-UI:t, som är dess enda kvarvarande väg.
  const src = fs.readFileSync(path.join(ROOT, 'last-x-alerts.js'), 'utf8');
  const at = src.indexOf('routeLiveBattleEvent = function');
  assert.notEqual(at, -1);
  assert.match(src.slice(at, at + 200), /lastXRoute\(event\)/,
    'den sparade routingen anropas inte — battle-events tappas');
});

test('katalogsektionen finns kvar', () => {
  // Skyddar mot att någon pensionerar sektionen utifrån matrisens felaktiga rad.
  const src = fs.readFileSync(path.join(ROOT, 'last-x-alerts.js'), 'utf8');
  assert.match(src, /dataset\.lastX\s*=\s*'1'/);
  const all = fs.readdirSync(ROOT).filter(f => f.endsWith('.js'))
    .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .map(s => s.split('\n').map(l => l.replace(/\r$/, '').replace(/\/\/.*$/, '')).join('\n'))
    .join('\n');
  assert.doesNotMatch(all, /\[data-last-x\][^\n]*\?\.remove\(\)/,
    'Last-X pensionerades trots att den är live — se live-client.js:130');
});

// 2026-11-19, uppmätt med riktig TikTok-trafik: varje händelse medan kortet visades tog bort
// lx-swap, läste offsetWidth (en omräkning av hela sidans layout) och satte klassen igen. Elva
// Last X på samma sida fick OBS-källan att stå still. Nu tar animationen själv bort klassen när
// den är klar, och en händelse mitt i animationen startar om just den.
test('namnbytets animation startas om utan att räkna om sidans layout', () => {
  const { h, box } = boot();
  const copy = box.querySelector('.last-x-copy');
  assert.ok(copy, 'kortets textdel saknas');
  let layoutlasningar = 0;
  Object.defineProperty(copy, 'offsetWidth', { configurable: true, get() { layoutlasningar += 1; return 100; } });
  h.window.routeLiveBattleEvent({ type: 'gift', username: 'forsta', coins: 5 });   // kortet tänds
  h.window.routeLiveBattleEvent({ type: 'gift', username: 'andra', coins: 5 });    // byte medan det visas
  assert.equal(nameIn(box), 'andra');
  assert.ok(copy.classList.contains('lx-swap'), 'bytet ska animeras');
  assert.equal(layoutlasningar, 0, 'första bytet ska bara sätta klassen');

  // Animationen blir klar: klassen tas bort, så nästa byte inte behöver någon omstart.
  const klar = new h.window.Event('animationend'); klar.animationName = 'lx-swap';
  copy.dispatchEvent(klar);
  assert.ok(!copy.classList.contains('lx-swap'), 'klassen ska bort när animationen är klar');
  h.window.routeLiveBattleEvent({ type: 'gift', username: 'tredje', coins: 5 });
  assert.ok(copy.classList.contains('lx-swap'));
  assert.equal(layoutlasningar, 0, 'ett byte efter en avslutad animation ska inte läsa layouten');

  // Ett byte MEDAN animationen spelar startar om den pågående animationen.
  let omstarter = 0;
  copy.getAnimations = () => [{ animationName: 'lx-swap', cancel() {}, play() { omstarter += 1; } }];
  h.window.routeLiveBattleEvent({ type: 'gift', username: 'fjarde', coins: 5 });
  assert.equal(nameIn(box), 'fjarde');
  assert.equal(omstarter, 1, 'den pågående animationen ska startas om');
  assert.equal(layoutlasningar, 0, 'omstarten ska inte läsa layouten');

  // En annan animations slut får inte ta bort klassen.
  const annan = new h.window.Event('animationend'); annan.animationName = 'nagot-annat';
  copy.dispatchEvent(annan);
  assert.ok(copy.classList.contains('lx-swap'));
});
