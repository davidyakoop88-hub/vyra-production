'use strict';
// Guardian Welcome · koreografin "Beskyddet" och familjens vaktnät.
//
// SAMMA DISCIPLIN SOM FAN LEVEL UP, av samma skäl. JS bestämmer NÄR, CSS bestämmer VAD.
// Drivrutinen sätter fasklasser (`gw-fas-<namn>`) i tur och ordning och tar bort dem sist.
// Klockan är utbytbar (`VyraGuardianFas.klocka`), så fasproven är exakta och omedelbara i stället
// för att sova 500 ms per påstående.
//
// VAKTNÄTET SKA VARA MATEMATISKT SLUTET, precis som F1/23g är för Fan Level Up:
//
//   G1      — varje storlek i FASER har CSS, och varje fas i den storleken har en regel
//   G-SLUT  — varje storlek fabriken kan skapa finns i FASER (den omvända riktningen)
//
// Utan BÅDA hållen kan en fjärde storlek läggas till utan koreografi, eller en koreografi skrivas
// för en storlek som inte går att skapa. Fan Level Up levde ett helt repo-liv med `card` i CSS:en
// utan att finnas i fabriken, just för att inget prov jämförde källorna med varandra.
//
// §7 GÄLLER VARJE FRÅNVAROPROV HÄR. G-IMPORTANT och G-DÖD-CSS hävdar båda att något INTE finns.
// Ett sådant prov är grönt innan koden ens är skriven. Varje sådan vakt har därför en positiv
// kontroll som kör samma matchare mot en syntetisk sträng som SKA fällas — annars mäter provet att
// filen är tom, inte att den är ren.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.after(closeAll);

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const finns = f => fs.existsSync(path.join(ROOT, f));

const FABRIK = las('widget-factory.js');
const MEDIA = las('media.js');
const RUNTIME = las('runtime-controls.js');
const GW_CSS = finns('guardian-welcome.css') ? las('guardian-welcome.css') : '';
const GW_JS = finns('guardian-fas.js') ? las('guardian-fas.js') : '';

// CSS utan kommentarer. En vakt som läser regel för regel matchar `nagot { nagot }`, och en
// kommentar strax före en regel hamnar då inuti "selektorn" — hearts-blocket i premium-final.css
// fällde en gång sin egen dokumentation för att den CITERADE felet den beskrev.
const utanKommentarer = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const REGLER = () => [...utanKommentarer(GW_CSS).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(m => ({ valjare: m[1].trim(), kropp: m[2] }));

// KONTROLLMÄTNINGEN SOM VARJE FRÅNVAROPROV MÅSTE PASSERA FÖRST.
//
// Uppmätt vid den röda baslinjen: G-IMPORTANT, G-DÖD-CSS och G-VILOLAGER var alla GRÖNA innan en
// rad CSS var skriven. Deras matchare fungerade — det bevisar de egna positiva kontrollerna — men
// de kördes mot en tom sträng, för `GW_CSS` är '' när filen inte finns. "Ingen !important i
// CSS:en" är trivialt sant om det inte finns någon CSS.
//
// Att lita på att G0 fångar det räcker inte: G0 är ett ANNAT prov, och ett grönt prov säger
// ingenting om vad grannen mätte. Kontrollen ligger därför inne i varje frånvaroprov.
function kravCss() {
  assert.ok(GW_CSS.trim().length > 200,
    'kontrollmätning: guardian-welcome.css saknas eller är tom — frånvaroprovet nedan skulle bli '
    + 'grönt utan att mäta något');
  return utanKommentarer(GW_CSS);
}

// ---- Registren, lästa ur källan ----------------------------------------------------------------

// Ur widget-factory.js: `'guardianwelcome.size': {banner:'…',kort:'…',full:'…'}`
function fabriksstorlekar() {
  const rad = FABRIK.match(/'guardianwelcome\.size':\s*\{([^}]*)\}/);
  assert.ok(rad, "hittade inte 'guardianwelcome.size' i widget-factory.js");
  return rad[1].split(',').map(p => p.split(':')[0].trim().replace(/^'|'$/g, ''));
}
// Ur panelens storleksväljare `<select id="gwSize">…<option value="kort">…`
function valjarstorlekar() {
  const rad = MEDIA.match(/<select id="gwSize">(.*?)<\/select>/s);
  assert.ok(rad, 'hittade inte storleksväljaren #gwSize i media.js');
  return [...rad[1].matchAll(/<option value="([^"]+)"/g)].map(m => m[1]);
}
// Varje `.guardian-size-X` som CSS:en faktiskt stylar.
function cssstorlekar() {
  return [...new Set([...utanKommentarer(GW_CSS).matchAll(/guardian-size-([a-z0-9]+)/g)].map(m => m[1]))];
}

