'use strict';
// Fan Level Up · koreografin och de generella vakterna.
//
// TVÅ SORTERS PROV I SAMMA FIL, med flit.
//
// F1–F3 är GENERELLA: de gäller varje modell som finns idag och varje modell som läggs till i
// morgon. De läser registren i stället för att räkna upp namn, så en nionde modell ärver dem
// automatiskt. Det är just det en uppräkning inte gör — `card` kunde ligga i CSS:en utan att
// finnas i fabriken i hela repots historia, och `hero` kunde vara standardmodellen utan att stå i
// ett enda register, eftersom inget prov jämförde källorna med varandra.
//
// H1–H7 är HERO-SPECIFIKA och mäter koreografin "Samlingen".
//
// KLOCKAN ÄR UTBYTT. `VyraFanFas.klocka` ersätts av en manuell klocka, så fas 2 kan bevisas följa
// fas 1 utan att provet sover 420 ms per påstående. Ett sovande prov är dessutom flaky på en
// lastad maskin — det är inte en optimering, det är skillnaden mellan ett prov som mäter och ett
// som gissar.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.after(closeAll);

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const FABRIK = las('widget-factory.js');
const MEDIA = las('media.js');
const STUDIO_CSS = las('studio.css');
const PREMIUM_CSS = las('premium-final.css');

// CSS UTAN KOMMENTARER. Vakterna som läser regel för regel matchar `nagot { nagot }`, och en
// kommentar strax före en regel hamnar då inuti "selektorn". Vakten flaggade sin egen
// dokumentation: blocket för hearts citerar `opacity:1!important` för att förklara vad som var
// fel, och 21g läste citatet som en levande deklaration. Ett prov som faller på sin egen
// beskrivning mäter texten, inte koden.
const utanKommentarer = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const REGLER = [...utanKommentarer(STUDIO_CSS + PREMIUM_CSS).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(m => ({ valjare: m[1].trim(), kropp: m[2] }));

// ---- Registren, lästa ur källan ----------------------------------------------------------------
// Ur `'fanlevel.layout': {hero:'Hero Card',stack:'Original Fan Stack',…}`.
function fabriksnycklar() {
  const rad = FABRIK.match(/'fanlevel\.layout':\s*\{([^}]*)\}/);
  assert.ok(rad, "hittade inte 'fanlevel.layout' i widget-factory.js");
  return rad[1].split(',').map(p => p.split(':')[0].trim().replace(/^'|'$/g, ''));
}
// Ur katalogsektionens `let flLayouts=[['hero','Hero Card'],…]`.
function katalognycklar() {
  const rad = MEDIA.match(/let flLayouts=\[(.*?)\];/s);
  assert.ok(rad, 'hittade inte katalogens flLayouts i media.js');
  return [...rad[1].matchAll(/\['([^']+)'/g)].map(m => m[1]);
}
// Ur modellväljaren `<select id="fanLayout">…<option value="hero">…`.
function valjarnycklar() {
  const rad = MEDIA.match(/<select id="fanLayout">(.*?)<\/select>/s);
  assert.ok(rad, 'hittade inte modellväljaren #fanLayout i media.js');
  return [...rad[1].matchAll(/<option value="([^"]+)"/g)].map(m => m[1]);
}
// Rubriken "FAN LEVEL UP · 8 MODELLER".
function rubrikantal() {
  const rad = MEDIA.match(/FAN LEVEL UP · (\d+) MODELLER/);
  assert.ok(rad, 'hittade inte katalogrubrikens antal i media.js');
  return Number(rad[1]);
}
// Varje `.fan-layout-X` som någon CSS-fil faktiskt stylar.
function cssmodeller() {
  return [...new Set([...(STUDIO_CSS + PREMIUM_CSS).matchAll(/fan-layout-([a-z0-9]+)/g)].map(m => m[1]))];
}

// ---- Riggen ------------------------------------------------------------------------------------
const fanWidget = (id = 'fan1', over = {}) => ({
  id, type: 'templateFanLevel', x: 10, y: 10, width: 260, title: 'Fan Level Up',
  fanHeadline: 'FAN LEVEL UP', fanLevelLabel: 'LV.', fanLevel: 12, fanName: 'HeartRiser',
  fanDuration: 6, minLevel: 1, fanLayout: 'hero', ...over,
});

// En klocka som inte går förrän provet säger till. Jobben körs i tidsordning, precis som en
// riktig händelsekö — kör man dem i insättningsordning kan ett prov bli grönt av en slump när
// två faser råkar sättas i fel ordning.
function manuellKlocka(win) {
  const jobb = [];
  let nu = 0;
  win.VyraFanFas.klocka.satt = (fn, ms) => { const j = { fn, vid: nu + ms }; jobb.push(j); return j };
  win.VyraFanFas.klocka.rensa = j => { const i = jobb.indexOf(j); if (i >= 0) jobb.splice(i, 1) };
  return {
    fram(ms) {
      nu += ms;
      for (;;) {
        const moget = jobb.filter(j => j.vid <= nu).sort((a, b) => a.vid - b.vid)[0];
        if (!moget) return;
        jobb.splice(jobb.indexOf(moget), 1);
        moget.fn();
      }
    },
    kvar: () => jobb.length,
  };
}

function boot(widgets = [fanWidget()]) {
  const h = createDom({ state: { widgets, projectName: 'fan' } });
  h.load('overlay-sanitize.js');    // renderaren går genom VyraSafe för namn och bild-URL
  h.load('widget-fas.js');          // fabriken — mekaniken bor där sedan 2026-08-19
  h.load('fan-fas.js');
  // state fylls om EFTER att media.js laddats: studio.js:s egen uppstart nollar listan, så
  // createDom-argumentet ensamt ger `state.widgets.length === 0` och triggern hittar ingenting
  // att tända. Samma ordning som tests/fan-level-session.test.js.
  const script = h.document.createElement('script');
  script.textContent = `state.widgets.length=0;${widgets.map(w => `state.widgets.push(${JSON.stringify(w)})`).join(';')};`;
  h.document.body.append(script);
  const canvas = h.paint(widgets);
  const klocka = manuellKlocka(h.window);
  const lada = id => canvas.querySelector(`[data-id="${id}"]`);
  const faser = id => [...lada(id).classList].filter(k => k.startsWith('fan-fas-')).map(k => k.slice(8));
  return { h, canvas, klocka, lada, faser, win: h.window };
}

// ================================================================================================
// F1 — REGISTRET ÄR TÄTT. Fyra källor pekar ut samma modeller, eller så är någon av dem fel.
// ================================================================================================

test('F1: fabriken, katalogen och modellväljaren listar exakt samma modeller', () => {
  const fabrik = fabriksnycklar(), katalog = katalognycklar(), valjare = valjarnycklar();
  assert.deepEqual([...fabrik].sort(), [...katalog].sort(),
    'fabrikstabellen och katalogknapparna är inte samma mängd — en modell går att skapa på ett '
    + 'ställe men inte det andra');
  assert.deepEqual([...fabrik].sort(), [...valjare].sort(),
    'modellväljaren erbjuder inte samma modeller som fabriken känner till — precis så kunde '
    + "'card' väljas i panelen utan att någonsin gå att skapa ur katalogen");
});

test('F1: katalogrubriken räknar rätt', () => {
  assert.equal(rubrikantal(), fabriksnycklar().length,
    'rubriken påstår ett annat antal än registret innehåller');
});

test('F1: ingen CSS stylar en modell som inte finns i registret', () => {
  const registrerade = new Set(fabriksnycklar());
  const foraldralosa = cssmodeller().filter(m => !registrerade.has(m));
  assert.deepEqual(foraldralosa, [],
    `CSS stylar ${foraldralosa.join(', ')} som inget register känner till — död kod som ser levande ut`);
});

test('F1: varje koreografi hör till en registrerad modell', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  const registrerade = new Set(fabriksnycklar());
  for (const layout of Object.keys(FASER)) {
    assert.ok(registrerade.has(layout),
      `koreografi finns för "${layout}" men modellen står inte i fabrikstabellen`);
  }
});

// ================================================================================================
// F2 — GRINDEN HÅLLER. En fasklass får bara finnas medan alerten spelar, och bara för en modell
// som har en koreografi.
// ================================================================================================

test('F2: den orörda markupen bär ingen fasklass', () => {
  // Widgeten ritas långt innan någon trigger. Läckte en fasklass in i renderaren skulle den
  // ligga tänd i studion hela tiden — och referensprovet mäter först efter en trigger, så det
  // hade aldrig sett det.
  const { lada, faser } = boot();
  assert.ok(lada('fan1'), 'widgeten renderades inte');
  assert.deepEqual(faser('fan1'), [], 'en fasklass fanns redan innan triggern');
});

test('F2: en modell utan koreografi får ingen fasklass alls', () => {
  // MODELLEN ÄR PÅHITTAD, med flit. Provet hade först `ribbon` hårdkodad och föll när ribbon fick
  // sin koreografi. Det gjordes då om att VÄLJA en oregistrerad modell ur registren — och föll
  // igen, i samma stund duo registrerades och 23g blev grön: från och med då finns det ingen
  // oregistrerad modell kvar att välja. De två vakterna är varandras komplement, och 23g:s
  // sanning gör den dynamiska varianten omöjlig.
  //
  // Det som ska bevisas är att `spela()` VÄGRAR en modell den inte känner — inte att någon sådan
  // modell råkar finnas i katalogen just idag. En påhittad layout är därför rätt fixtur, och den
  // förblir giltig hur många modeller familjen än får.
  const utan = 'ingenkoreografi';
  const { FASER } = require('./helpers/fan-fas-register.js');
  assert.ok(!FASER[utan], `fixturen ${utan} har oväntat fått en koreografi — byt namn i provet`);
  const { win, lada, faser } = boot([fanWidget('fan1', { fanLayout: utan })]);
  const spelade = win.VyraFanFas.spela(lada('fan1'));
  assert.equal(spelade, false, 'spela() påstod att den koreograferade en oregistrerad modell');
  assert.deepEqual(faser('fan1'), [],
    `${utan} har ingen post i FASER och ska spela precis som förut — en halvfärdig fas är sämre `
    + 'än ingen fas');
});

test('F2: exakt en fas är aktiv i taget', () => {
  const { win, klocka, lada, faser } = boot();
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  assert.equal(faser('fan1').length, 1, `fas 1 ensam förväntades, fick ${faser('fan1')}`);
  klocka.fram(420);
  assert.equal(faser('fan1').length, 1, `fas 2 ensam förväntades, fick ${faser('fan1')}`);
  klocka.fram(560);
  assert.equal(faser('fan1').length, 1, `fas 3 ensam förväntades, fick ${faser('fan1')}`);
});

