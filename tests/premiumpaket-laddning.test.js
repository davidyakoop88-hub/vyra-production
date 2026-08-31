'use strict';
// #135: en lat laddare som ingen anropade — och varfor den IVRIGA laddningen far sta kvar.
//
// `ensureHomePremiumBundle()` sag ut att vara mekanismen bakom framsidans premiumpanel. Den var
// dod kod. Sa var hela familjen: fem `ensure*Bundle()`, plus `vyraLoadBundle`, `refreshIfVisible`
// och de tva ladd-hjalparna. Raknat i hela repot hade var och en av de fem exakt EN forekomst —
// sin egen definition.
//
// Det farliga med dod kod som ser ut som en mekanism ar inte kilobyten. Det ar att nasta lasare
// tror att den kors, och felsoker fel stalle.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('ingen oanvand ensure*Bundle-laddare har kommit tillbaka', () => {
  // Definition MINUS anrop. En laddare som faktiskt anropas nagonstans ar valkommen; en som bara
  // definieras ar en fallucka for nasta lasare.
  const kallor = fs.readdirSync(ROOT).filter(f => f.endsWith('.js'))
    .map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
  const alltJs = kallor.map(([, s]) => s).join('\n') + las('studio.html');
  const doda = [];
  for (const [, kod] of kallor) {
    for (const [, namn] of kod.matchAll(/function\s+(ensure\w*Bundle)\s*\(/g)) {
      const forekomster = (alltJs.match(new RegExp('\b' + namn + '\b', 'g')) || []).length;
      if (forekomster <= 1) doda.push(namn);
    }
  }
  assert.deepEqual(doda, [],
    'dessa laddare definieras men anropas aldrig: ' + doda.join(', '));
});

test('premiumpaketet laddas fortfarande ivrigt', () => {
  // Villkoret ar inte estetiskt. Se nasta prov for skalet.
  const media = las('media.js');
  const rad = media.split(/\r?\n/).find(l => l.includes("js.src='overview-premium.js"));
  assert.ok(rad, 'overview-premium.js laddas inte langre av media.js');
  assert.doesNotMatch(rad, /view\s*===?\s*'home'/,
    'laddningen har gjorts beroende av att anvandaren star pa Oversikt — da tappas varje '
    + 'live-handelse som kommer innan dess');
});

test('skalet: lyssnaren sitter pa modulniva, inte i renderingen', () => {
  // Det HAR ar varfor laddningen maste vara ivrig. Bufferten borjar fyllas nar skriptet laddas.
  // Flyttas lyssnaren in i en renderingsfunktion forsvinner skalet — och da faller det har provet
  // i stallet for att pulsen tyst blir tom i drift.
  const kod = las('overview-premium.js');
  const forePuls = kod.slice(0, kod.indexOf("addEventListener('vyra-live-event'"));
  const oppna = (forePuls.match(/\{/g) || []).length, stangda = (forePuls.match(/\}/g) || []).length;
  assert.ok(oppna - stangda <= 1,
    'vyra-live-event-lyssnaren ligger nu inuti en funktion (klammerdjup ' + (oppna - stangda)
    + '). Da fylls bufferten forst nar den funktionen kors, och den ivriga laddningen tappar sitt skal.');
});

test('OBS-overlayen betalar inte for framsidans paket', () => {
  // Issuet antog att den ivriga laddningen traffade OBS-kallor. Den gor inte det: overlay.html
  // laddar inte media.js alls. Kostnaden ar en studioanvandare som gar rakt till editorn.
  assert.doesNotMatch(las('overlay.html'), /media\.js/,
    'overlay.html laddar media.js — da betalar varje OBS-kalla for framsidans premiumpaket, '
    + 'och den ivriga laddningen maste omprovas');
});
