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
  assert.equal(pg.streak.length, 5, 'Top Streak ska ha 5 modeller (7 togs bort 2026-10-17)');
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
test('panelen har färgpalett och position, men ingen testrad — på svenska', () => {
  const h = boot(['templatePgStreak']);
  h.run(`selected='pg0'`);
  const html = h.window.props();
  assert.ok(html.includes('TOP STREAK FLIP'));
  assert.ok((html.match(/data-pgsw=/g) || []).length === 24, 'paletten ska ha 24 färgpar');
  assert.ok(html.includes('id="propX"') && html.includes('id="del"'));
  assert.ok(html.includes('Flippa mellan profil och gåva'));
  // PR 11 i panelspecifikationen (2.3/2.5): testraden Skicka gåva … Nollställ körde feed() i sändningens
  // session och är borta. ▶ Testa widget spelar en klon i en sandlåda (provas nedan och i webbläsaren).
  assert.ok(!/data-pgtest|Skicka gåva|Nollställ|RÖRELSE/.test(html), 'testraden ska vara borta ur panelen');
  // Paletten och Färg 1/2 skriver samma fält och står i en rad; reglagen har enheten i <b>.
  assert.match(html, /<div class="pg-farger" id="pgFarger"><span class="pg-pal-rubrik">Färgpalett<\/span>.*id="pgg_accent"[^>]*><\/label><\/div>/);
  assert.ok(!html.includes('id="pgg_accent2"'), 'Färg 2 når ingenting i streaken och visas inte');
  assert.match(html, /Glöd <b data-pgv="pgg_glow" data-pgu="×">0\.8 ×<\/b>/);
  assert.match(html, /Flip-tid <b data-pgv="pgx_flipt" data-pgu="s">3\.5 s<\/b>/);
  // 2026-10-17: samma ordning som playgroundens panel — STIL, widgetens egna fält, POSITION.
  const rubriker = [...html.matchAll(/<h4>([^<]+)<\/h4>/g)].map(m => m[1]);
  assert.deepEqual(rubriker, ['STIL', 'TOP STREAK FLIP', 'POSITION & STORLEK']);
  let pos = -1;
  for (const ord of ['Entré / utgång', 'Ramlager på avatar', 'Namneffekt', 'Färgpalett', 'Färg 1', 'Textfärg', 'Typsnitt', 'Storlek', 'Rörelsehastighet', 'Glöd', 'Rundning', 'Position']) {
    const n = html.indexOf('>' + ord, pos + 1); assert.ok(n > pos, ord + ' saknas eller står fel'); pos = n;
  }
});

test('Storlek och Position flyttar och skalar den valda widgeten', () => {
  const h = boot(['templatePgPodium']);
  h.run(`selected='pg0';document.querySelector('#view').insertAdjacentHTML('beforeend','<div class="properties" id="props"></div>');`);
  h.document.querySelector('#props').innerHTML = h.window.props();
  h.window.bind();
  const w = () => h.window.eval("state.widgets[0]");
  const bredd = w().width;
  const st = h.document.getElementById('pgg_storlek'); st.value = '1.1'; st.onchange();
  assert.equal(w().width, Math.min(432, Math.round(h.window.eval("VyraWidgets.create('catalog:pgpodium').width") * 1.1)));
  assert.notEqual(w().width, bredd);
  const pl = h.document.getElementById('pgg_placering'); pl.value = 'top'; pl.onchange();
  assert.equal(w().y, 8); assert.equal(w().pg.placering, 'top');
});

