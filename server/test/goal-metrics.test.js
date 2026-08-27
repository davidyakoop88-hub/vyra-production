'use strict';
// The server cannot require widget-factory.js. It sits in the repo root, outside server/, which is
// the Docker build context — COPY ../widget-factory.js is not legal, and moving the context would
// change how the whole API is built. So the server owns its own copy of the rule, and a parity test
// in the frontend suite (tests/goal-metric-parity.test.js), where both files exist, fails if the two
// ever disagree.
//
// This file tests the server's own contract. Parity is proven separately.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const M = require(path.join(__dirname, '..', 'goal-metrics.js'));

test('followers normaliseras till follows', { timeout: 5000 }, () => {
  assert.equal(M.goalKind('followers'), 'follows');
});

test('follows är redan kanoniskt', { timeout: 5000 }, () => {
  assert.equal(M.goalKind('follows'), 'follows');
});

test('likes är kanoniskt', { timeout: 5000 }, () => {
  assert.equal(M.goalKind('likes'), 'likes');
});

test('saknat eller tomt värde blir follows', { timeout: 5000 }, () => {
  for (const value of [undefined, null, '']) assert.equal(M.goalKind(value), 'follows');
});

test('okänt värde kastar i stället för att tyst bli follows', { timeout: 5000 }, () => {
  assert.throws(() => M.goalKind('subscribers'), /måltyp/i);
  assert.throws(() => M.goalKind('coins'), /måltyp/i);
});

test('metriken för en målwidget följer widgettypen', { timeout: 5000 }, () => {
  // PRODUKTBESLUT 2026-08-26: templateHeartGoal har inget eget kind-falt, och den GAMLA regeln
  // "ett hjarta ar en like" ar upphavd. Uppmatt i test-LIVE 2: tva unika Heart Me-avsandare, men
  // widgeten visade 48/50 — allt fran TikTok-likes. Malet raknar numera unika personer som skickar
  // gavan Heart Me, och metriken matas ALDRIG av contributionsFor().
  assert.equal(M.metricForWidget({ type: 'templateHeartGoal' }), 'unique_gift_senders');
  assert.equal(M.metricForWidget({ type: 'templateSocialGoal', goalKind: 'followers' }), 'follows');
  assert.equal(M.metricForWidget({ type: 'templateSocialGoal', goalKind: 'likes' }), 'likes');
  // A social goal that never had the field saved defaults the same way the renderer does.
  assert.equal(M.metricForWidget({ type: 'templateSocialGoal' }), 'follows');
});

test('en widget som inte är ett mål ger ingen metrik', { timeout: 5000 }, () => {
  // This is what stops an arbitrary widget id from ever creating a runtime row.
  for (const type of ['templateTopGift', 'templateBattleMvp', 'video', undefined]) {
    assert.equal(M.metricForWidget({ type }), null);
  }
  assert.equal(M.metricForWidget(null), null);
});

test('baseline hämtas ur befintligt state, en gång', { timeout: 5000 }, () => {
  // goalCurrent/heartCurrent are the numbers the streamer typed. They seed baseline when the runtime
  // row is first created and are never read again — PATCH and reset are authoritative after that.
  assert.equal(M.baselineForWidget({ type: 'templateSocialGoal', goalCurrent: 658 }), 658);
  assert.equal(M.baselineForWidget({ type: 'templateHeartGoal', heartCurrent: 43 }), 43);
  assert.equal(M.baselineForWidget({ type: 'templateSocialGoal' }), 0, 'nya mål börjar på 0');
  assert.equal(M.baselineForWidget({ type: 'templateSocialGoal', goalCurrent: -5 }), 0,
    'negativa värden i gammalt state får inte bli en negativ baseline');
});

