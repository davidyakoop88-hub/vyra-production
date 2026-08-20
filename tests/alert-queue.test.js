'use strict';
// Fem alerts delar EN ko i runtime-controls.js:7 — Battle MVP, Gifter Level Up, Fan Level Up,
// Gift Fireworks och New Follower. En array, en busy-flagga, en slot i taget:
//
//   const queue=[]; let busy=false;
//   function next(){ if(busy||!queue.length)return; busy=true; queue.shift().run();
//     setTimeout(()=>{busy=false;next()}, Math.max(800, job.duration||5000)) }
//
// Serialiseringen ar avsiktlig och ska vara kvar. Tva saker runt den ar det inte:
//
// 1. Kon har inget tak och ingen maxalder. clear() och size() finns men anropas fran ingenstans.
//    Hundra gavor koar hundra fyrverkerier — cirka tio minuter som fortsatter spela langt efter
//    att gavorna slutade. Uppmatt: forsta pa 54 ms, andra pa 7 000 ms.
//
// 2. Kon rivs inte nar sessionen tar slut. runtime-controls.js registrerar ingen teardown och
//    lyssnar inte pa vyra-session-ended, till skillnad fran cloud-sync.js, goal-client.js,
//    live-client.js och session-state.js. Loggar man ut mitt i en gavostorm ligger kon kvar och
//    spelar alerts fran forra sessionen.
//
// ROTT NU for bada.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'runtime-controls.js'), 'utf8');

// Virtuell klocka. Kon mater tid med setTimeout, sa ett test som anvander riktig tid skulle behova
// atta sekunder per alert och anda inte kunna sta pa en exakt millisekund.
function makeClock() {
  let now = 0, seq = 0;
  const timers = new Map();
  return {
    nu: () => now,
    setTimeout(fn, ms) { const id = ++seq; timers.set(id, { at: now + (ms || 0), fn }); return id },
    clearTimeout(id) { timers.delete(id) },
    // Stega fram tiden och kor det som forfaller, i ratt ordning.
    fram(ms) {
      const slut = now + ms;
      for (;;) {
        let nasta = null;
        for (const [id, t] of timers) if (t.at <= slut && (!nasta || t.at < nasta[1].at)) nasta = [id, t];
        if (!nasta) break;
        timers.delete(nasta[0]);
        now = nasta[1].at;
        nasta[1].fn();
      }
      now = slut;
    }
  };
}

function makeEnv() {
  const klocka = makeClock();
  const store = new Map();
  const lyssnare = new Map();
  const teardowns = new Map();
  const el = () => ({ dataset: {}, style: {}, className: '', innerHTML: '',
    classList: { add() {}, remove() {} }, append() {}, appendChild() {}, prepend() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {} });

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Map, Set, Boolean, Error, Promise,
    // Maxaldern mats med Date.now(). Utan den har kopplingen till den virtuella klockan skulle
    // koden se riktig tid medan testet stegar en egen — och ingenting skulle nagonsin bli gammalt.
    Date: Object.assign(function Date() {}, { now: () => klocka.nu() }),
    setTimeout: klocka.setTimeout, clearTimeout: klocka.clearTimeout,
    setInterval: () => 0, clearInterval: () => {},
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k)
    },
    document: Object.assign(el(), { documentElement: el(), body: el(), createElement: el,
      addEventListener() {} }),
    addEventListener: (namn, fn) => { (lyssnare.get(namn) || lyssnare.set(namn, []).get(namn)).push(fn) },
    state: { widgets: [] }, view: 'layout', selected: null,
    bind() {}, render() {}, save() {}, toast() {},
    VyraSessionState: { registerTeardown: (namn, fn) => teardowns.set(namn, fn) }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.root = sandbox;
  vm.createContext(sandbox);

  // Triggarna definieras i media.js / gift-fireworks.js, som laddas fore runtime-controls.js.
  // Var och en registrerar nar den spelade, sa ordningen gar att lasa av.
  const spelade = [];
  for (const namn of ['triggerBattleMvp', 'triggerGifterLevelUp', 'triggerFanLevelUp',
    'triggerNewFollower', 'triggerGiftFireworks']) {
    sandbox[namn] = function (event) { spelade.push({ namn, event, vid: klocka.nu() }) };
  }

  vm.runInContext(SOURCE, sandbox, { filename: 'runtime-controls.js' });
  // installQueueWrappers kors pa 500 ms, 2200 ms och vid load.
  klocka.fram(2500);

  const sessionSlut = () => {
    for (const fn of teardowns.values()) fn();
    for (const fn of (lyssnare.get('vyra-session-ended') || [])) fn({ type: 'vyra-session-ended' });
  };
  return { sandbox, klocka, spelade, sessionSlut, teardowns, lyssnare };
}