test('Position räknar mot dukens format och visar "Egen placering" när widgeten står fritt', () => {
  const h = boot(['templatePgPodium']);
  h.run(`selected='pg0'`);
  const panel = () => {
    if (!h.document.querySelector('#props')) h.document.querySelector('#view').insertAdjacentHTML('beforeend', '<div class="properties" id="props"></div>');
    h.document.querySelector('#props').innerHTML = h.window.props(); h.window.bind();
  };
  const w = () => h.window.eval("state.widgets[0]");
  h.run("state.widgets[0].y=123");
  panel();
  assert.equal(h.document.getElementById('pgg_placering').value, '', 'en ny eller flyttad widget ska inte påstå Mitten');
  // Dator-format: duken är 768×432, så Nederst får aldrig hamna under 432.
  h.run("state.layoutFormat='widescreen'");
  panel();
  const pl = h.document.getElementById('pgg_placering'); pl.value = 'bottom'; pl.onchange();
  assert.ok(w().y <= 432 - 8, 'Nederst i Dator-format hamnade under duken: ' + w().y);
  // Storlek stannar vid dukens bredd och flyttar in X.
  h.run("state.layoutFormat='mobile';state.widgets[0].x=200");
  panel();
  const st = h.document.getElementById('pgg_storlek'); st.value = '1.8'; st.onchange();
  assert.ok(w().width <= 432 && w().x + w().width <= 432, 'podiet gick utanför duken');
});

