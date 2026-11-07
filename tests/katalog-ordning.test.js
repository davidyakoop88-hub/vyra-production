'use strict';
// KATALOGENS ORDNING (katalog-ordning.js, David 2026-11-03): 42 kort ut ur katalogen (50 sedan 2026-11-07), resten i grupper
// med flikar. Provet vaktar det David bad om — "när du ska ta bort de, de ska inte störa annat":
//   * de utgångna korten syns inte, men varje nyckel skapar fortfarande en widget (befintliga layouter),
//   * rubrikernas antal stämmer med korten som är kvar, och en tömd sektion syns inte,
//   * ordningen är Top Like → Top Gifter → Top Streak först, och ingen sektion flyttas i DOM:en,
//   * flikraden ligger utanför .widget-catalog, så katalogens knappar är alltid kort med nyckel.
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
test.after(closeAll);

function rigg() {
  const h = createDom({ url: 'https://vyralive.app/studio.html', state: { widgets: [], projectName: 'katalog' } });
  h.load('katalog-ordning.js');
  return h;
}
const kort = (nyckel, namn = nyckel) => `<button type="button" data-catalog-key="${nyckel}"><span><b>${namn}</b></span></button>`;
function katalog(h, sektioner) {
  const wrap = h.document.createElement('div');
  wrap.className = 'overlay-widget-gallery';
  wrap.innerHTML = '<div class="widget-catalog">' + sektioner.map(([rubrik, nycklar]) =>
    `<section><h4>${rubrik}</h4>${nycklar.map(n => kort(n)).join('')}</section>`).join('') + '</div>';
  h.document.body.append(wrap);
  const cat = wrap.querySelector('.widget-catalog');
  h.window.VyraKatalogOrdning.ordna(cat);
  return cat;
}

test('de utgångna korten tas ur katalogen, och rubrikens antal räknas om', () => {
  const h = rigg();
  const cat = katalog(h, [
    ['FIREWORKS & BUBBLES · 8 DESIGNER', ['catalog:giftfireworks:festival', 'catalog:giftfireworks:royal', 'catalog:giftfireworks:ice',
      'catalog:giftfireworks:rose', 'catalog:giftfireworks:comet', 'catalog:giftfireworks:supernova', 'catalog:heartfireworks', 'catalog:giftbubbles']],
    ['BATTLE MVP · FIRANDE · 8 KOREOGRAFIER', ['catalog:battlemvp:celebration:gold-ribbon', 'catalog:battlemvp:celebration:lion-clash',
      'catalog:battlemvp:celebration:coronation', 'catalog:battlemvp:celebration:wings', 'catalog:battlemvp:celebration:portal',
      'catalog:battlemvp:celebration:rosegold', 'catalog:battlemvp:celebration:pearl', 'catalog:battlemvp:celebration:moon']]
  ]);
  const [fw, mvp] = cat.querySelectorAll('section');
  assert.deepEqual([...fw.querySelectorAll('[data-catalog-key]')].map(b => b.dataset.catalogKey), ['catalog:giftfireworks:supernova', 'catalog:giftbubbles'],
    'bara Supernova och Gift Bubbles ska vara kvar');
  assert.equal(fw.querySelector('h4').textContent, 'FIREWORKS & BUBBLES · 2 DESIGNER');
  assert.deepEqual([...mvp.querySelectorAll('[data-catalog-key]')].map(b => b.dataset.catalogKey),
    ['catalog:battlemvp:celebration:gold-ribbon', 'catalog:battlemvp:celebration:lion-clash']);
  assert.equal(mvp.querySelector('h4').textContent, 'BATTLE MVP · FIRANDE · 2 KOREOGRAFIER');
});

test('en sektion vars alla kort gått ut syns inte; en orörd sektion behåller sin rubrik', () => {
  const h = rigg();
  const cat = katalog(h, [
    ['LIKE FOUNTAIN · PORTAL', ['catalog:likefountain:portal:neon', 'catalog:likefountain:portal:fire']],
    ['HEART ME GOAL · VARJE TEMA SEPARAT', ['catalog:heartgoal:classic']]
  ]);
  const [lf, hg] = cat.querySelectorAll('section');
  assert.ok(lf.classList.contains('kat-tom'), 'den tomma sektionen ska döljas');
  assert.ok(!hg.classList.contains('kat-tom'));
  assert.equal(hg.querySelector('h4').textContent, 'HEART ME GOAL · VARJE TEMA SEPARAT');
  assert.equal(hg.dataset.katRensad, undefined, 'en sektion utan utgångna kort ska inte röras');
});

