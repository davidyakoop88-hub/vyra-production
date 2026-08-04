'use strict';
// A4: en Actions-regel som pekar på Fan Level Up triggar Gifter Level Up.
//
// runWidget() i action-runtime.js dirigerar på delsträng, och kedjan testar `level` före allt
// annat. Både 'Fan Level Up' och 'Gifter Level Up' innehåller 'level', så fan-grenen nås aldrig —
// streamern ser fel widget spela och har ingen ledtråd om varför. Namnen kommer från
// liveLayerName() i media.js (templateFanLevel -> 'Fan Level Up', templateGifterLevel ->
// 'Gifter Level Up'), så det är exakt de strängarna som når hit.
//
// RÖTT NU: 'Fan Level Up' landar i triggerGifterLevelUp.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'action-runtime.js'), 'utf8');

function makeRuntime() {
  const calls = [];
  const record = name => (payload) => { calls.push({ name, payload }); return true };

  const listeners = {};
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Map, Set, Boolean, Error, Promise, CSS: { escape: String },
    // Routingen sker synkront inne i executeNow, före varje timer. En no-op-timer håller testet
    // deterministiskt och hindrar den 6-sekunders kövänteklockan från att hålla processen vid liv.
    setTimeout: () => 0,
    clearTimeout: () => {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: () => Promise.resolve(),
    document: {
      addEventListener: (name, fn) => { (listeners[name] = listeners[name] || []).push(fn) },
      dispatchEvent: () => true,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    addEventListener: () => {},
    CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init) } },
    VYRA_OVERLAY_SCENE: 1,
    triggerGiftFireworks: record('fireworks'),
    triggerNewFollower: record('follower'),
    triggerLikeFountainPop: record('likefountain'),
    triggerBattleMvp: record('battlemvp'),
    triggerGifterLevelUp: record('gifter'),
    triggerFanLevelUp: record('fan'),
    triggerGloveSnipe: record('glove'),
    toast: () => {}
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: 'action-runtime.js' });

  let runId = 0;
  const fire = widget => {
    runId += 1;
    sandbox.VyraActionRuntime.execute({
      runId: 'r' + runId,
      action: { types: ['overlay'], duration: 1, scene: { number: 1 }, config: { widget } },
      payload: { username: 'wpwer17', combo: 3 }
    });
  };
  return { calls, fire, sandbox };
}

test('Fan Level Up triggar fan-widgeten, inte gifter-widgeten', () => {
  const rt = makeRuntime();
  rt.fire('Fan Level Up');
  assert.deepEqual(rt.calls.map(c => c.name), ['fan'],
    'en regel som pekar på Fan Level Up nådde fel widget');
});

test('Gifter Level Up triggar fortfarande gifter-widgeten', () => {
  const rt = makeRuntime();
  rt.fire('Gifter Level Up');
  assert.deepEqual(rt.calls.map(c => c.name), ['gifter'],
    'gifter-vägen fick inte gå sönder av fan-fixen');
});

test('namnen matchas skiftlägesokänsligt', () => {
  const upper = makeRuntime(); upper.fire('FAN LEVEL UP');
  const lower = makeRuntime(); lower.fire('fan level up');
  assert.deepEqual(upper.calls.map(c => c.name), ['fan']);
  assert.deepEqual(lower.calls.map(c => c.name), ['fan']);
});

test('nyttolasten går vidare oförändrad till fan-widgeten', () => {
  const rt = makeRuntime();
  rt.fire('Fan Level Up');
  assert.equal(rt.calls[0].name, 'fan', 'annars läser vi nyttolasten ur fel anrop');
  assert.equal(rt.calls[0].payload.username, 'wpwer17');
});

// De övriga grenarna i samma kedja får inte rubbas av att en ny gren läggs före dem.
test('övriga widgetnamn dirigeras som förut', () => {
  const cases = [
    ['Gift Fireworks', 'fireworks'],
    ['New Follower Alert', 'follower'],
    ['Top Likes', 'likefountain'],
    ['Battle MVP', 'battlemvp']
  ];
  for (const [widget, expected] of cases) {
    const rt = makeRuntime();
    rt.fire(widget);
    assert.deepEqual(rt.calls.map(c => c.name), [expected], `${widget} dirigerades fel`);
  }
});

test('ett namn utan egen gren faller igenom till den generiska uppslagningen', () => {
  const rt = makeRuntime();
  rt.fire('Gift Campaign');
  assert.deepEqual(rt.calls, [],
    'Gift Campaign har ingen egen trigger och ska inte fångas av någon namngren');
});