// ---- det som MASTE vara kvar --------------------------------------------------------------------
test('de fem alerts spelar en i taget, aldrig overlappande', () => {
  const env = makeEnv();
  env.sandbox.triggerNewFollower({ i: 1 });
  env.sandbox.triggerNewFollower({ i: 2 });
  env.klocka.fram(100);

  assert.equal(env.spelade.length, 1, 'tva alerts spelade samtidigt — serialiseringen ar borta');
  env.klocka.fram(5000);
  assert.equal(env.spelade.length, 2, 'den andra spelade aldrig');
});

test('hogre prioritet gar fore i den vantande kon', () => {
  const env = makeEnv();
  env.sandbox.triggerNewFollower({ i: 'upptar-sloten' });
  env.sandbox.triggerGiftFireworks({ i: 'fyrverkeri' });   // prioritet 6
  env.sandbox.triggerBattleMvp({ i: 'battle' });           // prioritet 10
  env.klocka.fram(60000);

  const ordning = env.spelade.map(s => s.event.i);
  assert.deepEqual(ordning, ['upptar-sloten', 'battle', 'fyrverkeri'],
    'battle ska hoppa fore fyrverkeriet i kon, men inte avbryta den som redan spelar');
});

// ---- 1. taket ------------------------------------------------------------------------------------
// Matningen ar hur manga som TILL SLUT spelade, inte hur manga som hann spela pa en minut. Det
// forsta ar taket; det andra ar bara slotlangden, och ett test pa det ar gront utan tak. Bada
// varianterna stod har forst och passerade mot ofixad kod.
test('en gavostorm kastas, den bara kas inte upp', () => {
  const env = makeEnv();
  for (let i = 0; i < 100; i += 1) env.sandbox.triggerGiftFireworks({ i });
  env.klocka.fram(1800000);   // en halvtimme: allt som nagonsin ska spela har spelat

  assert.ok(env.spelade.length < 100,
    `alla ${env.spelade.length} spelade till slut — kon har inget tak, den ar bara langsam, ` +
    'och hundra gavor blir cirka tio minuters eftersläpning efter att gavorna slutade');
});

test('taket kastar de lagst prioriterade forst, sa en Battle MVP overlever en gavostorm', () => {
  const env = makeEnv();
  env.sandbox.triggerNewFollower({ i: 'upptar-sloten' });
  for (let i = 0; i < 100; i += 1) env.sandbox.triggerGiftFireworks({ i });
  env.sandbox.triggerBattleMvp({ i: 'battle' });
  env.klocka.fram(1800000);

  assert.ok(env.spelade.some(s => s.event.i === 'battle'),
    'Battle MVP kastades av gavestormen — tvartemot vad prioriteterna sager');
  assert.ok(env.spelade.length < 100,
    `${env.spelade.length} alerts spelade — utan tak spelar hela stormen, bara utdragen i tiden`);
});

// ---- 2. maxaldern --------------------------------------------------------------------------------
test('en alert som vantat for lange spelas inte, den kastas', () => {
  const env = makeEnv();
  // En lang Battle MVP blockerar kon. Fyrverkeriet bakom hinner bli inaktuellt.
  env.sandbox.state.widgets.push({ type: 'templateBattleMvp', mvpDuration: 120 });
  env.sandbox.triggerBattleMvp({ i: 'lang' });
  env.sandbox.triggerGiftFireworks({ i: 'gammal' });
  env.klocka.fram(300000);

  assert.ok(!env.spelade.some(s => s.event.i === 'gammal'),
    'ett fyrverkeri for en gava som kom for tva minuter sedan spelade anda');
  assert.ok(env.spelade.some(s => s.event.i === 'lang'), 'Battle MVP spelade inte');
});

test('en alert som vantat kort spelas fortfarande', () => {
  const env = makeEnv();
  env.sandbox.triggerNewFollower({ i: 'forst' });
  env.sandbox.triggerGiftFireworks({ i: 'strax-efter' });
  env.klocka.fram(60000);

  assert.ok(env.spelade.some(s => s.event.i === 'strax-efter'),
    'maxaldern kastade nagot som bara vantat en slot — den ar satt for hart');
});

// ---- 3. teardown ---------------------------------------------------------------------------------
test('kon rivs nar sessionen tar slut', () => {
  const env = makeEnv();
  env.sandbox.triggerNewFollower({ i: 'upptar-sloten' });
  env.sandbox.triggerGiftFireworks({ i: 'fran-forra-sessionen' });
  env.klocka.fram(100);
  assert.equal(env.spelade.length, 1);

  env.sessionSlut();
  env.klocka.fram(300000);

  assert.ok(!env.spelade.some(s => s.event.i === 'fran-forra-sessionen'),
    'en alert fran forra sessionen spelade efter utloggning');
});

