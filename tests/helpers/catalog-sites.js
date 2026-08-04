'use strict';
// Classifies every catalog key publication in media.js as build time or click time.
//
// Two earlier versions of this got it wrong in opposite directions. The first trusted punctuation:
// the video site publishes with a semicolon, inside an IIFE, inside the handler, and was called
// build time. The second compared source positions against the first `<button>.onclick=` on the same
// line — but three lines carry two catalog sites each and both use the button name `b`, so the
// second site on such a line was compared against the first site's handler and called click time.
//
// Neither the punctuation nor the variable name nor the line carries the answer. Containment does:
// a publication is click time exactly when it sits inside the body of some `.onclick = () => { … }`.
// The spans are found with a scanner that tracks strings, template literals and comments, so
// `.onclick` written inside a string or a comment cannot open one.

// Every `.onclick=()=>{ … }` body in `source`, as [start, end) offsets of the text between braces.
function handlerSpans(source) {
  const spans = [];
  const marker = '.onclick';
  let from = 0;
  for (;;) {
    const at = source.indexOf(marker, from);
    if (at === -1) break;
    from = at + marker.length;
    if (insideLiteralOrComment(source, at)) continue;
    // `.onclick` … `=` … `(` … `)` … `=>` … `{`  — with whitespace allowed between each part.
    let i = at + marker.length;
    const skip = () => { while (i < source.length && /\s/.test(source[i])) i += 1 };
    skip();
    if (source[i] !== '=') continue;
    i += 1;
    skip();
    if (source[i] === '=') continue;                 // == or ===, not an assignment
    // arrow parameter list, or a `function (…)` form
    if (source.startsWith('function', i)) { i += 'function'.length; skip() }
    if (source[i] === '(') {
      let depth = 0;
      for (; i < source.length; i += 1) {
        if (source[i] === '(') depth += 1;
        else if (source[i] === ')') { depth -= 1; if (!depth) { i += 1; break } }
      }
    } else {
      while (i < source.length && /[A-Za-z0-9_$]/.test(source[i])) i += 1;   // single arrow param
    }
    skip();
    if (source.startsWith('=>', i)) { i += 2; skip() }
    if (source[i] !== '{') continue;                 // concise arrow body: no braces, no span
    const bodyStart = i + 1;
    const bodyEnd = matchingBrace(source, i);
    if (bodyEnd === -1) continue;
    spans.push({ start: bodyStart, end: bodyEnd });
    from = bodyStart;                                // nested handlers are found on later passes
  }
  return spans;
}

// Index of the `}` matching the `{` at `open`, skipping strings, template literals and comments.
function matchingBrace(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const skipped = skipLiteralOrComment(source, i);
    if (skipped !== i) { i = skipped - 1; continue }
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (!depth) return i }
  }
  return -1;
}

// If a literal or comment starts at `i`, returns the index just past it; otherwise returns `i`.
function skipLiteralOrComment(source, i) {
  const ch = source[i];
  if (ch === '/' && source[i + 1] === '/') {
    const nl = source.indexOf('\n', i);
    return nl === -1 ? source.length : nl;
  }
  if (ch === '/' && source[i + 1] === '*') {
    const end = source.indexOf('*/', i + 2);
    return end === -1 ? source.length : end + 2;
  }
  if (ch === "'" || ch === '"' || ch === '`') {
    for (let j = i + 1; j < source.length; j += 1) {
      if (source[j] === '\\') { j += 1; continue }
      if (source[j] === ch) return j + 1;
      if (ch === '`' && source[j] === '$' && source[j + 1] === '{') {
        const close = matchingBrace(source, j + 1);
        if (close === -1) return source.length;
        j = close;
      }
    }
    return source.length;
  }
  return i;
}

// Whether `target` falls inside a string, template literal or comment. Scans from the start of the
// enclosing line, which is enough for this file: no literal in media.js spans a newline.
function insideLiteralOrComment(source, target) {
  let i = source.lastIndexOf('\n', target) + 1;
  while (i < target) {
    const next = skipLiteralOrComment(source, i);
    if (next === i) { i += 1; continue }
    if (next > target) return true;
    i = next;
  }
  return false;
}

const PUBLISH = '.dataset.catalogKey=catalogKey';

// One entry per catalog key publication, with the containment verdict.
function classifyCatalogSites(source) {
  const spans = handlerSpans(source);
  const inHandler = at => spans.some(span => at >= span.start && at < span.end);
  const sites = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf(PUBLISH, from);
    if (at === -1) break;
    from = at + 1;
    let ns = at;
    while (ns > 0 && /[A-Za-z0-9_$]/.test(source[ns - 1])) ns -= 1;
    sites.push({ button: source.slice(ns, at), publishAt: at, outsideDirectOnclick: !inHandler(at), insideDirectOnclick: inHandler(at) });
  }
  return sites;
}

function count(source) {
  const sites = classifyCatalogSites(source);
  const outside = sites.filter(s => s.outsideDirectOnclick).length;
  // Named for what the scanner can actually see. addBoostPack publishes from a function body
  // that is only reached from a handler — the documented indirect case — so before the transform it
  // counts as outside. The transform removes that publication entirely, which is what the separate
  // invariants below assert.
  return { total: sites.length, outsideDirectOnclick: outside, insideDirectOnclick: sites.length - outside, sites };
}

module.exports = { classifyCatalogSites, count, handlerSpans, insideLiteralOrComment };
