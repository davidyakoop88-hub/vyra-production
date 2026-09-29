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

test('bara använda scenlänkar bär token, eget scennummer och pekar på overlay.html', async () => {
  const w = studio({ tokenUrl: 'https://vyralive.app/overlay.html?access=TOK123', actions: [
    action({ id: 'a1', scene: { number: 2 } }), action({ id: 'a2', scene: { number: 4 } })
  ] });
  w.VyraActionsExtras.forEach(fn => fn());   // renderScenes körs när Actions-vyn öppnas
  await vanta(200);
  const lankar = Array.from(w.document.querySelectorAll('[data-scene-link] input[readonly]'), i => i.value);
  assert.equal(lankar.length, 2, 'bara använda skärmar ska visas');
  [2,4].forEach((scene, i) => {
    const l=lankar[i];
    assert.match(l, /\/overlay\.html/, `scen ${scene} pekar inte på overlay.html`);
    assert.match(l, /access=TOK123/, `scen ${scene} bär ingen token — länken visar inloggningen i OBS`);
    assert.match(l, new RegExp(`scene=${scene}(&|$)`), `scen ${scene} bär fel scennummer`);
  });
  assert.equal(new Set(lankar).size, 2, 'två använda scener delar länk');
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

// DEN MANUELLA KNAPPEN, hela vägen (#365-arbetet, 2026-09-15).
//
// tests/actions-triggrar.test.js bevisar att ett knapp-event ger TRIGGERN 'knapp'. Det är inte
// samma sak som att en Action körs — mellan dem ligger regelmatchningen, scengrinden och
// executeNow. Precis den fogen var otestad för gåvor fram till den här filen skrevs, och den ska
// inte vara otestad för knappen heller.
//
// NYCKELN LIGGER I `value`. liveEventTriggers packar upp eventKey dit, och Event-regeln matchar
// mot triggerValue precis som en gåva matchar på gåvonamn. Det är därför en knapp kan skiljas
// från en annan utan att något nytt matchningsbegrepp behövde införas.
const knapphandelse = (over = {}) => handelse({ id: 'e-knapp', name: 'Knapp scen-1 ger fyrverkeri',
  trigger: 'knapp', triggerValue: 'scen-1', ...over });

test('en manuell knapp kör sin Action — hela vägen till spelad widget', async () => {
  const w = studio({ events: [knapphandelse()] });
  w.VyraActionEvent.handleEvent('knapp', { value: 'scen-1', username: '' });
  await vanta(250);
  assert.equal(w.__traffar.length, 1,
    'knappen matchade regeln men ingenting spelade — kedjan är bruten mellan triggern och Actionen');
});

test('en knapp med FEL nyckel spelar ingenting', async () => {
  // Utan den här vakten kunde varje knapp köra varje Action, och nycklarna vore dekoration.
  const w = studio({ events: [knapphandelse()] });
  w.VyraActionEvent.handleEvent('knapp', { value: 'scen-2' });
  await vanta(250);
  assert.equal(w.__traffar.length, 0, 'fel nyckel spelade ändå — knapparna går då inte att skilja åt');
});

test('en knapp spelar inte i en annan scen, och inte alls i studion', async () => {
  // Samma två grindar som gäller gåvor. Knappen får inga undantag: scenen på Actionen avgör,
  // och i studion (VYRA_OVERLAY_SCENE odefinierad) spelas ingenting alls.
  const annanScen = studio({ scen: 2, events: [knapphandelse()] });
  annanScen.VyraActionEvent.handleEvent('knapp', { value: 'scen-1' });
  const iStudion = studio({ scen: null, events: [knapphandelse()] });
  iStudion.VyraActionEvent.handleEvent('knapp', { value: 'scen-1' });
  await vanta(250);
  assert.equal(annanScen.__traffar.length, 0, 'knappen spelade i fel scen');
  assert.equal(iStudion.__traffar.length, 0, 'knappen spelade i studion — actions hör hemma i OBS-utgången');
});

test('ett pausat knapp-Event triggar inte', async () => {
  const w = studio({ events: [knapphandelse({ enabled: false })] });
  w.VyraActionEvent.handleEvent('knapp', { value: 'scen-1' });
  await vanta(250);
  assert.equal(w.__traffar.length, 0, 'pausat Event körde ändå');
});

// HELA BÅGEN I ETT FÖNSTER — från rått event till spelad widget.
//
// Proven ovan anropar handleEvent() DIREKT och hoppar därmed över live-client.js. De bevisar
// alltså Action & Event-halvan. tests/actions-triggrar.test.js bevisar den andra halvan: att ett
// knapp-event blir triggern 'knapp'. Ingen av dem bevisar FOGEN.
//
// Det är precis mönstret #354 finns för: "varje sida är provad mot sitt eget antagande och fogen
// är oprovad. Båda sviterna gröna. Buggen syns först i en sändning." Och det var verkligt här —
// under bygget visade sig klienten släppa knapp-eventet på golvet medan servern tog emot det.
//
// Det här provet laddar live-client.js i SAMMA fönster som Action & Event och matar in eventet
// där en riktig poll hade lämnat det. Faller grenen i live-client.js bort faller provet.
test('hela kedjan: ett rått knapp-event spelar Actionen', async () => {
  const w = studio({ events: [knapphandelse()] });
  w.VyraAuth = { lastDetail: () => ({ workspaces: [{ id: 'ws-A' }] }) };
  for (const f of ['cloud-fields.js', 'live-client.js']) {
    const s = w.document.createElement('script');
    s.textContent = las(f);
    w.document.body.append(s);
  }
  assert.equal(typeof w.VyraLive, 'object', 'live-client laddades inte — provet mäter då ingenting');

  // Formen är exakt den local-server.js lämnar ifrån sig: typen och eventKey, inget username.
  w.VyraLive.ingest({ type: 'knapp', eventKey: 'scen-1' });
  await vanta(400);

  assert.equal(w.__traffar.length, 1,
    'det råa eventet nådde aldrig fram till Actionen — fogen mellan live-client.js och '
    + 'Action & Event är bruten, och det syns inte i någon av halvornas egna prov');
});
