'use strict';
// Gift Bubbles ska tändas av en riktig gåva — genom hela livevägen, aldrig via en direkt
// trigger. Samma läxa som Gift Fireworks (den fjärde döda triggern): ett test som anropar
// triggern direkt är grönt medan widgeten är död i sändning. Därför går allt nedan in via
// routeLiveBattleEvent (som live-client.js:ingest anropar för varje event).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test.afterEach(async () => { await new Promise(setImmediate); closeAll(); });

const gb = (id = 'gb1', over = {}) => Object.assign({
  id, type: 'templateGiftBubbles', x: 10, y: 10, width: 320, title: 'Gift Bubbles',
  gbSize: 'm', gbMin: 1, gbGiftIn: true, gbHearts: true, gbShowCombo: true, gbDuration: 5
}, over);

function boot(widgets = [gb()]) {
  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout',
    state: { widgets, projectName: 'gb' } });
  h.load('overlay-sanitize.js');
  h.load('gift-bubbles.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  // Räknaren måste sitta INNANFÖR session-filens omslutning — installeras FÖRE den laddas.
  run(`window.__gamla=0;{const org=window.routeLiveBattleEvent;
       window.routeLiveBattleEvent=function(e){window.__gamla++;
         if(typeof org==='function')return org(e)}}`);
  h.load('gift-bubbles-session.js');
  run(`state.widgets.length=0;${widgets.map(w => `state.widgets.push(${JSON.stringify(w)})`).join(';')};view='editor';`);
  run(`document.querySelector('#view').innerHTML='<div class="editor-shell"><div class="canvas">'
    +state.widgets.map(wh).join('')+'</div></div>';`);
  // Spionen sitter PÅ triggern, inte i stället för den: effekten ska fortfarande byggas.
  run(`window.__traffar=[];{const org=window.triggerGiftBubbles;
       window.triggerGiftBubbles=function(p){window.__traffar.push(p);return org.apply(this,arguments)}}`);
  const gava = (over = {}) => h.window.routeLiveBattleEvent(Object.assign(
    { id: 'g' + Math.random().toString(36).slice(2), type: 'gift', username: 'lisa',
      giftName: 'Rose', giftId: '5655', coins: 500, count: 1 }, over));
  return { h, run, d: h.document, gava, traffar: () => h.window.__traffar };
}

const fx = (d, id = 'gb1') => d.querySelector(`[data-id="${id}"] .gift-bubbles-fx`);

// ---- resan från event till effekt ----
test('en live-gåva tänder bubblorna', () => {
  const { gava, traffar, d } = boot();
  gava();
  assert.equal(traffar().length, 1, 'gåvan nådde aldrig triggern');
  assert.ok(fx(d).classList.contains('gb-play'), 'triggern anropades men effekten byggdes inte');
  assert.ok(fx(d).querySelectorAll('.gb-orb,.gb-heart').length > 0, 'inga bubblor monterades');
});

test('gåvans fält följer med hela vägen', () => {
  const { gava, traffar } = boot();
  gava({ username: 'omar', giftName: 'Galaxy', coins: 1200, count: 3 });
  const p = traffar()[0];
  assert.equal(p.username, 'omar');
  assert.equal(p.giftName, 'Galaxy');
  assert.equal(Number(p.coins), 1200);
});

test('gift_combo och giftcombo räknas också som gåvor', () => {
  for (const typ of ['gift_combo', 'giftcombo']) {
    const { gava, traffar } = boot();
    gava({ type: typ });
    assert.equal(traffar().length, 1, `${typ} tände inga bubblor`);
  }
});

test('allt som inte är en gåva lämnas i fred', () => {
  const { gava, traffar } = boot();
  for (const typ of ['chat', 'like', 'follow', 'share', 'member', 'battle', 'subscribe']) gava({ type: typ });
  assert.equal(traffar().length, 0, 'en icke-gåva tände bubblorna');
});

test('den gamla routeLiveBattleEvent körs fortfarande', () => {
  const { h, gava } = boot();
  gava();
  assert.equal(h.window.__gamla, 1, 'föregångaren i kedjan anropades inte');
});

