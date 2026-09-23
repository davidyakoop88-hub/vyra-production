'use strict';
// SKYDDSNATET UNDER EN GALLRING AV TOP GIFTS DESIGNER.
//
// Top Gift har 40 designer i fyra tabeller i widget-factory.js. Nar en plockas bort finns tre
// utgangar, och tva av dem ar TYSTA — uppmatt 2026-09-23:
//
//   katalogen skapar en ny     pick() KASTAR med en lasbar lista over giltiga varden
//   sparad widget MED ram      GIFT_FRAMES[w.giftFrame] -> undefined -> faller till premiumgrenen
//   sparad widget UTAN ram     klassen topgift-<borttagen> utan CSS -> struktur utan skinn
//
// De tva sista kraschar inte. De ser bara fel ut nasta gang nagon laddar sin overlay. Den har
// modulen gor dem omojliga, och de har proven haller den arlig.
//
// TABELLEN AR TOM I DAG, med flit: skyddsnatet byggs FORE gallringen. Proven injicerar darfor
// egna poster for att mata mekaniken — de mater inte dagens innehall, de mater regeln.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROT, f), 'utf8');

// Alla fyra varianttabellerna, lasta ur den RIKTIGA fabriken. Ingen dubblerad lista: en lista som
// dubbleras ar precis det som glider isar.
function levandeDesigner() {
  const root = { document: { addEventListener: () => {}, querySelectorAll: () => [] } };
  root.window = root;
  vm.runInNewContext(las('widget-factory.js'), root, { filename: 'widget-factory.js' });
  const W = root.VyraWidgets;
  const namn = new Set();
  for (const bord of ['topgift.theme', 'topgift.frame', 'topgift.extra', 'topgift.premium']) {
    const tabell = W.variants(bord);
    assert.ok(tabell && Object.keys(tabell).length > 0, `varianttabellen ${bord} ar tom`);
    Object.keys(tabell).forEach(k => namn.add(k));
  }
  return namn;
}

function rigg(renderare) {
  const root = {};
  root.window = root;
  root.vyraTopGift = renderare || (w => w);
  vm.runInNewContext(las('topgift-pension.js'), root, { filename: 'topgift-pension.js' });
  return root;
}

test('P1: varje pensionerad design pekar pa en design som FINNS', () => {
  // Hela poangen. Pekar en pensionering pa ett namn som inte finns ar widgeten lika osminkad som
  // om vi inte gjort nagot alls — skyddsnatet hade da varit ett hal med en etikett pa.
  const levande = levandeDesigner();
  const { PENSIONERADE } = rigg().VyraTopGiftPension;
  for (const [fran, till] of Object.entries(PENSIONERADE)) {
    assert.ok(levande.has(till),
      `'${fran}' pensioneras till '${till}', som inte finns i nagon varianttabell`);
  }
});

test('P2: ingen design ar bade levande och pensionerad', () => {
  // Star den kvar i katalogen gar den att valja — och da pekas streamerns nya val om direkt efter
  // att hon gjort det. Det ar varre an att inte gallra alls.
  const levande = levandeDesigner();
  const { PENSIONERADE } = rigg().VyraTopGiftPension;
  for (const fran of Object.keys(PENSIONERADE)) {
    assert.ok(!levande.has(fran),
      `'${fran}' star som pensionerad men finns kvar i katalogen — den maste tas bort ur `
      + 'widget-factory.js variants i samma andring');
  }
});

test('P3: standardtemat far aldrig pensioneras', () => {
  // premium-final.js gor `w.theme||'royal'`. En widget utan valt tema har aldrig gjort ett val som
  // gar att peka om; pensioneras royal utan att defaulten andras i samma andetag far varje sadan
  // widget ingen CSS alls.
  const { PENSIONERADE, STANDARD } = rigg().VyraTopGiftPension;
  assert.equal(STANDARD, 'royal', 'standardtemat ska spegla premium-final.js `w.theme||\'royal\'`');
  assert.ok(!PENSIONERADE[STANDARD],
    `standardtemat '${STANDARD}' ar pensionerat — andra defaulten i premium-final.js forst`);
  const media = las('premium-final.js');
  assert.ok(media.includes("w.theme||'" + STANDARD + "'"),
    'premium-final.js defaultar inte langre till ' + STANDARD + ' — STANDARD har glidit ur synk');
});

