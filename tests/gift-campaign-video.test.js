'use strict';
// GIFT CAMPAIGN · VARJE GÅVA SPELAR SIN EGEN VIDEO — gift-campaign-video.js och gift-campaign-modeller.js.
//
// Motorn (VyraGavovideo.spela) ersätts av en låtsasversion med en låtsasvideo; själva avkodningen provas i
// gavovideo-proven. Här provas att videon slås upp STRIKT på giftId, att en plats bara spelar sin egen
// gåvas klipp, att platsens tid aldrig kapar ett klipp, och att dolda widgetar inte spelar något.
// Länkarna och id:na är riktiga, uppmätta i G:\vyra-gavovideor 2026-11-06 (Hand Heart har tre id; 5660
// har en annan video än 5924/6968).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const CDN = 'https://sf16-webcast.tiktokcdn.com/obj/maliva/webcast-va/resource/';
const U = {
  galaxy: CDN + 'b0c78095cfa700e7fdbaf26be66798f4.zip',
  lion: CDN + '0a7c24a91de2bd8356a6c0f6496feb43.zip',
  gorilla: CDN + '142aa03eccfa0167036085ffc5cbddd5.zip',
  heart5660: 'https://sf16-webcast.tiktokcdn.com/obj/alisg/webcast-sg/faas/fe07c6e719746e983dc0dec1a6c62eda.zip',
  heart5924: CDN + '8ec87208ab474fe2a324a57ffaa3bec6.zip',
};
const LANGD = { [U.galaxy]: 4.33, [U.lion]: 9.07, [U.gorilla]: 10.43, [U.heart5660]: 3, [U.heart5924]: 3.33 };

const living = [];
test.after(() => { while (living.length) living.pop().window.close(); });
const vanta = ms => new Promise(r => setTimeout(r, ms));

// En sida med widgetkedjan i miniatyr: state, VyraCampaignItems (media.js campaignItems), wh/bind/render
// som studio.js, och de två filerna. `fel` = hämtningen misslyckas.
function sida({ widget = {}, fel = false, katalogIdn = null, html = true } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><main id="duk"></main></body></html>',
    { url: 'https://vyralive.app/studio.html?overlay=1', runScripts: 'dangerously', pretendToBeVisual: true });
  living.push(dom);
  const { window } = dom;
  window.__spelat = [];
  window.__stoppat = [];
  window.VyraGavovideo = {
    spela(canvas, url, val) {
      const v = new window.EventTarget();
      Object.assign(v, { currentTime: 0, duration: LANGD[url] || 3, readyState: 4, paused: false, ended: false,
        play() { this.paused = false; this.ended = false; return Promise.resolve(); }, pause() { this.paused = true; },
        requestVideoFrameCallback(f) { setTimeout(f, 5); return 1; } });
      // Låtsasklockan: tid går när provet säger det (spolaTill), och 'ended' kommer vid längden.
      v.spolaTill = t => { v.currentTime = Math.min(t, v.duration); if (t >= v.duration && !v.ended) { v.ended = true; v.paused = true; if (val.klar) val.klar(); } };
      const rad = { url, canvas, loopa: val.loopa, video: v };
      window.__spelat.push(rad);
      if (fel) return Promise.reject(new Error('trasig zip'));
      return Promise.resolve({ typ: 'webgl', video: v, stoppa() { rad.stoppad = true; window.__stoppat.push(url); } });
    },
    hamta(url) { return Promise.resolve({ videoUrl: 'blob:x' }); },
  };
  window.VyraSafe = { text: s => String(s), url: s => String(s) };
  if (katalogIdn) window.VyraGavokatalog = { idn: n => new Set(katalogIdn[String(n).toLowerCase()] || []) };
  const w = Object.assign({ id: 'k1', type: 'templateGiftCampaign', campaignTheme: 'fokus', campaignOrientation: 'landscape', giftCount: 3, x: 0, y: 0, width: 270,
    giftName0: 'Galaxy', giftImage0: 'galaxy.png', giftId0: '11046', giftCurrent0: 0, giftTarget0: 100,
    giftName1: 'Lion', giftImage1: 'lion.png', giftId1: '6369', giftCurrent1: 0, giftTarget1: 50,
    giftName2: 'Rose', giftImage2: 'rose.png', giftId2: '5655', giftCurrent2: 0, giftTarget2: 250 }, widget);
  window.eval(`
    var state = { widgets: [] }, selected = null, view = 'overlay';
    window.VyraCampaignItems = w => Array.from({ length: Math.min(6, Math.max(1, +w.giftCount || 4)) }, (_, i) => ({
      name: w['giftName' + i], image: w['giftImage' + i], current: +w['giftCurrent' + i] || 0, target: +w['giftTarget' + i] || 1 }));
    var wh = w => '<div class="widget" data-id="' + w.id + '"></div>';
    var props = () => '';
    var bind = () => {};
    var render = () => { document.getElementById('duk').innerHTML = state.widgets.map(x => wh(x)).join(''); bind(); };
  `);
  for (const f of ['gift-campaign-video.js', 'gift-campaign-modeller.js']) window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  window.state.widgets.push(w);
  // jsdom har ingen layout: getClientRects() är tom. En widget i dokumentet räknas som synlig om den inte döljs.
  window.Element.prototype.getClientRects = function () { return this.isConnected && !this.closest('.widget-hidden') ? [{}] : []; };
  if (html) window.render();
  const gava = (giftId, giftName, giftVideo, count = 1) => window.dispatchEvent(new window.CustomEvent('vyra-live-event',
    { detail: { type: 'gift', giftId, giftName, count, ...(giftVideo ? { giftVideo } : {}) } }));
  return { window, w, gava, ins: () => window.VyraKampanjModeller.inspektera('k1'), spelat: () => window.__spelat.map(r => r.url) };
}

