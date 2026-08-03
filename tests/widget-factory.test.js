'use strict';
// widget-factory.js is the only place a widget's default configuration is written. That is only true
// if it produces exactly what the catalog buttons produced before it existed — a widget that comes
// out one pixel wider or with a different accent is a silent visual regression in every layout
// created afterwards.
//
// The baseline is a checked-in snapshot, not git history: this suite has to pass in a shallow
// checkout of one branch with no other refs, which is what CI does. The snapshot was generated from
// the pre-factory media.js by scripts/generate-widget-snapshot.js, and
// tests/widget-defaults-migration.test.js re-proves that link on a full clone.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));
const { CONTRACT } = require('./fixtures/catalog-variants.js');
const SNAPSHOT = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/widget-defaults.snapshot.json'), 'utf8'));


const VOLATILE = ['id', 'placement', 'createdFrom'];
const stripVolatile = w => {
  const copy = Object.assign({}, w);
  VOLATILE.forEach(k => delete copy[k]);
  return copy;
};

for (const row of CONTRACT) {
  test(`${row.name}: ${row.key} ger katalogens defaultkonfiguration`, () => {
    const expected = SNAPSHOT[row.key];
    assert.ok(expected, `snapshot saknar ${row.key}`);
    const produced = stripVolatile(VyraWidgets.create(row.key, { values: row.values }));
    assert.deepEqual(produced, expected);
    // deepEqual ignores key order; the field set has to match exactly too, or a default could be
    // quietly dropped and replaced by an undefined read at render time.
    assert.deepEqual(Object.keys(produced).sort(), Object.keys(expected).sort(),
      'fältuppsättningen skiljer sig');
  });
}

test('snapshot och kontrakt beskriver samma katalog', () => {
  assert.deepEqual(Object.keys(SNAPSHOT).sort(), CONTRACT.map(r => r.key).sort());
});

test('varje katalogfamilj täcks av minst ett kontrakt', () => {
  const covered = new Set(CONTRACT.map(r => r.key.split(':')[1]));
  assert.deepEqual(VyraWidgets.families().filter(f => !covered.has(f)), [],
    'katalogfamiljer utan kontrakttest');
});

// ---- the call the link bar makes ----------------------------------------------------------------
test('en katalognyckel räcker — anroparen känner inte till accent eller bredd', () => {
  // The whole point of the key grammar: no colours, no widths, no titles at the call site.
  const w = VyraWidgets.create('catalog:topgift:neon', { placement: 'standalone' });
  assert.equal(w.accent, '#d946ef');
  assert.equal(w.valueColor, '#d946ef');
  assert.equal(w.width, 280);
  assert.equal(w.placement, 'standalone');
  assert.equal(w.createdFrom, 'catalog:topgift:neon');
});

test('okänd familj kastar i stället för att ge en tom widget', () => {
  assert.throws(() => VyraWidgets.create('catalog:finns-inte'), /Okänd katalogfamilj/);
  assert.throws(() => VyraWidgets.create('topgift:neon'), /måste börja med "catalog:"/);
  assert.throws(() => VyraWidgets.create(''), /måste börja med "catalog:"/);
});

test('felstavad variant kastar och faller aldrig tillbaka på en annan design', () => {
  // The failure mode this replaces: an unknown theme resolved to undefined and produced a widget
  // with no accent, which looks like a rendering bug rather than a typo in a catalog key.
  const cases = [
    ['catalog:topgift:felstavat', /Okänd tema "felstavat"/],
    ['catalog:topgift:extra:felstavat', /Okänd extratema/],
    ['catalog:topgift:frame:felstavat', /Okänd gåvoram/],
    ['catalog:topstreak:felstavat', /Okänd streaktema/],
    ['catalog:topstreak:frame:felstavat', /Okänd streakram/],
    ['catalog:ranking:felstavat:gold', /Okänd rankingtyp/],
    ['catalog:heartgoal:felstavat', /Okänd hjärttema/],
    ['catalog:fanlevel:felstavat', /Okänd fan level-tema/],
    ['catalog:battlemvp:felstavat', /Okänd MVP-stil/],
    ['catalog:battlemvp:frame:felstavat', /Okänd MVP-ram/],
    ['catalog:glovesnipe:felstavat:tap', /Okänd boostpaket/],
    ['catalog:glovesnipe:koiPearl:felstavat', /Okänd battle-typ/],
    ['catalog:socialgoal:felstavat:1:portrait', /Okänd måltyp/],
    ['catalog:socialgoal:likes:1:felstavat', /Okänd orientering/],
    ['catalog:giftcampaign:neon:felstavat', /Okänd orientering/],
    ['catalog:toplike', /kräver ett tema/],
    ['catalog:gifterlevel', /kräver en layout/]
  ];
  for (const [key, pattern] of cases) {
    assert.throws(() => VyraWidgets.create(key), pattern, `${key} kastade inte som väntat`);
  }
  // And the error names the valid options, so a typo is fixable from the message alone.
  try { VyraWidgets.create('catalog:topgift:felstavat') } catch (e) {
    assert.match(e.message, /royal, neon, cyber, glass/);
  }
});