test('ingest är kedjan filen hänger i', () => {
  assert.match(las('live-client.js'),
    /routeLiveBattleEvent\s*===\s*'function'[\s\S]{0,40}routeLiveBattleEvent\(e\)/,
    'ingest() anropar inte routeLiveBattleEvent — livevägen är bruten');
});

// ---- widgetens egna filter ägs av triggern ----
test('en gåva under gbMin tänder ingenting', () => {
  const { gava, d } = boot([gb('gb1', { gbMin: 100 })]);
  gava({ coins: 5 });
  assert.ok(!fx(d).classList.contains('gb-play'), 'gbMin ignorerades i livevägen');
});

test('filen duplicerar inte triggerns filter', () => {
  const src = las('gift-bubbles-session.js');
  for (const filter of ['gbMin', 'gbExcludeAnon', 'hidden']) {
    assert.doesNotMatch(src, new RegExp(filter), `${filter} bedöms både här och i triggern`);
  }
});

// ---- kön ----
test('tre avsändare startar tillsammans och den fjärde väntar', () => {
  const { gava, traffar, h } = boot();
  for (let i = 0; i < 4; i++) gava();
  assert.equal(traffar().length, 3, 'tre oberoende avsändare ska starta');
  assert.equal(h.window.VyraGiftBubbles.koLangd(), 1);
});

test('nödbromsen är lokal, hög och loggad', () => {
  const src = las('gift-bubbles-session.js');
  const tak = src.match(/NODBROMS\s*=\s*(\d+)/);
  assert.ok(tak && Number(tak[1]) >= 100, 'nödbromsen saknas eller ligger för lågt');
  assert.match(src, /console\.warn/);
});

// ---- ingen dubbeltändning ----
test('samma gåva tänder bara en effekt, även om Actions också fyrar', () => {
  const { h } = boot();
  const e = { id: 'samma-1', type: 'gift', username: 'lisa', coins: 500, count: 1 };
  h.window.routeLiveBattleEvent(e);
  assert.equal(h.window.triggerGiftBubbles(e), false, 'samma gåva tändes två gånger');
});

test('en gåva utan id spärras aldrig', () => {
  const { h } = boot();
  assert.equal(h.window.triggerGiftBubbles({ username: 'lisa', coins: 500 }), true);
  assert.equal(h.window.triggerGiftBubbles({ username: 'lisa', coins: 500 }), true,
    'testknappen slutade fungera vid andra trycket');
});

// ---- inget läckage till layouten ----
test('filen skriver aldrig till layouten', () => {
  const src = las('gift-bubbles-session.js');
  assert.doesNotMatch(src, /\bsave\(\)/, 'live-data blir persistent mellan sändningar');
  assert.doesNotMatch(src, /\brender\(\)/, 'hela canvasen byggs om per gåva');
  assert.doesNotMatch(src, /localStorage/, 'kön överlever en omladdning');
});

test('media.js laddar filerna i rätt ordning', () => {
  const src = las('media.js');
  assert.match(src, /gift-bubbles\.js/, 'renderaren laddas av ingen');
  assert.match(src, /gift-bubbles-session\.js/, 'livevägen laddas av ingen');
  assert.ok(src.indexOf('gift-bubbles.js') < src.indexOf('gift-bubbles-session.js'),
    'session-filen laddas före triggern den behöver');
});

// ---- teardown ----
test('en avslutad session tömmer kön', () => {
  const { h, gava } = boot();
  for (let i = 0; i < 5; i++) gava();
  h.window.dispatchEvent(new h.window.Event('vyra-session-ended'));
  assert.equal(h.window.VyraGiftBubbles.koLangd(), 0);
  assert.equal(h.window.VyraGiftBubbles.spelar(), false);
});

// ---- fabriken kan skapa den ----
test('fabriken bygger en giltig Gift Bubbles-widget', () => {
  const { h } = boot([]);
  const w = h.window.VyraWidgets.create('catalog:giftbubbles');
  assert.equal(w.type, 'templateGiftBubbles');
  assert.ok(w.id, 'widget saknar id');
});