test('podiets neontext slår inte ut namneffekterna eller Textfärg', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'playground-widgets.css'), 'utf8');
  const pod = css.slice(css.indexOf('Top Gifter Podium, justerat i playgrounden'));
  assert.ok(!/\.pgw \.pod \.(nm|pod-title|cn)\{[^}]*color:#fff/.test(pod), 'namn/rubrik/mynt får inte låsas till vitt — Textfärg ska gälla');
  assert.match(pod, /\.pgw:not\(\[data-namefx=shimmer\]\):not\(\[data-namefx=aurora\]\):not\(\[data-namefx=flicker\]\) \.pod \.nm\{/);
  assert.ok(!/max\(var\(--g\)/.test(pod), 'Glöd-reglaget ska kunna skruva ner neonet');
  assert.ok(!/\.pgw \.rcrown/.test(pod), 'kronans stil får bara gälla podiet, inte Goal Pro');
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

test('Målets enhet följer Mäter', () => {
  const h = boot(['templatePgGoal'], { templatePgGoal: { x: { metric: 'follows', target: 50 } } });
  h.run(`selected='pg0'`);
  assert.match(h.window.props(), /Mål <b data-pgv="pgx_target" data-pgu="följare">50 följare<\/b>/);
});

// ---------------------------------------------------------------- sandlådan (▶ Testa widget, PR 11)
// Sandlådan spelar en klon med egen session och egen runtime-state. Sändningens S, STATE och
// instansregister rörs inte, och livevägen uppdaterar fortfarande alla riktiga instanser.
const klona = (h, id) => { const w = JSON.parse(JSON.stringify(h.window.eval(`state.widgets.find(x=>x.id==='${id}')`))); w.id = id + '__prov'; return w; };
const sandHost = h => {
  // jsdom saknar Element.animate (Top Streak Flips ring vid ny ledare); webbläsaren har den.
  if (!h.window.Element.prototype.animate) h.window.Element.prototype.animate = () => ({ onfinish: null, cancel() {} });
  const el = h.document.createElement('div'); el.className = 'pgw wroot'; h.document.body.append(el); return el; };
const tryck = h => JSON.stringify([h.window.VyraPlaygroundWidgets.session(), h.window.VyraPlaygroundWidgets.state, h.window.VyraPlaygroundWidgets.mounted()]);

test('sandlådan spelar på klonen och lämnar sändningens session orörd', () => {
  const h = boot(['templatePgPodium', 'templatePgStreak', 'templatePgGoal'], { templatePgGoal: { x: { design: '6', target: 2000 } } });
  h.gava({ username: 'riktig', giftName: 'Rose', diamonds: 5, coins: 5 });
  const fore = tryck(h);
  const malFore = host(h, 'goal').querySelector('.gv6 .big').textContent;
  const mal = h.window.VyraPlayground.sandlada(sandHost(h), klona(h, 'pg2'));
  mal.event({ type: 'gift', user: 'Alex', avatar: '', count: 1200, gift: { id: 'rose', n: 'Rose', e: '🌹', c: 1, img: '' } });
  const pod = sandHost(h), podium = h.window.VyraPlayground.sandlada(pod, klona(h, 'pg0'));
  podium.event({ type: 'gift', user: 'Leo', avatar: '', count: 1, gift: { id: 'crown', n: 'Crown', e: '👑', c: 799, img: '' } });
  const st = h.window.VyraPlayground.sandlada(sandHost(h), klona(h, 'pg1'));
  for (let i = 0; i < 12; i++) st.event({ type: 'gift', user: 'Alex', avatar: '', count: 1, gift: { id: 'cap', n: 'Cap', e: '🧢', c: 99, img: '' } });
  assert.equal(pod.querySelector('.pcol.r1 .nm').textContent, 'Leo', 'klonens podium visar testgivaren');
  assert.equal(pod.dataset.pgm, '1', 'scan() får aldrig montera klonen');
  assert.equal(tryck(h), fore, 'sändningens S, STATE och instansregister är oförändrade');
  assert.equal(host(h, 'goal').querySelector('.gv6 .big').textContent, malFore, 'den riktiga Goal Pro står kvar');
  assert.equal(host(h, 'podium').querySelector('.pcol.r1 .nm').textContent, 'riktig', 'det riktiga podiet visar bara den riktiga givaren');
  mal.destroy(); podium.destroy(); st.destroy();
  assert.equal(tryck(h), fore, 'destroy() rör inte heller sändningen');
});

test('livevägen uppdaterar fortfarande alla instanser efter en sandlåda, och live:start nollställer som förut', () => {
  const h = boot(['templatePgPodium', 'templatePgPodium', 'templatePgGoal', 'templatePgGoal'], { templatePgGoal: { x: { metric: 'coins', target: 2000 } } });
  const sb = h.window.VyraPlayground.sandlada(sandHost(h), klona(h, 'pg0'));
  sb.event({ type: 'gift', user: 'Leo', avatar: '', count: 1, gift: { id: 'crown', n: 'Crown', e: '👑', c: 799, img: '' } });
  sb.destroy();
  h.gava({ username: 'anna', giftName: 'Crown', diamonds: 799, coins: 799 });
  const pods = [...h.document.querySelectorAll('.pgw[data-pgkind="podium"]')].map(p => p.querySelector('.pcol.r1 .nm').textContent);
  assert.deepEqual(pods, ['anna', 'anna'], 'båda podierna fick den riktiga gåvan, ingen fick sandlådans');
  const pg = h.window.VyraPlaygroundWidgets;
  assert.deepEqual([pg.state.pg2.val, pg.state.pg3.val], [799, 799], 'båda målen räknade gåvan');
  assert.equal(JSON.stringify(Object.keys(pg.session().users)), '["anna"]');
  h.window.dispatchEvent(new h.window.CustomEvent('vyra-live-session', { detail: { event: 'live:start' } }));
  assert.equal(JSON.stringify(pg.session().users), '{}', 'live:start tömmer sessionen');
  assert.ok(!pg.state.pg2 || !pg.state.pg2.val, 'live:start nollställer målen');
});

test('panelen och testadaptern anropar aldrig resetAll, pgTest eller feed', () => {
  const panel = las('vyra-playground-panel.js').replace(/\/\/.*$/gm, '');
  assert.ok(!/\b(resetAll|pgTest|feed|routeLiveBattleEvent)\s*\(/.test(panel), 'panelen får bara spela i sandlådan');
  assert.match(panel, /P\.sandlada\(host, k\)/);
  const pg = las('playground-widgets.js');
  // pgTest ligger kvar men binds inte längre till någon knapp.
  assert.ok(!/data-pgtest/.test(pg.replace(/\/\/.*$/gm, '')), 'testraden ska inte ritas eller bindas');
  assert.match(pg, /function resetAll\(\)/);
  assert.match(pg, /if \(d && d\.event === 'live:start'\) resetAll\(\);/, 'live:start nollställer som förut');
});

// ---------------------------------------------------------------- vakter
test('modulen skriver aldrig direkt i sessionens localStorage-nycklar', () => {
  const kod = las('playground-widgets.js');
  assert.ok(!/localStorage\.(setItem|removeItem)/.test(kod), 'session-write-monopoly: skriv via save()');
  assert.ok(!/\.innerHTML\s*=\s*[^;]*\bev\./.test(kod));
});
