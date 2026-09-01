'use strict';
// Nivåerna kommer från badgeList — inte från fansClub och payGrade.
//
// UPPMÄTT I SKARP SÄNDNING 2026-09-01 (inspelning med VYRA_INSPELNING_TYPER=alla, 3710 rader,
// 28,7 MB). Två mätvärden avgör hela den här filen:
//
//   fansClub          0 förekomster i HELA inspelningen
//   payGrade.level    0 i ALLA 1226 förekomster
//
// `baseUser` läste `user.fansClub.data.level` och `user.payGrade.level`. Det första fältet finns
// inte i tiktok-live-connector 2.4.0 över huvud taget; det andra finns men fylls aldrig. Alltså har
// fanClubLevel och gifterLevel varit **konstant 0** — och därmed har Fan Level Up (8 designer) och
// Gifter Level Up (9 designer) aldrig kunnat tända. Sjutton katalogknappar.
//
// PR #301 var nödvändig men inte tillräcklig: den stoppade molnet från att STRYKA fälten. Källan
// läste ändå fel plats. Ett fält som transporteras korrekt men alltid är 0 ser ut att fungera.
//
// VAR NIVÅERNA FAKTISKT LIGGER. I `user.badgeList`, åtskilda av `sceneType`:
//
//   sceneType 10   fanklubbsnivå   1269 förekomster, ALLA med privilegeLogExtra.level, spann 1-50
//   sceneType  8   nivå ("Lv.")     938 förekomster, ALLA med privilegeLogExtra.level, spann 1-34
//   sceneType 16   guardian-badge    27, level "0"
//   sceneType  6   top gifter       367
//   sceneType  1   moderator        123, level "0"
//
// TRE FÄLLOR SOM ALLA SER RIMLIGA UT I KÄLLKODEN:
//
//   1. IKONENS FILNAMN ÄR EN HINK, INTE NIVÅN. `grade_badge_icon_lite_lv30_v1.png` bärs av en
//      person på nivå 34, och `lv20` av en på 21. Filnamnet skiljer sig från den verkliga nivån i
//      1646 av fallen. Att parsa `lv(\d+)` ger alltså fel svar för de allra flesta.
//   2. `combine.str` BETYDER OLIKA SAKER. För nivåbadgen är den nivån ("34"). För fanklubbsbadgen
//      är den klubbens NAMN ("YOLO"). Samma fält, två betydelser.
//   3. ANDRA BADGES BÄR OCKSÅ `privilegeLogExtra.level` — moderator och guardian har den satt till
//      "0". "Första badgen med en nivå" plockar alltså en nolla från en moderator.
//
// RÖTT NU: baseUser läser fansClub och payGrade.
const test = require('node:test'), assert = require('node:assert/strict');
const N = require('../normalizer.js');

// ---- verkliga badges ur inspelningen -------------------------------------------------------------

const badge = (sceneType, level, over = {}) => Object.assign({
  sceneType, displayType: 4, priorityType: 20, position: 1,
  privilegeLogExtra: { dataVersion: '2', privilegeId: '7138382115757938468',
    privilegeVersion: '0', privilegeOrderId: '', level: String(level), startTime: '0', endTime: '0' }
}, over);

// En riktig persons badgeList: moderator, nivå 34, fanklubb 50 (YOLO), guardian.
const RIKTIG_BADGELIST = [
  badge(1, 0, { displayType: 2, priorityType: 10, position: 2 }),
  badge(8, 34, { combine: { str: '34', icon: { uri: 'webcast-va/grade_badge_icon_lite_lv30_v1.png' } } }),
  badge(10, 50, { priorityType: 30, combine: { str: 'YOLO', icon: { uri: 'webcast-va/fans_badge_icon_lv50_v4.png' } } }),
  badge(16, 0, { priorityType: 10, position: 2, combine: { icon: { uri: 'webcast-va/guardian-badge-icon-3.png' } } })
];

// payGrade finns i payloaden men ar ALLTID 0 — det ar precis det som gjorde buggen osynlig.
const anv = (over = {}) => ({ user: Object.assign({
  id: 'u1', displayId: 'lisa', nickname: 'Lisa',
  badgeList: RIKTIG_BADGELIST,
  payGrade: { name: '', nextName: '', level: 0, gradeIconList: [], score: '0' }
}, over) });

// ---- 1. nivåerna hittas ---------------------------------------------------------------------------

test('fanklubbsnivån läses ur badgeList sceneType 10', () => {
  assert.equal(N.baseUser(anv()).fanClubLevel, 50,
    'fanClubLevel är fortfarande 0 — Fan Level Up kan inte tända');
});

