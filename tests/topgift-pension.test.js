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
  // topgift.frame star INTE i listan langre: hela grenen pensionerades 2026-09-23 och tabellen
  // finns inte kvar. `table()` svarar `{}` pa ett borttaget bord, sa en kvarglomd rad hade gjort
  // vakten tyst i stallet for rod — darfor raknas totalen i stallet.
  for (const bord of ['topgift.theme', 'topgift.extra', 'topgift.premium']) {
    Object.keys(W.variants(bord)).forEach(k => namn.add(k));
  }
  // 22 UNIKA, inte 33: royal, neon, cyber, fire, ice, galaxy, sakura och flera till star i mer an
  // en tabell. Golvet ar en kontrollmatning mot en omdopt eller flyttad tabell, inte ett facit.
  assert.ok(namn.size >= 20,
    `hittade bara ${namn.size} levande Top Gift-designer — har en varianttabell dopts om?`);
  assert.equal(Object.keys(W.variants('topgift.frame')).length, 0,
    'topgift.frame finns igen — da ska ramarna ut ur PENSIONERADE, inte ligga kvar som bada');
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
  for (const [fran, post] of Object.entries(PENSIONERADE)) {
    const till = typeof post === 'string' ? post : post.tema;
    assert.ok(levande.has(till),
      `'${fran}' pensioneras till '${till}', som inte finns i nagon varianttabell`);
    if (typeof post === 'object') {
      assert.match(post.accent || '', /^#[0-9a-f]{6}$/i,
        `avframningen av '${fran}' saknar en giltig accentfarg — den ramade grenen foll tillbaka `
        + 'pa ramens egen farg, premiumgrenen faller tillbaka pa guld');
    }
  }
  assert.equal(Object.keys(PENSIONERADE).length, 7,
    'antalet pensionerade designer andrades — uppdatera docs/topgift-gallringen.md i samma andring');
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
    if (typeof n !== 'string') continue;        // en avframning ar alltid en andstation
    while (typeof PENSIONERADE[n] === 'string') {
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
  root.VyraTopGiftPension.PENSIONERADE['prov-gammal'] = 'prov-ny';
  root.vyraTopGift({ theme: 'prov-gammal', giftFrame: '' });
  assert.deepEqual(sett, [{ theme: 'prov-ny', giftFrame: '' }],
    'renderaren fick det pensionerade temat — det hade ritats osminkat i drift');
});

test('P6: MEKANIKEN foljer en kedja', () => {
  const sett = [];
  const root = rigg(w => { sett.push(w.giftFrame); return 'ok' });
  const p = root.VyraTopGiftPension;
  p.PENSIONERADE['prov-a'] = 'prov-b';
  p.PENSIONERADE['prov-b'] = 'prov-c';
  root.vyraTopGift({ giftFrame: 'prov-a' });
  assert.deepEqual(sett, ['prov-c'], 'kedjan prov-a -> prov-b -> prov-c foljdes inte');
});

test('P7: widgeten MUTERAS ALDRIG', () => {
  // Streamerns val star kvar orort, sa en design som tas tillbaka dyker upp igen av sig sjalv —
  // och en felaktig pensionering gar att angra utan att nagons data gatt forlorad.
  const root = rigg(() => 'ok');
  const w = { theme: 'royal', giftFrame: 'luna-mist', x: 10 };
  root.vyraTopGift(w);
  assert.equal(w.giftFrame, 'luna-mist', 'wrappern skrev i streamerns widget');
});

