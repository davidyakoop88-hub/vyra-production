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
  'hall-of-fame', 'royal-throne', 'celestial-champion', 'diamond-pedestal',
  'celestial-fireworks', 'crystal-bloom', 'royal-comet'
];

test('referensens sju Top Gift-modeller är separata katalogramar med transparent asset', () => {
  const frames = widgets.variants('topgift.frame');
  for (const frame of referenceFrames) {
    assert.ok(frames[frame], frame + ' saknas i registret');
    const asset = path.join(root, 'assets', 'topgift-frames', frame + '.png');
    assert.ok(fs.existsSync(asset), frame + ' saknar PNG');
    const png = fs.readFileSync(asset);
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.equal(png[25], 6, frame + ' saknar RGBA/alpha');
  }
});

test('nya Top Gift-ramar använder befintlig profil/gåva-flip och valfria coins', () => {
  const start = media.indexOf('function vyraTopGift(w)');
  const end = media.indexOf('\n', start);
  const renderer = media.slice(start, end);
  assert.match(renderer, /class="vyra-gift-face"/);
  assert.match(renderer, /class="vyra-profile-face"/);
  assert.match(renderer, /showDataValue===false\?'none':'inline'/);
  for (const frame of referenceFrames) {
    const made = widgets.create('catalog:topgift:frame:' + frame);
    assert.equal(made.giftFrame, frame);
    assert.equal(made.showDataValue, true);
    assert.equal(widgets.variants('topgift.frame')[frame].continuous, true);
  }
  assert.match(renderer, /gf\.continuous\?' continuous-flip'/);
  assert.match(css, /continuous-flip \.vyra-flip[^\{]*\{animation:vyraContinuousFlip 6\.4s[^\}]*infinite!important/);
  assert.match(css, /continuous-flip \.vyra-gift-face img/);
});
