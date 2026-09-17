'use strict';
// DE TVA SISTA KORSFILSKOPPLINGARNA PA UI-TEXT.
//
// Renderkedjeauditen (2026-09-17) hittade tre omslag som soker efter en literal som
// EN ANNAN FIL skrev. Gift Jar fick sin vakt i en egen commit; har ar de tva ovriga:
//
//   guardian-emblem-models.js:36   ersatter  '<h4>PRAKT</h4>'        skriven av media.js
//   gift-campaign-aura.js:15       ersatter  'Liggande · 4 på rad'   skriven av media.js
//                                            'Stående · 2 × 2'
//
// VARFOR DET AR FARLIGT. `String.replace()` pa en icke-traff returnerar strangen
// oforändrad. Inget fel kastas, ingen varning loggas, ingenting syns i konsolen --
// panelen tappar bara tyst den del som omslaget skulle ha lagt till. Den som rattar
// ett stavfel i etiketten far veta det forst nar en anvandare hor av sig.
//
// docs/RENDERKEDJAN.md §3 listar UI-text som den farligaste klassen just darfor, och
// regeln dar ar "matcha aldrig pa UI-text". Att skriva om de tva omslagen till
// data-attribut ar ratt fix, men det ror media.js som redan har tva PR:er i luften.
// Provet gor risken synlig NU; omskrivningen kan gores nar ytan ar fri.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const MEDIA = las('media.js');

// Filen som ersatter -> literalerna den forvantar sig att nagon annan har skrivit.
// Uppmatt 2026-09-17. Se kommentaren vid assertionen langre ner for varfor antalet
// nalas fast i stallet for att bara kontrollera att literalen finns.
const ANTAL = {
  'guardian-emblem-models.js': { '<h4>PRAKT</h4>': 1 },
  'gift-campaign-aura.js': { 'Liggande · 4 på rad': 2, 'Stående · 2 × 2': 2 }
};

const KOPPLINGAR = [
  { fil: 'guardian-emblem-models.js', kalla: 'media.js' },
  { fil: 'gift-campaign-aura.js', kalla: 'media.js' }
];

// Plockar ut forsta argumentet ur varje .replace('...' i filen. Bara strangliteraler:
// ett reguljart uttryck som argument ar en annan sak och vaktas inte har.
function ersatta(kalla) {
  return [...kalla.matchAll(/\.replace(?:All)?\(\s*'((?:[^'\\]|\\.){4,80})'/g)]
    .map(m => m[1].replace(/\\'/g, "'"))
    // Strukturbitar som '<div class="' finns i var och varannan fil och sager inget
    // om kopplingen. Vi vaktar det som ar SPECIFIKT nog att peka pa en avsandare.
    .filter(s => /[A-ZÅÄÖ]{3,}|·|×/.test(s));
}

for (const { fil, kalla } of KOPPLINGAR) {
  test(`${fil}: varje ersatt literal finns kvar i ${kalla}`, () => {
    const literaler = ersatta(las(fil));
    assert.ok(literaler.length > 0, `hittade inga ersattningar att vakta i ${fil}`);

    const saknas = literaler.filter(s => !MEDIA.includes(s));
    assert.deepEqual(saknas, [],
      `${fil} ersatter text som inte langre finns i ${kalla}. Ersattningen traffar ` +
      'ingenting, tyst, och panelen tappar det omslaget skulle ha lagt till.');

    // ANTALET AR EN SNUBBELTRAD, inte ett bevis.
    //
    // "finns nagonstans i media.js" racker inte: 'Liggande · 4 på rad' star pa TVA
    // stallen -- en gang i panelen (media.js:558) och en gang i katalogen (:1031).
    // Andras bara panelens fortsatter provet vara gront medan panelen tappar sin
    // ersattning. Mutationsprovet visade exakt det.
    //
    // Darfor nalas antalet fast. Andrar du en etikett med flit: kontrollera att
    // omslaget fortfarande traffar, och uppdatera siffran har i samma andring.
    for (const [litteral, antal] of Object.entries(ANTAL[fil] || {})) {
      const nu = MEDIA.split(litteral).length - 1;
      assert.equal(nu, antal,
        `"${litteral}" finns ${nu} gang(er) i ${kalla}, forvantat ${antal}. ` +
        'Om du andrade en av dem med flit: kontrollera att ersattningen i ' +
        `${fil} fortfarande traffar, och uppdatera siffran i det har provet.`);
    }

    console.log(`\n    ${fil}: ${literaler.length} vaktad(e) literal(er)` +
                `\n      ${literaler.map(s => JSON.stringify(s)).join('\n      ')}\n`);
  });
}

test('reglen star kvar i dokumentationen som de har proven vaktar', () => {
  // Om nagon tar bort regeln ur dokumentet ska proven inte tyst leva vidare som
  // enda spar av varfor de finns.
  const doc = las(path.join('docs', 'RENDERKEDJAN.md'));
  assert.match(doc, /Matcha aldrig på UI-text/,
    'regeln om UI-text saknas i docs/RENDERKEDJAN.md');
});
