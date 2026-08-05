'use strict';
// De sista elva katalogknapparna utan nyckel.
//
// Nar testriggen fick ladda custom-widgets.js, last-x-alerts.js och gift-fireworks.js gick den
// fran 14 till 17 sektioner - samma antal som webblasaren visar - och gapet blev synligt:
//
//   GIFT FIREWORKS                        3 av 3 utan nyckel
//   LAST-X ALERTS · VARJE DESIGN SEPARAT  5 av 5
//   EGET INNEHALL                         3 av 3
//
// Kravet "varje knapp bar en nyckel" hade varit gront hela tiden eftersom riggen aldrig laddade
// filerna som bygger de har sektionerna. Det ar samma sorts hal som vakten "katalogen byggs alls"
// fangar, en niva upp: vakten kontrollerar att katalogen byggs, inte att HELA katalogen byggs.
//
// Samma krav som for de 28 forra: en widget ur fabriken maste bli EXAKT det knappen byggde forut,
// falt for falt.
//
// ROTT NU.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));

// Exakt vad knapparna byggde innan andringen.
const GAMLA = {
  'catalog:lastx:card': { type: 'templateLastX', x: 100, y: 80, width: 500, title: 'Last-X Alerts',
    lastXType: 'all', lastXDesign: 'card', lastXEntrance: 'slide-left', followDuration: 5 },
  'catalog:lastx:stack': { type: 'templateLastX', x: 100, y: 80, width: 500, title: 'Last-X Alerts',
    lastXType: 'all', lastXDesign: 'stack', lastXEntrance: 'slide-left', followDuration: 5 },
  'catalog:lastx:skew': { type: 'templateLastX', x: 100, y: 80, width: 500, title: 'Last-X Alerts',
    lastXType: 'all', lastXDesign: 'skew', lastXEntrance: 'slide-left', followDuration: 5 },
  'catalog:lastx:badge': { type: 'templateLastX', x: 100, y: 80, width: 500, title: 'Last-X Alerts',
    lastXType: 'all', lastXDesign: 'badge', lastXEntrance: 'slide-left', followDuration: 5 },
  'catalog:lastx:royal': { type: 'templateLastX', x: 100, y: 80, width: 500, title: 'Last-X Alerts',
    lastXType: 'all', lastXDesign: 'royal', lastXEntrance: 'slide-left', followDuration: 5 },

  'catalog:custom:text': { type: 'templateCustomText', x: 60, y: 120, width: 420, height: 90,
    customText: 'Skriv din text här' },
  'catalog:custom:image': { type: 'templateCustomImage', x: 60, y: 120, width: 300, height: 300 },
  'catalog:custom:video': { type: 'templateCustomVideo', x: 60, y: 120, width: 300, height: 450 },

  'catalog:giftfireworks:magnetic': { type: 'templateGiftFireworks', x: 80, y: 950, width: 360,
    title: 'Gift Fireworks', fwMotion: 'magnetic', fwMin: 1, fwSpeed: 0.6, fwDuration: 5,
    fwGiftSize: 110, fwExplosion: 100, fwDensity: 70, fwColor: '#ff4fa3', fwColor2: '#ffd45b', fwSound: true },
  'catalog:giftfireworks:spiral': { type: 'templateGiftFireworks', x: 80, y: 950, width: 360,
    title: 'Gift Fireworks', fwMotion: 'spiral', fwMin: 1, fwSpeed: 0.6, fwDuration: 5,
    fwGiftSize: 110, fwExplosion: 100, fwDensity: 70, fwColor: '#ff4fa3', fwColor2: '#ffd45b', fwSound: true },
  'catalog:giftfireworks:bloom': { type: 'templateGiftFireworks', x: 80, y: 950, width: 360,
    title: 'Gift Fireworks', fwMotion: 'bloom', fwMin: 1, fwSpeed: 0.6, fwDuration: 5,
    fwGiftSize: 110, fwExplosion: 100, fwDensity: 70, fwColor: '#ff4fa3', fwColor2: '#ffd45b', fwSound: true }
};

const utanId = w => { const k = { ...w }; delete k.id; delete k.createdFrom; return k };

test('alla elva nycklar gar att skapa', () => {
  const fel = [];
  for (const nyckel of Object.keys(GAMLA)) {
    try { VyraWidgets.create(nyckel) } catch (e) { fel.push(nyckel + ': ' + e.message) }
  }
  assert.deepEqual(fel, [], 'dessa loser inte upp:\n  ' + fel.join('\n  '));
});

test('varje widget ur fabriken ar identisk med den knappen byggde', () => {
  const avvikande = [];
  for (const [nyckel, gammal] of Object.entries(GAMLA)) {
    let fran; try { fran = utanId(VyraWidgets.create(nyckel)) } catch (e) { avvikande.push(nyckel); continue }
    try { assert.deepEqual(fran, gammal) } catch (e) { avvikande.push(nyckel) }
  }
  assert.deepEqual(avvikande, [],
    `dessa skiljer sig fran vad knappen byggde forut: ${avvikande.join(', ')} — ` +
    'befintliga anvandare skulle da fa nagot annat an de ar vana vid');
});

test('en okand variant kastar i stallet for att bygga nagot tomt', () => {
  assert.throws(() => VyraWidgets.create('catalog:lastx:finnsinte'), /Okänd/);
  assert.throws(() => VyraWidgets.create('catalog:custom:finnsinte'), /Okänd/);
  assert.throws(() => VyraWidgets.create('catalog:giftfireworks:finnsinte'), /Okänd/);
});

test('de tre familjerna ger tre olika widgettyper', () => {
  // Ett rent sanity-krav: skulle tva familjer bygga samma typ hade en av dem varit onodig.
  const typer = new Set(Object.keys(GAMLA).map(n => VyraWidgets.create(n).type));
  assert.equal(typer.size, 5,
    `hittade ${typer.size} typer: ${[...typer].join(', ')} — vantade templateLastX, tre custom och fireworks`);
});
