'use strict';
// The server owns its own copy of the goal-metric rule, because widget-factory.js sits outside
// server/ — the Docker build context — and cannot be required from the API without moving that
// context. Two copies of a rule drift. This is what stops them.
//
// It runs in the frontend suite, the only place both files exist. If it ever fails, the two
// definitions disagree and one of them is now wrong for real users.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));
const ServerMetrics = require(path.join(ROOT, 'server', 'goal-metrics.js'));

const AGREED = ['followers', 'follows', 'likes', undefined, null, ''];

for (const value of AGREED) {
  test(`goalKind(${JSON.stringify(value)}) betyder samma sak i servern och i registret`,
    { timeout: 5000 }, () => {
      assert.equal(ServerMetrics.goalKind(value), VyraWidgets.goalKind(value),
        'serverns metrikkontrakt har glidit ifrån VyraWidgets.goalKind()');
    });
}

test('båda avvisar okända värden, ingen faller tyst tillbaka', { timeout: 5000 }, () => {
  for (const value of ['subscribers', 'coins', 'shares']) {
    assert.throws(() => ServerMetrics.goalKind(value), /måltyp/i,
      `servern accepterade ${value}`);
    assert.throws(() => VyraWidgets.goalKind(value), /måltyp/i,
      `registret accepterade ${value}`);
  }
});

test('de känner till exakt samma uppsättning måltyper', { timeout: 5000 }, () => {
  // Catches a value added to one side only, which the fixed list above would not.
  const registry = Object.keys(VyraWidgets.variants ? {} : {});   // registry has no public table
  const server = Object.keys(ServerMetrics.GOAL_KINDS).sort();
  assert.deepEqual(server, ['followers', 'follows', 'likes'],
    'serverns lista har ändrats — uppdatera registret och detta test i samma commit');
  // And every one of them round-trips identically through both.
  for (const key of server) {
    assert.equal(ServerMetrics.goalKind(key), VyraWidgets.goalKind(key));
  }
  assert.equal(registry.length, 0);
});
