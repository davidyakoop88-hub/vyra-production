'use strict';
// Browsertesterna får inte ljuga om att de hoppar över.
//
// Varje fil i tests/browser/ bar tidigare sin egen kopia av en launcher plus det här:
//
//   let skip = chromium ? false : '...';                 // avgjort vid registreringen
//   test.before(async () => { ...; if (!browser) skip = 'ingen webblasare (hoppar, faller inte)' });
//   test('...', { skip }, ...);                          // läste skip INNAN before körde
//
// node:test läser optionsobjektet när testet registreras. Omtilldelningen i `before` nådde
// därför aldrig fram: på en maskin utan startbar webbläsare föll varenda test på
// `newContext of null` i stället för att hoppas över, och de filer som startar servera()
// inne i testkroppen läckte en lyssnande server så att processen hängde i stället för att
// avslutas. Uppmätt 2026-08-14: 87 hårda fel och sex domäner som aldrig blev klara.
//
// tests/helpers/webblasare.js avgör det synkront i stället, före registreringen. Det här
// testet ser till att ingen skriver en ny kopia av det gamla mönstret.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const rigg = require('./helpers/webblasare.js');

// Browsertesterna bor i TVA kataloger, och vakten maste folja med till bada.
//
// tests/visual/ finns for att den visuella regressionsvakten INTE ska plockas upp av
// `npm run test:browser`. Den kraver den pinnade Chromium-binaren ur package-lock.json — pa nagon
// annan build rastreras typsnitten olika och varje nyckel faller utan att en rad kod andrats — sa
// den kors i ett eget CI-steg efter `npx playwright install`. Lag den kvar i tests/browser/ hade
// den kort tva ganger: en gang pa runnerns Google Chrome (rott av fel skal) och en gang pa ratt
// binar. Katalogbytet ar alltsa inte kosmetik utan det som gor att den kan ha nolltolerans.
//
// Priset ar att den hamnar utanfor den har vakten om listan inte namner den. Darav radena nedan.
const KATALOGER = [path.join(__dirname, 'browser'), path.join(__dirname, 'visual')];
const FILER = KATALOGER.flatMap(kat =>
  fs.existsSync(kat)
    ? fs.readdirSync(kat).filter(f => f.endsWith('.browser.test.js')).map(f => path.join(kat, f))
    : []);
const kort = f => path.relative(path.join(__dirname, '..'), f);

test('det finns browsertester att vakta', () => {
  assert.ok(FILER.length >= 40, `hittade bara ${FILER.length} browsertester — har katalogen flyttat?`);
});

// §7: en vakt som bara laser en katalog ar gron aven nar den andra katalogen ar tom. Kontrollen
// namner filen som flyttades ut, sa att utflytten inte kan gora den osynlig for de tre proven nedan.
test('den visuella vakten ligger i listan trots att den bor i en egen katalog', () => {
  const visuella = FILER.filter(f => f.includes(`${path.sep}visual${path.sep}`));
  assert.ok(visuella.length >= 1,
    'tests/visual/ innehaller ingen *.browser.test.js — antingen har filen flyttat igen, '
    + 'eller sa laser den har vakten fel katalog och de tre proven nedan tacker den inte langre');
});

test('ingen browsertestfil har en egen webbläsarstart', () => {
  const egna = FILER.filter(f => {
    const text = fs.readFileSync(f, 'utf8');
    return /async function startaWebblasare/.test(text) || text.includes("require('playwright-core')");
  });
  assert.deepEqual(egna.map(kort), [], `De här filerna har en egen launcher i stället för tests/helpers/webblasare.js: ${egna.map(kort).join(', ')}`);
});

test('varje browsertestfil avgör skip synkront via riggen', () => {
  const fel = [];
  for (const f of FILER) {
    const text = fs.readFileSync(f, 'utf8');
    if (!text.includes("require('../helpers/webblasare.js')")) { fel.push(`${kort(f)}: använder inte riggen`); continue }
    const skip = /let skip = ([^;]*);/.exec(text);
    if (!skip) { fel.push(`${kort(f)}: ingen skip-sats`); continue }
    if (skip[1].trim() !== 'hoppaOver()') fel.push(`${kort(f)}: skip sätts till "${skip[1].trim()}" i stället för hoppaOver()`);
    // Omtilldelning i before är just det som aldrig fungerade.
    if (/\bskip = (?!hoppaOver)/.test(text.slice(skip.index + skip[0].length))) {
      fel.push(`${kort(f)}: skriver om skip efter registreringen — det når aldrig fram till test()`);
    }
  }
  assert.deepEqual(fel, [], fel.join(' | '));
});

test('i CI hoppas browsersviten aldrig över tyst', () => {
  // En saknad webbläsare i CI ska bli rött, inte tyst grönt. Lokalt är överhoppning rätt svar.
  if (!process.env.CI) { assert.ok(true); return }
  assert.equal(rigg.hoppaOver(), false, 'CI saknar en startbar webbläsare — sviten skulle ha hoppats över utan att någon märkte det');
});

test('riggen hittar samma binär som den startar', () => {
  const binar = rigg.hittaBinar();
  if (binar === null) {
    assert.notEqual(rigg.hoppaOver(), false, 'ingen binär hittades men sviten skulle ändå ha körts');
    return;
  }
  assert.ok(fs.existsSync(binar), `hittaBinar() pekar på ${binar} som inte finns`);
  assert.equal(rigg.hoppaOver(), false, 'en binär hittades men sviten skulle ha hoppats över');
});