test('videon slås upp strikt på giftId — samma namn, annat id, annan video', () => {
  const { window, gava } = sida({ html: false });
  const K = window.VyraKampanjVideo;
  gava('5660', 'Hand Heart', U.heart5660);
  gava('5924', 'Hand Heart', U.heart5924);
  assert.equal(K.video('5660'), U.heart5660);
  assert.equal(K.video('5924'), U.heart5924);
  assert.equal(K.video('6968'), '', 'ett id som aldrig setts har ingen video, även om namnet har det');
  // En plats med sparat id får sitt eget id — aldrig namnets senaste.
  assert.equal(K.platsId({ giftCount: 1, giftName0: 'Hand Heart', giftId0: '5660' }, 0), '5660');
});

test('länkar utanför *.tiktokcdn.com lärs aldrig in, och en gåva utan id lär ingenting', () => {
  const { window, gava } = sida({ html: false });
  const K = window.VyraKampanjVideo;
  gava('8602', 'Gorilla', 'https://evil.example.com/x.zip');
  gava('8602', 'Gorilla', 'http://sf16-webcast.tiktokcdn.com/obj/x.zip');
  gava('', 'Gorilla', U.gorilla);
  assert.equal(K.video('8602'), '');
  gava('8602', 'Gorilla', U.gorilla);
  assert.equal(K.video('8602'), U.gorilla);
});

test('en plats utan sparat id får namnets inräknade id, katalogens enda id — eller inget alls', () => {
  const { window, gava } = sida({ html: false, katalogIdn: { 'hand heart': ['5660', '5924', '6968'], corgi: ['6267'] } });
  const K = window.VyraKampanjVideo;
  assert.equal(K.platsId({ giftCount: 1, giftName0: 'Corgi' }, 0), '6267', 'katalogen har bara ett id för namnet');
  assert.equal(K.platsId({ giftCount: 1, giftName0: 'Hand Heart' }, 0), '', 'tre id för namnet: inget id, hellre bild än fel klipp');
  gava('5924', 'Hand Heart', U.heart5924);
  assert.equal(K.platsId({ giftCount: 1, giftName0: 'Hand Heart' }, 0), '5924', 'det id som räknades in under namnet');
  assert.equal(K.platsId({ giftCount: 1, giftName0: 'Visningsnamn', giftMatch0: 'Hand Heart' }, 0), '5924', 'gåvovalets riktiga namn (giftMatch) gäller');
});

test('katalogen överlever en omladdning (localStorage) och tar inga trasiga poster', () => {
  const { window, gava } = sida({ html: false });
  gava('6369', 'Lion', U.lion);
  const sparat = window.localStorage.getItem('vyra-kampanj-gavovideo-v1');
  assert.match(sparat, /6369/);
  const ny = new JSDOM('<!doctype html><body></body>', { url: 'https://vyralive.app/studio.html?overlay=1', runScripts: 'dangerously' });
  living.push(ny);
  ny.window.localStorage.setItem('vyra-kampanj-gavovideo-v1', JSON.stringify({ video: { 6369: U.lion, 1: 'https://evil.example.com/a.zip' }, id: { lion: '6369' } }));
  ny.window.eval(fs.readFileSync(path.join(ROOT, 'gift-campaign-video.js'), 'utf8'));
  assert.equal(ny.window.VyraKampanjVideo.video('6369'), U.lion);
  assert.equal(ny.window.VyraKampanjVideo.video('1'), '', 'en sparad länk utanför tiktokcdn läses inte in');
});

