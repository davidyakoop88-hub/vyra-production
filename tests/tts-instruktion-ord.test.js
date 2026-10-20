'use strict';
// TTS-INSTRUKTIONEN ANVÄNDER SAMMA ORD SOM KONTROLLERNA DEN PEKAR PÅ.
//
// Granskningen 2026-10-17 (F34): statusraden sa "Kryssa i Aktiverad och tryck Spara", men det finns
// ingen kryssruta som heter Aktiverad — reglaget heter "TTS av"/"TTS aktiv" — och knappen heter
// "Spara TTS-inställningar". Den andra raden ("tryck Spara inställningar") pekade också på en knapp
// som inte finns. Och reglagets etikett stod kvar på "TTS av" efter att man slagit på det, så man
// kunde inte se att ändringen väntade på att sparas.
//
// Provet läser kontrollernas faktiska etiketter ur mallen i tts-chat.js och kräver att statusradens
// instruktioner citerar just dem. Byter någon namn på knappen faller provet tills texten följer med.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const kalla = fs.readFileSync(path.join(__dirname, '..', 'tts-chat.js'), 'utf8');

const knapp = (kalla.match(/id="ttsSaveSettings"[^>]*>([^<]+)</) || [])[1];
const reglage = kalla.match(/s\.enabled \? '([^']+)' : '([^']+)'/);
const statusFn = kalla.slice(kalla.indexOf('function ttsStatusText'), kalla.indexOf('function ttsStatusText') + 1400);

test('provet hittar kontrollernas riktiga etiketter', () => {
  assert.equal(knapp, 'Spara TTS-inställningar');
  assert.ok(reglage, 'hittar inte reglagets etiketter i mallen');
  assert.equal(reglage[1], 'TTS aktiv');
  assert.equal(reglage[2], 'TTS av');
  assert.notEqual(statusFn.length, 0, 'hittar ingen ttsStatusText()');
});

test('instruktionen säger samma namn som reglaget och sparknappen', () => {
  const detaljer = [...statusFn.matchAll(/'([^']*(?:tryck|Slå på|Kryssa)[^']*)'/g)].map(m => m[1]);
  assert.ok(detaljer.length >= 2, `hittade ${detaljer.length} instruktioner i statusraden`);
  for (const d of detaljer) {
    assert.ok(d.includes(knapp), `"${d}" nämner inte knappen "${knapp}"`);
    assert.doesNotMatch(d, /Aktiverad/, `"${d}" pekar på en kryssruta "Aktiverad" som inte finns`);
    assert.doesNotMatch(d, /Spara inställningar/, `"${d}" pekar på en knapp "Spara inställningar" som inte finns`);
  }
  assert.ok(detaljer.some(d => d.includes(reglage[2])),
    `ingen instruktion nämner reglaget med det namn det visar när det är av ("${reglage[2]}")`);
});

test('reglagets etikett följer med direkt när man slår på eller av', () => {
  // Utan det står det "TTS av" bredvid ett påslaget reglage tills panelen ritas om — och då ser
  // statusradens "inte sparat" ut att gälla något annat.
  const lyssnare = kalla.slice(kalla.indexOf("querySelector('#ttsEnabled')?.addEventListener('change'"));
  assert.notEqual(lyssnare.length, kalla.length + 1, 'hittar ingen change-lyssnare på reglaget');
  assert.match(lyssnare.slice(0, 500), /TTS aktiv/, 'change-lyssnaren uppdaterar inte reglagets etikett');
});
