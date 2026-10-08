'use strict';
// Heart Fireworks (modell 2) ska tändas av en riktig gåva genom hela livevägen, aldrig via en
// direkt trigger. Effekten är ren canvas (jsdom har ingen canvas), så testet bevisar livevägen
// via klassen hf-play + ×N-räknaren (DOM) — motorn degraderar men bygger ändå dessa.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test.afterEach(async () => { await new Promise(setImmediate); closeAll(); });

const hf = (id = 'hf1', over = {}) => Object.assign({
  id, type: 'templateHeartFireworks', x: 10, y: 10, width: 320, title: 'Heart Fireworks',
  hfMin: 1, hfGold: true, hfShowCombo: true, hfDuration: 6
}, over);

function boot(widgets = [hf()]) {
  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout',
    state: { widgets, projectName: 'hf' } });
  h.load('overlay-sanitize.js');
  h.load('heart-fireworks.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`window.__gamla=0;{const org=window.routeLiveBattleEvent;
       window.routeLiveBattleEvent=function(e){window.__gamla++;
         if(typeof org==='function')return org(e)}}`);
  h.load('heart-fireworks-session.js');
  run(`state.widgets.length=0;${widgets.map(w => `state.widgets.push(${JSON.stringify(w)})`).join(';')};view='editor';`);
  run(`document.querySelector('#view').innerHTML='<div class="editor-shell"><div class="canvas">'
    +state.widgets.map(wh).join('')+'</div></div>';`);
  run(`window.__traffar=[];{const org=window.triggerHeartFireworks;
       window.triggerHeartFireworks=function(p){window.__traffar.push(p);return org.apply(this,arguments)}}`);
  const gava = (over = {}) => h.window.routeLiveBattleEvent(Object.assign(
    { id: 'g' + Math.random().toString(36).slice(2), type: 'gift', username: 'lisa',
      giftName: 'Rose', giftId: '5655', coins: 500, count: 1 }, over));
  return { h, run, d: h.document, gava, traffar: () => h.window.__traffar };
}

const fx = (d, id = 'hf1') => d.querySelector(`[data-id="${id}"] .heart-fireworks-fx`);

test('en live-gåva tänder fyrverkeriet', () => {
  const { gava, traffar, d } = boot();
  gava({ count: 10 });
  assert.equal(traffar().length, 1, 'gåvan nådde aldrig triggern');
  assert.ok(fx(d).classList.contains('hf-play'), 'triggern anropades men effekten byggdes inte');
});

test('combo över 1 visar en ×N-räknare (aldrig ett brus)', () => {
  const { gava, d } = boot();
  gava({ count: 100 });
  const badge = fx(d).querySelector('.hf-combo');
  assert.ok(badge, 'ingen combo-räknare vid högt combo');
});

test('gåvans fält följer med hela vägen', () => {
  const { gava, traffar } = boot();
  gava({ username: 'omar', giftName: 'Galaxy', coins: 1200, count: 3 });
  const p = traffar()[0];
  assert.equal(p.username, 'omar');
  assert.equal(Number(p.coins), 1200);
});

test('gift_combo och giftcombo räknas också som gåvor', () => {
  for (const typ of ['gift_combo', 'giftcombo']) {
    const { gava, traffar } = boot();
    gava({ type: typ });
    assert.equal(traffar().length, 1, `${typ} tände inget fyrverkeri`);
  }
});

test('allt som inte är en gåva lämnas i fred', () => {
  const { gava, traffar } = boot();
  for (const typ of ['chat', 'like', 'follow', 'share', 'member', 'battle', 'subscribe']) gava({ type: typ });
  assert.equal(traffar().length, 0, 'en icke-gåva tände fyrverkeriet');
});

test('den gamla routeLiveBattleEvent körs fortfarande', () => {
  const { h, gava } = boot();
  gava();
  assert.equal(h.window.__gamla, 1, 'föregångaren i kedjan anropades inte');
});

test('en gåva under hfMin tänder ingenting', () => {
  const { gava, d } = boot([hf('hf1', { hfMin: 100 })]);
  gava({ coins: 5 });
  assert.ok(!fx(d).classList.contains('hf-play'), 'hfMin ignorerades i livevägen');
});

test('filen duplicerar inte triggerns filter', () => {
  const src = las('heart-fireworks-session.js');
  for (const filter of ['hfMin', 'hfExcludeAnon', 'hidden']) {
    assert.doesNotMatch(src, new RegExp(filter), `${filter} bedöms både här och i triggern`);
  }
});

test('tre avsändare startar tillsammans och den fjärde väntar', () => {
  const { gava, traffar, h } = boot();
  for (let i = 0; i < 4; i++) gava();
  assert.equal(traffar().length, 3, 'tre oberoende avsändare ska starta');
  assert.equal(h.window.VyraHeartFireworks.koLangd(), 1);
});

test('samma gåva tänder bara en effekt', () => {
  const { h } = boot();
  const e = { id: 'samma-1', type: 'gift', username: 'lisa', coins: 500, count: 1 };
  h.window.routeLiveBattleEvent(e);
  assert.equal(h.window.triggerHeartFireworks(e), false, 'samma gåva tändes två gånger');
});

test('filen skriver aldrig till layouten', () => {
  const src = las('heart-fireworks-session.js');
  assert.doesNotMatch(src, /\bsave\(\)/);
  assert.doesNotMatch(src, /\brender\(\)/);
  assert.doesNotMatch(src, /localStorage/);
});

test('media.js laddar filerna i rätt ordning', () => {
  const src = las('media.js');
  assert.match(src, /heart-fireworks\.js/);
  assert.match(src, /heart-fireworks-session\.js/);
  assert.ok(src.indexOf('heart-fireworks.js') < src.indexOf('heart-fireworks-session.js'),
    'session-filen laddas före triggern den behöver');
});

test('en avslutad session tömmer kön', () => {
  const { h, gava } = boot();
  for (let i = 0; i < 5; i++) gava();
  h.window.dispatchEvent(new h.window.Event('vyra-session-ended'));
  assert.equal(h.window.VyraHeartFireworks.koLangd(), 0);
  assert.equal(h.window.VyraHeartFireworks.spelar(), false);
});

test('fabriken bygger en giltig Heart Fireworks-widget', () => {
  const { h } = boot([]);
  const w = h.window.VyraWidgets.create('catalog:heartfireworks');
  assert.equal(w.type, 'templateHeartFireworks');
  assert.ok(w.id, 'widget saknar id');
});