test('F2: ingen fasklass överlever sekvensen', () => {
  const { win, klocka, faser } = boot();
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  klocka.fram(win.VyraFanFas.total('hero'));
  assert.deepEqual(faser('fan1'), [],
    'en fasklass låg kvar efter sista fasen — CSS:en hade fortsatt gälla under hela alerten');
  assert.equal(klocka.kvar(), 0, 'en timer lämnades kvar och kan tända en fas efter att alerten dött');
});

test('F2: koreografin sitter INNANFÖR alertkön, inte utanför', () => {
  // runtime-controls.js byter 500 ms efter start ut triggern mot en variant som bara lägger
  // jobbet i VyraAlertQueue och returnerar. Kopplas vi om runt den varianten startar
  // koreografin när alerten KÖAS i stället för när den SPELAS — flera sekunder fel under en
  // gåvostorm. Uppmätt i Chromium innan lagningen: den yttre linden gjorde ingenting alls,
  // och gjorde det bara av en slump.
  const { win, faser } = boot();
  assert.equal(win.VyraFanFas.arKopplad(), true, 'kopplingen sattes aldrig');
  const vart = win.triggerFanLevelUp;

  // Så här ser runtime-controls sin lindning ut: den sparar undan vår funktion och köar den.
  const ko = [];
  win.triggerFanLevelUp = e => { ko.push(() => vart(e)) };
  win.VyraFanFas.koppla();
  assert.equal(win.triggerFanLevelUp.__fasKopplad, undefined,
    'kopplingen lade sig UTANFÖR kön — då spelas koreografin vid köningen, inte vid alerten');

  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  assert.deepEqual(faser('fan1'), [], 'koreografin startade redan när alerten köades');
  ko.pop()();
  assert.deepEqual(faser('fan1'), ['hjarta'], 'koreografin startade inte när kön släppte alerten');
});

// ================================================================================================
// F3 — KOREOGRAFIN RYMS I DEN KORTASTE VISNINGSTIDEN. Reglaget börjar på 2 s; en längre sekvens
// hinner aldrig spelas färdigt och tittaren ser en avhuggen rörelse.
// ================================================================================================

test('F3: varje koreografi ryms i den kortaste visningstiden', () => {
  const { FASER, KORTASTE_VISNING } = require('./helpers/fan-fas-register.js');
  for (const [layout, lista] of Object.entries(FASER)) {
    const total = lista.reduce((s, f) => s + f.ms, 0);
    assert.ok(total <= KORTASTE_VISNING,
      `${layout} är ${total} ms men visningsreglaget börjar på ${KORTASTE_VISNING} ms`);
  }
});

test('F3: varje fas har en varaktighet och ett namn', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  for (const [layout, lista] of Object.entries(FASER)) {
    assert.ok(lista.length, `${layout} har ett tomt fasregister`);
    for (const f of lista) {
      assert.ok(f.namn && /^[a-z]+$/.test(f.namn), `${layout} har en fas utan giltigt namn`);
      assert.ok(Number.isFinite(f.ms) && f.ms > 0, `${layout}:${f.namn} har varaktighet ${f.ms}`);
    }
  }
});

// ================================================================================================
// H1–H7 — HERO · "SAMLINGEN"
// ================================================================================================

test('H1: hero har tre faser i ordningen hjärta → samling → vila', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  assert.deepEqual(FASER.hero.map(f => f.namn), ['hjarta', 'samling', 'vila'],
    'Samlingen är hjärtat först, resten samlas, glöden lägger sig — i den ordningen');
});

test('H2: triggern tänder fas 1 synkront', () => {
  // Synkront med flit: väntar första fasen på en timer syns ett bildrutefönster där lådan är
  // tänd men okoreograferad, och basens fanAlertEnter hinner rita hela widgeten synlig först.
  const { win, faser } = boot();
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  assert.deepEqual(faser('fan1'), ['hjarta'], 'hjärtfasen sattes inte i samma anrop som triggern');
});

test('H3: faserna byter på exakt sina tider', () => {
  const { win, klocka, faser } = boot();
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  klocka.fram(419);
  assert.deepEqual(faser('fan1'), ['hjarta'], 'hjärtfasen slutade en millisekund för tidigt');
  klocka.fram(1);
  assert.deepEqual(faser('fan1'), ['samling'], 'samlingen började inte vid 420 ms');
  klocka.fram(559);
  assert.deepEqual(faser('fan1'), ['samling'], 'samlingen slutade för tidigt');
  klocka.fram(1);
  assert.deepEqual(faser('fan1'), ['vila'], 'vilan började inte vid 980 ms');
  klocka.fram(269);
  assert.deepEqual(faser('fan1'), ['vila'], 'vilan slutade för tidigt');
  klocka.fram(1);
  assert.deepEqual(faser('fan1'), [], 'vilan slutade inte vid 1250 ms');
});

test('H4: en ny trigger startar om från fas 1', () => {
  const { win, klocka, faser } = boot();
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  klocka.fram(500);
  assert.deepEqual(faser('fan1'), ['samling'], 'förutsättningen stämmer inte');
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 14, fromLevel: 13, isTeamMember: true });
  assert.deepEqual(faser('fan1'), ['hjarta'], 'omstarten började inte om från hjärtat');
  // Och den gamla sekvensens timers får inte leva kvar: de hade slagit av den nya mitt i.
  klocka.fram(419);
  assert.deepEqual(faser('fan1'), ['hjarta'], 'en timer från den förra sekvensen överlevde omstarten');
});

test('H5: en låda som inte triggades om behåller sin pågående fas', () => {
  // Två Fan Level Up i samma scen. Den ena är teamlåst, den andra inte. Ett event utan
  // isTeamMember tänder bara den fria — den låsta får inte ryckas om från fas 1.
  const w1 = fanWidget('fan1', { fanTeamOnly: false });
  const w2 = fanWidget('fan2', { fanTeamOnly: true });
  const { win, klocka, faser } = boot([w1, w2]);
  win.triggerFanLevelUp({ name: 'A', level: 13, fromLevel: 12, isTeamMember: true });
  klocka.fram(500);
  assert.deepEqual(faser('fan2'), ['samling'], 'förutsättningen stämmer inte');
  win.triggerFanLevelUp({ name: 'B', level: 14, fromLevel: 13, isTeamMember: false });
  assert.deepEqual(faser('fan1'), ['hjarta'], 'den fria lådan triggades inte om');
  assert.deepEqual(faser('fan2'), ['samling'],
    'den teamlåsta lådan rycktes om trots att triggern aldrig rörde den — kopplingen läser '
    + '_fanTimer just för att skilja de två fallen åt');
});

test('H6: avbryt lämnar lådan i vilotillstånd', () => {
  const { win, klocka, lada, faser } = boot();
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  win.VyraFanFas.avbryt(lada('fan1'));
  assert.deepEqual(faser('fan1'), [], 'en fasklass låg kvar efter avbryt');
  klocka.fram(2000);
  assert.deepEqual(faser('fan1'), [], 'en avbruten sekvens tände en fas i efterhand');
});

test('H7: varje hero-fas har CSS, och ingen rörelse spiller över sin fas', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  for (const fas of FASER.hero) {
    assert.ok(PREMIUM_CSS.includes(`fan-fas-${fas.namn}`),
      `fasen ${fas.namn} har ingen enda regel i premium-final.css — JS byter en klass som ingen ser`);
  }
  // Trappan i samlingen: sista elementets fördröjning + varaktighet får inte gå över fasens
  // längd. Gör den det tas klassen bort mitt i rörelsen och elementet hoppar till sitt slutläge.
  // Det syns bara i en webbläsare, aldrig i koden — därför räknas det här i stället.
  const samling = FASER.hero.find(f => f.namn === 'samling');
  const rader = PREMIUM_CSS.split('\n').filter(r => r.includes('fan-fas-samling') && r.includes('animation:'));
  assert.ok(rader.length >= 3, `hittade bara ${rader.length} animerade element i samlingen`);
  for (const rad of rader) {
    const tider = [...rad.matchAll(/(\d*\.?\d+)s/g)].map(m => Math.round(parseFloat(m[1]) * 1000));
    const slut = tider.reduce((a, b) => a + b, 0);   // varaktighet + ev. fördröjning
    assert.ok(slut <= samling.ms,
      `en rörelse i samlingen slutar vid ${slut} ms men fasen är ${samling.ms} ms: ${rad.trim()}`);
  }
});

// ================================================================================================
// F4 — EN MODELL MED KOREOGRAFI HAR BARA EN KLOCKA.
//
// Hålet den här vakten stänger hittades när stack skulle byggas: sex av de sju modellerna hade
// REDAN rörelse, driven av `animation-delay` på `.fan-layout-X.fan-active` i studio.css. Den
// timingen är osynlig för fan-fas.js, och därmed osynlig för F3 — takets vakt kunde inte se en
// enda av dem. Värre: läggs faser ovanpå utan att de gamla reglerna tas bort startar BÅDA
// klockorna på samma trigger, och delarna rycker mellan två uppsättningar animationer.
//
// Vakten är enkelriktad med flit. En modell UTAN koreografi får gärna ha sin rörelse i
// `.fan-active` — det är så de sex andra ser ut idag och de spelar precis som förut. Men den som
// registreras i FASER måste ha flyttat hela sin ingång dit.
// ================================================================================================

test('F4: en registrerad koreografi har ingen konkurrerande .fan-active-animation', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  for (const layout of Object.keys(FASER)) {
    const kvar = (STUDIO_CSS + PREMIUM_CSS)
      .split('\n')
      .filter(r => r.includes(`fan-layout-${layout}.fan-active`) && r.includes('animation:'));
    assert.deepEqual(kvar, [],
      `${layout} har koreografi i FASER men animerar fortfarande på .fan-active — två klockor på `
      + 'samma trigger, och delarna rycker mellan dem');
  }
});

// ================================================================================================
// 17a–17g — STACK · "MOTTAGANDET"
//
// Fall → pop → stigning. Ikonen faller ner uppifrån, nivåpillen poppar fram, profilbilden stiger
// underifrån — och texten kommer med den, vilket den inte gjorde förut.
//
// LÄGET FÖRE, uppmätt: stack hade redan de tre rörelserna, men klockan låg i CSS:ens
// `animation-delay` (0 / .1s / .2s på `.fan-active`). Tre saker följde av det:
//   1. F3:s tak på 2 s kunde inte se stacks timing alls — den fanns inte i något register.
//   2. `h3` och `p` (namn och meddelande) hade INGEN rörelse. De snäppte fram i samma bildruta
//      som lådan medan resten koreograferades. Det är snäppet.
//   3. Familjen hade två olika klockor: hero i JS, stack i CSS.
// Keyframesen är däremot rätt och återanvänds — fsIconDrop, fsPillPop och fsAvatarRise är också
// delade med hearts och loyalty, så de rörs inte.
// ================================================================================================

