'use strict';
// Ra-inspelaren — ett lokalt felsokningsverktyg som aldrig far kosta en sandning.
//
// VARFOR DEN FINNS. docs/live-verifiering.md listar fyra saker som bara gar att avgora i sandning,
// och roadmapens LINK_MIC_ARMIES vantar pa samma sak: nagon maste hinna lasa loggen mitt i ett
// femminuters battle. Med raa payloads pa fil gar varje falt att utveckla offline.
//
// FYRA SAKER SOM AR LATTA ATT TRO FEL OM I DEN HAR FILEN:
//
//   1. MASKERINGEN FAR INTE SLA SONDER FORMEN. Inspelningens hela syfte ar att lara sig faltnamn
//      och typer. En maskering som gjorde om tal till strangar hade gjort filen vardelos — och
//      det ar just i talen (score, diamondScore, rewardMultiple) battle-datan bor.
//   2. HASHARNA MASTE VARA STABILA. Samma tittare ska ge samma hash, annars gar en arme-lista
//      inte att aggregera i efterhand och LINK_MIC_ARMIES sager ingenting.
//   3. INSPELADE TYPER FAR ALDRIG NA MOLNET. Inspelaren prenumererar bredare an bryggan skickar.
//      Provet lyfter ut prenumerationsblocket ur bridge.js-kallan och laser vilka anrop det gor.
//   4. ETT DISKFEL FAR INTE FALLA BRYGGAN. En oskrivbar katalog stanger av inspelningen och
//      skriver EN rad — sandningen fortsatter.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const I = require('../inspelare.js');

const tmpKatalog = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vyra-inspelning-'));
const stadning = [];
test.after(() => { for (const k of stadning) { try { fs.rmSync(k, { recursive: true, force: true }) } catch (_) {} } });
const nyKatalog = () => { const k = tmpKatalog(); stadning.push(k); return k };

const vanta = ms => new Promise(r => setTimeout(r, ms));
const raderna = vag => fs.readFileSync(vag, 'utf8').trim().split('\n').filter(Boolean).map(r => JSON.parse(r));

// En payload i den form tiktok-live-connector levererar den, med bade PII och battle-tal.
const armePayload = () => ({
  battleId: '7123456789',
  hostscore: 41200,
  battleUsers: [
    { userId: '6812345678901234567', secUid: 'MS4wLjABAAAA_hemlig', uniqueId: 'lisa_live',
      nickname: 'Lisa ✨', avatarThumb: 'https://p16-sign.tiktokcdn.com/aweme/100x100/abc.jpeg',
      score: 3200, diamondScore: 980, isTop: true },
    { userId: '6899999999999999999', secUid: 'MS4wLjABAAAA_annan', uniqueId: 'kim',
      nickname: 'Kim', avatarThumb: 'https://p19-sign.tiktokcdn.com/aweme/100x100/def.jpeg',
      score: 1150, diamondScore: 40, isTop: false },
  ],
  timestamp: 1723900000000,
});

// ---- 1-4. maskeringen --------------------------------------------------------------------------