test('P8: en orord widget gar RAKT igenom, utan kopia', () => {
  // Vanliga fallet, och det som kor i varje bildruta. Ingen tom tabell ska kosta en objektkopia
  // per rendering.
  const sett = [];
  const root = rigg(w => { sett.push(w); return 'ok' });
  const w = { theme: 'royal', giftFrame: '' };
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

// ——— RAMARNA, pensionerade 2026-09-23 ———
//
// Hela `topgift.frame`-grenen togs bort pa Davids begaran. Det ar ingen omdopning: ramen ar en egen
// GREN i renderaren (`if (w.giftFrame) return klassiskTopGift(w)`), inte ett annat skinn pa samma.
// De har proven mater att avframningen landar dar vi vill, och inte dar den hade landat av sig
// sjalv.
const RAMAR = ['royal-wings', 'crystal-spire', 'angel-heart', 'dark-raven', 'frost-crystal',
  'rose-garden', 'luna-mist'];

test('P11: alla sju ramar ar pensionerade, och som AVFRAMNINGAR', () => {
  const { PENSIONERADE } = rigg().VyraTopGiftPension;
  for (const ram of RAMAR) {
    const post = PENSIONERADE[ram];
    assert.ok(post, `ramen '${ram}' saknar pensionering — en sparad widget ritas osminkad`);
    assert.equal(typeof post, 'object',
      `'${ram}' pensioneras med en strang. En ram som pekas pa ett TEMANAMN faller igenom till `
      + 'premiumgrenen anda — men av en slump, inte av ett beslut');
    assert.ok(post.tema, `'${ram}' saknar mal-tema`);
  }
});

test('P12: en sparad ramwidget AVFRAMAS — giftFrame toms', () => {
  // Utan tomningen ar `if (w.giftFrame)` i premium-final.js fortfarande sant, och widgeten gar till
  // klassiskTopGift → som med en tom GIFT_FRAMES faller till media.js EGNA klassiska tema. Det ar
  // en TREDJE rendering, varken ramen eller premiumdesignen. Tomningen ar det som styr den ratt.
  const sett = [];
  const root = rigg(w => { sett.push(w); return 'ok' });
  root.vyraTopGift({ giftFrame: 'luna-mist', theme: undefined });
  assert.equal(sett[0].giftFrame, '', 'giftFrame tomdes inte — widgeten hamnar i fel gren');
  assert.equal(sett[0].theme, 'royal');
});

test('P13: ramens accentfarg foljer med — men bara om streamern inte valt en egen', () => {
  // Den ramade grenen foll tillbaka pa ramens egen farg nar streamern inte valt nagon
  // (`bk(w, w.accent, 'highlight', gf.accent)`); premiumgrenen faller tillbaka pa guld. Utan den
  // har raden hade sju lila och rosa widgetar blivit gula.
  const sett = [];
  const root = rigg(w => { sett.push(w.accent); return 'ok' });
  root.vyraTopGift({ giftFrame: 'luna-mist' });
  assert.equal(sett[0], '#c07bff', 'ramens accent tappades — widgeten blir guldfargad');
  root.vyraTopGift({ giftFrame: 'luna-mist', accent: '#00ff00' });
  assert.equal(sett[1], '#00ff00', 'streamerns egen accent skrevs over');
});

test('P14: katalogen kan inte langre skapa en ram, och sager varfor', () => {
  // pick() kastar med en lasbar lista. Det ar RATT beteende har: en katalognyckel som pekar pa en
  // borttagen design ar ett fel i koden eller i en gammal lank, inte i nagons sparade layout.
  const root = { document: { addEventListener: () => {}, querySelectorAll: () => [] } };
  root.window = root;
  vm.runInNewContext(las('widget-factory.js'), root, { filename: 'widget-factory.js' });
  assert.throws(() => root.VyraWidgets.create('catalog:topgift:frame:luna-mist'),
    /Okänd premiumdesign "frame"|Okänd tema "frame"|Okänd gåvoram/,
    'en borttagen ram gick fortfarande att skapa ur katalogen');
});

test('P15: ramkonsten och referensbilderna ar borta', () => {
  // Blir de kvar ar de ett arkeologiskt spar — och referensbilderna far den visuella vakten att
  // falla pa nycklar som inte langre finns.
  assert.ok(!fs.existsSync(path.join(ROT, 'assets', 'topgift-frames')),
    'assets/topgift-frames/ finns kvar — 2,1 MB konst till sju borttagna designer');
  const ref = path.join(ROT, 'tests', 'visual', 'referenser');
  const kvar = fs.readdirSync(ref).filter(f => f.startsWith('topgift_frame_'));
  assert.deepEqual(kvar, [], `referensbilder kvar for borttagna ramar: ${kvar.join(', ')}`);
  const karta = las(path.join('docs', 'katalogkarta.md'));
  assert.ok(!karta.includes('catalog:topgift:frame'),
    'katalogkartan listar fortfarande ramarna — kor `npm run karta`');
});
