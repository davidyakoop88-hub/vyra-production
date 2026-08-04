'use strict';
// A standalone instance lives in the same state.widgets array as everything else, so without a
// decision about who renders what it would be drawn straight into the Layout the streamer is
// editing. The old ?widget= behaviour made that worse: it built every widget and then hid all but
// one with display:none, so a standalone instance was always constructed, always animated, and
// always in the DOM for anything that queried it — and a link to a deleted widget hid everything and
// left a blank stage with no explanation.
//
// selectForRender() is that decision, in one place, filtering the list before it is mapped to markup.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));
const STUDIO = fs.readFileSync(path.join(ROOT, 'studio.js'), 'utf8');
const MEDIA = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');

// A layout that has one of everything: a widget from before this branch existed (no field at all),
// one that says layout outright, and two standalone instances — one of them hidden.
const LEGACY = { id: 'legacy-goal', type: 'goal' };
const EXPLICIT = { id: 'explicit-layout', type: 'templateTopLike', placement: 'layout' };
const STANDALONE = { id: 'standalone-toplike', type: 'templateTopLike', placement: 'standalone' };
const STANDALONE_HIDDEN = { id: 'standalone-hidden', type: 'templateTopGift', placement: 'standalone', hidden: true };
const HIDDEN_LAYOUT = { id: 'hidden-layout', type: 'templateTopGift', hidden: true };
const ALL = [LEGACY, EXPLICIT, STANDALONE, STANDALONE_HIDDEN, HIDDEN_LAYOUT];

const idsOf = result => result.widgets.map(w => w.id);

// ---- who renders --------------------------------------------------------------------------------
test('legacy-widget utan placement renderas som layout', () => {
  assert.ok(idsOf(VyraWidgets.selectForRender(ALL, {})).includes('legacy-goal'));
  assert.equal(VyraWidgets.isLayout(LEGACY), true);
});

test('explicit layout renderas', () => {
  assert.ok(idsOf(VyraWidgets.selectForRender(ALL, {})).includes('explicit-layout'));
});

test('full layout utesluter varje standalone-instans', () => {
  const rendered = idsOf(VyraWidgets.selectForRender(ALL, {}));
  assert.deepEqual(rendered, ['legacy-goal', 'explicit-layout', 'hidden-layout']);
  assert.ok(!rendered.includes('standalone-toplike'), 'standalone hamnade i Layout');
  assert.ok(!rendered.includes('standalone-hidden'));
});

test('widgetlänk hittar en layoutinstans', () => {
  const result = VyraWidgets.selectForRender(ALL, { widgetId: 'explicit-layout' });
  assert.deepEqual(idsOf(result), ['explicit-layout']);
  assert.equal(result.error, null);
});

test('widgetlänk hittar en standalone-instans', () => {
  const result = VyraWidgets.selectForRender(ALL, { widgetId: 'standalone-toplike' });
  assert.deepEqual(idsOf(result), ['standalone-toplike']);
  assert.equal(result.error, null);
});

test('en dold standalone kan fortfarande öppnas via sin egen widgetlänk', () => {
  // hidden is the streamer's eye toggle on the stage. A standalone instance has no stage, so the
  // flag must not close its link — the two concepts stay separate.
  const result = VyraWidgets.selectForRender(ALL, { widgetId: 'standalone-hidden' });
  assert.deepEqual(idsOf(result), ['standalone-hidden']);
  assert.equal(result.error, null);
});

test('en dold layoutwidget renderas fortfarande i full layout', () => {
  // hidden means display:none in the markup, not "leave it out" — that is existing behaviour and
  // placement must not have changed it.
  assert.ok(idsOf(VyraWidgets.selectForRender(ALL, {})).includes('hidden-layout'));
});

test('okänt eller borttaget ID ger felvyn och ingenting annat', () => {
  for (const missing of ['finns-inte', 'standalone-toplike-x', ' standalone-toplike']) {
    const result = VyraWidgets.selectForRender(ALL, { widgetId: missing });
    assert.deepEqual(result.widgets, [], `${missing} renderade widgets ändå`);
    assert.equal(result.error, 'missing-widget');
  }
});

test('widget-ID matchas strikt och kan inte nå en selektor eller HTML', () => {
  // The id comes from a URL. Anything that treated it as a pattern would let a link match widgets it
  // does not name, and anything that put it in markup would be an injection point.
  // Substrings and prefixes matter most: a link that matched loosely would open a different
  // streamer-visible widget than the one it names, without any error to notice.
  for (const hostile of ['*', '.widget', '[data-id]', 'standalone-.*', '"><img src=x onerror=1>',
    'STANDALONE-TOPLIKE', 'standalone-toplike ', 'standalone', 'toplike', 'standalone-topl',
    'legacy', 'explicit']) {
    const result = VyraWidgets.selectForRender(ALL, { widgetId: hostile });
    assert.deepEqual(result.widgets, [], `${hostile} matchade en widget`);
    assert.equal(result.error, 'missing-widget');
  }
  // And an id that only differs by type still matches when it is the same string.
  const numeric = [{ id: '42', type: 'x' }];
  assert.deepEqual(VyraWidgets.selectForRender(numeric, { widgetId: '42' }).widgets, numeric);
  assert.deepEqual(VyraWidgets.selectForRender([{ id: 42, type: 'x' }], { widgetId: '42' }).widgets.length, 1,
    'ett numeriskt id ska matcha sin strängform');
});

