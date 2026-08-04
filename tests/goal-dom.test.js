'use strict';
// The live patch, in a real DOM, through the real renderers.
//
// A live frame may not call render(): rebuilding #view restarts Top Gift and Top Streak animations,
// and at the ingest ceiling that is a hundred full rebuilds a second. So the renderers mark the few
// elements that carry a number, and the patcher writes textContent and style on exactly those.
//
// No innerHTML in the patch path. Social Goal's two numbers therefore need elements of their own —
// <b>, not <span>, because studio.css:163 has `.goal-4 .goal-track strong span{display:block}` and a
// span would inherit a rule meant for the separator.
//
// RED BY CONSTRUCTION: the data-* attributes and the patcher do not exist yet.
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll, socialGoal, heartGoal } = require('./helpers/dom-harness.js');

// Varje jsdom-fonster rivs nar filen ar klar; annars haller media.js timers processen vid liv.
test.after(closeAll);

const frame = (widgetId, over = {}) => ({ overlayId: 'ov-1', widgetId, metric: 'follows',
  value: 250, target: 1000, epoch: 1, at: 1, revision: '7', ...over });

test('jsdom laddar de riktiga filerna och renderar en målwidget', () => {
  const dom = createDom();
  const canvas = dom.paint([socialGoal('w-1')]);
  const widget = canvas.querySelector('[data-id="w-1"]');
  assert.ok(widget, 'renderaren producerade ingen widget i canvasen');
  assert.ok(widget.className.includes('social-goal'));
});

// ---- märkningen ---------------------------------------------------------------------------------
test('social goal märker värde, target, fyllnad och procent', () => {
  const dom = createDom();
  const canvas = dom.paint([socialGoal('w-1', { goalCurrent: 250 })]);
  const widget = canvas.querySelector('[data-id="w-1"]');

  assert.equal(widget.dataset.goal, 'social', 'roten saknar data-goal');
  assert.ok(widget.querySelector('[data-goal-value]'), 'värdet har inget eget element');
  assert.ok(widget.querySelector('[data-goal-target]'), 'målet har inget eget element');
  assert.ok(widget.querySelector('[data-goal-fill]'), 'stapeln är inte märkt');
  assert.ok(widget.querySelector('[data-goal-pct]'), 'procenttexten är inte märkt');
  // Separatorn ska förbli det enda span:et inuti strong — CSS-regeln för goal-4 träffar den.
  const strong = widget.querySelector('.goal-track strong');
  assert.equal(strong.querySelectorAll('span').length, 1,
    'talen lades i span och ärver .goal-4 .goal-track strong span{display:block}');
  assert.equal(strong.querySelector('[data-goal-value]').tagName, 'B');
});

test('heart goal märker sina egna element utan strukturändring', () => {
  const dom = createDom();
  const canvas = dom.paint([heartGoal('h-1')]);
  const widget = canvas.querySelector('[data-id="h-1"]');
  assert.equal(widget.dataset.goal, 'heart');
  assert.equal(widget.querySelector('[data-goal-value]').tagName, 'B');
  assert.equal(widget.querySelector('[data-goal-target]').tagName, 'STRONG');
  assert.equal(widget.querySelectorAll('[data-goal-clip]').length, 2,
    'båda clip-path-bärarna är inte märkta');
});

// ---- patchen ------------------------------------------------------------------------------------
test('en frame uppdaterar siffra, target, bar och procent — inget annat', () => {
  const dom = createDom();
  const canvas = dom.paint([socialGoal('w-1')]);
  const widget = canvas.querySelector('[data-id="w-1"]');
  const before = widget.outerHTML;

  dom.window.VyraGoalDom.patch('w-1', frame('w-1', { value: 250, target: 1000 }));

  assert.equal(widget.querySelector('[data-goal-value]').textContent.replace(/\s/g, ''), '250');
  assert.equal(widget.querySelector('[data-goal-target]').textContent.replace(/\s/g, ''), '1000');
  assert.equal(widget.querySelector('[data-goal-fill]').style.width, '25%');
  assert.match(widget.querySelector('[data-goal-pct]').textContent, /25/);
  assert.equal(widget.style.getPropertyValue('--goal-pct').trim(), '25');
  assert.notEqual(widget.outerHTML, before, 'inget ändrades alls');
});

