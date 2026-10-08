'use strict';
// Playground-widgetarna (Top Gifter Podium, Top Streak Flip, Goal Pro) ska leva hela vägen:
// fabrik -> katalognyckel -> skal i canvasen -> montering -> live-event via routeLiveBattleEvent.
// Samma läxa som Gift Bubbles/Gift Fireworks: ett test som anropar renderaren direkt är grönt
// medan widgeten är död i sändning, så allt går in genom routeLiveBattleEvent.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test.afterEach(async () => { await new Promise(setImmediate); closeAll(); });

function forbered(h) {
  h.run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  // jsdom utan pretendToBeVisual saknar rAF; modulens animationsloopar behöver en.
  h.run('window.requestAnimationFrame=cb=>setTimeout(()=>cb(Date.now()),0);window.cancelAnimationFrame=id=>clearTimeout(id);');
  h.load('overlay-sanitize.js');
  h.load('playground-assets.js');
  h.load('playground-widgets.js');
  return h;
}

function boot(typer = ['templatePgPodium', 'templatePgStreak', 'templatePgGoal'], pg = {}) {
  const widgets = typer.map((type, i) => ({ id: 'pg' + i, type, x: 10, y: 10 + i * 100, width: 300, title: type, pg: pg[type] || {} }));
  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout', state: { widgets, projectName: 'pg' } });
  forbered(h);
  h.run(`view='editor';document.querySelector('#view').innerHTML='<div class="editor-shell"><div class="canvas">'
    +state.widgets.map(wh).join('')+'</div></div>';`);
  h.window.VyraPlaygroundWidgets.scan();
  const gava = (over = {}) => h.window.routeLiveBattleEvent(Object.assign(
    { id: 'g' + Math.random().toString(36).slice(2), type: 'gift', username: 'lisa', giftName: 'Rose', giftId: '5655',
      diamonds: 1, coins: 1, count: 1, repeatCount: 1, repeatEnd: true }, over));
  return Object.assign(h, { gava });
}
const host = (h, kind) => h.document.querySelector(`.pgw[data-pgkind="${kind}"]`);

// ---------------------------------------------------------------- fabriken och katalogen
test('katalognycklarna skapar widgetarna med rätt typ', () => {
  const h = createDom({ url: 'https://vyralive.app/studio.html', state: { widgets: [], projectName: 'pg' } });
  forbered(h);
  for (const [nyckel, typ] of [['catalog:pgpodium', 'templatePgPodium'], ['catalog:pgstreak', 'templatePgStreak'], ['catalog:pggoal', 'templatePgGoal']]) {
    const w = h.window.VyraWidgets.create(nyckel);
    assert.equal(w.type, typ, nyckel);
    assert.ok(w.id, 'widgeten saknar id');
    assert.equal(Object.keys(w.pg).length, 0);
  }
});

test('alla assets modulen pekar på finns på disk', () => {
  const h = createDom({ state: { widgets: [], projectName: 'pg' } });
  forbered(h);
  const pg = h.window.VYRA_PG;
  assert.equal(pg.frames.length, 12, 'podiet ska ha 12 HD-ramar');
  assert.equal(pg.streak.length, 12, 'Top Streak ska ha 12 modeller');
  const filer = [...Object.values(pg.img), ...Object.values(pg.gift), ...pg.streak.map(m => m.file)];
  assert.ok(filer.length > 80);
  for (const f of filer) assert.ok(fs.existsSync(path.join(ROOT, f)), 'saknas: ' + f);
  for (const m of pg.streak) {
    assert.ok(m.big && m.big.r > 0.2, m.id + ': stora cirkeln saknar radie');
    assert.ok(m.small === null || m.small.r > 0.05, m.id + ': lilla cirkeln');
  }
});

test('katalogkort och förhandsbilder finns för alla tre', () => {
  const preview = las('overlay-preview.js');
  for (const k of ['pgpodium', 'pgstreak', 'pggoal']) {
    assert.ok(preview.includes(`'catalog:${k}': 'assets/previews/${k}.jpg'`), k + ' saknar förhandsbild i overlay-preview.js');
    assert.ok(fs.existsSync(path.join(ROOT, `assets/previews/${k}.jpg`)), k + ': bilden saknas');
  }
  assert.ok(las('media.js').includes("playground-widgets.js?v="), 'laddaren i media.js saknas');
});