test('17a: stack har tre faser i ordningen fall → pop → stigning', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  assert.ok(FASER.stack, 'stack saknar koreografi i FASER');
  assert.deepEqual(FASER.stack.map(f => f.namn), ['fall', 'pop', 'stigning'],
    'Mottagandet är ikonen som faller, pillen som poppar, profilen som stiger — i den ordningen');
});

test('17b: triggern tänder stacks första fas synkront', () => {
  const { win, faser } = boot([fanWidget('fan1', { fanLayout: 'stack' })]);
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  assert.deepEqual(faser('fan1'), ['fall'], 'fallet sattes inte i samma anrop som triggern');
});

test('17c: stacks faser byter på exakt sina tider och ingen överlever', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  const [fall, pop, stigning] = FASER.stack;
  const { win, klocka, faser } = boot([fanWidget('fan1', { fanLayout: 'stack' })]);
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  klocka.fram(fall.ms - 1);
  assert.deepEqual(faser('fan1'), ['fall'], 'fallet slutade en millisekund för tidigt');
  klocka.fram(1);
  assert.deepEqual(faser('fan1'), ['pop'], 'poppen började inte när fallet tog slut');
  klocka.fram(pop.ms);
  assert.deepEqual(faser('fan1'), ['stigning'], 'stigningen började inte när poppen tog slut');
  klocka.fram(stigning.ms);
  assert.deepEqual(faser('fan1'), [], 'en fasklass låg kvar efter sista fasen');
  assert.equal(klocka.kvar(), 0, 'en timer lämnades kvar');
});

test('17d: varje stack-fas har CSS, och ingen rörelse spiller över sin fas', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  for (const fas of FASER.stack) {
    const rader = PREMIUM_CSS.split('\n')
      .filter(r => r.includes(`fan-layout-stack.fan-fas-${fas.namn}`));
    assert.ok(rader.length, `fasen ${fas.namn} har ingen regel i premium-final.css`);
    for (const rad of rader.filter(r => r.includes('animation:'))) {
      const slut = [...rad.matchAll(/(\d*\.?\d+)s/g)]
        .map(m => Math.round(parseFloat(m[1]) * 1000)).reduce((a, b) => a + b, 0);
      assert.ok(slut <= fas.ms,
        `en rörelse i ${fas.namn} slutar vid ${slut} ms men fasen är ${fas.ms} ms: ${rad.trim()}`);
    }
  }
});

test('17e: de befintliga keyframesen återanvänds — inga nya för samma rörelse', () => {
  // fsIconDrop, fsPillPop och fsAvatarRise delas med hearts och loyalty och ligger kvar i
  // studio.css. En kopia i premium-final.css hade varit två sanningar om samma rörelse, och den
  // som ändrade den ena hade aldrig fått veta om den andra.
  for (const namn of ['fsIconDrop', 'fsPillPop', 'fsAvatarRise']) {
    assert.match(PREMIUM_CSS, new RegExp(`animation:\\s*${namn}\\b`),
      `stack använder inte den befintliga ${namn} — Mottagandet ska återanvända rörelsen, inte rita om den`);
    assert.doesNotMatch(PREMIUM_CSS, new RegExp(`@keyframes\\s+${namn}\\b`),
      `${namn} har kopierats till premium-final.css — den bor i studio.css och delas med andra modeller`);
    assert.match(STUDIO_CSS, new RegExp(`@keyframes\\s+${namn}\\b`),
      `${namn} har försvunnit ur studio.css — hearts och loyalty animerar på den`);
  }
});

test('17f: rörelserna går åt rätt håll — fallet faller, stigningen stiger', () => {
  // Utan den här vakten är ett teckenfel osynligt: en ikon som stiger uppåt i stället för att
  // falla ner ser fortfarande "animerad" ut, varje annat prov förblir grönt, och premissen
  // "Mottagandet" är tyst bruten.
  const kf = namn => {
    const m = STUDIO_CSS.match(new RegExp(`@keyframes\\s+${namn}\\{([\\s\\S]*?)\\}\\}`));
    assert.ok(m, `hittade inte @keyframes ${namn}`);
    return m[1];
  };
  // Enheten är valfri med flit: viloläget skrivs `translateY(0)` utan px, och ett uttryck som
  // kräver enheten hittar bara startvärdet. Då blir vakten grön av fel skäl — den mäter ett
  // enda tal och kan inte längre säga något om riktningen.
  const translateY = block => [...block.matchAll(/translateY\((-?\d*\.?\d+)(?:px)?\)/g)].map(x => parseFloat(x[1]));

  const drop = translateY(kf('fsIconDrop'));
  assert.equal(drop.length, 2, 'fsIconDrop ska gå från ett läge till ett annat');
  assert.ok(drop[0] < 0, `fsIconDrop börjar på ${drop[0]}px — ett fall måste börja OVANFÖR vilopositionen`);
  assert.equal(drop[1], 0, `fsIconDrop slutar på ${drop[1]}px i stället för i viloläget`);

  const rise = translateY(kf('fsAvatarRise'));
  assert.equal(rise.length, 2, 'fsAvatarRise ska gå från ett läge till ett annat');
  assert.ok(rise[0] > 0, `fsAvatarRise börjar på ${rise[0]}px — en stigning måste börja UNDER vilopositionen`);
  assert.equal(rise[1], 0, `fsAvatarRise slutar på ${rise[1]}px i stället för i viloläget`);

  const pop = [...kf('fsPillPop').matchAll(/scale\((\d*\.?\d+)\)/g)].map(x => parseFloat(x[1]));
  assert.equal(pop.length, 2, 'fsPillPop ska gå från en skala till en annan');
  assert.ok(pop[0] < 1, `fsPillPop börjar på skala ${pop[0]} — en pop måste börja mindre än sitt slutläge`);
  assert.equal(pop[1], 1, `fsPillPop slutar på skala ${pop[1]} i stället för 1`);
});

test('17g: rubriken, namnet och meddelandet är med i mottagandet', () => {
  // Snäppet. Förut animerades bara burst, pill och profil; texten dök upp i samma bildruta som
  // lådan och stod stilla medan resten rörde sig. Uppmätt i Chromium: opacity 1 vid 0 ms medan
  // profilbilden fortfarande låg på 0.
  //
  // h2 kom med först efter mätningen. Testkartan sa "namn och meddelande", eftersom
  // `.fan-layout-stack>h2{display:none!important}` såg ut att dölja rubriken för stack. Den
  // regeln var död: `.fan-level-up>h2` har SAMMA specificitet, kommer senare i studio.css och bär
  // `display:block!important`. Rubriken syns alltså — den är stacks största textelement, och den
  // snäppte värst av alla. Den döda regeln är borttagen i samma ändring, och referensprovet
  // ("FAN LEVEL UP syns", alla åtta modeller) vaktar att rubriken ska synas.
  const { FASER } = require('./helpers/fan-fas-register.js');
  const stigning = `fan-layout-stack.fan-fas-${FASER.stack[FASER.stack.length - 1].namn}`;
  const rader = PREMIUM_CSS.split('\n').filter(r => r.includes(stigning) && r.includes('animation:'));
  const har = del => rader.some(r => new RegExp(`${stigning}[^,{]*>\\s*${del}\\b`).test(r));
  assert.ok(har('h2'), 'rubriken (h2) har ingen rörelse i stigningen — den snäpper fram');
  assert.ok(har('h3'), 'användarnamnet (h3) har ingen rörelse i stigningen — det snäpper fram');
  assert.ok(har('p'), 'meddelandet (p) har ingen rörelse i stigningen — det snäpper fram');
});

// ================================================================================================
// 18a–18g — RIBBON · "VÄLKOMNANDET"
//
// Pop → utrullning → text. Profilbilden poppar fram, banderollen rullar ut i sidled, texten
// kommer sist.
//
// LÄGET FÖRE, uppmätt i Chromium (opacitet per del, ms från triggern):
//
//     ms | profil | banderoll (scaleX) | h2   | h3   | p
//     87 |  0.61  | 0.00 (0.300)       | 1.00 | 1.00 | 1.00
//    207 |  1.00  | 0.36 (0.552)       | 1.00 | 1.00 | 1.00
//    366 |  1.00  | 0.94 (0.958)       | 1.00 | 1.00 | 1.00
//    527 |  1.00  | 1.00 (0.998)       | 1.00 | 1.00 | 1.00
//
// Poppen och utrullningen rörde sig alltså redan, och mjukt. Det som snäppte var TEXTEN: rubrik,
// namn och meddelande stod på opacity 1 redan i första bildrutan, färdiglästa medan banderollen
// fortfarande var hoprullad till 30 % bredd. Widgeten berättade slutet före början.
//
// OCH RIBBON HAR INGET EGET VILOLAGER. `.fan-layout-ribbon .fan-burst{display:none!important}`
// gömmer hjärtat, och med det gömmer den basens två enda oändliga animationer — fanLevelPop och
// fanRing. Efter 527 ms är modellen fullständigt stillastående, till skillnad från alla andra.
// Därför får den en egen diskret andning, och därför kan den andningen INTE hänga på en fasklass:
// fasklassen tas bort när sekvensen är slut, och animationen hade dött i samma stund. Vaktat av 18g.
// ================================================================================================

test('18a: ribbon har tre faser i ordningen pop → utrullning → text', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  assert.ok(FASER.ribbon, 'ribbon saknar koreografi i FASER');
  assert.deepEqual(FASER.ribbon.map(f => f.namn), ['pop', 'utrullning', 'text'],
    'Välkomnandet är profilen som poppar, banderollen som rullar ut, texten sist — i den ordningen');
});

test('18b: triggern tänder ribbons första fas synkront', () => {
  const { win, faser } = boot([fanWidget('fan1', { fanLayout: 'ribbon' })]);
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  assert.deepEqual(faser('fan1'), ['pop'], 'poppen sattes inte i samma anrop som triggern');
});

test('18c: ribbons faser byter på exakt sina tider och ingen överlever', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  const [pop, utrullning, text] = FASER.ribbon;
  const { win, klocka, faser } = boot([fanWidget('fan1', { fanLayout: 'ribbon' })]);
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  klocka.fram(pop.ms - 1);
  assert.deepEqual(faser('fan1'), ['pop'], 'poppen slutade en millisekund för tidigt');
  klocka.fram(1);
  assert.deepEqual(faser('fan1'), ['utrullning'], 'utrullningen började inte när poppen tog slut');
  klocka.fram(utrullning.ms);
  assert.deepEqual(faser('fan1'), ['text'], 'texten började inte när utrullningen tog slut');
  klocka.fram(text.ms);
  assert.deepEqual(faser('fan1'), [], 'en fasklass låg kvar efter sista fasen');
  assert.equal(klocka.kvar(), 0, 'en timer lämnades kvar');
});

