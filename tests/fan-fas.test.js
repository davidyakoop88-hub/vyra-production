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
  const { win, lada, faser } = boot([fanWidget('fan1', { fanLayout: 'ribbon' })]);
  const spelade = win.VyraFanFas.spela(lada('fan1'));
  assert.equal(spelade, false, 'spela() påstod att den koreograferade en oregistrerad modell');
  assert.deepEqual(faser('fan1'), [],
    'ribbon har ingen post i FASER och ska spela precis som förut — en halvfärdig fas är sämre '
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
