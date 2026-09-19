'use strict';
// NIVAN SKA FOLJA GAVANS VARDE, INTE ANTALET TRYCK.
//
// UPPMATT I DAVIDS SANDNING 2026-09-18 (197 gavor, bandet i tiktok-bridge/inspelningar):
// fwLevelOf las `comboCount`, alltsa hur manga ganger samma gava tryckts, och aldrig vad den var
// vard. Resultatet blev omvant mot avsikten:
//
//   alla 11 tandningar som nadde burst eller show var 1-coins-gavor
//   de fem "stor final" pa 18 s var tillsammans varda 500 coins
//   23 gavor varda 26 536 coins - darav en pa 5000 - korde alla nivan single
//
// 94 % av kvallen korde single. En streamer som skickade 5000 coins fick exakt samma sex sekunder
// som den som tryckte en ros.
//
// REGELN BLIR: styrkan raknas pa TOTALVARDET, coins gange antal.
//   under 100 -> single      100-999 -> burst      1000+ -> show
//
// TROSKLARNA ANDRAS INTE I KODEN. Det finns tre stallen som delar pa 1/10/100-skalan
// (fwLevelOf, fwSequence canvas-duration, buildComboRockets raketantal), och att andra alla tre
// hade varit tre chanser att missa en. I stallet oversatts varde till samma skala FORE den —
// da rors ingen av de tre, och editorns testknapp, som skickar en ren combo utan belopp, beter
// sig precis som forr.
//
// MATT UTIFRAN: `VyraFireworks.durationFor` ar den speltid bade renderaren och kon raknar med,
// och den skiljer nivaerna at. Ett test som lasar en intern variabel hade varit gront aven om
// ingen animation andrades.
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.afterEach(async () => { await new Promise(setImmediate); closeAll(); });

const fw = (over = {}) => Object.assign({
  id: 'fw1', type: 'templateGiftFireworks', x: 10, y: 10, width: 360, title: 'Gift Fireworks',
  fwMotion: 'magnetic', fwMin: 1, fwSpeed: 0.6, fwDuration: 5, fwGiftSize: 110,
  fwExplosion: 100, fwDensity: 70, fwSound: false
}, over);

// Utan fwTheme ar widgeten INTE en canvas-tema, sa speltiden blir fwDuration + nivans lead:
//   single 5 + 0 = 5,0 s      burst 5 + 0,9 = 5,9 s      show 5 + 4,2 = 9,2 s
const SINGLE = 5000, BURST = 5900, SHOW = 9200;
const namn = ms => ms === SHOW ? 'show' : ms === BURST ? 'burst' : ms === SINGLE ? 'single' : ms + 'ms';

function boot(widgets = [fw()]) {
  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout',
    state: { widgets, projectName: 'fw' } });
  h.load('overlay-sanitize.js');
  h.load('gift-fireworks.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`state.widgets.length=0;${widgets.map(w => `state.widgets.push(${JSON.stringify(w)})`).join(';')};view='editor';`);
  return { h, niva: input => namn(Math.round(h.window.VyraFireworks.durationFor(input))) };
}

// ---- de tre nivaerna, raknade pa totalvarde -----------------------------------------------------

test('en enda gava pa 5000 coins ger show — inte single som i sandningen', () => {
  // Kl. 20:09 den 18:e. combo=1, sa den gamla regeln gav single.
  const { niva } = boot();
  assert.equal(niva({ coins: 5000, count: 1 }), 'show');
});

test('1000 coins ar gransen for show', () => {
  const { niva } = boot();
  assert.equal(niva({ coins: 1000, count: 1 }), 'show');
  assert.equal(niva({ coins: 999, count: 1 }), 'burst');
});

test('100 coins ar gransen for burst', () => {
  const { niva } = boot();
  assert.equal(niva({ coins: 100, count: 1 }), 'burst');
  assert.equal(niva({ coins: 99, count: 1 }), 'single');
});

test('en ensam ros ar single', () => {
  const { niva } = boot();
  assert.equal(niva({ coins: 1, count: 1 }), 'single');
});

// ---- det som var hela felet ---------------------------------------------------------------------

test('hundra rosor ar INTE en stor final', () => {
  // Fem ganger den 18:e fick 100 x 1 coins nivan show — kvallens storsta firande for 100 coins.
  // Molnet levererar det som coins:100 (summan) och count:100. Totalvardet ar 100, alltsa burst.
  // Det ar fortfarande ett firande, men inte finalen.
  const { niva } = boot();
  assert.equal(niva({ coins: 100, count: 100 }), 'burst');
});

