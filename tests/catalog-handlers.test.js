'use strict';
// The catalog handlers are executed here, not read. node --check proves a file parses; it says
// nothing about a `let` that went missing when a declaration was hoisted out of a handler, which
// turns a local into an implicit global the moment the button is clicked. Hoisting the catalog key
// to build time moves declarations across a scope boundary at twenty sites, so that is exactly the
// mistake this file exists to catch — it already happened once, in the first family, and only a
// manual read found it.
//
// Everything runs in a strict-mode VM whose global object is inspected before and after each step.
// A leaked temporary shows up as a new property; strict mode alone would only catch an assignment
// to an undeclared name, and `let created=…` becoming `created=…` inside a non-strict script is
// precisely the case that slips through.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));
const MEDIA = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');

// ---- locating a catalog block --------------------------------------------------------------------
// Deterministic: find the key binding, then take the whole physical line it sits on. media.js writes
// one catalog section per line, so the line is the block. No regex over the file.
function blockContaining(marker) {
  const at = MEDIA.indexOf(marker);
  assert.notEqual(at, -1, `hittade ingen katalogsektion för ${marker}`);
  const start = MEDIA.lastIndexOf('\n', at) + 1;
  let end = MEDIA.indexOf('\n', at);
  if (end === -1) end = MEDIA.length;
  return MEDIA.slice(start, end);
}

// A DOM small enough to read and complete enough to build a catalog section and click its buttons.
function makeDom(containers = []) {
  const make = tag => {
    const node = {
      tagName: String(tag).toUpperCase(), children: [], dataset: {}, attrs: {}, style: {},
      className: '', textContent: '', parent: null, _html: '',
      set innerHTML(html) { this._html = String(html); this.children = adopt(this, parseNodes(this._html)) },
      get innerHTML() { return this._html },
      // Only 'beforeend' is used by the catalog; anything else would be a silent no-op, so it throws.
      insertAdjacentHTML(position, html) {
        assert.equal(position, 'beforeend', `oväntad insertAdjacentHTML-position: ${position}`);
        this._html += String(html);
        adopt(this, parseNodes(String(html))).forEach(n => this.children.push(n));
      },
      append(...kids) { kids.forEach(k => { k.parent = node; node.children.push(k) }) },
      prepend(...kids) { kids.forEach(k => { k.parent = node; node.children.unshift(k) }) },
      remove() {},
      querySelector(sel) { return descendants(node).find(d => matches(d, sel)) || null },
      querySelectorAll(sel) { return descendants(node).filter(d => matches(d, sel)) },
      closest() { return null }
    };
    return node;
  };
  const descendants = n => n.children.flatMap(c => [c, ...descendants(c)]);
  // One compound: a tag, .class, #id and [attr] / [attr="value"] in any combination. data-* reads from
  // dataset, everything else from attrs — the catalog uses option[value="…"] as well as [data-…].
  function matchesCompound(node, one) {
    let rest = one;
    for (;;) {
      const at = rest.indexOf('[');
      if (at === -1) break;
      const end = rest.indexOf(']', at);
      if (end === -1) return false;
      const inner = rest.slice(at + 1, end);
      const eq = inner.indexOf('=');
      const name = (eq === -1 ? inner : inner.slice(0, eq)).trim();
      const want = eq === -1 ? undefined : inner.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      const have = name.startsWith('data-')
        ? node.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())]
        : node.attrs[name];
      if (have === undefined) return false;
      if (want !== undefined && have !== want) return false;
      rest = rest.slice(0, at) + rest.slice(end + 1);
    }
    for (const cls of rest.split('.').slice(1)) {
      if (!node.className.split(/\s+/).includes(cls.split('#')[0])) return false;
    }
    const id = /#([A-Za-z0-9_-]+)/.exec(rest);
    if (id && node.attrs.id !== id[1]) return false;
    const tag = rest.split(/[.#]/)[0].trim();
    return !tag || node.tagName === tag.toUpperCase();
  }
  // Comma-separated alternatives, each of which may be a descendant chain ('.properties h4').
  function matches(node, sel) {
    return String(sel).split(',').map(s => s.trim()).filter(Boolean).some(one => {
      const parts = one.split(/\s+/);
      if (!matchesCompound(node, parts[parts.length - 1])) return false;
      let cursor = node.parent;
      for (let i = parts.length - 2; i >= 0; i -= 1) {
        while (cursor && !matchesCompound(cursor, parts[i])) cursor = cursor.parent;
        if (!cursor) return false;
        cursor = cursor.parent;
      }
      return true;
    });
  }
  // A tag-stack parser rather than a button scanner. Several catalog sections look up a container
  // their own markup created (.streak-style-grid, .template-style-grid) and then write into it; a
  // parser that only saw <button> made those lookups return null, so the section built nothing here
  // while working perfectly in a browser. Deterministic scan, no regex over the whole string.
  const VOID = new Set(['br', 'img', 'input', 'hr', 'meta', 'link', 'source']);
  function parseAttrs(node, tail) {
    let a = 0;
    for (;;) {
      const eq = tail.indexOf('=', a);
      if (eq === -1) break;
      const quote = tail[eq + 1];
      if (quote !== '"' && quote !== "'") { a = eq + 1; continue }
      const endQuote = tail.indexOf(quote, eq + 2);
      if (endQuote === -1) break;
      let nameStart = eq;
      while (nameStart > 0 && /[A-Za-z0-9_:-]/.test(tail[nameStart - 1])) nameStart -= 1;
      const name = tail.slice(nameStart, eq).trim();
      const value = tail.slice(eq + 2, endQuote);
      if (name.startsWith('data-')) {
        node.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
      } else if (name === 'class') node.className = value;
      else node.attrs[name] = value;
      a = endQuote + 1;
    }
  }
  function parseNodes(html) {
    const roots = [], stack = [];
    const addText = text => { const top = stack[stack.length - 1]; if (top) top.textContent += text };
    let i = 0;
    while (i < html.length) {
      const lt = html.indexOf('<', i);
      if (lt === -1) { addText(html.slice(i)); break }
      if (lt > i) addText(html.slice(i, lt));
      const gt = html.indexOf('>', lt);
      if (gt === -1) break;
      if (html[lt + 1] === '/') { stack.pop(); i = gt + 1; continue }
      const raw = html.slice(lt + 1, gt);
      const name = raw.split(/[\s/>]/)[0];
      const node = make(name);
      parseAttrs(node, raw.slice(name.length));
      const parent = stack[stack.length - 1];
      node.parent = parent || null;
      (parent ? parent.children : roots).push(node);
      if (!raw.endsWith('/') && !VOID.has(name.toLowerCase())) stack.push(node);
      i = gt + 1;
    }
    return roots;
  }
  const adopt = (parent, nodes) => { nodes.forEach(n => { n.parent = parent }); return nodes };
  const catalog = make('div');
  catalog.className = 'widget-catalog';
  const root = make('div');
  root.append(catalog);
  // Some sections do not build their own container — they attach to one an earlier bind() created.
  // Each family declares the containers it expects to already be there, so the dependency is stated
  // per family instead of every family silently getting every container.
  containers.forEach(cls => { const el = make('div'); el.className = cls; catalog.append(el) });
  return {
    catalog,
    document: {
      createElement: make,
      querySelector: sel => (matches(catalog, sel) ? catalog : root.querySelector(sel)),
      querySelectorAll: sel => root.querySelectorAll(sel),
      body: root
    }
  };
}