// ---- Riggen ------------------------------------------------------------------------------------

const gwWidget = (id = 'gw1', over = {}) => ({
  id, type: 'templateGuardianWelcome', x: 10, y: 10, width: 300, title: 'Guardian Welcome',
  guardianSize: 'kort', guardianLang: 'auto', guardianShowWeek: true, guardianCustomText: '',
  guardianUsername: '@TestGuardian', guardianWeek: 47, ...over,
});

// En klocka som inte går förrän provet säger till. Jobben körs i TIDSORDNING, inte i
// insättningsordning — annars kan ett prov bli grönt av en slump när två faser råkar sättas fel.
function manuellKlocka(win) {
  const jobb = [];
  let nu = 0;
  win.VyraGuardianFas.klocka.satt = (fn, ms) => { const j = { fn, vid: nu + ms }; jobb.push(j); return j };
  win.VyraGuardianFas.klocka.rensa = j => { const i = jobb.indexOf(j); if (i >= 0) jobb.splice(i, 1) };
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

function boot(widgets = [gwWidget()]) {
  const h = createDom({ state: { widgets, projectName: 'guardian' } });
  h.load('overlay-sanitize.js');      // renderaren går genom VyraSafe för namn och text
  h.load('guardian-fas.js');
  // state fylls om EFTER att media.js laddats: studio.js:s egen uppstart nollar listan, så
  // createDom-argumentet ensamt ger `state.widgets.length === 0` och triggern hittar inget att
  // tända. Samma ordning som fan-fas.test.js och fan-level-session.test.js.
  const script = h.document.createElement('script');
  script.textContent = `state.widgets.length=0;${widgets.map(w => `state.widgets.push(${JSON.stringify(w)})`).join(';')};`;
  h.document.body.append(script);
  const canvas = h.paint(widgets);
  const klocka = manuellKlocka(h.window);
  const lada = id => canvas.querySelector(`[data-id="${id}"]`);
  const faser = id => [...lada(id).classList].filter(k => k.startsWith('gw-fas-')).map(k => k.slice(7));

  // EGENSKAPSPANELEN MÅSTE BYGGAS, den kommer inte med `paint`. `paint` bygger canvasen ur `wh`;
  // panelen bor i `props` och binds av `bind`, och båda kräver att `selected` pekar på widgeten.
  // `selected` är en top-level `let` i studio.js, alltså i den delade globala lexikala miljön och
  // INTE på window — den går bara att sätta från ett script som körs i sidan.
  //
  // `bind()` kör hela kedjan av bindare, och en granne som kastar i riggen skulle annars ta med sig
  // Guardians bindning i fallet. Kastet fångas därför, men provet lutar sig inte på tystnaden:
  // kontrollmätningen (`anrop === 1`) bevisar att just den här bindningen kom fram.
  const panel = id => {
    const s = h.document.createElement('script');
    // `view='editor'` MÅSTE sättas. Varje panelbindare i media.js börjar med
    // `if(view!=='editor')return`, och studio.js startar i 'home'. Utan raden binds ingenting, och
    // provet nedan hade mätt en knapp utan hanterare i stället för en knapp som inte muterar state.
    s.textContent = `view='editor';selected=${JSON.stringify(id)};(function(){`
      + `let host=document.querySelector('.properties');`
      + `if(!host){host=document.createElement('div');host.className='properties';document.body.append(host)}`
      + `host.innerHTML=props();try{bind()}catch(e){window.__bindFel=String(e&&e.message||e)}})();`;
    h.document.body.append(s);
    return h.document.querySelector('.properties');
  };
  // `state` är en top-level `const` i studio.js — den bor i den delade globala lexikala miljön och
  // finns INTE på window. Ett prov som vill jämföra state före och efter måste hämta den härifrån.
  const statebild = () => {
    const s = h.document.createElement('script');
    s.textContent = 'window.__gwStatebild=JSON.stringify(state.widgets[0]||null)';
    h.document.body.append(s);
    return h.window.__gwStatebild;
  };
  return { h, canvas, klocka, lada, faser, panel, statebild, win: h.window };
}

// ================================================================================================
// FILERNA FINNS — den positiva kontrollen för allt nedanför.
//
// Utan den här grinden är varje källkodsvakt i filen grön mot en TOM sträng: `GW_CSS` är '' när
// filen inte finns, och "ingen !important i CSS:en" är trivialt sant om det inte finns någon CSS.
// §7 i sin renaste form.
// ================================================================================================

test('G0: familjens två filer finns', () => {
  assert.ok(finns('guardian-fas.js'), 'guardian-fas.js saknas — koreografin har ingen hemvist');
  assert.ok(finns('guardian-welcome.css'), 'guardian-welcome.css saknas — temat har ingen hemvist');
  assert.ok(GW_CSS.trim().length > 200, 'guardian-welcome.css är i praktiken tom');
  assert.ok(GW_JS.trim().length > 200, 'guardian-fas.js är i praktiken tom');
});

// ================================================================================================
// G1 — VARJE STORLEK HAR CSS, OCH VARJE FAS I DEN HAR EN REGEL
// ================================================================================================

test('G1: varje storlek i FASER stylas av guardian-welcome.css', () => {
  const { FASER } = require('./helpers/guardian-fas-register.js');
  const styled = new Set(cssstorlekar());
  const utan = Object.keys(FASER).filter(s => !styled.has(s));
  assert.deepEqual(utan, [],
    `${utan.join(', ')} har koreografi men ingen CSS — faserna snäpper förbi utan att något syns`);
});

test('G1: ingen CSS stylar en storlek som inte finns i registret', () => {
  const { FASER } = require('./helpers/guardian-fas-register.js');
  const registrerade = new Set(Object.keys(FASER));
  const foraldralosa = cssstorlekar().filter(s => !registrerade.has(s));
  assert.deepEqual(foraldralosa, [],
    `CSS stylar ${foraldralosa.join(', ')} som inget register känner till — död kod som ser levande ut`);
});

test('G1: varje fas i varje storlek har minst en CSS-regel', () => {
  const { FASER, PREFIX } = require('./helpers/guardian-fas-register.js');
  const css = utanKommentarer(GW_CSS);
  const saknas = [];
  for (const [storlek, lista] of Object.entries(FASER)) {
    for (const fas of lista) {
      if (!css.includes(PREFIX + fas.namn)) saknas.push(`${storlek}/${fas.namn}`);
    }
  }
  assert.deepEqual(saknas, [],
    `fasen har ingen regel i guardian-welcome.css: ${saknas.join(', ')} — klassen sätts och tas bort utan att något rör sig`);
});

// ================================================================================================
// G-SLUT — DEN OMVÄNDA RIKTNINGEN. 23g:s motsvarighet.
//
// G1 kräver att varje registrerad koreografi har CSS. Den här kräver att varje storlek som går att
// SKAPA har koreografi. Utan båda hållen kan en fjärde storlek läggas till i fabriken och panelen
// utan att någon fas spelar — widgeten skulle snäppa fram färdig och ingen vakt skulle säga något.
// ================================================================================================

test('G-SLUT: fabriken, panelväljaren och FASER listar exakt samma storlekar', () => {
  const { FASER, STORLEKAR } = require('./helpers/guardian-fas-register.js');
  const fabrik = [...fabriksstorlekar()].sort();
  const valjare = [...valjarstorlekar()].sort();
  const koreografi = Object.keys(FASER).sort();

  assert.deepEqual(fabrik, valjare,
    'fabriken och panelens storleksväljare är inte samma mängd — en storlek går att skapa på ett ställe men inte det andra');
  assert.deepEqual(fabrik, koreografi,
    'en storlek går att skapa utan att ha någon koreografi — den skulle snäppa fram färdig');
  assert.deepEqual([...STORLEKAR].sort(), koreografi,
    'STORLEKAR och FASER har glidit isär inne i guardian-fas.js');
});

test('G-SLUT: de tre storlekarna är banner, kort och full', () => {
  const { STORLEKAR } = require('./helpers/guardian-fas-register.js');
  assert.deepEqual([...STORLEKAR].sort(), ['banner', 'full', 'kort'],
    'familjen ska bära exakt tre storlekar');
});

// ================================================================================================
// KOREOGRAFIN "BESKYDDET" — fyra faser, samma ordning i varje storlek.
//
//   ljus (500)        auroran tonar in, allt annat släckt
//   oppna (900)       skölden glider in, rubriken stämplas fram, namn och underrubrik följer
//   hyllning (varierar) sköldens glöd pulserar, ingen konkurrerande rörelse
//   upplosning (600)  allt tonar ut i omvänd ordning, auroran sist
//
// Fasnamnen är ASCII med flit. `oppna` och `upplosning`, inte `öppna` och `upplösning` — de blir
// CSS-klassnamn, och resten av repot håller sig till a-z där (avtackning, avlasning, uppstigning).
// ================================================================================================

const ORDNING = ['ljus', 'oppna', 'hyllning', 'upplosning'];

test('Beskyddet: varje storlek har fyra faser i samma ordning', () => {
  const { FASER } = require('./helpers/guardian-fas-register.js');
  for (const [storlek, lista] of Object.entries(FASER)) {
    assert.deepEqual(lista.map(f => f.namn), ORDNING,
      `${storlek} spelar inte ljus → oppna → hyllning → upplosning`);
  }
});

test('Beskyddet: ljus, oppna och upplosning är lika långa i alla storlekar', () => {
  // Bara hyllningen får variera — det är hållet, inte rörelsen. En banner som öppnar sig snabbare
  // än en full skulle kännas som två olika appar.
  const { FASER } = require('./helpers/guardian-fas-register.js');
  const langd = (storlek, namn) => FASER[storlek].find(f => f.namn === namn).ms;
  for (const namn of ['ljus', 'oppna', 'upplosning']) {
    const varden = Object.keys(FASER).map(s => langd(s, namn));
    assert.equal(new Set(varden).size, 1,
      `fasen ${namn} är olika lång i olika storlekar: ${varden.join(', ')} ms`);
  }
  assert.equal(langd('kort', 'ljus'), 500, 'ljusfasen ska vara 500 ms');
  assert.equal(langd('kort', 'oppna'), 900, 'öppnandet ska vara 900 ms');
  assert.equal(langd('kort', 'upplosning'), 600, 'upplösningen ska vara 600 ms');
});

test('Beskyddet: hyllningen växer med storleken', () => {
  const { FASER } = require('./helpers/guardian-fas-register.js');
  const h = s => FASER[s].find(f => f.namn === 'hyllning').ms;
  assert.ok(h('banner') < h('kort') && h('kort') < h('full'),
    `hyllningen ska växa banner → kort → full, men är ${h('banner')}/${h('kort')}/${h('full')} ms`);
});

test('Beskyddet: ingen koreografi är längre än den kortaste visningen', () => {
  // Motsvarigheten till F3. En sekvens som är längre än visningstiden hinner aldrig spelas färdigt
  // innan uttoningen börjar, och tittaren ser en avhuggen rörelse. Gäller varje registrerad
  // storlek, inte bara de tre som råkar finnas idag.
  const { FASER, KORTASTE_VISNING } = require('./helpers/guardian-fas-register.js');
  for (const [storlek, lista] of Object.entries(FASER)) {
    const total = lista.reduce((s, f) => s + f.ms, 0);
    assert.ok(total <= KORTASTE_VISNING,
      `${storlek} spelar i ${total} ms men visningen är som kortast ${KORTASTE_VISNING} ms`);
  }
});

test('Beskyddet: triggern tänder första fasen synkront', () => {
  const { win, faser } = boot([gwWidget('gw1')]);
  win.triggerGuardianWelcome({ username: '@TestGuardian', weekNumber: 47, __test: true });
  assert.deepEqual(faser('gw1'), ['ljus'], 'ljusfasen sattes inte i samma anrop som triggern');
});

test('Beskyddet: faserna byter på exakt sina tider och ingen överlever', () => {
  const { FASER } = require('./helpers/guardian-fas-register.js');
  const [ljus, oppna, hyllning, upplosning] = FASER.kort;
  const { win, klocka, faser } = boot([gwWidget('gw1', { guardianSize: 'kort' })]);
  win.triggerGuardianWelcome({ username: '@TestGuardian', weekNumber: 47, __test: true });

  klocka.fram(ljus.ms - 1);
  assert.deepEqual(faser('gw1'), ['ljus'], 'ljuset slutade en millisekund för tidigt');
  klocka.fram(1);
  assert.deepEqual(faser('gw1'), ['oppna'], 'öppnandet började inte när ljuset tog slut');
  klocka.fram(oppna.ms);
  assert.deepEqual(faser('gw1'), ['hyllning'], 'hyllningen började inte när öppnandet tog slut');
  klocka.fram(hyllning.ms);
  assert.deepEqual(faser('gw1'), ['upplosning'], 'upplösningen började inte när hyllningen tog slut');
  klocka.fram(upplosning.ms);
  assert.deepEqual(faser('gw1'), [], 'en fasklass låg kvar efter sista fasen');
  assert.equal(klocka.kvar(), 0, 'en timer lämnades kvar');
});

test('Beskyddet: två faser är aldrig aktiva samtidigt', () => {
  // CSS:en slipper då bry sig om kombinationer, och det är hela skälet att varje fas äger sin
  // klass ensam. Provet går genom hela sekvensen i 50-millisekunderssteg.
  const { FASER } = require('./helpers/guardian-fas-register.js');
  const total = FASER.full.reduce((s, f) => s + f.ms, 0);
  const { win, klocka, faser } = boot([gwWidget('gw1', { guardianSize: 'full' })]);
  win.triggerGuardianWelcome({ username: '@TestGuardian', weekNumber: 47, __test: true });
  for (let t = 0; t <= total; t += 50) {
    assert.ok(faser('gw1').length <= 1, `${faser('gw1').length} faser samtidigt vid ${t} ms`);
    klocka.fram(50);
  }
});

test('Beskyddet: en ny trigger startar om från fas ett i stället för att lägga sig ovanpå', () => {
  const { FASER } = require('./helpers/guardian-fas-register.js');
  const { win, klocka, faser } = boot([gwWidget('gw1')]);
  win.triggerGuardianWelcome({ username: '@A', weekNumber: 47, __test: true });
  klocka.fram(FASER.kort[0].ms + 100);
  assert.deepEqual(faser('gw1'), ['oppna'], 'kontrollmätning: sekvensen skulle ha gått vidare');
  win.triggerGuardianWelcome({ username: '@B', weekNumber: 48, __test: true });
  assert.deepEqual(faser('gw1'), ['ljus'], 'en ny Guardian startade inte om koreografin');
});

// ================================================================================================
// SPRÅKET — ETT STÄLLE, DOKUMENTERAD ORDNING
//
// VyraLang finns inte i repot (uppmätt 2026-08-18: noll träffar). `sprak()` är därför familjens
// enda ställe där språk avgörs, och ordningen är utskriven: uttryckligt val → VyraLang om den
// någonsin byggs → navigator.language → 'sv'. När VyraLang byggs byts EN rad.
//
// Regeln för fallbacken är medvetet asymmetrisk: bara engelska ger engelska. En tysk webbläsare
// får svenska, inte engelska, eftersom svenska är appens språk och engelska är ett aktivt val.
// ================================================================================================

test('Språk: ett uttryckligt val vinner över allt annat', () => {
  const R = require('./helpers/guardian-fas-register.js');
  assert.equal(R.sprakIRymd({ guardianLang: 'sv' }, { sprakkod: 'en-US' }), 'sv');
  assert.equal(R.sprakIRymd({ guardianLang: 'en' }, { sprakkod: 'sv-SE' }), 'en');
});

test('Språk: auto läser navigator.language, och bara engelska ger engelska', () => {
  const R = require('./helpers/guardian-fas-register.js');
  const auto = { guardianLang: 'auto' };
  assert.equal(R.sprakIRymd(auto, { sprakkod: 'en-US' }), 'en');
  assert.equal(R.sprakIRymd(auto, { sprakkod: 'en' }), 'en');
  assert.equal(R.sprakIRymd(auto, { sprakkod: 'sv-SE' }), 'sv');
  assert.equal(R.sprakIRymd(auto, { sprakkod: 'de-DE' }), 'sv',
    'en tysk webbläsare ska få appens språk, inte engelska');
  assert.equal(R.sprakIRymd(auto, { sprakkod: '' }), 'sv', 'utan språkkod ska svenska gälla');
});

test('Språk: VyraLang vinner över navigator när den en dag finns', () => {
  // Kroken finns redan så att inkopplingen blir en rad och inte en refaktorering. Provet är det
  // som gör kroken sann i stället för en förhoppning i en kommentar.
  const R = require('./helpers/guardian-fas-register.js');
  const lang = { current: () => 'en-GB' };
  assert.equal(R.sprakIRymd({ guardianLang: 'auto' }, { sprakkod: 'sv-SE', vyraLang: lang }), 'en');
});

test('Språk: båda språken har rubrik och veckorad, och de skiljer sig åt', () => {
  const R = require('./helpers/guardian-fas-register.js');
  const sv = R.textIRymd('sv', 47), en = R.textIRymd('en', 47);
  assert.equal(sv.rubrik, 'BESKYDDAREN HAR ANLÄNT');
  assert.equal(en.rubrik, 'GUARDIAN HAS ARRIVED');
  assert.equal(sv.vecka, 'Vecka 47 · Din Beskyddare');
  assert.equal(en.vecka, 'Week 47 · Your Guardian');
  assert.notEqual(sv.rubrik, en.rubrik, 'språken ger samma rubrik — översättningen är en attrapp');
});

test('Språk: veckonumret kommer från eventet, inte från en hårdkodad siffra', () => {
  const R = require('./helpers/guardian-fas-register.js');
  assert.match(R.textIRymd('sv', 3).vecka, /\b3\b/);
  assert.match(R.textIRymd('en', 52).vecka, /\b52\b/);
});

// ================================================================================================
// G-IMPORTANT — INGEN `!important` PÅ TRANSFORM, OPACITY ELLER CLIP-PATH
//
// Tre separata döda animationer i Fan Level Up hade samma rot: en vanlig regel med `!important`
// slår en CSS-animation, så halva keyframen körde aldrig. Det ser fullkomligt harmlöst ut i
// källan — loyaltys sockel, badgereveals transform och hearts opacitet såg alla korrekta ut.
//
// §7: frånvaroprovet har en positiv kontroll. Matcharen körs mot en syntetisk sträng som SKA
// fällas, i samma prov. Utan den är vakten grön mot en tom fil.
// ================================================================================================

const VIKTIGT = /(transform|opacity|clip-path)\s*:[^;}]*!important/gi;

