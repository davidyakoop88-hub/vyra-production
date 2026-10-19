'use strict';
// PANELREGISTRET (vyra-panelregister.js) — ren data, provas utan DOM.
//
// Registret är kontraktet mellan familjernas poster och panelramen. Två saker får aldrig bli
// tysta: en felstavad post (då visas gammal panel och ingen märker varför) och två poster för samma
// modell (då avgör laddordningen vilken panel som syns).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const KALLA = fs.readFileSync(path.join(__dirname, '..', 'vyra-panelregister.js'), 'utf8');

function nyttRegister() {
  const window = {};
  vm.runInNewContext(KALLA, { window });
  return window.VyraPanelregister;
}

const giltig = (over = {}) => Object.assign({
  typ: 'templateHeartGoal',
  modell: w => w.heartTheme || 'classic',
  galler: ['classic'],
  kontroller: [
    { sektion: 2, typ: 'text', falt: 'heartTitle', etikett: 'Rubrik', legacyId: '#heartTitle' },
    { sektion: 3, typ: 'std-position', utan: ['lager'] },
    { kalla: 'exempel', typ: 'text', falt: 'provNamn', etikett: 'Namn' },
    { sektion: 2, kalla: 'live', typ: 'text' },
    { sektion: 7, typ: 'std-aterstall' },
  ],
  utseendeFalt: ['heartColor'],
}, over);

test('registret är tomt i PR 1 — varje modell får dagens panel', () => {
  const R = nyttRegister();
  assert.equal(R.poster().length, 0);
  assert.equal(R.hitta({ type: 'templateHeartGoal', heartTheme: 'classic' }), null);
});

test('sju sektioner med rubriker i specens ordning', () => {
  const R = nyttRegister();
  assert.equal(Object.keys(R.SEKTIONER).join(','), '1,2,3,4,5,6,7');
  assert.equal(R.SEKTIONER[1], '▶ Testa widget');
  assert.equal(R.SEKTIONER[7], 'Återställ utseende');
});

test('en giltig post hittas för sin modell och bara för den', () => {
  const R = nyttRegister();
  const post = R.definiera(giltig());
  assert.equal(R.hitta({ type: 'templateHeartGoal', heartTheme: 'classic' }), post);
  assert.equal(R.hitta({ type: 'templateHeartGoal' }), post, 'modell() faller tillbaka på classic');
  assert.equal(R.hitta({ type: 'templateHeartGoal', heartTheme: 'dark' }), null);
  assert.equal(R.hitta({ type: 'templateTopCoins' }), null);
  assert.equal(R.hitta(null), null);
});

test('en post utan galler gäller alla modeller av typen', () => {
  const R = nyttRegister();
  const post = R.definiera(giltig({ galler: undefined, modell: undefined }));
  assert.equal(R.hitta({ type: 'templateHeartGoal', heartTheme: 'dark' }), post);
});

test('två poster för samma modell avvisas', () => {
  const R = nyttRegister();
  R.definiera(giltig());
  assert.throws(() => R.definiera(giltig()), /redan en post/);
  // Skilda modeller av samma typ går bra.
  assert.doesNotThrow(() => R.definiera(giltig({ galler: ['dark'] })));
});

test('felstavade poster avvisas med ett läsbart fel', () => {
  const R = nyttRegister();
  const fall = [
    [giltig({ typ: '' }), /typ saknas/],
    [giltig({ kontroller: [{ sektion: 8, typ: 'text', falt: 'a' }] }), /sektion måste vara 1–7/],
    [giltig({ kontroller: [{ sektion: 2, typ: 'reglage', falt: 'a' }] }), /okänd typ/],
    [giltig({ kontroller: [{ sektion: 2, typ: 'text' }] }), /falt saknas/],
    [giltig({ kontroller: [{ sektion: 2, typ: 'text', falt: 'a', kalla: 'tiktok' }] }), /okänd kalla/],
    [giltig({ kontroller: [{ sektion: 5, typ: 'farg', falt: 'a', arv: 'accent' }] }), /okänt arv/],
    [giltig({ kontroller: [{ sektion: 2, typ: 'knapp', etikett: 'X' }] }), /knapp kräver id/],
    [giltig({ kontroller: [{ sektion: 2, typ: 'text', falt: 'a', utan: ['x'] }] }), /utan gäller bara std-block/],
    [giltig({ utseendeFalt: 'accent' }), /utseendeFalt/],
    [giltig({ modell: undefined }), /galler kräver modell/],
  ];
  for (const [post, fel] of fall) {
    assert.throws(() => R.definiera(post), fel);
  }
  assert.equal(R.poster().length, 0, 'en avvisad post får inte ligga kvar');
});

test('tabort tar bort en post, och poster() är en kopia', () => {
  const R = nyttRegister();
  const post = R.definiera(giltig());
  const lista = R.poster();
  lista.length = 0;
  assert.equal(R.poster().length, 1);
  assert.equal(R.tabort(post), true);
  assert.equal(R.hitta({ type: 'templateHeartGoal' }), null);
  assert.equal(R.tabort(post), false);
});

test('registret rör ingen DOM', () => {
  // Ren data: inga document-, querySelector- eller innerHTML-anrop i filen.
  const kod = KALLA.replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(kod, /document\.|querySelector|innerHTML/);
});

test('media: medietyp är bild, video eller gava, lagring är url eller meta', () => {
  const R = nyttRegister();
  const med = k => giltig({ kontroller: [Object.assign({ sektion: 2, typ: 'media', falt: 'profileImage' }, k)] });
  // Listorna kommer från en annan vm-kontext; jämför innehållet, inte prototypen.
  assert.equal(R.validera(med({})).length, 0);
  assert.equal(R.validera(med({ medietyp: 'video', lagring: 'meta' })).length, 0);
  assert.match(R.validera(med({ medietyp: 'ljud' })).join(), /okänd medietyp "ljud"/);
  assert.match(R.validera(med({ lagring: 'fil' })).join(), /lagring/);
  assert.match(R.validera(med({ falt: undefined })).join(), /falt saknas/);
  // gava (PR 9, Gift Campaign): en gåva ur familjens galleri, aldrig en sökväg i panelen.
  assert.equal(R.validera(med({ medietyp: 'gava', falt: 'giftImage0' })).length, 0);
  assert.equal([...R.MEDIETYPER].join(), 'bild,video,gava');
});