test('nivån läses ur badgeList sceneType 8', () => {
  assert.equal(N.baseUser(anv()).gifterLevel, 34,
    'gifterLevel är fortfarande 0 — Gifter Level Up kan inte tända');
});

test('badgen vinner över payGrade.level, som alltid är 0', () => {
  // KÄRNAN I BUGGEN. Fältet finns, ser giltigt ut, och är alltid 0. Läses det först vinner nollan
  // över den riktiga nivån bredvid, och widgeten förblir tyst — precis som i kväll.
  const u = N.baseUser(anv());
  assert.equal(u.gifterLevel, 34, 'payGrade.level=0 vann över badgens 34');
});

// ---- 2. de tre fällorna ---------------------------------------------------------------------------

test('ikonens filnamn används INTE som nivå', () => {
  // grade_badge_icon_lite_lv30 bars av en person pa niva 34. Filnamnet ar en hink.
  // Uppmatt: filnamn och verklig niva skiljer sig i 1646 fall.
  assert.equal(N.baseUser(anv()).gifterLevel, 34,
    'nivån blev 30 — filnamnets lvNN lästes i stället för privilegeLogExtra.level');
});

test('fanklubbens combine.str är ett NAMN, inte en nivå', () => {
  // "YOLO" ar klubbens namn. Lases den som niva blir resultatet NaN -> 0.
  assert.equal(N.baseUser(anv()).fanClubLevel, 50,
    'fanClubLevel blev inte 50 — combine.str ("YOLO") lästes som nivå');
});

test('moderatorns och guardians nollor läcker inte in', () => {
  // Bada bar privilegeLogExtra.level = "0". "Forsta badgen med en niva" plockar den nollan.
  const u = N.baseUser(anv());
  assert.notEqual(u.fanClubLevel, 0, 'en nolla från en annan badge vann');
  assert.notEqual(u.gifterLevel, 0, 'en nolla från en annan badge vann');
});

test('bara rätt sceneType räknas', () => {
  const baraModerator = N.baseUser(anv({ badgeList: [badge(1, 0), badge(6, 0), badge(16, 0)] }));
  assert.equal(baraModerator.fanClubLevel, 0);
  assert.equal(baraModerator.gifterLevel, 0);
});

// ---- 3. inget faller sönder -----------------------------------------------------------------------

test('en tittare utan badges ger 0, inte NaN', () => {
  const u = N.baseUser({ user: { displayId: 'ny', nickname: 'Ny' } });
  assert.equal(u.fanClubLevel, 0);
  assert.equal(u.gifterLevel, 0);
});

test('de gamla fälten fungerar fortfarande som reserv', () => {
  // fansClub sags aldrig i verklig trafik, men om TikTok aterinfor det ska det duga. Reserven
  // kostar ingenting och haller aven befintliga prov och desktopvagen vid liv.
  const u = N.baseUser({ user: { displayId: 'a', fansClub: { data: { level: 7 } }, payGrade: { level: 12 } } });
  assert.equal(u.fanClubLevel, 7, 'reserven fansClub.data.level slutade fungera');
  assert.equal(u.gifterLevel, 12, 'reserven payGrade.level slutade fungera');
});

test('badgen vinner över en reserv som säger något annat', () => {
  const u = N.baseUser(anv({ fansClub: { data: { level: 3 } }, payGrade: { level: 9 } }));
  assert.equal(u.fanClubLevel, 50, 'reserven vann över den uppmätta badgen');
  assert.equal(u.gifterLevel, 34, 'reserven vann över den uppmätta badgen');
});

test('skräpvärden i badgen ger 0, aldrig NaN eller negativt', () => {
  for (const trasig of ['', 'abc', '-4', null, undefined, {}]) {
    const u = N.baseUser(anv({ badgeList: [badge(10, trasig), badge(8, trasig)] }));
    assert.equal(u.fanClubLevel, 0, `fanClubLevel blev inte 0 för ${JSON.stringify(trasig)}`);
    assert.equal(u.gifterLevel, 0, `gifterLevel blev inte 0 för ${JSON.stringify(trasig)}`);
  }
});

// ---- 4. hela vägen till molneventet ---------------------------------------------------------------

test('nivåerna överlever cloudEvent — hela kedjan från badge till moln', () => {
  // Provet i #301 körde råpayload -> baseUser -> cloudEvent med en PÅHITTAD fansClub. Nu körs
  // samma kedja med den badgeList TikTok faktiskt skickade.
  const moln = N.cloudEvent('e1', 'chat', N.baseUser(anv()));
  assert.equal(moln.fanClubLevel, 50);
  assert.equal(moln.gifterLevel, 34);
});
