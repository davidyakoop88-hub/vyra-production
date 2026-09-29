'use strict';
// NIVAN SKA FOLJA GAVANS VARDE, OCH GRANSEN SKA VARA EN ANNAN SIFFRA AN TRAPPAN.
//
// UPPMATT I DAVIDS SANDNING 2026-09-18 (197 gavor, bandet i tiktok-bridge/inspelningar):
// fwLevelOf las `comboCount`, alltsa hur manga ganger samma gava tryckts, och aldrig vad den var
// vard. Resultatet blev omvant mot avsikten:
//
//   alla 11 tandningar som nadde burst eller show var 1-coins-gavor
//   de fem "stor final" pa 18 s var tillsammans varda 500 coins
//   23 gavor varda 26 536 coins - darav en pa 5000 - korde alla nivan single
//
// 94 % av kvallen korde single. En tittare som skickade 5000 coins fick exakt samma sex sekunder
// som den som tryckte en ros.
//
// FORSTA FORSOKET LOSTE HALVA PROBLEMET. Da raknades trappan ur fwMin: firande vid 10 x
// minimum, final vid 100 x. David sag felet direkt - "den ska funka fran 1 coins gift". Mat pa
// hans eget band:
//
//   fwMin=1  (trappa 10/100)    197 tandningar, varav 49 STORA FINALER pa tva timmar
//   fwMin=10 (trappa 100/1000)   60 tandningar, varav 13 finaler
//
// Han vill ha forsta radens grans och andra radens trappa. Med EN siffra gar det inte: hojer man
// den for att gora finalen sallsynt slutar 1-mynts-gavan tanda nagot alls.
//
// REGELN BLEV: `fwMin` ar GRANSEN och ingenting annat. `fwFinal` ar vad en stor final kostar,
// och firandet ligger pa en tiondel darav. En siffra att stalla in, inte tva, och de kan inte
// hamna i fel ordning.
//
// TROSKLARNA I SJALVA ANIMATIONEN ANDRAS INTE. Det finns tre stallen som delar pa 1/10/100-skalan
// (fwLevelOf, fwSequence canvas-duration, buildComboRockets raketantal), och att andra alla tre
// hade varit tre chanser att missa en. I stallet oversatts varde till samma skala FORE den — da
// rors ingen av de tre, och editorns testknapp, som skickar en ren combo utan belopp, beter sig
// precis som forr.
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

// Utan fwTheme ar widgeten INTE ett canvas-tema, sa speltiden blir fwDuration + nivans lead:
//   single 5 + 0 = 5,0 s      burst 5 + 0,9 = 5,9 s      show 5 + 4,2 = 9,2 s
// TYST ar inte en niva: en gava under gransen tander ingenting, och da finns ingen widget att
// rakna speltid for - durationFor ger 0.
const SINGLE = 5000, BURST = 5900, SHOW = 9200;
const namn = ms => ms === SHOW ? 'show' : ms === BURST ? 'burst' : ms === SINGLE ? 'single' : ms + 'ms';

function boot(widgets = [fw()]) {
  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout',
    state: { widgets, projectName: 'fw' } });
  h.load('overlay-sanitize.js');
  h.load('gift-fireworks.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`state.widgets.length=0;${widgets.map(w => `state.widgets.push(${JSON.stringify(w)})`).join(';')};view='editor';`);
  // Canvasen maste finnas i DOM:en for att `tande` ska betyda nagot: fwTrigger letar upp
  // [data-id=...] .gift-fireworks-fx och returnerar false om ingen nod finns — da hade provet
  // sagt "tande inte" aven nar gransen slappte igenom, och matt riggen i stallet for regeln.
  run(`document.querySelector('#view').innerHTML='<div class="editor-shell"><div class="canvas">'
    +state.widgets.map(wh).join('')+'</div></div>';`);
  return {
    h,
    niva: input => namn(Math.round(h.window.VyraFireworks.durationFor(input))),
    // Tande den over huvud taget? Granen, till skillnad fran trappan.
    tande: input => h.window.triggerGiftFireworks(input) !== false
  };
}

// ---- gransen och trappan ar OBEROENDE -----------------------------------------------------------

test('en gava pa 1 mynt tander fortfarande — gransen ar fwMin, inte trappan', () => {
  // Davids krav, ordagrant: "den ska funka fran 1 coins gift". Med fwMin=1 ska ingenting filtreras
  // bort, hur hogt fwFinal an star.
  const { tande, niva } = boot([fw({ fwMin: 1, fwFinal: 1000 })]);
  assert.equal(tande({ coins: 1, count: 1 }), true, 'en 1-mynts-gava tande inget alls');
  assert.equal(niva({ coins: 1, count: 1 }), 'single');
});

test('att gora finalen sallsynt far INTE tysta de sma gavorna', () => {
  // Det var precis det som hande nar en och samma siffra gjorde bada jobben.
  for (const final of [1000, 5000, 50000]) {
    const { tande } = boot([fw({ fwMin: 1, fwFinal: final })]);
    assert.equal(tande({ coins: 1, count: 1 }), true, `fwFinal=${final} tystade 1-mynts-gavan`);
  }
});

test('gransen tystar under sitt varde, oberoende av trappan', () => {
  const { tande } = boot([fw({ fwMin: 50, fwFinal: 1000 })]);
  assert.equal(tande({ coins: 49, count: 1 }), false, '49 mynt ligger under gransen 50');
  assert.equal(tande({ coins: 50, count: 1 }), true);
});

// ---- trappan raknas ur fwFinal ------------------------------------------------------------------