test('heart goal får ny clip-path och nya tal', () => {
  const dom = createDom();
  const canvas = dom.paint([heartGoal('h-1')]);
  const widget = canvas.querySelector('[data-id="h-1"]');

  dom.window.VyraGoalDom.patch('h-1', frame('h-1', { value: 25, target: 50 }));

  assert.equal(widget.querySelector('[data-goal-value]').textContent.replace(/\s/g, ''), '25');
  for (const node of widget.querySelectorAll('[data-goal-clip]')) {
    assert.match(node.style.clipPath, /inset\(50%/, 'clip-path följde inte procenten');
  }
});

test('patchen använder ingen innerHTML', () => {
  const dom = createDom();
  const canvas = dom.paint([socialGoal('w-1')]);
  const widget = canvas.querySelector('[data-id="w-1"]');
  const strong = widget.querySelector('.goal-track strong');
  const valueNode = widget.querySelector('[data-goal-value]');

  dom.window.VyraGoalDom.patch('w-1', frame('w-1', { value: 42 }));

  assert.equal(widget.querySelector('[data-goal-value]'), valueNode,
    'elementet byttes ut — patchen skrev innerHTML i stället för textContent');
  assert.equal(widget.querySelector('.goal-track strong'), strong);
});

// ---- avgränsning ---------------------------------------------------------------------------------
test('exakt id-matchning: ingen selektorinterpolering', () => {
  const dom = createDom();
  const canvas = dom.paint([socialGoal('w-1'), socialGoal('w-10')]);
  dom.window.VyraGoalDom.patch('w-1', frame('w-1', { value: 111 }));

  assert.equal(canvas.querySelector('[data-id="w-1"] [data-goal-value]').textContent.replace(/\s/g, ''), '111');
  assert.notEqual(canvas.querySelector('[data-id="w-10"] [data-goal-value]').textContent.replace(/\s/g, ''), '111',
    'en delsträngsmatchning träffade fel widget');
});

test('specialtecken i ett legacy-id kastar inte och träffar bara exakt id', () => {
  const dom = createDom();
  const nasty = 'w"]. #x [id]';
  const canvas = dom.paint([socialGoal(nasty), socialGoal('w-2')]);
  assert.doesNotThrow(() => dom.window.VyraGoalDom.patch(nasty, frame(nasty, { value: 77 })));
  assert.equal(canvas.querySelector('[data-id="w-2"] [data-goal-value]').textContent.replace(/\s/g, ''), '0',
    'patchen läckte till en annan widget');
});

test('previewkort utanför canvasen rörs aldrig', () => {
  const dom = createDom();
  dom.paint([socialGoal('w-1')]);
  const preview = dom.paintPreview(socialGoal('w-1'));
  const previewValue = preview.querySelector('[data-goal-value]');
  const before = previewValue.textContent;

  dom.window.VyraGoalDom.patch('w-1', frame('w-1', { value: 999 }));

  assert.equal(previewValue.textContent, before, 'ett previewkort patchades');
});

// ---- vad patchen aldrig får göra ------------------------------------------------------------------
test('en frame utlöser varken render, save eller localStorage', () => {
  const dom = createDom();
  dom.paint([socialGoal('w-1')]);
  let renders = 0, saves = 0, writes = 0;
  dom.window.render = () => { renders += 1 };
  dom.window.save = () => { saves += 1 };
  const realSet = dom.window.localStorage.setItem.bind(dom.window.localStorage);
  dom.window.localStorage.setItem = (...args) => { writes += 1; return realSet(...args) };

  for (let i = 0; i < 100; i++) {
    dom.window.VyraGoalDom.patch('w-1', frame('w-1', { value: i, revision: String(i) }));
  }

  assert.equal(renders, 0, 'en liveframe kallade render()');
  assert.equal(saves, 0, 'en liveframe kallade save()');
  assert.equal(writes, 0, 'en liveframe skrev till localStorage');
});

test('renderaren läser runtimens värde vid full render, med placeholder som fallback', () => {
  const dom = createDom();
  dom.window.VyraGoals = { read: id => (id === 'w-1' ? { value: 640, target: 800 } : null) };
  const canvas = dom.paint([socialGoal('w-1'), socialGoal('w-2', { goalCurrent: 5 })]);

  assert.equal(canvas.querySelector('[data-id="w-1"] [data-goal-value]').textContent.replace(/\s/g, ''), '640',
    'en full render tappade det live värdet');
  assert.equal(canvas.querySelector('[data-id="w-2"] [data-goal-value]').textContent.replace(/\s/g, ''), '5',
    'en widget utan runtimevärde tappade sitt sparade värde');
});
