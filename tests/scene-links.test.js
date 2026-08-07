'use strict';
// Scenkedjan hela vägen ut i OBS: länk → vidarekoppling → data.
//
// Symptomet David såg var att en scenlänk klistrad i OBS visar framsidans inloggning. Orsaken är
// inte scenmekaniken utan tre led som var för sig ser rimliga ut i källkoden:
//
//   1. action-scenes.js byggde länken ur `location` och bar därför ingen access-token. I David
//      egen inloggade webbläsare fungerar en sådan länk — felet finns bara där den används.
//   2. overlay.html förde bara vidare `access` och `widget`, så `scene` föll bort i redirecten och
//      VYRA_OVERLAY_SCENE sattes aldrig. allowed() i action-runtime.js säger då nej till varje action.
//   3. Tokenläget projicerar extras i MINNET (session-state.js swapExtras), men actionläsarna gick
//      direkt på localStorage — tom i en ren browser source. Actionlistan blev alltså tom.
//
// RÖTT NU: alla tre.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const TOKEN_URL = 'https://vyralive.app/overlay.html?access=TOK123';

// Fönstren har levande setInterval (heartbeat + statusuppdatering). Utan close() avslutas
// node --test aldrig, samma fälla som dom-harness.js dokumenterar.
const living = [];
test.after(() => { while (living.length) living.pop().window.close() });

