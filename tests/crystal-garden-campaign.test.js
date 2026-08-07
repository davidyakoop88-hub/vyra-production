'use strict';
// Crystal Garden — ett åttonde Gift Campaign-tema.
//
// Temat är additivt: campaignHtml() i media.js ritar redan bild, nummerbricka, namn, "nu / mål" och
// förloppsstapel per plats. Crystal Garden byter utseendet på den strukturen och sätter en egen
// undertext. Ingen ny renderare, ingen ny livekoppling — gåvor räknas av samma väg som alla andra
// kampanjer, den som A1 gjorde riktad.
//
// Namnet har historik: `crystal-garden` var en fristående OBS-widget som pensionerades medvetet i
// 74a2ce8 och står kvar i RETIRED-listan i standalone-widgets.js. Det här är något annat — ett tema
// på en befintlig widget — men testet nedan låser fast att pensioneringen inte råkar ångras.
//
// RÖTT NU: temat finns inte.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const MEDIA = read('media.js'), CSS = read('studio.css');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));

test.after(closeAll);

// ---- katalogen ------------------------------------------------------------------------------------
test('temat finns i katalogens temalista', () => {
  const line = MEDIA.split('\n').find(l => l.includes('gcThemes='));
  assert.ok(line, 'hittade ingen gcThemes-lista');
  assert.match(line, /\['crystal-garden','Crystal Garden'\]/,
    'Crystal Garden saknas bland kampanjtemana');
});

test('temat går att välja i egenskapspanelen', () => {
  assert.match(MEDIA, /<option value="crystal-garden">Crystal Garden<\/option>/,
    'temat går att skapa ur katalogen men inte byta till på en befintlig widget');
});

// ---- fabriken -------------------------------------------------------------------------------------
for (const orientation of ['landscape', 'portrait']) {
  test(`catalog:giftcampaign:crystal-garden:${orientation} skapar en widget`, () => {
    const w = VyraWidgets.create(`catalog:giftcampaign:crystal-garden:${orientation}`);
    assert.equal(w.type, 'templateGiftCampaign');
    assert.equal(w.campaignTheme, 'crystal-garden');
    assert.equal(w.campaignOrientation, orientation);
  });
}

test('Crystal Garden har sin egen undertext', () => {
  const w = VyraWidgets.create('catalog:giftcampaign:crystal-garden:landscape');
  assert.equal(w.campaignSubtitle, 'GROW THE CRYSTAL GARDEN');
});

test('övriga teman behåller sin undertext', () => {
  for (const t of ['neon', 'royal', 'aurora', 'goldrush']) {
    const w = VyraWidgets.create(`catalog:giftcampaign:${t}:landscape`);
    assert.equal(w.campaignSubtitle, 'PUSH THE EVENT', `${t} fick fel undertext`);
  }
});

// ---- utseendet ------------------------------------------------------------------------------------
test('temat har en egen CSS-regel', () => {
  assert.match(CSS, /\.vyra-campaign\.campaign-crystal-garden/,
    'ingen stil för temat — widgeten skulle se ut som standardkampanjen');
});

// 'bakgrunden är transparent för OBS' lag har och sokte efter den bokstavliga strangen
// `background:transparent` i temats regel.
//
// Den forankrade en MEKANISM, inte ett utfall. Transparensen i sandningen kommer inte fran den
// strangen utan fran kaskaden: `html.overlay-output .widget` vager tyngre an varje `.vyra-campaign*`
// och nollstaller bakgrunden oavsett vad temat sjalvt skriver. Nar temat slutade deklarera en egen
// bakgrund foll provet — trots att sandningen var lika transparent som forut.
//
// En strangsokning kan inte se vem som vann. Kontraktet mats nu i en verklig kaskad:
//   tests/browser/campaign-frames.browser.test.js · 'crystal-garden ar transparent i sandningen'

test('varje gift får en stor cirkel med glow', () => {
  const at = CSS.indexOf('.campaign-crystal-garden .campaign-gifts article .campaign-gift-image');
  assert.notEqual(at, -1, 'ingen egen stil på giftcirkeln');
  const rule = CSS.slice(at, CSS.indexOf('}', at));
  assert.match(rule, /border-radius:\s*50%/, 'cirkeln är inte rund');
  assert.match(rule, /box-shadow/, 'ingen glow runt giften');
});

test('de fyra platserna har var sin kristallfärg', () => {
  // Rosa, lila, blå, guld — en per plats, i den ordning campaignHtml ritar dem.
  for (const n of [1, 2, 3, 4]) {
    assert.match(CSS, new RegExp(`campaign-crystal-garden[^{]*article:nth-child\\(${n}\\)`),
      `plats ${n} saknar egen kristallfärg`);
  }
});

test('nummerbrickan 1-4 syns', () => {
  // campaignHtml ritar redan <i>${i+1}</i> — temat får inte dölja den.
  const at = CSS.indexOf('.campaign-crystal-garden');
  const block = CSS.slice(at, at + 2600);
  assert.doesNotMatch(block, /\.campaign-gift-image i\{[^}]*display:\s*none/,
    'temat döljer nummermarkeringen');
});

// ---- att pensioneringen inte ångras ---------------------------------------------------------------
test('den pensionerade fristående widgeten förblir pensionerad', () => {
  const standalone = read('standalone-widgets.js');
  const retired = standalone.slice(standalone.indexOf('const RETIRED'), standalone.indexOf('const TYPE'));
  assert.match(retired, /'crystal-garden'/,
    'crystal-garden togs ur RETIRED — den fristående widgeten raderades medvetet i 74a2ce8');
  assert.ok(!fs.existsSync(path.join(ROOT, 'public/widgets/crystal-garden.html')),
    'den pensionerade widgetfilen är tillbaka');
});

// ---- att den faktiskt renderas --------------------------------------------------------------------
test('widgeten renderas med temaklassen och fyra numrerade platser', () => {
  const w = VyraWidgets.create('catalog:giftcampaign:crystal-garden:landscape');
  w.id = 'cg1'; w.giftCount = 4;
  const h = createDom({ state: { widgets: [w], projectName: 'test' } });
  // campaignHtml() sanerar giftbildernas URL med VyraSafe — utan den kastar wh().
  h.load('overlay-sanitize.js');
  const canvas = h.paint([w]);
  const box = canvas.querySelector('[data-id="cg1"]');
  assert.ok(box, 'widgeten ritades inte');
  assert.ok(box.className.includes('campaign-crystal-garden'), `fick klasserna: ${box.className}`);
  const slots = box.querySelectorAll('.campaign-gifts article');
  assert.equal(slots.length, 4, 'fyra redigerbara gifts');
  assert.deepEqual([...slots].map(a => a.querySelector('.campaign-gift-image i').textContent),
    ['1', '2', '3', '4'], 'nummermarkeringen 1–4 saknas');
  // Inga påhittade supporterbilder: bara giftbilderna, inga profilbilder.
  assert.equal(box.querySelectorAll('img').length, 4,
    'temat ritar fler bilder än de fyra giftbilderna');
});
