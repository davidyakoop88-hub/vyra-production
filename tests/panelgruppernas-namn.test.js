'use strict';
// SAMMA SAK SKA HETA SAMMA SAK I PANELEN — RÖTT FÖRST (2026-09-09).
//
// DAVIDS ORD efter jämförelsen med Tiktory: "vi har mer men ändå ser kaos ut". En av orsakerna var
// att panelens grupper hette olika saker i olika widgets. Uppmätt 2026-09-09:
//
//   position   POSITION & STORLEK (23 filer) · POSITION OCH STORLEK (1) · POSITION + STORLEK (1)
//   innehåll   INNEHÅLL (16) · ALLMÄNT · GENERAL · EVENT · TEXT · VILKA SKA VISAS · CLEAN · VÄNSTER
//
// Provet låser de två fall där skillnaden är ren inkonsekvens och inget annat: positionsgruppens
// namn, och att ingen rubrik är på engelska. Widgetspecifika rubriker ("VIDEO PER NIVÅ",
// "GIFT EDITOR · VISA / TA BORT") rörs INTE — de säger något eget om just den widgeten, och att
// tvinga in dem under ett gemensamt ord hade gjort panelen fattigare, inte tydligare.
//
// KÄLLKODSPROV MED FLIT. En rubrik är en sträng i en fil; att starta en webbläsare för att läsa den
// hade tagit fyrtio minuter och inte mätt mer. Vakten är alltså snabb nog att köras vid varje
// commit, vilket är precis vad en namnregel behöver.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const FILER = fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.js') && fs.statSync(path.join(ROOT, f)).isFile());

// Rubrikerna byggs på två sätt i huset: <h4> direkt i en props()-sträng, och pgSection('NAMN', …)
// för de hopfällbara grupperna.
function rubriker() {
  const ut = [];
  for (const fil of FILER) {
    const kod = fs.readFileSync(path.join(ROOT, fil), 'utf8');
    for (const m of kod.matchAll(/<h4>([^<]{1,60})<\/h4>/g)) ut.push({ fil, namn: m[1].trim() });
    for (const m of kod.matchAll(/pgSection\('([^']{1,60})'/g)) ut.push({ fil, namn: m[1].trim() });
  }
  return ut;
}

test('positionsgruppen heter samma sak överallt', () => {
  const RATT = 'POSITION & STORLEK';
  const fel = rubriker()
    .filter(r => /^POSITION\b/i.test(r.namn) || /^STORLEK$/i.test(r.namn))
    // "POSITION · TEXTELEMENT" är en annan sak — den flyttar texter inuti widgeten, inte widgeten.
    .filter(r => !/TEXTELEMENT/i.test(r.namn))
    .filter(r => r.namn !== RATT)
    .map(r => `${r.fil}: "${r.namn}"`);

  assert.deepEqual(fel, [],
    `dessa heter något annat än "${RATT}":\n  - ${fel.join('\n  - ')}\n`
    + 'Samma block med samma fält ska bära samma namn — annars går panelen inte att lära sig.');
});

test('ingen grupprubrik är på engelska', () => {
  // Orden är valda ur det som faktiskt förekom, inte ur en allmän engelsk ordlista: en sådan hade
  // fällt "TOP GIFTER", "LIVE-DATA" och "PRESET", som alla är etablerade i produkten.
  const ENGELSKA = /^(GENERAL|SETTINGS|CONTENT|APPEARANCE|BACKGROUND|POSITION AND SIZE|COLORS|OPTIONS|LAYOUT)$/i;
  const fel = rubriker()
    .filter(r => ENGELSKA.test(r.namn))
    .map(r => `${r.fil}: "${r.namn}"`);

  assert.deepEqual(fel, [],
    `engelska rubriker i ett svenskt gränssnitt:\n  - ${fel.join('\n  - ')}`);
});

test('matcharen hittar rubriker i båda formerna', () => {
  // Positiv kontroll: utan den kan proven ovan bli gröna för att de inte läser någonting alls.
  const alla = rubriker();
  assert.ok(alla.length > 40, `hittade bara ${alla.length} rubriker — matcharen läser inte filerna`);
  assert.ok(alla.some(r => r.namn === 'POSITION & STORLEK'), 'hittade ingen <h4>-rubrik');
  assert.ok(alla.some(r => r.namn === 'ANIMATION'), 'hittade ingen pgSection-rubrik');
});
