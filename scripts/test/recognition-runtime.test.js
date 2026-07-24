'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
[
  'recognition-types.js',
  'recognition-rules.js',
  'recognition-normalizer.js',
  'recognition-merge.js',
  'recognition-queue.js',
  'recognition-controller.js',
  'recognition-card-mapper.js',
  'recognition-card.js',
  'recognition-runtime.js',
  'recognition-adapter-types.js',
  'recognition-adapter.js'
].forEach(file => require(path.join(root, file)));

const verification = require(path.join(root, 'recognition-verify.js'));

test('all recognition runtime and adapter verification cases pass', async () => {
  const results = await verification.run();
  const failed = results.filter(result => !result.pass);
  assert.equal(results.length >= 262, true, `Expected the complete recognition suite, received ${results.length} cases`);
  assert.deepEqual(failed, []);
});