// ---------------------------------------------------------------- skalet och monteringen
test('skalet ritas per widget och monteras av scan()', () => {
  const h = boot();
  for (const k of ['podium', 'streak', 'goal']) {
    const el = host(h, k);
    assert.ok(el, k + ' har inget skal');
    assert.equal(el.dataset.pgm, '1', k + ' monterades aldrig');
  }
  assert.equal(h.window.VyraPlaygroundWidgets.mounted(), 3);
  assert.ok(host(h, 'podium').querySelectorAll('.pcol').length === 3, 'podiet ska ha tre platser');
});

test('layernamnet i lagerpanelen är widgetens namn', () => {
  const h = boot();
  assert.equal(h.window.liveLayerName({ type: 'templatePgPodium' }), 'Top Gifter Podium');
  assert.equal(h.window.liveLayerName({ type: 'templatePgStreak' }), 'Top Streak Flip');
  assert.equal(h.window.liveLayerName({ type: 'templatePgGoal' }), 'Goal Pro');
});

// ---------------------------------------------------------------- liveväg genom routeLiveBattleEvent
test('podiet rangordnar givare efter mynt och visar namnen', () => {
  const h = boot(['templatePgPodium']);
  h.gava({ username: 'anna', giftName: 'Crown', diamonds: 799, coins: 799 });
  h.gava({ username: 'bo', giftName: 'Rose', diamonds: 1, coins: 1 });
  h.gava({ username: 'cia', giftName: 'Diamond', diamonds: 5000, coins: 5000 });
  const namn = [...host(h, 'podium').querySelectorAll('.pcol')].map(c => ({ plats: c.className, nm: c.querySelector('.nm').textContent }));
  const plats = p => namn.find(n => n.plats.includes(' r' + p)).nm;
  assert.equal(plats(1), 'cia');
  assert.equal(plats(2), 'anna');
  assert.equal(plats(3), 'bo');
});

test('en combo räknas som skillnaden, inte som summan av alla upprepningar', () => {
  const h = boot(['templatePgPodium']);
  // TikTok skickar repeatCount 1, 2, 3 för SAMMA combo — totalen ska bli 3 gåvor, inte 6.
  for (const n of [1, 2, 3]) h.gava({ username: 'kim', giftName: 'Rose', giftId: 'r1', diamonds: 10, coins: 10 * n, repeatCount: n, repeatEnd: n === 3 });
  const rad = host(h, 'podium').querySelector('.pcol.r1 .cn').textContent.replace(/\s| /g, '');
  assert.equal(rad, '30', 'tre gåvor à 10 mynt ska bli 30, fick ' + rad);
});

test('Top Streak håller rekordet och byter ledare först när någon slår det', () => {
  const h = boot(['templatePgStreak']);
  const st = () => h.window.VyraPlaygroundWidgets.state.pg0.top;
  for (let i = 1; i <= 4; i++) h.gava({ username: 'ada', giftName: 'Rose', giftId: 'r1', repeatCount: i, repeatEnd: i === 4 });
  assert.equal(st().user, 'ada'); assert.equal(st().n, 4);
  h.gava({ username: 'bob', giftName: 'Rose', giftId: 'r1', repeatCount: 2, repeatEnd: true });
  assert.equal(st().user, 'ada', 'en lägre streak får inte ta över');
  for (let i = 1; i <= 6; i++) h.gava({ username: 'bob', giftName: 'Cap', giftId: 'c1', repeatCount: i, repeatEnd: i === 6 });
  assert.equal(st().user, 'bob'); assert.equal(st().n, 6);
});