// David 2026-11-07: "Ljus och rörelse" ut, men Fokus/Classic/Gåvoflöde ligger i samma sektion under
// en egen rubrik. Den gamla rubriken ska inte stå tom ovanför den nya.
test('en rubrik vars kort gått ut göms, nästa rubrik i samma sektion står kvar', () => {
  const h = rigg();
  const cat = katalog(h, []);
  const sek = h.document.createElement('section');
  sek.dataset.campaignTemplate = '1';
  sek.innerHTML = '<h4>GIFT CAMPAIGN · LJUS OCH RÖRELSE</h4>'
    + ['gold', 'platinum', 'emerald'].flatMap(t => ['landscape', 'portrait'].map(o => kort(`catalog:giftcampaign:${t}:${o}`))).join('')
    + '<h4>GIFT CAMPAIGN · EN GÅVA I FOKUS</h4>' + kort('catalog:giftcampaign:fokus:landscape') + kort('catalog:giftcampaign:fokus:portrait');
  cat.append(sek);
  h.window.VyraKatalogOrdning.ordna(cat);
  const [gammal, ny] = sek.querySelectorAll(':scope > h4');
  assert.deepEqual([...sek.querySelectorAll('[data-catalog-key]')].map(b => b.dataset.catalogKey),
    ['catalog:giftcampaign:fokus:landscape', 'catalog:giftcampaign:fokus:portrait']);
  assert.ok(gammal.classList.contains('kat-tom-rubrik'), 'den tomma rubriken ska gömmas');
  assert.ok(!ny.classList.contains('kat-tom-rubrik'));
  assert.ok(!sek.classList.contains('kat-tom'), 'sektionen har kort kvar och ska synas');
  assert.equal(sek.dataset.katGrupp, 'mal');
});

test('VIDEO FX-rubrikens antal räknas om när paket går ut', () => {
  const h = rigg();
  const cat = katalog(h, []);
  const block = h.document.createElement('div');
  block.dataset.videoPacks = '1';
  block.innerHTML = '<section><h4>Battle-paket · VIDEO FX · 5 paket</h4><div>'
    + ['koiPearl', 'masquerade', 'pinkPrincess', 'royalRuby', 'cloudFox'].map(p => kort(`catalog:glovesnipe:${p}:pack:2`)).join('') + '</div></section>';
  cat.append(block);
  h.window.VyraKatalogOrdning.ordna(cat);
  assert.equal(block.querySelector('h4').textContent, 'Battle-paket · VIDEO FX · 3 paket');
  assert.deepEqual([...block.querySelectorAll('[data-catalog-key]')].map(b => b.dataset.catalogKey.split(':')[2]), ['pinkPrincess', 'royalRuby', 'cloudFox']);
});

test('varje utgången nyckel skapar fortfarande en widget — layouter som redan har dem går inte sönder', () => {
  const h = rigg();
  h.load('widget-factory.js');
  const { UTGANGNA } = h.window.VyraKatalogOrdning;
  assert.equal(UTGANGNA.size, 50);
  for (const n of UTGANGNA) {
    let w;
    assert.doesNotThrow(() => { w = h.window.VyraWidgets.create(n); }, `${n} kan inte längre skapas`);
    assert.ok(w && w.type, `${n} gav ingen widget`);
  }
});

test('ordningen: Top Like, Top Gifter och Top Streak först — med CSS order, utan att flytta sektionerna', () => {
  const h = rigg();
  const cat = katalog(h, [
    ['FIREWORKS & BUBBLES · 2 DESIGNER', ['catalog:giftbubbles']],
    ['VYRA TOP STREAK', ['catalog:topstreak']],
    ['FOLLOWER, LIKE & DIAMOND GOALS · 18 RÖRLIGA DESIGNER', ['catalog:socialgoal:x']],
    ['TOP GIFT · DESIGNVAL', ['catalog:topgift:x']],
    ['RANKING · SAMMA DESIGN FÖR TOP LIKE, TOP COINS OCH TOP POINTS', ['catalog:toplike:voltage']],
    ['BERTIL PAKET', ['catalog:vyrapaket:bertil']]
  ]);
  const fore = [...cat.children].map(s => s.querySelector('h4').textContent);
  const visad = [...cat.children].sort((a, b) => +a.style.order - +b.style.order).map(s => s.dataset.katGrupp);
  assert.deepEqual(visad, ['toplike', 'topgifter', 'topstreak', 'mal', 'effekter', 'ovrigt']);
  assert.deepEqual([...cat.children].map(s => s.querySelector('h4').textContent), fore, 'sektionerna får inte flyttas i DOM:en');
});

