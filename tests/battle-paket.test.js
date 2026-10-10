'use strict';
// VIDEO FX SOM HELT PAKET — en widget i layoutens bredd, klippet valt av eventet.
//
// Uppmätt i Davids sändning 2026-10-09 (Record_2026-10-09-21-02-23.mp4 + TikTok LIVE Studios
// logg): katalogen gav fem widgetar per paket men addBoostPack lät bara den sist tillagda leva;
// den (Pink Princess Snipe) spelade SITT klipp vid varje boost-fönster, beskuret till en 190 px
// kvadrat nere i mitten. X2/X3/Tap/Glove visades aldrig. Automatmotorn (battle-fx-auto.js)
// spelade ingenting alls eftersom overlaylänken saknade `&scene=1` och action-runtimen då nekar.
//
// Kontraktet som vaktas här:
//   1. `catalog:glovesnipe:<paket>:pack` ger EN widget, 432 bred (duken), battleEventKind 'pack'.
//   2. Widgeten ritas som en hel 16:9-film, utan symbolruta och utan cover-beskärning.
//   3. VyraBattlePaket.spela(nyckel) byter klipp och tänder noden UTAN save() och UTAN render().
//   4. Direktanrop (testknapp, rigg) spelar i widgeten; ett LIVE-event lämnas åt motorn när den
//      finns, så samma boost inte spelas två gånger.
//   5. Katalogen bygger en knapp per paket, inte fem.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.after(closeAll);
const ROOT = path.join(__dirname, '..');
const MEDIA = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');

