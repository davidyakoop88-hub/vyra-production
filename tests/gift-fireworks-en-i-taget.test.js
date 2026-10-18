'use strict';
// ETT FYRVERKERI I TAGET SOM STANDARD (användarens beslut 2026-10-18).
//
// Under LIVE 2026-10-17 kom tre gåvor med ett par sekunders mellanrum och spelades i tre filer
// samtidigt — tre fyrverkerier bredvid varandra. Uppdraget: "ett fyrverkeri i taget som standard,
// nästa startar efter cirka 3 s, och kön trycks ihop när den blir lång". Ett uttryckligt val av fler
// "Samtidiga fyrverkerier" (fwLanes) ska fortfarande gälla.
//
// Proven går hela vägen: routeLiveBattleEvent -> gift-fireworks-session.js -> triggerGiftFireworks
// -> renderarens .fw-event-noder, med en egen klocka (Date.now + setTimeout) så att tidslinjen är
// exakt och oberoende av maskinens last. Temat är festival, katalogens första och nya widgetars
// standard; toppen kommer då från festivalmotorns egen tabell.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test.afterEach(async () => { await new Promise(setImmediate); closeAll(); });

const fw = (over = {}) => Object.assign({
  id: 'fw1', type: 'templateGiftFireworks', x: 36, y: 120, width: 360, title: 'Gift Fireworks',
  fwTheme: 'festival', fwMin: 1, fwSpeed: 0.6, fwDuration: 5, fwGiftSize: 110,
  fwExplosion: 100, fwDensity: 70, fwSound: false
}, over);

function boot(widgets = [fw()]) {
  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout', state: { widgets, projectName: 'fw' } });
  for (const f of ['overlay-sanitize.js', 'gift-festival-engine.js', 'gift-supernova-engine.js', 'gift-fireworks.js', 'gift-fireworks-session.js']) h.load(f);
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`state.widgets.length=0;${widgets.map(w => `state.widgets.push(${JSON.stringify(w)})`).join(';')};view='editor';
    document.querySelector('#view').innerHTML='<div class="editor-shell"><div class="canvas">'+state.widgets.map(wh).join('')+'</div></div>';`);
  // Egen klocka: både kön (root.setTimeout) och renderaren (setTimeout, Date.now) går på den.
  let nu = 1_000_000, seq = 0;
  const timers = new Map();
  h.window.Date.now = () => nu;
  h.window.setTimeout = (fn, ms) => { timers.set(++seq, { fn, at: nu + Math.max(0, Number(ms) || 0) }); return seq };
  h.window.clearTimeout = id => { timers.delete(id) };
  const T0 = nu;
  const starter = [];
  run(`{const org=window.triggerGiftFireworks;window.triggerGiftFireworks=function(p){const r=org.apply(this,arguments);if(r!==false)window.__start(p);return r}}`);
  h.window.__start = p => starter.push({ id: p.id, user: p.username, t: nu - T0, tempo: p.__tempo || 1, coins: p.coins, sammanslagna: p.sammanslagna || 1 });
  const fx = () => h.document.querySelector('[data-id="fw1"] .gift-fireworks-fx');
  const noder = () => [...fx().querySelectorAll(':scope > .fw-event')].filter(n => Number(n.dataset.expires) > nu);
  const otoppade = () => noder().filter(n => Number(n.dataset.release) > nu);
  const tick = ms => {
    const mal = nu + ms;
    for (;;) {
      const next = [...timers].filter(([, t]) => t.at <= mal).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      timers.delete(next[0]); nu = next[1].at; next[1].fn();
    }
    nu = mal;
  };
  let n = 0;
  const gava = (over = {}) => h.window.routeLiveBattleEvent(Object.assign(
    { id: 'g' + (++n), type: 'gift', username: 'u' + n, giftName: 'Rose', coins: 1, count: 1 }, over));
  return { h, run, gava, starter, tick, noder, otoppade, fx, tid: () => nu - T0, api: () => h.window.VyraGiftFireworks };
}

// ---- (a) standard är ett i taget -------------------------------------------------------------------

