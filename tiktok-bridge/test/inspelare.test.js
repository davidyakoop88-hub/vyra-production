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

  // DET GAMLA PASTAENDET AR BORTA, och varfor spelar roll. Har stod tidigare att bryggan INTE
  // prenumererar pa LINK_MIC_ARMIES — "vilket ar hela anledningen till att vi inte vet dess form".
  // Formen ar uppmatt sedan 2026-09-02 och bryggan prenumererar numera: typen bar TikToks egen
  // MVP-lista vid battle-slut. Ett prov som kodar in "det har har vi inte gjort an" som en REGEL
  // faller nar arbetet blir gjort, och sager da ingenting om huruvida koden ar riktig.
  //
  // ERSATTNINGEN AR SMAL MED FLIT. Forsta forsoket generaliserade till "varje typ bryggan
  // prenumererar pa maste sta i redanLyssnade" — och det ar FEL: bryggan lyssnar pa
  // CONTROL_MESSAGE utan att vidarebefordra den, sa ingen sendEvent spelar in den och inspelaren
  // SKA lagga en egen lyssnare. Regeln som verkligen galler ar "varje typ bryggan VIDAREBEFORDRAR",
  // och den gar inte att harleda ur kallan utan att spara lyssnare till sendEvent. Hellre ett smalt
  // pastaende som ar sant an ett brett som ger falsklarm.
  const redan = kalla.match(/redanLyssnade\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(redan, 'hittade ingen redanLyssnade-lista i bridge.js');
  assert.match(redan[1], /'LINK_MIC_ARMIES'/,
    'bryggan vidarebefordrar LINK_MIC_ARMIES men typen saknas i redanLyssnade — inspelaren lagger '
    + 'en andra lyssnare och alla 305 arme-event per sandning hamnar dubbelt i filen');
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

// ---- 11-18. INVERSIONEN (#357) -----------------------------------------------------------------
// Fram till 2026-09-07 var forvalet att SLAPPA IGENOM: en lista raknade upp falten som skulle
// maskeras, allt annat gick rakt ut. Uppmatt over nio inspelningar (58 876 rader, 417 MB) i filer
// vars filhuvud sager `"maskad":true`: 416 unika person-id, ~3 130 `uri` (varav 76 332
// forekomster avatarsokvagar), 363 `describe` med visningsnamn, 87 `contributorDisplayId`.
//
// Proven nedan matar bada halvorna av bytet: att det som ska bort forsvinner, OCH att det som
// inspelaren finns for overlever. Den andra halvan ar den lattaste att tappa — ett tidigare
// forslag hade maskerat varje \d{15,22} och darmed raderat `score` och `msgId`.

test('11: FORVALET ar att maskera — ett falt ingen har granskat slapps inte igenom', () => {
  const ut = I.maskera({ ettHeltNyttFaltTikTokLadeTill: 'PiiikaboOom', nyFritext: 'hej pa dig' });
  assert.notEqual(ut.ettHeltNyttFaltTikTokLadeTill, 'PiiikaboOom',
    'ett okant falt slapptes igenom — da ar forvalet fortfarande fel hall och nasta falt TikTok ' +
    'lagger till lacker precis som describe gjorde');
  assert.match(ut.ettHeltNyttFaltTikTokLadeTill, /^<okant /);
  assert.equal(ut.nyFritext, '<okant text 10t>',
    'fritext ska inte ens behalla sin form — ett skelett av ett namn rojer emoji och interpunktion');
});

test('12: de tio faltnamn som lackte person-id i produktion hashas nu', () => {
  // Listan ar uppmatt, inte gissad: det har ar exakt de falt som bar raa id i inspelningarna.
  const falt = ['fromUserId', 'idStr', 'userIdStr', 'contributorId', 'contributorIdStr',
    'currentSponsorId', 'toUserId', 'uid', 'anchorId', 'sendUserId'];
  for (const namn of falt) {
    const ut = I.maskera({ [namn]: '6812345678901234567' });
    assert.match(ut[namn], /^id#[0-9a-f]{8}$/, `${namn} lamnades omaskerat`);
  }
});

test('13: describe och contributorDisplayId — de tva som bar namn i klartext', () => {
  const ut = I.maskera({
    common: { describe: 'NAGON: gifted the host 1 Rose' },
    contributorDisplayId: 'nagon_anvandare',
  });
  assert.equal(ut.common.describe, '<text 29 tecken>', 'describe bar tva visningsnamn per strang');
  assert.match(ut.contributorDisplayId, /^id#[0-9a-f]{8}$/,
    'display-id AR anvandarnamnet — 83 % av vardena var icke-ASCII, ofta med emoji');
});

test('14: avatarsokvagar UTAN https hashas — URL-regeln sag dem aldrig', () => {
  // Det var den storsta enskilda lackan, och den syntes inte i URL-matningen: 76 332 forekomster
  // av `uri` var avatarsokvagar, men de saknar schema sa /^https?:\/\// matchade dem inte.
  const ut = I.maskera({ uri: 'tos-useast5/avt-0068-tx_abc_def_ghi_1.jpeg' });
  assert.match(ut.uri, /^id#[0-9a-f]{8}$/, 'avatarsokvagen beholls — den pekar ut en person');
  // Med schema racker origin: CDN-varianten gar att kanna igen och pekar inte ut nagon.
  const medSchema = I.maskera({ avatarThumb: 'https://p16-sign.tiktokcdn.com/aweme/100x100/a.jpeg' });
  assert.equal(medSchema.avatarThumb, 'https://p16-sign.tiktokcdn.com/…');
});

test('15: OBJEKTNYCKLAR som ar person-id hashas — och matchningen overlever', () => {
  // TikTok nycklar sina per-anvandarkartor pa ankar-id. Uppmatt: 24 unika raa id lag som NYCKLAR
  // i 9 foraldrafalt. Den forsta matningen av lackaget missade dem helt, eftersom den letade i
  // varden — vilket ar precis varfor provet finns.
  const ut = I.maskera({
    anchorId: '7100000000000000001',
    armies: { '7100000000000000001': { hostscore: 41200 }, '7100000000000000002': { hostscore: 39000 } },
    battleComboV2: { '7100000000000000001': { comboCount: 2 } },
  });
  for (const nyckel of Object.keys(ut.armies)) {
    assert.match(nyckel, /^id#[0-9a-f]{8}$/, 'ett raa ankar-id lag kvar som nyckel');
  }
  // MATCHNINGEN ar hela skalet till att nycklarna hashas i stallet for att strykas: offline-
  // analysen avgor vilken sida som ar var genom att jamfora armies-nyckeln mot anchorId.
  assert.ok(Object.keys(ut.armies).includes(ut.anchorId),
    'armies-nyckeln och anchorId fick olika hash — da gar det inte langre att avgora vilken sida ' +
    'som ar var, och hela battle-analysen dor');
  assert.equal(Object.keys(ut.battleComboV2)[0], ut.anchorId, 'vinstsviten tappade sin koppling');
});

test('16: BATTLE-DATAN OVERLEVER — sifferstrangar rors inte', () => {
  // Den halvan som var narmast att ga forlorad. `score` levereras som en STRANG med upp till 19
  // siffror (8 596 unika uppmatta) och `msgId` som exakt 19 (31 132 unika). Ett forslag var att
  // maskera varje \d{15,22} oavsett faltnamn — det hade raderat bada, alltsa exakt den data
  // inspelaren finns for. Ett person-id och en poang har SAMMA form; bara namnet skiljer dem at.
  const ut = I.maskera({
    score: '41200', msgId: '7546541354546545455', battleId: '7123456789',
    hostscore: 41200, timestamp: 1723900000000, teamTotalScore: '39000', diamondScore: 8,
  });
  assert.equal(ut.score, '41200', 'score maskerades — battle-matningen ar borta');
  assert.equal(ut.msgId, '7546541354546545455', 'msgId maskerades — idempotensnyckeln ar borta');
  assert.equal(ut.battleId, '7123456789');
  assert.equal(ut.teamTotalScore, '39000');
  assert.equal(ut.hostscore, 41200, 'ett TAL fick inte ens rundas om');
  assert.equal(ut.timestamp, 1723900000000);
  assert.equal(ut.diamondScore, 8);
});

test('17: skelettet bar formen men aldrig innehallet', () => {
  // Skelettet ar det som gor inversionen mojlig utan att doda verktyget: ett okant falt gar
  // fortfarande att kanna igen som sokvag, enum eller JSON, sa man vet om det ar vart att titta
  // narmare pa. Men det far inte ga att lasa ut vad som stod dar.
  assert.equal(I.skelett('abc_123'), 'a{3}_9{3}');
  assert.equal(I.skelett('tos-useast5/abc.jpeg'), 'a{3}-a{6}9/a{3}.a{4}');
  const hemligt = 'Superhemligt';
  const sk = I.skelett(hemligt);
  assert.equal(sk, 'a{12}');
  assert.ok(!sk.includes('S') && !sk.includes('hemlig'), 'skelettet lackte tecken ur vardet');
});

test('18: varje post i allowlisten bar ETT SKAL — annars ar det inte en granskning', () => {
  // Listan ar data med motivering. Utan det kravet blir "granska och befordra" en vana igen: nagon
  // lagger till ett faltnamn for att det ser ofarligt ut, och ingen kan i efterhand se om nagon
  // faktiskt tittat pa vardena.
  for (const [namn, skal] of Object.entries(I.SLAPP_IGENOM_SKAL)) {
    assert.equal(typeof skal, 'string', `${namn} saknar skal`);
    assert.ok(skal.trim().length >= 20,
      `${namn} har ett skal pa ${skal.trim().length} tecken — skriv vad faltet ER, inte att det ` +
      'ser ofarligt ut. Ett anvandarnamn och ett enum har samma form.');
  }
  // Och listan far aldrig innehalla ett falt som ocksa star som person/namn/text — da beror
  // resultatet pa skiktordningen i stallet for pa ett beslut.
  for (const namn of Object.keys(I.SLAPP_IGENOM_SKAL)) {
    const k = namn.toLowerCase();
    assert.ok(!I.PERSON_FALT.has(k) && !I.NAMN_FALT.has(k) && !I.TEXT_FALT.has(k) && !I.URL_FALT.has(k),
      `${namn} star bade i allowlisten och i en maskeringslista`);
  }
});

test('19: stringValue avgors av INNEHALLET — nivan overlever, namnet gor det inte', () => {
  // Samma falt bar bada, pa samma niva i payloaden:
  //   guardian_shield_card_used  stringValue = "• <visningsnamn> ♛"   <- PII
  //   fans_upgrade               stringValue = "32"                   <- nivan
  //
  // Genomgangen av alla 384 faltnamn 2026-09-07 klassade stringValue som PERSON rakt av. Hade det
  // foljts hade faltet hamnat i PERSON_FALT, som ligger FORE sifferregeln i skiktordningen — och
  // da hade "32" blivit id#hash. Nivamatningen som gav oss fans_upgrade hade tystnat utan att ett
  // enda prov fallit. Provet finns for att den ordningen inte ska ga att andra av misstag.
  const ut = I.maskera({ content: { pieces: [
    { stringValue: '32' },
    { stringValue: '• NagonAnvandare ♛' },
  ] } });
  assert.equal(ut.content.pieces[0].stringValue, '32',
    'nivan hashades — matningen som gav oss fans_upgrade ar borta');
  assert.match(ut.content.pieces[1].stringValue, /^namn#[0-9a-f]{8}$/,
    'ett emoji-dekorerat visningsnamn slapptes igenom');
});

test('20: person-listan ar den UPPMATTA, inte den handskrivna', () => {
  // Den handskrivna listan hade 25 poster. En genomgang av samtliga 384 strangbarande faltnamn i
  // de nio inspelningarna hittade 54. Skillnaden ar hela argumentet for inversionen: en lista over
  // farliga falt blir aldrig klar, eftersom TikTok fortsatter lagga till dem.
  //
  // Provet listar de falt genomgangen hittade och som den handskrivna listan INTE hade. De ar
  // uppmatta i verklig trafik, sa ett borttaget namn har ar ett verkligt lackage — inte en
  // stramare lista.
  const tillkomna = ['specialId', 'channelId', 'shareTarget', 'targetUserId', 'anchorLinkmicIdStr',
    'rivalAnchorId', 'rivalLinkmicIdStr', 'secInviteUid', 'secApplyUid', 'secFromUserId',
    'secToUserId', 'uidList', 'toMemberId', 'toMemberIdInt', 'inviteUid', 'ownerLinkMicId',
    'primaryId', 'curUserId', 'deleteUserIds', 'linkmicId', 'linkmicIdStr', 'groupLinkmicId',
    'bestTeammateUid'];
  for (const namn of tillkomna) {
    const ut = I.maskera({ [namn]: '6812345678901234567' });
    assert.match(ut[namn], /^id#[0-9a-f]{8}$/,
      `${namn} slapptes igenom — det bar person-id i uppmatt trafik`);
  }
  // Och namnvarianterna, som ska ha namn-prefixet sa att en namn-hash gar att skilja fran ett id.
  for (const namn of ['toMemberNickname', 'sendUserName']) {
    assert.match(I.maskera({ [namn]: 'Nagon' })[namn], /^namn#[0-9a-f]{8}$/, `${namn} slapptes igenom`);
  }
});

test('21: analysatorns Guardian-sokning overlever inversionen', () => {
  // analysera-inspelning.js punkt 6 hittar Guardian genom att soka efter ordet i payloadens
  // STRANGVARDEN. Med allt maskerat forsvann traffarna — och Guardian Del A ar oppet arbete som
  // vantar pa exakt den analysen. Det var inversionens dyraste bieffekt, och den upptacktes inte
  // av ett prov utan av att lasa vad analysatorn faktiskt gor.
  //
  // Uppmatt: ordet star i tolv falt. Elva ar TikTok-forfattade resurs-/enumnamn med noll
  // icke-ASCII; det tolfte, defaultPattern, ar renderad text och star kvar maskerat.
  const nyttolast = I.maskera({
    common: { method: 'WebcastRoomNotifyMessage' },
    nameStarlingKey: 'pm_mt_guardian_entrance_v2',
    scene: 'guardian_shield',
  });
  // MATER NYTTOLASTEN, INTE HELA RADEN. Forsta versionen av det har provet stringifierade raden
  // inklusive `typ: 'guardian'`, som ligger UTANFOR nyttolast och aldrig maskeras — sa provet var
  // gront aven med allowlisten helt urkopplad. Mutationsriggen avslojade det: vakten matte inte
  // det den pastod. Punkt 6 soker i `r.nyttolast`, sa det ar nyttolasten som maste bara ordet.
  assert.match(JSON.stringify(nyttolast), /guardian/i,
    'analysatorns punkt 6 hittar inte langre Guardian — inversionen tog bort de enum-varden ' +
    'sokningen bygger pa');
  // Och rad-typen ar den andra vagen in, oberoende av allowlisten.
  assert.equal({ typ: 'guardian', nyttolast }.typ, 'guardian');
});

test('22: defaultPattern star kvar maskerat — det ar renderad text, inte ett enum', () => {
  // Gransfallet i samma matning: 20 % av vardena bar icke-ASCII och 85 % blanksteg. Det ar
  // meningar, inte nycklar, och en mening som byggs av ett visningsnamn ar det describe redan
  // visat att den blir.
  const ut = I.maskera({ defaultPattern: '{0:user} skickade {1:gift} till varden' });
  assert.match(ut.defaultPattern, /^<okant text \d+t>$/,
    'defaultPattern slapptes igenom — det ar den enda av de tolv falten som bar renderad text');
});

test('23: metaraden bar maskeringens VERSION — annars gar gamla filer inte att skilja ut', async () => {
  // Fram till 2026-09-07 skrev inspelaren `maskad: true` i filer som anda lackte 416 person-id.
  // En fil fran fore fixen ser i filhuvudet exakt likadan ut som en efter, sa utan ett
  // versionsnummer hade den enda sakra slutsatsen varit att misstro bada.
  const katalog = nyKatalog();
  const inspelare = I.skapa({ pa: true, katalog, anvandare: 'x' });
  inspelare.metarad({ bibliotek: 'prov' });
  await inspelare.stang();
  const meta = raderna(inspelare.vag)[0];
  assert.equal(meta.maskad, true);
  assert.equal(meta.maskeringVersion, I.MASKERING_VERSION,
    'metaraden saknar maskeringVersion — da gar en lackande gammal fil inte att skilja fran en ny');
  assert.ok(I.MASKERING_VERSION >= 2, 'versionen ska ha hojts nar maskeringen bytte forval');
  // Och LAS-MIG maste saga hur man laser versionen, annars hjalper den ingen som hittar en gammal fil.
  assert.match(I.LAS_MIG, /maskeringVersion/,
    'LAS-MIG namner inte versionen — den som hittar en gammal fil far ingen varning');
});

test('24: en 15+ siffrig strang hashas aven i ett falt som INTE heter nagot med id', () => {
  // DET HAR VAR EN VERKLIG LACKA I FORSTA VERSIONEN AV INVERSIONEN, och den overlevde bade
  // provsviten och acceptansprovet mot de nio inspelningarna.
  //
  // Sifferregeln slappte igenom ALLA rena tal. Uppmatt: 91 varden i faltet `score` och 13 i `key`
  // ar samma strangar som star som userId/uid nagon annanstans i samma inspelning. Ett tittarid
  // slapptes alltsa igenom for att det lag i ett falt som inte heter nagot med "id".
  //
  // Det ar "ett faltnamn ar inte ett falt" en tredje gang — den har gangen i SIFFERREGELN.
  // `score` bar tva olika saker.
  //
  // GRANSEN AR MATT: varje akta poangfalt ryms i fem siffror (hostscore max 5, teamTotalScore
  // max 5, diamondScore max 1). Bara `score` hade 19-siffriga varden, och det var just de som
  // var id.
  const ut = I.maskera({ score: '6812345678901234567', key: '7100000000000000001' });
  assert.match(ut.score, /^id#[0-9a-f]{8}$/,
    'ett 19-siffrigt varde i `score` slapptes igenom — 91 sadana var tittares user-id');
  assert.match(ut.key, /^id#[0-9a-f]{8}$/, 'samma sak i `key`, dar alla 13 langa varden var id');
  // Och ett akta poangvarde ska fortfarande vara orort.
  assert.equal(I.maskera({ score: '41200' }).score, '41200');
});

test('25: langa tal fran GRANSKADE falt slapps igenom — annars dor analysen', () => {
  // Motsatt riktning. msgId ar idempotensnyckeln och battleId knyter ihop en match; bada ar
  // 19-siffriga och maste overleva. Listan ar kontrollerad mot inspelningarna: noll av dessa
  // faltens varden sammanfaller med nagot varde ur ett entydigt personfalt.
  for (const [falt, varde] of [['msgId', '7546541354546545455'], ['battleId', '7546541354546545455'],
    ['linkedTimeNano', '1725600000000000000'], ['envelopeId', '7546541354546545455']]) {
    assert.equal(I.maskera({ [falt]: varde })[falt], varde, `${falt} maskerades — analysen tappar den`);
  }
  // Rums-id star med FLIT INTE pa listan: det identifierar sandningen, behovs inte for analysen,
  // och en stabil hash grupperar lika bra.
  assert.match(I.maskera({ roomId: '7100000000000000009' }).roomId, /^id#/,
    'roomId slapptes igenom — det identifierar sandningen och behovs inte omaskerat');
});

test('26: ingen post i allowlisten far vara INERT — den vore ren risk utan nytta', () => {
  // Regeln kom ur den adversariella granskningen 2026-09-07, och den ar listans viktigaste.
  //
  // `sourceType` stod har och andrade NOLL uppmatta varden: alla dess 1 354 forekomster ar tal
  // eller 1-2-siffriga strangar, som slapps igenom av skikt 1 och 6 — FORE allowlisten. Postens
  // enda verkan lag alltsa pa framtida, omatta varden. En sadan post ger ingen nytta och bara risk.
  //
  // Provet mater det pa den enda form som gar att kontrollera utan inspelningarna: en post vars
  // varden ALLTID skulle passera pa form kan inte forsvaras. Ett rent tal eller en tom strang
  // slipper igenom oavsett, sa en post vars enda tankta varden ar sadana ar per definition inert.
  for (const namn of Object.keys(I.SLAPP_IGENOM_SKAL)) {
    const orort = I.maskera({ [namn]: 'ett_ord_som_inte_ar_ett_tal' })[namn];
    assert.equal(orort, 'ett_ord_som_inte_ar_ett_tal',
      `${namn} star i allowlisten men slapper inte igenom ett icke-numeriskt varde — ` +
      'da gor posten ingenting och ska bort');
    // Kontrollmatning: utan posten hade samma varde maskerats. Om det INTE hade maskerats ar
    // posten inert, och provet ovan hade varit gront av fel skal.
    const utanPost = I.maskera({ ettFaltSomInteStarIListan: 'ett_ord_som_inte_ar_ett_tal' });
    assert.match(utanPost.ettFaltSomInteStarIListan, /^<okant /,
      'ett falt utanfor listan maskerades inte — da bevisar provet ovan ingenting');
  }
});

test('27: de tva falt granskningen falde star INTE kvar', () => {
  // sourceType (INERT — andrade noll uppmatta varden) och key (20+ foraldrar, for bred yta).
  // Skalen star i inspelare.js.
  //
  // subType och scene stod ocksa har en stund. Granskningen falde bada — subType for att
  // inventarieraden sags sla ihop tva falt, scene for en "okarakteriserad svans" — men en
  // uppraakning av SAMTLIGA varden visade att bada slutsatserna var fel: subType har 7 unika i
  // payloadens rot, scene har 8 totalt. Kapade sammanfattningar foder rimliga men felaktiga
  // slutsatser, och darfor star de kvar i listan.
  for (const namn of ['sourceType', 'key']) {
    assert.ok(!(namn.toLowerCase() in I.SLAPP_IGENOM_SKAL),
      `${namn} har lagts tillbaka i allowlisten — las skalet i inspelare.js innan du gor det`);
  }
  // Och Guardian-analysen maste fortfarande fungera UTAN dem.
  const nyttolast = I.maskera({ nameStarlingKey: 'pm_mt_guardian_entrance_v2',
    animationData: { geckoChannelName: 'webcast_gift_guardian_shield_anim' } });
  assert.match(JSON.stringify(nyttolast), /guardian/i,
    'utan key och scene hittar analysatorn inte langre Guardian — da var borttagningen for dyr');
});
