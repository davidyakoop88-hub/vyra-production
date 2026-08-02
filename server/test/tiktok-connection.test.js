'use strict';
// Covers normalizeTikTokUsername, the gatekeeper for /api/workspaces/:id/tiktok-connection.
// The value it returns becomes both a Postgres row and an argv entry for a forked bridge
// process (tiktok-bridge/connection-manager.js), so the tests below are as much about what
// it REJECTS as what it accepts.
const test = require('node:test'), assert = require('node:assert/strict');
const { normalizeTikTokUsername } = require('../security');

test('accepts a plain username unchanged', () => {
  assert.equal(normalizeTikTokUsername('streamqueen'), 'streamqueen');
});

test('strips a leading @ and case-folds, so @Alice and alice are one connection', () => {
  assert.equal(normalizeTikTokUsername('@Alice'), 'alice');
  assert.equal(normalizeTikTokUsername('ALICE'), 'alice');
  assert.equal(normalizeTikTokUsername('  @Alice  '), 'alice');
});

test('allows the dot and underscore TikTok itself permits', () => {
  assert.equal(normalizeTikTokUsername('a_b.c123'), 'a_b.c123');
});

test('enforces TikTok length limits (2-24)', () => {
  assert.equal(normalizeTikTokUsername('a'), null);
  assert.equal(normalizeTikTokUsername('ab'), 'ab');
  assert.equal(normalizeTikTokUsername('x'.repeat(24)), 'x'.repeat(24));
  assert.equal(normalizeTikTokUsername('x'.repeat(25)), null);
});

test('rejects anything that could be reinterpreted downstream', () => {
  for (const bad of [
    'bad name',          // whitespace — would split an argv line
    'drop;table',        // shell/SQL punctuation
    '../etc/passwd',     // path traversal
    'user\nname',        // newline injection
    'user--comment',     // dash pair
    '<script>',          // markup
    "o'brien",           // quote
    'user@host',         // interior @
  ]) {
    assert.equal(normalizeTikTokUsername(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test('rejects empty and non-string input instead of coercing it', () => {
  for (const bad of ['', '   ', '@', null, undefined, 0, {}, []]) {
    assert.equal(normalizeTikTokUsername(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});
