'use strict';
// TOP STREAK · DESIGN 1–3 (David 2026-10-17, topstreak-designer.js).
//
// Vaktar det som gör att designerna fungerar i en riktig sändning utan nya krokar: markupen bär exakt
// det gift-event-images.js patchar för templateTopStreak, talet ligger i ett eget <b> så att prefixet
// och STREAK står kvar, och fabriken ger widgeten det renderaren väljer design på.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function ladda() {
  const root = { crypto: require('crypto').webcrypto, document: { documentElement: null, querySelector: () => null, querySelectorAll: () => [] } };
  root.window = root;
  vm.runInNewContext(las('topstreak-designer.js'), root, { filename: 'topstreak-designer.js' });
  vm.runInNewContext(las('widget-factory.js'), root, { filename: 'widget-factory.js' });
  return root;
}
const O = { name: 'Kimmie', value: '7', profile: 'p.png', gift: 'g.png', dold: '', valt: false };

test('fabriken bygger Design 1–3 med streakDesign och Clean Flips grund', () => {
  const { VyraWidgets } = ladda();
  for (const n of [1, 2, 3]) {
    const w = VyraWidgets.create('catalog:topstreak:design:' + n);
    assert.equal(w.type, 'templateTopStreak');
    assert.equal(w.streakDesign, n);
    assert.equal(w.title, 'Top Streak · Design ' + n);
    assert.equal(w.streakTheme, 'approved-clean');
  }
  assert.throws(() => VyraWidgets.create('catalog:topstreak:design:4'), /Top Streak-design/);
});

test('markupen bär livekrokarna, och talet ligger i ett eget <b>', () => {
  const { VyraStreakDesigner: D, VyraWidgets } = ladda();
  for (const n of [1, 2, 3]) {
    const w = { ...VyraWidgets.create('catalog:topstreak:design:' + n), id: 'w' + n };
    assert.equal(D.har(w), true);
    const html = D.html(w, O);
    assert.match(html, new RegExp('class="widget vyra-streak tsd tsd' + n + '[^"]*" data-id="w' + n + '"'));
    assert.match(html, /<div class="streak-profile-face"><img src="p\.png"/);
    assert.match(html, /<div class="streak-gift-face"><img src="g\.png"/);
    assert.match(html, /<div class="approved-streak-copy"><strong>Kimmie<\/strong>/);
    assert.match(html, /×<b>7<\/b> <small>STREAK<\/small>/);
    // Ingen Top Gift-klass: Top Gifts live- och nollkrokar får aldrig träffa en streakwidget.
    assert.doesNotMatch(html, /vyra-topgift|topgift-copy|vyra-gift-face/);
  }
  assert.equal(D.har({ type: 'templateTopStreak' }), false, 'Clean Flip (utan design) ritas som förut');
});

test('Gift-redigerarens kryssrutor blir klasser på roten', () => {
  const { VyraStreakDesigner: D, VyraWidgets } = ladda();
  const w = { ...VyraWidgets.create('catalog:topstreak:design:2'), id: 'x', showGift: false, showDataValue: false };
  assert.match(D.html(w, O), /class="widget vyra-streak tsd tsd2 ram-farg utan-gava utan-varde"/);
});

test('Design 3 har åtta färgstilar och panelen visar bara reglage som designen använder', () => {
  const { VyraStreakDesigner: D, VyraWidgets } = ladda();
  assert.deepEqual([...D.stilar].map(s => s.id), ['is', 'ametist', 'rosa', 'guld', 'smaragd', 'glod', 'natt', 'aurora']);
  const panel = n => D.props({ ...VyraWidgets.create('catalog:topstreak:design:' + n), id: 'p' });
  assert.match(panel(1), /id="tsdFlip"/);
  assert.doesNotMatch(panel(1), /id="tsdFarg2"|id="tsdStil"/);
  assert.doesNotMatch(panel(2), /id="tsdFlip"|id="tsdStil"/);
  assert.match(panel(3), /id="tsdStil"/);
  assert.match(panel(3), /id="tsdFarg2"/);
});

test('approved-rankings.js lämnar över till designern och har de tre korten', () => {
  const js = las('approved-rankings.js');
  assert.match(js, /if \(D && D\.har\(w\)\) return D\.html\(w, \{ name, value, vila, profile, gift, dold, valt: selected === w\.id \}\);/);  // vila: B-018
  assert.match(js, /return D && D\.har\(w\) \? D\.props\(w\) : approvedStreakProps\(w\);/);
  assert.match(js, /window\.VyraStreakDesigner\.bind\(w\)/);
  const html = las('studio.html');
  assert.ok(html.indexOf('topstreak-designer.js') > 0 && html.indexOf('topstreak-designer.js') < html.indexOf('approved-rankings.js'),
    'designern laddas före approved-rankings.js');
});
