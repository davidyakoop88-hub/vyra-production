'use strict';
// The catalog buttons no longer carry their own defaults — they call VyraWidgets.create() with a
// catalog key built from the button's own dataset. That moves the failure mode: a key assembled from
// the wrong variable, or a variant that exists in the catalog UI but not in the registry, now
// produces a thrown error at click time instead of a widget with an undefined accent.
//
// So every catalog path is executed here, for every variant the registry knows, rather than searched
// for as a string. A grep would pass against a key that throws.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));
const MEDIA = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');

// The keys media.js builds, with the variable parts filled from the registry's own tables — exactly
// the strings the buttons produce at runtime.
function everyCatalogKey() {
  const v = name => Object.keys(VyraWidgets.variants(name));
  const keys = ['catalog:video', 'catalog:topgift', 'catalog:topstreak', 'catalog:followeralert',
    'catalog:likefountain'];
  v('topgift.theme').forEach(t => keys.push('catalog:topgift:' + t));
  v('topgift.extra').forEach(t => keys.push('catalog:topgift:extra:' + t));
  v('topgift.frame').forEach(f => keys.push('catalog:topgift:frame:' + f));
  v('topstreak.theme').forEach(t => keys.push('catalog:topstreak:' + t));
  v('topstreak.frame').forEach(f => keys.push('catalog:topstreak:frame:' + f));
  v('heartgoal.theme').forEach(t => keys.push('catalog:heartgoal:' + t));
  v('fanlevel.theme').forEach(t => keys.push('catalog:fanlevel:' + t));
  v('battlemvp.style').forEach(t => keys.push('catalog:battlemvp:' + t));
  v('battlemvp.frame').forEach(f => keys.push('catalog:battlemvp:frame:' + f));
  v('ranking.kind').forEach(type => ['gold', 'violet'].forEach(t => keys.push('catalog:ranking:' + type + ':' + t)));
  v('glovesnipe.pack').forEach(p => ['boost', 'glove', 'tap', 'snipe'].forEach(k =>
    [2, 3].forEach(m => keys.push('catalog:glovesnipe:' + p + ':' + k + ':' + m))));
  // Themes and layouts the registry does not gate: the catalog UI owns their lists.
  ['clean', 'neon', 'royal'].forEach(t => keys.push('catalog:toplike:' + t));
  ['profile', 'flip', 'sidebadge'].forEach(l => keys.push('catalog:gifterlevel:' + l));
  ['likes', 'follows'].forEach(k => [1, 2, 3].forEach(m =>
    ['portrait', 'landscape'].forEach(o => keys.push('catalog:socialgoal:' + k + ':' + m + ':' + o))));
  ['neon', 'aurora'].forEach(t => ['portrait', 'landscape'].forEach(o =>
    keys.push('catalog:giftcampaign:' + t + ':' + o)));
  return keys;
}

const KEYS = everyCatalogKey();

test('varje katalogväg för varje variant bygger en giltig widget', () => {
  assert.ok(KEYS.length > 100, `bara ${KEYS.length} nycklar — täckningen ser för smal ut`);
  const broken = [];
  for (const key of KEYS) {
    try {
      const w = VyraWidgets.create(key, { values: { title: 't', value: 'v', src: 's' } });
      if (!w.type) broken.push(key + ': ingen typ');
      if (!w.id) broken.push(key + ': inget id');
      if (w.createdFrom !== key) broken.push(key + ': createdFrom ' + w.createdFrom);
      // A variant that silently resolved to undefined is the failure this replaces.
      for (const [field, value] of Object.entries(w)) {
        if (value === undefined) broken.push(key + ': ' + field + ' är undefined');
      }
    } catch (err) { broken.push(key + ': ' + err.message); }
  }
  assert.deepEqual(broken, []);
});