test('18d: varje ribbon-fas har CSS, texten kommer i textfasen, och inget spiller över', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  for (const fas of FASER.ribbon) {
    const rader = PREMIUM_CSS.split('\n')
      .filter(r => r.includes(`fan-layout-ribbon.fan-fas-${fas.namn}`));
    assert.ok(rader.length, `fasen ${fas.namn} har ingen regel i premium-final.css`);
    for (const rad of rader.filter(r => r.includes('animation:'))) {
      const slut = [...rad.matchAll(/(\d*\.?\d+)s/g)]
        .map(m => Math.round(parseFloat(m[1]) * 1000)).reduce((a, b) => a + b, 0);
      assert.ok(slut <= fas.ms,
        `en rörelse i ${fas.namn} slutar vid ${slut} ms men fasen är ${fas.ms} ms: ${rad.trim()}`);
    }
  }
  // Fasen heter `text` — då ska den också bära texten. Det var den enda delen som snäppte förut.
  const textfas = 'fan-layout-ribbon.fan-fas-text';
  const rader = PREMIUM_CSS.split('\n').filter(r => r.includes(textfas) && r.includes('animation:'));
  for (const del of ['h2', 'h3', 'p']) {
    assert.ok(rader.some(r => new RegExp(`${textfas}[^,{]*>\\s*${del}\\b`).test(r)),
      `${del} har ingen rörelse i textfasen — den delen snäpper fortfarande fram`);
  }
});

test('18e: ribbon återanvänder fbProfilePop och frbUnfurl', () => {
  for (const namn of ['fbProfilePop', 'frbUnfurl']) {
    assert.match(PREMIUM_CSS, new RegExp(`animation:\\s*${namn}\\b`),
      `ribbon använder inte den befintliga ${namn} — Välkomnandet ska återanvända rörelsen`);
    assert.doesNotMatch(PREMIUM_CSS, new RegExp(`@keyframes\\s+${namn}\\b`),
      `${namn} har kopierats till premium-final.css — den bor i studio.css`);
    assert.match(STUDIO_CSS, new RegExp(`@keyframes\\s+${namn}\\b`),
      `${namn} har försvunnit ur studio.css`);
  }
});

test('18f: utrullningen rullar UT och poppen växer', () => {
  // Riktningsvakten. En banderoll som rullar ihop i stället för ut ser fortfarande animerad ut,
  // varje annat prov förblir grönt, och premissen "Välkomnandet" är tyst bruten.
  const kf = namn => {
    const m = STUDIO_CSS.match(new RegExp(`@keyframes\\s+${namn}\\{([\\s\\S]*?)\\}\\}`));
    assert.ok(m, `hittade inte @keyframes ${namn}`);
    return m[1];
  };
  const skala = (block, fn) => [...block.matchAll(new RegExp(`${fn}\\((\\d*\\.?\\d+)\\)`, 'g'))]
    .map(x => parseFloat(x[1]));

  const unfurl = skala(kf('frbUnfurl'), 'scaleX');
  assert.equal(unfurl.length, 2, 'frbUnfurl ska gå från en bredd till en annan');
  assert.ok(unfurl[0] < unfurl[1],
    `frbUnfurl går från scaleX ${unfurl[0]} till ${unfurl[1]} — en utrullning måste BREDDAS`);
  assert.equal(unfurl[1], 1, `frbUnfurl slutar på scaleX ${unfurl[1]} i stället för i viloläget`);

  const pop = skala(kf('fbProfilePop'), 'scale');
  assert.equal(pop.length, 2, 'fbProfilePop ska gå från en skala till en annan');
  assert.ok(pop[0] < 1, `fbProfilePop börjar på skala ${pop[0]} — en pop måste växa`);
  assert.equal(pop[1], 1, `fbProfilePop slutar på skala ${pop[1]} i stället för 1`);
});

test('18g: ribbon har ett vilolager, och det hänger inte på en fasklass', () => {
  // Ribbon gömmer .fan-burst, och därmed basens enda två oändliga animationer (fanLevelPop och
  // fanRing). Utan ett eget vilolager står modellen fullständigt stilla efter entrén — uppmätt:
  // ingenting rörde sig efter 527 ms.
  //
  // Och lagret får inte hänga på en fasklass. Fasklassen tas bort när sekvensen är slut, och en
  // `infinite` som ligger på den dör i samma sekund — precis när den skulle ha börjat behövas.
  // Det är därför den ligger på modellen själv, som basens fanLevelPop gör.
  const rader = (STUDIO_CSS + PREMIUM_CSS).split('\n')
    .filter(r => r.includes('fan-layout-ribbon') && r.includes('.fan-profile')
                 && r.includes('animation:') && r.includes('infinite'));
  assert.ok(rader.length,
    'ribbon har ingen oändlig rörelse på profilbilden — modellen står helt stilla efter entrén');
  for (const rad of rader) {
    // `:not(.fan-fas-pop)` är en UTESLUTNING, inte ett villkor — den betyder att andningen tystnar
    // medan poppen äger profilbilden, vilket är precis vad som ska hända. Uttrycket får därför
    // inte träffa den. Utan den här strykningen mäter provet stavning i stället för beteende.
    const utanNot = rad.replace(/:not\([^)]*\)/g, '');
    assert.ok(!utanNot.includes('fan-fas-'),
      `vilolagret hänger på en fasklass och dör när sekvensen tar slut: ${rad.trim()}`);
    assert.ok(!utanNot.includes('.fan-active'),
      `vilolagret hänger på .fan-active — F4 förbjuder det för en registrerad modell: ${rad.trim()}`);
  }
});

// ================================================================================================
// 19a–19h — LOYALTY · "INRINGNINGEN" och "UTTONINGEN"
//
// Pop → ring → stämpel. Profilbilden poppar in, ringen ritas ett kvarts varv (−90° → 0), och
// nivåpillen och texten stämplas in sist.
//
// LÄGET FÖRE, uppmätt i Chromium (opacitet per del, ms från triggern):
//
//     ms | img (ankaret) | .fan-profile (behållaren) | ring | pill | h2   | h3   | p
//     24 |     0.18      |          1.00            | 0.04 | 0.00 | 1.00 | 1.00 | 1.00
//    126 |     0.89      |          1.00            | 0.26 | 0.00 | 1.00 | 1.00 | 1.00
//    306 |     1.00      |          1.00            | 0.60 | 0.00 | 1.00 | 1.00 | 1.00
//
// SOCKELFÄLLAN. `.fan-active .fan-profile img{animation:fbProfilePop}` animerade ANKARET, inte
// behållaren. Men behållaren har ett eget utseende: `background:linear-gradient(145deg,
// var(--fan-light),var(--fan))` plus `box-shadow:0 0 13px var(--fan)` — en glödande orange skiva
// på 80×80 px. Den stod alltså fullt målad redan i första bildrutan, och "poppen" var ett foto som
// tonade in INUTI en skiva som aldrig rörde sig. Fotograferat: en naiv fas 1 som bara släcker
// barnen (img, ring, pill, text) lämnar skivan lysande ensam på canvasen.
//
// Regeln är därför: rör BEHÅLLAREN, aldrig ankaret. Ankaret rider med. Vaktat av 19g.
//
// OCH `visibility` DUGER INTE SOM MÅTT. `.fan-level-up` är `visibility:hidden` tills alerten
// tänds, men uppmätt rapporterar barnen ändå `visibility: visible` — arvet bryts på vägen ned.
// En DOM-vakt som frågar efter visibility får alltså grönt oavsett vad som syns. Proven här mäter
// opacitet och målade pixlar i stället.
// ================================================================================================

test('19a: loyalty har tre faser i ordningen pop → ring → stampel', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  assert.ok(FASER.loyalty, 'loyalty saknar koreografi i FASER');
  assert.deepEqual(FASER.loyalty.map(f => f.namn), ['pop', 'ring', 'stampel'],
    'Inringningen är profilen som poppar, ringen som ritas, texten som stämplas — i den ordningen');
});

test('19b: triggern tänder loyaltys första fas synkront', () => {
  const { win, faser } = boot([fanWidget('fan1', { fanLayout: 'loyalty' })]);
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  assert.deepEqual(faser('fan1'), ['pop'], 'poppen sattes inte i samma anrop som triggern');
});

test('19c: loyaltys faser byter på exakt sina tider och ingen överlever', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  const [pop, ring, stampel] = FASER.loyalty;
  const { win, klocka, faser } = boot([fanWidget('fan1', { fanLayout: 'loyalty' })]);
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  klocka.fram(pop.ms - 1);
  assert.deepEqual(faser('fan1'), ['pop'], 'poppen slutade en millisekund för tidigt');
  klocka.fram(1);
  assert.deepEqual(faser('fan1'), ['ring'], 'ringen började inte när poppen tog slut');
  klocka.fram(ring.ms);
  assert.deepEqual(faser('fan1'), ['stampel'], 'stämpeln började inte när ringen tog slut');
  klocka.fram(stampel.ms);
  assert.deepEqual(faser('fan1'), [], 'en fasklass låg kvar efter sista fasen');
  assert.equal(klocka.kvar(), 0, 'en timer lämnades kvar');
});

test('19d: varje loyalty-fas har CSS, stämpeln bär pill och text, och inget spiller över', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  for (const fas of FASER.loyalty) {
    const rader = PREMIUM_CSS.split('\n')
      .filter(r => r.includes(`fan-layout-loyalty.fan-fas-${fas.namn}`));
    assert.ok(rader.length, `fasen ${fas.namn} har ingen regel i premium-final.css`);
    for (const rad of rader.filter(r => r.includes('animation:'))) {
      const slut = [...rad.matchAll(/(\d*\.?\d+)s/g)]
        .map(m => Math.round(parseFloat(m[1]) * 1000)).reduce((a, b) => a + b, 0);
      assert.ok(slut <= fas.ms,
        `en rörelse i ${fas.namn} slutar vid ${slut} ms men fasen är ${fas.ms} ms: ${rad.trim()}`);
    }
  }
  const stampel = 'fan-layout-loyalty.fan-fas-stampel';
  const rader = PREMIUM_CSS.split('\n').filter(r => r.includes(stampel) && r.includes('animation:'));
  assert.ok(rader.some(r => r.includes('.fan-level-pill')), 'nivåpillen stämplas inte in');
  for (const del of ['h2', 'h3', 'p']) {
    assert.ok(rader.some(r => new RegExp(`${stampel}[^,{]*>\\s*${del}\\b`).test(r)),
      `${del} har ingen rörelse i stämpelfasen — den delen snäpper fortfarande fram`);
  }
});