test('combon far ALDRIG multipliceras in i coins — det kvadrerar varje serie', () => {
  // normalizer.js:159 satter coins = coinsEach * repeatCount, sa summan ar redan klar. Gangrade vi
  // med combon igen blev hundra rosor 100 x 100 = 10 000 och fick precis den final de ska bli av
  // med. Samma varning star i stream-stats.js:53. Forsta versionen av den har koden gjorde det.
  const { niva } = boot();
  assert.equal(niva({ coins: 100, count: 100 }), 'burst', 'kvadrerat hade gett show');
  assert.equal(niva({ coins: 50, count: 50 }), 'single', 'kvadrerat hade gett show');
});

test('antalet tryck ensamt lyfter ingen niva nar beloppet ar kant', () => {
  // Den gamla regeln: combo>=10 -> burst, combo>=100 -> show, oavsett belopp.
  const { niva } = boot();
  assert.equal(niva({ coins: 10, count: 10 }), 'single', '10 rosor = 10 coins');
  assert.equal(niva({ coins: 50, count: 50 }), 'single', '50 rosor = 50 coins');
});

test('manga billiga gavor kan anda na en final — det ar summan som avgor', () => {
  // Regeln straffar inte den som ger mycket i manga sma steg: 1000 rosor ar 1000 coins.
  const { niva } = boot();
  assert.equal(niva({ coins: 1000, count: 1000 }), 'show');
  assert.equal(niva({ coins: 1200, count: 4 }), 'show');
});

// ---- reservvagen: okant belopp far aldrig tysta eller sanka ------------------------------------

test('editorns testknapp fungerar oforandrat — combo utan belopp', () => {
  // testFw skickar {combo, __test:true} och ALDRIG coins. Laste vi bara belopp hade knappens
  // "stor final" slutat fungera, och det utan felmeddelande.
  const { niva } = boot();
  assert.equal(niva({ combo: 100, __test: true }), 'show');
  assert.equal(niva({ combo: 10, __test: true }), 'burst');
  assert.equal(niva({ combo: 1, __test: true }), 'single');
});

test('ett event helt utan belopp faller tillbaka pa combon', () => {
  const { niva } = boot();
  assert.equal(niva({ count: 100 }), 'show');
  assert.equal(niva({}), 'single');
});

test('value som STRANG raknas inte som ett belopp', () => {
  // liveEventTriggers skriver gavans NAMN i `value` for gift-payloads (se kommentaren vid
  // fwBelopp). Tolkas den som en summa blir varje gava single, tyst.
  const { niva } = boot();
  assert.equal(niva({ value: 'Galaxy', combo: 100 }), 'show', 'strangen ska ignoreras, combon galla');
  assert.equal(niva({ value: 'Rose', coins: 1000, count: 1 }), 'show', 'coins vinner over strangen');
  assert.equal(niva({ value: 'Rose', coins: 50, count: 50 }), 'single', 'och kvadrerar inte heller');
});

test('diamondCount ar STYCKPRIS och far darfor gangras med combon', () => {
  // Raapayloaden fran bryggan bar gift.diamondCount per styck — till skillnad fran coins, som
  // molnet redan summerat. Ett event som gar den vagen maste multipliceras, annars blir en serie
  // pa hundra rosor felaktigt single.
  const { niva } = boot();
  assert.equal(niva({ diamondCount: 1000, count: 1 }), 'show');
  assert.equal(niva({ diamondCount: 1, count: 100 }), 'burst', '1 x 100 = 100');
  assert.equal(niva({ diamondCount: 5, count: 400 }), 'show', '5 x 400 = 2000');
});

// ---- hela kvallen, som den hade sett ut ---------------------------------------------------------

test('sandningen 2026-09-18 hade gett 13 finaler i stallet for 5 rosfinaler', () => {
  // De tretton storsta gavorna ur bandet, med sina riktiga varden och combon.
  const { niva } = boot();
  const stora = [5000, 3000, 2150, 1599, 1500, 1088, 1000, 1000, 1000, 1000, 1000, 1000, 1000];
  for (const v of stora) assert.equal(niva({ coins: v, count: 1 }), 'show', v + ' coins');
  // Och de fem som FICK finalen den kvallen var 100 rosor styck.
  assert.equal(niva({ coins: 100, count: 100 }), 'burst');
});
