'use strict';
// ANALYSATORN FÖR EN SÄNDNINGSINSPELNING — skriven RÖD FÖRST.
//
// docs/live-verifiering.md listar sju punkter där koden gissar och felet bara syns i sändning.
// Fem av dem går att svara på ur en inspelning (tiktok-bridge/inspelare.js skriver JSON Lines);
// punkt 5 (delar OBS localStorage?) och 7 (spelar Glove Snipes H.264 i OBS?) kräver OBS och kan
// ingen fil svara på.
//
// Utan analysator måste någon läsa en fil på tiotusentals rader för hand, punkt för punkt, efter
// varje sändning. Då blir avläsningen det som inte blir gjort. Analysatorn gör kvällens sändning
// till ett kommando: spela in, kör, läs svaren.
//
// Proven matar syntetiska rader som speglar det inspelare.js faktiskt skriver — `kalla` skiljer
// vidarebefordrat från enbart inspelat, och `_utgaende` bär det bryggan skickade. Varje prov
// kräver ett SVAR, inte bara att koden inte kraschar: ett verktyg som svarar "vet ej" på allt
// hade passerat ett svagare prov.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');

const { analysera } = require('../tiktok-bridge/analysera-inspelning.js');

function skrivFil(rader) {
  const kat = fs.mkdtempSync(path.join(os.tmpdir(), 'vyra-insp-'));
  const fil = path.join(kat, 'prov.jsonl');
  fs.writeFileSync(fil, rader.map(r => JSON.stringify(r)).join('\n') + '\n');
  return fil;
}
const vid = s => new Date(Date.UTC(2026, 7, 20, 20, 0, s)).toISOString();

// ---- PUNKT 1 · TVA KLOCKOR SOM INTE FAR BLANDAS -------------------------------------------------
//
// UPPMATT 2026-09-02 over samtliga 3798 handelser i en riktig sandning: inspelarens `Date.now()`
// lag 222,8-231,5 SEKUNDER efter `common.createTime`. Liten spridning, stor forskjutning — alltsa
// en klockforskjutning mellan maskinen och TikTok, inte leveransfordrojning.
//
// `r.vid` skrivs av inspelaren ur maskinens vaggklocka. `rewardStartTimestamp` och
// `common.createTime` kommer bada ur TikToks. Att subtrahera over den gransen mater drift, inte
// timing — och drivet ar tva storleksordningar storre an det som ska matas.
//
// REGELN: lokalt mot lokalt gar bra. TikTok mot TikTok gar bra. Blandat gar aldrig.
//
// DE TRE NYTTOLASTERNA ar ordagrant de som mattes i sandningen (samma som fixturerna i
// tiktok-bridge/test/glove-fonster-timing.test.js). Formen ar den inspelaren FAKTISKT skriver:
//   typ 'glove'      — bryggan prenumererar redan pa LINK_MIC_BATTLE_TASK, sa inspelaren lagger
//                      ingen egen lyssnare (se redanLyssnade i bridge.js). Den enda raden kommer
//                      via sendEvent('glove', ...) och bar darfor det UTGAENDE namnet.
//   start.config.rewardConfig — inte nyttolast.rewardConfig.
//   duration          — inte rewardDuration.
const BOOST = (createTime, battleId, rewardStartTimestamp, duration) => ({
  common: { method: 'WebcastLinkmicBattleTaskMessage', createTime },
  taskMessageType: 0,
  battleId,
  start: { config: { rewardConfig: {
    rewardStartTime: '94', duration, rewardMultiple: 2, rewardStartTimestamp } } },
});

// createTime i ms, rewardStartTimestamp i sekunder. Skillnaden ar den fordrojning bryggan ska lagga.
const UPPMATTA = [
  { p: BOOST('1788377980266', '7681024595775736598', '1788378131', '60'), vantadMs: 150734 },
  { p: BOOST('1788378320013', '7681026111756651286', '1788378426', '60'), vantadMs: 105987 },
  { p: BOOST('1788378718119', '7681027829455342358', '1788378829', '50'), vantadMs: 110881 },
];