test('19e: loyalty återanvänder flRingDraw, fbProfilePop och fsPillPop', () => {
  for (const namn of ['flRingDraw', 'fbProfilePop', 'fsPillPop']) {
    assert.match(PREMIUM_CSS, new RegExp(`animation:\\s*${namn}\\b`),
      `loyalty använder inte den befintliga ${namn}`);
    assert.doesNotMatch(PREMIUM_CSS, new RegExp(`@keyframes\\s+${namn}\\b`),
      `${namn} har kopierats till premium-final.css — den bor i studio.css`);
    assert.match(STUDIO_CSS, new RegExp(`@keyframes\\s+${namn}\\b`),
      `${namn} har försvunnit ur studio.css`);
  }
});

test('19f: ringen ritas ett kvarts varv, och poppen växer', () => {
  const kf = namn => {
    const m = STUDIO_CSS.match(new RegExp(`@keyframes\\s+${namn}\\{([\\s\\S]*?)\\}\\}`));
    assert.ok(m, `hittade inte @keyframes ${namn}`);
    return m[1];
  };
  const ring = kf('flRingDraw');
  const grader = [...ring.matchAll(/rotate\((-?\d*\.?\d+)deg\)/g)].map(x => parseFloat(x[1]));
  // `rotate(0)` skrivs utan enhet, precis som translateY(0) gör — fånga den separat.
  const nollor = [...ring.matchAll(/rotate\(0\)/g)].length;
  assert.equal(grader.length + nollor, 2, 'flRingDraw ska gå från en vinkel till en annan');
  assert.equal(grader[0], -90,
    `flRingDraw börjar på ${grader[0]}deg — Inringningen ritar ett KVARTS varv från -90`);
  assert.equal(nollor, 1, 'flRingDraw ska sluta på rotate(0), alltså i viloläget');

  const pop = [...kf('fbProfilePop').matchAll(/scale\((\d*\.?\d+)\)/g)].map(x => parseFloat(x[1]));
  assert.equal(pop.length, 2, 'fbProfilePop ska gå från en skala till en annan');
  assert.ok(pop[0] < 1, `fbProfilePop börjar på skala ${pop[0]} — en pop måste växa`);
  assert.equal(pop[1], 1, `fbProfilePop slutar på skala ${pop[1]} i stället för 1`);
});

test('19g: sockelvakten — poppen rör behållaren, aldrig ankaret', () => {
  // Behållaren `.fan-profile` bär en egen linear-gradient och en box-shadow. Animeras bara
  // `.fan-profile img` står skivan kvar fullt målad medan fotot tonar in inuti den — uppmätt:
  // ankaret 0.18 medan behållaren låg på 1.00 i samma bildruta.
  //
  // Ankaret får därför aldrig nämnas i en loyalty-fas. Det rider med behållaren.
  const faser = require('./helpers/fan-fas-register.js').FASER.loyalty.map(f => f.namn);
  const rader = PREMIUM_CSS.split('\n')
    .filter(r => faser.some(n => r.includes(`fan-layout-loyalty.fan-fas-${n}`)));

  const poppar = rader.filter(r => r.includes('animation:') && r.includes('fbProfilePop'));
  assert.ok(poppar.length, 'ingen fas poppar profilbilden alls');
  for (const rad of poppar) {
    assert.ok(/\.fan-profile\s*\{/.test(rad) || /\.fan-profile\{/.test(rad),
      `poppen ligger inte på behållaren .fan-profile: ${rad.trim()}`);
  }
  for (const rad of rader) {
    assert.ok(!/\.fan-profile\s+img/.test(rad),
      `en loyalty-fas rör ankaret (.fan-profile img) — sockeln blir kvar när ankaret släcks: ${rad.trim()}`);
  }
});

test('19h: uttoningsvakten — exit-regeln rör behållaren, aldrig ankaret', () => {
  // SAMMA FÄLLA, SPEGELVÄND. Fas 1 tog sockeln på väg in; uttoningen hade den på väg ut.
  // `.fan-layout-loyalty.fan-exit .fan-profile img{animation:fbProfilePop var(--fed) reverse}`
  // krympte och släckte ANSIKTET medan skivan stod kvar orörd. Uppmätt i Chromium, effektiv
  // opacitet vid 480 ms av 500: behållaren 1.00, ankaret 0.00. Fotograferat: en tom lysande
  // orange skiva över texten i varje alert, en halv sekund lång.
  //
  // Grannarna gjorde redan rätt — stack, heartbeat, badgereveal, ribbon och duo animerar alla
  // `.fan-profile` direkt. Loyalty var den enda som pekade på ankaret.
  //
  // Det här provet är den SNABBA grinden. Beteendet — att det som är målat faktiskt tonar ut —
  // mäts i tests/browser/fan-fas-loyalty.browser.test.js (U2–U4, U6), som är det enda stället där
  // ärvd opacitet går att läsa av. Ett markupprov kan bara neka det uppenbart fel skrivna.
  const exitRegler = REGLER.filter(r => /\.fan-layout-loyalty\.fan-exit\b/.test(r.valjare));
  assert.ok(exitRegler.length, 'loyalty har ingen uttoningsregel alls');

  const profil = exitRegler.filter(r => r.kropp.includes('animation:')
    && /\.fan-profile\b/.test(r.valjare));
  assert.ok(profil.length, 'inget i loyaltys uttoning rör profilen — sockeln lämnas åt roten');
  for (const r of profil) {
    assert.match(r.valjare.trim(), /\.fan-profile$/,
      `uttoningen ligger inte på behållaren .fan-profile: ${r.valjare.trim()}`);
  }
  for (const r of exitRegler) {
    assert.ok(!/\.fan-profile\s+img/.test(r.valjare),
      `loyaltys uttoning rör ankaret (.fan-profile img) — sockeln blir kvar när ankaret släcks: ${r.valjare.trim()}`);
  }
});

// ================================================================================================
// 20a–20g — BADGEREVEAL · "UPPENBARELSEN"
//
// Vingar → avtäckning → hyllning. Halvmånarna sveper in utifrån och bär fram emblemen,
// profilbilden avtäcks mellan dem, pill och text hyllas sist.
//
// LÄGET FÖRE, uppmätt i Chromium (opacitet, och transformmatrisens a/x):
//
//     ms | vingeV         | vingeH          | profil | pill | h2   | h3   | p
//     34 | 0.06 a1.00 x0  | 0.06 a-1.00 x0  |  0.00  | 1.00 | 1.00 | 1.00 | 1.00
//    256 | 0.65 a1.00 x0  | 0.65 a-1.00 x0  |  0.72  | 1.00 | 1.00 | 1.00 | 1.00
//    604 | 1.00 a1.00 x0  | 1.00 a-1.00 x0  |  1.00  | 1.00 | 1.00 | 1.00 | 1.00
//
// VINGARNAS TRANSFORM RÖRDE SIG ALDRIG. a och x står stilla hela vägen. `fbWingL`/`fbWingR`
// animerar både opacity och transform, men `.fan-layout-badgereveal .fan-wing{transform:
// translateY(-50%)!important}` slår animationen — `!important` i en vanlig regel vinner över en
// CSS-animation. Halva keyframen har alltså aldrig kört. Vingarna gled inte in; de tonade in.
//
// Att "återanvända" en keyframe som aldrig kört är inte återanvändning. Därför skrivs fbWingL och
// fbWingR om så att de sveper in UTIFRÅN och bär sin egen spegling, och `!important` tas bort.
//
// OCH VÄNSTERVINGEN SKA FÖRBLI OSPEGLAD. `.fan-wing.left{transform:scaleX(-1)}` (rad 1137) är
// död idag — den förlorar mot `!important`-regeln. Tas bara `!important` bort vinner den på
// specificitet, och då vänder båda bågarna åt samma håll: omfamningen bryts. Fotograferat före
// och efter. Regeln raderas i stället för att väckas.
// ================================================================================================

test('20a: badgereveal har tre faser i ordningen vingar → avtackning → hyllning', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  assert.ok(FASER.badgereveal, 'badgereveal saknar koreografi i FASER');
  assert.deepEqual(FASER.badgereveal.map(f => f.namn), ['vingar', 'avtackning', 'hyllning'],
    'Uppenbarelsen är vingarna som sveper in, profilen som avtäcks, texten som hyllas');
});

test('20b: triggern tänder badgereveals första fas synkront', () => {
  const { win, faser } = boot([fanWidget('fan1', { fanLayout: 'badgereveal' })]);
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  assert.deepEqual(faser('fan1'), ['vingar'], 'vingfasen sattes inte i samma anrop som triggern');
});

test('20c: badgereveals faser byter på exakt sina tider och ingen överlever', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  const [a, b, c] = FASER.badgereveal;
  const { win, klocka, faser } = boot([fanWidget('fan1', { fanLayout: 'badgereveal' })]);
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  klocka.fram(a.ms - 1);
  assert.deepEqual(faser('fan1'), ['vingar'], 'vingfasen slutade en millisekund för tidigt');
  klocka.fram(1);
  assert.deepEqual(faser('fan1'), ['avtackning'], 'avtäckningen började inte när vingarna var klara');
  klocka.fram(b.ms);
  assert.deepEqual(faser('fan1'), ['hyllning'], 'hyllningen började inte när avtäckningen var klar');
  klocka.fram(c.ms);
  assert.deepEqual(faser('fan1'), [], 'en fasklass låg kvar efter sista fasen');
  assert.equal(klocka.kvar(), 0, 'en timer lämnades kvar');
});

test('20d: varje badgereveal-fas har CSS, hyllningen bär pill och text, inget spiller över', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  for (const fas of FASER.badgereveal) {
    const rader = PREMIUM_CSS.split('\n')
      .filter(r => r.includes(`fan-layout-badgereveal.fan-fas-${fas.namn}`));
    assert.ok(rader.length, `fasen ${fas.namn} har ingen regel i premium-final.css`);
    for (const rad of rader.filter(r => r.includes('animation:'))) {
      const slut = [...rad.matchAll(/(\d*\.?\d+)s/g)]
        .map(m => Math.round(parseFloat(m[1]) * 1000)).reduce((a, b) => a + b, 0);
      assert.ok(slut <= fas.ms,
        `en rörelse i ${fas.namn} slutar vid ${slut} ms men fasen är ${fas.ms} ms: ${rad.trim()}`);
    }
  }
  const h = 'fan-layout-badgereveal.fan-fas-hyllning';
  const rader = PREMIUM_CSS.split('\n').filter(r => r.includes(h) && r.includes('animation:'));
  assert.ok(rader.some(r => r.includes('.fan-level-pill')), 'nivåpillen hyllas inte');
  for (const del of ['h2', 'h3', 'p']) {
    assert.ok(rader.some(r => new RegExp(`${h}[^,{]*>\\s*${del}\\b`).test(r)),
      `${del} har ingen rörelse i hyllningen — den delen snäpper fortfarande fram`);
  }
});

