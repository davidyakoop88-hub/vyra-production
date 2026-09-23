'use strict';
// Fasregistret utan en hel sida — samma form som fan- och gifter-registren.
//
// streak-fas.js ar en IIFE over `window` och gar inte att `require`. Men registret — FASER,
// KORTASTE_VISNING, PREFIX, LAYOUTPREFIX — ar rena data, och de generella vakterna fragar bara
// efter dem. Ingen parsning av kallkod: det ar den RIKTIGA tabellen som lases.
const fs = require('fs'), path = require('path'), vm = require('vm');

const KALLA = path.join(__dirname, '..', '..', 'streak-fas.js');
const MOTOR = path.join(__dirname, '..', '..', 'widget-fas.js');

const root = {
  setTimeout: () => 0,
  clearTimeout: () => {},
  document: { addEventListener: () => {}, querySelectorAll: () => [] },
};
root.window = root;
vm.runInNewContext(fs.readFileSync(MOTOR, 'utf8'), root, { filename: 'widget-fas.js' });
vm.runInNewContext(fs.readFileSync(KALLA, 'utf8'), root, { filename: 'streak-fas.js' });

// Klonat ur vm-rymden med flit — en array fran en annan realm har en annan prototyp, och
// assert/strict jamfor prototyper.
const { PREFIX, FASER, KORTASTE_VISNING, LAYOUTPREFIX } = root.VyraStreakFas;
module.exports = JSON.parse(JSON.stringify({ PREFIX, FASER, KORTASTE_VISNING, LAYOUTPREFIX }));