// Inspelarens `vid` ligger ~223 s EFTER TikToks klocka. Raden byggs med den driften inbakad, sa
// filen ser ut som en riktig inspelning och inte som en tillrattalagd.
const DRIFT_MS = 223000;
// FORDROJNINGEN AR INBAKAD I `vid`, for det ar vad inspelaren skriver: raa() ligger inuti
// sendEvent(), och glove-eventet skjuts upp till dess fonstret oppnar. En fixtur utan den
// fordrojningen motsager fixen som redan ligger pa main.
const fordrojningFor = n => {
  const f = Number(n.start.config.rewardConfig.rewardStartTimestamp) * 1000
    - Number(n.common.createTime);
  return f > 0 ? f : 0;
};
const gloveRad = (nyttolast, extraDriftMs = 0) => ({
  typ: 'glove', kalla: 'vidarebefordrad',
  vid: new Date(Number(nyttolast.common.createTime) + DRIFT_MS + fordrojningFor(nyttolast) + extraDriftMs).toISOString(),
  nyttolast,
});
// En handelse som INTE fordrojs — dar bar `vid` den aktuella driften och inget annat.
const annanRad = (createTime, extraDriftMs = 0) => ({
  typ: 'gift', kalla: 'vidarebefordrad',
  vid: new Date(Number(createTime) + DRIFT_MS + extraDriftMs).toISOString(),
  nyttolast: { common: { createTime }, giftId: 1 },
});

test('punkt 1: hittar boosten i den form inspelaren faktiskt skriver', () => {
  const fil = skrivFil(UPPMATTA.map(u => gloveRad(u.p)));
  const r = analysera(fil);
  assert.notEqual(r.punkt1.svar, 'inget underlag',
    `analysatorn hittade ingen boost alls — skal: ${r.punkt1.skal}. Inspelaren skriver typ 'glove' `
    + 'med start.config.rewardConfig, inte LINK_MIC_BATTLE_TASK med nyttolast.rewardConfig.');
  assert.equal(r.punkt1.matningar, 3, `alla tre boostarna ska hittas, fick ${r.punkt1.matningar}`);
});

test('punkt 1: avstandet raknas i TikToks klocka, inte mot maskinens', () => {
  const fil = skrivFil(UPPMATTA.map(u => gloveRad(u.p)));
  const r = analysera(fil);
  // Den storsta av de tre: 150 734 ms = 151 s avrundat.
  assert.equal(r.punkt1.avstandSekunder, Math.round(150734 / 1000),
    `fordrojningen ar rewardStartTimestamp*1000 - common.createTime = 150734 ms. `
    + `Fick ${r.punkt1.avstandSekunder} s — ett svar nara ${Math.round(DRIFT_MS / 1000)} s betyder `
    + 'att maskinens `vid` blandats in.');
  assert.equal(r.punkt1.svar, 'START ligger före fönstret', `fick: ${r.punkt1.svar}`);
});

test('punkt 1: samma svar oavsett hur fel maskinens klocka gar', () => {
  // SJALVA VAKTEN. Enda skillnaden mellan de tva filerna ar `vid` — TikToks talen ar identiska.
  // Ett svar som andras har lutar sig mot maskinens klocka nagonstans.
  const utan = analysera(skrivFil(UPPMATTA.map(u => gloveRad(u.p))));
  const med = analysera(skrivFil(UPPMATTA.map(u => gloveRad(u.p, 3600000))));
  // ETT ICKE-SVAR FAR INTE RAKNAS SOM LIKHET. Utan den har raden ar provet gront sa fort
  // analysatorn svarar 'inget underlag' pa bada filerna — tva identiska icke-svar.
  assert.notEqual(utan.punkt1.svar, 'inget underlag',
    'jamforelsen betyder ingenting om analysatorn inte hittade nagon boost alls');
  assert.equal(med.punkt1.avstandSekunder, utan.punkt1.avstandSekunder,
    'en timmes extra klockdrift andrade svaret — da mats maskinen och inte handelsen');
  assert.equal(med.punkt1.svar, utan.punkt1.svar, 'sjalva slutsatsen andrades av klockdriften');
});

