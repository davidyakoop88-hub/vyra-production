'use strict';
// Fasregistret utan en hel sida.
//
// fan-fas.js är en IIFE över `window` och går inte att `require`. Men registret — FASER,
// KORTASTE_VISNING, PREFIX — är rena data, och de generella vakterna (F1, F3) frågar bara efter
// dem. Att starta jsdom, studio.js och media.js för att läsa en tabell hade gjort tre snabba prov
// långsamma utan att mäta något mer.
//
// Filen körs i en minimal stubbrymd i stället: tillräckligt för att IIFE:n ska nå slutet, inte
// mer. Ingen parsning av källkod — det är den RIKTIGA tabellen som läses, så en ändrad tid i
// fan-fas.js slår igenom i proven direkt.
const fs = require('fs'), path = require('path'), vm = require('vm');

const KALLA = path.join(__dirname, '..', '..', 'fan-fas.js');
const MOTOR = path.join(__dirname, '..', '..', 'widget-fas.js');

const root = {
  setTimeout: () => 0,
  clearTimeout: () => {},
  // koppla() ger upp direkt när triggern inte finns, och lyssnaren behöver bara existera.
  document: { addEventListener: () => {}, querySelectorAll: () => [] },
};
root.window = root;
// Fabriken först — sedan 2026-08-19 bor mekaniken i widget-fas.js och arten kräver den vid
// parsning. Båda är de RIKTIGA filerna; stubbrymden är fortfarande minimal.
vm.runInNewContext(fs.readFileSync(MOTOR, 'utf8'), root, { filename: 'widget-fas.js' });
vm.runInNewContext(fs.readFileSync(KALLA, 'utf8'), root, { filename: 'fan-fas.js' });

// Klonat ur vm-rymden med flit. En array som skapats i en annan realm har en annan
// Array.prototype, och assert/strict jämför prototyper — deepEqual föll på två listor som såg
// identiska ut i utskriften. Bara data korsar gränsen; funktionerna hör hemma i en riktig sida.
const { PREFIX, FASER, KORTASTE_VISNING } = root.VyraFanFas;
module.exports = JSON.parse(JSON.stringify({ PREFIX, FASER, KORTASTE_VISNING }));
