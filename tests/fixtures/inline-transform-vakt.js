'use strict';
// Generell vakt: en transform som ska kunna LASAS av kod maste sattas inline.
//
// Bakgrunden ar matt (PR #161): getEditorCanvasScale() parsade bara literal scale(), och
// getComputedStyle returnerar alltid matrix(...). En zoom flyttad till en CSS-klass hade darfor
// blivit tyst osynlig for dragmatten. Parsningen klarar bada formerna nu, men regeln star kvar av
// ett annat skal: en skala satt i ett stilark kan inte andras per anvandare utan att stilarket
// skrivs om, och den kan overskuggas av !important-regler man inte ser fran JavaScript.
//
// Anvands av zoom-provet i dag. Lagg till fler poster i MALTAVLOR nar nasta lasbara transform
// dyker upp — vakten ar skriven for att vaxa, inte for att kopieras.
const fs = require('fs'), path = require('path');

// Selektorer vars transform maste vara inline, och de filer som far undantas med skal.
const MALTAVLOR = [
  { selektor: '.canvas', varfor: 'getEditorCanvasScale() laser den; zoom sat i CSS gar inte att andra per anvandare' },
];

// transform-origin, transform-style och transform-box ar andra egenskaper och rors inte.
const TRANSFORM = /(^|[;{])\s*transform\s*:/;

function regler(css) {
  const utan = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const ut = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(utan))) ut.push({ selektor: m[1].trim(), kropp: m[2] });
  return ut;
}

// Returnerar en lista med brott: {fil, selektor, kropp}. Tom lista = allt ar inline.
function hittaBrott(rot, filer) {
  const brott = [];
  for (const fil of filer) {
    const full = path.join(rot, fil);
    if (!fs.existsSync(full)) continue;
    for (const r of regler(fs.readFileSync(full, 'utf8'))) {
      if (!TRANSFORM.test(r.kropp)) continue;
      for (const mal of MALTAVLOR) {
        // Traff pa sjalva maltavlan, inte pa efterkommande (".canvas .widget" ar nagot annat).
        const traffar = r.selektor.split(',').some(s => {
          const del = s.trim();
          return del === mal.selektor || new RegExp(`(^|[\\s>+~])\\${mal.selektor}(:|$|\\s|,)`).test(del);
        });
        if (traffar) brott.push({ fil, selektor: r.selektor, kropp: r.kropp.trim(), varfor: mal.varfor });
      }
    }
  }
  return brott;
}

module.exports = { MALTAVLOR, hittaBrott, regler };
