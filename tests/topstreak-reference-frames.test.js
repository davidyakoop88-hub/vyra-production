'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const widgets = require(path.join(root, 'widget-factory.js'));
const media = fs.readFileSync(path.join(root, 'media.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'studio.css'), 'utf8');
const referenceFrames = [
  'crystal-ascension', 'royal-coronation', 'celestial-awakening', 'phoenix-rise',
  'diamond-evolution', 'portal-rebirth', 'legendary-bloom'
];

test('referensens sju designer är separata Top Streak-ramar med alpha', () => {
  const frames = widgets.variants('topstreak.frame');
  for (const frame of referenceFrames) {
    assert.ok(frames[frame], frame + ' saknas i registret');
    const asset = path.join(root, 'assets', 'topstreak-frames', frame + '.png');
    assert.ok(fs.existsSync(asset), frame + ' saknar PNG');
    const png = fs.readFileSync(asset);
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.equal(png[25], 6, frame + ' saknar RGBA/alpha');
  }
});

test('nya modeller använder streak-flippen och visar combo, aldrig coins', () => {
  const start = media.indexOf('function vyraStreak(w)');
  const end = media.indexOf('\n', start);
  const renderer = media.slice(start, end);
  assert.match(renderer, /class="streak-gift-face"/);
  assert.match(renderer, /class="streak-profile-face"/);
  assert.match(renderer, /w\.streakPrefix\?\?'×'/);
  assert.doesNotMatch(renderer, /coin|diamond/i);
  for (const frame of referenceFrames) {
    const made = widgets.create('catalog:topstreak:frame:' + frame);
    assert.equal(made.streakFrame, frame);
    assert.equal(made.templateTitle, 'TOP STREAK');
    assert.equal(widgets.variants('topstreak.frame')[frame].continuous, true);
  }
  assert.match(renderer, /sf\.continuous\?' continuous-flip'/);
  assert.match(css, /continuous-flip \.streak-flip[^\{]*\{animation:vyraContinuousFlip 6\.4s[^\}]*infinite!important/);
  assert.match(css, /continuous-flip \.streak-gift-face img/);
});
