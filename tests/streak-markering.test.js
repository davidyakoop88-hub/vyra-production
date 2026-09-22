'use strict';
// TOP STREAK FICK ALDRIG SIN MARKERING I DRIFT (uppmatt 2026-09-22).
//
// Top Gift armas av live-leaderboard.js:updateTopGift — `if (!flip.resume(el)) flip.start(el)`
// foljt av `flip.mark(el)`. Top Streak hade ingen sadan skrivare. `armFlip` anropas pa exakt ett
// stalle i hela repot, och det stallet filtrerar pa templateTopGift.
//
// Foljden: allt som ar streakens accent hanger pa `.hit` — streakEnter 3.8s, streakNumber .8s och
// streakFire .8s, alla ENGANGS. Rotationen ar oandlig och rullar vidare, men de tre spelar bara nar
// klassen satts om. I studion satts den om av demoknappens send()-wrapper vid varje tryck; i
// sandning satts den aldrig om, och talet byter varde i tystnad.
//
// REGELN SOM PROVAS: en gava som slar streakrekordet armar widgeten — och gor det som Top Gift
// redan gor, alltsa `resume()` fore `start()` sa den oandliga rotationen aldrig spolas tillbaka,
// plus `mark()` som den enda synliga markeringen.
//
// KLART NAR: bada halvorna faller. Ett prov som bara mater att `mark()` anropas hade varit gront
// aven om armningen spolade tillbaka rotationen vid varje gava — precis den bugg VyraFlip finns for.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const las = fil => fs.readFileSync(path.join(ROOT, fil), 'utf8');
const GIFTBILDER = las('gift-event-images.js');

const SESSION = '11111111-1111-4111-8111-111111111111';

// Flippen ar en attrapp med protokoll, inte den riktiga: den riktiga laser getComputedStyle och
// mater animationer, vilket jsdom inte kan. Det provet behover veta ar VILKA anrop som gors och i
// vilken ordning — alltsa exakt det kontrakt live-leaderboard.js armFlip redan foljer.
function flipAttrapp({ pagaende = true } = {}) {
  const anrop = [];
  return {
    anrop,
    resume(el) { anrop.push(['resume', el.dataset.id]); if (pagaende) el.classList.add('hit'); return pagaende },
    start(el) { anrop.push(['start', el.dataset.id]); el.classList.add('hit'); },
    mark(el) { anrop.push(['mark', el.dataset.id]); el.classList.add('record'); }
  };
}

function rigg({ flip = flipAttrapp(), widgets } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div class="canvas"></div></body></html>',
    { url: 'https://vyralive.app/studio.html?overlay=1', runScripts: 'outside-only' });
  const w = dom.window;
  w.VyraLiveSession = { runtime: () => ({ aktivSession: () => SESSION }) };
  if (flip) w.VyraFlip = flip;
  // Utan rAF gar schedule() rakt pa flush() — provet slipper vanta pa en bildruta.
  w.requestAnimationFrame = undefined;
  w.eval(`var state = ${JSON.stringify({ widgets })};
    var selected = null; var view = 'overlay';
    var wh = () => ''; var props = () => ''; var bind = () => {};
    var liveWidget = id => state.widgets.find(x => x.id === id);
    window.VYRA_GIFTS = [];`);
  w.eval(GIFTBILDER);
  assert.ok(w.VyraGiftRecords, 'gift-event-images.js laddades inte — provet mater ingenting');

  // Markup med de noder patchen och armningen faktiskt letar efter.
  w.document.querySelector('.canvas').innerHTML = widgets.map(x =>
    `<div class="widget vyra-streak" data-id="${x.id}">
       <div class="streak-flip"><i></i>
         <div class="streak-gift-face"><img src="a.png"></div>
         <div class="streak-profile-face"><img src="b.png"></div>
       </div>
       <div class="sframe-row"><strong>@StreamQueen</strong><b>×18</b></div>
     </div>`).join('');
  return { dom, w, flip };
}

const gava = (w, detail) => w.dispatchEvent(new w.CustomEvent('vyra-live-event', { detail }));
const nod = w => w.document.querySelector('.vyra-streak');
const STREAK = { id: 's1', type: 'templateTopStreak' };

test('en gava som slar streakrekordet armar widgeten', () => {
  const r = rigg({ widgets: [{ ...STREAK }] });
  try {
    gava(r.w, { type: 'gift', username: 'maya', name: 'Maya', giftName: 'Rose', coins: 11, count: 11 });
    assert.deepEqual(r.flip.anrop, [['resume', 's1'], ['mark', 's1']],
      'streaken armades inte — talet byter varde i tystnad, utan puls och utan eld');
    assert.ok(nod(r.w).classList.contains('record'), '.record ar den enda synliga markeringen');
  } finally { r.dom.window.close() }
});

