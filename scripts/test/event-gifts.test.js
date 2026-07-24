'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');

test('event gift manifest contains only available event images', () => {
  const context = { window: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, 'assets', 'gifts', 'gifts-manifest.js'), 'utf8'),
    context
  );

  const gifts = context.window.VYRA_GIFTS;
  assert.equal(gifts.length, 1148);
  assert.equal(new Set(gifts.map((gift) => gift.file)).size, gifts.length);

  for (const gift of gifts) {
    assert.match(gift.file, /^assets\/gifts\/events\/.+\.png$/);
    assert.equal(fs.existsSync(path.join(root, ...gift.file.split('/'))), true, gift.file);
  }
});

test('gift events resolve local images and pass them into actions', () => {
  const resolver = fs.readFileSync(path.join(root, 'gift-event-images.js'), 'utf8');
  const liveClient = fs.readFileSync(path.join(root, 'live-client.js'), 'utf8');
  assert.match(resolver, /vyra-live-event/);
  assert.match(resolver, /detail\.giftImage = match\.file/);
  assert.match(liveClient, /giftImage:e\.giftImage\|\|''/);
});
