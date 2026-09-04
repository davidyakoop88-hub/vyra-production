'use strict';
// GLOVE SNIPE TÄNDS TVÅ MINUTER FÖR TIDIGT.
//
// Bryggan skickar `glove` i samma millisekund som den tar emot START-meddelandet. Men START bär
// bara KONFIGURATIONEN för multiplikatorfönstret — fönstret öppnar långt senare. Overlayn lyser
// alltså under hela upptakten, när ingen multiplikator gäller, och är sedan redan "förbrukad" när
// den faktiskt skulle betyda något.
//
// UPPMÄTT 2026-09-02 i en riktig sändning, tre battle-task-meddelanden, alla `taskMessageType: 0`:
//
//   battleId 7681024595775736598   createTime 1788377980266   fönstret öppnar 1788378131 → 150 734 ms
//   battleId 7681026111756651286   createTime 1788378320013   fönstret öppnar 1788378426 → 105 987 ms
//   battleId 7681027829455342358   createTime 1788378718119   fönstret öppnar 1788378829 → 110 881 ms
//
// `_utgaende` i inspelningen visar att bryggan skickade `glove {multiplier:2}` med SAMMA
// tidsstämpel som mottagandet, alla tre gångerna.
//
// ---- RÄKNA ALDRIG MOT DEN LOKALA KLOCKAN --------------------------------------------------------
//
// `rewardStartTimestamp` lever i TikToks klockdomän. UPPMÄTT över samtliga 3798 händelser i samma
// inspelning: inspelarens `Date.now()` låg 222,8–231,5 sekunder EFTER `common.createTime`, med
// median 223,4 och mycket liten spridning — signaturen för en klockförskjutning, inte för
// leveransfördröjning.
//
// En naiv `setTimeout(fonsterStart*1000 - Date.now())` blir därför ~223 sekunder fel. Avståndet
// MÅSTE räknas inom TikToks egen klocka, ur samma meddelande:
//
//     fördröjning = rewardStartTimestamp * 1000 - common.createTime
//
// Analysatorn gör precis det felet i dag (`analysera-inspelning.js`, punkt 1) och svarar därför
// med fel tecken OCH fel storlek — "72 s för sent" i stället för "151 s för tidigt".
//
// ---- SENTINELFÄLLAN SOM INTE FANNS ---------------------------------------------------------------
//
// Arbetet planerades mot en fälla i `fonsterStart:number(...,Number.MAX_SAFE_INTEGER)` — det ser ut
// som ett standardvärde. Det är det inte: andra argumentet till `number()` är ett TAK.
//
//     number(value, max = 1e12) -> Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0
//
// Ett saknat fält ger alltså **0**, inte MAX_SAFE_INTEGER. Uttrycket läser exakt baklänges mot vad
// det gör, och det är därför provet nedan står kvar: nästa läsare ska möta svaret i stället för
// gissningen.
//
// Risken finns ändå, fast från andra hållet: TAKET är MAX_SAFE_INTEGER, så ett trasigt eller
// fientligt värde kan komma in stort. Därför har boostFordrojningMs både ett sentinel-avslag och
// ett tak på tio minuter — en setTimeout på 285 miljoner år fyrar dessutom OMEDELBART i Node,
// alltså samma bugg fast tyst.
//
// RÖTT NU: normalizer.js exporterar ingen fördröjningsfunktion, battleTaskFields bär inte
// `common.createTime`, och bridge.js skickar utan att vänta.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const N = require('../normalizer.js');

const BRIDGE = fs.readFileSync(path.join(__dirname, '..', 'bridge.js'), 'utf8');

// De tre VERKLIGA nyttolasterna. Fälten under start.config som inte rör belöningsfönstret
// (previewConfig, targetConfig, giftAmountGuide) är bortklippta — battleTaskFields läser dem inte,
// och de gör fixturen oläsbar. Allt som koden faktiskt rör är ordagrant ur inspelningen.
const start = (createTime, battleId, rewardStartTimestamp, rewardStartTime, duration) => ({
  common: { method: 'WebcastLinkmicBattleTaskMessage', createTime },
  taskMessageType: 0,
  battleId,
  start: { config: { rewardConfig: {
    rewardStartTime, duration, rewardMultiple: 2, rewardStartTimestamp,
    rewardPreparePrompt: { promptKey: 'pm_mt_match_buffstartingsoon' },
    rewardingPrompt: { promptKey: 'pm_mt_live_match_desc_1' } } } }
});

