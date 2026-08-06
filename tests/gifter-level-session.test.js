'use strict';
// Gifter Level Up ska tändas när en tittare höjer sin gifter-nivå.
//
// Före det här tände media.js widgeten på `type.includes('gifter_level')`, och bryggan publicerar
// aldrig något sådant. Samma döda trigger som Fan Level Up och Battle MVP hade.
//
// SKILLNADEN MOT FAN LEVEL UP: där fanns nivån redan i bryggan (baseUser läser fansClub.data.level)
// och ströks bara av molnet. Gifter-nivån fanns INTE NÅGONSTANS i kedjan. TikTok bär den på
// `user.payGrade.level` (UserHonor i tiktok-live-proto v3) — ett fält bryggan aldrig läste. Därför
// tre lager den här gången: normalizern, molnkontraktet och klienten.
//
// Modellen är densamma: stiger nivån jämfört med senast sedda nivån för samma användare är det en
// level-up. Ingen egen nivåberäkning. Kartan lever i minnet.
//
// RÖTT NU: gifter-level-session.js finns inte, och payGrade.level läses av ingen.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test.after(closeAll);

const gifterWidget = (id = 'g1', over = {}) => Object.assign({
  id, type: 'templateGifterLevel', x: 10, y: 10, width: 270, title: 'Gifter Level Up',
  gifterLevel: 15, gifterName: 'ThunderGifter', gifterDuration: 6, minLevel: 1
}, over);