test('punkt 1: 151 sekunder ar ett VERKLIGT varde, inte trasig data', () => {
  // Rimlighetsgransen lag pa 120 s och kallade allt daröver "orimligt avstand — kontrollera
  // enheten och tidszonen". Tva av de tre uppmatta boostarna ligger over den gransen. Med ratt
  // klocka ar ett stort positivt tal INTE ett enhetsfel; det ar hur langt fore fonstret TikTok
  // skickar START. Taket ska folja normalizer.js BOOST_TAK_MS = 10 minuter.
  const fil = skrivFil([gloveRad(UPPMATTA[0].p)]);
  const r = analysera(fil);
  // Aven har: 'inget underlag' ar inte heller ett godkant svar.
  assert.notEqual(r.punkt1.svar, 'inget underlag', 'boosten hittades inte — provet mater ingenting');
  assert.notEqual(r.punkt1.svar, 'orimligt avstånd',
    'ett uppmatt varde ur en riktig sandning avfardades som trasig data');
});

test('punkt 1: rapporterar vad bryggan FAKTISKT vantar, inte bara vad den borde', () => {
  // Analysatorn kallar samma boostFordrojningMs som bridge.js gor. Utan det har provet kan talet
  // hardkodas till 0 utan att nagot faller — och da rapporterar verktyget en siffra ingen laser.
  // Samma sort som teardown-vakten tidigare i natt: nagot uträknat som ingen anvander.
  const fil = skrivFil(UPPMATTA.map(u => gloveRad(u.p)));
  const r = analysera(fil);
  assert.equal(r.punkt1.bryggansFordrojningMs, 150734,
    'fordrojningen for den varsta matningen ar 150 734 ms — samma tal som bryggan lagger in. '
    + `Fick ${r.punkt1.bryggansFordrojningMs}.`);
  assert.match(r.punkt1.slutsats, /fordrojer|150734/,
    'slutsatsen ska saga att bryggan fordrojer eventet, inte bara att START ligger fore');
});

// GLOVE-RADENS `vid` AR AVFYRNINGSTIDEN, INTE MOTTAGNINGSTIDEN.
//
// `inspelare.raa()` ligger INUTI `sendEvent()`, och sedan boost-fordrojningen mergades (#321)
// skjuts `sendEvent('glove', ...)` upp med upp till tio minuter. Raden skrivs alltsa nar
// eventet FYRAR, inte nar payloaden kom in.
//
// Foljden: `vid - createTime` pa en glove-rad ar drift PLUS fordrojning. For den uppmatta
// sandningen 223 + 151 = 374 s, inte 223. Driften maste darfor matas pa rader som INTE fordrojs.
//
// Det har provet skrevs efter att jag upptackt att mitt EGET forsta driftprov satte `vid` utan
// fordrojning — alltsa en fixtur som motsade den fix som redan lag pa main.
test('punkt 1: klockdriften mats inte pa den fordrojda glove-raden', () => {
  // Glove-raden bar hela fordrojningen i sitt `vid`, precis som i drift. Dessutom en vanlig
  // gift-rad, som INTE fordrojs och darfor bar den aktuella driften.
  const fordrojd = {
    typ: 'glove', kalla: 'vidarebefordrad',
    vid: new Date(Number(UPPMATTA[0].p.common.createTime) + DRIFT_MS + 150734).toISOString(),
    nyttolast: UPPMATTA[0].p,
  };
  const gava = {
    typ: 'gift', kalla: 'vidarebefordrad',
    vid: new Date(Number(UPPMATTA[0].p.common.createTime) + DRIFT_MS).toISOString(),
    nyttolast: { common: { createTime: UPPMATTA[0].p.common.createTime }, giftId: 1 },
  };
  const r = analysera(skrivFil([fordrojd, gava]));
  assert.notEqual(r.punkt1.svar, 'inget underlag', 'boosten ska hittas');
  assert.equal(Math.round(r.punkt1.klockdriftSekunder), Math.round(DRIFT_MS / 1000),
    `driften ar ${DRIFT_MS / 1000} s. Fick ${r.punkt1.klockdriftSekunder} — ett varde nara `
    + `${Math.round((DRIFT_MS + 150734) / 1000)} betyder att fordrojningen raknats in.`);
});

