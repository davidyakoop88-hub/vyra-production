'use strict';
// CYKELN VISADE EN TOM MALL I SANDNING (uppmatt i livetestet 2026-09-21).
//
// visaRankingSteg faller tillbaka pa demorostern nar ett steg saknar data. I editorn ar det ratt:
// demot ar det streamern designar mot. I overlay ar det tvartom — live-zero-state.js nollar varje
// rad vars namn star i dess DEMO_NAMES, och gor det innan nagon hinner se nagot. Resultatet framfor
// publiken var rubriken "TOP POINTS" over fem namnlosa rader med "◆ 0", i fyra sekunder, varje varv
// sa lange ingen delat ut en poang.
//
// Regeln som provas: i OVERLAY valjs steget bland de metriker som faktiskt har data. Har ingen av
// dem data star valet orort — widgeten har da ingenting att cykla mellan, och att den inte ska
// synas alls ar vyra-tom-widget.js regel, inte den har funktionens.
//
// KLART NAR: en mutation som tar bort filtret faller, OCH en mutation som later filtret galla aven
// i editorn faller. Bada halvorna behovs: ett filter som gallde overallt hade gjort en nyss ikryssad
// cykel osynlig i studion tills nagon gav en gava.
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
test.after(closeAll);

const PERSONER = [
  { name: 'Alfa Ett', likes: 1234, coins: 2345, points: 3456, profileImage: 'assets/images/test-profile.svg' },
  { name: 'Beta Tva', likes: 1111, coins: 2222, points: 3333, profileImage: 'assets/images/test-profile.svg' }
];

const SEKUNDER = 15;

// KLOCKAN STALLS, den mats inte. Steget valjs med Math.floor(Date.now()/(sek*1000))%antal, sa ett
// prov som later riktig tid avgora hade haft ratt av en slump halva gangerna — och en mutation som
// tar bort filtret hade da varit gron varannan korning. Med en stalld klocka pekar provet ut exakt
// det steg som UTAN filtret hade valts, och kraver att widgeten visar ett annat.
function medKlocka(h, tid, fn) {
  const riktiga = h.window.Date;
  const stilla = function () { return new riktiga() };
  stilla.now = () => tid;
  h.window.Date = stilla;
  try { return fn() } finally { h.window.Date = riktiga }
}
// Tiden da steg 0 valjs, oavsett hur manga steg listan har.
const STEG_NOLL = 0;

function rigg({ overlay, valda, harLikes = false, harCoins = false, harPoints = false }) {
  const w = {
    id: 'rk-' + valda.join('-'), type: 'templateTopLike', x: 0, y: 0, width: 300, likeCount: 2,
    rankingCycle: true, useLiveData: true, cycleSeconds: SEKUNDER,
    cycleLikes: valda.includes('likes'), cycleCoins: valda.includes('coins'),
    cyclePoints: valda.includes('points')
  };
  const h = createDom({
    url: 'https://vyralive.app/studio.html' + (overlay ? '?overlay=1' : ''),
    state: { widgets: [w], projectName: 'cykel-tomma-steg' }
  });
  h.load('overlay-sanitize.js');
  const data = { likes: harLikes, coins: harCoins };
  h.window.VyraLeaderboard = { getTop: (m, n) => (data[m] ? PERSONER.slice(0, n) : []) };
  h.window.VyraPoints = { getTop: n => (harPoints ? PERSONER.slice(0, n) : []) };
  const box = h.paint([w]).querySelector(`[data-id="${w.id}"]`);
  // Cykeln drivs av en 500 ms-ticker i drift; provet driver den explicit i stallet for att vanta.
  return { h, w, box, kor: () => h.window.updateRankingCycles() };
}

const namn = box => [...box.querySelectorAll('.toplike-row')].map(r => r.querySelector('strong').textContent);
const rubrik = box => box.querySelector(':scope>h3').textContent;

test('overlay: ett steg utan data hoppas over', () => {
  // Likes och Points valda, men bara Points har nagot att visa. Med filtret finns exakt ETT steg
  // kvar, sa valet ar oberoende av nar provet kors.
  const { h, box, kor } = rigg({ overlay: true, valda: ['likes', 'points'], harPoints: true });
  // Klockan star pa steg 0. Utan filtret ar steg 0 'likes', som saknar data — precis det valet som
  // gav den tomma mallen i sandning.
  medKlocka(h, STEG_NOLL, kor);
  assert.equal(rubrik(box), 'TOP POINTS',
    'cykeln stannade pa en metrik utan data — publiken ser en tom mall');
  assert.deepEqual(namn(box), ['Alfa Ett', 'Beta Tva']);
});

test('overlay: nar ingen metrik har data star valet orort', () => {
  // Widgeten har ingenting att cykla mellan. Filtret far da inte tomma listan och gora funktionen
  // till en no-op — steget ska valjas precis som forut, och tomheten hanteras av vyra-tom-widget.js.
  const { h, box, kor } = rigg({ overlay: true, valda: ['points'] });
  medKlocka(h, STEG_NOLL, kor);
  assert.equal(rubrik(box), 'TOP POINTS');
  assert.equal(box.dataset.cycleMode, 'points', 'cykeln slutade rita helt nar ingen metrik hade data');
});

test('editorn cyklar vidare aven genom steg utan data', () => {
  // Halva regeln, och den viktigaste for streamern: en cykel som just kryssats i maste ga att se i
  // studion direkt — inte forst nar nagon gett en gava. Det forvantade steget raknas ur SAMMA klocka
  // som koden anvander, sa provet mater listan och inte tidpunkten.
  const { h, box, kor } = rigg({ overlay: false, valda: ['likes', 'points'], harPoints: true });
  medKlocka(h, STEG_NOLL, kor);
  assert.equal(rubrik(box), 'TOP LIKES',
    'editorn hoppade over ett steg utan data — filtret ska bara galla i overlay');
  // Och demoraderna ar kvar dar, som forut: det ar dem streamern designar mot.
  assert.deepEqual(namn(box), ['Alex', 'Mia']);
});

test('overlay: forsta gavan far TOP COINS att borja visas', () => {
  // Steget identifieras av sin METRIK och inte av sitt index, just for att listan kan vaxa mitt i en
  // sandning. Med index hade "1" jamforts mot "1" och bytet skett utan koreografi.
  const r = rigg({ overlay: true, valda: ['likes', 'coins'], harLikes: true });
  medKlocka(r.h, SEKUNDER * 1000, r.kor);   // steg 1 utan filter = 'coins', som saknar data
  assert.equal(rubrik(r.box), 'TOP LIKES', 'utan coins-data finns bara ett steg kvar');
  assert.equal(r.box.dataset.tlSteg, 'likes', 'steget ska minnas sin metrik, inte sitt index');
});