test('runtime-controls registrerar en teardown, som ovriga sessionsbundna moduler', () => {
  const env = makeEnv();

  assert.ok(env.teardowns.size > 0 || (env.lyssnare.get('vyra-session-ended') || []).length > 0,
    'varken registerTeardown eller en vyra-session-ended-lyssnare — kon overlever sessionen');
});

// ---- 3. testknappen ska ko som en riktig gava ---------------------------------------------------
// Testknappen for Gift Fireworks byggde forr raketerna och satte `.play` DIREKT pa DOM-noden
// (gift-fireworks.js:19). Den gick alltsa forbi hela kon: man kunde inte prova hur fyrverkerier
// pacear mot andra alerts, vilket ar precis vad man vill se innan en sandning.
//
// Har provas beteendet pa den niva riggen racker till: gar anropet genom `triggerGiftFireworks`
// hamnar det i kon och far vanta pa sin slot. Den DOM-nara halvan — att klicket verkligen anropar
// triggern och inte ror `.play` — provas i tests/gift-fireworks-panel.test.js, dar riggen har en
// riktig widget och en riktig panel.
test('ett testfyrverkeri vantar ut en pagaende Fan Level Up', () => {
  const env = makeEnv();
  env.sandbox.state.widgets = [{ type: 'templateFanLevel', fanDuration: 6 },
                               { type: 'templateGiftFireworks', fwDuration: 5 }];
  env.sandbox.triggerFanLevelUp({ i: 'fan' });
  env.klocka.fram(50);
  assert.deepEqual(env.spelade.map(s => s.event.i), ['fan'], 'fan-alerten tog inte sloten');

  // Knappen trycks mitt under alerten.
  env.sandbox.triggerGiftFireworks({ i: 'testknapp', __test: true });
  env.klocka.fram(50);
  assert.deepEqual(env.spelade.map(s => s.event.i), ['fan'],
    'fyrverkeriet spelade mitt i fan-alerten — testknappen gick forbi kon');

  // Fan Level Ups slot ar 6 s (fanDuration). Nar den slapper ska fyrverkeriet fa sin tur.
  env.klocka.fram(6000);
  assert.deepEqual(env.spelade.map(s => s.event.i), ['fan', 'testknapp'],
    'fyrverkeriet fick aldrig sin tur efter att fan-alerten slappt sloten');
});

test('testknappen applicerar inte .play direkt langre', () => {
  // Kallvakt mot atervandning. Klicklyssnaren far bygga raketer och lasa faltet, men sjalva
  // tandningen ska ga genom triggern — annars ar den i kon pa pappret och forbi den i praktiken.
  // HELA FILEN, inte en rad. Forsta versionen lyfte ut just capture-lyssnarens rad och letade
  // `.play` i den. Den blev gron — medan en ANDRA genvag satt tva rader bort: `bind()` satte
  // dessutom `t.onclick` pa samma knapp, med samma raa DOM-tandning. Provet mätte en rad och
  // intygade en fil. Samma fel som 20g gick i, i en annan skepnad.
  //
  // Regeln ar darfor absolut: `.play` far tandas pa EXAKT ETT stalle i filen, och det stallet ar
  // fwSpela — den funktion bade den riktiga gavan och testknappen gar genom.
  const FW = fs.readFileSync(path.join(ROOT, 'gift-fireworks.js'), 'utf8');
  const tandningar = [...FW.matchAll(/classList\.add\(\s*['"]play['"]\s*\)/g)];
  assert.equal(tandningar.length, 1,
    `.play tands pa ${tandningar.length} stallen i gift-fireworks.js — varje stalle utom fwSpela `
    + 'ar en genvag forbi alertkon');
  const fore = FW.slice(0, tandningar[0].index);
  const funktion = fore.slice(fore.lastIndexOf('function ')).split('(')[0].replace('function ', '');
  assert.equal(funktion, 'fwSpela',
    `.play tands i ${funktion}() i stallet for i fwSpela() — bara den vagen ar koad`);

  // Och knappen ska ga genom triggern, utan att skriva till layouten.
  const start = FW.indexOf("closest('#testFw')");
  assert.ok(start > 0, 'kontrollmatning: hittade inte klicklyssnaren for #testFw');
  const lyssnare = FW.slice(start, FW.indexOf('\n', start));
  assert.match(lyssnare, /triggerGiftFireworks/,
    'klicklyssnaren anropar inte triggerGiftFireworks — testet visar nagot en riktig gava aldrig gor');
  assert.doesNotMatch(lyssnare, /\bsave\(\)/,
    'klicklyssnaren skriver till den sparade layouten — combon ska sparas av faltet, inte av klicket');
  assert.doesNotMatch(FW, /#testFw'\)[^\n]*onclick\s*=/,
    'nagon satter onclick pa #testFw igen — capture-lyssnaren ager knappen, tva hanterare blir tva vagar');
});