function boot(widgets) {
  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout', state: { widgets, projectName: 'paket' } });
  h.load('overlay-sanitize.js');
  h.load('media.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  // Räknare på save/render: uppspelningen får inte röra state eller bygga om duken (kontraktet).
  run(`window.__saves=0;window.__renders=0;{const s=save,r=render;save=function(){window.__saves++;return s.apply(this,arguments)};render=function(){window.__renders++;return r.apply(this,arguments)}}`);
  // `state` är en lexikal global i studio.js (const), inte window.state — nås via eval i fönstret.
  return { h, run, w: h.window, st: h.window.eval('state') };
}

test('katalognyckeln :pack ger en widget i dukens bredd', () => {
  const { w } = boot([]);
  const p = w.VyraWidgets.create('catalog:glovesnipe:pinkPrincess:pack:2');
  assert.equal(p.type, 'templateGloveSnipe');
  assert.equal(p.battleEventKind, 'pack');
  assert.equal(p.boostPack, 'pinkPrincess');
  assert.equal(p.x, 0, 'börjar vid vänsterkanten');
  assert.equal(p.width, 432, 'lika bred som duken (432 = editorns 9:16-duk)');
  // 16:9 i 432 bredd = 243 px hög; hela filmen ska rymmas på duken (768).
  assert.ok(p.y + 243 <= 768, `filmen slutar vid ${p.y + 243}, under dukens nederkant 768`);
  assert.ok(p.title.includes('Pink Princess'), p.title);
  // Gamla per-klipp-nycklar lever kvar så sparade layouter fortsätter fungera.
  const gammal = w.VyraWidgets.create('catalog:glovesnipe:pinkPrincess:snipe:2');
  assert.equal(gammal.battleEventKind, 'snipe');
  assert.throws(() => w.VyraWidgets.create('catalog:glovesnipe:pinkPrincess:felstavat'), /Okänd battle-typ/);
});

test('paketwidgeten ritas som en hel film, ingen symbolruta', () => {
  const { h, w, st } = boot([]);
  const p = w.VyraWidgets.create('catalog:glovesnipe:pinkPrincess:pack:2');
  st.widgets.push(p);
  const canvas = h.paint(st.widgets);
  const nod = canvas.querySelector(`.battle-pack-full[data-id="${p.id}"]`);
  assert.ok(nod, 'widgeten ritades inte som .battle-pack-full');
  assert.equal(nod.querySelector('.battle-image-symbol'), null, 'den gamla symbolrutan ska inte finnas');
  assert.equal(nod.querySelector('.battle-copy'), null, 'ingen ×2-text ovanpå filmen');
  const v = nod.querySelector('video.pack-fx-video');
  assert.ok(v, 'ingen <video> i widgeten');
  assert.match(v.getAttribute('src'), /assets\/videos\/battle\/pink-princess\/x2\.webm$/);
  assert.match(v.getAttribute('poster'), /x2\.jpg$/);
  assert.equal(v.hasAttribute('autoplay'), false, 'ska inte spela i vila');
  assert.equal(v.hasAttribute('loop'), false, 'klippet ska spelas en gång');
  // Affischen ar ett syskon till videon (visas bara nar videon star stilla, se spela()-provet).
  const bild = nod.querySelector('img.pack-fx-poster');
  assert.ok(bild, 'affischbilden saknas');
  assert.match(bild.getAttribute('src'), /x2\.jpg$/);
  assert.match(nod.getAttribute('style'), /width:432px/);
});

test('spela() byter klipp och tänder noden utan save och utan render', () => {
  const { h, w, st } = boot([]);
  const p = w.VyraWidgets.create('catalog:glovesnipe:pinkPrincess:pack:2');
  st.widgets.push(p);
  h.paint(st.widgets);
  const nod = h.document.querySelector(`.battle-pack-full[data-id="${p.id}"]`), v = nod.querySelector('video');
  const saves = w.__saves, renders = w.__renders;
  assert.equal(w.VyraBattlePaket.spela('snipe'), true);
  assert.match(v.getAttribute('src'), /snipe\.webm$/);
  assert.ok(nod.classList.contains('pack-active'), 'noden tändes inte');
  assert.equal(nod.dataset.klipp, 'snipe');
  // UPPSPELNINGEN STARTAR SOM DEN GAMLA WIDGETEN: autoplay satt vid spela(), borta efter stang().
  // Uppmatt 2026-10-10: play() fran skript loste utan fel i ett dolt dokument medan videon stod
  // kvar pa bildruta 0 — och TikTok LIVE Studio visade inget pa en hel sandning.
  assert.equal(v.hasAttribute('autoplay'), true, 'autoplay saknas vid uppspelning');
  assert.equal(v.preload, 'auto', 'preload ska vara auto vid uppspelning');
  assert.match(nod.querySelector('img.pack-fx-poster').getAttribute('src'), /snipe\.jpg$/, 'affischen foljer inte klippet');
  assert.equal(w.__saves, saves, 'uppspelningen anropade save()');
  assert.equal(w.__renders, renders, 'uppspelningen byggde om duken');
  assert.equal(w.VyraBattlePaket.spela('boost-x3'), true);
  assert.match(v.getAttribute('src'), /x3\.webm$/);
  w.VyraBattlePaket.stang(p.id);
  assert.ok(!nod.classList.contains('pack-active'), 'stang() släckte inte noden');
  assert.equal(v.hasAttribute('autoplay'), false, 'autoplay ska bort i vila, annars spelar klippet om vid nasta omladdning');
  assert.ok(!nod.classList.contains('pack-stilla'), 'stang() tog inte bort affischlaget');
  assert.equal(w.VyraBattlePaket.spela('finns-inte'), false, 'okänd nyckel spelar inget');
});

test('klippet väljs av eventet: tap, snipe, 2 → X2, 3 → X3, annars glove', () => {
  const { w } = boot([]);
  const f = w.VyraBattlePaket.klippFor;
  assert.equal(f({ kind: 'tap' }), 'tap');
  assert.equal(f({ kind: 'snipe' }), 'snipe');
  assert.equal(f({ kind: 'glove', multiplier: 2 }), 'boost-x2');
  assert.equal(f({ kind: 'glove', multiplier: 3 }), 'boost-x3');
  assert.equal(f({ kind: 'glove', multiplier: 5 }), 'glove', 'Boosting Glove är 5x');
  assert.equal(f({ kind: 'boost', multiplier: 3 }), 'boost-x3');
  assert.equal(f({ kind: 'boost' }), 'boost-x2');
  assert.equal(f({}), 'glove');
  // MP4-paketen har inget Snipe-klipp; de övriga fyra finns.
  assert.equal(w.VyraBattlePaket.fil({ boostPack: 'koiPearl' }, 'snipe'), null);
  assert.equal(w.VyraBattlePaket.fil({ boostPack: 'koiPearl' }, 'boost-x2'), 'assets/videos/battle/koi-pearl/boost-x2.mp4');
  assert.equal(w.VyraBattlePaket.fil({ boostPack: 'pinkPrincess' }, 'snipe'), 'assets/videos/battle/pink-princess/snipe.webm');
  assert.equal(w.VyraBattlePaket.fil({ boostPack: 'okänt' }, 'tap'), null);
});

test('testknappen spelar i widgeten; ett live-event lämnas åt motorn', () => {
  const { h, w, st } = boot([]);
  const p = w.VyraWidgets.create('catalog:glovesnipe:pinkPrincess:pack:2');
  st.widgets.push(p);
  h.paint(st.widgets);
  const nod = h.document.querySelector(`.battle-pack-full[data-id="${p.id}"]`);
  // Direkt (panelens knapp, visuella riggen): widgeten spelar klippet eventet pekar ut.
  w.triggerGloveSnipe({ kind: 'glove', multiplier: 3 });
  assert.equal(nod.dataset.klipp, 'boost-x3');
  assert.ok(nod.classList.contains('pack-active'));
  w.VyraBattlePaket.stang(p.id);
  // Live utan motorn (gammal overlay, prov): widgeten spelar ändå.
  w.routeLiveBattleEvent({ id: 'e1', type: 'glove', multiplier: 2 });
  assert.equal(nod.dataset.klipp, 'boost-x2', 'utan battle-fx-auto ska live-eventet spela i widgeten');
  w.VyraBattlePaket.stang(p.id);
  delete nod.dataset.klipp;
  // Live MED motorn: motorn äger tajmingen (Tap Tap vid start, Glove 30 s före boostens slut …)
  // och spelar själv genom VyraBattlePaket — triggern får inte spela en gång till.
  w.VyraBattleFx = { hantera: () => 'simulerad motor' };
  w.routeLiveBattleEvent({ id: 'e2', type: 'glove', multiplier: 2 });
  assert.equal(nod.dataset.klipp, undefined, 'live-eventet spelades av triggern trots att motorn finns');
  assert.ok(!nod.classList.contains('pack-active'));
});

test('en vanlig Glove Snipe påverkas inte av paketvägen', () => {
  // Bärande: den gamla widgeten (kind boost/glove/tap/snipe) ska tändas som förut, även med motorn.
  const { h, w, st } = boot([]);
  const g = w.VyraWidgets.create('catalog:glovesnipe:koiPearl:boost:2');
  st.widgets.push(g);
  h.paint(st.widgets);
  w.VyraBattleFx = { hantera: () => 'simulerad motor' };
  w.routeLiveBattleEvent({ id: 'e3', type: 'glove', multiplier: 3 });
  // triggerGloveSnipe skriver eventets multiplikator på den widget den valde: 3 bevisar att den
  // klassiska widgeten inte sållades bort av paketfiltret (harnessens render() bygger ingen duk,
  // så glove-active kan inte mätas här — tests/browser/glove-snipe-inom-rutan gör det i Chromium).
  assert.equal(g.gloveMultiplier, 3, 'den klassiska Glove Snipe tändes inte av live-eventet');
});

test('katalogen bygger en knapp per paket — hela paketet', () => {
  const at = MEDIA.indexOf('const videoPackCatalog=bind;');
  const sektion = MEDIA.slice(at, MEDIA.indexOf('\n', at));
  assert.ok(sektion.includes('data-vk="pack"'), 'ingen paketknapp i katalogsektionen');
  for (const kind of ['boost', 'tap', 'glove', 'snipe']) {
    assert.ok(!sektion.includes(`data-vk="${kind}"`), `per-klipp-knappen ${kind} finns kvar i katalogen`);
  }
  assert.ok(sektion.includes('hela paketet'));
  // Nyckeln publiceras på knappen vid byggtid, som förut (tests/catalog-rewiring.test.js).
  assert.ok(sektion.includes("const catalogKey='catalog:glovesnipe:'+b.dataset.vp+':'+b.dataset.vk+':'+(+b.dataset.vm)"));
});

test('egenskapspanelen har testknappar för varje klipp i paketet', () => {
  const { h, w, run, st } = boot([]);
  const p = w.VyraWidgets.create('catalog:glovesnipe:pinkPrincess:pack:2');
  st.widgets.push(p);
  run(`selected=${JSON.stringify(p.id)};view='editor'`);
  const html = w.props();
  const knappar = [...html.matchAll(/data-paket-test="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(knappar, ['boost-x2', 'boost-x3', 'tap', 'glove', 'snipe']);
  assert.ok(html.includes('id="propWidth"') && html.includes('id="propX"'), 'position/storlek saknas i panelen');
  // MP4-paketet saknar Snipe — då ska knappen inte visas.
  const k = w.VyraWidgets.create('catalog:glovesnipe:koiPearl:pack:2');
  st.widgets.push(k);
  run(`selected=${JSON.stringify(k.id)}`);
  const html2 = w.props();
  assert.deepEqual([...html2.matchAll(/data-paket-test="([^"]+)"/g)].map(m => m[1]), ['boost-x2', 'boost-x3', 'tap', 'glove']);
});
