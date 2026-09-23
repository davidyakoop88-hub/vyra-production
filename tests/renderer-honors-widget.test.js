'use strict';
// Renderaren far inte strunta i widgetobjektet.
//
// Fabriken bygger ett korrekt objekt, och renderaren ignorerar det. Uppmatt i webblasaren:
//
//     catalog:topstreak:frame:rose-heart
//       widgetobjekt:  streakFrame: "rose-heart"        ratt
//       renderad:      premium-streak streak-liquid     fel
//       .sframe-art: nej    .sframe-plate: nej
//
// Orsaken ar att premium-final.js skriver over vyraStreak UTAN att titta pa streakFrame:
//
//     vyraStreak=function(w){let style=w.streakTheme||'liquid'; ...}
//
// Ramgrenen i media.js — den som ritar ramkonsten och den urstansade profilrutan — blir dod kod.
// Samma sak for vyraTopGift och dess sju ramar.
//
// VARFOR FALTJAMFORELSE ALDRIG KAN FANGA DET
//
// widget-defaults.snapshot.json och CONTRACT jamfor WIDGETOBJEKT. De ar helt korrekta har: varje
// ram far sitt streakFrame. Felet uppstar ett steg senare, i renderaren, och ar per konstruktion
// osynligt for varje test som slutar vid objektet.
//
// Testet nedan mater i stallet den enda fraga som betyder nagot: syns skillnaden mellan tva
// katalogval i det som faktiskt ritas? Det ar en generell vakt, inte en vakt for de har 15
// designerna — nasta overskrivning som glommer ett falt faller har ocksa.
//
// ROTT NU.
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.after(closeAll);

// Renderarkedjan som sidan faktiskt kor: media.js definierar vyraStreak/vyraTopGift, och
// premium-final.js skriver over bada. Utan premium-final.js hade testet matt en sida som inte
// finns — det var precis den lasten som lat felet ligga kvar.
function studio() {
  const h = createDom({ state: { widgets: [], projectName: 'render' } });
  // overlay-sanitize.js definierar VyraSafe. Utan den kastar battleMvpHtml ReferenceError vid
  // ritning, vilket ser ut som ett renderingsfel men bara ar en lucka i riggen.
  h.load('overlay-sanitize.js');
  h.load('premium-final.js');
  return h;
}

// En familj dar varje variant ska ge ett SYNLIGT eget avtryck.
const FAMILJER = [
  // topstreak.frame togs bort har 2026-09-20: Top Streaks sju ramar ar AVVECKLADE med flit
  // (#476/#481, Clean Flip ar den enda designen). Fabriken har kvar nycklarna sa att sparade
  // layouter laser, men renderaren ritar Clean Flip oavsett streakFrame - uppmatt i Chromium, och
  // last av tests/streak-style-menu.test.js. Att lata familjen sta kvar har hade kravt att
  // ramarna nadde utdatan, alltsa att en dod design kom tillbaka.
  // topgift.frame togs bort har 2026-09-23, och till skillnad fran Top Streaks avveckling ar det
  // en HEL BORTTAGNING: varianttabellen, katalogknapparna och den ramade grenen i vyraTopGift ar
  // ute ur repot. Davids skal: "for mycket och trakigt design". Familjen kan alltsa inte matas har
  // — den finns inte att mata.
  //
  // Sparade layouter laser anda. topgift-pension.js pekar de sju ramarna pa premiumdesignen royal
  // och bar med ramens accentfarg, sa en gammal widget byter till nagot vi VALT at den i stallet
  // for att falla igenom till ingenting. tests/topgift-pension.test.js P11-P15 vaktar det, och
  // docs/topgift-gallringen.md bar checklistan.
  { familj: 'battlemvp.frame', nyckel: v => `catalog:battlemvp:frame:${v}`, falt: 'mvpFrame' }
];

const ANNU_INTE_FIXADE = {};