test('P4: inga cykler', () => {
  const { PENSIONERADE, levande } = rigg().VyraTopGiftPension;
  for (const fran of Object.keys(PENSIONERADE)) {
    const sedda = new Set([fran]);
    let n = PENSIONERADE[fran];
    while (PENSIONERADE[n]) {
      assert.ok(!sedda.has(n), `pensioneringarna gar i cykel via '${n}'`);
      sedda.add(n);
      n = PENSIONERADE[n];
    }
    assert.equal(levande(fran), n, 'levande() foljde inte kedjan hela vagen');
  }
});

test('P5: MEKANIKEN — en pensionerad design ritas som sin efterfoljare', () => {
  // Provet injicerar sin egen post: det mater REGELN, inte dagens tomma tabell.
  const sett = [];
  const root = rigg(w => { sett.push({ theme: w.theme, giftFrame: w.giftFrame }); return 'ok' });
  root.VyraTopGiftPension.PENSIONERADE['dark-raven'] = 'luna-mist';
  root.vyraTopGift({ theme: 'royal', giftFrame: 'dark-raven' });
  assert.deepEqual(sett, [{ theme: 'royal', giftFrame: 'luna-mist' }],
    'renderaren fick den pensionerade ramen — den hade ritats osminkad i drift');
});

test('P6: MEKANIKEN foljer en kedja', () => {
  const sett = [];
  const root = rigg(w => { sett.push(w.giftFrame); return 'ok' });
  const p = root.VyraTopGiftPension;
  p.PENSIONERADE['a'] = 'b';
  p.PENSIONERADE['b'] = 'luna-mist';
  root.vyraTopGift({ giftFrame: 'a' });
  assert.deepEqual(sett, ['luna-mist'], 'kedjan a -> b -> luna-mist foljdes inte');
});

test('P7: widgeten MUTERAS ALDRIG', () => {
  // Streamerns val star kvar orort, sa en design som tas tillbaka dyker upp igen av sig sjalv —
  // och en felaktig pensionering gar att angra utan att nagons data gatt forlorad.
  const root = rigg(() => 'ok');
  root.VyraTopGiftPension.PENSIONERADE['dark-raven'] = 'luna-mist';
  const w = { theme: 'royal', giftFrame: 'dark-raven', x: 10 };
  root.vyraTopGift(w);
  assert.equal(w.giftFrame, 'dark-raven', 'wrappern skrev i streamerns widget');
});

test('P8: en orord widget gar RAKT igenom, utan kopia', () => {
  // Vanliga fallet, och det som kor i varje bildruta. Ingen tom tabell ska kosta en objektkopia
  // per rendering.
  const sett = [];
  const root = rigg(w => { sett.push(w); return 'ok' });
  const w = { theme: 'royal', giftFrame: 'luna-mist' };
  root.vyraTopGift(w);
  assert.equal(sett[0], w, 'en orord widget kopierades i onodan');
});

test('P9: lindningen sker EN gang', () => {
  const root = rigg(() => 'ok');
  assert.equal(root.VyraTopGiftPension.linda(), false,
    'linda() lindade en redan lindad renderare — varje omladdning hade lagt ett lager till');
});

test('P10: modulen laddas EFTER premium-final.js', () => {
  // premium-final.js SKRIVER OVER vyraTopGift helt. Lindas den fore ar det media.js version som
  // lindas, och premiumbunten skriver over lindningen direkt efterat — tyst.
  const media = las('media.js');
  const rad = media.match(/const scripts=\[[^\]]*\]/)?.[0] || '';
  assert.ok(rad.includes('premium-final.js'), 'hittar inte premiumbuntens skriptlista');
  assert.ok(rad.includes('topgift-pension.js'), 'modulen ligger inte i premiumbunten');
  assert.ok(rad.indexOf('topgift-pension.js') > rad.indexOf('premium-final.js'),
    'modulen laddas FORE premium-final.js — da lindas fel renderare');
});
