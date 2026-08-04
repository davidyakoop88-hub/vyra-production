'use strict';
// LAGER 5 — regressionsfuzz. 1000 events i slumpad ordning mot den riktiga widgetkoden.
//
// Tre egenskaper som maste halla oavsett ordning, upprepning eller antal:
//
//   1. En kampanjsiffra gar aldrig BAKAT. En tittare som ser 80 och sedan 1 tror att nagot gick
//      sonder — och har ratt.
//   2. Duplicerade events skapar aldrig duplicerade DOM-noder.
//   3. Livevagen anropar aldrig save() eller render(). En full omritning per event river ner
//      animationer och skriver state hundratals ganger under en combo (bugg A1).
//
// Slumpen ar seedad. Ett fel som bara intraffar i en av tusen ordningar ska ga att kora om exakt,
// annars ar felrapporten vardelos.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');

test.after(closeAll);

// Deterministisk PRNG — Math.random gar inte att reproducera fran en felrapport.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 };
}

const GIFTS = ['Rose', 'Galaxy', 'Lion', 'TikTok Universe'];
const USERS = ['wpwer17', 'mia_l', 'leo_s', 'sara_s', 'piiikabom'];

function makeEvent(rand, i) {
  const r = rand();
  const user = USERS[Math.floor(rand() * USERS.length)];
  if (r < 0.7) {
    return { type: 'gift', giftName: GIFTS[Math.floor(rand() * GIFTS.length)], username: user,
      coins: Math.floor(rand() * 5000) + 1, count: Math.floor(rand() * 50) + 1, id: 'e' + i };
  }
  if (r < 0.85) return { type: 'like', username: user, count: Math.floor(rand() * 100) + 1, id: 'e' + i };
  return { type: 'follow', username: user, id: 'e' + i };
}

// Overlay-lage, inte editorlage. ph() i media.js:57 ar `value ?? (VYRA_OVERLAY ? 0 : placeholder)`
// — en osatt raknare visar en demosiffra i editorn men NOLL i overlayen. Egenskapen "sjunker
// aldrig" galler det tittarna ser, alltsa overlayen. I editorn ar 80 -> 1 en platshallare som ger
// plats at riktig data, vilket ar vad en platshallare ska gora.
function boot(widgets) {
  const h = createDom({ url: 'https://vyralive.app/studio.html?overlay=1',
    state: { widgets, projectName: 'fuzz' } });
  h.load('overlay-sanitize.js');
  h.load('gift-event-images.js');
  const canvas = h.paint(widgets);
  const script = h.document.createElement('script');
  script.textContent = `state.widgets.length=0;state.widgets.push(...${JSON.stringify(widgets)})`;
  h.document.body.append(script);
  let saves = 0, renders = 0;
  h.window.save = () => { saves += 1 };
  h.window.render = () => { renders += 1 };
  const fire = detail => h.window.dispatchEvent(new h.window.CustomEvent('vyra-live-event', { detail }));
  return { h, canvas, fire, counts: () => ({ saves, renders }) };
}

// En kampanj skapad som anvandaren skapar den — ur fabriken, inte handknackad. En handknackad
// fixtur med giftCurrent0: 0 doljer den verkliga bilden: en NY kampanj har faltet osatt, och
// campaignItems() faller da tillbaka pa en demosiffra. Testet ska mota verkligheten, inte en
// bekvam variant av den.
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));
const campaign = id => {
  const w = VyraWidgets.create('catalog:giftcampaign:neon:landscape');
  w.id = id; w.x = 10; w.y = 10; w.giftCount = 4;
  return w;
};