test('G-IMPORTANT: matcharen kan faktiskt fälla — positiv kontroll', () => {
  const syntetisk = '.gw-shield{transform:translateX(0)!important}';
  assert.ok(new RegExp(VIKTIGT.source, 'i').test(syntetisk),
    'matcharen hittar inte ens en uppenbar överträdelse — vakten nedan mäter ingenting');
  const ren = '.gw-shield{transform:translateX(0)}';
  assert.ok(!new RegExp(VIKTIGT.source, 'i').test(ren), 'matcharen fäller en ren regel');
});

test('G-IMPORTANT: guardian-welcome.css använder inte !important på rörelseegenskaper', () => {
  const traffar = [...kravCss().matchAll(VIKTIGT)].map(m => m[0]);
  assert.deepEqual(traffar, [],
    '`!important` i en vanlig regel slår en CSS-animation — halva keyframen kör aldrig: ' + traffar.join(' | '));
});

// ================================================================================================
// G-DÖD-CSS — INGEN REGEL SOM EN SENARE REGEL MED SAMMA SPECIFICITET MOTSÄGER
//
// `.fan-layout-loyalty>h2{display:none!important}` var död på exakt det sättet: `.fan-level-up>h2`
// har samma specificitet, kommer senare och bär `display:block!important`. Sju sådana regler hade
// hunnit skrivas innan någon mätte. §11 i tech-debt.md är samma sak i allmän form.
// ================================================================================================