test('MUTATIONSVAKTEN: en pagaende flipp aterupptas, den startas aldrig om', () => {
  // Halva regeln, och den som skyddar hela sandningen: rotationen ar oandlig, och `start()` spolar
  // tillbaka den. Gavor kommer tatare an flippens varv, sa en omstart per gava vore ett synligt
  // hack om och om igen — precis det VyraFlip byggdes for att forhindra.
  const r = rigg({ widgets: [{ ...STREAK }] });
  try {
    for (let i = 1; i <= 3; i += 1) {
      gava(r.w, { type: 'gift', username: 'maya', name: 'Maya', coins: i * 10, count: i * 10 });
    }
    assert.equal(r.flip.anrop.filter(a => a[0] === 'start').length, 0,
      'start() spolar tillbaka den oandliga rotationen');
    assert.equal(r.flip.anrop.filter(a => a[0] === 'resume').length, 3);
    assert.equal(r.flip.anrop.filter(a => a[0] === 'mark').length, 3, 'varje nytt rekord ska markeras');
  } finally { r.dom.window.close() }
});

test('finns ingen pagaende flipp startas en', () => {
  const r = rigg({ widgets: [{ ...STREAK }], flip: flipAttrapp({ pagaende: false }) });
  try {
    gava(r.w, { type: 'gift', username: 'maya', name: 'Maya', coins: 11, count: 11 });
    assert.deepEqual(r.flip.anrop, [['resume', 's1'], ['start', 's1'], ['mark', 's1']],
      'resume() ska fragas forst och start() bara nar den svarar nej');
  } finally { r.dom.window.close() }
});

test('en gava som INTE slar rekordet armar ingenting', () => {
  // Top Streak ar en topplista, inte en "senaste"-widget. En puls vid varje gava vore en lognaktig
  // markering: den sager "nytt rekord" nar ingenting hant.
  const r = rigg({ widgets: [{ ...STREAK }] });
  try {
    gava(r.w, { type: 'gift', username: 'maya', name: 'Maya', coins: 50, count: 50 });
    const efterForsta = r.flip.anrop.length;
    gava(r.w, { type: 'gift', username: 'ove', name: 'Ove', coins: 3, count: 3 });
    assert.equal(r.flip.anrop.length, efterForsta,
      'en gava under rekordet markerades som ett nytt rekord');
  } finally { r.dom.window.close() }
});

test('armningen sker EFTER patchen, inte fore', () => {
  // Annars startar pulsen pa den gamla bilden och talet byts mitt i den.
  const r = rigg({ widgets: [{ ...STREAK }] });
  try {
    const sedd = [];
    const el = nod(r.w);
    r.w.VyraFlip.mark = () => sedd.push(el.querySelector('.sframe-row b').textContent);
    gava(r.w, { type: 'gift', username: 'maya', name: 'Maya', coins: 42, count: 42 });
    // Talet OCH prefixet: renderaren skriver `<b>×18</b>` och patchen bevarar det som star
    // framfor siffran, sa '×42' bevisar bade ordningen och att prefixet overlevde.
    assert.deepEqual(sedd, ['×42'], 'mark() sag det gamla talet — armningen kom fore patchen');
  } finally { r.dom.window.close() }
});

test('utan VyraFlip faller armningen tillbaka pa klassbytet', () => {
  // Ett aldre overlagg som inte laddar modulen ska fortfarande visa nagot, inte tystna helt.
  // Samma fallback som live-leaderboard.js armFlip redan bar.
  const r = rigg({ widgets: [{ ...STREAK }], flip: null });
  try {
    gava(r.w, { type: 'gift', username: 'maya', name: 'Maya', coins: 11, count: 11 });
    assert.ok(nod(r.w).classList.contains('hit'), 'utan modulen ska klassen satsas om direkt');
  } finally { r.dom.window.close() }
});

test('CSS: .record har nagot att visa i BADA familjerna', () => {
  // `mark()` lagger bara en klass. Utan en regel som hanger pa den ar markeringen osynlig — och
  // provet ovan hade varit gront anda. Regeln aterbrukar giftPulse med flit: en puls ska se
  // likadan ut i de tva familjerna.
  const css = las('studio.css');
  assert.match(css, /\.vyra-topgift\.record \.vyra-gift-face\{animation:giftPulse/);
  assert.match(css, /\.vyra-streak\.record \.streak-gift-face\{animation:giftPulse/,
    'streaken saknar record-regel — mark() satter en klass som ingenting ritar');
});
