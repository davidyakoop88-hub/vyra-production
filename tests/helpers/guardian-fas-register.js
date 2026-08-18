'use strict';
// Guardian-familjens register utan en hel sida. Syskon till fan-fas-register.js, av samma skäl:
//
// guardian-fas.js är en IIFE över `window` och går inte att `require`. Men registret — FASER,
// STORLEKAR, PREFIX, KORTASTE_VISNING — är rena data, och de generella vakterna frågar bara efter
// dem. Att starta jsdom, studio.js och media.js för att läsa en tabell hade gjort snabba prov
// långsamma utan att mäta något mer.
//
// SPRÅKVALET TESTAS HÄR OCKSÅ, och därför bär stubben ett `navigator`. `sprak()` är familjens enda
// ställe där språk avgörs (VyraLang finns inte i repot — uppmätt 2026-08-18, noll träffar), så
// provet måste kunna mata den med olika `navigator.language` utan att starta en webbläsare.
// Funktionerna hör hemma i vm-rymden; bara data korsar gränsen, precis som i fan-registret.
const fs = require('fs'), path = require('path'), vm = require('vm');

const KALLA = path.join(__dirname, '..', '..', 'guardian-fas.js');

function rymd({ sprakkod = 'sv-SE', vyraLang = null } = {}) {
  const root = {
    setTimeout: () => 0,
    clearTimeout: () => {},
    navigator: { language: sprakkod },
    // koppla() ger upp direkt när triggern inte finns, och lyssnaren behöver bara existera.
    document: { addEventListener: () => {}, querySelectorAll: () => [] },
  };
  if (vyraLang) root.VyraLang = vyraLang;
  root.window = root;
  vm.runInNewContext(fs.readFileSync(KALLA, 'utf8'), root, { filename: 'guardian-fas.js' });
  return root;
}

const bas = rymd();
const { PREFIX, FASER, STORLEKAR, KORTASTE_VISNING, TEXT_NYCKLAR } = bas.VyraGuardianFas;

// Klonat ur vm-rymden med flit. En array som skapats i en annan realm har en annan
// Array.prototype, och assert/strict jämför prototyper — deepEqual faller annars på två listor som
// ser identiska ut i utskriften.
module.exports = Object.assign(
  JSON.parse(JSON.stringify({ PREFIX, FASER, STORLEKAR, KORTASTE_VISNING, TEXT_NYCKLAR })),
  {
    // Tillgång till de LEVANDE funktionerna för de prov som mäter beteende i stället för data.
    // Varje anrop får en egen rymd, så ett prov aldrig ärver ett annat provs navigator.
    sprakIRymd: (widget, opts) => rymd(opts).VyraGuardianFas.sprak(widget),
    textIRymd: (lang, vecka, opts) => rymd(opts).VyraGuardianFas.text(lang, vecka),
  }
);