test('tabellerna är produktionskällan — inget behöver registreras utifrån', () => {
  assert.equal(typeof VyraWidgets.registerVariants, 'undefined',
    'extern registrering finns kvar och kan bli en andra kopia');
  assert.ok(Object.keys(VyraWidgets.variants('topgift.frame')).length > 0, 'ramtabellen är tom');
  assert.ok(Object.keys(VyraWidgets.variants('topstreak.frame')).length > 0);
  assert.ok(Object.keys(VyraWidgets.variants('battlemvp.frame')).length > 0);
});

// ---- the id -------------------------------------------------------------------------------------
test('ID är unikt och innehåller mer än en tidsstämpel', () => {
  const ids = new Set();
  for (let i = 0; i < 2000; i += 1) ids.add(VyraWidgets.create('catalog:toplike:neon').id);
  assert.equal(ids.size, 2000, 'ID:n kolliderade');
  assert.match([...ids][0], /^templateTopLike-[a-z0-9]+-[a-z0-9]{8,}$/);
});

test('utan crypto skapas ingen widget alls', () => {
  // A weak id is a link that can silently point at someone else's widget after a collision, so the
  // absence of crypto is a hard failure rather than a Math.random() fallback.
  const vm = require('vm');
  const sandbox = { console, JSON, Math, Number, String, Object, Array, Set, Map, Boolean, Date, Uint32Array };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'widget-factory.js'), 'utf8'), sandbox);
  assert.throws(() => sandbox.window.VyraWidgets.create('catalog:toplike:neon'),
    /saknar crypto\.randomUUID och crypto\.getRandomValues/);
});

test('getRandomValues räcker när randomUUID saknas', () => {
  const vm = require('vm');
  const sandbox = {
    console, JSON, Math, Number, String, Object, Array, Set, Map, Boolean, Date, Uint32Array,
    crypto: { getRandomValues: a => { for (let i = 0; i < a.length; i += 1) a[i] = (i + 7) * 2654435761 >>> 0; return a } }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'widget-factory.js'), 'utf8'), sandbox);
  const w = sandbox.window.VyraWidgets.create('catalog:toplike:neon');
  assert.match(w.id, /^templateTopLike-[a-z0-9]+-[a-z0-9]{6,}$/);
});

// ---- placement ----------------------------------------------------------------------------------
test('placement saknas för layout och sätts bara för standalone', () => {
  const layout = VyraWidgets.create('catalog:toplike:neon');
  assert.equal('placement' in layout, false, 'layoutwidgets ska inte bära fältet alls');
  assert.equal(VyraWidgets.isLayout(layout), true);
  assert.equal(VyraWidgets.isStandalone(layout), false);

  const standalone = VyraWidgets.create('catalog:toplike:neon', { placement: 'standalone' });
  assert.equal(standalone.placement, 'standalone');
  assert.equal(VyraWidgets.isStandalone(standalone), true);
  assert.equal(VyraWidgets.isLayout(standalone), false);
});

test('en widget utan placement räknas som layout', () => {
  // Every layout saved before this branch existed. Absence must mean layout, never the reverse.
  for (const legacy of [{ id: 'a', type: 'goal' }, { id: 'b', type: 'x', placement: undefined },
    { id: 'c', type: 'x', placement: '' }, { id: 'd', type: 'x', placement: 'layout' }]) {
    assert.equal(VyraWidgets.isLayout(legacy), true, `${JSON.stringify(legacy)} tolkades inte som layout`);
  }
  assert.equal(VyraWidgets.isLayout(null), true);
  assert.equal(VyraWidgets.isStandalone(null), false);
});

// ---- the suite must survive a shallow checkout ---------------------------------------------------
test('denna svit läser varken git eller andra brancher', () => {
  // The permanent suite runs in CI's shallow checkout, where no other ref exists. Reading git here
  // would make the whole thing pass or fail on clone depth.
  // Checked by what the files require rather than by scanning for words, so the assertion cannot
  // trip over its own forbidden list.
  const ALLOWED = new Set(['node:test', 'node:assert/strict', 'fs', 'path', 'vm',
    './fixtures/catalog-variants.js']);
  const requiresOf = file => [...fs.readFileSync(file, 'utf8').matchAll(/require\(\s*'([^']+)'/g)]
    .map(m => m[1]).filter(m => !m.includes('widget-factory'));
  for (const file of [__filename, path.join(__dirname, 'fixtures/catalog-variants.js')]) {
    for (const dep of requiresOf(file)) {
      assert.ok(ALLOWED.has(dep), `${path.basename(file)} kräver ${dep}, som inte finns i en grund checkout`);
    }
  }
});