test('äldre befintliga widgetlänkar fungerar oförändrat', () => {
  // Links created before this branch point at layout widgets that carry no placement field.
  const old = [{ id: 'templateTopGift1754180000000', type: 'templateTopGift' }];
  const result = VyraWidgets.selectForRender(old, { widgetId: 'templateTopGift1754180000000' });
  assert.deepEqual(idsOf(result), ['templateTopGift1754180000000']);
  assert.equal(result.error, null);
});

// ---- the layer list -----------------------------------------------------------------------------
test('layerList utesluter standalone men behåller legacy och dolda', () => {
  assert.deepEqual(VyraWidgets.layoutOnly(ALL).map(w => w.id),
    ['legacy-goal', 'explicit-layout', 'hidden-layout']);
  assert.match(STUDIO, /function layerList\(\)\{const layoutWidgets=window\.VyraWidgets\?window\.VyraWidgets\.layoutOnly\(state\.widgets\)/,
    'layerList läser fortfarande hela state.widgets');
});

test('canvasen filtrerar listan före .map(wh), inte efteråt', () => {
  assert.match(STUDIO, /class="canvas">\$\{vyraRenderWidgets\(\)\}/,
    'canvasen mappar fortfarande hela arrayen');
  assert.ok(!/state\.widgets\.map\(wh\)/.test(STUDIO), 'state.widgets.map(wh) finns kvar någonstans');
  // The old hide-after-render pass must be gone, or every standalone widget is still built.
  assert.ok(!MEDIA.includes('onlyWidget'), 'dölj-alla-utom-en-filtret finns kvar i media.js');
});

// ---- the error view -----------------------------------------------------------------------------
test('felvyn visar inget annat, ingen demo, inget ID och ingen token', () => {
  const view = /if\(picked\.error==='missing-widget'\)return ([^;]+);/.exec(STUDIO);
  assert.ok(view, 'hittade ingen felvy i vyraRenderWidgets()');
  const markup = view[1];
  assert.match(markup, /Widgetlänken finns inte längre/);
  for (const forbidden of ['wanted', 'params.get', 'access', 'w.id', 'state.widgets', '${']) {
    assert.ok(!markup.includes(forbidden), `felvyn interpolerar ${forbidden}`);
  }
  // A static string cannot carry a widget id, a token or a demo widget, and it starts no animation.
  assert.ok(/^'[^']*'$/.test(markup.trim()), 'felvyn är inte en konstant sträng');
});

test('felvyn skriver inte till state', () => {
  const fn = /function vyraRenderWidgets\(\)\{([\s\S]*?)\n\}/.exec(STUDIO);
  assert.ok(fn, 'hittade inte vyraRenderWidgets()');
  for (const write of ['save(', 'state.widgets=', 'state.widgets.push', 'localStorage']) {
    assert.ok(!fn[1].includes(write), `vyraRenderWidgets skriver till state via ${write}`);
  }
});

// ---- singleton replacement ----------------------------------------------------------------------
test('singleton-byte bevarar samtliga standalone-instanser', () => {
  const keep = w => VyraWidgets.isStandalone(w) || w.type !== 'templateTopGift';
  const layout = [
    { id: 'gift-layout', type: 'templateTopGift' },
    { id: 'gift-standalone-1', type: 'templateTopGift', placement: 'standalone' },
    { id: 'gift-standalone-2', type: 'templateTopGift', placement: 'standalone', hidden: true },
    { id: 'other', type: 'templateTopLike' }
  ];
  const after = layout.filter(keep);
  assert.deepEqual(after.map(w => w.id), ['gift-standalone-1', 'gift-standalone-2', 'other'],
    'en ny layoutvariant tog med sig standalone-instanserna');
});

test('varje singleton-filter i media.js skyddar standalone', () => {
  // Every destructive filter, whatever it selects on. Three of them go by group or by an old
  // migration rule rather than by type, and they delete just as effectively.
  const all = (MEDIA.match(/state\.widgets=state\.widgets\.filter\(w=>/g) || []).length;
  const guarded = (MEDIA.match(/state\.widgets=state\.widgets\.filter\(w=>VyraWidgets\.isStandalone\(w\)\|\|/g) || []).length;
  assert.equal(guarded, all, `${all - guarded} filter i media.js kan fortfarande radera standalone`);
  assert.ok(guarded >= 18, `bara ${guarded} skyddade filter — färre än de kända raderande ställena`);
});

// ---- hidden and placement stay separate ---------------------------------------------------------
test('hidden och placement är helt separata begrepp', () => {
  assert.equal(VyraWidgets.isStandalone({ id: 'a', type: 'x', hidden: true }), false,
    'hidden tolkades som standalone');
  assert.equal(VyraWidgets.isLayout({ id: 'b', type: 'x', hidden: true }), true);
  assert.equal(VyraWidgets.isStandalone(STANDALONE), true);
  assert.equal(STANDALONE.hidden, undefined, 'standalone sattes inte via hidden');
  // The factory never writes hidden, and never reads it.
  const created = VyraWidgets.create('catalog:toplike:neon', { placement: 'standalone' });
  assert.equal('hidden' in created, false);
});

test('länklistan innehåller både layout och standalone, märkta', () => {
  const picker = /choices=state\.widgets\.filter\([^;]+/.exec(MEDIA);
  assert.ok(picker, 'hittade inte länkhanterarens lista');
  assert.match(picker[0], /VyraWidgets\.isStandalone\(w\)\|\|!w\.hidden/,
    'listan filtrerar fortfarande bort standalone via hidden');
  assert.match(picker[0], /endast widgetlänk/, 'standalone-instanser är omärkta i listan');
  assert.match(picker[0], /i Layout/, 'layoutinstanser är omärkta i listan');
});