// Runs one catalog block in a strict-mode VM and reports every global it created.
function runBlock(source, extras = {}, containers = []) {
  const sandbox = Object.create(null);
  const dom = makeDom(containers);
  Object.assign(sandbox, {
    VyraWidgets, JSON, Math, Number, String, Object, Array, Set, Map, Boolean, Date, Error,
    crypto: require('crypto').webcrypto, Uint32Array,
    document: dom.document,
    state: { widgets: [] },
    view: 'editor', selected: null,
    bind: () => {}, save: () => {}, render: () => {}, toast: () => {},
    ...extras
  });
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  const before = new Set(Object.keys(sandbox));
  // 'use strict' is prepended so an assignment to an undeclared name throws instead of silently
  // creating a global — and the key set is compared afterwards for anything that got through.
  vm.runInNewContext('"use strict";' + source, sandbox, { filename: 'media.js#catalog' });
  sandbox.bind();
  const afterBuild = Object.keys(sandbox).filter(k => !before.has(k));
  const buttons = dom.catalog.querySelectorAll('button');
  return { sandbox, dom, buttons, before, afterBuild };
}

function leaksAfterClicks(block, extras, containers) {
  const run = runBlock(block, extras, containers);
  assert.ok(run.buttons.length > 0, 'katalogsektionen byggde inga knappar');
  const leaks = new Set(run.afterBuild);
  for (const button of run.buttons) {
    const before = new Set(Object.keys(run.sandbox));
    assert.equal(typeof button.onclick, 'function', 'knappen fick ingen klickhandler');
    button.onclick();
    Object.keys(run.sandbox).filter(k => !before.has(k)).forEach(k => leaks.add(k));
  }
  return { leaks: [...leaks], run };
}