test('standardtrappan ar 100 och 1000', () => {
  // De varden matningen av sandningen 2026-09-18 pekade ut som ratt for Davids kanal.
  const { niva } = boot([fw({ fwMin: 1 })]);           // fwFinal osatt -> 1000
  assert.equal(niva({ coins: 99, count: 1 }), 'single');
  assert.equal(niva({ coins: 100, count: 1 }), 'burst');
  assert.equal(niva({ coins: 999, count: 1 }), 'burst');
  assert.equal(niva({ coins: 1000, count: 1 }), 'show');
});

test('firandet ligger alltid pa en tiondel av finalen', () => {
  for (const [final, burst] of [[1000, 100], [5000, 500], [200, 20]]) {
    const { niva } = boot([fw({ fwMin: 1, fwFinal: final })]);
    assert.equal(niva({ coins: burst - 1, count: 1 }), 'single', `final ${final}`);
    assert.equal(niva({ coins: burst, count: 1 }), 'burst', `final ${final}`);
    assert.equal(niva({ coins: final, count: 1 }), 'show', `final ${final}`);
  }
});

test('en stor kanal lyfter hela trappan med EN siffra', () => {
  const { niva } = boot([fw({ fwMin: 1, fwFinal: 10000 })]);
  assert.equal(niva({ coins: 999, count: 1 }), 'single');
  assert.equal(niva({ coins: 1000, count: 1 }), 'burst');
  assert.equal(niva({ coins: 10000, count: 1 }), 'show');
});

test('tva fyrverkerier med olika final far olika niva pa SAMMA gava', () => {
  // Att fa ha flera med olika installningar ar en avsiktlig funktion. Darfor raknas styrkan per
  // widget och inte en gang for alla — durationFor tar den langsta, alltsa den med lagst final.
  const { niva } = boot([fw({ id: 'lag', fwFinal: 100 }), fw({ id: 'hog', fwFinal: 10000 })]);
  assert.equal(niva({ coins: 100, count: 1 }), 'show', 'den med final 100 ska gora final av 100 mynt');
});

test('en saknad eller orimlig final blir 1000', () => {
  for (const final of [undefined, 0, -5, 'tolv']) {
    const { niva } = boot([fw({ fwMin: 1, fwFinal: final })]);
    assert.equal(niva({ coins: 1000, count: 1 }), 'show', `fwFinal=${JSON.stringify(final)}`);
    assert.equal(niva({ coins: 99, count: 1 }), 'single', `fwFinal=${JSON.stringify(final)}`);
  }
});

test('fwMin paverkar INTE nivan', () => {
  // Vakten mot att de tva siffrorna kopplas ihop igen. Samma gava, samma final, olika grans.
  for (const min of [1, 10, 100]) {
    const { niva } = boot([fw({ fwMin: min, fwFinal: 1000 })]);
    assert.equal(niva({ coins: 1000, count: 1 }), 'show', `fwMin=${min}`);
    assert.equal(niva({ coins: 100, count: 1 }), 'burst', `fwMin=${min}`);
  }
});

// ---- det som var hela felet ---------------------------------------------------------------------

test('en enda gava pa 5000 mynt ger show — inte single som i sandningen', () => {
  // Kl. 20:09 den 18:e. combo=1, sa den gamla regeln gav single.
  const { niva } = boot();
  assert.equal(niva({ coins: 5000, count: 1 }), 'show');
});

test('antalet tryck ensamt lyfter ingen niva nar beloppet ar kant', () => {
  // Den gamla regeln: combo>=10 -> burst, combo>=100 -> show, oavsett belopp.
  const { niva } = boot();
  assert.equal(niva({ coins: 10, count: 10 }), 'single', '10 rosor = 10 mynt');
  assert.equal(niva({ coins: 50, count: 50 }), 'single', '50 rosor = 50 mynt');
});

test('combon far ALDRIG multipliceras in i coins — det kvadrerar varje serie', () => {
  // normalizer.js:159 satter coins = coinsEach * repeatCount, sa summan ar redan klar. Gangrade vi
  // med combon igen blev hundra rosor 100 x 100 = 10 000. Samma varning star i stream-stats.js:53.
  // Forsta versionen av den har koden gjorde precis det.
  const { niva } = boot();
  assert.equal(niva({ coins: 100, count: 100 }), 'burst', 'kvadrerat hade gett show');
  assert.equal(niva({ coins: 50, count: 50 }), 'single', 'kvadrerat hade gett show');
});

test('manga billiga gavor kan anda na en final — det ar summan som avgor', () => {
  // Regeln straffar inte den som ger mycket i manga sma steg: 1000 rosor ar 1000 mynt.
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
  assert.equal(niva({ diamondCount: 5, count: 400 }), 'show', '5 x 400 = 2000, antalet far inte klampas till 100');
});

// ---- hela kvallen, som den hade sett ut ---------------------------------------------------------

test('sandningen 2026-09-18 hade gett 13 finaler i stallet for 5 rosfinaler', () => {
  // De tretton storsta gavorna ur bandet, med sina riktiga varden och combon. fwMin=1, sa varenda
  // gava fran 1 mynt och uppat tande fortfarande — det ar bara FIRANDET som blivit sallsynt.
  const { niva, tande } = boot([fw({ fwMin: 1, fwFinal: 1000 })]);
  const stora = [5000, 3000, 2150, 1599, 1500, 1088, 1000, 1000, 1000, 1000, 1000, 1000, 1000];
  for (const v of stora) assert.equal(niva({ coins: v, count: 1 }), 'show', v + ' mynt');
  // Och de fem som FICK finalen den kvallen var 100 rosor styck, alltsa 100 mynt.
  assert.equal(niva({ coins: 100, count: 100 }), 'burst');
  // De 146 rosorna tander fortfarande, de firas bara inte.
  assert.equal(tande({ coins: 1, count: 1 }), true);
});
