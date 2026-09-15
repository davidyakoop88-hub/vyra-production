'use strict';
// INGEN ENGANGSMIGRERING FAR SKRIVA KUNDENS DATA VID MOUNT.
//
// Monstret som vaktas har sag ut sa har, och fanns pa SEX stallen innan #431 och #433:
//
//   if (!localStorage.getItem('vyra-nagot')) {
//     state.widgets... = ...            // andra eller radera kundens widgetar
//     save();                           // skriv till molnet
//     localStorage.setItem('vyra-nagot', '1');
//   }
//
// Tre fel, varje gang:
//
// 1. DEN KOR VID MOUNT. Ingen har klickat pa nagonting. En ren sidladdning muterar datan.
// 2. save() KORS VILLKORSLOST. Aven nar migreringen inte hittade nagot att gora skrivs
//    tillstandet tillbaka till molnet.
// 3. FLAGGAN BOR I FEL LAGER. localStorage ar per dator och per webblasare. Datan bor i
//    Postgres, per overlay. Ny dator, rensad cache eller ominstallation = migreringen kor
//    om mot SAMMA data. "Engangs" var aldrig sant.
//
// VAD DET KOSTADE PA RIKTIGT: tva av de fem i media.js RADERADE widgetar. De kallades
// "remove old" och "retired", men ingen av typerna var pensionerad - bade `video` och
// `templateGloveSnipe` har renderare och egenskapspanel i media.js i dag, och skapas av
// medielistan respektive addBoostPack. Undantaget `isStandalone` raddade dem inte:
// widget-factory.js:505 satter placement bara nar anroparen ber om det, och ingen av de tva
// anroparna ber. Widgetarna blev layout-widgetar - precis det migreringen radade.
//
// PROVET VAKTAR MONSTRET, INTE RADEN. En ny migrering med ett nytt flagganamn fangas ocksa.
// Skulle en verklig engangsmigrering nagon gang behovas hor flaggan hemma i det lager datan
// bor i, inte i localStorage - da faller det har provet inte heller.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROT = path.join(__dirname, '..');

// Spannet ar avsiktligt tilltaget: filerna ar handminifierade och hela blocket ligger pa EN rad.
// Det maste anda vara begransat, annars trafas ett `save()` som hor till nagot helt annat
// hundratals rader bort och provet borjar ljuga at andra hallet.
const MONSTER = /if\s*\(\s*!\s*localStorage\.getItem\(\s*['"]([^'"]+)['"]\s*\)\s*\)[\s\S]{0,800}?\bsave\s*\(\s*\)[\s\S]{0,400}?localStorage\.setItem\(\s*['"]\1['"]/g;

function rotfiler() {
  return fs.readdirSync(ROT)
    .filter(f => f.endsWith('.js'))
    .filter(f => fs.statSync(path.join(ROT, f)).isFile());
}

// Kommentarer raknas inte. Gravstenarna i media.js CITERAR den borttagna koden med flit, sa att
// nasta lasare ser exakt vad som inte far ateruppsta. Utan den har rensningen hade provet fallit
// pa sina egna gravstenar, och da hade nagon tagit bort gravstenarna i stallet for att lasa dem.
function utanKommentarer(kalla) {
  return kalla
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map(rad => {
      const i = rad.indexOf('//');
      if (i < 0) return rad;
      // Ett // inuti en strang ar inte en kommentar. Enkel heuristik: jamnt antal citattecken fore.
      const fore = rad.slice(0, i);
      const jamnt = s => (fore.split(s).length - 1) % 2 === 0;
      return jamnt("'") && jamnt('"') && jamnt('`') ? fore : rad;
    })
    .join('\n');
}

test('ingen fil kor en localStorage-flaggad migrering som sparar vid mount', () => {
  const traffar = [];
  for (const fil of rotfiler()) {
    const kalla = utanKommentarer(fs.readFileSync(path.join(ROT, fil), 'utf8'));
    for (const m of kalla.matchAll(MONSTER)) {
      const rad = kalla.slice(0, m.index).split('\n').length;
      traffar.push(`${fil}:${rad} — flaggan '${m[1]}'`);
    }
  }

  assert.deepEqual(traffar, [],
    'Engangsmigrering som skriver vid mount:\n  ' + traffar.join('\n  ')
    + '\n\nFlaggan i localStorage ar per dator; datan bor per overlay i Postgres. Migreringen'
    + '\nkor darfor om pa varje ny dator, rensad cache och ominstallation - mot samma data.'
    + '\nSe gravstenarna i media.js och toplike-studio.js for de sex som togs bort.');
});

test('gravstenarna star kvar — de ar det enda som hindrar en atervandare', () => {
  // Utan dem ser koden bara ut som att nagot saknas, och nasta person skriver tillbaka det.
  const bevakade = {
    'media.js': [
      'vyra-toplike-style2-enabled',
      'vyra-toplike-three-only',
      'vyra-remove-old-video-widgets',
      'vyra-remove-retired-battle-fx',
      'vyra-wide-like-fountain',
    ],
    'toplike-studio.js': ['vyra-signature-ranking-frames-v1'],
  };

  for (const [fil, flaggor] of Object.entries(bevakade)) {
    const kalla = fs.readFileSync(path.join(ROT, fil), 'utf8');
    for (const flagga of flaggor) {
      assert.ok(kalla.includes(flagga),
        `gravstenen for '${flagga}' ar borta ur ${fil} — skriv inte bort historien, den ar varningen`);
    }
  }
});
