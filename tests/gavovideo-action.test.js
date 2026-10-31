'use strict';
// "SPELA GÅVANS ANIMATION" — steg 3 av Top Gift (2026-10-31, PR 719).
//
// Kedjan: Event (alla gåvor) -> Action med types ['giftVideo'] -> action-runtime.js spelar
// payload.giftVideo med VyraGavovideo.spela. Själva avkodningen och ritningen provas i
// tests/gavovideo.test.js och i OBS; här ersätts motorn av en låtsasmotor som minns sina anrop och
// säger "klar" när provet vill, så det som provas är kön, länkvakten och kopplingen.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const KEY = 'vyra-action-event-v2';
const URL_OK = 'https://sf16-webcast.tiktokcdn.com/obj/maliva/webcast-va/resource/0a7c24a91de2bd8356a6c0f6496feb43.zip';
const URL_2 = URL_OK.replace('0a7c', '1b8d');

const living = [];
test.after(() => { while (living.length) living.pop().window.close() });
const vanta = ms => new Promise(r => setTimeout(r, ms));

function overlay({ types = ['giftVideo'], triggerValue = '' } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>',
    { url: 'https://vyralive.app/studio.html?overlay=1', runScripts: 'dangerously', pretendToBeVisual: true });
  living.push(dom);
  const { window } = dom;
  window.navigator.locks = undefined;
  window.VYRA_OVERLAY_SCENE = 1;
  window.localStorage.setItem(KEY, JSON.stringify({
    actions: [{ id: 'a1', name: 'Gåvoanimation', types, duration: 10, config: {}, scene: { number: 1 } }],
    events: [{ id: 'e1', name: 'Alla gåvor', trigger: 'gift', triggerValue, actionId: 'a1', enabled: true }],
  }));
  window.__spelat = [];
  window.VyraGavovideo = {
    spela(canvas, url, { klar }) {
      const rad = { url, canvas, klar, stoppad: false };
      window.__spelat.push(rad);
      return Promise.resolve({ typ: 'webgl', stoppa() { rad.stoppad = true } });
    },
  };
  for (const f of ['session-state.js', 'action-runtime.js', 'action-event.js', 'action-event-advanced.js', 'action-scenes.js']) {
    const s = window.document.createElement('script');
    s.textContent = las(f);
    window.document.body.append(s);
  }
  return window;
}
const gava = (over = {}) => ({ username: 'lisa', gift: 'Lion', value: 'Lion', coins: 29999, giftVideo: URL_OK, ...over });

test('en gåva med video spelas i overlayn, på en canvas i scenens lager', async () => {
  const w = overlay();
  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(200);
  assert.equal(w.__spelat.length, 1, 'gåvans animation spelades inte');
  assert.equal(w.__spelat[0].url, URL_OK);
  assert.ok(w.__spelat[0].canvas.closest('#vyraActionRuntime .vyra-runtime-item'), 'canvasen hamnade utanför scenens lager');
});

test('gåvorna spelas EN I TAGET — nästa börjar först när den förra är slut', async () => {
  const w = overlay();
  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(50);
  w.VyraActionEvent.handleEvent('gift', gava({ gift: 'Rocket', value: 'Rocket', giftVideo: URL_2 }));
  await vanta(400);
  assert.equal(w.__spelat.length, 1, 'två animationer spelades samtidigt');
  w.__spelat[0].klar();
  await vanta(400);
  assert.equal(w.__spelat.length, 2, 'nästa gåva spelades inte när den förra var klar');
  assert.equal(w.__spelat[1].url, URL_2);
  assert.equal(w.__spelat[0].stoppad, true, 'den färdiga spelaren släpptes inte');
  assert.equal(w.__spelat[0].canvas.isConnected, false, 'den färdiga animationen låg kvar i overlayn');
});

test('en gåva utan egen animation hoppas över direkt — kön väntar inte ut visningstiden', async () => {
  const w = overlay();
  w.VyraActionEvent.handleEvent('gift', gava({ gift: 'Rose', value: 'Rose', coins: 1, giftVideo: '' }));
  await vanta(50);
  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(600);
  assert.equal(w.__spelat.length, 1, 'gåvan efter en Rose fick vänta ut tio sekunders visningstid');
  assert.equal(w.__spelat[0].url, URL_OK);
});

test('en länk utanför https://*.tiktokcdn.com spelas aldrig', async () => {
  for (const giftVideo of ['https://ond.example/a.zip', 'http://sf16-webcast.tiktokcdn.com/a.zip',
    'https://tiktokcdn.com.ond.example/a.zip', 'javascript:alert(1)']) {
    const w = overlay();
    w.VyraActionEvent.handleEvent('gift', gava({ giftVideo }));
    await vanta(150);
    assert.equal(w.__spelat.length, 0, giftVideo);
  }
});

test('Studio visar funktionen som ett eget kort med svensk text', () => {
  const src = las('action-event.js');
  assert.match(src, /\['giftVideo','Spela gåvans animation'\]/);
  assert.match(src, /giftVideo:\['Spelar TikToks egen animation/);
});

test('live-client för vidare giftVideo till Event-motorn, och overlayn laddar motorn', () => {
  assert.match(las('live-client.js'), /giftVideo:e\.giftVideo\|\|''/, 'payloaden tappar gåvans video');
  const media = las('media.js');
  const motor = media.indexOf("'gavovideo.js?v="), runtime = media.indexOf("'action-runtime.js?v=");
  assert.ok(motor > 0 && motor < runtime, 'gavovideo.js laddas inte före action-runtime.js');
});
