'use strict';
// Minimal DOM good enough for the flip code: class lists, datasets, inline styles and the few
// selector forms media.js and live-leaderboard.js actually use (comma groups, descendant
// combinators, :scope >, [data-…], :not([data-…])). Shared by the two flip suites so the widget
// markup they assert against is described once.

function el(tag, attrs = {}) {
  const node = {
    tagName: String(tag).toUpperCase(), nodeType: 1, children: [], parent: null,
    textContent: attrs.textContent || '', dataset: attrs.dataset || {}, style: {},
    _classes: new Set(attrs.classes || []), _attrs: {},
    get className() { return [...this._classes].join(' ') },
    classList: {
      add(...c) { c.forEach(x => node._classes.add(x)) },
      remove(...c) { c.forEach(x => node._classes.delete(x)) },
      contains(c) { return node._classes.has(c) }
    },
    get offsetWidth() { return 1 },
    setAttribute(k, v) { this._attrs[k] = v; if (k === 'src') this.src = v },
    getAttribute(k) { return this._attrs[k] },
    append(...kids) { kids.forEach(k => { k.parent = node; node.children.push(k) }) },
    querySelector(s) { return descendants(node).find(d => matches(d, s)) || null },
    querySelectorAll(s) { return descendants(node).filter(d => matches(d, s)) }
  };
  return node;
}

const descendants = n => n.children.flatMap(c => [c, ...descendants(c)]);
const ancestors = n => (n.parent ? [n.parent, ...ancestors(n.parent)] : []);

function matchesCompound(node, compound) {
  const scoped = compound.startsWith(':scope >');
  const base = compound.replace(':scope >', '').trim();
  if (scoped && !(node.parent && node.parent._classes.has('vyra-topgift'))) return false;
  const attr = /(:not\()?\[data-([a-zA-Z-]+)(?:="?([^\]"]*)"?)?\]/.exec(base);
  if (attr) {
    const key = attr[2].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const present = node.dataset[key] !== undefined;
    if (attr[1]) { if (present) return false; }              // :not([data-…])
    else if (attr[3] === undefined ? !present : node.dataset[key] !== attr[3]) return false;
  }
  const head = base.replace(/:not\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').trim();
  if (!head) return true;
  return head.split(/(?=\.)/).filter(Boolean).every(part =>
    part.startsWith('.') ? node._classes.has(part.slice(1)) : node.tagName === part.toUpperCase());
}

function matches(node, selector) {
  return String(selector).split(',').map(s => s.trim()).filter(Boolean).some(one => {
    if (one.startsWith(':scope >')) return matchesCompound(node, one);
    const parts = one.split(/\s+(?![^[]*\])/).filter(p => p && p !== '>');
    if (!matchesCompound(node, parts[parts.length - 1])) return false;
    let pool = ancestors(node);
    for (let i = parts.length - 2; i >= 0; i -= 1) {
      const hit = pool.findIndex(a => matchesCompound(a, parts[i]));
      if (hit === -1) return false;
      pool = pool.slice(hit + 1);
    }
    return true;
  });
}

// A document object over one <body>, plus the clock the flip logic reads.
function makeDocument() {
  const body = el('body');
  const doc = {
    body, head: el('head'), documentElement: el('html'), createElement: el,
    querySelector: s => (matches(body, s) ? body : body.querySelector(s)),
    querySelectorAll: s => body.querySelectorAll(s),
    addEventListener() {}
  };
  return { body, doc };
}

module.exports = { el, matches, descendants, makeDocument };
