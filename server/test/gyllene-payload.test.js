'use strict';
// GYLLENE-PAYLOADPROVET — molnledet (#354, etapp 1–2).
//
// En verklig payloadform körs genom den VERKLIGA koden, led för led, och fältuppsättningen
// asserteras där den korsar varje skarv:
//
//   rå payload → normalizer.giftFields/baseUser → cloudEvent() → event-bus.cleanEvent()
//
// VARFÖR: varje led är i dag provat mot SITT EGET antagande, och fogen mellan dem är oprovad. Båda
// sviterna är gröna, och buggen syns först i en sändning. Sömnvaktsrevisionen 2026-09-06 hittade sju
// sådana skarvar; #349 (cloudEvent tappade name, coins, isAnonymous, isModerator) är den som det här
// provet är byggt för att fälla.
//
// VAD SOM INTE INGÅR, OCH VARFÖR DET STÅR HÄR I STÄLLET FÖR ATT TIGAS IHJÄL:
//
//   · Byteledet (goal-sse sseChunk) — etapp 3 i #354. Ramformerna och `id:`-raden bor där.
//   · Konsumentledet (live-client, base-widget, overlay-access) — etapp 4. Det är där
//     enhetsfrågan och id-rymderna avgörs, och där #351 (NFKC nådde en av två familjer) bor.
//   · Desktopens cleanEvent (#350) — den är redan vaktad av
//     electron-app/test/vitlistans-paritet.test.js, som körs i windows-installer-jobbet.
//
// KORPUSENS HÄRKOMST STÅR PER FIXTUR. En syntetisk payload utan uppmätt förlaga återskapar felet
// från tests/battle-mvp-dedup.test.js, där nio gröna prov vilade på en form produktionen aldrig
// sände. Varje fixtur nedan pekar därför ut var formen är uppmätt.
//
// ⚠️ EN MASKERAD INSPELNING KAN ALDRIG PRÖVA TECKEN. inspelare.js maskerar alla namnfält till
// `namn#hash`, så tecken- och NFKC-beteende går inte att mäta ur en inspelning — det var precis
// buggen i #342/#351. Den delen kräver den syntetiska uppsättningen i etapp 4.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('node:path');

const N = require(path.join(__dirname, '..', '..', 'tiktok-bridge', 'normalizer.js'));
const { cleanEvent, ALLOWED } = require('../event-bus.js');

// ---- KORPUS ------------------------------------------------------------------------------------
//
// HÄRKOMST: formen är den v3-gåvomeddelandet som tiktok-bridge/test/fixtures/gift-frames.js
// transkriberade ur diagnostikkörningen 2026-08-03, utökad med de fält senare skarpa mätningar
// namngav: `toUser` (#360, uppmätt 2026-09-06, 16 av 71 gåvor bar det) och användarflaggorna i
// `userIdentity` (#349). Inga identiteter — namnen är syntetiska med flit.
const VART_ANKARE = '7276185677820527649';

const GAVA = () => ({
  common: { msgId: 'msg-0001' },
  user: {
    userId: '111', uniqueId: 'anna', nickname: 'Anna',
    avatarThumb: { urlList: ['https://cdn.example/anna.jpg'] }
  },
  // userIdentity ligger pa DATA-niva, inte under user. Uppmatt: identityOf() i normalizer.js laser
  // data?.userIdentity. Forsta utkastet la den under user och fick isModerator=false — en fixtur
  // som gissar strukturen provar ingenting.
  userIdentity: { isModeratorOfAnchor: true, isFollowerOfAnchor: true, isSubscriberOfAnchor: false },
  giftDetails: { giftId: '5655', giftName: 'Rose', diamondCount: 10 },
  giftImage: { giftPictureUrl: 'https://cdn.example/rose.png' },
  repeatCount: 3, repeatEnd: true
});

// Samma gåva, men till en MEDVÄRD. TikTok märker mottagaren i `toUser`; fram till #360 lästes det
// inte, och 68 % av diamanterna i en multi-guest-sändning räknades som värdens.
const GAVA_TILL_MEDVARD = () => ({ ...GAVA(), toUser: { id: '999', nickname: 'Medvärden' } });

