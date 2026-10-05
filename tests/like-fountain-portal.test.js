'use strict';
// LIKE FOUNTAIN · PORTAL — räknesättet (like-fountain-portal.js), utan webbläsare.
//
// Tre löften vaktas här: hjärtan landar aldrig på varandra (platserna), ett like-paket ger en skur
// med tak (inte en klump), och historik som spelas upp vid sidladdning sprutar inga hjärtan.
// Det levande förloppet (event -> hjärtan på duken) provas i tests/browser/like-fountain-portal.browser.test.js.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const P = require(path.join(ROOT, 'like-fountain-portal.js'));
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));

test('platserna i V:et överlappar aldrig och ligger inne i designens ruta', () => {
  const pl = P.platser(47);
  assert.ok(pl.length >= 80, `bara ${pl.length} platser av ${P.PLATSER}`);
  for (let i = 0; i < pl.length; i++) {
    const a = pl[i];
    assert.ok(a.x - a.r >= 0 && a.x + a.r <= P.BAS_B && a.y - a.r >= 0 && a.y + a.r <= P.BAS_H, `plats ${i} utanför: ${JSON.stringify(a)}`);
    for (let j = i + 1; j < pl.length; j++) {
      const b = pl[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(d > a.r + b.r, `plats ${i} och ${j} överlappar (${d.toFixed(1)} < ${(a.r + b.r).toFixed(1)})`);
    }
  }
});

test('platserna bildar ett V: smalt vid portalen, brett uppe', () => {
  const pl = P.platser(47);
  const bredd = lista => Math.max(...lista.map(p => p.x)) - Math.min(...lista.map(p => p.x));
  const nere = pl.filter(p => p.y > 560), uppe = pl.filter(p => p.y < 200);
  assert.ok(nere.length && uppe.length, 'saknar platser nere eller uppe');
  assert.ok(bredd(uppe) > bredd(nere) * 2, `V:et öppnar sig inte: nere ${bredd(nere).toFixed(0)}, uppe ${bredd(uppe).toFixed(0)}`);
});

test('samma frö ger samma platser — förhandsbilden är deterministisk', () => {
  assert.deepEqual(P.platser(47), P.platser(47));
});

test('ett like-paket ger en skur med tak, aldrig noll och aldrig en klump', () => {
  assert.equal(P.hjartanFor(1, 6), 2);
  assert.equal(P.hjartanFor(15, 6), 6, 'en tittare som spammar 15 ska stanna vid taket');
  assert.equal(P.hjartanFor(15, 3), 3);
  assert.ok(P.hjartanFor(4, 15) < P.hjartanFor(100, 15), 'fler tappar ska ge fler hjärtan under taket');
  for (const trasig of [0, -3, NaN, undefined, 'x']) assert.ok(P.hjartanFor(trasig, 6) >= 1, String(trasig));
});

test('bara färska like-paket räknas — historik vid sidladdning sprutar inte', () => {
  const nu = Date.now();
  assert.equal(P.arFarskLike({ type: 'like', count: 5 }, nu), true, 'utan tidsstämpel är det live');
  assert.equal(P.arFarskLike({ type: 'like', at: nu - 2000 }, nu), true);
  assert.equal(P.arFarskLike({ type: 'like', at: nu - 60000 }, nu), false, 'en minut gammalt = historik');
  assert.equal(P.arFarskLike({ type: 'like', timestamp: new Date(nu - 60000).toISOString() }, nu), false);
  assert.equal(P.arFarskLike({ type: 'gift', at: nu }, nu), false, 'gåvor är inte likes');
  assert.equal(P.arFarskLike({ type: 'likes' }, nu), true);
  assert.equal(P.arFarskLike(null, nu), false);
});

test('det stora hjärtat får ett mål per hjärta, utan att de inre överlappar', () => {
  const { mal } = P.hjartform(72, 71);
  assert.equal(mal.length, 72);
  const inre = mal.slice(46);
  for (let i = 0; i < inre.length; i++) for (let j = i + 1; j < inre.length; j++) {
    assert.ok(Math.hypot(inre[i].x - inre[j].x, inre[i].y - inre[j].y) > 14, `mål ${i} och ${j} överlappar`);
  }
});

test('katalogen: portalen skapas hel på duken, den klassiska är oförändrad', () => {
  const w = VyraWidgets.create('catalog:likefountain:portal');
  assert.equal(w.type, 'templateLikeFountain');
  assert.equal(w.fountainDesign, 'portal');
  const hojd = Math.round(w.width * P.BAS_H / P.BAS_B);
  assert.ok(w.x >= 0 && w.x + w.width <= 432, `x ${w.x} + ${w.width} ryms inte`);
  assert.ok(w.y >= 0 && w.y + hojd <= 768, `y ${w.y} + ${hojd} ryms inte`);
  const klassisk = VyraWidgets.create('catalog:likefountain');
  assert.equal(klassisk.fountainDesign, undefined, 'den klassiska fontänen fick portalens design');
  // 2026-10-05: den klassiska låg på x 40 med bredd 620 — mitten på 350 av 432, långt till höger.
  // .like-fountain har min-width 420 (studio.css), så 420 är den smalaste den ritas i, och x 6
  // lägger mitten på dukens mitt.
  assert.equal(klassisk.width, 420);
  assert.ok(klassisk.x >= 0 && klassisk.x + klassisk.width <= 432, `klassisk x ${klassisk.x} + ${klassisk.width} ryms inte`);
  assert.equal(klassisk.x + klassisk.width / 2, 216, 'den klassiska fontänen ska ha sin källa mitt på duken');
});