const UPPMATTA = [
  { namn: 'battle 1', payload: start('1788377980266', '7681024595775736598', '1788378131', '94', '60'),
    vantad: 150734 },
  { namn: 'battle 2', payload: start('1788378320013', '7681026111756651286', '1788378426', '134', '60'),
    vantad: 105987 },
  { namn: 'battle 3', payload: start('1788378718119', '7681027829455342358', '1788378829', '134', '50'),
    vantad: 110881 },
];

// ---- 1. tidsstämpeln måste överleva fältutvinningen ---------------------------------------------

test('battleTaskFields bär meddelandets EGEN tidsstämpel', () => {
  // Utan den går fördröjningen inte att räkna inom TikToks klocka, och då är enda kvarvarande
  // referens den lokala — som låg 223 sekunder fel i den uppmätta sändningen.
  const f = N.battleTaskFields(UPPMATTA[0].payload);
  assert.equal(f.skickatAt, 1788377980266,
    'common.createTime plockas inte ut — fordrojningen kan da bara raknas mot Date.now()');
});

// ---- 2. fördröjningen, mot verkliga tal ---------------------------------------------------------

test('fordrojningen raknas inom TikToks klocka', () => {
  assert.equal(typeof N.boostFordrojningMs, 'function',
    'normalizer.js exporterar ingen boostFordrojningMs');
  for (const { namn, payload, vantad } of UPPMATTA) {
    const ms = N.boostFordrojningMs(N.battleTaskFields(payload));
    assert.equal(ms, vantad,
      `${namn}: fordrojningen blev ${ms} ms, uppmatt ${vantad} ms `
      + '(rewardStartTimestamp*1000 - common.createTime)');
  }
});

test('alla tre laster ligger over hundra sekunder — det ar hela buggen', () => {
  // Sanity: skulle nagon rakna fel och fa nagra millisekunder skulle proven ovan passera pa
  // exakta tal men buggen vara kvar i verkligheten. Det har provet sager vad storleksordningen ar.
  for (const { namn, payload } of UPPMATTA) {
    const ms = N.boostFordrojningMs(N.battleTaskFields(payload));
    assert.ok(ms > 100_000, `${namn}: ${ms} ms — overlayn skulle fortfarande tandas for tidigt`);
  }
});

// ---- 3. sentinelfällan --------------------------------------------------------------------------

test('ett saknat fonster ger noll fordrojning', () => {
  // ANDRA ARGUMENTET TILL number() AR ETT TAK, INTE ETT STANDARDVARDE.
  //
  //     number(value, max = 1e12) -> Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0
  //
  // `number(belon.rewardStartTimestamp, Number.MAX_SAFE_INTEGER)` LASER som "fall tillbaka pa
  // MAX_SAFE_INTEGER" och BETYDER "klipp vid MAX_SAFE_INTEGER". Ett saknat falt ger alltsa 0, inte
  // sentinelvardet. Den har raden planerades mot en sentinelfalla som inte finns — och det ar just
  // darfor provet star kvar: uttrycket ar latt att lasa fel, och nasta lasare ska mota svaret i
  // stallet for gissningen.
  const utan = { ...UPPMATTA[0].payload };
  utan.start = { config: { rewardConfig: { rewardMultiple: 2, duration: '60' } } };
  const f = N.battleTaskFields(utan);
  assert.equal(f.fonsterStart, 0,
    'ett saknat rewardStartTimestamp gav ' + f.fonsterStart + ' — las om number()');
  assert.equal(N.boostFordrojningMs(f), 0, 'ett saknat fonster gav en fordrojning');
});