// ---- 1. siffror gar aldrig bakat --------------------------------------------------------------------
test('1000 events i slumpad ordning far aldrig en kampanjsiffra att sjunka', () => {
  // En seed racker inte: egenskapen ska halla for VARJE ordning. Med en enda seed passerade det
  // har testet av ren tur — forsta matchande gavan rakade ha hogt antal och maskerade fallet.
  const drops = [];
  for (const seed of [1, 42, 20260805, 999983, 7]) {
    const local = boot([campaign('c1')]);
    const readSlot = () => {
      const b = local.canvas.querySelector('[data-id="c1"] .campaign-gifts article span b');
      return b ? Number(b.textContent) : null;
    };
    const rand = rng(seed);
    let previous = readSlot();
    for (let i = 0; i < 200; i += 1) {
      local.fire(makeEvent(rand, i));
      const now = readSlot();
      if (previous != null && now != null && now < previous) drops.push({ seed, i, previous, now });
      previous = now;
    }
  }
  assert.deepEqual(drops.slice(0, 1), [],
    `siffran sjonk ${drops.length} ganger; forst seed ${drops[0]?.seed} event ${drops[0]?.i}: ` +
    `${drops[0]?.previous} -> ${drops[0]?.now}`);
});

// ---- 2. dubbletter skapar inte dubbla noder ---------------------------------------------------------
test('samma event om och om igen skapar aldrig fler DOM-noder', () => {
  const env = boot([campaign('c1')]);
  const before = env.canvas.querySelectorAll('[data-id="c1"] .campaign-gifts article').length;
  const one = { type: 'gift', giftName: 'Rose', username: 'wpwer17', coins: 10, count: 1, id: 'samma' };
  for (let i = 0; i < 300; i += 1) env.fire(one);
  const after = env.canvas.querySelectorAll('[data-id="c1"] .campaign-gifts article').length;
  assert.equal(after, before, `antalet platser gick fran ${before} till ${after}`);
  assert.equal(env.canvas.querySelectorAll('[data-id="c1"]').length, 1, 'widgeten dubblerades');
});

// ---- 3. livevagen sparar inte och ritar inte om -------------------------------------------------------
test('1000 events ger noll save() och noll render()', () => {
  const env = boot([campaign('c1')]);
  const rand = rng(7);
  for (let i = 0; i < 1000; i += 1) env.fire(makeEvent(rand, i));
  const { saves, renders } = env.counts();
  assert.equal(renders, 0, `${renders} omritningar — varje en river ner animationerna som spelar`);
  assert.equal(saves, 0, `${saves} sparningar under en enda sandning`);
});

// ---- 4. ingen ordning far ge ett negativt eller NaN-varde --------------------------------------------
test('inget varde blir NaN eller negativt, oavsett seed', () => {
  for (const seed of [1, 42, 20260805, 999983]) {
    const env = boot([campaign('c1')]);
    const rand = rng(seed);
    for (let i = 0; i < 250; i += 1) env.fire(makeEvent(rand, i));
    const b = env.canvas.querySelector('[data-id="c1"] .campaign-gifts article span b');
    const value = Number(b?.textContent);
    assert.ok(Number.isFinite(value) && value >= 0, `seed ${seed} gav vardet "${b?.textContent}"`);
  }
});

// Editorns platshallare ar avsiktlig och far inte forvaxlas med buggen ovan. Testet star har sa att
// nagon som ser 80 -> 1 i editorn kan lasa varfor i stallet for att jaga ett spoke.
test('editorns demosiffra ger plats at riktig data — och det ar meningen', () => {
  const h = createDom({ url: 'https://vyralive.app/studio.html',
    state: { widgets: [campaign('c9')], projectName: 'editor' } });
  h.load('overlay-sanitize.js'); h.load('gift-event-images.js');
  const w = campaign('c9');
  const canvas = h.paint([w]);
  const script = h.document.createElement('script');
  script.textContent = 'state.widgets.length=0;state.widgets.push(' + JSON.stringify(w) + ')';
  h.document.body.append(script);
  const read = () => canvas.querySelector('[data-id="c9"] .campaign-gifts article span b')?.textContent;
  assert.notEqual(read(), '0', 'editorn ska visa en demosiffra sa en ny kampanj inte ser tom ut');
  h.window.dispatchEvent(new h.window.CustomEvent('vyra-live-event',
    { detail: { type: 'gift', giftName: w.giftName0 || 'Rose', username: 'u', coins: 1, count: 1 } }));
  assert.equal(read(), '1', 'forsta riktiga gavan ska ersatta platshallaren, inte adderas till den');
});
