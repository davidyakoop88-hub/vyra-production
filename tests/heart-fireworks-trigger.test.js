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

// ---- ETT I TAGET (användarens beslut 2026-10-18) ------------------------------------------------
// Förr startade tre gåvor samtidigt och varje plats hölls hela visningstiden (6,4 s). Alla hjärtan
// ritas på samma duk, så det blev en hög. Nu: ett i taget, nästa vid toppen ur fire()-tidslinjen,
// och kön trycks ihop när den blir lång — samma regler som Gift Fireworks.
function klocka(h) {
  let nu = 2_000_000, seq = 0;
  const timers = new Map(), T0 = nu;
  h.window.Date.now = () => nu;
  h.window.setTimeout = (fn, ms) => { timers.set(++seq, { fn, at: nu + Math.max(0, Number(ms) || 0) }); return seq };
  h.window.clearTimeout = id => { timers.delete(id) };
  const tick = ms => {
    const mal = nu + ms;
    for (;;) {
      const next = [...timers].filter(([, t]) => t.at <= mal).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      timers.delete(next[0]); nu = next[1].at; next[1].fn();
    }
    nu = mal;
  };
  return { tick, tid: () => nu - T0 };
}
function bootKlocka(widgets) {
  const b = boot(widgets), k = klocka(b.h), starter = [];
  b.run(`{const org=window.triggerHeartFireworks;window.triggerHeartFireworks=function(p){const r=org.apply(this,arguments);if(r!==false)window.__hfStart(p);return r}}`);
  b.h.window.__hfStart = p => starter.push({ user: p.username, t: k.tid(), tempo: p.__tempo || 1, combo: p.combo, coins: p.coins });
  let n = 0;
  const gava2 = (over = {}) => b.h.window.routeLiveBattleEvent(Object.assign(
    { id: 'k' + (++n), type: 'gift', username: 'u' + n, giftName: 'Rose', coins: 1, count: 1 }, over));
  return { ...b, ...k, starter, gava2, api: () => b.h.window.VyraHeartFireworks };
}

test('(e) standard är ett i taget: den första startar och de tre andra väntar', () => {
  const { gava, traffar, h } = boot();
  for (let i = 0; i < 4; i++) gava();
  assert.equal(traffar().length, 1, 'fyra gåvor startade flera hjärtfyrverkerier på samma duk');
  assert.equal(h.window.VyraHeartFireworks.koLangd(), 3);
  assert.equal(h.window.VyraHeartFireworks.regler.SAMTIDIGA, 1);
});

test('(e) toppen kommer ur fire()-tidslinjen: en gåva 1,9 s, tolv hjärtan 3,7 s, tempo kortar', () => {
  const { h } = boot();
  const topp = h.window.VyraHeartFireworksFx.toppFor;
  // Sista raketens uppskjutning + flygtid 900 ms + utslag 1000 ms.
  assert.equal(topp({ count: 1 }), 1900);
  assert.equal(topp({ count: 12 }), Math.round(11 / 12 * 1900 + 60 + 900 + 1000));
  assert.equal(topp({ count: 100 }), topp({ count: 12 }), 'fler än tolv hjärtan ritas aldrig');
  assert.equal(topp({ count: 1, __tempo: 2 }), 450 + 1000);
  // Konstanterna är de som fire() faktiskt använder.
  const src = las('heart-fireworks.js');
  assert.match(src, /\(\(i\/hearts\)\*HF_SPRIDNING_MS\+rnd\(0,HF_SPRIDNING_SLUMP_MS\)\)\/t/);
  assert.match(src, /r\.y-=Math\.max\(6,H\/70\)\*\(r\.fart\|\|1\)/);
});

test('(e) tre gåvor startar i tur och ordning vid toppen, inte samtidigt', () => {
  const { gava2, tick, starter } = bootKlocka();
  gava2({ username: 'anna' }); tick(1500); gava2({ username: 'bea' }); tick(1500); gava2({ username: 'cem' });
  tick(20000);
  assert.deepEqual(starter.map(s => s.user), ['anna', 'bea', 'cem']);
  assert.deepEqual(starter.slice(1).map((s, i) => s.t - starter[i].t), [2000, 2000]);
});

test('(e) trettio gåvor: tempot höjs, ingen spelas mer än 60 s efteråt och inget försvinner', () => {
  const { gava2, tick, starter, api } = bootKlocka();
  for (let i = 0; i < 30; i++) gava2({ count: 12 });
  tick(150000);
  assert.equal(starter.length + api().forsenade(), 30);
  assert.equal(api().koLangd(), 0);
  assert.ok(Math.max(...starter.map(s => s.t)) <= api().regler.MAX_ALDER_MS);
  assert.equal(starter[1].tempo, 2);
  // Tolv hjärtan per gåva når toppen först efter 2,45 s även i dubbelt tempo, så de sista i en kö på
  // trettio hinner bli äldre än 60 s. De spelas inte — de räknas.
  assert.ok(api().forsenade() > 0 && api().forsenade() < 10, `forsenade ${api().forsenade()}`);
});

test('(e) samma avsändares gåvor slås ihop med summerat antal och värde när kön är lång', () => {
  const { gava2, tick, starter, api } = bootKlocka();
  for (let i = 0; i < 30; i++) gava2({ username: ['anna', 'bea', 'cem'][i % 3], coins: 50, count: 1 });
  tick(150000);
  assert.ok(api().ihopslagna() > 0);
  assert.ok(starter.length < 10, `${starter.length} effekter för tre avsändare`);
  assert.equal(starter.reduce((s, x) => s + Number(x.coins), 0), 1500);
  assert.equal(starter.reduce((s, x) => s + Number(x.combo || 1), 0), 30, 'antalet hjärtan ska summeras');
});

test('(e) en gåva som väntat mer än 60 s spelas inte, och räknas', () => {
  const { h, gava2, tick, starter, api } = bootKlocka();
  const org = h.window.VyraHeartFireworksFx.toppFor;
  h.window.VyraHeartFireworksFx.toppFor = input => input.username === 'u1' ? 70000 : org(input);
  gava2(); gava2(); gava2();
  tick(71000);
  assert.equal(starter.length, 1);
  assert.equal(api().forsenade(), 2);
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

test('kön håller widgetens egen visningstid, inte standardtiden', () => {
  // visningsMs() läste root.state, som aldrig finns: state är en const i studio.js. Kön väntade
  // därför alltid 6,4 s oavsett panelens tid (upptäckt 2026-10-18). hfDuration 3 → 3 s + 0,4 s.
  const { h, gava } = boot([hf('hf1', { hfDuration: 3 })]);
  assert.equal(h.window.state, undefined, 'provet ska efterlikna studio.js: state får inte ligga på window');
  // Ett i taget (2026-10-18): kön startar nästa vid TOPPEN (toppFor). Reserven, som det här provet
  // gäller, används när toppen saknas.
  if (h.window.VyraHeartFireworksFx) delete h.window.VyraHeartFireworksFx.toppFor;
  const waits = []; h.window.setTimeout = (fn, ms) => { waits.push(ms); return waits.length };
  gava();
  assert.ok(waits.includes(3400), `kön väntade ${waits.join(', ')} ms i stället för widgetens 3400`);
});