test('Fokus: den aktiva gåvan spelar SIN video en gång från första rutan; gåvor utan video visar bilden', async () => {
  const { window, gava, ins, spelat } = sida();
  assert.equal(window.document.querySelectorAll('.vyra-gcm').length, 1);
  await vanta(40);
  assert.deepEqual(spelat(), [], 'ingen video innan någon länk är känd');
  gava('11046', 'Galaxy', U.galaxy);
  await vanta(60);
  assert.deepEqual(spelat(), [U.galaxy], 'Galaxy (aktiv) spelar Galaxys video');
  assert.equal(window.__spelat[0].loopa, false, 'en gång — en loop som platsens tid bröt visade en halv animation');
  const p = ins().platser[0];
  assert.equal(p.id, '11046');
  assert.ok(window.document.querySelector('.gcm-hero .gcm-art').classList.contains('gcm-video-pa'), 'bilden tonas bort först när första rutan är ritad');
  // Klippet slut: bilden tillbaka, canvasen kvar men osynlig.
  window.__spelat[0].video.spolaTill(99);
  assert.ok(!window.document.querySelector('.gcm-hero .gcm-art').classList.contains('gcm-video-pa'));
});

test('platsens tid är max(9,3 s, videons längd) — ett långt klipp kapas aldrig', async () => {
  const { window, gava, ins } = sida({ widget: { giftName0: 'Gorilla', giftId0: '8602' } });
  gava('8602', 'Gorilla', U.gorilla);
  await vanta(80);
  assert.equal(ins().aktiv, 0);
  assert.ok(Math.abs(ins().platsTid - 10.43) < 0.01, 'Gorilla 10,43 s förlänger platsen: ' + ins().platsTid);
  // 9,6 s har gått och klippet står på 9,5 av 10,43 s: platsen står kvar.
  const st = window.VyraKampanjModeller.tillstand('k1');
  window.__spelat[0].video.spolaTill(9.5);
  st.start -= 9.6;
  await vanta(60);
  assert.equal(ins().aktiv, 0, 'klippet spelar fortfarande — ingen kapning vid 9,3 s');
  // Klippet slut och platsens tid (10,43 s) passerad: nästa gåva.
  window.__spelat[0].video.spolaTill(99);
  st.start -= 1;
  await vanta(60);
  assert.equal(ins().aktiv, 1);
  assert.ok(window.__stoppat.includes(U.gorilla));
});

test('en gåva utan video står 9,3 s — sedan nästa', async () => {
  const { window, ins } = sida();
  await vanta(40);
  const st = window.VyraKampanjModeller.tillstand('k1');
  st.start -= 9.0;
  await vanta(60);
  assert.equal(ins().aktiv, 0);
  st.start -= 0.4;
  await vanta(60);
  assert.equal(ins().aktiv, 1);
});

test('en mottagen gåva tar fokus först när den pågående videon spelat klart', async () => {
  const { window, gava, ins, w } = sida();
  gava('11046', 'Galaxy', U.galaxy);
  gava('6369', 'Lion', U.lion);
  await vanta(60);
  assert.equal(ins().aktiv, 0);
  // Lion tas emot medan Galaxys klipp spelar: räknaren skrivs direkt, fokus väntar.
  w.giftCurrent1 = 3;
  await vanta(60);
  assert.equal(window.document.querySelector('.gcm-hero .gcm-num').textContent, '0', 'heron visar fortfarande Galaxy');
  assert.equal(ins().aktiv, 0, 'Galaxys klipp kapas inte');
  window.__spelat[0].video.spolaTill(99);
  await vanta(60);
  assert.equal(ins().aktiv, 1, 'Lion tar fokus när Galaxy spelat klart');
  assert.equal(window.document.querySelector('.gcm-hero .gcm-num').textContent, '3', 'räknaren följer sin egen gåva');
  assert.equal(window.__spelat.at(-1).url, U.lion, 'Lion spelar Lions video');
  assert.ok(window.__stoppat.includes(U.galaxy), 'Galaxys spelare är stoppad');
});