// Fälten en gåva SKA bära ut ur molnledet. Listan är avsiktligt uttömmande: ett fält som tyst
// försvinner ska fälla provet, inte glida igenom för att ingen asserterade just det.
// ⚠️ MOLNET DÖPER OM TVÅ FÄLT, och det är inte uppenbart från något enskilt led:
//
//     normalizer          molnet
//     profileImage   ->   profileUrl
//     coins          ->   value        (via coins ?? points ?? score)
//
// Ett första utkast av det här provet asserterade normalizerns namn och föll — på kod som var
// korrekt. Namnbytet är en skarv i sig, och att skriva ut det här är halva poängen med filen:
// nästa läsare ska slippa göra om felet.
const GAVANS_FALT = [
  'id', 'type', 'userId', 'username', 'name', 'profileUrl',
  'giftId', 'giftName', 'giftImage', 'diamonds', 'value', 'count',
  'isAnonymous', 'isModerator', 'isFollower', 'isSubscriber',
  'fanClubLevel', 'gifterLevel', 'toUserId', 'tillVarden', 'at'
];

// Kör hela molnledet. Varje led är den RIKTIGA funktionen — ingen attrapp, ingen omskrivning.
function genomKedjan(payload, ankare = VART_ANKARE) {
  const falt = N.giftFields(payload, ankare);
  const moln = N.cloudEvent('evt-1', 'GIFT', falt, 1757000000000);
  return { falt, moln, ren: cleanEvent(moln) };
}

// ---- SKARVEN normalizer -> cloudEvent -> cleanEvent ---------------------------------------------

// ⚠️ VAD DET HÄR PROVET INTE KAN FÅNGA, uppmätt när provet mutationsprövades mot #349:
//
// cleanEvent() bygger ett objekt med ALLA nycklar och tomma förval. Ett fält som tappas TIDIGARE i
// kedjan finns därför kvar som nyckel med tomt värde, och `namn in ren` är fortfarande sant.
// Närvaroprovet fångar alltså bara en förlust i SISTA ledet.
//
// Det är därför de värdebärande proven under detta bär tyngden: mutationen som tog bort name och
// isModerator ur cloudEvent fälldes av "användarflaggorna når ut", inte av listan här. Listan finns
// för att ett BORTTAGET fält i cleanEvent ska märkas, och för att den som lägger till ett fält ska
// tvingas uppdatera den medvetet — samma skäl som helformen i normalizer.test.js.
test('en gåva bär samma fält hela vägen ut — inget tappas i sista ledet', () => {
  const { ren } = genomKedjan(GAVA());

  for (const namn of GAVANS_FALT) {
    assert.ok(namn in ren,
      `fältet "${namn}" försvann någonstans mellan normalizer och cleanEvent. Det är exakt formen `
      + 'på #349: fyra fält räknades fram vid källan och nådde aldrig widgeten. Båda sidornas egna '
      + 'prov var gröna, för var och en provade sitt eget antagande och inte fogen.');
  }
});

test('KONTROLLMÄTNING: kedjan ger faktiskt ett event, och typen överlever', () => {
  // Utan den här hade tabellen ovan kunnat vara grön mot ett tomt objekt om cleanEvent någon gång
  // började returnera null — `namn in {}` är falskt, men en tom lista itereras inte alls.
  const { ren } = genomKedjan(GAVA());
  assert.ok(ren && typeof ren === 'object', 'cleanEvent gav inget event');
  assert.equal(ren.type, 'gift');
  assert.ok(ALLOWED.has('gift'), 'typen står inte i event-bussens lista och når då ingen widget');
  assert.equal(GAVANS_FALT.length >= 20, true, 'fältlistan har krympt — då mäter provet mindre än det ska');
});

test('ENHETEN är diamanter, och den överlever hela vägen', () => {
  // coins är vad TITTAREN betalar, diamanter vad KREATÖREN får — de skiljer sig med ungefär faktor
  // två. Ett led som byter enhet syns inte i en fältlista, bara i talet.
  const { ren } = genomKedjan(GAVA());

  assert.equal(ren.diamonds, 30, 'tre rosor à 10 diamanter är 30 diamanter');
  assert.equal(ren.count, 3, 'repeatCount skulle burits ut som antal');
  assert.equal(ren.value, ren.diamonds,
    'value och diamonds ska bära samma tal FÖR EN GÅVA — klienterna läser olika fält, och en '
    + 'skillnad här betyder att widgeten visar olika siffra beroende på vilken ände som läser');
});

test('användarflaggorna når ut — det var halva #349', () => {
  const { ren } = genomKedjan(GAVA());

  assert.equal(ren.isModerator, true, 'isModerator tappades');
  assert.equal(ren.isFollower, true, 'isFollower tappades');
  assert.equal(ren.isSubscriber, false, 'isSubscriber ska vara false, inte saknas');
  assert.equal(ren.name, 'Anna', 'visningsnamnet tappades');
  assert.equal(ren.isAnonymous, false);
});

