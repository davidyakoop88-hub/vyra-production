'use strict';
// GÅVOLJUDET SPELAR ÄVEN NÄR NAMNET ÄR PÅ ETT ANNAT SPRÅK (David 2026-10-21: "sound på gift är inte aktiv").
//
// Ett gåvo-event jämförde bara NAMN. TikTok skickar gåvans namn på streamerns språk ("Ros"), men Sound
// Alerts väljare erbjöd manifestets engelska namn ("Rose") — ljudet kopplat till en viss gåva spelade
// aldrig. Gåvans id är detsamma på alla språk:
//   * ett event som sparat id:t (Sound Alerts gör det nu) träffar på id:t,
//   * ett äldre event med bara ett namn träffar när katalogen säger att namnet har samma id,
//   * en annan gåva med annat id träffar fortfarande inte, och namnmatchningen fungerar som förut.
// Riggen är action-event-kedjan.test.js: samma filer i jsdom, och en overlay-action som spelar.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const KEY = 'vyra-action-event-v2';
const living = [];
test.after(() => { while (living.length) living.pop().window.close(); });

const action = { id: 'a1', name: 'Ljud', types: ['overlay'], duration: 6, config: { widget: 'Gift Fireworks' }, scene: { number: 1 } };
const handelse = over => ({ id: 'e1', trigger: 'gift', condition: 'Rose', actionId: 'a1', enabled: true, ...over });

function studio(events, { moln = [] } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="title"></div><div id="view"><div class="ae-steps"></div></div></body></html>',
    { url: 'https://vyralive.app/studio.html', runScripts: 'dangerously' });
  living.push(dom);
  const { window } = dom;
  window.navigator.locks = undefined;
  window.VYRA_OVERLAY_SCENE = 1;
  window.localStorage.setItem(KEY, JSON.stringify({ actions: [action], events }));
  window.localStorage.setItem('vyra-gift-cloud-v1', JSON.stringify(moln));
  for (const f of ['session-state.js', 'action-runtime.js', 'action-event.js', 'action-event-advanced.js', 'action-scenes.js']) {
    const s = window.document.createElement('script'); s.textContent = las(f); window.document.body.append(s);
  }
  window.__traffar = [];
  window.triggerGiftFireworks = p => { window.__traffar.push(p || {}); return true; };
  return window;
}
const vanta = ms => new Promise(r => setTimeout(r, ms));
const ros = { username: 'lisa', gift: 'Ros', value: 'Ros', giftId: '5655' };

test('event med sparat id: en svensk "Ros" med samma id spelar', async () => {
  const w = studio([handelse({ giftId: '5655' })]);
  w.VyraActionEvent.handleEvent('gift', ros);
  await vanta(50);
  assert.equal(w.__traffar.length, 1, 'ljudet spelade inte trots samma gåvo-id');
});

test('äldre event med bara "Rose": katalogen översätter namnet till id:t', async () => {
  const w = studio([handelse()], { moln: [{ name: 'Rose', image: 'x.png', coins: 1, giftId: '5655' }] });
  w.VyraActionEvent.handleEvent('gift', ros);
  await vanta(50);
  assert.equal(w.__traffar.length, 1, 'ett event sparat med det engelska namnet spelar inte för den svenska gåvan');
});

test('en annan gåva med annat id spelar inte', async () => {
  const w = studio([handelse({ giftId: '5655' })], { moln: [{ name: 'Rose', image: 'x.png', coins: 1, giftId: '5655' }] });
  w.VyraActionEvent.handleEvent('gift', { username: 'lisa', gift: 'Galax', value: 'Galax', giftId: '5826' });
  await vanta(50);
  assert.equal(w.__traffar.length, 0);
});

test('namnmatchningen fungerar som förut, även utan id', async () => {
  const w = studio([handelse()]);
  w.VyraActionEvent.handleEvent('gift', { username: 'lisa', gift: 'rose', value: 'rose' });
  await vanta(50);
  assert.equal(w.__traffar.length, 1);
});

test('live-client skickar gåvans id vidare till automationen', () => {
  assert.match(las('live-client.js'), /giftname:e\.giftName\|\|e\.gift,giftId:String\(e\.giftId\|\|''\)/);
});

test('Sound Alerts väljer ur samma gåvolista som Action & Event och sparar id:t', () => {
  const s = las('sound-alerts.js');
  assert.match(s, /window\.VyraGavokatalog\?\.lista\?\.\(\)/);
  assert.match(s, /trigger==='gift'&&gift&&giftId\?\{giftId\}:\{\}/);
});