test('en dold widget spelar ingen video, och en synlig igen börjar om från första rutan', async () => {
  const { window, gava, w } = sida();
  gava('11046', 'Galaxy', U.galaxy);
  await vanta(60);
  assert.equal(window.VyraKampanjVideo.spelande(), 1);
  window.document.querySelector('.vyra-gcm').classList.add('widget-hidden');
  await vanta(60);
  assert.equal(window.VyraKampanjVideo.spelande(), 0, 'dold widget: spelaren stoppad, canvasen borta');
  assert.equal(window.document.querySelectorAll('canvas.gcm-video').length, 0);
  window.document.querySelector('.vyra-gcm').classList.remove('widget-hidden');
  await vanta(60);
  assert.equal(window.VyraKampanjVideo.spelande(), 1);
  assert.equal(window.__spelat.length, 2, 'en ny uppspelning — från första rutan');
  w.hidden = true;
  await vanta(60);
  assert.equal(window.VyraKampanjVideo.spelande(), 0, 'widgeten dold i lagret (hidden) stoppar också');
});

test('ett svar som kommer efter att platsen bytt gåva kastas — aldrig fel gåvas klipp', async () => {
  const { window, gava } = sida({ html: false });
  const K = window.VyraKampanjVideo;
  gava('11046', 'Galaxy', U.galaxy); gava('6369', 'Lion', U.lion);
  const ruta = window.document.createElement('div'); ruta.innerHTML = '<img>'; window.document.body.append(ruta);
  const p = new K.Spelplats(ruta);
  p.visa('11046');
  p.visa('6369');      // byter innan Galaxy hunnit svara
  await vanta(40);
  assert.equal(p.status().id, '6369');
  assert.equal(window.__stoppat[0], U.galaxy, 'Galaxys sena svar stoppas direkt');
  assert.equal(ruta.querySelectorAll('canvas').length, 1, 'bara Lions canvas');
});

test('en trasig zip lämnar bilden — ingen svart ruta', async () => {
  const { window, gava } = sida({ fel: true });
  gava('11046', 'Galaxy', U.galaxy);
  await vanta(60);
  assert.equal(window.document.querySelectorAll('canvas.gcm-video').length, 0);
  assert.ok(!window.document.querySelector('.gcm-hero .gcm-art').classList.contains('gcm-video-pa'));
  assert.equal(window.VyraKampanjVideo.spelande(), 0);
});

test('Gåvoflödet: liggande går ut åt vänster och in från höger, stående ut upptill och in nedtill', () => {
  for (const [orient, axel] of [['landscape', 0], ['portrait', 1]]) {
    const { window } = sida({ widget: { campaignTheme: 'flode', campaignOrientation: orient, giftCount: 6 } });
    const M = window.VyraKampanjModeller;
    const pos = (fas) => {
      window.document.getElementById('duk').innerHTML = '';
      const w = window.state.widgets[0];
      const d = window.document.createElement('div'); d.innerHTML = M.html(w);
      return Array.from(d.querySelectorAll('.gcm-post')).map(p => +p.getAttribute('style').match(/translate\(([-\d.]+)px,([-\d.]+)px\)/)[axel + 1]);
    };
    const fore = pos(0);
    assert.ok(fore[1] > fore[0], orient + ': nästa gåva står efter (höger/under) den aktiva');
    assert.ok(fore[5] < fore[0], orient + ': förra gåvan står före (vänster/ovanför)');
  }
});

test('alla sex modeller ritas utan widgetbakgrund och med upp till sex gåvor', () => {
  for (const m of ['fokus', 'classic', 'flode']) for (const o of ['landscape', 'portrait']) for (const n of [1, 6]) {
    const { window } = sida({ widget: { campaignTheme: m, campaignOrientation: o, giftCount: n, giftName3: 'Gorilla', giftName4: 'Universe', giftName5: 'Doughnut' } });
    const nod = window.document.querySelector('.vyra-gcm');
    assert.ok(nod, m + ' ' + o);
    assert.equal(nod.dataset.gcm, m);
    const platser = m === 'flode' ? '.gcm-post' : o === 'portrait' ? '.gcm-rad' : '.gcm-ko span';
    assert.equal(nod.querySelectorAll(platser).length, n, `${m} ${o}: ${n} gåvor`);
    assert.ok(!/background/.test(nod.getAttribute('style')), 'ingen bakgrund på widgeten');
  }
});