test('20e: badgereveal återanvänder fbWingL, fbWingR, fbProfilePop och fsPillPop', () => {
  for (const namn of ['fbWingL', 'fbWingR', 'fbProfilePop', 'fsPillPop']) {
    assert.match(PREMIUM_CSS, new RegExp(`animation:\\s*${namn}\\b`),
      `badgereveal använder inte ${namn}`);
    assert.doesNotMatch(PREMIUM_CSS, new RegExp(`@keyframes\\s+${namn}\\b`),
      `${namn} har kopierats till premium-final.css — den bor i studio.css`);
    assert.match(STUDIO_CSS, new RegExp(`@keyframes\\s+${namn}\\b`),
      `${namn} har försvunnit ur studio.css`);
  }
});

test('20f: vingarna sveper in UTIFRÅN, och högervingen behåller sin spegling hela vägen', () => {
  const kf = namn => {
    const m = STUDIO_CSS.match(new RegExp(`@keyframes\\s+${namn}\\{([\\s\\S]*?)\\}\\}`));
    assert.ok(m, `hittade inte @keyframes ${namn}`);
    return m[1];
  };
  // Enheten är valfri: viloläget skrivs `translate(0,-50%)` utan px på nollan. Ett uttryck som
  // kräver enheten hittar bara startvärdet, och då mäter vakten ett enda tal och kan inte längre
  // säga något om riktningen. Exakt samma fälla som 17f gick i.
  const x = block => [...block.matchAll(/translate\((-?\d*\.?\d+)(?:px)?\s*,/g)].map(m => parseFloat(m[1]));

  const v = x(kf('fbWingL'));
  assert.equal(v.length, 2, 'fbWingL ska gå från ett läge till ett annat');
  assert.ok(v[0] < 0, `fbWingL börjar på ${v[0]}px — vänstervingen sveper in FRÅN VÄNSTER, alltså utifrån`);
  assert.equal(v[1], 0, `fbWingL slutar på ${v[1]}px i stället för i viloläget`);

  const h = x(kf('fbWingR'));
  assert.equal(h.length, 2, 'fbWingR ska gå från ett läge till ett annat');
  assert.ok(h[0] > 0, `fbWingR börjar på ${h[0]}px — högervingen sveper in FRÅN HÖGER, alltså utifrån`);
  assert.equal(h[1], 0, `fbWingR slutar på ${h[1]}px i stället för i viloläget`);

  // Speglingen måste bäras av VARJE steg. Saknas den i ett av dem blinkar vingen om mitt i svepet.
  const steg = kf('fbWingR').split('}').filter(s => s.includes('transform'));
  assert.equal(steg.length, 2, 'fbWingR ska ha två steg med transform');
  for (const s of steg) {
    assert.match(s, /scaleX\(-/,
      `ett steg i fbWingR saknar sin spegling: ${s.trim()} — vingen vänder sig mitt i rörelsen`);
  }
  // Och vänstervingen ska INTE spegla sig. Fotograferat: då vänder båda bågarna åt samma håll.
  assert.doesNotMatch(kf('fbWingL'), /scaleX\(-/,
    'fbWingL speglar vänstervingen — då vänder båda bågarna åt samma håll och omfamningen bryts');
});

test('20g: ingen !important-transform får döda vingarnas rörelse', () => {
  // `!important` i en vanlig regel slår en CSS-animation. Den enda anledningen att vingarnas
  // transform aldrig rörde sig var en sådan deklaration — och den ser fullkomligt harmlös ut i
  // källan. Vakten läser båda CSS-filerna, så regeln inte kan smyga tillbaka via någondera.
  // REGEL FÖR REGEL, INTE RAD FÖR RAD. Första versionen filtrerade rader som innehöll både
  // `fan-layout-badgereveal` och `.fan-wing` — men vingregeln är flerradig, och `!important`
  // sitter på rad två medan selektorn står på rad ett. Mutationen som återinförde `!important`
  // ÖVERLEVDE därför provet. En vakt som inte kan falla på det den finns för är värre än ingen
  // vakt alls, eftersom den intygar något den aldrig mätt.
  const regler = REGLER.filter(r => r.valjare.includes('fan-layout-badgereveal')
                                    && r.valjare.includes('.fan-wing'));
  assert.ok(regler.length, 'hittade inga vingregler alls — läser provet rätt fil?');
  for (const regel of regler) {
    for (const t of [...regel.kropp.matchAll(/transform\s*:[^;}]*/g)].map(m => m[0])) {
      assert.ok(!/!important/.test(t),
        `en !important-transform på .fan-wing dödar fasens rörelse tyst: ${t.trim()}`);
    }
  }
  // Och den döda vänsterspeglingen får inte ligga kvar och vakna av att !important försvinner.
  assert.ok(!/\.fan-layout-badgereveal \.fan-wing\.left\{transform:scaleX\(-1\)\}/.test(STUDIO_CSS),
    'den döda .fan-wing.left{transform:scaleX(-1)} ligger kvar — utan !important vinner den på '
    + 'specificitet och vänder vänstervingen åt fel håll');
});

test('20h: badgereveal har ett vilolager som inte hänger på en fasklass', () => {
  // Samma tomhet som ribbon: `.fan-burst` är display:none, alltså inget fanLevelPop och ingen
  // fanRing. Uppmätt: 0 levande animationer i vila. Lagret ligger på modellen, inte på en fas —
  // en `infinite` på en fasklass dör när klassen tas bort.
  const rader = (STUDIO_CSS + PREMIUM_CSS).split('\n')
    .filter(r => r.includes('fan-layout-badgereveal') && r.includes('.fan-profile')
                 && r.includes('animation:') && r.includes('infinite'));
  assert.ok(rader.length, 'badgereveal har ingen oändlig rörelse — modellen står helt stilla efter entrén');
  for (const rad of rader) {
    const utanNot = rad.replace(/:not\([^)]*\)/g, '');
    assert.ok(!utanNot.includes('fan-fas-'),
      `vilolagret hänger på en fasklass och dör när sekvensen tar slut: ${rad.trim()}`);
    assert.ok(!utanNot.includes('.fan-active'),
      `vilolagret hänger på .fan-active — F4 förbjuder det för en registrerad modell: ${rad.trim()}`);
  }
});

// ================================================================================================
// 21a–21h — HEARTS · "UPPSTIGNINGEN"
//
// Nedslag → uppstigning → hyllning. Ikonen slår ner, hjärtana framträder, texten hyllas.
//
// LÄGET FÖRE, uppmätt i Chromium. Bara `.fan-burst` rörde sig i entrén (0.15 → 0.78 → 1.00);
// pill, h2, h3 och p låg på 1.00 från 33 ms. Men det stora felet satt i vilolagret:
//
//     ms | hjärta 1        | hjärta 2        | hjärta 3
//   1552 | y -26  op 1.00  | y -21  op 1.00  | y -11  op 1.00
//   1613 | y -26  op 1.00  | y -22  op 1.00  | y -13  op 1.00
//   1803 | y  -1  op 1.00  | y -25  op 1.00  | y -18  op 1.00
//
// `frHeartRise` vill `0% opacity:0 → 30% opacity:1 → 100% opacity:0` — tona in, stiga, tona ut.
// Men `.fan-layout-hearts .fan-rising-hearts i{opacity:1!important}` pinnar opaciteten. Hjärtat
// steg 26 px och TELEPORTERADE tillbaka till noll vid full ljusstyrka, var 1,6:e sekund, tre
// gånger förskjutet. Samma fälla som badgereveals `!important`-transform, fast på en oändlig loop.
//
// OCH DEN GJORDE REFERENSPROVET INTETSÄGANDE. `hearts: de tre hjärtana glöder och är olika stora`
// krävde opacity > 0.5 på alla tre vid EN tidpunkt — sant per definition när opaciteten är pinnad.
// Provet skyddade buggen, inte designen. Det mäter nu över ett tidsfönster i stället.
// ================================================================================================

test('21a: hearts har tre faser i ordningen nedslag → uppstigning → hyllning', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  assert.ok(FASER.hearts, 'hearts saknar koreografi i FASER');
  assert.deepEqual(FASER.hearts.map(f => f.namn), ['nedslag', 'uppstigning', 'hyllning'],
    'Uppstigningen är ikonen som slår ner, hjärtana som framträder, texten som hyllas');
});

test('21b: triggern tänder hearts första fas synkront', () => {
  const { win, faser } = boot([fanWidget('fan1', { fanLayout: 'hearts' })]);
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  assert.deepEqual(faser('fan1'), ['nedslag'], 'nedslaget sattes inte i samma anrop som triggern');
});

test('21c: hearts faser byter på exakt sina tider och ingen överlever', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  const [a, b, c] = FASER.hearts;
  const { win, klocka, faser } = boot([fanWidget('fan1', { fanLayout: 'hearts' })]);
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  klocka.fram(a.ms - 1);
  assert.deepEqual(faser('fan1'), ['nedslag'], 'nedslaget slutade en millisekund för tidigt');
  klocka.fram(1);
  assert.deepEqual(faser('fan1'), ['uppstigning'], 'uppstigningen började inte i tid');
  klocka.fram(b.ms);
  assert.deepEqual(faser('fan1'), ['hyllning'], 'hyllningen började inte i tid');
  klocka.fram(c.ms);
  assert.deepEqual(faser('fan1'), [], 'en fasklass låg kvar efter sista fasen');
  assert.equal(klocka.kvar(), 0, 'en timer lämnades kvar');
});

test('21d: varje hearts-fas har CSS, hyllningen bär pill och text, inget spiller över', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  for (const fas of FASER.hearts) {
    const rader = PREMIUM_CSS.split('\n').filter(r => r.includes(`fan-layout-hearts.fan-fas-${fas.namn}`));
    assert.ok(rader.length, `fasen ${fas.namn} har ingen regel i premium-final.css`);
    for (const rad of rader.filter(r => r.includes('animation:'))) {
      const slut = [...rad.matchAll(/(\d*\.?\d+)s/g)]
        .map(m => Math.round(parseFloat(m[1]) * 1000)).reduce((x, y) => x + y, 0);
      assert.ok(slut <= fas.ms,
        `en rörelse i ${fas.namn} slutar vid ${slut} ms men fasen är ${fas.ms} ms: ${rad.trim()}`);
    }
  }
  const h = 'fan-layout-hearts.fan-fas-hyllning';
  const rader = PREMIUM_CSS.split('\n').filter(r => r.includes(h) && r.includes('animation:'));
  assert.ok(rader.some(r => r.includes('.fan-level-pill')), 'nivåpillen hyllas inte');
  for (const del of ['h2', 'h3', 'p']) {
    assert.ok(rader.some(r => new RegExp(`${h}[^,{]*>\\s*${del}\\b`).test(r)),
      `${del} har ingen rörelse i hyllningen — den delen snäpper fortfarande fram`);
  }
});

