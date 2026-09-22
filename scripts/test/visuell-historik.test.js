'use strict';
// HISTORIKEN SA "ALLA" NAR FYRA BILDER SKREVS.
//
// `scripts/visuell-referens.js` jamforde antalet skrivna bilder mot `nycklar` — listan EFTER att
// VYRA_VISUELL_BARA filtrerat den. En korning med `bara=templateTopPoints` skrev fyra bilder, fyra
// av fyra, och loggade darfor "Nycklar: alla". Sant om filtret, falskt om katalogen.
//
// Uppmatt 2026-09-22 i korning 65 av workflowen "Visuella referenser": fyra bilder committades och
// `tests/visual/referenser/historik.md` fick raden "**Nycklar:** alla" bredvid rubriken
// "4 referenser skrivna". Rubriken hade ratt, raden ljog.
//
// VARFOR DET SPELAR ROLL. Historiken ar det enda stallet dar nasta person kan se vad som byttes och
// varfor. En rad som sager "alla" nar fyra skrevs later en lasare tro att hela uppsattningen togs om
// pa den motorn — och da letar hen fel nar en referens visar sig vara aldre an den ser ut.
//
// DET HAR AR EN KALLVAKT, ALLTSA EN PROXY. Den mater kallkoden, inte utdatan. Skalet star i
// docs/tech-debt.md §7 som en KANDA svaghet, och valet ar medvetet: skriptet ar en async IIFE som
// startar en webblasare och fotograferar 133 nycklar: det gar inte att kalla pa i ett prov utan att
// bygga om det till en modul. Vakten pinnar darfor de tva paastaenden buggen bestod av, och ett
// tredje prov ser till att den gamla formen inte smyger tillbaka.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const kalla = fs.readFileSync(path.join(root, 'scripts', 'visuell-referens.js'), 'utf8');

test('historikens "alla" jamfors mot hela uppsattningen, inte mot filtret', () => {
  assert.match(kalla, /const utanUndantag = alla\.filter\(k => !utanReferens\(k\)\);/,
    'jamforelsens hogersida maste raknas fram ur ALLA nycklar, inte ur den filtrerade listan');
  assert.match(kalla, /const helaSatsen = skrivna\.length === utanUndantag\.length;/);
});

test('MUTATIONSVAKTEN: den gamla jamforelsen mot den filtrerade listan ar borta', () => {
  // Precis den form buggen hade. Kommer den tillbaka — av en aterstallning, en sammanslagning
  // eller en omskrivning — ska provet falla direkt, inte forst nasta gang nagon laser historiken.
  assert.doesNotMatch(kalla, /skrivna\.length === nycklar\.length/,
    'jamforelsen mot den FILTRERADE listan ar tillbaka: "alla" betyder da "alla i filtret"');
});

test('en filtrerad korning skriver ut sitt filter, bade i historiken och i manifestet', () => {
  // Utan filtret i raden gar det inte att se VARFOR bara fyra skrevs — bara att de var fyra.
  assert.match(kalla, /\(BARA \? ` \(filter: \$\{BARA\}\)` : ''\)/,
    'historikraden namner inte filtret');
  assert.match(kalla, /filter: BARA \|\| null/,
    'manifestets `senaste` namner inte filtret');
});

test('och den listar nycklarna nar de inte ar alla', () => {
  // "4 av 133" utan namnen ar fortfarande en gata for den som soker en enskild bild.
  assert.match(kalla, /\$\{skrivna\.map\(s => s\.nyckel\)\.join\(', '\)\}/);
});