function dodaDoljningar(css) {
  const regler = [...utanKommentarer(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m, i) => ({ i, valjare: m[1].trim(), kropp: m[2] }));
  const doljer = regler.filter(r => /display\s*:\s*none/.test(r.kropp));
  const doda = [];
  for (const d of doljer) {
    // Samma selektor, senare i filen, som sätter display till något annat.
    const motsagd = regler.some(r => r.i > d.i && r.valjare === d.valjare
      && /display\s*:\s*(?!none)[a-z-]+/.test(r.kropp));
    if (motsagd) doda.push(d.valjare);
  }
  return doda;
}

test('G-DÖD-CSS: matcharen kan faktiskt fälla — positiv kontroll', () => {
  const syntetisk = '.gw-ornament{display:none!important}.gw-ornament{display:block!important}';
  assert.deepEqual(dodaDoljningar(syntetisk), ['.gw-ornament'],
    'matcharen hittar inte ens en uppenbar motsägelse — vakten nedan mäter ingenting');
  assert.deepEqual(dodaDoljningar('.gw-ornament{display:none}'), [],
    'matcharen fäller en regel som ingen motsäger');
});

test('G-DÖD-CSS: ingen döljning i guardian-welcome.css motsägs senare', () => {
  kravCss();
  assert.deepEqual(dodaDoljningar(GW_CSS), [],
    'regeln är död kod som ser levande ut — en senare regel med samma specificitet vinner');
});

