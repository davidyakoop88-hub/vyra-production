'use strict';
// Source-shape checks, and only the three the plan allows them for: script order, that the hooks are
// actually wired, and that the premium file delegates. Everything about behaviour is proved by
// running the code in goal-client.test.js and goal-dom.test.js.
//
// RED BY CONSTRUCTION: goal-client.js is not loaded by studio.html, nothing wires the runtime, and
// premium-final.js still keeps its own counter.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const code = file => read(file).split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n');

// ---- laddningsordning ------------------------------------------------------------------------------
test('studio.html laddar goal-client.js efter ägaren och före media.js', () => {
  const html = read('studio.html');
  const order = [...html.matchAll(/src="([^"?]+)/g)].map(m => m[1]);
  const at = name => order.indexOf(name);

  assert.notEqual(at('goal-client.js'), -1, 'goal-client.js laddas inte alls');
  assert.ok(at('session-state.js') < at('goal-client.js'),
    'runtimen laddas före sessionsägaren den frågar om läge');
  assert.ok(at('goal-client.js') < at('media.js'),
    'media.js definierar renderarna innan runtimen finns');
});

// ---- inkopplade hookar -----------------------------------------------------------------------------
test('overlay-access lämnar sin ström till runtimen i stället för att öppna en till', () => {
  const source = code('overlay-access.js');
  // Anropet får vara optional-chained: en overlay som kraschar för att ett script inte hunnit
  // laddas är en svart skärm för streamern, så överlämningen är avsiktligt defensiv.
  assert.match(source, /VyraGoals[?.]{1,2}attachSource/,
    'tokenströmmen lämnas inte över — runtimen skulle behöva öppna en andra prenumeration');
  assert.ok(!/new EventSource\([^)]*goals/.test(source),
    'overlay-access öppnar en egen målström');
});

test('Studio-runtimen startas av den committade projektionen, inte av polling', () => {
  const source = code('goal-client.js');
  assert.match(source, /vyra-cloud-overlay-ready|vyra-session-state/,
    'runtimen väntar inte på ett projektionsevent');
  assert.ok(!/setInterval/.test(source), 'runtimen pollar efter en workspace i stället för att lyssna');
});

test('runtimen river sig på vyra-session-ended', () => {
  const source = code('goal-client.js');
  assert.match(source, /vyra-session-ended/, 'runtimen kopplas inte till sessionens teardown');
});

// ---- premium ------------------------------------------------------------------------------------------
test('premium-final delegerar till runtimen och räknar inte själv', () => {
  const source = code('premium-final.js');
  const goalBranch = source.slice(source.indexOf("w.type==='templateSocialGoal'"));

  assert.ok(!/w\.goalCurrent\s*=/.test(goalBranch),
    'premiumknapparna skriver fortfarande en egen räknare i widgetobjektet');
  assert.ok(!/#pfGoalPlus[\s\S]{0,200}save\(\)/.test(goalBranch),
    '+1-knappen sparar live progress');
  assert.match(source, /VyraGoals\??\./,
    'premium-final anropar aldrig den publika runtimen');
});

test('premiumrenderaren läser samma runtimevärde som media.js', () => {
  const source = code('premium-final.js');
  const renderer = source.slice(source.indexOf('socialGoalHtml=function'));
  assert.match(renderer.slice(0, 400), /VyraGoals|goalValueFor/,
    'premiumrenderaren läser bara w.goalCurrent och visar därmed sparad data live');
});

// ---- inga nya sinkar -----------------------------------------------------------------------------------
test('patchvägen i media.js innehåller ingen innerHTML', () => {
  const source = code('media.js');
  const patcher = source.slice(source.indexOf('function patchGoalDom'));
  assert.notEqual(patcher, '', 'patchGoalDom finns inte i media.js');
  const body = patcher.slice(0, patcher.indexOf('\nfunction ', 1));
  assert.ok(!/innerHTML/.test(body), 'patchen skriver innerHTML');
  assert.ok(!/\brender\(\)|\bsave\(\)/.test(body), 'patchen renderar eller sparar');
  assert.match(body, /\.canvas /, 'patchen söker utanför den live canvasen');
  assert.match(body, /dataset\.id\s*===/, 'patchen jämför inte widget-id exakt');
});
