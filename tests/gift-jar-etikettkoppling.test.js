'use strict';
// GIFT JAR: etiketten som en fil skriver och en annan raknar om.
//
// `gift-jar-animals.js` hade NOLL testfiler nar renderkedjeauditen gjordes
// (2026-09-17), och den bar en av de tre kvarvarande korsfilskopplingarna pa UI-text:
//
//   media.js            skriver  '7 MODELLER · LIVE GIFTS'
//   gift-jar-animals.js ersatter '7 MODELLER' -> '5 MODELLER'
//
// Varfor sju blir fem: media.js beskriver den GAMLA modelluppsattningen, medan
// gift-jar-animals.js ersatter renderaren med sina egna fem djur.
//
// DET SPRODA ar att ersattningen matchar UI-TEXT. `String.replace()` pa en icke-traff
// returnerar strangen oforändrad -- inget fel, ingen varning, ingenting i konsolen.
// Rattar nagon ett stavfel i etiketten, eller byter siffra, sager panelen plotsligt
// att det finns sju modeller nar det finns fem. Det ar precis den klassen
// docs/RENDERKEDJAN.md §3 listar som farligast.
//
// Provet gor risken till en rod lampa i stallet for en tyst avvikelse.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
const factory = require('../widget-factory.js');

test.after(closeAll);

const ROOT = path.join(__dirname, '..');
const JAR = fs.readFileSync(path.join(ROOT, 'gift-jar-animals.js'), 'utf8');
const MEDIA = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');

// ['lion','Royal Lion',...] — en rad per modell i listan hogst upp i filen.
function modellerIFilen() {
  const start = JAR.indexOf('const models=[');
  assert.ok(start > -1, 'hittade inte modellistan i gift-jar-animals.js');
  const slut = JAR.indexOf('\n];', start);
  const block = JAR.slice(start, slut);
  return [...block.matchAll(/\n\s*\['([a-z]+)'/g)].map(m => m[1]);
}

function ersattning() {
  const m = JAR.match(/replace\('(\d+) MODELLER','(\d+) MODELLER'\)/);
  assert.ok(m, 'hittade inte etikettersattningen i gift-jar-animals.js');
  return { fran: Number(m[1]), till: Number(m[2]) };
}

test('siffran gift-jar skriver ut ar antalet modeller den faktiskt har', () => {
  const modeller = modellerIFilen();
  const { till } = ersattning();
  assert.equal(till, modeller.length,
    `panelen sager ${till} modeller men listan har ${modeller.length}: ` + modeller.join(', '));
});

test('etiketten som ersatts finns fortfarande kvar i media.js', () => {
  const { fran } = ersattning();
  // DEN HAR ASSERTIONEN AR HELA POANGEN. Forsvinner literalen ur media.js slutar
  // ersattningen tyst att traffa, och panelen visar det gamla antalet.
  assert.ok(MEDIA.includes(`${fran} MODELLER`),
    `gift-jar-animals.js ersatter "${fran} MODELLER", men den texten finns inte langre ` +
    'i media.js — ersattningen traffar ingenting och panelen visar fel antal');
});

test('panelen visar ratt antal modeller nar bada filerna kort', () => {
  const w = factory.create('catalog:giftjar:lion');
  Object.assign(w, { id: 'jar1' });
  const h = createDom({ state: { widgets: [w], projectName: 'test' } });
  h.load('overlay-sanitize.js');
  h.load('gift-jar-animals.js');
  h.window.eval('selected = "jar1"');
  const panel = h.window.eval('props()');

  const modeller = modellerIFilen();
  assert.match(panel, new RegExp(`${modeller.length} MODELLER`),
    `panelen borde saga ${modeller.length} MODELLER`);
  assert.ok(!/7 MODELLER/.test(panel) || modeller.length === 7,
    'panelen sager fortfarande 7 MODELLER — ersattningen traffade inte');
});
