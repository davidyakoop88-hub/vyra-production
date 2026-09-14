'use strict';
// VAKTEN FOR updateRankingCycles — den enda vagen som ritar Top Like / Top Coins / Top Points nar
// w.rankingCycle ar pa.
//
// Funktionen hade NOLL prov fram till #345. Det upptacktes under #343: den las `person.activeLikes`,
// ett falt som togs bort i samma andring, och mutationsprovet visade att en aterstallning till
// `person.activeLikes` FORBLEV gron. Gar den har vagen sonder ser streamern tomma eller felaktiga
// rader i sandning medan sviten sager ingenting.
//
// KLART NAR: mutationen som byter person.likes mot person.activeLikes i visaRankingSteg faller.
// Darfor bar varje person i riggen BADA falten, med olika varden — ett prov som bara lade in
// `likes` hade varit gront aven med mutationen inlagd, eftersom `activeLikes` da vore undefined
// och skillnaden mot ratt svar inte gick att se.
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
test.after(closeAll);

// Talen ar valda sa att lfFormatCount ger SEX olika strangar. Delade varden hade latit ett fel
// metrikval passera tyst.
//   likes 1234 -> 1.2K      activeLikes 7777 -> 7.8K
//   coins 2345 -> 2.3K      points      3456 -> 3.5K
const PERSONER = [
  { name: 'Alfa Ett', likes: 1234, activeLikes: 7777, coins: 2345, points: 3456,
    profileImage: 'assets/images/test-profile.svg' },
  { name: 'Beta Tva', likes: 1111, activeLikes: 6666, coins: 2222, points: 3333,
    profileImage: 'assets/images/test-profile.svg' }
];

// Ett enda steg i cykeln at gangen: updateRankingCycles valjer steg med Date.now() % choices.length,
// sa med bara ETT val i listan ar steget deterministiskt oavsett nar provet kors.
function rigg(metric) {
  const w = {
    id: 'rk-' + metric, type: 'templateTopLike', x: 0, y: 0, width: 300, likeCount: 2,
    rankingCycle: true, useLiveData: true,
    // Koden laser `w.cycleX !== false`, sa avstangning maste vara exakt false.
    cycleLikes: metric === 'likes', cycleCoins: metric === 'coins', cyclePoints: metric === 'points'
  };
  const h = createDom({ state: { widgets: [w], projectName: 'ranking-cykel' } });
  h.load('overlay-sanitize.js');
  h.window.VyraLeaderboard = { getTop: (m, n) => PERSONER.slice(0, n) };
  h.window.VyraPoints = { getTop: n => PERSONER.slice(0, n) };
  const box = h.paint([w]).querySelector(`[data-id="${w.id}"]`);
  h.window.updateRankingCycles();
  return { h, w, box };
}

const rader = box => [...box.querySelectorAll('.toplike-row')];

for (const [metric, rubrik, ikon, forvantat] of [
  ['likes', 'TOP LIKES', '♥', ['1.2K', '1.1K']],
  ['coins', 'TOP COINS', '●', ['2.3K', '2.2K']],
  ['points', 'TOP POINTS', '◆', ['3.5K', '3.3K']]
]) {
  test(`rankingcykeln ritar ${metric} ur livedatan, inte demodatan`, () => {
    const { box } = rigg(metric);

    assert.equal(box.querySelector(':scope>h3').textContent, rubrik,
      'rubriken ska folja steget i cykeln');
    assert.equal(box.dataset.cycleMode, rubrik.toLowerCase().replace('top ', ''));

    const r = rader(box);
    assert.ok(r.length >= 2, 'riggen behover minst tva rader for att skilja ordningen at');
    r.slice(0, 2).forEach((rad, i) => {
      assert.equal(rad.querySelector('strong').textContent, PERSONER[i].name,
        'namnet ska komma fran livedatan');
      assert.equal(rad.querySelector('small').textContent,
        '@' + PERSONER[i].name.toLowerCase().replace(/\s+/g, ''));
      assert.equal(rad.querySelector('em').textContent, ikon + ' ' + forvantat[i],
        `raden ska visa ${metric} for person ${i + 1}`);
    });
  });
}

test('MUTATIONSVAKTEN: likes-steget laser person.likes, aldrig person.activeLikes', () => {
  // Det har ar provet #345 bestallde. Byts `person.likes` mot `person.activeLikes` i
  // visaRankingSteg blir raden "♥ 7.8K" i stallet for "♥ 1.2K" och bada assertionerna nedan faller.
  const { box } = rigg('likes');
  const em = rader(box)[0].querySelector('em').textContent;
  assert.equal(em, '♥ 1.2K');
  assert.doesNotMatch(em, /7\.8K/,
    'activeLikes togs bort i #343 — laser koden det faltet igen ar raden fel i sandning');
});

test('utan livedata faller cykeln tillbaka pa demoraderna i stallet for att tomma listan', () => {
  // Den andra grenen i visaRankingSteg. Utan tackning har hade en tom getTop() kunnat ge en
  // osynlig widget i OBS utan att nagot prov markte det.
  const w = {
    id: 'rk-tom', type: 'templateTopLike', x: 0, y: 0, width: 300, likeCount: 2,
    rankingCycle: true, useLiveData: true, cycleLikes: true, cycleCoins: false, cyclePoints: false
  };
  const h = createDom({ state: { widgets: [w], projectName: 'ranking-cykel-tom' } });
  h.load('overlay-sanitize.js');
  h.window.VyraLeaderboard = { getTop: () => [] };
  const box = h.paint([w]).querySelector(`[data-id="${w.id}"]`);
  h.window.updateRankingCycles();

  const r = rader(box);
  assert.ok(r.length >= 1);
  assert.notEqual(r[0].style.display, 'none', 'raden ska synas, inte doljas');
  assert.ok(r[0].querySelector('strong').textContent.trim().length > 0,
    'demonamnet ska sta kvar nar livedatan ar tom');
});