test('varje katalogknapp refererar en nyckel som registret känner igen', () => {
  // The keys media.js assembles, read out of the rewired source and completed with real variants.
  const built = [...MEDIA.matchAll(/VyraWidgets\.create\(('catalog:[^']*'(?:\+[^),]+)?)/g)].map(m => m[1]);
  assert.ok(built.length >= 20, `hittade bara ${built.length} kataloganrop i media.js`);
  const families = new Set(built.map(expr => (/'catalog:([a-z]+)/.exec(expr) || [])[1]).filter(Boolean));
  const unknown = [...families].filter(f => !VyraWidgets.families().includes(f));
  assert.deepEqual(unknown, [], 'media.js bygger nycklar för familjer registret inte känner');
});

test('inga gamla inline-defaultobjekt finns kvar', () => {
  assert.equal((MEDIA.match(/state\.widgets\.push\(\{/g) || []).length, 0,
    'media.js har kvar minst ett inline-objektliteral i push()');
  assert.equal((MEDIA.match(/VyraWidgets\.create\(/g) || []).length, 20,
    'antalet kataloganrop stämmer inte med de tjugo katalogställena');
});

test('inga ramtabellkopior finns kvar i media.js', () => {
  for (const table of ['topgift.frame', 'topstreak.frame', 'battlemvp.frame']) {
    const first = Object.keys(VyraWidgets.variants(table))[0];
    assert.ok(!MEDIA.includes("'" + first + "':{"), `${table} finns fortfarande som literal i media.js`);
  }
  assert.match(MEDIA, /GIFT_FRAMES=VyraWidgets\.variants\('topgift\.frame'\)/);
  assert.match(MEDIA, /STREAK_FRAMES=VyraWidgets\.variants\('topstreak\.frame'\)/);
  assert.match(MEDIA, /MVP_FRAMES=VyraWidgets\.variants\('battlemvp\.frame'\)/);
});

test('create() körs före singleton-filtret och före varje stateändring', () => {
  // A catalog key that throws must leave the layout untouched, not half-edited. Every site that has
  // a singleton filter has to build the widget first.
  const offenders = [];
  const lines = MEDIA.split(/\r?\n/);
  lines.forEach((line, i) => {
    let from = 0;
    for (;;) {
      const at = line.indexOf("state.widgets=state.widgets.filter(w=>w.type!==", from);
      if (at === -1) break;
      // Only lines that are catalog handlers: a filter with no create() on the same line is
      // one of the load-time cleanup routines (retired video widgets, duplicate follower alerts),
      // which legitimately owns no widget creation.
      if (line.indexOf('VyraWidgets.create(') === -1) { from = at + 1; continue }
      if (line.slice(0, at).indexOf('VyraWidgets.create(') === -1) offenders.push(`rad ${i + 1}`);
      from = at + 1;
    }
  });
  assert.deepEqual(offenders, [], 'singleton-filter körs före create() på dessa rader');
});

test('widget-factory.js laddas före media.js', () => {
  const html = fs.readFileSync(path.join(ROOT, 'studio.html'), 'utf8');
  const factory = html.indexOf('widget-factory.js');
  const media = html.indexOf('media.js?');
  assert.ok(factory !== -1, 'widget-factory.js laddas inte alls');
  assert.ok(factory < media, 'widget-factory.js laddas efter media.js');
});

// ---- the registry must not be mutable from outside ----------------------------------------------
test('mutation av ett resultat från variants() ändrar inte registret', () => {
  const frames = VyraWidgets.variants('topgift.frame');
  const key = Object.keys(frames)[0];
  const original = frames[key].accent;
  frames[key] = { accent: '#000000' };
  frames.__injected = { accent: '#000000' };
  assert.equal(VyraWidgets.variants('topgift.frame')[key].accent, original,
    'registret ändrades av en anropare');
  assert.equal(VyraWidgets.variants('topgift.frame').__injected, undefined,
    'en anropare kunde lägga till en variant i registret');
  // And the widget built afterwards still carries the real accent.
  assert.equal(VyraWidgets.create('catalog:topgift:frame:' + key).accent, original);
});

test('två create()-anrop delar inte muterbart nästlat state', () => {
  const a = VyraWidgets.create('catalog:topgift:frame:' + Object.keys(VyraWidgets.variants('topgift.frame'))[0]);
  const b = VyraWidgets.create('catalog:topgift:frame:' + Object.keys(VyraWidgets.variants('topgift.frame'))[0]);
  assert.notEqual(a.id, b.id);
  // The invariant that makes sharing impossible: a widget carries primitives only. Looping over
  // object values alone would be vacuous today — there are none — and would stay green the day a
  // builder started handing out a table entry by reference.
  for (const [field, value] of Object.entries(a)) {
    assert.ok(value === null || typeof value !== 'object',
      `${field} är ett objekt: två widgets kan dela det, och en redigering av den ena ändrar den andra`);
    assert.notEqual(value, b[field] && typeof b[field] === 'object' ? b[field] : Symbol('olik'),
      `${field} delas mellan två widgets`);
  }
  // And nothing a widget carries may be a live reference into the registry.
  const frames = VyraWidgets.variants('topgift.frame');
  for (const entry of Object.values(frames)) {
    assert.ok(!Object.values(a).includes(entry), 'en widget bär en referens rakt in i varianttabellen');
  }
  a.title = 'ändrad';
  assert.notEqual(b.title, 'ändrad');
});

test('varje variantbärande knapp bygger sin nyckel ur sin egen variant', () => {
  // A key hardcoded to one variant would still resolve, still build a valid widget, and still pass
  // every test above — while every button in that group silently produced the same design.
  const CONSTANT_OK = new Set(['catalog:video', 'catalog:topgift', 'catalog:topstreak',
    'catalog:followeralert', 'catalog:likefountain']);
  const constants = [];
  for (const m of MEDIA.matchAll(/VyraWidgets\.create\(\s*('catalog:[^']*')(\s*\+)?/g)) {
    const literal = m[1].slice(1, -1);
    const concatenated = !!m[2];
    if (!concatenated && !CONSTANT_OK.has(literal)) constants.push(literal);
  }
  assert.deepEqual(constants, [],
    'dessa kataloganrop har en fast nyckel trots att familjen har varianter');
});

test('alla fem variantlösa kataloganrop finns kvar', () => {
  for (const key of ['catalog:video', 'catalog:topgift', 'catalog:topstreak',
    'catalog:followeralert', 'catalog:likefountain']) {
    assert.ok(MEDIA.includes("VyraWidgets.create('" + key + "'"), `${key} anropas inte längre`);
  }
});

test('registret är fryst hela vägen ned', () => {
  // The shallow copy from variants() stops a caller replacing an entry; the freeze is what stops it
  // reaching in and editing the entry it was handed.
  const frames = VyraWidgets.variants('topgift.frame');
  const key = Object.keys(frames)[0];
  const original = frames[key].accent;
  assert.throws(() => { frames[key].accent = '#000000' }, TypeError,
    'en anropare kunde skriva i en varianttabellpost');
  assert.equal(VyraWidgets.variants('topgift.frame')[key].accent, original);
  assert.throws(() => { frames[key].circle.left = 0 }, TypeError,
    'nästlad geometri i varianttabellen är inte fryst');
});
