'use strict';
// NÄR MOLNET INTE GÅR ATT NÅ SÄGER APPEN INGENTING — den står bara tom.
//
// Uppmätt i main.js 2026-08-20: `createMainWindow()` gör `main.loadURL(CLOUD_ORIGIN/studio.html)`
// och all fortsättning hänger på `did-finish-load`. Misslyckas laddningen — molnet nere, DNS
// borta, kabeln ur, Railway som deployar — fyrar den händelsen aldrig:
//
//   · `did-fail-load` finns, men gör BARA `log(...)` till en fil i temp-katalogen
//   · pollningen som förklarar behörighetshinder startas inuti `did-finish-load` och startar
//     alltså aldrig
//   · `ready-to-show` fyrar ändå, så fönstret VISAS — tomt, utan en rad text
//   · `main.loadURL(...)` är inte awaitad och dess avslag blir en unhandled rejection som
//     bara syns i loggfilen
//
// Följden för en användare: appen öppnas, är svart, och ingenting händer. Det är samma felklass
// som desktop-entry-reason.test.js redan stängde för behörighet — tyst väntan där ett skäl
// behövdes — fast en nivå tidigare i kedjan, och den här gången utan ens en pollning igång.
//
// Provet läser main.js som text, av samma skäl som desktop-entry-reason: att starta Electron i
// CI för att bevisa en felhanteringsgren är dyrare och skörare än att kräva att grenen finns.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MAIN = fs.readFileSync(path.join(ROOT, 'electron-app/main.js'), 'utf8');

// Blocket plockas ut via sin markör, inte med en regex över hela filen — samma teknik som
// desktop-entry-probe, så att en omskrivning av resten av main.js inte tyst tömmer provet.
const MARKOR = '/* moln-onabart */';
function blocket() {
  const vid = MAIN.indexOf(MARKOR);
  assert.notEqual(vid, -1,
    `hittar inte markören ${MARKOR} i main.js — hanteringen av ett onåbart moln saknas helt, `
    + 'och då visar appen ett tomt fönster utan ett ord när vyralive.app inte svarar');
  return MAIN.slice(vid, vid + 2600);
}

test('did-fail-load på molnorigin gör mer än att skriva i loggfilen', () => {
  const b = blocket();
  assert.match(b, /dialog\.showMessageBox/,
    'ett onåbart moln ska förklaras i en ruta användaren ser — loggfilen ligger i temp-katalogen '
    + 'och läses av ingen');
  assert.match(b, /vyralive\.app|internet|anslut|nätver/i,
    'texten ska säga VAD som inte gick att nå, annars är den lika tyst som tystnaden');
});

test('förklaringen visas en gång, inte en gång per omförsök', () => {
  const b = blocket();
  // Samma regel som entryReasonShown: ett terminalt hinder förklaras en gång per körning.
  // Utan spärren staplas rutor på varandra vid varje misslyckat omförsök.
  assert.match(b, /molnFelVisat|entryReasonShown|visat/i,
    'ingen spärr mot upprepade rutor — ett moln som är nere ger flera did-fail-load i rad');
});

test('appen försöker igen i stället för att ge upp för alltid', () => {
  const b = blocket();
  assert.match(b, /setTimeout|setInterval|loadURL/,
    'ett nedslaget moln kommer tillbaka; appen ska försöka igen så att användaren inte behöver '
    + 'starta om för att komma in när nätet är tillbaka');
});

test('splashen får inte bli kvar för evigt när laddningen misslyckas', () => {
  // ready-to-show stänger splashen i dagens kod, men den händelsen är inte garanterad när
  // laddningen faller. Utan en egen väg ut kan splashen bli kvar över ett svart huvudfönster.
  const b = blocket();
  assert.match(b, /splash/,
    'felgrenen rör aldrig splashen — den kan bli kvar ovanpå ett tomt fönster');
});

test('kontrollmätning: laddningen av molnet är fortfarande det som startar appen', () => {
  // Om någon byter startsidan till något annat mäter proven ovan fel sak. Den här raden
  // faller då, och tvingar fram en omläsning i stället för falsk trygghet.
  assert.match(MAIN, /main\.loadURL\(`\$\{CLOUD_ORIGIN\}\/studio\.html\?desktop-auth=1`\)/,
    'startsidan har ändrats — läs om provet ovan mot den nya kedjan');
});