test('punkt 1: utan en ofordrojd rad rapporteras driften som okand, aldrig gissad', () => {
  // Bara glove-rader i filen: da GAR det inte att skilja drift fran fordrojning. Filens egen
  // regel galler — hellre "inget underlag" an ett tal som ser ratt ut.
  const bara = UPPMATTA.map(u => ({
    typ: 'glove', kalla: 'vidarebefordrad',
    vid: new Date(Number(u.p.common.createTime) + DRIFT_MS + u.vantadMs).toISOString(),
    nyttolast: u.p,
  }));
  const r = analysera(skrivFil(bara));
  assert.equal(r.punkt1.klockdriftSekunder, null,
    `utan en ofordrojd rad ska driften vara null, fick ${r.punkt1.klockdriftSekunder}`);
  assert.match(String(r.punkt1.driftSkal || ''), /fordroj|ofordrojd/i,
    'analysatorn ska saga VARFOR driften inte gar att mata');
});

test('punkt 1: klockdriften mellan maskinen och TikTok rapporteras for sig', () => {
  // Driften ar inte brus — det ar den som gjorde det gamla svaret fel, och den ar vard att se.
  const fil = skrivFil([...UPPMATTA.map(u => gloveRad(u.p)), annanRad(UPPMATTA[0].p.common.createTime)]);
  const r = analysera(fil);
  assert.ok(r.punkt1.klockdriftSekunder !== undefined,
    'analysatorn ska rapportera hur langt maskinens klocka ligger fran TikToks');
  assert.equal(Math.round(r.punkt1.klockdriftSekunder), Math.round(DRIFT_MS / 1000),
    `driften ar ${DRIFT_MS / 1000} s, fick ${r.punkt1.klockdriftSekunder}`);
});

test('punkt 2: samlar varje rått battleStatus-värde i den ordning det sågs', () => {
  const fil = skrivFil([
    { typ: 'LINK_MIC_BATTLE', kalla: 'vidarebefordrad', vid: vid(1), nyttolast: { battleStatus: 1 } },
    { typ: 'LINK_MIC_BATTLE', kalla: 'vidarebefordrad', vid: vid(9), nyttolast: { battleStatus: 1 } },
    { typ: 'LINK_MIC_BATTLE', kalla: 'vidarebefordrad', vid: vid(40), nyttolast: { battleStatus: 3 } },
  ]);
  const r = analysera(fil);
  assert.deepEqual(r.punkt2.varden, [1, 3], `distinkta värden i ordning, fick ${r.punkt2.varden}`);
  assert.equal(r.punkt2.sista, 3, 'det sista värdet är kandidaten för "slut"');
});

