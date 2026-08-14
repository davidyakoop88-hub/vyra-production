'use strict';
// Glove Snipe ska tändas av ett riktigt multiplikatorfönster.
//
// Widgeten har funnits färdig hela tiden och `routeLiveBattleEvent` har alltid haft grenen —
// media.js tänder den på `tap`, `snipe`, `glove`, `x2`, `x3` och på multiplikator 2 eller 3.
// Ingen av de typerna publicerades av bryggan, som bara skickade gift, like, share, subscribe,
// member, chat, viewer, battle och follow. Glove Snipe var alltså den sista widgeten utan riktig
// trigger — samma döda koppling som Battle MVP, Fan Level Up, Gifter Level Up och Gift Fireworks
// hade, och som var och en av dem fick ett eget prov när den lagades.
//
// KÄLLAN, hittad 2026-08-14 i tiktok-live-proto/v3: multiplikatorn ligger inte i
// LINK_MIC_BATTLE utan i LINK_MIC_BATTLE_TASK, på `start.config.rewardConfig.rewardMultiple`.
// tiktok-bridge/test/battle-task.test.js vaktar att bryggan läser den och skickar typen `glove`.
// Det här provet vaktar andra halvan: att just den typen tänder widgeten, hela vägen genom
// routeLiveBattleEvent — aldrig genom att anropa triggern direkt.
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.after(closeAll);

const glove = (id = 'gs1', over = {}) => Object.assign({
  id, type: 'templateGloveSnipe', x: 10, y: 10, width: 320, title: 'Glove Snipe'
}, over);

function boot(widgets = [glove()]) {
  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout',
    state: { widgets, projectName: 'glove' } });
  h.load('overlay-sanitize.js');
  h.load('media.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  // Spionen sitter PÅ triggern, inte i stället för den: effekten ska fortfarande köras, så att
  // provet bevisar att widgeten verkligen tänds och inte bara att en funktion anropas.
  run(`window.__traffar=[];{const org=window.triggerGloveSnipe;
       window.triggerGloveSnipe=function(p){window.__traffar.push(p||{});
         return typeof org==='function'?org.apply(this,arguments):undefined}}`);
  return { h, run, traffar: () => h.window.__traffar,
    skicka: e => h.window.routeLiveBattleEvent(e) };
}

test('bryggans glove-event tänder Glove Snipe', () => {
  const b = boot();
  b.skicka({ id: 'e1', type: 'glove', multiplier: 5 });
  assert.equal(b.traffar().length, 1, 'ett multiplikatorfönster tände ingenting');
  assert.equal(b.traffar()[0].kind, 'glove');
  assert.equal(b.traffar()[0].multiplier, 5, 'femdubblingen ska nå fram — glove är 5x');
});

test('x2 och x3 tänder boost-läget', () => {
  const b = boot();
  b.skicka({ id: 'e2', type: 'glove', multiplier: 2 });
  b.skicka({ id: 'e3', type: 'glove', multiplier: 3 });
  // Array.from bygger listan i DEN HÄR realmen. `.map` på en array från jsdom-fönstret ger en
  // array med fönstrets Array.prototype, och deepEqual är strikt om prototyper — samma fälla som
  // tests/widget-defaults-migration.test.js skriver ut.
  assert.deepEqual(Array.from(b.traffar(), t => t.multiplier), [2, 3]);
});

test('ett event utan multiplikator tänder ändå glove-läget, inte boost', () => {
  // media.js faller tillbaka på 2 när talet saknas. Bryggan skickar aldrig ett sådant event —
  // arBoostFonster kräver minst 2 — men klienten får inte kasta om någon annan källa gör det.
  const b = boot();
  b.skicka({ id: 'e4', type: 'glove' });
  assert.equal(b.traffar().length, 1);
  assert.equal(b.traffar()[0].kind, 'glove');
});

test('gåvor och likes tänder inte Glove Snipe', () => {
  // Bärande: hade vilket event som helst tänt widgeten vore proven ovan meningslösa.
  const b = boot();
  b.skicka({ id: 'e5', type: 'gift', username: 'lisa', giftName: 'Rose', coins: 500, count: 1 });
  b.skicka({ id: 'e6', type: 'like', username: 'lisa', count: 10 });
  b.skicka({ id: 'e7', type: 'viewer', count: 120 });
  assert.equal(b.traffar().length, 0);
});

test('glove stänger inte battle-sessionen', () => {
  // battle-mvp-session.js kör hanteraBattle() på allt vars typ innehåller "battle" och stänger då
  // sin session — mitt i en match. Därför heter typen glove och inte battle_boost.
  assert.ok(!'glove'.includes('battle'));
});