test('target hämtas ur befintligt state med en giltig undre gräns', { timeout: 5000 }, () => {
  assert.equal(M.targetForWidget({ type: 'templateSocialGoal', goalTarget: 1000 }), 1000);
  assert.equal(M.targetForWidget({ type: 'templateHeartGoal', heartTarget: 50 }), 50);
  // A saved 0 breaks the schema's CHECK (target > 0) and has to be lifted. It becomes the product
  // default rather than 1: a target of 1 would read as complete the instant the first event lands,
  // which is a worse lie than falling back to the number a new goal would have had.
  assert.equal(M.targetForWidget({ type: 'templateSocialGoal', goalTarget: 0 }), 1000);
  assert.equal(M.targetForWidget({ type: 'templateSocialGoal', goalTarget: -5 }), 1000);
});

test('målwidgetarna i en overlay-state plockas ut, inga andra', { timeout: 5000 }, () => {
  const state = { widgets: [
    { id: 'a', type: 'templateSocialGoal', goalKind: 'followers', goalCurrent: 10, goalTarget: 100 },
    { id: 'b', type: 'templateHeartGoal', heartCurrent: 5, heartTarget: 50 },
    { id: 'c', type: 'templateTopGift' },
    { id: 'd', type: 'templateSocialGoal', goalKind: 'likes', placement: 'standalone' },
    { type: 'templateSocialGoal' }                                   // no id at all
  ] };
  const goals = M.goalWidgetsIn(state);
  assert.deepEqual(goals.map(g => g.widgetId), ['a', 'b', 'd'], 'fel widgetar räknades som mål');
  assert.equal(goals[0].metric, 'follows');
  assert.equal(goals[0].baseline, 10);
  assert.equal(goals[1].metric, 'unique_gift_senders', 'Heart Me Goal bar den egna metriken');
  // A standalone goal is treated exactly like a layout one — placement decides rendering, not counting.
  assert.equal(goals[2].metric, 'likes');
  assert.equal(goals[2].baseline, 0);
});

test('trasig state ger tom lista i stället för att kasta', { timeout: 5000 }, () => {
  for (const state of [null, {}, { widgets: null }, { widgets: 'nope' }]) {
    assert.deepEqual(M.goalWidgetsIn(state), []);
  }
});

// ---- target-default per widgettyp ----------------------------------------------------------------
// A Heart Goal and a Social Goal are different products with different scales: 1000 followers is a
// session's work, 50 hearts is a few minutes. One shared fallback would make every Heart Goal that
// lost its target look fifty times harder than it is.
const TARGET_DEFAULTS = [
  { type: 'templateSocialGoal', fallback: 1000 },
  { type: 'templateHeartGoal', fallback: 50 }
];

for (const { type, fallback } of TARGET_DEFAULTS) {
  test(`${type}: ogiltigt target faller tillbaka på ${fallback}`, { timeout: 5000 }, () => {
    const field = type === 'templateHeartGoal' ? 'heartTarget' : 'goalTarget';
    for (const bad of [0, -5, undefined, null, '', NaN, 'abc', Infinity, {}]) {
      assert.equal(M.targetForWidget({ type, [field]: bad }), fallback,
        `target ${JSON.stringify(bad)} gav inte typens egen default`);
    }
  });

  test(`${type}: giltigt target behålls`, { timeout: 5000 }, () => {
    const field = type === 'templateHeartGoal' ? 'heartTarget' : 'goalTarget';
    assert.equal(M.targetForWidget({ type, [field]: 7 }), 7);
    assert.equal(M.targetForWidget({ type, [field]: '250' }), 250, 'sparad sträng räknas som tal');
  });
}

test('en ny widget startar på baseline 0, en befintlig behåller sitt kundvärde', { timeout: 5000 }, () => {
  // The distinction the whole default change rests on: a widget the factory just made carries 0, and
  // a widget saved before this release carries whatever the streamer had typed. Backfill must never
  // flatten the second case to the first.
  assert.equal(M.baselineForWidget({ type: 'templateSocialGoal', goalCurrent: 0 }), 0);
  assert.equal(M.baselineForWidget({ type: 'templateHeartGoal', heartCurrent: 0 }), 0);
  assert.equal(M.baselineForWidget({ type: 'templateSocialGoal', goalCurrent: 658 }), 658,
    'befintligt kundvärde tappades');
  assert.equal(M.baselineForWidget({ type: 'templateHeartGoal', heartCurrent: 43 }), 43,
    'befintligt kundvärde tappades');
});
