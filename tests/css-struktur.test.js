'use strict';
// Varje CSS-fil maste ga jamnt ut, och de regler som ska galla alla anvandare maste ligga pa toppniva.
//
// Bakgrund (#126): studio.css hade en obalanserad klammer. Ett @media(prefers-reduced-motion:reduce)
// oppnades men stangdes aldrig, sa ALLT som lades sist i filen hamnade inuti media-blocket. Battle
// MVP:s tre premiumdesigner (#103) lades dit dagen efter och var darmed slackta for alla utom de som
// slagit pa reducerad rorelse — alltsa nastan ingen.
//
// Det var tyst pa varje niva: filen ser normal ut, webblasaren loggar ingenting, och regeln syns som
// inladdad i document.styleSheets. Den lag bara i fel block.
//
// Befintliga prov kunde inte se det: de matchar regex mot CSS-KALLTEXTEN, och texten var hela tiden
// ratt. Darfor parsar det har provet strukturen i stallet — klammer for klammer.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const CSS_FILER = fs.readdirSync(ROOT).filter(f => f.endsWith('.css')).sort();

// Gar igenom kallan tecken for tecken och hoppar over kommentarer och strangar, sa att en klammer
// inuti /* ... */ eller content:"{" inte raknas. Returnerar djupet vid EOF plus de block som star
// oppna, och nivan for varje regel i filen.
function parsa(kalla) {
  const rader = kalla.split(/\r?\n/);
  const oppna = [];
  const regler = [];
  let djup = 0, iKommentar = false, citat = null, extraStangning = null;

  for (let i = 0; i < rader.length; i++) {
    const rad = rader[i];
    for (let j = 0; j < rad.length; j++) {
      const c = rad[j], nasta = rad[j + 1];
      if (iKommentar) { if (c === '*' && nasta === '/') { iKommentar = false; j++; } continue; }
      if (citat) { if (c === '\\') j++; else if (c === citat) citat = null; continue; }
      if (c === '/' && nasta === '*') { iKommentar = true; j++; continue; }
      if (c === '"' || c === "'") { citat = c; continue; }
      if (c === '{') { regler.push({ rad: i + 1, niva: djup }); oppna.push(i + 1); djup++; }
      else if (c === '}') {
        djup--; oppna.pop();
        if (djup < 0 && extraStangning === null) extraStangning = i + 1;
      }
    }
  }
  return { djup, oppna, regler, extraStangning };
}

const parsad = new Map(CSS_FILER.map(f => [f, parsa(fs.readFileSync(path.join(ROOT, f), 'utf8'))]));

for (const fil of CSS_FILER) {
  test(`${fil}: klammerna gar jamnt ut`, () => {
    const { djup, oppna, extraStangning } = parsad.get(fil);
    assert.equal(extraStangning, null,
      `${fil} har en overflodig } pa rad ${extraStangning}`);
    assert.equal(djup, 0,
      `${fil} har ${djup} ostangt block — oppnat pa rad ${oppna.join(', ')}. ` +
      'Allt som laggs sist i filen hamnar da tyst inuti det blocket.');
  });
}

// Den konkreta regressionen: premiumdesignerna ska galla alla, inte bara reducerad rorelse.
test('Battle MVP:s premiumdesigner ligger pa toppniva i studio.css', () => {
  const kalla = fs.readFileSync(path.join(ROOT, 'studio.css'), 'utf8');
  const rader = kalla.split(/\r?\n/);
  const { regler } = parsad.get('studio.css');
  const nivaPaRad = new Map(regler.map(r => [r.rad, r.niva]));

  const valjare = [
    '.battle-mvp.mvp-premium',
    '.battle-mvp.mvp-royal-purple .mvp-plate',
    '.battle-mvp.mvp-neon-cyber .mvp-plate',
    '.battle-mvp.mvp-diamond-elite .mvp-plate',
  ];

  for (const v of valjare) {
    const rad = rader.findIndex(r => r.trimStart().startsWith(v + '{')) + 1;
    assert.ok(rad > 0, `hittar inte regeln ${v} i studio.css`);
    assert.equal(nivaPaRad.get(rad), 0,
      `${v} (rad ${rad}) ligger pa niva ${nivaPaRad.get(rad)} i stallet for toppniva — ` +
      'designen ar da slackt for alla utom reducerad rorelse.');
  }
});
