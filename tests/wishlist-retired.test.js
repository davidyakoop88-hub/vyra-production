'use strict';
// wishlist.js ar pensionerad — men dess DATA maste fortfarande torkas.
//
// Filen sparade onskemal i localStorage och oppnade sedan e-postklienten mot
// WISHLIST_EMAIL = 'TODO@exempel.se'. Inget onskemal har nagonsin natt nagon. Knappen togs over av
// supportsystemet i PR #106, och nu gar filen sjalv.
//
// DET FARLIGA ar inte filen, det ar nyckeln. `vyra-wishlist` lag i EXTRA_KEYS i session-state.js,
// och den listan anvands pa flera stallen — bland annat i loopen som TORKAR varje nyckel nar ett
// konto lamnas (session-state.js, "for (const key of EXTRA_KEYS) storage.removeItem(key)").
//
// Tar man bara bort nyckeln ur listan slutar den torkas. En gammal installation har den kvar, och
// da ligger konto A:s onskemal i konto B:s webblasare. Datan ar visserligen dod — ingen laser den
// langre — men det ar fortfarande forra kontots innehall som ligger kvar i en delad dator.
//
// Darfor RETIRED_KEYS: nycklar vi inte langre anvander, som inte ska synkas, sakerhetskopieras
// eller foljas med in i en overlay — men som fortfarande ska torkas nar ett konto lamnas.
//
// ROTT NU: filen finns, laddas, och nyckeln ligger kvar i alla fyra listorna.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const finns = f => fs.existsSync(path.join(ROOT, f));

// ---- 1. filen ar borta --------------------------------------------------------------------------

test('wishlist.js finns inte langre', () => {
  assert.equal(finns('wishlist.js'), false, 'filen ligger kvar');
});

test('ingenting laddar wishlist.js', () => {
  // Kommentarer bort forst: media.js FORKLARAR i prosa varfor filen ar borta, och den forklaringen
  // far inte falla ett test om koden. Samma lasning som i tests/gift-fireworks-live-path.test.js.
  const media = las('media.js')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  assert.doesNotMatch(media, /wishlist\.js/, 'media.js laddar en fil som inte finns — 404 vid varje sidladdning');
  assert.doesNotMatch(media, /ensureWishlistBundle/, 'buntladdaren ligger kvar');
});

test('ingen knapp och ingen vy pekar dit', () => {
  assert.doesNotMatch(las('studio.html'), /data-extra="wishlist"/);
});

// ---- 2. nyckeln synkas, sakerhetskopieras och transporteras inte langre --------------------------

const SLUTAR_BARA = ['cloud-sync.js', 'state-backup.js', 'overlay-access.js'];

for (const fil of SLUTAR_BARA) {
  test(`${fil} bar inte langre vyra-wishlist`, () => {
    assert.doesNotMatch(las(fil), /vyra-wishlist/,
      'en pensionerad nyckel ska inte synkas, sakerhetskopieras eller folja med en overlay');
  });
}

test('session-state projicerar inte langre nyckeln', () => {
  const src = las('session-state.js');
  const extra = src.match(/const EXTRA_KEYS\s*=\s*\[([^\]]*)\]/);
  assert.ok(extra, 'EXTRA_KEYS hittades inte');
  assert.doesNotMatch(extra[1], /vyra-wishlist/, 'nyckeln projiceras fortfarande som en levande extra');
});

// ---- 3. men den torkas fortfarande --------------------------------------------------------------

test('session-state har en lista over pensionerade nycklar', () => {
  const src = las('session-state.js');
  const retired = src.match(/const RETIRED_KEYS\s*=\s*\[([^\]]*)\]/);
  assert.ok(retired, 'RETIRED_KEYS saknas — da torkas gammal data aldrig');
  assert.match(retired[1], /vyra-wishlist/, 'vyra-wishlist star inte med bland de pensionerade');
});

test('pensionerade nycklar torkas nar ett konto lamnas', () => {
  // Det har ar hela poangen med ovningen. Loopen som tommer lagringen vid kontobyte maste tacka
  // bade de levande extras och de pensionerade.
  const src = las('session-state.js');
  const rad = src.split('\n').find(l => /storage\.removeItem\(key\)/.test(l) && /for \(const key of/.test(l));
  assert.ok(rad, 'hittade inte loopen som torkar nycklar vid kontobyte');
  assert.match(rad, /RETIRED_KEYS/,
    `torkningen tacker inte de pensionerade nycklarna: ${rad.trim()}`);
});

test('RETIRED_KEYS gar att lasa utifran', () => {
  // Sa ett test kan kontrollera listan i stallet for att lita pa en regex mot kallkoden.
  assert.match(las('session-state.js'), /RETIRED_KEYS[,\s}]/,
    'listan exponeras inte i modulens API');
});

// ---- 4. inget halvvagsläge ----------------------------------------------------------------------

test('nyckeln ar antingen levande eller pensionerad, aldrig bada', () => {
  const src = las('session-state.js');
  const extra = (src.match(/const EXTRA_KEYS\s*=\s*\[([^\]]*)\]/) || [, ''])[1];
  const retired = (src.match(/const RETIRED_KEYS\s*=\s*\[([^\]]*)\]/) || [, ''])[1];
  const bada = /vyra-wishlist/.test(extra) && /vyra-wishlist/.test(retired);
  assert.equal(bada, false, 'nyckeln star i bada listorna — da projiceras den OCH torkas');
});

test('de andra extras ar ororda', () => {
  // Pensioneringen far inte rycka med sig grannarna.
  const src = las('session-state.js');
  const extra = (src.match(/const EXTRA_KEYS\s*=\s*\[([^\]]*)\]/) || [, ''])[1];
  for (const nyckel of ['vyra-extras', 'vyra-action-event-v2', 'vyra-favorite-widgets']) {
    assert.match(extra, new RegExp(nyckel), `${nyckel} forsvann ur EXTRA_KEYS`);
  }
  for (const fil of ['cloud-sync.js', 'state-backup.js', 'overlay-access.js']) {
    for (const nyckel of ['vyra-extras', 'vyra-favorite-widgets']) {
      assert.match(las(fil), new RegExp(nyckel), `${fil} tappade ${nyckel}`);
    }
  }
});
