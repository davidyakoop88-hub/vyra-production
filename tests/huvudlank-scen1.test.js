'use strict';
// HUVUDLÄNKEN SPELAR SCEN 1 (David 2026-10-29: "vi skickar giften i live men ljudet aktivera inte").
//
// Overlaylänken i TikTok Studio var `studio.html?overlay=1&access=…` — utan `scene`. Då sattes aldrig
// VYRA_OVERLAY_SCENE, och allowed() i action-runtime.js sa nej till varje action: gåvan kom fram,
// Sound Alerten matchade, och ingenting spelades. Uppmätt mot riktiga overlayn 2026-10-29: med
// `&scene=1` spelade DJ Airhorn, utan den ingenting.
//
// Provet kör hela kedjan i jsdom — handleEvent → runAction → vyra:action → action-runtime — med samma
// filer och samma rigg som gavoljud-matchning.test.js. Tre lägen:
//   * huvudlänken spelar scen 1:s action,
//   * en enskild widgets länk (`&widget=`) spelar inga actions, som förut,
//   * är scen 1:s egen länk öppen bredvid (färskt hjärtslag) lämnar huvudlänken scen 1 åt den.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const living = [];
test.after(() => { while (living.length) living.pop().window.close(); });

const action = { id: 'a1', name: 'Ljud', types: ['overlay'], duration: 6, config: { widget: 'Gift Fireworks' }, scene: { number: 1 } };
const handelse = { id: 'e1', trigger: 'gift', condition: 'Eye for an Eye', giftId: '1374221', actionId: 'a1', enabled: true };
const gava = { username: 'lisa', gift: 'Eye for an Eye', value: 'Eye for an Eye', giftId: '1374221' };

function overlay(sok, { scen1Lever = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="title"></div><div id="view"><div class="ae-steps"></div></div></body></html>',
    { url: 'https://vyralive.app/studio.html' + sok, runScripts: 'dangerously' });
  living.push(dom);
  const { window } = dom;
  window.navigator.locks = undefined;
  window.localStorage.setItem('vyra-action-event-v2', JSON.stringify({ actions: [action], events: [handelse] }));
  if (scen1Lever) window.localStorage.setItem('vyra-scene-heartbeat-1', String(Date.now()));
  for (const f of ['session-state.js', 'action-runtime.js', 'action-event.js', 'action-event-advanced.js', 'action-scenes.js']) {
    const s = window.document.createElement('script'); s.textContent = las(f); window.document.body.append(s);
  }
  window.__traffar = [];
  window.triggerGiftFireworks = p => { window.__traffar.push(p || {}); return true; };
  return window;
}
const vanta = ms => new Promise(r => setTimeout(r, ms));

test('huvudlänken utan scen spelar scen 1:s action när gåvan kommer', async () => {
  const w = overlay('?overlay=1&access=TOK123');
  assert.equal(w.VYRA_OVERLAY_SCENE, 1);
  w.VyraActionEvent.handleEvent('gift', gava);
  await vanta(50);
  assert.equal(w.__traffar.length, 1, 'huvudlänken körde inte scen 1:s action');
});

test('en enskild widgets länk kör inga actions, som förut', async () => {
  const w = overlay('?overlay=1&access=TOK123&widget=w1');
  assert.ok(!w.VYRA_OVERLAY_SCENE);
  w.VyraActionEvent.handleEvent('gift', gava);
  await vanta(50);
  assert.equal(w.__traffar.length, 0);
});

test('är scen 1:s egen länk öppen lämnar huvudlänken scen 1 åt den — inget dubbelt ljud', async () => {
  const w = overlay('?overlay=1&access=TOK123', { scen1Lever: true });
  assert.ok(!w.VYRA_OVERLAY_SCENE);
  w.VyraActionEvent.handleEvent('gift', gava);
  await vanta(50);
  assert.equal(w.__traffar.length, 0, 'huvudlänken spelade bredvid en öppen scen 1-länk');
  // Hjärtslaget slutar när scen 1-länken stängs: då tar huvudlänken över utan omladdning.
  w.localStorage.setItem('vyra-scene-heartbeat-1', String(Date.now() - 10000));
  assert.equal(w.VYRA_OVERLAY_SCENE, 1);
});

test('huvudlänken skickar inget eget hjärtslag — det är så den skiljs från scen 1:s länk', () => {
  const w = overlay('?overlay=1&access=TOK123');
  assert.equal(w.localStorage.getItem('vyra-scene-heartbeat-1'), null);
});

test('en scenlänk med scen 2 är oförändrad', () => {
  const w = overlay('?overlay=1&access=TOK123&scene=2');
  assert.equal(w.VYRA_OVERLAY_SCENE, 2);
  assert.ok(w.localStorage.getItem('vyra-scene-heartbeat-2'));
});