test('punkt 3: pekar ut vilken händelse som bär matchens slut', () => {
  // Slutet känns igen på att battleSettings försvinner OCH triggerReason dyker upp — det är
  // mönstret som mättes 2026-08-06 och står i minnet som uppmätt facit.
  // FORMEN INSPELAREN FAKTISKT SKRIVER. LINK_MIC_ARMIES nar filen som `battle_mvp` och
  // LINK_MIC_BATTLE som `battle` — inspelaren skriver namnet ur sendEvent(), inte TikToks.
  // Nyttolasten daremot ar RA: inspelare.raa() sparar payloaden orord.
  const fil = skrivFil([
    { typ: 'battle_mvp', kalla: 'vidarebefordrad', vid: vid(5),
      nyttolast: { battleSettings: { duration: 300 }, teamArmies: [] } },
    { typ: 'battle_mvp', kalla: 'vidarebefordrad', vid: vid(50),
      nyttolast: { triggerReason: 2, teamArmies: [] } },
    { typ: 'battle', kalla: 'vidarebefordrad', vid: vid(12), nyttolast: { battleStatus: 1 } },
  ]);
  const r = analysera(fil);
  assert.notEqual(r.punkt3.svar, 'inget underlag',
    `punkt 3 hittade ingen battle-familj alls — skal: ${r.punkt3.skal}. Inspelaren skriver `
    + "'battle_mvp' och 'battle', inte TikToks LINK_MIC_*-namn.");
  assert.equal(r.punkt3.handelse, 'LINK_MIC_ARMIES',
    `slutet ska pekas ut som LINK_MIC_ARMIES, fick ${r.punkt3.handelse}`);
  assert.ok(r.punkt3.skiljer.includes('triggerReason'),
    `fältet som skiljer sista raden ska rapporteras, fick ${JSON.stringify(r.punkt3.skiljer)}`);
  // AVEN I SVARSGRENEN. Provet nedan traffar bara INGET-grenen; utan den har raden gick
  // spelasAldrigIn att ta bort ur det lyckade svaret utan att nagot foll.
  assert.ok((r.punkt3.spelasAldrigIn || []).includes('LINK_MIC_BATTLE_PUNISH_FINISH'),
    'de omojliga familjerna ska redovisas aven nar punkt 3 hittar ett svar');
  assert.ok(r.punkt3.borta.includes('battleSettings'),
    `fält som FÖRSVANN i sista raden ska också rapporteras, fick ${JSON.stringify(r.punkt3.borta)}`);
});

test('punkt 4: beskriver arméernas form per lag', () => {
  // FALTNAMNEN UR PRODUKTIONSKOD, inte ur gissning: normalizer.js armeMvp() laser `teamArmies`,
  // `teamUser` och `userArmies.userArmies` — och den funktionen har gett Davids verkliga MVP i
  // drift. Analysatorn laste `battleArmies`/`battleUsers`, som inte finns i payloaden.
  const fil = skrivFil([
    { typ: 'battle_mvp', kalla: 'vidarebefordrad', vid: vid(50), nyttolast: { triggerReason: 2, teamArmies: [
      { teamUser: [{ userIdStr: 'a' }],
        userArmies: { userArmies: [{ nickname: 'x', score: 120 }] } },
      { teamUser: [{ userIdStr: 'b' }],
        userArmies: { userArmies: [{ nickname: 'y', score: 80, diamondScore: 12 }] } },
    ] } },
  ]);
  const r = analysera(fil);
  assert.notEqual(r.punkt4.svar, 'inget underlag',
    `punkt 4 hittade ingen armelista — skal: ${r.punkt4.skal}`);
  assert.equal(r.punkt4.lag, 2, `två lag i payloaden, fick ${r.punkt4.lag}`);
  assert.ok(r.punkt4.faltPerAnvandare.includes('score'),
    `fälten per användare ska listas, fick ${JSON.stringify(r.punkt4.faltPerAnvandare)}`);
  assert.ok(r.punkt4.faltPerAnvandare.includes('diamondScore'),
    'ett fält som bara vissa användare har ska ändå komma med — annars missas det som gör MVP exakt');
});

test('punkt 6: hittar fältet som skiljer en Guardian från en vanlig medlem', () => {
  const fil = skrivFil([
    { typ: 'MEMBER', kalla: 'inspelad', vid: vid(3), nyttolast: { user: { userId: 'h1', badgeList: [] } } },
    { typ: 'MEMBER', kalla: 'inspelad', vid: vid(7),
      nyttolast: { user: { userId: 'h2', badgeList: [{ type: 'guardian', level: 2 }] } } },
  ]);
  const r = analysera(fil);
  assert.equal(r.punkt6.handelse, 'MEMBER', `fick ${r.punkt6.handelse}`);
  assert.ok(JSON.stringify(r.punkt6.kandidater).toLowerCase().includes('guardian'),
    `kandidatfältet ska nämna guardian, fick ${JSON.stringify(r.punkt6.kandidater)}`);
});

