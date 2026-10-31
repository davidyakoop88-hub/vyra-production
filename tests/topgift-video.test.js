'use strict';
// TOP GIFT SPELAR GÅVANS EGEN ANIMATION — topgift-video.js (PR 719 steg 4).
//
// Rekordbeslutet (records.bedom) och motorn (VyraGavovideo) ersätts av låtsasversioner: beslutet
// provas i gift-event-images-proven och motorn i gavovideo-proven. Här provas att videon följer
// rekordet, att bilden står kvar som reserv, och att en omritad widget får tillbaka videon.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const URL_LION = 'https://sf16-webcast.tiktokcdn.com/obj/maliva/webcast-va/resource/0a7c24a91de2bd8356a6c0f6496feb43.zip';
const URL_HEART = 'https://sf16-webcast.tiktokcdn.com/obj/alisg/webcast-sg/faas/fe07c6e719746e983dc0dec1a6c62eda.zip';
const WIDGET = '<div class="vyra-topgift" data-id="w1"><div class="vyra-flip"><div class="vyra-gift-face"><img src="lion.png"><span>Lion</span></div></div></div>';

const living = [];
test.after(() => { while (living.length) living.pop().window.close() });
const vanta = ms => new Promise(r => setTimeout(r, ms));

function sida({ rekord = () => true, motorFel = false, session = null, form, falt = {} } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>${WIDGET}</body></html>`,
    { url: 'https://vyralive.app/studio.html?overlay=1', runScripts: 'dangerously', pretendToBeVisual: true });
  living.push(dom);
  const { window } = dom;
  if (session) window.sessionStorage.setItem('vyra-topgift-video', session);
  // studio.js state (en toppnivå-let); här räcker en global med widgetens fält.
  window.state = { widgets: [{ id: 'w1', type: 'templateTopGift', ...(form ? { tgVideoForm: form } : {}), ...falt }] };
  window.VyraGiftRecords = { bedom: e => ({ gift: rekord(e), giftVarde: Number(e.diamonds) || 0 }) };
  window.__spelat = [];
  window.VyraGavovideo = {
    spela(canvas, url, val) {
      const rad = { url, canvas, loopa: val.loopa, stoppad: false };
      window.__spelat.push(rad);
      return motorFel ? Promise.reject(new Error('trasig zip')) : Promise.resolve({ stoppa() { rad.stoppad = true } });
    },
  };
  const s = window.document.createElement('script');
  s.textContent = fs.readFileSync(path.join(ROOT, 'topgift-video.js'), 'utf8');
  window.document.body.append(s);
  return window;
}
const gava = (w, over = {}) => w.dispatchEvent(new w.CustomEvent('vyra-live-event',
  { detail: { type: 'gift', username: 'lisa', giftName: 'Lion', diamonds: 29999, giftVideo: URL_LION, ...over } }));
const bild = w => w.document.querySelector('.vyra-gift-face img');
const canvasar = w => w.document.querySelectorAll('.vyra-gift-face canvas.vyra-topgift-video');

test('ett nytt rekord med video spelar animationen i loop ovanpå gåvobilden', async () => {
  const w = sida();
  gava(w);
  await vanta(50);
  assert.equal(w.__spelat.length, 1);
  assert.equal(w.__spelat[0].url, URL_LION);
  assert.equal(w.__spelat[0].loopa, true, 'Top Gift står kvar — animationen ska loopa, inte spelas en gång');
  assert.equal(canvasar(w).length, 1);
  assert.equal(bild(w).style.visibility, 'hidden', 'bilden syntes under videon');
  assert.ok(bild(w).isConnected, 'bilden ska ligga kvar som reserv, inte tas bort');
});

test('som BetterTok: en ram större än bilden, videon fyller den nedifrån och når upp över den', async () => {
  const w = sida({ form: 'ram' });
  const b = bild(w);
  // jsdom har ingen layout; ge bilden royal-designens 110 px-ruta.
  for (const [k, v] of Object.entries({ offsetWidth: 110, offsetHeight: 110, offsetLeft: 0, offsetTop: 0 }))
    Object.defineProperty(b, k, { configurable: true, get: () => v });
  gava(w);
  await vanta(50);
  const ansikte = w.document.querySelector('.vyra-gift-face');
  const ram = ansikte.querySelector('.vyra-topgift-ram'), c = canvasar(w)[0];
  assert.ok(ansikte.classList.contains('tgv-aktiv'), 'gåvosidan öppnades inte för videon');
  assert.equal(ram.style.width, '176px', 'ramen ska vara 1,6 × gåvobildens ruta');
  assert.equal(ram.style.height, '176px', 'ramen ska vara fyrkantig');
  assert.equal(c.style.width, '176px');
  assert.equal(c.style.height, '255px', 'canvasen ska nå 45 % upp över ramen');
  assert.equal(parseInt(c.style.top) + 255, parseInt(ram.style.top) + 176, 'videons underkant ska stå i ramens underkant');
  assert.match(w.document.getElementById('vyra-topgift-video-stil').textContent, /object-position:50% 100%/,
    'utsnittet ska tas nedifrån, där TikToks motiv står');
});

const royalRuta = w => { const b = bild(w);
  for (const [k, v] of Object.entries({ offsetWidth: 110, offsetHeight: 110, offsetLeft: 0, offsetTop: 0 }))
    Object.defineProperty(b, k, { configurable: true, get: () => v });
};
const delar = w => { const a = w.document.querySelector('.vyra-gift-face'); return { ram: a.querySelector('.vyra-topgift-ram'), c: canvasar(w)[0] } };

test('formen Cirkel: rund ram med glöd, hela videon klipps i cirkeln', async () => {
  const w = sida({ form: 'cirkel' });
  royalRuta(w);
  gava(w);
  await vanta(50);
  const { ram, c } = delar(w);
  assert.equal(ram.style.display, '', 'cirkeln ska ha ramen med glöd');
  assert.equal(ram.style.borderRadius, '50%');
  assert.equal(ram.style.width, '154px', 'cirkeln ska vara 1,4 × gåvobildens ruta');
  assert.equal(c.style.height, ram.style.height, 'i cirkeln ska ingenting sticka upp');
  assert.equal(c.style.clipPath, 'inset(0 round 50%)');
});

test('formen Fri: ingen ram och inget klipp, bara animationen', async () => {
  const w = sida({ form: 'fri' });
  royalRuta(w);
  gava(w);
  await vanta(50);
  const { ram, c } = delar(w);
  assert.equal(ram.style.display, 'none', 'den fria formen ritade rutan');
  assert.equal(c.style.width, '220px', 'den fria formen ska vara 2 × gåvobildens ruta');
  assert.equal(c.style.clipPath, '');
});

test('formen I bildrutan: samma storlek som gåvobilden, ingen ram', async () => {
  const w = sida({ form: 'ruta' });
  royalRuta(w);
  gava(w);
  await vanta(50);
  const { ram, c } = delar(w);
  assert.equal(ram.style.display, 'none');
  assert.equal(c.style.width, '110px');
  assert.equal(c.style.height, '110px');
});

test('förvalt: videon tar profilsidans ruta, rundning, kant och skugga — samma på båda sidor när kortet vänder', async () => {
  const w = sida();
  w.document.querySelector('.vyra-flip').insertAdjacentHTML('afterbegin',
    '<div class="vyra-profile-face" style="border-radius:50%;border:4px solid rgb(255, 255, 255);box-shadow:rgb(217, 164, 65) 0px 0px 0px 2px"></div>');
  const pf = w.document.querySelector('.vyra-profile-face');
  for (const [k, v] of Object.entries({ offsetWidth: 144, offsetHeight: 147 })) Object.defineProperty(pf, k, { configurable: true, get: () => v });
  const b = bild(w);
  for (const [k, v] of Object.entries({ offsetWidth: 144, offsetHeight: 147, offsetLeft: 0, offsetTop: 0 }))
    Object.defineProperty(b, k, { configurable: true, get: () => v });
  gava(w);
  await vanta(50);
  const { ram, c } = delar(w);
  assert.equal(ram.style.width, '144px', 'videosidan ska vara lika stor som profilsidan');
  assert.equal(ram.style.height, '147px');
  assert.equal(ram.style.borderRadius, '50%', 'rund profilbild ska ge rund video');
  assert.match(ram.style.border, /4px solid/, 'profilsidans kant ska följa med');
  assert.match(ram.style.boxShadow, /217, 164, 65/, 'profilsidans glöd ska följa med');
  assert.equal(c.style.width, '136px', 'videon ska ligga innanför kanten');
  assert.equal(c.style.clipPath, 'inset(0 round 50%)');
});

test('egna färger: kant och glöd byts på videon, och en kant läggs till där profilbilden saknar en', async () => {
  const w = sida({ falt: { tgVideoKant: '#ff0000', tgVideoGlod: '#00ff00' } });
  royalRuta(w);
  gava(w);
  await vanta(50);
  const { ram, c } = delar(w);
  assert.equal(ram.style.borderColor, 'rgb(255, 0, 0)', 'kantfärgen användes inte');
  assert.equal(ram.style.borderWidth, '3px', 'utan profilkant ska videon få en egen kant');
  assert.equal(c.style.width, '104px', 'videon ska krympa innanför den nya kanten');
  assert.match(ram.style.boxShadow, /#00ff00|rgb(0, 255, 0)/, 'glödfärgen användes inte');
  assert.equal(ram.style.getPropertyValue('--tgv-glod'), '0 255 0');
});

test('egna färger i en annan form: glöden byts, kanten blir en kontur utanför ramen', async () => {
  const w = sida({ form: 'ram', falt: { tgVideoKant: '#ff0000', tgVideoGlod: '#00ff00' } });
  royalRuta(w);
  gava(w);
  await vanta(50);
  const { ram } = delar(w);
  assert.equal(ram.style.getPropertyValue('--tgv-glod'), '0 255 0');
  assert.match(ram.style.outline, /3px solid/);
  assert.equal(ram.style.width, '176px', 'konturen får inte ändra ramens mått');
});

test('panelen har färgvalen och Återställ utseende tar med dem', () => {
  const src = fs.readFileSync(path.join(ROOT, 'vyra-topgift-panel.js'), 'utf8');
  assert.match(src, /falt: 'tgVideoKant', etikett: 'Videons kantfärg'/);
  assert.match(src, /falt: 'tgVideoGlod', etikett: 'Videons glödfärg'/);
  assert.match(src, /'tgVideoForm', 'tgVideoKant', 'tgVideoGlod'/);
});

test('formen Glödande ring: bara kanten, motivet sticker upp och nederkanten följer cirkeln', async () => {
  const w = sida({ form: 'ring' });
  royalRuta(w);
  gava(w);
  await vanta(50);
  const { ram, c } = delar(w);
  assert.ok(ram.classList.contains('tgv-ring'), 'ringen ritade den mörka ytan');
  assert.equal(ram.style.width, '165px');
  assert.ok(parseInt(c.style.height) > 165, 'motivet ska få sticka upp över ringen');
  assert.equal(c.style.clipPath, 'inset(0 round 0 0 83px 83px)', 'nederkanten ska vara en halvcirkel i px, inte procent av den höga canvasen');
});

test('formerna Sexhörning och Diamant klipper ytan och videon i samma polygon', async () => {
  for (const [form, polygon] of [['sexhorning', 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)'], ['diamant', 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)']]) {
    const w = sida({ form });
    royalRuta(w);
    gava(w);
    await vanta(50);
    const { ram, c } = delar(w);
    assert.ok(ram.classList.contains('tgv-polygon'), form);
    assert.equal(ram.firstChild.style.clipPath.replace(/,\s*/g, ', '), polygon, form + ': ytan');
    assert.equal(c.style.clipPath.replace(/,\s*/g, ', '), polygon, form + ': videon');
    assert.equal(c.style.height, ram.style.height, form + ': ingenting ska sticka utanför polygonen');
  }
});

test('formen Båge: rund överkant, nästan rak nederkant', async () => {
  const w = sida({ form: 'bage' });
  royalRuta(w);
  gava(w);
  await vanta(50);
  const { ram, c } = delar(w);
  assert.match(ram.style.borderRadius, /50% 50% 12% 12% \/ 40% 40% 12% 12%/);
  assert.match(c.style.clipPath, /^inset\(0 round 50% 50% 12% 12% \/ 40% 40% 12% 12%\)$/);
});

test('formen Bara bild spelar ingen video', async () => {
  const w = sida({ form: 'bild' });
  gava(w);
  await vanta(50);
  assert.equal(w.__spelat.length, 0);
  assert.equal(canvasar(w).length, 0);
  assert.equal(bild(w).style.visibility, '');
});

test('byter man form medan videon spelar ritas den om i den nya formen inom en sekund', async () => {
  const w = sida({ form: 'ram' });
  royalRuta(w);
  gava(w);
  await vanta(50);
  w.state.widgets[0].tgVideoForm = 'fri';
  await vanta(1200);
  assert.equal(w.__spelat[0].stoppad, true, 'den gamla formens spelare släpptes inte');
  assert.equal(canvasar(w).length, 1);
  assert.equal(delar(w).ram.style.display, 'none', 'den nya formen användes inte');
  w.state.widgets[0].tgVideoForm = 'bild';
  await vanta(1200);
  assert.equal(canvasar(w).length, 0, 'Bara bild stoppade inte videon');
  assert.equal(bild(w).style.visibility, '');
});

test('panelen visar formerna under Utseende och Återställ utseende tar med dem', () => {
  const src = fs.readFileSync(path.join(ROOT, 'vyra-topgift-panel.js'), 'utf8');
  assert.match(src, /falt: 'tgVideoForm', etikett: 'Videons form'/);
  assert.match(src, /window.VyraTopGiftVideo.former/);
  assert.match(src, /'topGiftFlipSpeed', 'tgVideoForm'/);
  const w = sida();
  assert.equal(w.VyraTopGiftVideo.former.map(f => f[0]).join(' '), 'profil ram cirkel ring sexhorning diamant bage fri ruta bild');
});

test('en gåva som inte slår rekordet rör ingenting', async () => {
  let forsta = true;
  const w = sida({ rekord: () => { const r = forsta; forsta = false; return r } });
  gava(w);
  await vanta(50);
  gava(w, { giftName: 'Hand Heart', diamonds: 100, giftVideo: URL_HEART });
  await vanta(1200);
  assert.equal(w.__spelat.length, 1, 'en mindre gåva bytte Top Gifts video');
  assert.equal(w.__spelat[0].stoppad, false);
});

test('ett nytt rekord UTAN video stoppar den gamla och visar bilden igen', async () => {
  const w = sida();
  gava(w);
  await vanta(50);
  gava(w, { giftName: 'Universe', diamonds: 34999, giftVideo: '' });
  await vanta(50);
  assert.equal(w.__spelat[0].stoppad, true, 'förra rekordets video spelade vidare');
  assert.equal(canvasar(w).length, 0);
  assert.equal(bild(w).style.visibility, '', 'bilden doldes fast det inte fanns någon video');
});

test('ett nytt rekord med annan video byter animation', async () => {
  const w = sida();
  gava(w, { giftVideo: URL_HEART });
  await vanta(50);
  gava(w);
  await vanta(50);
  assert.equal(w.__spelat.length, 2);
  assert.equal(w.__spelat[0].stoppad, true);
  assert.equal(w.__spelat[1].url, URL_LION);
  assert.equal(canvasar(w).length, 1, 'två animationer låg på varandra');
});

test('går videon inte att spela står bilden kvar', async () => {
  const w = sida({ motorFel: true });
  gava(w);
  await vanta(50);
  assert.equal(canvasar(w).length, 0);
  assert.equal(bild(w).style.visibility, '');
});

test('en länk utanför https://*.tiktokcdn.com spelas aldrig', async () => {
  for (const giftVideo of ['https://ond.example/a.zip', 'http://sf16-webcast.tiktokcdn.com/a.zip', 'javascript:alert(1)']) {
    const w = sida();
    gava(w, { giftVideo });
    await vanta(50);
    assert.equal(w.__spelat.length, 0, giftVideo);
  }
});

test('en omritad widget får tillbaka videon inom en sekund', async () => {
  const w = sida();
  gava(w);
  await vanta(50);
  w.document.body.innerHTML = WIDGET;                // render() byter ut widgetens DOM
  await vanta(1200);
  assert.equal(w.__spelat[0].stoppad, true, 'spelaren för den bortritade bilden släpptes inte');
  assert.equal(canvasar(w).length, 1, 'videon kom inte tillbaka efter omritningen');
  assert.equal(w.__spelat.at(-1).url, URL_LION);
});

test('en omladdad OBS-källa fortsätter med samma rekord; live:start nollar det', async () => {
  const w = sida({ session: URL_LION });
  await vanta(1200);
  assert.equal(canvasar(w).length, 1, 'rekordets video kom inte tillbaka efter omladdning');
  w.dispatchEvent(new w.CustomEvent('vyra-live-session', { detail: { event: 'live:start' } }));
  await vanta(50);
  assert.equal(canvasar(w).length, 0, 'förra sändningens rekord spelade vidare i den nya');
  assert.equal(w.sessionStorage.getItem('vyra-topgift-video'), null);
});

test('modulen laddas i overlayn efter motorn och har en ägare', () => {
  const media = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
  const motor = media.indexOf("'gavovideo.js?v="), modul = media.indexOf("'topgift-video.js?v=");
  assert.ok(motor > 0 && modul > motor, 'topgift-video.js laddas inte efter gavovideo.js');
  assert.ok(fs.readFileSync(path.join(ROOT, '.claude/domaner.json'), 'utf8').includes('"topgift-video.js"'));
});
