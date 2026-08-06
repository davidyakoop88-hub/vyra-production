'use strict';
// One writer for the active session state, and it is session-state.js.
//
// Six keys are protected: the layout, the projection marker and the four account-bound EXTRA keys.
// Any other file that writes them directly can bypass the lock, the marker and the generation guard
// — which is exactly the race the whole block exists to close. A source scan is the right tool here:
// the rule is "no such call site exists", and that is a property of the tree, not of one run.
//
// Reads are deliberately NOT banned. The plan converts the readers that matter for account
// isolation; a stray read cannot corrupt another tab's projection.
//
// RED BY CONSTRUCTION: the 17 call sites verified in the inventory are still unconverted.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const OWNER = 'session-state.js';

const PROTECTED = ['vyra-state', 'vyra-session-projection', 'vyra-extras',
  'vyra-action-event-v2', 'vyra-favorite-widgets'];

// Client files only. server/, tiktok-bridge/ and electron-app/ have their own storage story, and
// tests/ and scripts/ are not shipped.
const SKIP_DIRS = new Set(['node_modules', '.git', 'server', 'tiktok-bridge', 'electron-app',
  'tests', 'scripts', 'docs', 'public', 'assets', '.github', '.claude', '.deploy']);
const SKIP_FILES = new Set(['gsap.min.js', 'pixi.min.js']);

function clientFiles(dir = ROOT, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) clientFiles(path.join(dir, entry.name), out);
    } else if (entry.name.endsWith('.js') && !SKIP_FILES.has(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// Comments are stripped so a file that documents the rule is not accused of breaking it.
const code = file => fs.readFileSync(file, 'utf8').split('\n')
  .map(line => line.replace(/\/\/.*$/, '')).join('\n');

// A write is setItem/removeItem whose first argument names a protected key — as a literal, or via a
// constant that resolves to one in the same file (the pattern state-backup.js and cloud-sync.js use).
function protectedWrites(source) {
  const hits = [];
  const constants = new Map();
  for (const [, name, value] of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*'([^']+)'/g)) {
    if (PROTECTED.includes(value)) constants.set(name, value);
  }
  for (const match of source.matchAll(/\.(setItem|removeItem)\(\s*([^,)]+)/g)) {
    const [, method, rawArg] = match;
    const arg = rawArg.trim();
    const literal = arg.match(/^['"]([^'"]+)['"]$/);
    if (literal && PROTECTED.includes(literal[1])) { hits.push(`${method}('${literal[1]}')`); continue }
    if (constants.has(arg)) hits.push(`${method}(${arg} = '${constants.get(arg)}')`);
  }
  return hits;
}

test('endast session-state.js skriver de skyddade nycklarna', { timeout: 15000 }, () => {
  const offenders = [];
  for (const file of clientFiles()) {
    if (path.basename(file) === OWNER) continue;
    const hits = protectedWrites(code(file));
    if (hits.length) offenders.push(`${path.relative(ROOT, file)}: ${[...new Set(hits)].join(', ')}`);
  }
  assert.deepEqual(offenders, [],
    'dessa filer skriver skyddad sessionsstate direkt och kringgår lås, markör och generation:\n  '
    + offenders.join('\n  '));
});

test('skannern hittar en skyddad skrivning både som literal och via konstant', () => {
  assert.deepEqual(protectedWrites(`localStorage.setItem('vyra-state', x)`), [`setItem('vyra-state')`]);
  assert.deepEqual(protectedWrites(`const STATE_KEY='vyra-state';localStorage.setItem(STATE_KEY,x)`),
    [`setItem(STATE_KEY = 'vyra-state')`]);
  assert.deepEqual(protectedWrites(`localStorage.setItem('vyra-seen-users-v1', x)`), [],
    'skannern flaggar nycklar som inte är skyddade');
  assert.deepEqual(protectedWrites(`// localStorage.setItem('vyra-state', x)`.replace(/\/\/.*$/, '')), [],
    'en kommenterad rad räknades som en skrivning');
});

test('session-state.js finns och är den enda undantagna filen', () => {
  assert.ok(fs.existsSync(path.join(ROOT, OWNER)), `${OWNER} finns inte`);
});
