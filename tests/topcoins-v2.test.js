const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const js = fs.readFileSync('topcoins-v2.js', 'utf8');
const css = fs.readFileSync('topcoins-v2.css', 'utf8');
const html = fs.readFileSync('studio.html', 'utf8');

test('Top Coins ships only the approved Halo and Signal Orbit designs', () => {
  assert.match(js, /halo:\s*\{\s*label: 'Halo'/);
  assert.match(js, /'signal-orbit':\s*\{\s*label: 'Signal Orbit'/);
  assert.match(js, /querySelectorAll\('\[data-ranking="templateTopCoins"\]'\).*\.remove\(\)/);
  assert.match(js, /data-catalog-key="catalog:ranking:templateTopCoins:\$\{id\}"/);
});

test('Top Coins is a single leader with no legacy rank badge', () => {
  assert.match(js, /likeCount: 1/);
  assert.match(js, /UTAN PLACERINGSTAL/);
  assert.doesNotMatch(js, /<b>[1-9]<\/b>/);
  assert.match(js, /toplike-row rank-1/);
});

test('both approved designs are transparent by default and animated independently', () => {
  assert.match(js, /showBackground: false/);
  assert.match(css, /background:none!important/);
  assert.match(css, /topcoins-halo .*animation:tc-spin/);
  assert.match(css, /tc-o1.*animation:tc-spin/);
  assert.match(css, /topcoins-paused/);
});

test('Top Coins assets are loaded after media with a fresh shared cache version', () => {
  assert.match(html, /topcoins-v2\.css\?v=20260920-1/);
  assert.ok(html.indexOf('media.js?v=20260923-4') < html.indexOf('topcoins-v2.js?v=20260920-1'));
});