test('Goal Pro summerar rätt mätare och ignorerar resten', () => {
  const h = boot(['templatePgGoal'], { templatePgGoal: { x: { metric: 'likes', target: 1000, design: '1' } } });
  const val = () => (h.window.VyraPlaygroundWidgets.state.pg0 || {}).val || 0;
  h.window.routeLiveBattleEvent({ type: 'like', username: 'x', count: 30 });
  h.window.routeLiveBattleEvent({ type: 'like', username: 'y', count: 20 });
  h.gava({ username: 'z', coins: 999, diamonds: 999 });          // gåvor räknas inte på en like-mätare
  h.window.routeLiveBattleEvent({ type: 'follow', username: 'w' });
  assert.equal(val(), 50);
});

test('live:start nollställer allt, andra sessionshändelser rör inget', () => {
  const h = boot(['templatePgPodium', 'templatePgStreak']);
  h.gava({ username: 'anna', giftName: 'Crown', diamonds: 799, coins: 799 });
  const pg = h.window.VyraPlaygroundWidgets;
  assert.ok(pg.state.pg1 && pg.state.pg1.top.user === 'anna');
  h.window.dispatchEvent(new h.window.CustomEvent('vyra-live-session', { detail: { event: 'live:end' } }));
  assert.ok(pg.state.pg1 && pg.state.pg1.top.user === 'anna', 'ett avslut ska lämna sista rekordet kvar');
  h.window.dispatchEvent(new h.window.CustomEvent('vyra-live-session', { detail: { event: 'live:start' } }));
  assert.ok(!pg.state.pg1 || !pg.state.pg1.top || !pg.state.pg1.top.user, 'live:start ska nollställa rekordet');
});

test('vyra-session-ended river alla instanser', () => {
  const h = boot();
  assert.equal(h.window.VyraPlaygroundWidgets.mounted(), 3);
  h.window.dispatchEvent(new h.window.CustomEvent('vyra-session-ended'));
  assert.equal(h.window.VyraPlaygroundWidgets.mounted(), 0);
});

test('dolda och borttagna widgetar lämnar inga instanser kvar', () => {
  const h = boot(['templatePgPodium']);
  assert.equal(h.window.VyraPlaygroundWidgets.mounted(), 1);
  h.document.querySelector('.canvas').innerHTML = '';
  h.window.VyraPlaygroundWidgets.scan();
  assert.equal(h.window.VyraPlaygroundWidgets.mounted(), 0, 'instansen läckte när skalet försvann');
});

// ---------------------------------------------------------------- panelen
test('panelen har färgpalett, test och position — på svenska', () => {
  const h = boot(['templatePgStreak']);
  h.run(`selected='pg0'`);
  const html = h.window.props();
  assert.ok(html.includes('TOP STREAK FLIP'));
  assert.ok((html.match(/data-pgsw=/g) || []).length === 24, 'paletten ska ha 24 färgpar');
  assert.ok(html.includes('data-pgtest="gift"') && html.includes('id="propX"') && html.includes('id="del"'));
  assert.ok(html.includes('Flippa mellan profil och gåva'));
  assert.ok(html.includes('FÄRGER OCH STIL') && html.includes('TEST'));
});

test('ett färgval skrivs i widgetens pg-objekt', () => {
  const h = boot(['templatePgGoal']);
  h.run(`selected='pg0';document.querySelector('#view').insertAdjacentHTML('beforeend','<div class="properties" id="props"></div>');`);
  h.document.querySelector('#props').innerHTML = h.window.props();
  h.window.bind();
  const sw = h.document.querySelector('[data-pgsw]');
  sw.click();
  h.run("window.__w=JSON.parse(JSON.stringify(state.widgets.find(x=>x.id==='pg0')))");
  const w = h.window.__w;
  assert.ok(w.pg.accent && w.pg.accent2, 'färgen skrevs inte till widgeten');
});

// ---------------------------------------------------------------- vakter
test('modulen skriver aldrig direkt i sessionens localStorage-nycklar', () => {
  const kod = las('playground-widgets.js');
  assert.ok(!/localStorage\.(setItem|removeItem)/.test(kod), 'session-write-monopoly: skriv via save()');
  assert.ok(!/\.innerHTML\s*=\s*[^;]*\bev\./.test(kod));
});