// ================================================================================================
// G-VILOLAGER — en oändlig animation får inte hänga på en fasklass
//
// Ribbons andning lärde oss det: en `infinite` som ligger på en fasklass dör när klassen tas bort,
// alltså precis när den skulle ha börjat behövas. Hyllningens puls är en sådan animation, men den
// ska sitta på hyllningsfasen och SLUTA där — det är en fas, inte ett vilolager. Den här vakten
// gäller därför bara animationer som är `infinite` UTANFÖR hyllningen.
// ================================================================================================

test('G-VILOLAGER: ingen infinite-animation hänger på ljus, oppna eller upplosning', () => {
  kravCss();
  const doda = REGLER().filter(r => /infinite/.test(r.kropp)
    && /gw-fas-(ljus|oppna|upplosning)\b/.test(r.valjare));
  assert.deepEqual(doda.map(r => r.valjare), [],
    'en oändlig animation hänger på en fas som tas bort — den dör precis när den skulle behövas');
});

// ================================================================================================
// KÖN — testknappen kan inte kringgå den, eftersom den globala referensen ÄR kön
//
// §2 (PR #217) var en efterhandslagning: fyrverkeriets testknapp byggde raketerna direkt på DOM.
// Guardian löser det ett steg tidigare. `installQueueWrappers` i runtime-controls.js byter ut
// `window.triggerGuardianWelcome` mot en variant som bara lägger jobbet i VyraAlertQueue. Allt som
// anropar det globala namnet — testknappen, en Action-regel, bryggan — köar därmed per definition.
// ================================================================================================