test('en gåva till en MEDVÄRD märks ut hela vägen (#360)', () => {
  // 68 % av diamanterna i en multi-guest-sändning gick till medvärdar och räknades som värdens.
  // Markeringen måste överleva båda skarvarna, annars är statistiken fel igen.
  const till = genomKedjan(GAVA()).ren;
  const fran = genomKedjan(GAVA_TILL_MEDVARD()).ren;

  assert.equal(till.tillVarden, true, 'en gåva utan toUser tillhör värden');
  assert.equal(fran.tillVarden, false,
    'gåvan till medvärden märktes inte — då räknas den som värdens, vilket är #360 tillbaka');
});

test('FÖRVALET ÄR FÖRSIKTIGT: utan ankar-id filtreras ingenting bort', () => {
  // Ett filter som rör intäktssiffror ska ha fel åt det försiktiga hållet. Vet vi inte vilken sida
  // som är vår ska gåvan räknas som värdens, inte kastas.
  const utan = genomKedjan(GAVA_TILL_MEDVARD(), '').ren;
  assert.equal(utan.tillVarden, true,
    'utan ankar-id gissade koden att gåvan gick till någon annan — en gåva som faktiskt var värdens '
    + 'hade då försvunnit ur statistiken');
});

test('id:t överlever och behåller sin form', () => {
  // event-dedupe.js grenar på id:ts FORM: `^\d+-\d+$` går till högvattenmärket, allt annat till en
  // 512-ring. Byter formen sig i en skarv byter konsumenten gren utan att någon ändrat dedupen.
  const { ren } = genomKedjan(GAVA());
  assert.equal(ren.id, 'evt-1', 'id:t skrevs om i en skarv');
  assert.equal(typeof ren.at, 'number', 'tidsstämpeln är inte ett tal — den reser mellan tre klockor');
});

// ---- BLINDFLÄCK 2: `value` BÄR OLIKA ENHETER FÖR OLIKA TYPER -----------------------------------
//
// Det här är skarven en fält-till-fält-metod är blind för per konstruktion. Fältet finns i båda
// fallen, har rätt namn och rätt typ — och betyder två helt olika saker:
//
//   gift   value = diamanter för DEN HÄR gåvan
//   likes  value = TikToks LÖPANDE RUMSTOTAL (likeFields sätter points = data.total)
//
// cloudEvent gör `value = coins ?? points ?? score`, så en like faller igenom på points.
//
// ⚠️ OCH BÅDA KLIENTINGÅNGARNA GÖR `if (e.coins == null && e.value != null) e.coins = e.value`
// UTAN TYPKONTROLL — live-client.js:131 och base-widget.js:24. På molnvägen får varje like-event
// därmed coins = hela rummets liketotal. Tre konsumenter räddar sig i dag med varsin egen grind;
// ingenting tvingar nästa att göra det.
//
// Provet LAGAR inte det — det är etapp 4 och rör klientfiler. Det PINNAR skillnaden, så att den som
// bygger den fjärde konsumenten ser den innan hen skriver raden i stället för efter en sändning.
test('value betyder DIAMANTER för en gåva och RUMSTOTAL för en like', () => {
  const gava = cleanEvent(N.cloudEvent('g1', 'GIFT',
    N.giftFields(GAVA(), VART_ANKARE), 1757000000000));

  // Uppmätt form: LIKE bär `count` för den här skuren och `total` för hela rummet.
  const like = cleanEvent(N.cloudEvent('l1', 'LIKE',
    N.likeFields({ user: { userId: '111', uniqueId: 'anna' }, count: 12, total: 4820 }), 1757000000000));

  assert.equal(gava.value, 30, 'en gåvas value ska vara dess diamanter');
  assert.equal(like.value, 4820,
    'en likes value ska vara rummets löpande total — den dagen det inte är sant har enheten bytts '
    + 'i en skarv, och varje konsument som läser value som "den här händelsens värde" visar fel tal');
  assert.equal(like.count, 12, 'count är skurens storlek, inte totalen');

  // Det farliga är att de INTE går att skilja på fältnamn eller typ.
  assert.equal(typeof gava.value, typeof like.value, 'samma typ');
  assert.ok(gava.value !== like.count && like.value !== like.count,
    'kontrollmätning: talen måste skilja sig, annars bevisar provet ingenting');
});

test('en like bär INGA gåvofält — annars räknas den som en gåva någonstans', () => {
  const like = cleanEvent(N.cloudEvent('l2', 'LIKE',
    N.likeFields({ user: { userId: '111', uniqueId: 'anna' }, count: 12, total: 4820 }), 1757000000000));

  assert.equal(like.diamonds, 0, 'en like gav diamanter — då syns den i intäktssiffran');
  assert.equal(like.giftName, '', 'en like bar ett gåvonamn');
  assert.equal(like.giftId, '', 'en like bar ett gift-id');
});
