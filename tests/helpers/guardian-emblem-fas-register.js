'use strict';
// Guardian Emblem · familjens register utan en hel sida. Syskon till fan-fas-register.js och
// samma skäl som där:
//
// guardian-emblem-fas.js är en IIFE över `window` och går inte att `require`. Men registret —
// FASER, TIDER, STEG, PREFIX, KORTASTE_VISNING — är rena data, och de generella vakterna frågar
// bara efter dem. Att starta jsdom, studio.js och media.js för att läsa en tabell hade gjort
// snabba prov långsamma utan att mäta något mer.
//
// SPRÅKVALET OCH KLOCKAN TESTAS OCKSÅ HÄRIFRÅN, och därför bär stubben både `navigator` och en
// utbytbar `setTimeout`. `sprak()` är familjens enda ställe där språk avgörs (VyraLang finns inte
// i repot — uppmätt 2026-08-18, noll träffar), och `klocka` är enda vägen till en timer. Båda
// måste gå att mata utan att starta en webbläsare.
const fs = require('fs'), path = require('path'), vm = require('vm');

const KALLA = path.join(__dirname, '..', '..', 'guardian-emblem-fas.js');

// Ett tydligt fel slår ett ENOENT-spår genom vm. Vid den röda baslinjen är det HÄR varje prov som
// läser registret ska falla, och meddelandet ska säga varför.
if (!fs.existsSync(KALLA)) {
  throw new Error('guardian-emblem-fas.js saknas — koreografin har ingen hemvist än');
}

// Varje anrop bygger en EGEN rymd. Ett prov ska aldrig ärva ett annat provs navigator, och ett
// prov som byter ut klockan ska inte kunna smitta grannen.
function rymd({ sprakkod = 'sv-SE', vyraLang = null, timer = null } = {}) {
  const root = {
    setTimeout: timer ? timer.satt : (() => 0),
    clearTimeout: timer ? timer.rensa : (() => {}),
    navigator: { language: sprakkod },
    // koppla() ger upp direkt när triggern inte finns, och lyssnaren behöver bara existera.
    document: { addEventListener: () => {}, querySelectorAll: () => [] },
  };
  if (vyraLang) root.VyraLang = vyraLang;
  root.window = root;
  vm.runInNewContext(fs.readFileSync(KALLA, 'utf8'), root, { filename: 'guardian-emblem-fas.js' });
  return root;
}

const bas = rymd();
const { PREFIX, FASER, TIDER, STEG, STEGNYCKLAR, DELAR, BILDBAS, KORTASTE_VISNING } = bas.VyraGuardianEmblemFas;

// Klonat ur vm-rymden med flit. En array som skapats i en annan realm har en annan
// Array.prototype, och assert/strict jämför prototyper — deepEqual faller annars på två listor som
// ser identiska ut i utskriften. Bara data korsar gränsen; funktionerna hör hemma i rymden.
module.exports = Object.assign(
  JSON.parse(JSON.stringify({ PREFIX, FASER, TIDER, STEG, STEGNYCKLAR, DELAR, BILDBAS, KORTASTE_VISNING })),
  {
    rymd,
    sprakIRymd: (widget, opts) => rymd(opts).VyraGuardianEmblemFas.sprak(widget),
    textIRymd: (lang, opts) => rymd(opts).VyraGuardianEmblemFas.text(lang),
  }
);
