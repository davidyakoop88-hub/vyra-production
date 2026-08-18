'use strict';
// The catalog buttons no longer carry their own defaults — they call VyraWidgets.create() with a
// catalog key built from the button's own dataset. That moves the failure mode: a key assembled from
// the wrong variable, or a variant that exists in the catalog UI but not in the registry, now
// produces a thrown error at click time instead of a widget with an undefined accent.
//
// So every catalog path is executed here, for every variant the registry knows, rather than searched
// for as a string. A grep would pass against a key that throws.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));
const MEDIA = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
const { count } = require(path.join(ROOT, 'tests/helpers/catalog-sites.js'));

// Balanced scan, so a brace inside a string in the body cannot end the function early.
function matchingBrace(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const c = source[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i += 1; i < source.length && source[i] !== c; i += 1) if (source[i] === '\\') i += 1;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}' && !(depth -= 1)) return i;
  }
  throw new Error('obalanserade klamrar från ' + open);
}

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
  v('fanlevel.layout').forEach(l => keys.push('catalog:fanlevel:layout:' + l));
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

// The key expression no longer sits inside VyraWidgets.create(...). It is assigned to a catalogKey
// binding when the button is built, published on the button, and only then passed to the factory —
// so the key is read out of the assignment, which is the single place it is now written.
const KEY_ASSIGNMENTS = source =>
  [...source.matchAll(/catalogKey\s*=\s*('catalog:[^']*')((?:\s*\+\s*[^;,)]+)*)/g)]
    .map(m => ({ literal: m[1].slice(1, -1), concatenated: !!m[2].trim() }));

test('varje katalogknapp publicerar en nyckel som registret känner igen', () => {
  const built = KEY_ASSIGNMENTS(MEDIA);
  assert.ok(built.length >= 20, `hittade bara ${built.length} katalognycklar i media.js`);
  const families = new Set(built.map(b => b.literal.split(':')[1]).filter(Boolean));
  const unknown = [...families].filter(f => !VyraWidgets.families().includes(f));
  assert.deepEqual(unknown, [], 'media.js bygger nycklar för familjer registret inte känner');
  // Every assembled key is bound to a name the handler closes over, never re-derived at click time.
  assert.equal((MEDIA.match(/VyraWidgets\.create\(catalogKey/g) || []).length, 20,
    'alla tjugo factory-anrop går inte via den bundna nyckeln');
});

test('nyckeln publiceras när knappen byggs, inte när den klickas', () => {
  const now = count(MEDIA);
  assert.equal(now.total, 20, `factoryplatser: ${now.total}`);
  assert.equal(now.insideDirectOnclick, 0,
    'dessa publicerar först vid klick: ' +
    now.sites.filter(s => s.insideDirectOnclick).map(s => s.button).join(', '));

  // Baseline-red. The two forms this replaced, verbatim in shape, so the assertions above are shown
  // to be load-bearing rather than trivially true of any source.
  const HEAD_FORM = "grid.querySelectorAll('[data-gift-frame]').forEach(b=>b.onclick=()=>{" +
    "let fid=b.dataset.giftFrame,created=VyraWidgets.create('catalog:topgift:frame:'+fid),id=created.id});";
  assert.equal(KEY_ASSIGNMENTS(HEAD_FORM).length, 0,
    'baseline: den gamla formen hade ingen nyckel att publicera före klicket');
  assert.equal(count(HEAD_FORM).total, 0);

  const CLICK_TIME_FORM = "grid.querySelectorAll('[data-gift-frame]').forEach(b=>b.onclick=()=>{" +
    "let fid=b.dataset.giftFrame,catalogKey='catalog:topgift:frame:'+fid," +
    "created=(b.dataset.catalogKey=catalogKey,VyraWidgets.create(catalogKey)),id=created.id});";
  assert.equal(count(CLICK_TIME_FORM).insideDirectOnclick, 1,
    'baseline: mellansteget publicerade nyckeln inuti klickhandlern');
});

test('addBoostPack vägrar skapa något utan nyckel', () => {
  // Executed, not read: the guard is lifted out of media.js with its real body and run against a
  // sandbox whose factory, state and save() all record any call. None of them may be reached.
  const at = MEDIA.indexOf('function addBoostPack(');
  const source = MEDIA.slice(at, matchingBrace(MEDIA, MEDIA.indexOf('{', at)) + 1);
  const touched = [];
  const sandbox = {
    VyraWidgets: { create: () => { touched.push('create'); return { id: 'x' } }, isStandalone: () => false },
    boostPacks: { koiPearl: ['Tjej'] }, boostPackDetails: { koiPearl: ['Koi', '🐟'] },
    state: { get widgets() { touched.push('state'); return [] }, set widgets(_) { touched.push('state') } },
    selected: null, save: () => touched.push('save'), render: () => {}, toast: () => {}, Error
  };
  vm.runInNewContext(source + ';this.addBoostPack=addBoostPack', sandbox);
  for (const missing of [undefined, null, '', 0, {}]) {
    assert.throws(() => sandbox.addBoostPack('koiPearl', 2, 'boost', missing), /katalognyckel/,
      `addBoostPack accepterade ${JSON.stringify(missing)} som nyckel`);
  }
  assert.deepEqual(touched, [], `kastet kom efter: ${touched.join(', ')}`);
  // The valid key still works, so the guard is a guard and not a wall.
  sandbox.addBoostPack('koiPearl', 2, 'boost', 'catalog:glovesnipe:koiPearl:boost:2');
  assert.ok(touched.includes('create') && touched.includes('save'));
});

// The three frame families build their buttons from a table and then read that table again inside the
// click handler. The handler used to reach for `f`, the destructured parameter of the *markup* map
// callback, which is a different closure — so every frame click threw a ReferenceError after the
// widget had already been saved. These tests lift the real per-button body out of media.js and run
// it, because a click is the only thing that reaches that line.
const FRAME_FAMILIES = [
  { name: 'Top Gift', field: 'giftFrame', table: 'topgift.frame', global: 'GIFT_FRAMES',
    type: 'templateTopGift', prefix: 'Gifter · ' },
  { name: 'Top Streak', field: 'streakFrame', table: 'topstreak.frame', global: 'STREAK_FRAMES',
    type: 'templateTopStreak', prefix: 'Streak · ' },
  { name: 'Battle MVP', field: 'mvpFrame', table: 'battlemvp.frame', global: 'MVP_FRAMES',
    type: 'templateBattleMvp', prefix: 'MVP · ' }
];

function frameWiring(family) {
  const at = MEDIA.indexOf('b.dataset.' + family.field + ',frame=' + family.global);
  assert.notEqual(at, -1, `hittade ingen rambindning för ${family.name}`);
  const open = MEDIA.indexOf('{', MEDIA.lastIndexOf('forEach(b=>', at));
  return MEDIA.slice(open, matchingBrace(MEDIA, open) + 1);
}

function frameSandbox(family) {
  const calls = [];
  const sandbox = {
    VyraWidgets, state: { widgets: [] }, selected: null, Error,
    [family.global]: VyraWidgets.variants(family.table),
    save: () => calls.push('save'), render: () => calls.push('render'),
    toast: msg => calls.push('toast:' + msg)
  };
  vm.runInNewContext('this.wire=b=>' + frameWiring(family), sandbox);
  return { sandbox, calls };
}

for (const family of FRAME_FAMILIES) {
  test(`${family.name} · ram: klicket kastar inte och visar rätt label`, { timeout: 5000 }, () => {
    const { sandbox, calls } = frameSandbox(family);
    const table = VyraWidgets.variants(family.table);
    for (const [fid, frame] of Object.entries(table)) {
      sandbox.state.widgets = [];
      calls.length = 0;
      const button = { dataset: { [family.field]: fid } };
      sandbox.wire(button);
      assert.equal(button.dataset.catalogKey, `catalog:${family.table.split('.')[0]}:frame:${fid}`);
      button.onclick();
      assert.equal(sandbox.state.widgets.length, 1, 'klicket skapade inte exakt en widget');
      assert.equal(sandbox.state.widgets[0].type, family.type);
      assert.ok(calls.includes(`toast:${family.prefix}${frame.label} skapad`),
        `fel toastlabel för ${fid}: ${calls.filter(c => c.startsWith('toast:')).join(', ')}`);
    }
  });

  test(`${family.name} · ram: klickhandlern rör inte callbackvariabeln f`, { timeout: 5000 }, () => {
    const wiring = frameWiring(family);
    const handler = wiring.slice(wiring.indexOf('b.onclick='));
    assert.ok(!/(^|[^A-Za-z0-9_$.])f\s*\./.test(handler),
      'klickhandlern läser fortfarande markup-callbackens f');
  });

  test(`${family.name} · ram: okänd ram kastar före state, save och render`, { timeout: 5000 }, () => {
    const { sandbox, calls } = frameSandbox(family);
    const button = { dataset: { [family.field]: 'ingen-sådan-ram' } };
    assert.throws(() => sandbox.wire(button), /Okänd/, 'okänd ram accepterades');
    assert.equal(sandbox.state.widgets.length, 0, 'state ändrades av en okänd ram');
    assert.deepEqual(calls, [], `save/render/toast kördes ändå: ${calls.join(', ')}`);
    assert.equal(button.onclick, undefined, 'en knapp med okänd ram fick ändå en klickhandler');
  });
}

test('followers och follows ger samma standalone-instans', () => {
  const alias = VyraWidgets.create('catalog:socialgoal:followers:1:portrait');
  const canonical = VyraWidgets.create('catalog:socialgoal:follows:1:portrait');
  assert.equal(alias.createdFrom, canonical.createdFrom,
    'aliaset skulle ge en andra instans med en egen länk');
  assert.equal(alias.createdFrom, 'catalog:socialgoal:follows:1:portrait');
  assert.equal(alias.goalKind, 'follows');
  assert.equal(alias.goalKind, canonical.goalKind);
  // A key the registry cannot place must not quietly become a third spelling of the same widget.
  assert.throws(() => VyraWidgets.create('catalog:socialgoal:subscribers:1:portrait'), /Okänd måltyp/);
});

test('inga gamla inline-defaultobjekt finns kvar', () => {
  assert.equal((MEDIA.match(/state\.widgets\.push\(\{/g) || []).length, 0,
    'media.js har kvar minst ett inline-objektliteral i push()');
  // 21 sedan Gift Jar: en census-vakt, inte ett tak. Hojs den utan att en katalogsektion faktiskt
  // tillkommit ar det ett tecken pa att nagon lagt tillbaka ett inline-defaultobjekt pa omvagen —
  // darfor ska siffran andras medvetet, aldrig "for att fa gront".
  //
  // Kortvarigt 22 (Guardian Welcome) och tillbaka till 21 samma dag nar den familjen skrotades.
  // En census som gar UPP och sedan NER ar inget varningstecken i sig; det ar en katalogsektion
  // som kom och gick. Att den gar ner UTAN att en sektion tagits bort vore daremot allvarligt.
  //
  // 22 igen sedan Guardian Emblem — EN sektion, EN create(). Siffran gick kortvarigt till 23 under
  // bygget, och det var vakten som gjorde ratt: den andra traffen var ingen katalogplats alls utan
  // en panel som skapade en kastad widget bara for att lasa dess matt. Den lasningen gar nu genom
  // `VyraWidgets.variants('guardianemblem.matt')` i stallet. Censusen raknar KATALOGSTALLEN, och en
  // matt-uppslagning som smyger in bland dem gor siffran obegriplig for nasta lasare.
  assert.equal((MEDIA.match(/VyraWidgets\.create\(/g) || []).length, 22,
    'antalet kataloganrop stämmer inte med de tjugotvå katalogställena');
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
  const constants = KEY_ASSIGNMENTS(MEDIA)
    .filter(b => !b.concatenated && !CONSTANT_OK.has(b.literal))
    .map(b => b.literal);
  assert.deepEqual(constants, [],
    'dessa kataloganrop har en fast nyckel trots att familjen har varianter');
});

test('alla fem variantlösa katalognycklar finns kvar', () => {
  const literals = new Set(KEY_ASSIGNMENTS(MEDIA).filter(b => !b.concatenated).map(b => b.literal));
  for (const key of ['catalog:video', 'catalog:topgift', 'catalog:topstreak',
    'catalog:followeralert', 'catalog:likefountain']) {
    assert.ok(literals.has(key), `${key} byggs inte längre`);
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