function studio({ tokenUrl = null, url = 'https://vyralive.app/studio.html' } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="title"></div><div id="view"><div class="ae-steps"></div></div>
  </body></html>`, { url, pretendToBeVisual: false, runScripts: 'dangerously' });
  living.push(dom);
  const { window } = dom;
  window.navigator.locks = undefined;
  if (tokenUrl) window.sessionStorage.setItem('vyra-overlay-access-url', tokenUrl);
  const load = file => {
    const script = window.document.createElement('script');
    script.textContent = read(file);
    window.document.body.append(script);
  };
  return { window, load };
}

// ---- 1. Länken bär token ---------------------------------------------------------------------

test('scenlänken byggs ur overlayns access-token, inte ur location', () => {
  const { window, load } = studio({ tokenUrl: TOKEN_URL });
  load('action-scenes.js');
  window.VyraActionsExtras.forEach(fn => fn());

  // input[readonly] specifikt: artikelns forsta <input> ar Max ko-faltet.
  const value = window.document.querySelector('[data-scene-link="3"] input[readonly]')?.value;
  assert.ok(value, 'ingen scenlänk renderades trots att en token fanns');
  const url = new URL(value);
  assert.equal(url.pathname, '/overlay.html', 'länken pekar inte på overlay.html');
  assert.equal(url.searchParams.get('access'), 'TOK123', 'länken bär ingen access-token');
  assert.equal(url.searchParams.get('scene'), '3', 'scennumret följde inte med');
});

test('utan token renderas ingen länk alls — inte en trasig', () => {
  const { window, load } = studio();
  load('action-scenes.js');
  window.VyraActionsExtras.forEach(fn => fn());

  const panel = window.document.querySelector('.ae-scene-links');
  assert.ok(panel, 'scenpanelen renderades inte');
  assert.equal(panel.querySelector('input[readonly]'), null,
    'en länk utan token renderades — det är precis den som ger inloggningssidan i OBS');
  assert.match(panel.textContent, /säker|OBS-länk/i,
    'panelen säger inte vad streamern ska göra i stället');
});

test('panelen får sina länkar när token skapas medan sidan är öppen', () => {
  const { window, load } = studio();
  load('action-scenes.js');
  window.VyraActionsExtras.forEach(fn => fn());
  assert.equal(window.document.querySelector('[data-scene-link="1"] input[readonly]'), null);

  window.sessionStorage.setItem('vyra-overlay-access-url', TOKEN_URL);
  window.dispatchEvent(new window.CustomEvent('vyra-overlay-access-created'));

  assert.match(window.document.querySelector('[data-scene-link="1"] input[readonly]')?.value || '',
    /access=TOK123&scene=1/, 'panelen låg kvar i tomläget efter att länken skapats');
});

// ---- 2. overlay.html för vidare scene ---------------------------------------------------------

test('overlay.html för vidare scene i redirecten', () => {
  const html = read('overlay.html');
  const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  let replaced = null;
  vm.runInNewContext(source, {
    URLSearchParams,
    location: { search: '?access=TOK123&widget=w1&scene=4', replace: value => { replaced = value } }
  });
  assert.ok(replaced, 'overlay.html gjorde ingen redirect');
  const params = new URLSearchParams(replaced.split('?')[1]);
  assert.equal(params.get('access'), 'TOK123');
  assert.equal(params.get('widget'), 'w1');
  assert.equal(params.get('scene'), '4', 'scene föll bort i redirecten');
});

// ---- 3. Actionlistan finns i tokenläget -------------------------------------------------------

const ACTIONS = { actions: [{ id: 'a1', name: 'Konfetti', types: ['overlay'], scene: { number: 2 } }], events: [] };

test('actionläsaren hittar listan när den bara finns i tokenlägets minne', async () => {
  const { window, load } = studio({ url: 'https://vyralive.app/studio.html?overlay=1&access=TOK123&scene=2' });
  load('session-state.js');
  load('action-event.js');
  await window.VyraSessionState.projectReadonlyOverlay({
    state: { widgets: [] },
    extras: { 'vyra-action-event-v2': JSON.stringify(ACTIONS) }
  });

  assert.equal(window.localStorage.getItem('vyra-action-event-v2'), null,
    'förutsättningen brast: tokenläget ska inte skriva någon nyckel');
  assert.equal(window.VyraActionEvent.read().actions.length, 1,
    'overlayn ser noll actions — ingen scen kan då spela något');
});

test('tokenläget läser länkens actions, aldrig den inloggade flikens', async () => {
  const { window, load } = studio({ url: 'https://vyralive.app/studio.html?overlay=1&access=TOK123&scene=2' });
  load('session-state.js');
  load('action-event.js');
  // En inloggad flik som öppnar någon annans scenlänk har sina EGNA actions i localStorage.
  window.localStorage.setItem('vyra-action-event-v2',
    JSON.stringify({ actions: [{ id: 'other', name: 'Fel konto', types: ['overlay'] }], events: [] }));
  await window.VyraSessionState.projectReadonlyOverlay({
    state: { widgets: [] },
    extras: { 'vyra-action-event-v2': JSON.stringify(ACTIONS) }
  });

  // join, inte deepEqual: arrayen kommer fran jsdom-realmen och har en annan Array.prototype.
  assert.equal(window.VyraActionEvent.read().actions.map(a => a.id).join(','), 'a1',
    'overlayn körde flikens egna actions i stället för länkens');
});

// ---- 4. Scenens köinställning når overlayn ----------------------------------------------------

test('vyra-scene-settings-v1 projiceras som en riktig extra-nyckel', () => {
  const lists = {
    'session-state.js': /const EXTRA_KEYS = \[[^\]]+\]/,
    'overlay-access.js': /const EXTRA_KEYS=\[[^\]]+\]/,
    'cloud-sync.js': /EXTRA=\[[^\]]+\]/,
    'state-backup.js': /EXTRA_KEYS=\[[^\]]+\]/
  };
  for (const [file, pattern] of Object.entries(lists)) {
    const match = read(file).match(pattern);
    assert.ok(match, `hittade ingen extra-nyckellista i ${file}`);
    assert.match(match[0], /vyra-scene-settings-v1/,
      `${file} projicerar inte scenens köinställning — max kö kan då aldrig gälla i OBS`);
  }
});

test('köinställningen skrivs via session-state, inte direkt på localStorage', () => {
  const source = read('action-scenes.js').split('\n')
    .filter(line => !line.trim().startsWith('//')).join('\n');
  assert.equal(/localStorage\.setItem\(\s*SETTINGS_KEY/.test(source), false,
    'action-scenes.js skriver en skyddad nyckel förbi session-state.js');
});
