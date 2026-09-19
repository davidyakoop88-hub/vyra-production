const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Top Streak has one simple catalog entry and no style control', () => {
  const source = read('premium-final.js');
  assert.match(source, /VYRA TOP STREAK · REDIGERBAR/);
  assert.match(source, /data-catalog-key="catalog:topstreak"/);
  assert.match(source, /section\.innerHTML=/);
  assert.match(source, /#streakTheme/);
  assert.match(source, /#pfStreakStyle/);
  assert.match(source, /closest\('label'\)\?\.remove/);
});

test('Top Streak renderer flips profile and gift without legacy mechanism', () => {
  const source = read('premium-final.js');
  const start = source.indexOf('vyraStreak=function(w)');
  const end = source.indexOf('const klassiskTopGift', start);
  const renderer = source.slice(start, end);
  assert.match(renderer, /vyra-streak-simple/);
  assert.match(renderer, /streak-profile-face/);
  assert.match(renderer, /streak-gift-face/);
  assert.doesNotMatch(renderer, /streak-mechanism/);
  assert.doesNotMatch(renderer, /streakFrame/);
  assert.doesNotMatch(renderer, /streakTheme/);
});

test('Top Streak CSS keeps profile filled, gift complete, and motion accessible', () => {
  const css = read('top-streak-simple.css');
  assert.match(css, /object-fit: cover/);
  assert.match(css, /object-fit: contain/);
  assert.match(css, /calc\(8s \/ var\(--speed\)\)/);
  assert.match(css, /vyraStreakFrontLoop/);
  assert.match(css, /vyraStreakBackLoop/);
  assert.match(css, /infinite/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('cache versions change with the Top Streak files', () => {
  // Bumpad 2026-09-20: media.js bar versionsstrangen for gift-fireworks.js, som andrades nar
  // fyrverkeriets niva borjade folja gavans varde. media.js har alltsa andrats, och da maste
  // dess EGEN strang bytas — annars fortsatter en cachad media.js peka pa den gamla filen.
  // top-streak-simple.css ar OROD och behaller darfor -13: en bump utan andring ar en gratis
  // omladdning for varje anvandare. Samma regel som i widget-rendering-cache-and-fountain.
  const studio = read('studio.html');
  const media = read('media.js');
  assert.match(studio, /top-streak-simple\.css\?v=20260919-13/);
  assert.match(studio, /media\.js\?v=20260919-15-niva/);
  assert.match(media, /const version='20260919-14'/);
});