test('punkt 5 och 7 rapporteras som omöjliga att svara på ur en fil', () => {
  const r = analysera(skrivFil([{ typ: '_meta', vid: vid(0), maskad: true }]));
  for (const p of ['punkt5', 'punkt7']) {
    assert.equal(r[p].svar, 'kräver OBS',
      `${p} ska säga rakt ut att en inspelning inte kan svara — annars ser en tom rapport ut som ett godkännande`);
  }
});

test('en inspelning utan battle-händelser svarar "inget underlag", aldrig ett påhittat svar', () => {
  const fil = skrivFil([
    { typ: 'CHAT', kalla: 'vidarebefordrad', vid: vid(1), nyttolast: { comment: '[maskad]' } },
    { typ: 'GIFT', kalla: 'vidarebefordrad', vid: vid(2), nyttolast: { repeatCount: 3 } },
  ]);
  const r = analysera(fil);
  for (const p of ['punkt1', 'punkt2', 'punkt3', 'punkt4']) {
    assert.equal(r[p].svar, 'inget underlag',
      `${p} hittade inget att mäta men svarade "${r[p].svar}" — ett verktyg som gissar är värre än inget`);
  }
  assert.equal(r.sammanfattning.raderLasta, 2, 'antalet lästa rader ska rapporteras');
});

test('punkt 1 litar inte på ett orimligt avstånd — den flaggar mätfelet i stället', () => {
  // Gransen finns kvar, men mater nu ratt sak. Med bada talen ur TikToks klocka ar ett stort
  // POSITIVT tal ett verkligt forsprang (uppmatt: 151 s) och far inte flaggas. Kvar att fanga ar
  // det ingen sandning kan producera: ett fonster som pastar sig oppna fore sitt eget meddelande.
  // Har: rewardStartTimestamp = 1 (sekund 1 efter epoken) mot en verklig createTime.
  const fil = skrivFil([
    gloveRad({ common: { createTime: '1788377980266' }, taskMessageType: 0,
      start: { config: { rewardConfig: { rewardStartTimestamp: '1', rewardMultiple: 3 } } } }),
  ]);
  const r = analysera(fil);
  assert.equal(r.punkt1.svar, 'orimligt avstånd',
    `fick "${r.punkt1.svar}" — ett avstånd på timmar ska flaggas som mätfel, inte tolkas som timing`);
  assert.match(r.punkt1.slutsats, /enhet|sekunder|millisekunder|createTime/i,
    'slutsatsen ska peka på den troliga orsaken');
});

test('punkt 3 redovisar vilka battle-familjer som ALDRIG kan finnas i filen', () => {
  // LINK_MIC_BATTLE_PUNISH_FINISH har bara battle-sonden som lyssnare, och sonden skriver till
  // console.log — aldrig till filen. Den star dessutom i inspelarens `redanLyssnade`, sa
  // inspelaren lagger ingen egen lyssnare heller. En analysator som soker efter den soker efter
  // nagot som per konstruktion inte kan finnas, och tystnaden lases som "matchen tog aldrig slut".
  //
  // BETEENDEPROV, inte kalltext: forsta versionen letade efter ordet "console.log" i kallan och
  // var gron sa fort nagon kommentar rakade namna det.
  const fil = skrivFil([{ typ: 'battle', kalla: 'vidarebefordrad', vid: vid(1), nyttolast: { battleStatus: 1 } }]);
  const r = analysera(fil);
  assert.ok(Array.isArray(r.punkt3.spelasAldrigIn),
    'punkt 3 ska redovisa vilka typer som inte kan na filen');
  assert.ok(r.punkt3.spelasAldrigIn.includes('LINK_MIC_BATTLE_PUNISH_FINISH'),
    `LINK_MIC_BATTLE_PUNISH_FINISH ska stå med som omojlig, fick `
    + JSON.stringify(r.punkt3.spelasAldrigIn));
});