test('Video FX-blocket (en sektion i en <div>) sorteras som en enhet under Battle', () => {
  const h = rigg();
  const cat = katalog(h, [['VYRA TOP STREAK', ['catalog:topstreak']]]);
  const block = h.document.createElement('div');
  block.dataset.videoPacks = '1';
  block.innerHTML = `<section><h4>Battle-paket · VIDEO FX · 2 paket</h4><div>${kort('catalog:glovesnipe:koiPearl:pack:2')}${kort('catalog:glovesnipe:cloudFox:pack:2')}</div></section>`;
  cat.prepend(block);
  h.window.VyraKatalogOrdning.ordna(cat);
  assert.equal(block.dataset.katGrupp, 'battle');
  assert.ok(+block.style.order > +cat.querySelector(':scope > section').style.order, 'Video FX får inte hamna före Top Streak');
});

test('flikarna ligger utanför katalogen och visar bara den valda gruppen; valet sparas', () => {
  const h = rigg();
  const cat = katalog(h, [
    ['RANKING · SAMMA DESIGN FÖR TOP LIKE, TOP COINS OCH TOP POINTS', ['catalog:toplike:voltage']],
    ['VYRA TOP STREAK', ['catalog:topstreak']]
  ]);
  const rad = cat.parentElement.querySelector(':scope > .kat-flikar');
  assert.ok(rad && rad.compareDocumentPosition(cat) & 4, 'flikraden ska ligga före katalogen');
  // Sökningens nollträffsruta letar efter sig själv som catalog.previousElementSibling — den platsen är dess.
  const tom = h.document.createElement('div'); tom.className = 'katalog-nolltraff';
  cat.before(tom);
  h.window.VyraKatalogOrdning.ordna(cat);
  assert.equal(cat.previousElementSibling, tom, 'flikraden får inte tränga sig mellan nollträffsrutan och katalogen');
  assert.equal(cat.parentElement.querySelectorAll('.kat-flikar').length, 1, 'en flikrad, inte två');
  assert.equal(cat.querySelectorAll('button:not([data-catalog-key])').length, 0, 'katalogen får bara innehålla kort med nyckel');
  assert.equal(rad.querySelector('[aria-selected="true"]').dataset.katFlik, 'alla', 'förvalet är Alla');
  assert.ok(rad.querySelector('[data-kat-flik="battle"]').hidden, 'en grupp utan sektioner ska inte ha en flik');
  rad.querySelector('[data-kat-flik="topstreak"]').click();
  const [rank, streak] = cat.querySelectorAll('section');
  assert.ok(rank.classList.contains('kat-utanfor') && !streak.classList.contains('kat-utanfor'));
  assert.equal(h.window.localStorage.getItem('vyra-katalog-flik'), 'topstreak');
  // Medan man söker visas alla grupper, så att en vald flik inte gömmer en träff.
  const sok = h.document.createElement('input');
  sok.className = 'widget-search'; sok.value = 'voltage';
  cat.parentElement.prepend(sok);
  h.window.VyraKatalogOrdning.ordna(cat);
  assert.ok(!rank.classList.contains('kat-utanfor'), 'sökningen ska gälla hela katalogen');
  sok.value = '';
  h.window.VyraKatalogOrdning.ordna(cat);
  assert.ok(rank.classList.contains('kat-utanfor'), 'utan sökning gäller fliken igen');
  rad.querySelector('[data-kat-flik="alla"]').click();
  assert.ok(!rank.classList.contains('kat-utanfor'));
});

test('ordna() är idempotent — andra varvet ändrar ingenting, så observatören somnar', () => {
  const h = rigg();
  const cat = katalog(h, [['FIREWORKS & BUBBLES · 8 DESIGNER', ['catalog:giftfireworks:festival', 'catalog:giftbubbles']]]);
  const andringar = [];
  const obs = new h.window.MutationObserver(m => andringar.push(...m));
  obs.observe(cat.parentElement, { childList: true, subtree: true, attributes: true, characterData: true });
  h.window.VyraKatalogOrdning.ordna(cat);
  assert.equal(obs.takeRecords().length + andringar.length, 0);
  obs.disconnect();
});

// David 2026-11-06: paketen ska ligga i EN box, ett kort per paket — inte en box per paket.
test('VIDEO FX-paketen byggs som en enda sektion med ett kort per paket', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'media.js'), 'utf8');
  const rad = src.split(/\r?\n/).find(r => r.startsWith('const videoPackCatalog=bind;'));
  assert.ok(rad, 'videoPackCatalog saknas i media.js');
  assert.equal(rad.split("createElement('section')").length - 1, 1, 'paketen ska dela en sektion');
  assert.ok(rad.includes('packIds.map('), 'ett kort per paket i samma sektion');
  assert.match(rad, /Battle-paket · VIDEO FX/);
});

test('laddas via skript-svansen i media.js', () => {
  const kod = require('node:fs').readFileSync('media.js', 'utf8');
  assert.match(kod, /katalog-ordning\.js\?v=/);
  assert.match(kod, /katalog-ordning\.css\?v=/);
});
