'use strict';
// LIGABRICKAN — det enda i TikToks ström som säger var VÄRDEN ligger. #367 del 3
//
// Streamern frågade "vilken nr är jag i rankning". Det gick inte att svara på ur `ranks`: den är en
// TITTARLISTA (noll av åtta ankar-id står någonsin i den) och dess `delta` är "0" i 30 910 av
// 30 910 förekomster. Ligabrickan är det närmaste svaret som finns i datan.
//
// UPPMÄTT över nio inspelningar (58 876 rader):
//
//   60 förekomster, UTESLUTANDE på battle-rader   — mot 6 347 för tittarlistan
//   leagueInfoMap och leagueScoreInfoMap delar nyckelrymd (12 av 12 nycklar i båda)
//   8 av kartans 12 nycklar är kända ankare, ett återkommer i varje sändning: värdens eget
//   ligor: league_A / league_B / league_C, tre bakgrundsfärger
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const N = require(path.join(__dirname, '..', '..', 'tiktok-bridge', 'normalizer.js'));
const { cleanEvent } = require('../event-bus');

const OSS = '7100000000000000001';
const DEM = '7100000000000000002';

// Formen är den uppmätta, inte den issuen beskrev: displayText/icon/shouldShow ligger INUTI
// leagueInfo, medan backgroundColor sitter direkt på posten.
const payload = (extra = {}) => ({
  leagueInfoMap: {
    [OSS]: {
      leagueInfo: {
        icon: { urlList: ['https://p16.tiktokcdn.com/class_rank/league_C_icon_v1.png'],
          uri: 'tos-alisg/class_rank/league_C_icon_v1.png', height: 14, width: 32 },
        displayText: { content: 'C1', color: '#C97D4A', darkModeColor: '#FFFFFF' },
        shouldShow: true,
      },
      backgroundColor: '#FCE7D9', darkModeBackgroundColor: '#6F4A30',
      separatorColor: '', leagueName: '',
    },
    [DEM]: {
      leagueInfo: { displayText: { content: 'A3', color: '#111111' }, shouldShow: true },
      backgroundColor: '#FFF0C8', leagueName: '',
    },
    ...(extra.karta || {}),
  },
  leagueScoreInfoMap: { [OSS]: { estimatedScore: '2' }, [DEM]: { estimatedScore: '1' } },
  ...extra.rot,
});

test('vår liga plockas, inte motståndarens', () => {
  // Samma mekanik som battle-poängen och medvärdsgåvorna: payloaden beskriver BÅDA sidorna, och
  // bara `mittAnkarId` säger vilken som är vår. Utan det hade brickan visat motståndarens liga.
  const oss = N.ligaFields(payload(), OSS);
  assert.equal(oss.ligaText, 'C1');
  assert.equal(oss.ligaPoang, 2);
  const dem = N.ligaFields(payload(), DEM);
  assert.equal(dem.ligaText, 'A3', 'kartan slås inte upp på id alls');
  assert.notEqual(oss.ligaText, dem.ligaText, 'båda sidorna gav samma liga');
});

test('utan ankar-id skickas INGENTING — hellre tomt än motståndarens bricka', () => {
  assert.deepEqual(N.ligaFields(payload(), ''), {});
  assert.deepEqual(N.ligaFields(payload(), undefined), {});
});

test('en tom eller saknad karta ger inga fält', () => {
  // Uppmätt: posten kan finnas utan innehåll. `leagueInfo` saknas då, och ett fält som ändå
  // skickades hade raderat en korrekt visad bricka hos klienten, som minns värdet mellan matcher.
  assert.deepEqual(N.ligaFields({}, OSS), {});
  assert.deepEqual(N.ligaFields({ leagueInfoMap: {} }, OSS), {});
  assert.deepEqual(N.ligaFields({ leagueInfoMap: { [OSS]: {} } }, OSS), {});
  assert.deepEqual(N.ligaFields({ leagueInfoMap: { [OSS]: { leagueInfo: {} } } }, OSS), {},
    'leagueInfo utan displayText gav ändå fält');
});

test('⚠️ leagueName är ALLTID tom — ligan får inte läsas därifrån', () => {
  // "" i samtliga 69 uppmätta poster. Fältet ser ut som det rätta och är alltid tomt; den som
  // "förbättrar" koden till att läsa det får en bricka som aldrig visar något.
  const ut = N.ligaFields(payload(), OSS);
  assert.equal(ut.ligaText, 'C1', 'ligan ska komma ur displayText.content');
  const utanNamn = N.ligaFields(payload({ karta: { [OSS]: {
    leagueInfo: { displayText: { content: 'B2' } }, leagueName: '' } } }), OSS);
  assert.equal(utanNamn.ligaText, 'B2', 'ett tomt leagueName fick brickan att försvinna');
});

test('shouldShow: falskt döljer, saknat visar', () => {
  // TikToks egen "visa inte den här brickan". Ett fält som saknas ska INTE dölja den — då hade en
  // äldre payloadform tystat brickan helt.
  const dolj = N.ligaFields(payload({ karta: { [OSS]: {
    leagueInfo: { displayText: { content: 'C1' }, shouldShow: false } } } }), OSS);
  assert.equal(dolj.ligaVisa, false);
  const utan = N.ligaFields(payload({ karta: { [OSS]: {
    leagueInfo: { displayText: { content: 'C1' } } } } }), OSS);
  assert.equal(utan.ligaVisa, true, 'en payload utan shouldShow dolde brickan');
});