test('21e: hearts återanvänder fsIconDrop, fsAvatarRise och fsPillPop', () => {
  for (const namn of ['fsIconDrop', 'fsAvatarRise', 'fsPillPop']) {
    assert.match(PREMIUM_CSS, new RegExp(`animation:\\s*${namn}\\b`), `hearts använder inte ${namn}`);
    assert.doesNotMatch(PREMIUM_CSS, new RegExp(`@keyframes\\s+${namn}\\b`),
      `${namn} har kopierats till premium-final.css — den bor i studio.css`);
  }
});

test('21f: hjärtat stiger UPPÅT och tonar ut — inte teleporterar', () => {
  const m = STUDIO_CSS.match(/@keyframes\s+frHeartRise\{([\s\S]*?\})\s*\}/);
  assert.ok(m, 'hittade inte @keyframes frHeartRise');
  const kropp = m[1];
  const y = [...kropp.matchAll(/translateY\((-?\d*\.?\d+)(?:px)?\)/g)].map(x => parseFloat(x[1]));
  assert.equal(y.length, 2, 'frHeartRise ska gå från ett läge till ett annat');
  assert.equal(y[0], 0, `frHeartRise börjar på ${y[0]}px i stället för i utgångsläget`);
  assert.ok(y[1] < 0, `frHeartRise slutar på ${y[1]}px — ett stigande hjärta måste gå UPPÅT`);

  // Tonningen är hela skälet till att banan inte syns som ett hopp: vid opacitet 0 i toppen är
  // återgången till noll osynlig. Slutar den på 1 teleporterar hjärtat vid full ljusstyrka.
  const op = [...kropp.matchAll(/opacity:\s*(\d*\.?\d+)/g)].map(x => parseFloat(x[1]));
  assert.ok(op.length >= 3, `frHeartRise har ${op.length} opacitetssteg — den ska tona in OCH ut`);
  assert.equal(op[0], 0, `frHeartRise börjar på opacitet ${op[0]} i stället för osynlig`);
  assert.equal(op[op.length - 1], 0,
    `frHeartRise slutar på opacitet ${op[op.length - 1]} — då teleporterar hjärtat tillbaka i full styrka`);
  assert.ok(Math.max(...op) >= 1, 'frHeartRise når aldrig full styrka på vägen');
});

test('21g: ingen !important-opacitet får döda hjärtanas tonning', () => {
  // Läses REGEL FÖR REGEL från början. 20g skrevs först rad för rad och överlevde sin egen
  // mutation, eftersom vingregeln var flerradig. Den lärdomen är inbyggd här.
  const regler = REGLER.filter(r => r.valjare.includes('fan-rising-hearts')
                                    && !r.valjare.includes('fan-exit'));
  assert.ok(regler.length, 'hittade inga regler för .fan-rising-hearts alls');
  for (const regel of regler) {
    for (const d of [...regel.kropp.matchAll(/opacity\s*:[^;}]*/g)].map(m => m[0])) {
      assert.ok(!/!important/.test(d),
        `en !important-opacitet på hjärtana dödar tonningen tyst: ${regel.valjare.trim()} { ${d.trim()} }`);
    }
  }
});

test('21h: hjärtanas oändliga loop hänger på modellen, inte på .fan-active eller en fas', () => {
  // Ett vilolager måste finnas oavsett om alerten står i en fas eller inte. Ligger det på
  // `.fan-active` krävs en specialvakt för när det får starta; ligger det på en fasklass dör det
  // när klassen tas bort. Basens fanLevelPop ligger på modellen — den här gör likadant.
  const regler = REGLER.filter(r => r.valjare.includes('fan-rising-hearts')
                                    && /animation:[^;}]*infinite/.test(r.kropp));
  assert.ok(regler.length, 'hjärtana har ingen oändlig rörelse alls');
  for (const r of regler) {
    const utanNot = r.valjare.replace(/:not\([^)]*\)/g, '');
    assert.ok(!utanNot.includes('.fan-active'),
      `vilolagret hänger på .fan-active: ${r.valjare.trim()}`);
    assert.ok(!utanNot.includes('fan-fas-'),
      `vilolagret hänger på en fasklass och dör när sekvensen tar slut: ${r.valjare.trim()}`);
  }
});

// ================================================================================================
// 22a–22g — HEARTBEAT · "PULSSLAGET"
//
// Sidorna → pulsen → avläsning. Profilbilden glider in från vänster och ikonen från höger,
// pulslinjen ritas mellan dem, och avläsningen kommer sist.
//
// FÖRSTA MODELLEN DÄR DEN BEFINTLIGA ENTRÉN ÄR HEL. Uppmätt i Chromium:
//
//     ms | profil       | burst        | puls  | pill | h2   | h3   | p
//     38 | 0.21  x-19   | 0.21  x 19   |  100% | 1.00 | 1.00 | 1.00 | 1.00
//    253 | 0.98  x -1   | 0.98  x  1   |  100% | 1.00 | 1.00 | 1.00 | 1.00
//    603 | 1.00  x  0   | 1.00  x  0   |   29% | 1.00 | 1.00 | 1.00 | 1.00
//
// Alla tre rör sig faktiskt: fhSlideL, fhSlideR och fhPulseDraw. Ingen `!important` hindrar dem —
// sökt på transform, opacity och clip-path i modellens regler, noll träffar. Det som snäpper är
// pill, h2, h3 och p, precis som i de fem föregående.
//
// OCH RUTNÄTET ÄR ETT EGET PROBLEM. Modellen är `display:grid` med
// `"avatar pulse burst" / "avatar pulse title" / "avatar pulse name" / "avatar pulse msg"`.
// I en flexbox kan man slarva med `display:none` för att dölja en del under en fas. I ett rutnät
// KOLLAPSAR spåret i stället, och allt annat hoppar till en ny plats mitt i koreografin. Faserna
// måste dölja med opacitet och låta rutnätet stå still. Vaktat av 22g, som skrivs generellt över
// BÅDA gridmodellerna — duo är byggd likadant och ska ärva vakten utan att någon minns den.
// ================================================================================================

const GRIDMODELLER = ['heartbeat', 'duo'];

test('22a: heartbeat har tre faser i ordningen sidorna → pulsen → avlasning', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  assert.ok(FASER.heartbeat, 'heartbeat saknar koreografi i FASER');
  assert.deepEqual(FASER.heartbeat.map(f => f.namn), ['sidorna', 'pulsen', 'avlasning'],
    'Pulsslaget är sidorna som kommer in, pulsen som kopplar ihop dem, avläsningen sist');
});

test('22b: triggern tänder heartbeats första fas synkront', () => {
  const { win, faser } = boot([fanWidget('fan1', { fanLayout: 'heartbeat' })]);
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  assert.deepEqual(faser('fan1'), ['sidorna'], 'sidfasen sattes inte i samma anrop som triggern');
});

test('22c: heartbeats faser byter på exakt sina tider och ingen överlever', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  const [a, b, c] = FASER.heartbeat;
  const { win, klocka, faser } = boot([fanWidget('fan1', { fanLayout: 'heartbeat' })]);
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  klocka.fram(a.ms - 1);
  assert.deepEqual(faser('fan1'), ['sidorna'], 'sidfasen slutade en millisekund för tidigt');
  klocka.fram(1);
  assert.deepEqual(faser('fan1'), ['pulsen'], 'pulsen började inte när sidorna var på plats');
  klocka.fram(b.ms);
  assert.deepEqual(faser('fan1'), ['avlasning'], 'avläsningen började inte när pulsen var klar');
  klocka.fram(c.ms);
  assert.deepEqual(faser('fan1'), [], 'en fasklass låg kvar efter sista fasen');
  assert.equal(klocka.kvar(), 0, 'en timer lämnades kvar');
});

test('22d: varje heartbeat-fas har CSS, avlasningen bär pill och text, inget spiller över', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  for (const fas of FASER.heartbeat) {
    const rader = PREMIUM_CSS.split('\n').filter(r => r.includes(`fan-layout-heartbeat.fan-fas-${fas.namn}`));
    assert.ok(rader.length, `fasen ${fas.namn} har ingen regel i premium-final.css`);
    for (const rad of rader.filter(r => r.includes('animation:'))) {
      const slut = [...rad.matchAll(/(\d*\.?\d+)s/g)]
        .map(m => Math.round(parseFloat(m[1]) * 1000)).reduce((x, y) => x + y, 0);
      assert.ok(slut <= fas.ms,
        `en rörelse i ${fas.namn} slutar vid ${slut} ms men fasen är ${fas.ms} ms: ${rad.trim()}`);
    }
  }
  const a = 'fan-layout-heartbeat.fan-fas-avlasning';
  const rader = PREMIUM_CSS.split('\n').filter(r => r.includes(a) && r.includes('animation:'));
  assert.ok(rader.some(r => r.includes('.fan-level-pill')), 'nivåpillen läses inte av');
  for (const del of ['h2', 'h3', 'p']) {
    assert.ok(rader.some(r => new RegExp(`${a}[^,{]*>\\s*${del}\\b`).test(r)),
      `${del} har ingen rörelse i avläsningen — den delen snäpper fortfarande fram`);
  }
});

test('22e: heartbeat återanvänder fhSlideL, fhSlideR och fhPulseDraw', () => {
  for (const namn of ['fhSlideL', 'fhSlideR', 'fhPulseDraw']) {
    assert.match(PREMIUM_CSS, new RegExp(`animation:\\s*${namn}\\b`), `heartbeat använder inte ${namn}`);
    assert.doesNotMatch(PREMIUM_CSS, new RegExp(`@keyframes\\s+${namn}\\b`),
      `${namn} har kopierats till premium-final.css — den bor i studio.css`);
    assert.match(STUDIO_CSS, new RegExp(`@keyframes\\s+${namn}\\b`), `${namn} har försvunnit ur studio.css`);
  }
});

