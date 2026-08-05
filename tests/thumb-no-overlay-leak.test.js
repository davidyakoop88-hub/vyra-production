'use strict';
// Katalogen far aldrig andra anvandarens layout.
//
// Vad som hande: en synlighetsregel for katalogkorten rullades ut sa att alerts skulle synas i sina
// miniatyrer i stallet for att visa tomma rutor. Kort darefter lag en Gift Fireworks, en Battle MVP
// och Top Gifters testtext och syntes i OBS utan att nagot triggats.
//
// Regeln var INTE orsaken. Den ar scopad till .overlay-widget-gallery ... .owg-thumb-inner och kan
// inte matcha nagot pa overlayen. Uppmatt i den inloggade Studion:
//
//   state.widgets   []
//   localStorage    templateGiftFireworks, templateBattleMvp, templateTopLike, templateTopGift
//
// Minnet tomt och disken full ar signaturen for att nagot anropat kortets RIKTIGA
// lagg-till-handler. Handlern sparar; angringen aterstallde bara state.widgets. Widgetarna lag
// alltsa pa riktigt i layouten och renderade helt korrekt — de skulle bara aldrig ha hamnat dar.
//
// TVA VAGAR IN, BADA BORTTAGNA:
//   owgRenderCardThumb  ->  else if (btn._owgOriginalClick)      (sista utvag for kort utan nyckel)
//   Preview-knappen     ->  overlayCatalogPreviewHtml(originalClick)
//
// Bada gick via overlayCatalogPreviewHtml, som ar borta. Bade miniatyren och Preview bygger nu
// widgeten ur kortets katalognyckel.
//
// VARFOR VAKTEN INTE FYRADE
//
// Den gamla vakten kollade state.widgets och localStorage efter att miniatyrerna ritats, och var
// gron. Den KAN inte falla: jsdom har ingen Web Locks-implementation, sa session-state faller
// tillbaka pa read-only och save() skriver aldrig. En lackage som gar via save() ar osynlig i den
// riggen, hur ratt matningen an ser ut.
//
// Testerna nedan mater darfor HANDLINGEN i kallan, inte resultatet i en rigg som inte kan spara.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const KALLA = fs.readFileSync(path.join(ROOT, 'overlay-preview.js'), 'utf8');

test('ingen katalogvag anropar kortets lagg-till-handler', () => {
  const rader = KALLA.split(/\r?\n/)
    .map((r, i) => ({ r, i: i + 1 }))
    .filter(x => !/^\s*(\/\/|\*)/.test(x.r))
    .filter(x => /originalClick\s*\(\s*\)/.test(x.r) || /overlayCatalogPreviewHtml\s*\(/.test(x.r))
    .map(x => x.i + ': ' + x.r.trim().slice(0, 90));

  assert.deepEqual(rader, [],
    'dessa rader kan skriva widgets till anvandarens layout:\n  ' + rader.join('\n  '));
});

test('torrkorningsfunktionen finns inte kvar', () => {
  assert.equal(/function overlayCatalogPreviewHtml/.test(KALLA), false,
    'overlayCatalogPreviewHtml ar tillbaka — den anropar kortets riktiga handler och sparar');
});

test('miniatyr och Preview bygger bada ur katalognyckeln', () => {
  assert.match(KALLA, /function overlayPreviewWidget/, 'resolvern saknas');
  const anvandningar = (KALLA.match(/overlayPreviewWidget\s*\(/g) || []).length;
  assert.ok(anvandningar >= 3,
    `overlayPreviewWidget anvands bara ${anvandningar} ganger — bade ` +
    'owgRenderCardThumb och Preview-knappen ska ga via den');
});

test('kravet som gor torrkorningen umbarlig star kvar', () => {
  const katalogtest = fs.readFileSync(path.join(ROOT, 'tests', 'catalog-truth.test.js'), 'utf8');
  assert.match(katalogtest, /varje katalogknapp bar en katalognyckel/,
    'utan det kravet vore borttagningen en forsamring i stallet for en fix');
});

// Miniatyrernas synlighetsregel ar UTBACKAD. Den gjorde att alerts syntes i sina kort, men
// rullades tillbaka nar widgets dok upp i overlayen — innan orsaken var klarlagd. Orsaken visade
// sig vara en annan, men regeln aterinfors inte har: det ar en egen andring som ska verifieras i
// OBS for sig. Tills dess visar alert-korten en tom ruta, vilket ar kosmetiskt.
//
// En bredare vakt provades — "ingen regel far tvinga visibility:visible utanfor en miniatyr" —
// men den flaggar de legitima triggerreglerna, .battle-mvp.mvp-active och dess slaktingar, som
// ar precis det som SKA tanda en alert nar den spelar. Den precisa vakten ar den ovan: ingen
// katalogvag far anropa lagg-till-handlern.
