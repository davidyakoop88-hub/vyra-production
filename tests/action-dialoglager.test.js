'use strict';
// EN DIALOG SOM ÖPPNAS UR EN MODAL MÅSTE LIGGA ÖVER DEN.
//
// Uppmätt 2026-09-16 i riktig Chrome: `.gift-picker-modal` låg på z-index 5000 och `.ae-modal`
// på 9000. Gåvoväljaren ritades alltså UNDER eventmodalens mörka lager, och `elementFromPoint`
// mitt i ett gåvokort returnerade `ae-check` — ett element i modalen bakom. Knappen "Välj gåva"
// öppnade en dialog som varken gick att se eller klicka på.
//
// Felet var tyst i två avseenden, och det är därför det överlevde så länge: ingenting kastade,
// och det såg inte ens trasigt ut — dialogen fanns i DOM:en, med rätt innehåll, bakom ett lager.
// Ett prov som bara frågar "finns gåvoväljaren?" hade varit grönt hela tiden.
//
// Provet läser CSS i stället för att starta en webbläsare: regeln är en enda jämförelse mellan
// två tal, och en browsersvit kostar 35–52 minuter i CI för att bevisa samma sak.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROT, f), 'utf8');

// ORDNINGEN MÅSTE VARA SIDANS EGEN, annars mäter provet fel sak.
//
// studio.html:8 laddar studio.css i <head>; media.js:1185 lägger till action-event.css vid
// körning, alltså SENARE i dokumentet. Vid samma specificitet vinner den sista — så
// action-event.css måste stå sist också här. Första versionen av det här provet hade dem i
// omvänd ordning och föll på en bugg som inte fanns: webbläsaren mätte upp 9500 och rätt
// klickträff medan provet läste 5000. Ett prov som modellerar laddningsordningen fel är lika
// blint som den bugg det ska fånga.
const SIDANS_CSS = () => `${las('studio.css')}\n${las('action-event.css')}`;

// Sista deklarationen vinner, precis som i webbläsaren — därför `.at(-1)`, inte den första.
function zIndexFor(css, selektor) {
  const traffar = [...css.matchAll(new RegExp(`\\${selektor}\\s*\\{([^}]*)\\}`, 'g'))]
    .flatMap(m => [...m[1].matchAll(/z-index\s*:\s*(\d+)/g)].map(z => Number(z[1])));
  return traffar.length ? traffar.at(-1) : null;
}

test('gåvoväljaren ligger över modalen som öppnar den', () => {
  const css = SIDANS_CSS();

  // Positiv kontroll först: hittar matcharen över huvud taget ett z-index? Utan den här raden
  // hade provet varit grönt även om båda selektorerna slutat finnas.
  assert.equal(zIndexFor('.x{z-index:42}', '.x'), 42, 'matcharen läser inte z-index alls');
  assert.equal(zIndexFor('.x{z-index:1}.x{z-index:2}', '.x'), 2, 'matcharen tar inte den sista deklarationen');

  const gava = zIndexFor(css, '.gift-picker-modal');
  const modal = zIndexFor(css, '.ae-modal');
  assert.ok(gava !== null, 'hittade inget z-index för .gift-picker-modal');
  assert.ok(modal !== null, 'hittade inget z-index för .ae-modal');
  assert.ok(gava > modal,
    `gåvoväljaren (${gava}) ligger under Action/Event-modalen (${modal}) — den går inte att klicka på`);
});

test('färgväljaren ligger över modalen som öppnar den', () => {
  const css = SIDANS_CSS();
  const farg = zIndexFor(css, '.vyra-fargvaljare');
  const modal = zIndexFor(css, '.ae-modal');
  assert.ok(farg !== null, 'hittade inget z-index för .vyra-fargvaljare');
  assert.ok(farg > modal,
    `färgväljaren (${farg}) ligger under Action-modalen (${modal}) — den går inte att klicka på`);
});

// RADAVSTANDET AR EN LANGD, INTE ETT FORHALLANDE.
//
// Forsta versionen skrev `line-height:calc(var(--alert-line) / 45)` i tron att det gav
// forhallandet 1 vid grundvardet. `calc(45px / 45)` ger `1px`. Uppmatt i Chrome: radavstandet var
// EN PIXEL vid 45 px text, alltsa lag tva rader ovanpa varandra. Enradiga alerts sag helt ratt ut,
// vilket ar precis varfor felet passerade varje ogonkontroll — och varfor det inte racker att
// mata ATT ett varde andras. Facit har "Font Line Spacing" i samma enhet som "Font Size".
test('alertens radavstånd delas inte ned till en pixel', () => {
  const css = las('action-event.css');
  const regel = /\.vyra-action-alert\{[^}]*line-height\s*:\s*([^;}]+)/.exec(css);
  assert.ok(regel, 'hittade ingen line-height på .vyra-action-alert');
  const varde = regel[1].trim();
  assert.ok(!/\/\s*\d/.test(varde),
    `line-height "${varde}" divideras — en px-längd delad med ett tal ger px, inte ett förhållande`);
  assert.match(varde, /var\(--alert-line\)/,
    'line-height läser inte --alert-line, alltså når panelens radavstånd inte renderingen');
});
