'use strict';
// DEN GRÖNA PRICKEN MÅSTE FÖLJA ANSLUTNINGEN, INTE ETT SPARAT NAMN.
//
// Inställningsraden renderades som:
//   <b class="settings-status-value${state.tiktok ? ' online' : ''}">
//
// `state.tiktok` är ett SPARAT ANVÄNDARNAMN. Ett namn som sparats en gång gav därför grön prick
// för alltid — även med anslutningen i läge `failed`.
//
// UPPMÄTT 2026-09-16: appen rapporterade `connected:false, state:'failed'`, molnet hade aldrig
// tagit emot ett enda TikTok-event, och raden lyste ändå grönt med användarnamnet bredvid. David
// läste den som "jag är ansluten" — helt rimligt — och vi felsökte åt fel håll tills mätningen
// visade sanningen.
//
// Sanningen finns i `vyra-server-status`, samma händelse som sidhuvudet redan målar från.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROT, f), 'utf8');

test('inställningsradens prick styrs inte av det sparade användarnamnet', () => {
  const studio = las('studio.js');
  const rad = /<div class="settings-status" data-rad="tiktok">[\s\S]{0,400}?<\/div>/.exec(studio);
  assert.ok(rad, 'hittade inte TikTok-raden i inställningarna');

  // Positiv kontroll: matcharen ska fånga den gamla formen om den kommer tillbaka.
  const gammal = '<b class="settings-status-value${state.tiktok?\' online\':\'\'}">';
  assert.match(gammal, /state\.tiktok\s*\?\s*' online'/, 'kontrollen matchar inte ens den gamla formen');

  assert.doesNotMatch(rad[0], /state\.tiktok\s*\?\s*['"] ?online/,
    'pricken sätts av ett sparat namn igen — den påstår att anslutningen lever när den inte gör det');
  assert.match(rad[0], /data-tiktok-status/,
    'raden saknar kroken som statusmålaren uppdaterar, alltså kan den aldrig visa något annat än sitt startläge');
});

test('statusmålaren läser den riktiga anslutningen', () => {
  const live = las('studio-live.js');
  assert.match(live, /function malaInstallningsrad\(/, 'ingen målare för inställningsraden');
  assert.match(live, /\[data-tiktok-status\]/, 'målaren letar inte upp raden');
  // Den ska bero på connection.connected, inte på ett namn.
  const kropp = live.slice(live.indexOf('function malaInstallningsrad('), live.indexOf('function paint('));
  assert.match(kropp, /c\s*&&\s*c\.connected/, 'målaren tittar inte på connected');
  assert.match(kropp, /connecting|reconnecting/, 'målaren skiljer inte ut det pågående läget');
  // paint() måste faktiskt anropa den, annars är målaren död kod.
  assert.match(live, /function paint\(d\)\{malaInstallningsrad\(/,
    'paint() anropar inte målaren — raden skulle stå kvar på sitt startläge för alltid');
});

// SKÄLET TILL ATT ANSLUTNINGEN INTE GICK IGENOM MÅSTE NÅ ANVÄNDAREN.
//
// Servern skickar `connection.reason` i varje statussvar. Uppmätt 2026-09-16 stod det
// "The requested user isn't online :(" — alltså exakt vad David behövde veta — medan gränssnittet
// bara sa "Anslut TikTok", samma sak som om han aldrig försökt. Fältet fanns, det kastades bort.
test('anslutningens felskäl visas för användaren', () => {
  const live = las('studio-live.js');
  assert.match(live, /function oversattSkal\(/, 'ingen översättning av felskälet');
  const kropp = live.slice(live.indexOf('function malaInstallningsrad('), live.indexOf('function paint('));
  assert.match(kropp, /c\s*&&\s*c\.reason/,
    'målaren läser aldrig `reason` — då kan skälet aldrig nå användaren');
  assert.match(kropp, /settings-status-skal/, 'skälet får ingen plats i raden');
});

test('översättningen gissar inte bort ett okänt skäl', () => {
  // En okänd text måste släppas fram ordagrant. Ett tyst bortfall vore värre än engelska:
  // användaren skulle se "inte ansluten" utan en aning om varför.
  const live = las('studio-live.js');
  const fn = live.slice(live.indexOf('function oversattSkal('), live.indexOf('function malaInstallningsrad('));
  assert.match(fn, /return t;?\s*\}/, 'okänt skäl returneras inte ordagrant');
  assert.match(fn, /if\(!t\)return ''/, 'tom text ger inte tom sträng');
});