test('(a) utan sparat fwLanes är standard ett fyrverkeri i taget, i renderaren och i panelen', () => {
  const { h, gava, starter, api } = boot();
  assert.equal(h.window.VyraFireworks.lanesFor(), 1);
  for (let i = 0; i < 3; i++) gava();
  assert.equal(starter.length, 1, 'tre gåvor ska inte starta tre fyrverkerier samtidigt');
  assert.equal(api().koLangd(), 2);
  // Panelens reglage visar samma standard som renderaren använder.
  assert.match(las('gift-supernova-panel.js'), /fwLanes:\['Samtidiga fyrverkerier',1,5,1,1,/);
  assert.match(las('gift-fireworks.js'), /const fwFiler=w=>Math\.min\(5,Math\.max\(1,Math\.round\(Number\(w\.fwLanes\)\|\|1\)\)\)/);
});

test('(a) ett direkt Action-anrop väntar också på toppen i stället för att lägga sig bredvid', () => {
  const { h, tick, noder } = boot();
  h.window.triggerGiftFireworks({ id: 'a', username: 'a', coins: 1 });
  h.window.triggerGiftFireworks({ id: 'b', username: 'b', coins: 1 });
  assert.equal(noder().length, 1);
  assert.equal(h.window.VyraFireworks.pending(), 1);
  tick(3089); assert.equal(noder().length, 1, 'b startade före a:s topp');
  tick(2); assert.equal(noder().length, 2, 'b startade inte vid a:s topp');
  assert.equal(noder()[1].dataset.lane, '0', 'med en fil startar nästa i mitten, inte åt sidan');
});

// ---- (b) tre gåvor: i tur och ordning, ca 3 s, högst en utfasning -----------------------------------

test('(b) tre gåvor startar i tur och ordning med cirka 3 s mellanrum och överlappar högst en utfasning', () => {
  const { gava, starter, tick, noder, otoppade } = boot();
  // Som i sändningen: tre gåvor med ett par sekunders mellanrum.
  gava({ username: 'anna' }); tick(1500); gava({ username: 'bea' }); tick(1500); gava({ username: 'cem' });
  let flestOtoppade = 0, flestSynliga = 0;
  for (let t = 0; t < 15000; t += 50) {
    tick(50);
    flestOtoppade = Math.max(flestOtoppade, otoppade().length);
    // En kortad nod (dataset.kortad) tonar ut på 300 ms och räknas inte som en utfasning.
    flestSynliga = Math.max(flestSynliga, noder().filter(n => !n.dataset.kortad).length);
  }
  assert.deepEqual(starter.map(s => s.user), ['anna', 'bea', 'cem']);
  const avstand = starter.slice(1).map((s, i) => s.t - starter[i].t);
  // Festivalens enkla sol + fyra hjärtan har slagit ut 3,09 s in, och kön lägger till 100 ms.
  assert.deepEqual(avstand, [3190, 3190]);
  for (const a of avstand) assert.ok(a >= 2500 && a <= 3500, `${a} ms är inte "cirka 3 s"`);
  assert.equal(flestOtoppade, 1, 'två fyrverkerier var på väg upp samtidigt');
  assert.ok(flestSynliga <= 2, `${flestSynliga} fyrverkerier syntes samtidigt — högst ett nytt + en utfasning`);
});

test('(b) toppen i köns bokföring är festivalmotorns egen tidslinje, inte ett hårdkodat tal', () => {
  // Tabellen i gift-festival-engine.js (SISTA_SMALL) mot en riktig renderares toppen(): sista
  // smällens `at` + 1 s. Glider de isär är det tabellen som ljuger, och då startar kön för tidigt.
  const c = { Image: class { set src(_) { this.onload?.() } }, addEventListener() {}, crypto: require('node:crypto').webcrypto,
    VyraSafe: { src: (v, f) => v || f } };
  c.window = c; vm.createContext(c);
  for (const f of ['vfx-rng.js', 'gift-festival-engine.js', 'gift-natural-engine.js']) vm.runInContext(las(f), c, { filename: f });
  for (const combo of [1, 10, 100]) for (const theme of ['festival', 'royal', 'ice', 'rose', 'comet', 'supernova']) for (const seed of [1, 7, 99]) {
    const r = c.VyraFestival.create({ combo, theme, seed, variantIndex: seed });
    assert.equal(r.toppen(), c.VyraFestival.toppen(combo), `festival ${combo}/${theme}/${seed}`);
    assert.ok(r.toppen() < r.duration(), 'toppen måste ligga före slutet, annars blir det ingen utfasning');
    // Natural är bara reserv när festivalmotorn saknas; dess skott har slumpad tid (±0,1 s).
    const n = c.VyraNatural.create({ combo, theme, seed, variantIndex: seed });
    assert.ok(Math.abs(n.toppen() - c.VyraNatural.toppen(combo, theme)) <= 0.15, `natural ${combo}/${theme}/${seed}`);
  }
  assert.equal(c.VyraFestival.toppen(1), 1.55 + 3 * .18 + 1);
});

// ---- (c) en kö på 30 töms inom regeln --------------------------------------------------------------

test('(c) trettio gåvor från trettio avsändare: tempot höjs och ingen gåva spelas mer än 60 s efteråt', () => {
  const { gava, starter, tick, api } = boot();
  for (let i = 0; i < 30; i++) gava();
  tick(120000);
  const r = api().regler;
  assert.equal(starter.length + api().forsenade(), 30, 'en gåva försvann utan att spelas eller räknas');
  assert.equal(api().koLangd(), 0);
  const sist = Math.max(...starter.map(s => s.t));
  assert.ok(sist <= r.MAX_ALDER_MS, `sista gåvan startade ${sist} ms efter att den kom`);
  // Den första startar direkt i en tom kö; bakom den väntar 29.
  assert.equal(starter[0].tempo, 1);
  assert.equal(starter[1].tempo, 2, '29 väntande ska ge dubbelt tempo');
  assert.equal(starter.at(-1).tempo, 1, 'den sista i en kort kö spelar i normal fart');
  // Med tempo 2 ligger toppen på 3,09 / 2 = 1,545 s; kön lägger till 100 ms.
  assert.equal(starter[2].t - starter[1].t, 1645);
  assert.ok(sist >= 40000, `kön tömdes på ${sist} ms — tempot är högre än regeln (högst 2)`);
});

test('(c) samma avsändares gåvor slås ihop med summerat värde när kön är lång', () => {
  const { gava, starter, tick, api, h } = boot();
  // Tre avsändare, tio rosor var för 50 mynt. Totalt 1500 mynt får inte bli 30 fyrverkerier.
  for (let i = 0; i < 30; i++) gava({ username: ['anna', 'bea', 'cem'][i % 3], coins: 50 });
  tick(120000);
  assert.ok(api().ihopslagna() > 0);
  assert.ok(starter.length < 10, `${starter.length} fyrverkerier för tre avsändare`);
  const summa = starter.reduce((s, x) => s + Number(x.coins), 0);
  assert.equal(summa, 1500, 'värdet ska summeras, aldrig tappas');
  assert.ok(starter.some(s => s.sammanslagna > 1));
  // Det summerade värdet styr nivån: 50 mynt är en enkel tändning, en ihopslagen post på
  // flera hundra mynt är ett firande (fwFinal 1000 -> firande från 100).
  const stor = starter.find(s => Number(s.coins) >= 100);
  assert.ok(stor, 'ingen ihopslagen post nådde firandet');
  assert.equal(h.window.VyraFireworks.releaseFor({ coins: stor.coins }), 7000);
});

test('(c) en gåva som väntat mer än 60 s spelas inte, och räknas', () => {
  const { h, gava, starter, tick, api } = boot();
  // Ett fyrverkeri som håller filen i 70 s (ett påhittat, extremt långt) — gåvan bakom det blir för gammal.
  const org = h.window.VyraFireworks.releaseFor;
  h.window.VyraFireworks.releaseFor = input => input.id === 'g1' ? 70000 : org(input);
  h.window.VyraFireworks.capacityFor = () => true;
  gava(); gava(); gava();
  tick(69000); assert.equal(starter.length, 1);
  tick(2000);
  assert.equal(api().forsenade(), 2);
  assert.equal(starter.length, 1, 'en 70 s gammal gåva spelades ändå');
  gava(); assert.equal(starter.length, 2, 'kön fastnade efter att gamla gåvor kastats');
});

// ---- (d) uttryckligt val på 3 ----------------------------------------------------------------------

test('(d) ett sparat val på 3 ger fortfarande tre samtidiga, i tre filer', () => {
  const { h, gava, starter, noder, api } = boot([fw({ fwLanes: 3 })]);
  assert.equal(h.window.VyraFireworks.lanesFor(), 3);
  for (let i = 0; i < 4; i++) gava();
  assert.equal(starter.length, 3);
  assert.equal(api().koLangd(), 1);
  assert.deepEqual(noder().map(n => n.dataset.lane), ['0', '1', '2']);
});
