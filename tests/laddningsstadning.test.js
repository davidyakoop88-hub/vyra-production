'use strict';
// Engangsstadningarna i media.js far aldrig radera en normal layout.
//
// ORSAKEN, uppmatt 2026-08-13: tva av dem var varandras motsatser.
//
//   vyra-video-only-migration      state.widgets.filter(w => isStandalone(w) || w.type === 'video')
//   vyra-remove-old-video-widgets  state.widgets.filter(w => isStandalone(w) || w.type !== 'video')
//
// Bada ar top-level i media.js och kor vid VARJE laddning, skyddade bara av sin localStorage-flagga.
// I en webblasare dar ingen flagga var satt kordes de efter varandra: den forsta behold bara video,
// den andra tog bort video. En layout med sex widgetar blev noll, och save() skrev ner resultatet.
//
// Ordningen maskerade det - en ny webblasare kor stadningarna pa ett tomt state och satter flaggorna
// innan nagon layout hunnit in - men varje vag som skriver vyra-state UTAN flaggorna var en riktig
// risk. En import som avbryts efter att "ersatt allt" redan raderat dem ar den realistiska varianten.
//
// Provet laser de riktiga raderna ur media.js i stallet for att beskriva dem, sa det foljer med nar
// nagon lagger till en fjarde stadning. Att bara kontrollera att den borttagna flaggan ar borta hade
// vaktat gardagens bugg; det har vaktar formen.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

const ROT = path.join(__dirname, '..');
const MEDIA = fs.readFileSync(path.join(ROT, 'media.js'), 'utf8');
const VyraWidgets = require(path.join(ROT, 'widget-factory.js'));

// En stadning ser ut sa har, pa en rad:
//   if(!localStorage.getItem('vyra-...')){state.widgets=state.widgets.filter(w=>...);...}
const STADNING = /if\(!localStorage\.getItem\('(vyra-[a-z0-9-]+)'\)\)\{state\.widgets=state\.widgets\.filter\((w=>[^;]+?)\);/g;

function stadningar() {
  const ut = [];
  for (const traff of MEDIA.matchAll(STADNING)) ut.push({ flagga: traff[1], uttryck: traff[2] });
  return ut;
}

// En representativ layout, byggd ur den riktiga fabriken. En fixtur med pahittade typer hade
// bevisat ingenting - filtren fragar efter isStandalone() och type.
function layout() {
  return [
    VyraWidgets.create('catalog:topgift'),
    VyraWidgets.create('catalog:topstreak'),
    VyraWidgets.create('catalog:heartgoal:neon'),
    VyraWidgets.create('catalog:battlemvp:ice'),
    VyraWidgets.create('catalog:likefountain'),
    VyraWidgets.create('catalog:video')
  ];
}

test('kontrollmatning: stadningarna hittas och layouten byggs', () => {
  const funna = stadningar();
  assert.ok(funna.length >= 2,
    `hittade ${funna.length} stadningar i media.js - monstret har andrat form och provet mater inget`);
  assert.equal(layout().length, 6, 'fabriken byggde inte den forvantade layouten');
});

test('ingen enskild stadning raderar allt', () => {
  for (const { flagga, uttryck } of stadningar()) {
    const pred = vm.runInNewContext('(' + uttryck + ')', { VyraWidgets });
    const kvar = layout().filter(pred);
    assert.ok(kvar.length > 0, `${flagga} tomde hela layouten pa egen hand`);
  }
});

test('alla stadningar efter varandra lamnar layouten kvar', () => {
  // Det verkliga fallet: en webblasare utan nagon av flaggorna kor dem alla, i filordning.
  const funna = stadningar();
  let widgets = layout();
  const spar = [`start: ${widgets.length}`];

  for (const { flagga, uttryck } of funna) {
    const pred = vm.runInNewContext('(' + uttryck + ')', { VyraWidgets });
    widgets = widgets.filter(pred);
    spar.push(`${flagga}: ${widgets.length}`);
  }

  assert.ok(widgets.length > 0,
    'stadningarna raderade hela layouten tillsammans - tva av dem motsager varandra\n  ' + spar.join('\n  '));

  // Skarpare an "nagot overlevde": de widgetar som ingen stadning namner ska vara orörda.
  // Blir den har noll har nagon lagt till ett filter som traffar bredare an sin flagga lovar.
  const bevarade = widgets.filter(w => w.type === 'templateTopGift' || w.type === 'templateTopStreak');
  assert.equal(bevarade.length, 2,
    'Top Gift och Top Streak overlevde inte stadningarna\n  ' + spar.join('\n  '));
});

test('den borttagna video-only-migreringen kommer inte tillbaka', () => {
  // Matchar STADNINGS-formen, inte bara namnet: kommentaren pa dess gamla plats i media.js
  // namner flaggan med flit, och en textsokning hade fallit pa den forklaringen i stallet for
  // pa koden.
  const ater = stadningar().some(s => s.flagga === 'vyra-video-only-migration');
  assert.equal(ater, false,
    'vyra-video-only-migration ar ater som stadning i media.js - den behaller bara video och ' +
    'motsager vyra-remove-old-video-widgets. Se kommentaren pa dess gamla plats.');

  // Kontrollmatning: att flaggan inte hittas ska bero pa att den ar borta, inte pa att
  // STADNING-monstret slutat matcha nagonting alls.
  assert.ok(stadningar().length >= 2, 'STADNING-monstret matchar inte langre - provet mater inget');
});
