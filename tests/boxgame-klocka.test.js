'use strict';
// BOXGAME-KLOCKA (boxgame-klocka.js) — rondtimern med 10→1-alert, engelska sifferutrop och slutklocka.
// Provet vaktar det som inte får gå sönder i en sändning: att studion och OBS räknar fram samma sekund
// ur samma fält, att alerten och TIME’S UP! kommer på rätt sekund, att ljudet bara spelas i overlayn
// (aldrig dubbelt), och att klockan syns i OBS utan att vänta på en live-händelse.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
test.after(closeAll);

function rigg(overlay = false) {
  const h = createDom({ url: 'https://vyralive.app/studio.html' + (overlay ? '?overlay=1' : ''), state: { widgets: [], projectName: 'boxgame' } });
  h.load('boxgame-klocka.js');
  return h;
}
const B = h => h.window.VyraBoxgame;
// state och render bor i studions globala scope (let i studio.js), inte på window.
const sida = h => h.window.eval('({ state, render })');
function rita(h, w, t) {
  const host = h.document.createElement('div');
  host.innerHTML = h.window.wh(w);
  h.document.body.append(host);
  const rot = host.querySelector('.vyra-boxgame');
  assert.ok(rot, 'Boxgame-klockan renderades inte');
  B(h).visa(rot, w, t);
  return rot;
}
const text = (rot, sel) => (rot.querySelector(sel)?.textContent || '').replace(/\s+/g, ' ').trim();

test('katalognyckeln ger en klocka på fem minuter som står still tills streamern startar', () => {
  const h = rigg();
  const w = h.window.VyraWidgets.create('catalog:boxgame');
  assert.equal(w.type, 'templateBoxgameClock');
  assert.equal(w.boxMinuter, 5);
  assert.equal(w.boxKvarMs, 300000);
  assert.equal(w.boxKor, false);
  assert.equal(w.boxRostFran, 10, 'sifferutropen ska som standard gälla sista 10 sekunderna');
  const rot = rita(h, w, Date.now());
  assert.equal(text(rot, '.bgx-tid'), '05:00');
  assert.equal(text(rot, '.bgx-alertlager'), '');
});

test('samma fält ger samma sekund: tiden räknas ur ett absolut slut, inte en räknare', () => {
  const h = rigg();
  const slut = 1_800_000_000_000;
  const w = { ...h.window.VyraWidgets.create('catalog:boxgame'), id: 'b1', boxKor: true, boxSlut: slut };
  const l = t => B(h).lage(w, t);
  assert.equal(Math.ceil(l(slut - 125_000).kvarMs / 1000), 125);
  assert.equal(B(h).tidText(125), '02:05');
  assert.equal(B(h).tidText(20), '20', 'sista 20 sekunderna visas som två siffror, som designen');
  assert.equal(B(h).tidText(7), '07');
  assert.ok(l(slut - 1).kor && !l(slut - 1).slut);
  assert.ok(!l(slut).kor && l(slut).slut, 'vid noll är ronden slut, inte pausad');
  assert.equal(l(slut + 5000).kvarMs, 0, 'tiden går aldrig under noll');
});

test('alerten: 10→1 de sista tio sekunderna, TIME’S UP! vid noll, borta efter 3,2 s', () => {
  const h = rigg();
  const slut = 1_800_000_000_000;
  const w = { ...h.window.VyraWidgets.create('catalog:boxgame'), id: 'b2', boxKor: true, boxSlut: slut };
  assert.equal(text(rita(h, w, slut - 10_500), '.bgx-alertlager'), '', 'ingen alert vid 11 sekunder kvar');
  for (const n of [10, 5, 1]) {
    const rot = rita(h, w, slut - n * 1000 + 1);
    assert.equal(text(rot, '.bgx-alertlager strong'), String(n), `alerten visar inte ${n}`);
    assert.ok(rot.classList.contains('bgx-alert-pa'), 'klockan ska tonas bort under alerten');
  }
  const noll = rita(h, w, slut + 100);
  assert.equal(text(noll, '.bgx-alertlager strong'), 'TIME’SUP!');
  assert.match(noll.querySelector('.bgx-alertlager').innerHTML, /TIME’S<br>UP!/, 'TIME’S UP! med riktig apostrof');
  assert.equal(text(rita(h, w, slut + 3300), '.bgx-alertlager'), '', 'TIME’S UP! ska vara borta efter 3,2 s');
});

test('ljudet spelas bara i overlayn — studion är tyst, så det hörs en gång', () => {
  const studio = rigg(false);
  const w = { ...studio.window.VyraWidgets.create('catalog:boxgame'), id: 'b3', boxKor: true, boxSlut: Date.now() + 5000 };
  sida(studio).state.widgets.push(w);
  sida(studio).render();
  assert.equal(B(studio).ljudagare(), null, 'studion får aldrig äga ljudet');
  const obs = rigg(true);
  const a = { ...obs.window.VyraWidgets.create('catalog:boxgame'), id: 'a', boxKor: true, boxSlut: Date.now() + 5000 };
  const b = { ...a, id: 'b' };
  sida(obs).state.widgets.push(a, b);
  sida(obs).render();
  assert.equal(B(obs).ljudagare()?.id, 'a', 'med två klockor på samma sida spelar bara den första');
  a.hidden = true;
  sida(obs).render();
  assert.equal(B(obs).ljudagare()?.id, 'b', 'en dold klocka spelar inget ljud');
});

test('klockan syns i OBS från första bildrutan — den väntar inte på en live-händelse', () => {
  const kod = fs.readFileSync('overlay-aktivering.js', 'utf8');
  assert.match(kod, /const UNDANTAG = new Set\(\[[^\]]*'templateBoxgameClock'/);
});

test('ljudfilerna finns, är små, och det finns inga knackljud', () => {
  for (const [f, max] of [['nedrakning-jack.mp3', 220], ['slutklocka.mp3', 60]]) {
    const kb = fs.statSync('assets/sounds/boxgame/' + f).size / 1024;
    assert.ok(kb < max, `${f} är ${kb.toFixed(0)} kB`);
  }
  const kod = fs.readFileSync('boxgame-klocka.js', 'utf8').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(kod, /createBiquadFilter|createOscillator|Math\.random\(\)\s*\*\s*2\s*-\s*1/, 'knackljudet från playgrounden får inte följa med');
  assert.match(kod, /20 - n, 0\.98/, 'varje sifferutrop är en egen skiva ur röstklippet');
});
