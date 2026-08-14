'use strict';
// Hela Action & Event-kedjan, från regel till spelad widget.
//
// Varje del av kedjan hade prov innan den här filen: action-widget-routing täcker namnmatchningen,
// scene-links täcker länkbygget, event-gifts täcker gåvobilderna. Ingen gick hela vägen —
// Action skapas, Event pekar på den, ett riktigt event kommer in, widgeten spelar. Det är den
// vägen streamern faktiskt använder, och den var otestad.
//
// TRE SAKER SOM ÄR LÄTTA ATT TRO FEL OM, och som därför står utskrivna här:
//
//   1. `action.types` är en LISTA. executeNow läser `types`, aldrig `type`. En action byggd med
//      `type: 'overlay'` kör ingenting alls, tyst.
//   2. `allowed()` kräver `window.VYRA_OVERLAY_SCENE`. I studion är den odefinierad, så INGEN
//      action körs där — det är avsiktligt, actions spelas i OBS-utgången.
//   3. Av/på sitter på EVENTET, inte på actionen. Actions har inget `enabled`-fält; samma action
//      återanvänds av flera events, så pausen hör hemma på regeln.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const KEY = 'vyra-action-event-v2';

// Fönstren har levande setInterval (scenernas hjärtslag). Utan close() avslutas node --test aldrig.
const living = [];
test.after(() => { while (living.length) living.pop().window.close() });

const vanta = ms => new Promise(r => setTimeout(r, ms));

const action = (over = {}) => ({ id: 'a1', name: 'Fyrverkeri', types: ['overlay'], duration: 6,
  config: { widget: 'Gift Fireworks' }, scene: { number: 1 }, ...over });
const handelse = (over = {}) => ({ id: 'e1', name: 'Rose ger fyrverkeri', trigger: 'gift',
  triggerValue: 'Rose', actionId: 'a1', enabled: true, ...over });

function studio({ url = 'https://vyralive.app/studio.html', scen = 1, tokenUrl = null,
                  actions = [action()], events = [handelse()] } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="title"></div>' +
    '<div id="view"><div class="ae-steps"></div></div></body></html>',
    { url, pretendToBeVisual: false, runScripts: 'dangerously' });
  living.push(dom);
  const { window } = dom;
  window.navigator.locks = undefined;
  if (tokenUrl) window.sessionStorage.setItem('vyra-overlay-access-url', tokenUrl);
  if (scen != null) window.VYRA_OVERLAY_SCENE = scen;
  window.localStorage.setItem(KEY, JSON.stringify({ actions, events }));
  for (const f of ['session-state.js', 'action-runtime.js', 'action-event.js',
                   'action-event-advanced.js', 'action-scenes.js']) {
    const s = window.document.createElement('script');
    s.textContent = las(f);
    window.document.body.append(s);
  }
  window.__traffar = [];
  window.triggerGiftFireworks = p => { window.__traffar.push(p || {}); return true };
  return window;
}

test('en gåva som matchar regeln spelar widgeten, med nyttolasten', async () => {
  const w = studio();
  w.VyraActionEvent.handleEvent('gift', { username: 'lisa', gift: 'Rose', value: 'Rose', coins: 500 });
  await vanta(250);
  assert.equal(w.__traffar.length, 1, 'regeln matchade men ingenting spelade');
  assert.equal(w.__traffar[0].username, 'lisa', 'nyttolasten nådde inte widgeten');
});

test('en gåva som inte matchar spelar ingenting', async () => {
  const w = studio();
  w.VyraActionEvent.handleEvent('gift', { username: 'kim', gift: 'Galaxy', value: 'Galaxy' });
  await vanta(250);
  assert.equal(w.__traffar.length, 0);
});

test('scengrinden: en action spelar bara i sin egen scen', async () => {
  const fel = studio({ scen: 2 });                    // overlayn visar scen 2, actionen hör till 1
  fel.VyraActionEvent.handleEvent('gift', { username: 'lisa', gift: 'Rose', value: 'Rose' });
  await vanta(250);
  assert.equal(fel.__traffar.length, 0, 'en action spelade i fel scen');

  const ratt = studio({ scen: 1 });
  ratt.VyraActionEvent.handleEvent('gift', { username: 'lisa', gift: 'Rose', value: 'Rose' });
  await vanta(250);
  assert.equal(ratt.__traffar.length, 1, 'samma action spelade inte i sin egen scen');
});

test('i studion spelas ingen action alls — de hör hemma i OBS-utgången', async () => {
  const w = studio({ scen: null });
  w.VyraActionEvent.handleEvent('gift', { username: 'lisa', gift: 'Rose', value: 'Rose' });
  await vanta(250);
  assert.equal(w.__traffar.length, 0);
});

test('pausat event triggar inte, aktivt bredvid det gör det', async () => {
  const w = studio({ events: [handelse(), handelse({ id: 'e2', enabled: false })] });
  w.VyraActionEvent.handleEvent('gift', { username: 'lisa', gift: 'Rose', value: 'Rose' });
  await vanta(250);
  assert.equal(w.__traffar.length, 1, 'det pausade eventet spelade också, eller det aktiva inte alls');
});

test('de tio scenlänkarna bär token, eget scennummer och pekar på overlay.html', async () => {
  const w = studio({ tokenUrl: 'https://vyralive.app/overlay.html?access=TOK123' });
  w.VyraActionsExtras.forEach(fn => fn());   // renderScenes körs när Actions-vyn öppnas
  await vanta(200);
  const lankar = Array.from(w.document.querySelectorAll('[data-scene-link] input[readonly]'), i => i.value);
  assert.equal(lankar.length, 10, 'alla tio scener fick inte en länk');
  lankar.forEach((l, i) => {
    assert.match(l, /\/overlay\.html/, `scen ${i + 1} pekar inte på overlay.html`);
    assert.match(l, /access=TOK123/, `scen ${i + 1} bär ingen token — länken visar inloggningen i OBS`);
    assert.match(l, new RegExp(`scene=${i + 1}(&|$)`), `scen ${i + 1} bär fel scennummer`);
  });
  assert.equal(new Set(lankar).size, 10, 'två scener delar länk');
});

test('en öppnad scenlänk sätter scenen och spelar rätt actions', async () => {
  // Så här ser det ut när OBS öppnar länken: overlay.html har redan gjort sin vidarekoppling.
  const w = studio({ url: 'https://vyralive.app/studio.html?overlay=1&access=TOK123&scene=4',
    scen: null, actions: [action({ scene: { number: 4 } })] });
  assert.equal(w.VYRA_OVERLAY_SCENE, 4, 'länken satte aldrig scenen');
  assert.equal(w.document.documentElement.dataset.overlayScene, '4');

  w.VyraActionEvent.handleEvent('gift', { username: 'lisa', gift: 'Rose', value: 'Rose' });
  await vanta(250);
  assert.equal(w.__traffar.length, 1, 'scen 4-actionen spelade inte via sin egen länk');

  assert.ok(w.localStorage.getItem('vyra-scene-heartbeat-4'),
    'scenen rapporterar sig inte online — panelens status hade stått Offline');
});

test('overlay.html för vidare både scene och access i vidarekopplingen', () => {
  // Faller den här är varje scenlänk trasig i OBS: utan scene sätts VYRA_OVERLAY_SCENE aldrig,
  // och då säger allowed() nej till varenda action.
  const redirect = las('overlay.html');
  assert.match(redirect, /scene/, 'scene faller bort i redirecten');
  assert.match(redirect, /access/, 'access faller bort i redirecten');
});