test('poängen är villkorlig — en nolla hade sett ut som ett riktigt resultat', () => {
  const utanPoang = N.ligaFields({ leagueInfoMap: { [OSS]: {
    leagueInfo: { displayText: { content: 'C1' } } } } }, OSS);
  assert.ok(!('ligaPoang' in utanPoang), 'ligaPoang stämplades som 0 när kartan saknades');
  assert.equal(N.ligaFields(payload(), OSS).ligaPoang, 2);
});

// ---- hela kedjan: brygga -> cloudEvent -> cleanEvent -------------------------------------------
// Två vitlistor, inte tre. Skrivbordets cleanEvent (electron-app/local-server.js) bär inte heller
// winsUs eller battleId: battle-detaljer har aldrig gått den vägen, och källan `leagueInfoMap`
// läses bara av molnbryggan. Det är alltså inte en glömska utan en avgränsning.

test('fälten överlever cloudEvent och cleanEvent', () => {
  const falt = { ...N.battleFields(payload(), OSS), ...N.ligaFields(payload(), OSS) };
  const ut = cleanEvent(N.cloudEvent('b1', 'battle', falt));
  assert.equal(ut.ligaText, 'C1');
  assert.equal(ut.ligaIkon, 'https://p16.tiktokcdn.com/class_rank/league_C_icon_v1.png');
  assert.equal(ut.ligaFarg, '#C97D4A');
  assert.equal(ut.ligaBakgrund, '#FCE7D9');
  assert.equal(ut.ligaVisa, true);
  assert.equal(ut.ligaPoang, 2);
});

test('en händelse UTAN liga bär inga liga-fält alls', () => {
  // Det är hela skälet till den villkorliga formen: klienten minns brickan mellan matcher, och
  // brickan kommer 60 gånger per nio sändningar. Ett tomt fält i varje gåva, like och chattrad
  // hade raderat den tusentals gånger per sändning.
  for (const [typ, falt] of [['battle', N.battleFields({}, OSS)],
                             ['gift', N.giftFields({ giftDetails: { diamondCount: 1 } }, OSS)],
                             ['likes', N.likeFields({})]]) {
    const ut = cleanEvent(N.cloudEvent('x', typ, falt));
    const liga = Object.keys(ut).filter(k => k.startsWith('liga'));
    assert.deepEqual(liga, [], `${typ} bar liga-fält: ${liga.join(', ')}`);
  }
});

test('cleanEvent klipper och avvisar skräp i stället för att släppa igenom det', () => {
  const bas = { id: 'x', type: 'battle', ligaText: 'C1' };
  assert.equal(cleanEvent({ ...bas, ligaText: 'x'.repeat(200) }).ligaText.length, 32);
  assert.equal(cleanEvent({ ...bas, ligaIkon: 'y'.repeat(2000) }).ligaIkon.length, 1200);
  // Poängen faller BORT utanför spannet i stället för att klämmas: ett fel tal är sämre än inget.
  assert.equal(cleanEvent({ ...bas, ligaPoang: 5000 }).ligaPoang, undefined);
  assert.equal(cleanEvent({ ...bas, ligaPoang: -1 }).ligaPoang, undefined);
  assert.equal(cleanEvent({ ...bas, ligaPoang: 'abc' }).ligaPoang, undefined);
  // Utan text bärs ingen bricka, hur mycket annat som än skickas.
  const utanText = cleanEvent({ id: 'x', type: 'battle', ligaIkon: 'https://a/b.png', ligaFarg: '#fff' });
  assert.ok(!('ligaIkon' in utanText) && !('ligaFarg' in utanText),
    'delar av en bricka bars utan sin text — då renderas en tom bricka');
});

test('bridge.js skickar mittAnkarId till ligaFields', () => {
  // DEN ENDA MUTATION SOM GJORDE HELA FUNKTIONEN INERT UTAN ATT FÄLLA ETT PROV.
  //
  // Ändringen i bridge.js är ETT ORD. Tas det bort returnerar `ligaFields` ett tomt objekt för
  // varje payload — brickan slutar komma, och varje annat prov förblir grönt, eftersom de anropar
  // `ligaFields` DIREKT med ankar-id:t och därför aldrig rör kopplingen.
  //
  // Samma vakt och samma skäl som `battleFields` (2026-09-06) och `giftFields` (#360) har fått.
  // Den bor här, hos regeln den skyddar, och läser källan med readFileSync — aldrig `require` över
  // paketgränsen: CI kör `npm ci` per katalog.
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'tiktok-bridge', 'bridge.js'), 'utf8');
  assert.match(src, /N\.ligaFields\(\s*data\s*,\s*mittAnkarId\s*\)/,
    'bridge.js anropar ligaFields UTAN ankar-id — då är kartan aldrig uppslagbar och HELA ' +
    'ligabrickan är verkningslös, medan alla andra prov fortsätter vara gröna.');
  // Och den måste resa med battle-händelsen, som är den enda som bär kartan.
  // `[^)]*` gick INTE att anvanda: monstret maste passera parentesen i battleFields(...) for att
  // na fram. Provet fallde pa den forsta versionen — vakten matte att regexen kunde matcha, inte
  // att koden var riktig.
  assert.match(src, /sendEvent\('battle',[\s\S]{0,200}?N\.ligaFields/,
    'ligaFields kopplas inte till battle-händelsen — brickan kommer bara i den payloaden');
});