function boot(widgets = [gifterWidget()]) {
  const h = createDom({ state: { widgets, projectName: 'g' } });
  h.load('overlay-sanitize.js');
  h.load('gifter-level-session.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`state.widgets.length=0;${widgets.map(w => `state.widgets.push(${JSON.stringify(w)})`).join(';')};`);
  run(`window.__g=[];window.triggerGifterLevelUp=e=>{window.__g.push(e);return true};`);
  return { h, skicka: e => h.window.routeLiveBattleEvent(e), traffar: () => h.window.__g };
}

const chatt = (username, gifterLevel, over = {}) => ({ type: 'chat', username, gifterLevel, ...over });

// ---- 1. höjningen ------------------------------------------------------------------------------

test('nivå 5 till 6 triggar widgeten', () => {
  const { skicka, traffar } = boot();
  skicka(chatt('lisa', 5));
  skicka(chatt('lisa', 6));
  assert.equal(traffar().length, 1);
  assert.equal(traffar()[0].fromLevel, 5);
  assert.equal(traffar()[0].level, 6);
  assert.equal(traffar()[0].name, 'lisa');
});

test('första gången en tittare syns lärs nivån bara in', () => {
  const { skicka, traffar } = boot();
  skicka(chatt('ny', 9));
  assert.equal(traffar().length, 0);
});

test('oförändrad nivå triggar inte', () => {
  const { skicka, traffar } = boot();
  skicka(chatt('lisa', 5));
  skicka(chatt('lisa', 5));
  assert.equal(traffar().length, 0);
});

test('sänkt nivå triggar inte', () => {
  const { skicka, traffar } = boot();
  skicka(chatt('lisa', 9));
  skicka(chatt('lisa', 4));
  assert.equal(traffar().length, 0);
});

test('varje tittare räknas för sig', () => {
  const { skicka, traffar } = boot();
  skicka(chatt('lisa', 5));
  skicka(chatt('omar', 30));
  skicka(chatt('lisa', 6));
  assert.equal(traffar().length, 1);
  assert.equal(traffar()[0].name, 'lisa');
});

test('gifter-nivån blandas inte ihop med fan-nivån', () => {
  // Båda fälten finns på samma event. En höjd FAN-nivå får inte tända GIFTER-widgeten.
  const { skicka, traffar } = boot();
  skicka({ type: 'chat', username: 'lisa', gifterLevel: 5, teamLevel: 2 });
  skicka({ type: 'chat', username: 'lisa', gifterLevel: 5, teamLevel: 3 });
  assert.equal(traffar().length, 0, 'en fan-nivåhöjning tände gifter-widgeten');
});

test('ett event UTAN gifter-nivå tänder aldrig gifter-widgeten', () => {
  // Det verkliga läckaget: faller läsningen tillbaka på teamLevel när gifterLevel saknas blir varje
  // fan-nivåhöjning en gifter-alert. Testet ovan missar det, eftersom gifterLevel finns där i båda
  // eventen och en `??`-reserv därför aldrig hinner slå till. Upptäckt genom mutationsprov.
  const { skicka, traffar } = boot();
  skicka({ type: 'chat', username: 'lisa', teamLevel: 5 });
  skicka({ type: 'chat', username: 'lisa', teamLevel: 6 });
  assert.equal(traffar().length, 0,
    'gifter-widgeten tände på en fan-nivå — fälten läcker in i varandra');
});

// ---- 2. spannet 1-50 ---------------------------------------------------------------------------

test('nivåer utanför 1 till 50 räknas inte', () => {
  const { skicka, traffar } = boot();
  skicka(chatt('lisa', 20));
  for (const skräp of [0, -3, 51, 999, NaN, null, 'sex', Infinity]) skicka(chatt('lisa', skräp));
  assert.equal(traffar().length, 0);
});

test('nivå 50 är giltig', () => {
  const { skicka, traffar } = boot();
  skicka(chatt('lisa', 49));
  skicka(chatt('lisa', 50));
  assert.equal(traffar()[0].level, 50);
});

test('panelens nivåfält håller 1 till 50', () => {
  const fält = las('media.js').match(/id="gifterLevel"[^>]*/);
  assert.ok(fält);
  assert.match(fält[0], /max="50"/, `nivåfältet tillåter mer än 50: ${fält[0]}`);
});

// ---- 3. kön ------------------------------------------------------------------------------------

test('flera level-ups köas och visas efter varandra', () => {
  const { skicka, traffar, h } = boot();
  for (const n of ['a', 'b', 'c', 'd']) skicka(chatt(n, 5));
  for (const n of ['a', 'b', 'c', 'd']) skicka(chatt(n, 6));
  assert.equal(traffar().length, 1, 'alla spelades samtidigt');
  assert.equal(h.window.VyraGifterLevel.koLangd(), 3);
  assert.equal(traffar()[0].name, 'a');
});

test('kön töms i ankomstordning', () => {
  const { skicka, traffar, h } = boot();
  for (const n of ['a', 'b', 'c']) skicka(chatt(n, 5));
  for (const n of ['a', 'b', 'c']) skicka(chatt(n, 6));
  h.window.VyraGifterLevel.nastaNu();
  h.window.VyraGifterLevel.nastaNu();
  assert.deepEqual([...traffar()].map(t => t.name), ['a', 'b', 'c']);
});

test('en skur på tjugo tappar ingenting', () => {
  const { skicka, h } = boot();
  const namn = Array.from({ length: 20 }, (_, i) => 'u' + i);
  for (const n of namn) skicka(chatt(n, 5));
  for (const n of namn) skicka(chatt(n, 6));
  assert.equal(h.window.VyraGifterLevel.koLangd(), 19);
  assert.equal(h.window.VyraGifterLevel.kastade(), 0);
});

test('nödbromsen är lokal, hög och loggad', () => {
  const src = las('gifter-level-session.js');
  const tak = src.match(/NODBROMS\s*=\s*(\d+)/);
  assert.ok(tak && Number(tak[1]) >= 100, 'nödbromsen saknas eller ligger för lågt');
  assert.match(src, /console\.warn/);
});

test('global köpolicy är orörd', () => {
  const src = las('runtime-controls.js');
  assert.match(src, /MAX_VANTANDE\s*=\s*10/);
  assert.match(src, /MAX_ALDER\s*=\s*30000/);
});

// ---- 4. serverkedjan ---------------------------------------------------------------------------

test('bryggan läser payGrade.level', () => {
  // TikTok bär gifter-nivån på user.payGrade.level (UserHonor i tiktok-live-proto v3). Utan den
  // raden finns nivån inte någonstans i kedjan.
  assert.match(las('tiktok-bridge/normalizer.js'), /payGrade\?\.level/,
    'bryggan läser inte payGrade.level — nivån kommer aldrig in i flödet');
});

test('bryggan skickar gifterLevel', () => {
  assert.match(las('tiktok-bridge/normalizer.js'), /gifterLevel\s*:/);
});

test('molnkontraktet bevarar gifterLevel', () => {
  const bus = las('server/event-bus.js');
  const form = bus.slice(bus.indexOf('function cleanEvent'), bus.indexOf('function cleanEvent') + 2600);
  assert.match(form, /gifterLevel\s*:/, 'molnet tappar gifterLevel — widgeten blir död i molnvägen');
});

test('molnets gifter-nivå klamps till 50', () => {
  const bus = las('server/event-bus.js');
  const rad = bus.split('\n').find(l => /gifterLevel\s*:/.test(l)) || '';
  assert.match(rad, /50/, `ingen övre gräns: ${rad.trim()}`);
});

// ---- 5. rendering och transformationssekvens ---------------------------------------------------

test('renderaren visar från till till', () => {
  const w = gifterWidget('g1', { gifterLevel: 6, gifterFromLevel: 5 });
  const h = createDom({ state: { widgets: [w], projectName: 'g' } });
  h.load('overlay-sanitize.js');
  const box = h.paint([w]);
  assert.match(box.querySelector('.gifter-level-badge').textContent.replace(/\s+/g, ' '), /5\s*→\s*6/);
});

test('rubriken sager GIFTER LEVEL UP', () => {
  const w = gifterWidget('g2');
  const h = createDom({ state: { widgets: [w], projectName: 'g' } });
  h.load('overlay-sanitize.js');
  assert.match(h.paint([w]).querySelector('h2').textContent, /GIFTER LEVEL UP/i);
});

test('transformationssekvensen har tre faser och ryms i kortaste visningstiden', () => {
  const src = las('media.js');
  for (const fas of ['gifter-xform-old', 'gifter-xform-burst', 'gifter-xform-new']) {
    assert.match(src, new RegExp(fas), `fasen ${fas} saknas`);
  }
  assert.match(las('studio.css'), /gifter-xform-burst/, 'burst-fasen har ingen CSS');
  const total = src.match(/XFORM_TOTAL\s*=\s*(\d+)/);
  assert.ok(total, 'sekvensens totala längd är inte namngiven');
  assert.ok(Number(total[1]) < 2000,
    `sekvensen tar ${total[1]} ms men kortaste visningstiden är 2000 ms`);
});

test('triggern skriver inte live-data till layouten', () => {
  const rad = las('media.js').split('\n').find(l => /function triggerGifterLevelUp/.test(l)) || '';
  assert.ok(rad);
  assert.doesNotMatch(rad, /\bsave\(\)/, 'live-data blir persistent mellan sändningar');
  assert.doesNotMatch(rad, /\brender\(\)/, 'hela canvasen byggs om per alert');
  assert.doesNotMatch(rad, /toast\(/, 'debug-toast kvar');
});