test('22f: sidorna kommer från var sitt håll och pulsen ritas åt höger', () => {
  const kf = namn => {
    const m = STUDIO_CSS.match(new RegExp(`@keyframes\\s+${namn}\\{([\\s\\S]*?)\\}\\}`));
    assert.ok(m, `hittade inte @keyframes ${namn}`);
    return m[1];
  };
  const x = block => [...block.matchAll(/translateX\((-?\d*\.?\d+)(?:px)?\)/g)].map(m => parseFloat(m[1]));

  const v = x(kf('fhSlideL'));
  assert.equal(v.length, 2, 'fhSlideL ska gå från ett läge till ett annat');
  assert.ok(v[0] < 0, `fhSlideL börjar på ${v[0]}px — profilbilden kommer från VÄNSTER`);
  assert.equal(v[1], 0, `fhSlideL slutar på ${v[1]}px i stället för i viloläget`);

  const h = x(kf('fhSlideR'));
  assert.equal(h.length, 2, 'fhSlideR ska gå från ett läge till ett annat');
  assert.ok(h[0] > 0, `fhSlideR börjar på ${h[0]}px — ikonen kommer från HÖGER`);
  assert.equal(h[1], 0, `fhSlideR slutar på ${h[1]}px i stället för i viloläget`);

  // Pulsen ritas genom att inset-rutans HÖGERSIDA krymper från 100 % till 0. Vänds den ritas
  // linjen bakifrån, och kopplingen mellan avatar och ikon läses åt fel håll.
  const puls = kf('fhPulseDraw');
  const insets = [...puls.matchAll(/inset\(([^)]*)\)/g)].map(m => m[1].trim().split(/\s+/));
  assert.equal(insets.length, 2, 'fhPulseDraw ska gå från en inset till en annan');
  const hoger = insets.map(i => parseFloat(i[1]));
  assert.equal(hoger[0], 100, `fhPulseDraw börjar med högersidan på ${hoger[0]} — linjen ska vara helt dold`);
  assert.equal(hoger[1], 0, `fhPulseDraw slutar med högersidan på ${hoger[1]} — linjen ska vara helt ritad`);
});

test('22g: gridmodellernas faser döljer med opacitet och rör aldrig rutnätet', () => {
  // I en flexbox trycks elementen bara ihop av `display:none`. I ett rutnät KOLLAPSAR spåret, och
  // allt annat hoppar till en ny plats mitt i koreografin — en relayout som ingen enhetsprovning
  // ser och som bara syns som ett ryck i webbläsaren. Samma sak om en fas ändrar `grid-area` eller
  // `grid-template-*`: rutnätet ritas om under pågående rörelse.
  //
  // Vakten gäller BÅDA gridmodellerna, så duo ärver den utan att någon behöver minnas den.
  const { FASER } = require('./helpers/fan-fas-register.js');
  let provade = 0;
  for (const modell of GRIDMODELLER) {
    for (const fas of FASER[modell] || []) {
      const regler = REGLER.filter(r => r.valjare.includes(`fan-layout-${modell}.fan-fas-${fas.namn}`));
      for (const regel of regler) {
        provade += 1;
        assert.doesNotMatch(regel.kropp, /display\s*:\s*none/,
          `${modell}:${fas.namn} döljer med display:none — i ett rutnät kollapsar spåret och allt `
          + `annat hoppar: ${regel.valjare}`);
        assert.doesNotMatch(regel.kropp, /visibility\s*:/,
          `${modell}:${fas.namn} rör visibility — det ärvs inte pålitligt ned i den här widgeten, `
          + `använd opacitet: ${regel.valjare}`);
        assert.doesNotMatch(regel.kropp, /grid-(area|template|column|row)/,
          `${modell}:${fas.namn} ändrar rutnätet mitt i koreografin: ${regel.valjare}`);
      }
    }
  }
  assert.ok(provade > 0, 'ingen gridmodell hade några fasregler att pröva');
});

// ================================================================================================
// 23a–23g — DUO · "MÖTET"  ·  DEN SISTA MODELLEN
//
// Parterna → linjen → avläsning. Namnet är modellens hela idé: två parter, en förbindelse.
//
// LÄGET FÖRE, uppmätt i Chromium (widget 320×89, en bar snarare än en box):
//
//     ms | burst | profil | pill | puls  | h2   | h3   | p
//     34 | 0.00  |  0.07  | 0.07 |  100% | 1.00 | 1.00 | 1.00
//    253 | 0.61  |  0.77  | 0.77 |   92% | 1.00 | 1.00 | 1.00
//    602 | 1.00  |  1.00  | 1.00 |    4% | 1.00 | 1.00 | 1.00
//
// Den renaste modellen av alla åtta. Fyra entréer och alla fungerar — fdSnap på burst och pill,
// fdSnap på profilen med 0,06 s trappa, fhPulseDraw på linjen. Ingen `!important` i vägen. Och
// duo är den ENDA modellen där nivåpillen redan animerades; i de sju föregående snäppte den.
// Kvar snäpper bara h2, h3 och p.
//
// Rutnätet: "burst pulse avatar badge" över fyra rader, med ikon och avatar spännande hela höjden
// på var sin sida och texten staplad till höger. duo ärver gridvakten 22g, som skrevs generellt
// över båda gridmodellerna just för det här ögonblicket.
// ================================================================================================

test('23a: duo har tre faser i ordningen parterna → linjen → avlasning', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  assert.ok(FASER.duo, 'duo saknar koreografi i FASER');
  assert.deepEqual(FASER.duo.map(f => f.namn), ['parterna', 'linjen', 'avlasning'],
    'Mötet är parterna som kommer fram, linjen som kopplar ihop dem, avläsningen sist');
});

test('23b: triggern tänder duos första fas synkront', () => {
  const { win, faser } = boot([fanWidget('fan1', { fanLayout: 'duo' })]);
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  assert.deepEqual(faser('fan1'), ['parterna'], 'partfasen sattes inte i samma anrop som triggern');
});

test('23c: duos faser byter på exakt sina tider och ingen överlever', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  const [a, b, c] = FASER.duo;
  const { win, klocka, faser } = boot([fanWidget('fan1', { fanLayout: 'duo' })]);
  win.triggerFanLevelUp({ name: 'HeartRiser', level: 13, fromLevel: 12, isTeamMember: true });
  klocka.fram(a.ms - 1);
  assert.deepEqual(faser('fan1'), ['parterna'], 'partfasen slutade en millisekund för tidigt');
  klocka.fram(1);
  assert.deepEqual(faser('fan1'), ['linjen'], 'linjen började inte när parterna var framme');
  klocka.fram(b.ms);
  assert.deepEqual(faser('fan1'), ['avlasning'], 'avläsningen började inte när linjen var dragen');
  klocka.fram(c.ms);
  assert.deepEqual(faser('fan1'), [], 'en fasklass låg kvar efter sista fasen');
  assert.equal(klocka.kvar(), 0, 'en timer lämnades kvar');
});

test('23d: varje duo-fas har CSS, avlasningen bär all text, inget spiller över', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  for (const fas of FASER.duo) {
    const rader = PREMIUM_CSS.split('\n').filter(r => r.includes(`fan-layout-duo.fan-fas-${fas.namn}`));
    assert.ok(rader.length, `fasen ${fas.namn} har ingen regel i premium-final.css`);
    for (const rad of rader.filter(r => r.includes('animation:'))) {
      const slut = [...rad.matchAll(/(\d*\.?\d+)s/g)]
        .map(m => Math.round(parseFloat(m[1]) * 1000)).reduce((x, y) => x + y, 0);
      assert.ok(slut <= fas.ms,
        `en rörelse i ${fas.namn} slutar vid ${slut} ms men fasen är ${fas.ms} ms: ${rad.trim()}`);
    }
  }
  const a = 'fan-layout-duo.fan-fas-avlasning';
  const rader = PREMIUM_CSS.split('\n').filter(r => r.includes(a) && r.includes('animation:'));
  for (const del of ['h2', 'h3', 'p']) {
    assert.ok(rader.some(r => new RegExp(`${a}[^,{]*>\\s*${del}\\b`).test(r)),
      `${del} har ingen rörelse i avläsningen — den delen snäpper fortfarande fram`);
  }
});

test('23e: duo återanvänder fdSnap och fhPulseDraw', () => {
  for (const namn of ['fdSnap', 'fhPulseDraw']) {
    assert.match(PREMIUM_CSS, new RegExp(`animation:\\s*${namn}\\b`), `duo använder inte ${namn}`);
    assert.doesNotMatch(PREMIUM_CSS, new RegExp(`@keyframes\\s+${namn}\\b`),
      `${namn} har kopierats till premium-final.css — den bor i studio.css`);
    assert.match(STUDIO_CSS, new RegExp(`@keyframes\\s+${namn}\\b`), `${namn} har försvunnit ur studio.css`);
  }
});

test('23f: parterna växer fram och linjen dras åt höger', () => {
  const kf = namn => {
    const m = STUDIO_CSS.match(new RegExp(`@keyframes\\s+${namn}\\{([\\s\\S]*?)\\}\\s*\\}`));
    assert.ok(m, `hittade inte @keyframes ${namn}`);
    return m[1];
  };
  const snap = [...kf('fdSnap').matchAll(/scale\((\d*\.?\d+)\)/g)].map(x => parseFloat(x[1]));
  assert.equal(snap.length, 2, 'fdSnap ska gå från en skala till en annan');
  assert.ok(snap[0] < 1, `fdSnap börjar på skala ${snap[0]} — parterna ska VÄXA fram`);
  assert.equal(snap[1], 1, `fdSnap slutar på skala ${snap[1]} i stället för i viloläget`);

  const insets = [...kf('fhPulseDraw').matchAll(/inset\(([^)]*)\)/g)].map(m => m[1].trim().split(/\s+/));
  assert.equal(insets.length, 2, 'fhPulseDraw ska gå från en inset till en annan');
  const hoger = insets.map(i => parseFloat(i[1]));
  assert.equal(hoger[0], 100, `linjen börjar med högersidan på ${hoger[0]} — den ska vara helt dold`);
  assert.equal(hoger[1], 0, `linjen slutar med högersidan på ${hoger[1]} — den ska vara helt dragen`);
});

// ================================================================================================
// 23g — SLUTVAKTEN
//
// F1 vaktar åt ena hållet: varje koreografi hör till en registrerad modell. Den här vänder på
// beroendet: VARJE REGISTRERAD MODELL HAR EN KOREOGRAFI.
//
// Den gick inte att skriva förrän nu. I går hade den varit röd för sju av åtta modeller — och det
// var exakt det tillståndet som lät `hero` vara appens mest använda modell utan att stå i ett enda
// register. Med duo på plats är familjen sluten: ingen nionde modell kan smyga in i katalogen utan
// klocka, och ingen av de åtta kan tyst tappa sin.
// ================================================================================================

test('23g: varje registrerad modell har en koreografi', () => {
  const { FASER } = require('./helpers/fan-fas-register.js');
  const utan = fabriksnycklar().filter(l => !FASER[l]);
  assert.deepEqual(utan, [],
    `${utan.join(', ')} står i fabrikstabellen men har ingen koreografi i FASER — modellen spelar `
    + 'utan klocka, och F3:s tak kan inte se den');
});
