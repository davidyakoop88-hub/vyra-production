const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

test('desktop updates remove stale frontend caches before Studio opens', () => {
  const clearCache = source.indexOf('clearCache()');
  const loadStudio = source.indexOf('main.loadURL');
  assert.ok(clearCache >= 0);
  assert.ok(loadStudio > clearCache);
  assert.match(source, /storages:\s*\['serviceworkers',\s*'cachestorage'\]/);
});

test('cache cleanup preserves account cookies and saved layouts', () => {
  assert.doesNotMatch(source, /clearStorageData\(\s*\)/);
  const cleanup = source.match(/clearStorageData\(\{[^}]+\}\)/)?.[0] || '';
  assert.doesNotMatch(cleanup, /localstorage|cookies/i);
});