test('Kön: triggerGuardianWelcome står i runtime-controls configs-tabell', () => {
  assert.match(RUNTIME, /triggerGuardianWelcome\s*:\s*\[\s*\d+\s*,\s*\d+\s*\]/,
    'triggern lindas inte av installQueueWrappers — då spelar testknappen utanför kön');
});

test('Kön: testknappen anropar det globala namnet och inget annat', () => {
  const bind = MEDIA.match(/#testGuardian[\s\S]{0,400}/);
  assert.ok(bind, 'hittade ingen bindning för #testGuardian i media.js');
  const kropp = bind[0];
  assert.match(kropp, /triggerGuardianWelcome\s*\(/,
    'testknappen går inte genom triggern — den kan inte köa');
  assert.ok(!/classList\.add\(\s*['"]gw-active/.test(kropp),
    'testknappen tänder widgeten direkt på DOM i stället för att köa — exakt §2:s fel');
  assert.ok(!/VyraGuardianFas\.spela\s*\(/.test(kropp),
    'testknappen startar koreografin direkt förbi triggern');
});

test('Kön: testknappen muterar inte widgetens state vid klick', () => {
  // Kontrollmätning enligt §7: knappen MÅSTE ha gjort något (en trigger räknades), och ändå får
  // inget fält i widgeten ha ändrats. Utan första halvan är andra halvan sann för en knapp som
  // inte finns.
  const { h, win, panel, statebild } = boot([gwWidget('gw1')]);
  panel('gw1');
  const fore = statebild();
  let anrop = 0;
  const original = win.triggerGuardianWelcome;
  win.triggerGuardianWelcome = function (...a) { anrop += 1; return original.apply(this, a) };
  const knapp = h.document.querySelector('#testGuardian');
  assert.ok(knapp, 'testknappen #testGuardian finns inte i panelen');
  knapp.click();
  assert.equal(anrop, 1, 'kontrollmätning: knappen anropade inte triggern');
  assert.equal(statebild(), fore,
    'knappen skrev till widgetens state — ett testklick ska inte spara något');
});

test('Renderaren kastar inte om syskonfilen saknas, och reservtexten är samma svenska', () => {
  // `render()` gör `widgets.map(wh).join('')` — EN widget som kastar i sin renderare tar hela duken
  // med sig, och streamern ser en tom layout utan förklaring. Uppmätt: i en rigg som laddar media.js
  // men inte guardian-fas.js kastade renderaren, och katalogens miniatyrvakt såg det som tre knappar
  // utan miniatyr. I studio.html laddas filerna i rad, men "kan inte inträffa i den ordning vi råkar
  // ha idag" är inte samma sak som robust.
  //
  // Reservtexten är en sista utväg, inte ett andra språkbeslut. Att de två svenska strängarna är
  // identiska vaktas här, så de aldrig kan glida isär.
  const { textIRymd } = require('./helpers/guardian-fas-register.js');
  const sv = textIRymd('sv', 47);
  const reserv = MEDIA.match(/return \{rubrik:'([^']+)',vecka:'([^']+)'\+gwVecka\(w\)\+'([^']+)'\}/);
  assert.ok(reserv, 'hittade ingen reservtext i gwText — renderaren litar på att syskonfilen finns');
  assert.equal(reserv[1], sv.rubrik, 'reservrubriken har glidit ifrån guardian-fas.js svenska');
  assert.equal(reserv[2] + '47' + reserv[3], sv.vecka, 'reservveckoraden har glidit ifrån');
});

// ================================================================================================
// FABRIKEN OCH PANELEN
// ================================================================================================

test('Fabriken: catalog:guardianwelcome:<storlek> ger rätt typ och mått', () => {
  const MATT = { banner: [270, 180], kort: [300, 280], full: [400, 300] };
  const { STORLEKAR } = require('./helpers/guardian-fas-register.js');
  const sandlada = { window: { crypto: require('crypto').webcrypto } };
  sandlada.window.window = sandlada.window;
  const vm = require('vm');
  vm.runInNewContext(FABRIK, sandlada.window, { filename: 'widget-factory.js' });
  for (const storlek of STORLEKAR) {
    const w = sandlada.window.VyraWidgets.create('catalog:guardianwelcome:' + storlek);
    assert.equal(w.type, 'templateGuardianWelcome', `${storlek} gav fel widgettyp`);
    assert.equal(w.guardianSize, storlek, `${storlek} bar inte sin egen storlek`);
    assert.equal(w.width, MATT[storlek][0], `${storlek} har fel bredd`);
    assert.equal(w.height, MATT[storlek][1], `${storlek} har fel höjd`);
  }
});

test('Fabriken: en okänd storlek kastar med giltiga alternativ i texten', () => {
  const vm = require('vm');
  const sandlada = { window: { crypto: require('crypto').webcrypto } };
  sandlada.window.window = sandlada.window;
  vm.runInNewContext(FABRIK, sandlada.window, { filename: 'widget-factory.js' });
  assert.throws(() => sandlada.window.VyraWidgets.create('catalog:guardianwelcome:jatte'),
    /banner|kort|full/, 'felmeddelandet räknar inte upp vad som faktiskt går att välja');
});

test('Panelen: alla fyra valen har ett fält', () => {
  for (const id of ['gwLang', 'gwSize', 'gwShowWeek', 'gwCustomText']) {
    assert.match(MEDIA, new RegExp(`id="${id}"`), `panelen saknar fältet #${id}`);
  }
});

test('Panelen: fälten ligger på den delade live-vägen, inte på render()', () => {
  // panel-live-path.test.js härleder sin fillista och skulle fånga ett render()-anrop i en
  // oninput. Det här provet är den familjespecifika versionen: Guardians fält ska använda samma
  // mall som giftFieldBind, alltså vyraLivePatch vid input och commit vid change.
  const bind = MEDIA.match(/#gwCustomText[\s\S]{0,300}/);
  assert.ok(bind, 'hittade ingen bindning för #gwCustomText');
  assert.ok(!/(?:^|[^.\w])render\s*\(\s*\)/.test(bind[0]),
    'ett Guardian-fält bygger om hela vyn från en oninput — fältet man skriver i byts ut vid varje tangenttryck');
});

// ================================================================================================
// RENDERINGEN — vad lådan faktiskt bär
// ================================================================================================

test('Markup: widgeten bär sin storleksklass och familjens delar', () => {
  const { lada } = boot([gwWidget('gw1', { guardianSize: 'full' })]);
  const box = lada('gw1');
  assert.ok(box, 'widgeten renderades inte');
  assert.ok(box.classList.contains('guardian-welcome'), 'familjeklassen saknas');
  assert.ok(box.classList.contains('guardian-size-full'), 'storleksklassen saknas');
  for (const del of ['.gw-aurora', '.gw-shield', '.gw-content', '.gw-title', '.gw-username',
                     '.gw-subtitle', '.gw-ornament-left', '.gw-ornament-right']) {
    assert.ok(box.querySelector(del), `delen ${del} saknas i markupen`);
  }
  assert.ok(box.querySelector('.gw-shield svg'), 'skölden bär ingen SVG — hjorten saknas');
});

test('Markup: veckoraden går att stänga av, och det syns', () => {
  // Kontrollmätning enligt §7: raden måste FINNAS när den är påslagen, annars är frånvaron
  // trivialt sann. Fixturen bär samma veckonummer i båda fallen så skillnaden bara kan komma
  // från flaggan.
  const pa = boot([gwWidget('gwA', { guardianShowWeek: true })]);
  assert.ok(pa.lada('gwA').querySelector('.gw-subtitle'),
    'kontrollmätning: veckoraden syns inte ens när den är påslagen');
  const av = boot([gwWidget('gwB', { guardianShowWeek: false })]);
  assert.equal(av.lada('gwB').querySelector('.gw-subtitle'), null,
    'veckoraden renderas trots att guardianShowWeek är false');
});

test('Markup: egen text ersätter veckoraden när den är ifylld', () => {
  const { lada } = boot([gwWidget('gw1', { guardianCustomText: 'Tack för skyddet' })]);
  assert.equal(lada('gw1').querySelector('.gw-subtitle').textContent.trim(), 'Tack för skyddet');
});

test('Markup: användarnamnet saneras i stället för att tolkas som markup', () => {
  const { lada } = boot([gwWidget('gw1', { guardianUsername: '<img src=x onerror=1>' })]);
  const namn = lada('gw1').querySelector('.gw-username');
  assert.equal(namn.querySelector('img'), null, 'ett användarnamn blev markup i overlayn');
});
