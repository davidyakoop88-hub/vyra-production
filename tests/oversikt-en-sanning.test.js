'use strict';
// EN SANNING OM SANDNINGEN — basvyn och premiumvyn far inte saga emot varandra.
//
// Uppmatt i produktion 2026-08-20: varje sidladdning av studio.html blinkade forbi en Oversikt med
// fyra kort — TITTARE, LIKES, GAVOR, INTAKT — innan overview-premium.js hann laddas och ersatta
// `home`. Korten hade tagits bort ur premiumvyn dagen innan; de lag kvar i basvyn i studio.js.
//
// Tva fel i ett:
//   1. Den forsta skarmbilden jag tog av produktionen visade den GAMLA vyn, och jag drog
//      slutsatsen att utrullningen inte gatt fram. Den hade gatt fram. En vy som ljuger en halv
//      sekund ljuger ocksa for den som felsoker.
//   2. INTAKT ar ett namn vi medvetet gatt ifran. Diamanter ar vad kreatoren far; coins ar vad
//      tittaren koper for, grovt dubbelt sa manga, och kursen varierar med region och avtal. Ett
//      belopp i kronor som ar fel gar inte att laga i efterhand — det ar ett fortroendeproblem.
//
// Provet ar KALLNARA med flit. Felet syns bara i en webblasare under de forsta millisekunderna,
// vilket ar dyrt och skort att fanga dar, men orsaken ar binar: bar de tva filerna samma vy eller
// inte. Samma resonemang som tests/widget-rendering-cache-and-fountain.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rot = path.join(__dirname, '..');
const las = namn => fs.readFileSync(path.join(rot, namn), 'utf8');

// `home()` i studio.js ar basvyn: den som ritas innan premiumbunten laddats, och den som star
// kvar om bunten aldrig kommer fram.
function basvyn() {
  const kalla = las('studio.js');
  const start = kalla.indexOf('function home()');
  assert.notEqual(start, -1,
    'hittar inte `function home()` i studio.js — basvyn har bytt form, las om provet mot den nya');
  // Funktionen ar en enda rad i den har filen. Radslutet ar darfor ratt slut.
  return kalla.slice(start, kalla.indexOf('\n', start));
}

test('basvyn bar inga egna statistikkort', () => {
  const vy = basvyn();
  // Positiv kontroll: matcharen maste falla den gamla vyn, annars mater provet ingenting.
  const gammal = "function home(){return `<div class=\"stats\">"
    + "<article class=\"card stat\"><small>TITTARE</small></article></div>`}";
  assert.match(gammal, /class="card stat"/, 'kontrollmatning: matcharen kanner igen ett stat-kort');

  assert.doesNotMatch(vy, /class="card stat"/,
    'basvyn ritar egna statistikkort igen. Premiumvyn ersatte dem med toppgivarraden, och tva vyer '
    + 'som beskriver samma sandning olika blinkar forbi vid varje sidladdning.');
});

test('ordet INTAKT finns inte i nagon anvandarvand vy', () => {
  // INTAKT lag kvar i basvyn i manader efter att premiumvyn bytt till DIAMANTER. Namnet lovar
  // pengar; siffran ar diamanter.
  for (const fil of ['studio.js', 'overview-premium.js', 'studio.html']) {
    assert.doesNotMatch(las(fil), /INTÄKT/,
      `${fil} sager INTÄKT om ett tal som ar diamanter — diamanter ar inte pengar, och kursen `
      + 'varierar med region och avtal');
  }
});

test('bada vyerna bar samma toppgivarrad', () => {
  // Det ar det som GOR dem till en sanning: samma behallare, samma tomtext. Byter den ena form
  // utan den andra ar vi tillbaka i tva vyer som sager olika saker.
  const bas = basvyn();
  const premium = las('overview-premium.js');
  for (const [namn, kalla] of [['studio.js (basvyn)', bas], ['overview-premium.js', premium]]) {
    assert.match(kalla, /data-toppgivare/,
      `${namn} saknar [data-toppgivare] — vyerna har glidit isar igen`);
    assert.match(kalla, /Toppgivarna visas här under riktig LIVE/,
      `${namn} bar en annan tomtext an den andra vyn`);
  }
});