test('1: maskeringen behåller nycklar och typer, byter bara PII-värden', () => {
  const ut = I.maskera(armePayload());
  const anv = ut.battleUsers[0], raa = armePayload().battleUsers[0];

  assert.deepEqual(Object.keys(ut), Object.keys(armePayload()), 'nycklar på toppnivå ändrades');
  assert.deepEqual(Object.keys(anv), Object.keys(raa), 'nycklar i battleUsers ändrades');
  for (const falt of ['userId', 'secUid', 'uniqueId', 'nickname', 'avatarThumb']) {
    assert.equal(typeof anv[falt], 'string', `${falt} bytte typ`);
    assert.notEqual(anv[falt], raa[falt], `${falt} lämnades omaskerat`);
  }
  assert.match(anv.userId, /^id#[0-9a-f]{8}$/);
  assert.match(anv.nickname, /^namn#[0-9a-f]{8}$/);
  assert.match(anv.avatarThumb, /^https:\/\/p16-sign\.tiktokcdn\.com\//,
    'avatar-URL:en förlorade sin host — då går CDN-varianten inte att känna igen');
});

test('2: samma id ger samma hash, olika id ger olika — aggregeringen överlever', () => {
  const a = I.maskera(armePayload()), b = I.maskera(armePayload());
  assert.equal(a.battleUsers[0].userId, b.battleUsers[0].userId,
    'samma tittare fick olika hash i två körningar — då går ingen armé-lista att summera');
  assert.notEqual(a.battleUsers[0].userId, a.battleUsers[1].userId, 'två tittare kolliderade');
  assert.equal(a.battleUsers[0].nickname, b.battleUsers[0].nickname);
});

test('3: tal, booleaner och tidsstämplar rörs inte — battle-datan är intakt', () => {
  const raa = armePayload(), ut = I.maskera(raa);
  assert.equal(ut.hostscore, 41200);
  assert.equal(ut.timestamp, 1723900000000);
  assert.equal(ut.battleUsers[0].score, 3200);
  assert.equal(ut.battleUsers[0].diamondScore, 980);
  assert.equal(ut.battleUsers[0].isTop, true);
  assert.equal(ut.battleUsers[1].isTop, false);
  // battleId är en sträng men INTE ett PII-fält — matchens identitet måste överleva, annars går
  // två rader från samma match inte att koppla ihop.
  assert.equal(ut.battleId, '7123456789');
});

test('4: nästlade objekt och arrayer maskeras rekursivt', () => {
  const djup = { a: { b: [{ c: { nickname: 'Anna', comment: 'hej hej', tal: 7 } }] } };
  const ut = I.maskera(djup);
  assert.match(ut.a.b[0].c.nickname, /^namn#/);
  assert.equal(ut.a.b[0].c.comment, '<text 7 tecken>');
  assert.equal(ut.a.b[0].c.tal, 7);
});

// ---- 5. avstängd som default -------------------------------------------------------------------

test('5: avstängd inspelare rör inte disken alls', () => {
  const katalog = path.join(nyKatalog(), 'skapas-aldrig');
  const inspelare = I.skapa({ pa: false, katalog, anvandare: 'lisa', logg: () => {} });

  assert.equal(inspelare.aktiv, false);
  assert.equal(inspelare.raa('LINK_MIC_ARMIES', armePayload()), false);
  assert.equal(inspelare.utgaende('gift', { username: 'lisa' }), false);
  assert.equal(fs.existsSync(katalog), false, 'katalogen skapades trots att inspelningen var av');
});

// ---- 6. brandväggen mot molnet -----------------------------------------------------------------

test('6: en enbart inspelad typ når aldrig vidarebefordran', () => {
  // Regeln går inte att prova genom att köra bryggan — den kräver en riktig TikTok-anslutning.
  // I stället läses prenumerationsblocket ur källan: de lyssnare inspelningen lägger till får
  // anropa inspelare.raa och ingenting annat.
  const kalla = fs.readFileSync(path.join(__dirname, '..', 'bridge.js'), 'utf8');
  const start = kalla.indexOf('if (inspelare.aktiv) {');
  assert.ok(start > 0, 'inspelningens prenumerationsblock hittades inte i bridge.js');
  const block = kalla.slice(start, kalla.indexOf('connection.connect()', start));

  assert.match(block, /inspelare\.raa\(/, 'blocket spelar inte in något alls');
  assert.doesNotMatch(block, /sendEvent\s*\(/,
    'ett inspelningslyssnare skickar till molnet — event-bussens ALLOWED hade avvisat typen, men '
    + 'först efter en 400-rad per armé-event, flera gånger i minuten under en match');
  assert.doesNotMatch(block, /reportToParent\s*\(/, 'inspelningen rapporterar till managern');
  assert.doesNotMatch(block, /postJson|fetch\s*\(/, 'inspelningen gör ett nätverksanrop');

  // Och att den bredare ytan verkligen är bredare: LINK_MIC_ARMIES prenumereras inte av bryggan
  // själv, vilket är hela anledningen till att vi inte vet dess form.
  const utanInspelning = kalla.slice(0, start);
  assert.doesNotMatch(utanInspelning, /WebcastEvent\.LINK_MIC_ARMIES/,
    'bryggan prenumererar redan på LINK_MIC_ARMIES — då mäter provet fel sak');
  assert.ok(I.TYPER_DEFAULT.includes('LINK_MIC_ARMIES'), 'default-uppsättningen saknar den typ vi bygger för');
});

// ---- 7-8. diskgränsen och felvägen -------------------------------------------------------------

test('7: vid taket upphör skrivningen och inspelaren stänger av sig', () => {
  const katalog = nyKatalog();
  const loggat = [];
  // Taket måste rymma flera rader — är det mindre än EN rad skrivs ingenting alls, och då mäter
  // provet "raden var för stor" i stället för "taket stoppade en pågående inspelning".
  const inspelare = I.skapa({ pa: true, katalog, anvandare: 'lisa', maxByte: 2500, logg: m => loggat.push(m) });

  let skrivna = 0;
  for (let i = 0; i < 50; i++) if (inspelare.raa('LINK_MIC_ARMIES', armePayload())) skrivna++;

  assert.ok(skrivna >= 1, 'ingenting skrevs alls — provet mäter fel sak');
  assert.ok(skrivna < 50, 'taket stoppade aldrig skrivningen');
  assert.equal(inspelare.aktiv, false);
  assert.ok(inspelare.skrivet <= 2500, `skrev ${inspelare.skrivet} byte med taket 2500`);
  assert.ok(loggat.some(m => m.includes('taket')), `taket loggades inte: ${JSON.stringify(loggat)}`);
});

test('8: en oskrivbar katalog stänger av inspelningen med EN rad, utan att kasta', () => {
  const loggat = [];
  const inspelare = I.skapa({
    pa: true, katalog: '/dev/null/gar-inte-att-skapa', anvandare: 'lisa',
    logg: m => loggat.push(m),
    fsModul: { mkdirSync() { throw new Error('EACCES') } },
  });

  assert.doesNotThrow(() => inspelare.raa('LINK_MIC_ARMIES', armePayload()));
  assert.equal(inspelare.aktiv, false, 'inspelningen fortsatte trots att katalogen inte gick att skapa');
  assert.equal(loggat.length, 1, `en rad förväntades, fick ${loggat.length}`);
  assert.match(loggat[0], /kunde inte skapa/);
});

// ---- 9-10. filen på disk, kartan och gitignore --------------------------------------------------

test('9: filen är JSON Lines med en metarad först, och Dockerfile namnger modulen', async () => {
  const katalog = nyKatalog();
  const inspelare = I.skapa({ pa: true, katalog, anvandare: 'lisa', logg: () => {} });
  inspelare.metarad({ bibliotek: '2.4.0' });
  inspelare.raa('LINK_MIC_ARMIES', armePayload());
  inspelare.utgaende('gift', { username: 'lisa', giftName: 'Rose' });
  const vag = inspelare.vag;
  await inspelare.stang();

  const rader = raderna(vag);
  assert.equal(rader.length, 3);
  assert.equal(rader[0].typ, '_meta');
  assert.equal(rader[0].maskad, true, 'metaraden säger inte att filen är maskerad');
  assert.equal(rader[0].bibliotek, '2.4.0');
  assert.equal(rader[1].typ, 'LINK_MIC_ARMIES');
  assert.equal(rader[1].kalla, 'inspelad');
  assert.equal(rader[2].typ, '_utgaende');
  assert.match(rader[2].falt.username, /^namn#/, 'det utgående fältet lämnades omaskerat');

  assert.ok(fs.existsSync(path.join(katalog, 'LAS-MIG.txt')), 'mappen saknar sin förklaring');
  const dockerfile = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /inspelare\.js/, 'Dockerfile-vitlistan namnger inte inspelare.js');
  // Filnamnet bär aldrig användarnamnet i klartext.
  assert.doesNotMatch(path.basename(vag), /lisa/);
});

test('10: .gitignore täcker inspelningsmappen', () => {
  const gitignore = fs.readFileSync(path.join(__dirname, '..', '..', '.gitignore'), 'utf8');
  assert.match(gitignore, /tiktok-bridge\/inspelningar\//,
    'inspelningar riskerar att committas — de bär tidsstämplar och stabila hashar per tittare');
});

// ---- typvalet ----------------------------------------------------------------------------------

test('typvalet: tomt ger battle-familjen, "alla" ger allt, en lista ger exakt den', async () => {
  assert.deepEqual([...I.typerFranMiljo('')], I.TYPER_DEFAULT);
  assert.equal(I.typerFranMiljo('alla'), null);
  assert.equal(I.typerFranMiljo('ALLA'), null);
  assert.deepEqual([...I.typerFranMiljo('envelope, rank_update')], ['ENVELOPE', 'RANK_UPDATE']);

  const inspelare = I.skapa({ pa: true, katalog: nyKatalog(), typer: 'ENVELOPE', logg: () => {} });
  assert.equal(inspelare.vill('ENVELOPE'), true);
  assert.equal(inspelare.vill('envelope'), true, 'typvalet är skiftlägeskänsligt');
  assert.equal(inspelare.vill('LINK_MIC_ARMIES'), false);
  await vanta(0);
});