test('ett fonster nara talomradets tak ger inte en absurd vantetid', () => {
  // Sentinelvardet ar inte standardvardet — men taket i number() ar MAX_SAFE_INTEGER, sa ett
  // trasigt eller fientligt varde KAN komma in stort. Da ska taket i boostFordrojningMs galla,
  // inte en setTimeout pa 285 miljoner ar (som i Node dessutom fyrar OMEDELBART).
  const f = { fonsterStart: Number.MAX_SAFE_INTEGER, skickatAt: 1788377980266 };
  assert.equal(N.boostFordrojningMs(f), 0, 'sentinelvardet slapptes in i uträkningen');
  const nastan = { fonsterStart: Number.MAX_SAFE_INTEGER - 1, skickatAt: 1788377980266 };
  const ms = N.boostFordrojningMs(nastan);
  assert.ok(ms > 0 && ms <= 600_000, 'ett enormt varde gav ' + ms + ' ms');
});

test('en fonstertid som redan passerat ger noll, aldrig ett negativt tal', () => {
  // Ett START som kommer sent (aterkoppling efter avbrott) ska tanda direkt, inte rakna baklanges.
  const sent = start('1788378200000', '7681024595775736598', '1788378131', '94', '60');
  assert.equal(N.boostFordrojningMs(N.battleTaskFields(sent)), 0);
});

test('trasiga varden ger noll och kastar inte', () => {
  for (const p of [undefined, null, {}, { start: { config: { rewardConfig: {} } } },
    { common: { createTime: 'inte-ett-tal' }, start: { config: { rewardConfig: { rewardStartTimestamp: 'x' } } } }]) {
    let ms;
    assert.doesNotThrow(() => { ms = N.boostFordrojningMs(N.battleTaskFields(p)) },
      `${JSON.stringify(p)} kastade`);
    assert.equal(ms, 0);
  }
});

test('en orimligt avlagsen fonstertid kapas', () => {
  // En battle ar ~5 minuter. Ett fonster som pastar sig oppna om ett dygn ar trasig data, och ett
  // tak gor skillnad pa "vanta lange" och "vanta for alltid".
  const langt = start('1788377980266', '7681024595775736598', String(1788377980 + 86400), '94', '60');
  const ms = N.boostFordrojningMs(N.battleTaskFields(langt));
  assert.ok(ms > 0 && ms <= 600_000, `fordrojningen blev ${ms} ms — taket haller inte`);
});

// ---- 4. bryggan väntar faktiskt -----------------------------------------------------------------

