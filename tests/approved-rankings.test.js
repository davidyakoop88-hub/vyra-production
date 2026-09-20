const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const js = fs.readFileSync('approved-rankings.js', 'utf8');
const css = fs.readFileSync('approved-rankings.css', 'utf8');
const html = fs.readFileSync('studio.html', 'utf8');
const topLike = fs.readFileSync('toplike-design.js', 'utf8');

test('old Top Streak catalog families are centrally removed and replaced once', () => {
  assert.match(js, /querySelectorAll\('\.streak-template-section:not\(\[data-approved-streak\]\)'\).*remove/);
  assert.match(js, /VYRA TOP STREAK · CLEAN FLIP/);
  assert.doesNotMatch(js, /Inferno Streak|Liquid Gold Fuse|Golden Wings/);
});

test('approved Top Streak is transparent and flips forever every eight seconds', () => {
  assert.match(js, /streakFlipSeconds: 8/);
  assert.match(css, /animation:approved-streak-flip var\(--flip-duration,8s\).*infinite/);
  assert.match(css, /background:none!important/);
});

test('Top Like accepts only the four approved skins and defaults transparent', () => {
  assert.match(js, /clean-bar.*soft-stack.*mini-podium.*side-rank/);
  assert.match(js, /LIKE_SKINS\.has\(w\.skin\).*'clean-bar'/s);
  assert.match(topLike, /widget\.showBackground = false/);
  assert.match(js, /TOP LIKE · VYRA ORIGINAL/);
  assert.match(js, /createApprovedLike/);
});

test('central retirement guard loads last with its own cache version', () => {
  assert.match(html, /approved-rankings\.css\?v=20260920-2/);
  // Bumpad till -3 2026-09-20: tom Clean Flip doljs i overlay, ramvaljaren bort. CSS:en ar orord (-2).
  assert.match(html, /approved-rankings\.js\?v=20260920-3/);
  assert.ok(html.indexOf('approved-rankings.js?v=20260920-3') > html.indexOf('vyra-state-sync.js'));
});
