'use strict';
// New goals start at zero; existing customer values survive as baseline.
//
// Both numbers are correct, for different widgets. The factory makes a goal that has not started
// yet — 658 followers and 43 hearts were demo figures that looked like real progress before anything
// had happened. The snapshot records what the pre-factory inline literals produced, which is what a
// widget saved before this release still carries and what the backfill reads into baseline. Flatten
// the second to the first and every existing customer's goal silently resets.
//
// Target is untouched by all of this: 1000 for a Social Goal, 50 for a Heart Goal, in both places.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));
const ServerMetrics = require(path.join(ROOT, 'server', 'goal-metrics.js'));
const SNAPSHOT = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/widget-defaults.snapshot.json'), 'utf8'));

const GOALS = [
  { key: 'catalog:socialgoal:likes:2:portrait', start: 'goalCurrent', target: 'goalTarget',
    legacy: 658, targetValue: 1000, type: 'templateSocialGoal' },
  { key: 'catalog:socialgoal:follows:1:landscape', start: 'goalCurrent', target: 'goalTarget',
    legacy: 658, targetValue: 1000, type: 'templateSocialGoal' },
  { key: 'catalog:heartgoal:neon', start: 'heartCurrent', target: 'heartTarget',
    legacy: 43, targetValue: 50, type: 'templateHeartGoal' }
];

for (const goal of GOALS) {
  test(`${goal.key}: ett nytt mål startar på 0`, { timeout: 5000 }, () => {
    const made = VyraWidgets.create(goal.key);
    assert.equal(made[goal.start], 0, 'en nyskapad widget bär fortfarande ett demostartvärde');
  });

  test(`${goal.key}: målvärdet är oförändrat`, { timeout: 5000 }, () => {
    const made = VyraWidgets.create(goal.key);
    assert.equal(made[goal.target], goal.targetValue,
      'målvärdet ändrades — bara startvärdet skulle bli 0');
  });

  test(`${goal.key}: snapshoten bevarar legacyvärdet för backfill`, { timeout: 5000 }, () => {
    assert.equal(SNAPSHOT[goal.key][goal.start], goal.legacy,
      'migrationskontraktet ändrades — befintliga kunders startvärden går förlorade');
    assert.equal(SNAPSHOT[goal.key][goal.target], goal.targetValue);
  });

  test(`${goal.key}: servern läser legacyvärdet som baseline, inte 0`, { timeout: 5000 }, () => {
    // The join between the two: what backfill actually does with a widget saved before this release.
    const saved = SNAPSHOT[goal.key];
    assert.equal(ServerMetrics.baselineForWidget({ ...saved, type: goal.type }), goal.legacy);
    // And a widget the factory just made gives a baseline of zero through the same function.
    assert.equal(ServerMetrics.baselineForWidget(VyraWidgets.create(goal.key)), 0);
  });

  test(`${goal.key}: servern faller tillbaka på typens målvärde`, { timeout: 5000 }, () => {
    for (const bad of [0, -1, undefined, NaN, 'abc']) {
      assert.equal(ServerMetrics.targetForWidget({ type: goal.type, [goal.target]: bad }),
        goal.targetValue, `target ${JSON.stringify(bad)} gav inte typens egen default`);
    }
  });
}