for (const { familj, nyckel, falt } of FAMILJER) {
  test(`${familj}: varje variant renderas olika`, () => {
    const h = studio();
    const varianter = Object.keys(h.window.VyraWidgets.variants(familj));
    assert.ok(varianter.length > 1, `${familj} har ${varianter.length} varianter — mater inget`);

    const sedda = new Map();
    for (const v of varianter) {
      const w = h.window.VyraWidgets.create(nyckel(v));
      const html = h.window.wh(w);
      const tidigare = sedda.get(html);
      assert.equal(tidigare, undefined,
        `${v} och ${tidigare} renderas EXAKT lika trots olika katalogval — renderaren laser inte ` +
        `widgetobjektet, den ritar samma sak for bada`);
      sedda.set(html, v);
    }
  });

  test(`${familj}: ramvalet nar fram till det som ritas`, () => {
    const h = studio();
    const varianter = Object.keys(h.window.VyraWidgets.variants(familj));
    const saknas = [];
    for (const v of varianter) {
      const w = h.window.VyraWidgets.create(nyckel(v));
      // Fabriken maste satta faltet — annars ar det ett annat fel, och det sags har.
      assert.equal(w[falt], v, `fabriken satte inte ${falt} for ${v}`);
      // ...och ramens namn maste synas i utdatan. Ramkonsten laddas som <img src=".../<id>.png">,
      // sa id:t ar det direkta beviset pa att renderaren anvant valet.
      if (!h.window.wh(w).includes(v)) saknas.push(v);
    }
    assert.deepEqual(saknas, [],
      `dessa ramval nar aldrig fram till utdatan — widgeten bar ${falt}, men renderaren ritar ` +
      `nagot annat:\n  ` + saknas.join('\n  '));
  });
}

test('vakten i katalogen larmar nar ett ramfalt inte nar utdatan', () => {
  // Vakten ar sista utvagen: den star dar ALLA designer passerar samma kod en gang, och sager till
  // i konsolen om ett katalogfalt inte syns i det som ritas. Otestad vaktkod ar ingen vakt.
  const h = studio();
  h.load('overlay-preview.js');

  const larm = [];
  h.window.console.warn = (...a) => larm.push(a.join(' '));

  // En widget vars ramfalt INTE finns i utdatan — exakt det lage de 15 designerna var i.
  h.window.owgVarnaOmTappatFalt({ streakFrame: 'rose-heart' },
    '<div class="premium-streak streak-liquid"></div>', 'catalog:topstreak:frame:rose-heart');
  assert.equal(larm.length, 1, 'vakten teg om ett tappat ramfalt');
  assert.match(larm[0], /streakFrame/);
  assert.match(larm[0], /rose-heart/);

  // ...och den far inte larma nar faltet ar pa plats.
  larm.length = 0;
  h.window.owgVarnaOmTappatFalt({ streakFrame: 'gold-wings' },
    '<img class="sframe-art" src="assets/topstreak-frames/gold-wings.png">', 'katalog');
  assert.deepEqual(larm, [], 'vakten larmade trots att ramen fanns i utdatan');
});

test('vakten ror varken layout eller DOM', () => {
  // Lardomen fran #86: katalogens matning gick via layouten och lamnade fyra widgets i anvandarens
  // overlay. Vakten far darfor bara lasa.
  const fs = require('fs'), path = require('path');
  const kall = fs.readFileSync(path.join(__dirname, '..', 'overlay-preview.js'), 'utf8');
  const start = kall.indexOf('function owgVarnaOmTappatFalt');
  const slut = kall.indexOf('\nfunction ', start + 10);
  const kropp = kall.slice(start, slut);

  for (const forbjudet of ['save(', 'state.widgets', 'innerHTML', 'localStorage', 'append(', 'render()']) {
    assert.equal(kropp.includes(forbjudet), false,
      `vakten anvander ${forbjudet} — den ska bara lasa och varna`);
  }
});

test('ingen renderare skriver over en annan utan att lamna en vag tillbaka', () => {
  // Den strukturella halvan. En overskrivning som inte behaller den tidigare implementationen kan
  // inte falla tillbaka pa den, och da ar varje gren i originalet dod kod — tyst.
  const fs = require('fs'), path = require('path');
  const kall = fs.readFileSync(path.join(__dirname, '..', 'premium-final.js'), 'utf8');
  const KANDA = new Set();
  const brister = [];
  for (const m of kall.matchAll(/\n *(vyra[A-Z]\w*) *= *function/g)) {
    const namn = m[1];
    // Ett fangat original heter nagot annat, t.ex. `const klassiskStreak = vyraStreak` fore
    // overskrivningen.
    const fangat = new RegExp(`(const|let|var) +\\w+ *= *${namn}\\b`).test(kall.slice(0, m.index));
    if (!fangat && !KANDA.has(namn)) brister.push(namn);
  }
  assert.deepEqual(brister, [],
    'dessa skriver over renderaren utan att forst spara undan den:\n  ' + brister.join('\n  ') +
    '\nUtan originalet kan de inte lamna tillbaka de widgets de inte kan rita.');

  // Vakten far inte tystna genom att allt hamnar i undantagslistan.
  assert.ok(KANDA.size <= 1, `${KANDA.size} kanda luckor — de skulle avvecklas, inte samlas`);
});