test('bryggan skickar glove EFTER fordrojningen, inte direkt', () => {
  assert.match(BRIDGE, /boostFordrojningMs/,
    'bridge.js raknar ingen fordrojning — glove skickas fortfarande i samma millisekund som START');
  // Sandningen maste ligga bakom en timer. Utan den ar funktionen ovan bara uträknad och oanvänd,
  // precis som `fonsterStart` var innan det har arbetet.
  const bit = BRIDGE.match(/sendEvent\('glove'[\s\S]{0,200}/);
  assert.ok(bit, "hittade ingen sendEvent('glove')");
});

test('bryggan stader sina glove-timers vid nedkoppling', () => {
  // En timer som overlever anslutningen tander Glove Snipe i nasta sandning, tva minuter in i
  // ingenting — med en multiplikator som gallde en match som redan ar slut.
  //
  // FORSTA VERSIONEN AV DET HAR PROVET LETADE BARA EFTER `clearTimeout` NAGONSTANS I FILEN. Det
  // fanns redan pa flera stallen, sa provet var GRONT innan fixen skrevs — och det forblev gront
  // nar jag skapade rivBoostTimers och sedan glomde att anropa den. Alltsa exakt den bugg fixen
  // handlar om: nagot uträknat som ingen anvander.
  assert.match(BRIDGE, /function rivBoostTimers\(\)/, 'rivBoostTimers saknas');
  const anrop = (BRIDGE.match(/rivBoostTimers\(\)/g) || []).length;
  assert.ok(anrop >= 2,
    'rivBoostTimers ar definierad men aldrig ANROPAD — timern overlever nedkopplingen');
  // Och den maste hanga i nedkopplingen, inte nagon annanstans.
  const vidNedkoppling = /ControlEvent\.DISCONNECTED[\s\S]{0,600}?rivBoostTimers\(\)/.test(BRIDGE);
  assert.ok(vidNedkoppling, 'rivBoostTimers anropas inte i DISCONNECTED-hanteraren');
});

// ---- 5. BETEENDEPROVET: mater NAR eventet skickas ----------------------------------------------
//
// Provet ovanfor ("bryggan skickar glove EFTER fordrojningen") ar en KALLTEXTSVAKT, och den ar
// svag pa ett satt som ar vart att skriva ner: mutationsprovat sattes `const fordrojning = 0`, och
// vakten forblev GRON — for ordet `boostFordrojningMs` fanns kvar i en KOMMENTAR intill. En
// vakt som uppfylls av en kommentar mater ingenting.
//
// Det har provet kor den VERKLIGA bryggan i en forkad process med en fejkad connector, tar emot
// dess utgaende event over HTTP och mater avstandet i millisekunder fran att battle-task-eventet
// fyrades till att `glove` kom fram. Fonstret ar satt till 2000 ms i fixturen.
//
// Utan fordrojningen kommer eventet efter ~0 ms. Med den efter ~2000 ms. Marginalen ar sa stor att
// provet inte behover vara kansligt for maskinens dagsform.
const { fork } = require('node:child_process');
const http = require('node:http');
// FORDROJNINGEN LASES UR FEJKENS UTSKRIFT, inte genom att require:a preloaden. Preloaden har ett
// setTimeout(process.exit) pa modulniva — att kalla in den i provkoraren schemalagger en exit i
// PROVETS egen process. Forsta versionen gjorde det, och da kordes provet aldrig alls.

test('glove-eventet skickas forst nar fonstret oppnar — matt i drift', { timeout: 40000 }, async () => {
  const traffar = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', d => { body += d });
    req.on('end', () => {
      traffar.push({ url: req.url, body, at: Date.now() });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const env = { ...process.env,
    VYRA_CLOUD_URL: `http://127.0.0.1:${port}`,
    VYRA_WORKSPACE_ID: 'ws-glovetiming',
    VYRA_INGEST_TOKEN: 'token-glovetiming' };
  delete env.VYRA_SANDNINGSIDENTITET;
  delete env.VYRA_SERVER_URL;

  const preload = path.join(__dirname, 'hjalp', 'fejk-glove-preload.js');
  const child = fork(path.join(__dirname, '..', 'bridge.js'), ['provkonto060'],
    { env, execArgv: ['-r', preload], silent: true });
  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d });
  child.stderr.on('data', d => { stderr += d });
  const kod = await new Promise(r => child.on('exit', r));
  await new Promise(r => server.close(r));

  assert.equal(kod, 0, `bryggprocessen dog med kod ${kod}. stderr: ${stderr.slice(0, 400)}`);

  const emitRad = stdout.split('\n').find(r => r.includes('[fejk] task-emit at='));
  assert.ok(emitRad, `fejken fyrade aldrig battle-tasken. stdout: ${stdout.slice(0, 400)}`);
  const emitAt = Number(emitRad.match(/at=(\d+)/)[1]);
  // Fönstrets längd kommer ur samma utskrift, så provet och fixturen aldrig kan glida isär.
  const FORDROJNING_MS = Number(emitRad.match(/fordrojning=(\d+)/)[1]);

  const gloves = traffar.filter(t => { try { return JSON.parse(t.body).type === 'glove' } catch { return false } });
  assert.equal(gloves.length, 1,
    `vantade exakt ett glove-event, fick ${gloves.length}. Alla: `
    + traffar.map(t => { try { return JSON.parse(t.body).type } catch { return '?' } }).join(', '));

  const drojde = gloves[0].at - emitAt;
  assert.ok(drojde >= FORDROJNING_MS * 0.6,
    `glove skickades efter ${drojde} ms, men fonstret oppnar forst efter ${FORDROJNING_MS} ms. `
    + 'Overlayn tands alltsa innan multiplikatorn galler — det ar hela buggen.');
  assert.ok(drojde < FORDROJNING_MS + 4000,
    `glove drojde ${drojde} ms, langt over fonstrets ${FORDROJNING_MS} ms — nagot annat vantar ocksa`);
});
