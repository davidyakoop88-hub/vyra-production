'use strict';
// "GIFT CAMPAIGN — varfor kan jag inte byta gift-bilder"
//
// Kampanjen visar 1 till 6 gavor. campaignGiftCount() i media.js:244 klampar till Math.min(6,...)
// och egenskapspanelen erbjuder alla sex i sin <select>.
//
// Knappen "Valj bland alla TikTok-gifts" skapas av en loop som star pa fyra:
//
//   for(let i=0;i<4;i++){ let input=document.querySelector('#giftImage'+i), ... }
//
// Valjer man 5 eller 6 gavor far de tva sista alltsa ingen valjarknapp. Deras giftImage-falt
// forblir dessutom SYNLIGT, eftersom det ar samma loop som doljer det - sa de tva sista gavorna
// gar bara att andra genom att skriva en exakt sokvag som 'assets/gifts/events/8371_Lion.png'
// for hand. Skriver man ett namn far man platshallaren.
//
// Uppmatt med sex gavor: 6 giftImage-falt, 4 valjarknappar, tva falt kvar synliga.
//
// ROTT NU.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));

test.after(closeAll);

// Bygger kampanjens egenskapspanel med den RIKTIGA props()- och bind()-kedjan, sa som
// layout-safe.js gor det pa Layout-sidan.
function panel(giftCount) {
  const w = VyraWidgets.create('catalog:giftcampaign:neon:landscape');
  w.id = 'c1'; w.x = 10; w.y = 10; w.giftCount = giftCount;

  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout',
    state: { widgets: [w], projectName: 'picker' } });
  // VyraSafe behovs nar props()/wh() KORS, inte nar media.js laddas — darfor racker det att ladda
  // den har, efter harnessens egen kedja.
  h.load('overlay-sanitize.js');
  // Manifestet laddas efter media.js har, och det GAR eftersom campaignGiftList() ar en
  // funktion som laser window.VYRA_GIFTS vid anropet. Vore den en const, som forr, skulle
  // vardet vara last nar media.js laddades och valjaren stod tom.
  h.load('assets/gifts/gifts-manifest.js');

  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`state.widgets.length=0;state.widgets.push(${JSON.stringify(w)});selected='c1';view='editor';`);
  run(`document.querySelector('#view').innerHTML='<div class="editor-shell"><div class="canvas">'
    +wh(state.widgets[0])+'</div><div class="properties">'+props()+'</div></div>';bind();`);
  return h;
}

const falt = h => [...h.document.querySelectorAll('[id^="giftImage"]')];
const knappar = h => h.document.querySelectorAll('.open-gift-picker').length;

// ---- buggen ---------------------------------------------------------------------------------------
for (const antal of [5, 6]) {
  test(`${antal} gavor: varje gava har en valjarknapp`, () => {
    const h = panel(antal);

    assert.equal(falt(h).length, antal, 'panelen ritade fel antal giftImage-falt');
    assert.equal(knappar(h), antal,
      `${antal} gavor men bara ${knappar(h)} valjarknappar — de sista gavorna gar bara att ` +
      'andra genom att skriva en exakt filsokvag for hand');
  });

  test(`${antal} gavor: inget rat sokvagsfalt lamnas synligt`, () => {
    const h = panel(antal);
    const synliga = falt(h).filter(i => {
      const l = i.closest('label');
      return l && l.style.display !== 'none';
    }).map(i => i.id);

    assert.deepEqual(synliga, [],
      `dessa falt visar en ra sokvag i stallet for en valjare: ${synliga.join(', ')}`);
  });
}

// ---- att valjaren faktiskt byter bilden ------------------------------------------------------------
test('ett val i valjaren byter bade bild och namn, och ritas ut', () => {
  const h = panel(6);
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`
    window.__valt = {};
    try {
      // Sista gavan — den som saknade knapp.
      const knapp = document.querySelectorAll('.open-gift-picker')[5];
      __valt.knappFanns = !!knapp;
      if (knapp) {
        knapp.onclick();
        const val = document.querySelectorAll('.gift-picker-modal section button');
        __valt.antalValbara = val.length;
        if (val.length > 3) {
          val[3].onclick();
          __valt.bild = state.widgets[0].giftImage5;
          __valt.namn = state.widgets[0].giftName5;
        }
      }
    } catch (e) { __valt.fel = e.message }
  `);
  const ut = h.window.__valt || {};

  assert.ok(ut.knappFanns, 'gava 6 hade ingen valjarknapp att klicka pa');
  assert.ok(ut.bild && ut.bild.startsWith('assets/gifts/events/'),
    `giftImage5 blev ${JSON.stringify(ut.bild)} — valet nadde inte widgeten`);
  assert.ok(ut.namn, 'namnet foljde inte med bilden');
});

// ---- det som MASTE fortsatta fungera ---------------------------------------------------------------
test('fyra gavor fungerar precis som forut', () => {
  const h = panel(4);

  assert.equal(falt(h).length, 4);
  assert.equal(knappar(h), 4, 'det vanliga fallet far inte ga sonder');
  assert.deepEqual(falt(h).filter(i => i.closest('label').style.display !== 'none').map(i => i.id), [],
    'alla fyra sokvagsfalt ska vara dolda bakom sin valjare');
});

test('en gava ger en valjare, inte fyra', () => {
  const h = panel(1);

  assert.equal(falt(h).length, 1);
  assert.equal(knappar(h), 1, 'loopen far inte skapa knappar for gavor som inte visas');
});