// The families that have been hoisted so far. Each entry is added as its family lands.
// Every catalog family, with the globals its section reads. Stubs are the real shapes — a stub that
// does not match the source would let a handler pass here and throw in the browser.
const FRAMES = name => VyraWidgets.variants(name);
const HOISTED = [
  ['Top Like', "catalogKey='catalog:toplike:'+theme", { tlStyles: [['clean', 'Stil 1'], ['neon', 'Stil 2']] }],
  ['Ranking', "catalogKey='catalog:ranking:'+type+':'+theme",
    { rankingKinds: { templateTopCoins: { title: 'TOP COINS', icon: '●', label: 'Top Coins' },
      templateTopPoints: { title: 'TOP POINTS', icon: '◆', label: 'Top Points' } } }],
  ['Top Gift · tema', "catalogKey='catalog:topgift:'+theme", {}, ['prototype-section']],
  ['Top Gift · extratema', "catalogKey='catalog:topgift:extra:'+theme", { GIFT_FRAMES: FRAMES('topgift.frame') }, ['template-style-grid']],
  ['Top Gift · ram', "catalogKey='catalog:topgift:frame:'+fid", { GIFT_FRAMES: FRAMES('topgift.frame') }, ['template-style-grid']],
  ['Top Streak · tema', "catalogKey='catalog:topstreak:'+theme", { STREAK_FRAMES: FRAMES('topstreak.frame') }, ['streak-template-section']],
  ['Top Streak · ram', "catalogKey='catalog:topstreak:frame:'+fid", { STREAK_FRAMES: FRAMES('topstreak.frame') }, ['streak-template-section']],
  ['Heart Goal', "catalogKey='catalog:heartgoal:'+t", { heartThemes: FRAMES('heartgoal.theme') }],
  ['Fan Level', "catalogKey='catalog:fanlevel:'+t", { fanLevelThemes: FRAMES('fanlevel.theme') }],
  ['Gifter Level', "catalogKey='catalog:gifterlevel:'+layout",
    { glLayouts: [['profile', 'Modell 1'], ['flip', 'Modell 2'], ['sidebadge', 'Modell 3']] }],
  ['Social Goal', "catalogKey='catalog:socialgoal:'+kind", {}],
  ['Battle MVP · stil', "catalogKey='catalog:battlemvp:'+b.dataset.mvpStyle", { MVP_FRAMES: FRAMES('battlemvp.frame') }],
  ['Battle MVP · ram', "catalogKey='catalog:battlemvp:frame:'+fid", { MVP_FRAMES: FRAMES('battlemvp.frame') }],
  ['Gift Campaign', "catalogKey='catalog:giftcampaign:'+t+':'+o",
    { gcThemes: [['neon', 'Neon Event'], ['aurora', 'Aurora']] }]
];

for (const [name, marker, extras, containers = []] of HOISTED) {
  test(`${name}: knapparna byggs, klickas och läcker ingen global`, { timeout: 5000 }, () => {
    const { leaks, run } = leaksAfterClicks(blockContaining(marker), extras, containers);
    assert.deepEqual(leaks, [], `dessa temporära variabler blev globala: ${leaks.join(', ')}`);
    assert.equal(run.sandbox.state.widgets.length > 0, true, 'inget klick skapade en widget');
  });

  test(`${name}: varje knapp bär en giltig katalognyckel före något klick`, { timeout: 5000 }, () => {
    const run = runBlock(blockContaining(marker), extras, containers);
    assert.ok(run.buttons.length > 0);
    for (const button of run.buttons) {
      const key = button.dataset.catalogKey;
      assert.ok(key, 'knappen saknar dataset.catalogKey innan den klickats');
      assert.doesNotThrow(() => VyraWidgets.create(key),
        `registret känner inte igen nyckeln ${key}`);
    }
  });

  test(`${name}: layouthandlern använder samma nyckel som publicerades`, { timeout: 5000 }, () => {
    const run = runBlock(blockContaining(marker), extras, containers);
    for (const button of run.buttons) {
      const published = button.dataset.catalogKey;
      run.sandbox.state.widgets.length = 0;
      button.onclick();
      const created = run.sandbox.state.widgets[run.sandbox.state.widgets.length - 1];
      // Compared against what the registry itself makes of the published key, not the literal string:
      // a resolver may canonicalise a legacy alias (socialgoal's followers → follows), and the widget
      // then carries the canonical form. A handler that built from some *other* key still fails here,
      // because a different key canonicalises to a different value.
      const expected = VyraWidgets.create(published).createdFrom;
      assert.equal(created.createdFrom, expected,
        'knappen skapade en widget från en annan nyckel än den publicerade');
    }
  });
}
