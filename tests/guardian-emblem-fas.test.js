'use strict';
// Guardian Emblem · det heraldiska vapnet, dess fyra praktsteg och familjens vaktnät.
//
// SAMMA DISCIPLIN SOM FAN LEVEL UP OCH GUARDIAN WELCOME, av samma skäl. JS bestämmer NÄR, CSS
// bestämmer VAD. Drivrutinen sätter fasklasser (`ge-fas-<namn>`) i tur och ordning och tar bort
// dem sist. Klockan är utbytbar (`VyraGuardianEmblemFas.klocka`), så fasproven är exakta och
// omedelbara i stället för att sova 600 ms per påstående.
//
// VAKTNÄTET SKA VARA MATEMATISKT SLUTET. Tolv vakter, och de fyra första hänger ihop parvis:
//
//   G1                 — varje registrerat steg och varje del i det har CSS
//   G-SLUT             — varje steg som går att SKAPA finns i registret (omvända riktningen)
//   G-STEG-PROGRESSION — steg N bär allt steg N-1 bär, plus mer (prakten växer, byts inte ut)
//   G-STEG-HÖJD        — och det syns: höjden växer med steget (browserfilen äger den halvan)
//
// Utan BÅDA hållen kan ett femte steg läggas till utan delar, eller delar stylas för ett steg som
// inte går att skapa. Fan Level Up levde ett helt repo-liv med `card` i CSS:en utan att finnas i
// fabriken, just för att inget prov jämförde källorna med varandra.
//
// §7 GÄLLER VARJE FRÅNVAROPROV HÄR. G-PREFIX-ISOLATION, G-IMPORTANT, G-DÖD-CSS och G-VILOLAGER
// hävdar alla att något INTE finns. Ett sådant prov är grönt innan koden ens är skriven — det var
// exakt fällan i Guardian Welcomes fas 0, där tre vakter var gröna mot en fil som inte fanns.
// Varje sådan vakt har därför TVÅ kontroller: en positiv kontroll som kör samma matchare mot en
// syntetisk sträng som SKA fällas, och `kravCss()` som bevisar att det finns CSS att mäta alls.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.after(closeAll);

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const finns = f => fs.existsSync(path.join(ROOT, f));

const FABRIK = las('widget-factory.js');
const MEDIA = las('media.js');
const RUNTIME = las('runtime-controls.js');
const GE_CSS = finns('guardian-emblem.css') ? las('guardian-emblem.css') : '';
const GE_JS = finns('guardian-emblem-fas.js') ? las('guardian-emblem-fas.js') : '';

// CSS utan kommentarer. En vakt som läser regel för regel matchar `nagot { nagot }`, och en
// kommentar strax före en regel hamnar då inuti "selektorn" — hearts-blocket i premium-final.css
// fällde en gång sin egen dokumentation för att den CITERADE felet den beskrev.
const utanKommentarer = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
// Keyframes har nästlade klammer och går inte att läsa med den platta regelmatcharen. De lyfts
// bort först och vaktas separat (namnprefixet, i G-PREFIX-ISOLATION).
const utanKeyframes = css => css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
const reglerI = css => [...utanKeyframes(utanKommentarer(css)).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((m, i) => ({ i, valjare: m[1].trim(), kropp: m[2] }));
const REGLER = () => reglerI(GE_CSS);

// KONTROLLMÄTNINGEN SOM VARJE FRÅNVAROPROV MÅSTE PASSERA FÖRST.
//
// "Ingen !important i CSS:en" är trivialt sant om det inte finns någon CSS. Att lita på att ett
// annat prov (G0) fångar det räcker inte: G0 är ett ANNAT prov, och ett grönt prov säger ingenting
// om vad grannen mätte. Kontrollen ligger därför inne i varje frånvaroprov.
function kravCss() {
  assert.ok(GE_CSS.trim().length > 200,
    'kontrollmätning: guardian-emblem.css saknas eller är tom — frånvaroprovet nedan skulle bli '
    + 'grönt utan att mäta något');
  return utanKommentarer(GE_CSS);
}

// ---- Registren, lästa ur källan ----------------------------------------------------------------

// Ur widget-factory.js: `'guardianemblem.step': {1:'Sköld',2:'Krona',…}`
function fabrikssteg() {
  const rad = FABRIK.match(/'guardianemblem\.step':\s*\{([^}]*)\}/);
  assert.ok(rad, "hittade inte 'guardianemblem.step' i widget-factory.js");
  return rad[1].split(',').map(p => p.split(':')[0].trim().replace(/^'|'$/g, ''));
}
// Ur panelens stegväljare `<select id="geStep">…<option value="3">…`
function valjarsteg() {
  const rad = MEDIA.match(/<select id="geStep">(.*?)<\/select>/s);
  assert.ok(rad, 'hittade inte stegväljaren #geStep i media.js');
  return [...rad[1].matchAll(/<option value="([^"]+)"/g)].map(m => m[1]);
}
// Ur katalogsektionens `let geSteg=[['1','Sköld'],…]`
function katalogsteg() {
  const rad = MEDIA.match(/let geSteg=\[(.*?)\];/s);
  assert.ok(rad, 'hittade inte katalogens geSteg i media.js');
  return [...rad[1].matchAll(/\['([^']+)'/g)].map(m => m[1]);
}
// Varje `.ge-step-N` som CSS:en faktiskt stylar.
function cssteg() {
  return [...new Set([...utanKommentarer(GE_CSS).matchAll(/ge-step-([a-z0-9]+)/g)].map(m => m[1]))];
}
// Varje `.ge-<del>` som CSS:en stylar — utan stegklasserna och fasklasserna, som inte är delar.
// Teckenklassen ar `[A-Za-z0-9-]`, inte `[a-z0-9-]`. Uppmatt i mutationsprov M1: med bara sma
// bokstaver last `.ge-kronaX` som `krona`, och en felstavning med versal hade blivit OSYNLIG for
// bada halvorna av G1 — den skulle bade se en del som stylad och missa en foraldralos regel.
function cssdelar() {
  return [...new Set([...utanKommentarer(GE_CSS).matchAll(/\.ge-([A-Za-z0-9-]+)/g)].map(m => m[1]))]
    .filter(d => !/^step-/.test(d) && !/^fas-/.test(d));
}

// En fabrik i egen rymd. `newId` kräver riktig crypto, annars kastar den.
function fabrik() {
  const win = { crypto: require('crypto').webcrypto };
  win.window = win;
  vm.runInNewContext(FABRIK, win, { filename: 'widget-factory.js' });
  return win.VyraWidgets;
}

// ---- Riggen ------------------------------------------------------------------------------------

const geWidget = (id = 'ge1', over = {}) => ({
  id, type: 'templateGuardianEmblem', x: 10, y: 10, width: 400, height: 380,
  title: 'Guardian Emblem', guardianStep: 3, guardianLang: 'auto', guardianShowUsername: true,
  guardianCustomText: '', guardianUsername: '@TestGuardian', ...over,
});

// En klocka som inte går förrän provet säger till. Jobben körs i TIDSORDNING, inte i
// insättningsordning — annars kan ett prov bli grönt av en slump när två faser råkar sättas fel.
function manuellKlocka(win) {
  const jobb = [];
  let nu = 0;
  win.VyraGuardianEmblemFas.klocka.satt = (fn, ms) => { const j = { fn, vid: nu + ms }; jobb.push(j); return j };
  win.VyraGuardianEmblemFas.klocka.rensa = j => { const i = jobb.indexOf(j); if (i >= 0) jobb.splice(i, 1) };
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

function boot(widgets = [geWidget()]) {
  const h = createDom({ state: { widgets, projectName: 'emblem' } });
  h.load('overlay-sanitize.js');      // renderaren går genom VyraSafe för namn och text
  h.load('guardian-emblem-fas.js');
  // state fylls om EFTER att media.js laddats: studio.js:s egen uppstart nollar listan, så
  // createDom-argumentet ensamt ger `state.widgets.length === 0` och triggern hittar inget att
  // tända. Samma ordning som fan-fas.test.js och fan-level-session.test.js.
  const script = h.document.createElement('script');
  script.textContent = `state.widgets.length=0;${widgets.map(w => `state.widgets.push(${JSON.stringify(w)})`).join(';')};`;
  h.document.body.append(script);
  const canvas = h.paint(widgets);
  const klocka = manuellKlocka(h.window);
  const lada = id => canvas.querySelector(`[data-id="${id}"]`);
  const faser = id => [...lada(id).classList].filter(k => k.startsWith('ge-fas-')).map(k => k.slice(7));

  // EGENSKAPSPANELEN MÅSTE BYGGAS, den kommer inte med `paint`. `paint` bygger canvasen ur `wh`;
  // panelen bor i `props` och binds av `bind`, och båda kräver att `selected` pekar på widgeten.
  // `selected` är en top-level `let` i studio.js, alltså i den delade globala lexikala miljön och
  // INTE på window — den går bara att sätta från ett script som körs i sidan.
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
    s.textContent = 'window.__geStatebild=JSON.stringify(state.widgets[0]||null)';
    h.document.body.append(s);
    return h.window.__geStatebild;
  };
  return { h, canvas, klocka, lada, faser, panel, statebild, win: h.window };
}

// ================================================================================================
// G0 — FILERNA FINNS. Den positiva kontrollen för allt nedanför.
//
// Utan den här grinden är varje källkodsvakt i filen grön mot en TOM sträng. §7 i sin renaste form.
// ================================================================================================

test('G0: familjens två filer finns', () => {
  assert.ok(finns('guardian-emblem-fas.js'), 'guardian-emblem-fas.js saknas — koreografin har ingen hemvist');
  assert.ok(finns('guardian-emblem.css'), 'guardian-emblem.css saknas — vapnet har ingen hemvist');
  assert.ok(GE_CSS.trim().length > 200, 'guardian-emblem.css är i praktiken tom');
  assert.ok(GE_JS.trim().length > 200, 'guardian-emblem-fas.js är i praktiken tom');
});

// ================================================================================================
// G1 — VARJE STEG HAR CSS, VARJE DEL HAR CSS, OCH VARJE FAS HAR EN REGEL
// ================================================================================================

test('G1: varje steg i STEG stylas av guardian-emblem.css', () => {
  const { STEG } = require('./helpers/guardian-emblem-fas-register.js');
  const styled = new Set(cssteg());
  const utan = Object.keys(STEG).filter(s => !styled.has(s));
  assert.deepEqual(utan, [],
    `steg ${utan.join(', ')} finns i registret men har ingen CSS — praktnivån syns inte`);
});

test('G1: ingen CSS stylar ett steg som inte finns i registret', () => {
  const { STEG } = require('./helpers/guardian-emblem-fas-register.js');
  const registrerade = new Set(Object.keys(STEG));
  const foraldralosa = cssteg().filter(s => !registrerade.has(s));
  assert.deepEqual(foraldralosa, [],
    `CSS stylar steg ${foraldralosa.join(', ')} som inget register känner till — död kod som ser levande ut`);
});

test('G1: varje del som något steg bär har minst en CSS-regel', () => {
  const { DELAR } = require('./helpers/guardian-emblem-fas-register.js');
  const styled = new Set(cssdelar());
  const utan = DELAR.filter(d => !styled.has(d));
  assert.deepEqual(utan, [],
    `delen renderas men stylas inte: ${utan.join(', ')} — ett osynligt element i vapnet`);
});

test('G1: ingen del stylas som inget steg bär', () => {
  const { DELAR } = require('./helpers/guardian-emblem-fas-register.js');
  const burna = new Set(DELAR);
  const foraldralosa = cssdelar().filter(d => !burna.has(d));
  assert.deepEqual(foraldralosa, [],
    `CSS stylar ${foraldralosa.join(', ')} som ingen renderare skapar — död kod som ser levande ut`);
});

test('G1: varje fas har minst en CSS-regel', () => {
  const { FASER, PREFIX } = require('./helpers/guardian-emblem-fas-register.js');
  const css = utanKommentarer(GE_CSS);
  const saknas = FASER.filter(f => !css.includes(PREFIX + f));
  assert.deepEqual(saknas, [],
    `fasen har ingen regel i guardian-emblem.css: ${saknas.join(', ')} — klassen sätts och tas bort utan att något rör sig`);
});

// ================================================================================================
// G-SLUT — DEN OMVÄNDA RIKTNINGEN. 23g:s motsvarighet.
//
// G1 kräver att varje registrerat steg har CSS. Den här kräver att varje steg som går att SKAPA
// har delar och koreografi. Utan båda hållen kan ett femte steg läggas till i fabriken och panelen
// utan att någon del ritas — widgeten skulle dyka upp tom och ingen vakt skulle säga något.
//
// FYRA KÄLLOR, INTE TVÅ: fabriken, panelens väljare, katalogsektionen och registret. Katalogen är
// den som brukar glömmas — den bygger korten användaren klickar på.
// ================================================================================================

test('G-SLUT: fabriken, panelväljaren, katalogen och STEG listar exakt samma steg', () => {
  const { STEG, STEGNYCKLAR } = require('./helpers/guardian-emblem-fas-register.js');
  const fabrikslista = [...fabrikssteg()].sort();
  const valjare = [...valjarsteg()].sort();
  const katalog = [...katalogsteg()].sort();
  const register = Object.keys(STEG).sort();

  assert.deepEqual(fabrikslista, valjare,
    'fabriken och panelens stegväljare är inte samma mängd — ett steg går att skapa på ett ställe men inte det andra');
  assert.deepEqual(fabrikslista, katalog,
    'katalogsektionen och fabriken har glidit isär — ett kort skapar något som inte finns, eller ett steg saknar kort');
  assert.deepEqual(fabrikslista, register,
    'ett steg går att skapa utan att ha några delar — widgeten skulle dyka upp tom');
  assert.deepEqual([...STEGNYCKLAR].map(String).sort(), register,
    'STEGNYCKLAR och STEG har glidit isär inne i guardian-emblem-fas.js');
});

test('G-SLUT: de fyra praktstegen är 1, 2, 3 och 4', () => {
  const { STEGNYCKLAR } = require('./helpers/guardian-emblem-fas-register.js');
  assert.deepEqual([...STEGNYCKLAR].map(String), ['1', '2', '3', '4'],
    'familjen ska bära exakt fyra praktsteg, i stigande ordning');
});

test('G-SLUT: varje steg har ett eget namn som katalogen kan skriva ut', () => {
  const { STEG } = require('./helpers/guardian-emblem-fas-register.js');
  const namn = Object.values(STEG).map(s => s.namn);
  assert.equal(namn.filter(Boolean).length, namn.length, 'ett steg saknar namn');
  assert.equal(new Set(namn).size, namn.length, `två steg heter samma sak: ${namn.join(', ')}`);
});

// ================================================================================================
// G-STEG-PROGRESSION — PRAKTEN VÄXER, DEN BYTS INTE UT
//
// Hela poängen med fyra steg är att steg 3 ÄR steg 2 plus mer guld. Om ett steg tappar en del som
// ett lägre steg bär är det inte en högre praktnivå längre, det är en annan design — och då
// betyder "höj till steg 4" inte längre det användaren tror.
//
// Provet mäter prefixlikhet, inte bara delmängd: delarna ska komma i samma ordning i varje steg,
// så CSS:ens staplingsordning och renderarens ordning kan hållas ihop utan en andra tabell.
// ================================================================================================

test('G-STEG-PROGRESSION: varje steg har sin egen bildfil, och alla fyra finns på disk', () => {
  // KONSTVERKET AR REGISTRET NU. Delarna ar fyra och lika i varje steg — det som skiljer nivaerna at
  // ar BILDEN. En saknad fil ger en trasig bildikon i overlayn mitt i en sandning, och det ar den
  // sortens fel som aldrig hinner lagas i tid.
  const { STEG, BILDBAS } = require('./helpers/guardian-emblem-fas-register.js');
  const saknas = [], sma = [];
  for (const [n, s] of Object.entries(STEG)) {
    const p = path.join(ROOT, BILDBAS + s.bild);
    if (!fs.existsSync(p)) { saknas.push(`${n}: ${s.bild}`); continue }
    if (fs.statSync(p).size < 20000) sma.push(`${n}: ${s.bild} (${fs.statSync(p).size} B)`);
  }
  assert.deepEqual(saknas, [], `bildfilen saknas: ${saknas.join(', ')}`);
  assert.deepEqual(sma, [], `bildfilen är i praktiken tom: ${sma.join(', ')}`);
});

test('G-STEG-PROGRESSION: inga två steg delar bild', () => {
  const { STEG } = require('./helpers/guardian-emblem-fas-register.js');
  const bilder = Object.values(STEG).map(s => s.bild);
  assert.equal(new Set(bilder).size, bilder.length,
    `två praktsteg pekar på samma bild: ${bilder.join(', ')} — då är de inte två nivåer`);
});

test('G-STEG-PROGRESSION: emblemet blir högre för varje steg', () => {
  // Bredden ar 400 px i alla steg, sa `aspect` ar det praktnivan betalar med. Det ar samma pastaende
  // som G-STEG-HOJD mater i webblasaren, fast last ur registret: hall bada, sa kan varken tabellen
  // eller bilden glida ensam.
  const { STEG, STEGNYCKLAR } = require('./helpers/guardian-emblem-fas-register.js');
  const a = STEGNYCKLAR.map(n => STEG[n].aspect);
  for (let i = 1; i < a.length; i++) {
    assert.ok(a[i] > a[i - 1],
      `steg ${i + 1} är inte högre än steg ${i}: ${a.join(' / ')} — prakten växer inte`);
  }
});

test('G-STEG-PROGRESSION: avatarhålet är runt och ligger inne i bilden', () => {
  // KONTROLLMATNINGEN FOR HELA GEOMETRIN. Halet mattes automatiskt ur bilderna, och ett matfel skulle
  // annars folja med tyst hela vagen till sandningen. En SKIVA ar lika bred som hog i pixlar —
  // procenttalen skiljer sig at eftersom bilderna har olika proportioner, sa jamforelsen maste
  // rakna tillbaka till pixlar via `aspect`.
  const { STEG } = require('./helpers/guardian-emblem-fas-register.js');
  for (const [n, s] of Object.entries(STEG)) {
    const c = s.circle;
    const bredd = c.width, hojd = c.height * s.aspect;      // bada nu i samma enhet
    const kvot = bredd / hojd;
    assert.ok(kvot > 0.86 && kvot < 1.16,
      `steg ${n}: hålet är ${kvot.toFixed(2)} gånger bredare än högt — det är ingen cirkel`);
    assert.ok(c.left > 5 && c.top > 5 && c.left + c.width < 95 && c.top + c.height < 95,
      `steg ${n}: hålet ligger i bildens kant (${c.left}/${c.top} + ${c.width}×${c.height}) — mätningen tog något annat`);
    assert.ok(c.width > 25 && c.width < 60,
      `steg ${n}: hålet är ${c.width} % brett — orimligt för en avatarring`);
  }
});

test('G-STEG-PROGRESSION: media.js reservtabell är identisk med registret', () => {
  // Renderaren far inte kasta om syskonfilen saknas, sa den bar en egen kopia av geometrin. Tva
  // tabeller som ska vara lika ar tva tabeller som kan glida isar — det har provet ar det enda som
  // hindrar det.
  const { STEG } = require('./helpers/guardian-emblem-fas-register.js');
  const rad = MEDIA.match(/const GE_GEO_RESERV=\{([\s\S]*?)\n\};/);
  assert.ok(rad, 'hittade ingen GE_GEO_RESERV i media.js');
  for (const [n, s] of Object.entries(STEG)) {
    const post = rad[1].match(new RegExp(`\\n?\\s*${n}:\\{([^}]*\\}[^}]*)\\}`));
    assert.ok(post, `reservtabellen saknar steg ${n}`);
    const text = post[1];
    assert.ok(text.includes(`'${s.bild}'`), `steg ${n}: reservtabellen pekar på fel bild`);
    assert.ok(text.includes(String(s.aspect)), `steg ${n}: reservtabellens aspect har glidit ifrån registret`);
    for (const [nyckel, varde] of Object.entries(s.circle)) {
      assert.ok(text.includes(`${nyckel}:${varde}`),
        `steg ${n}: reservtabellens circle.${nyckel} är inte ${varde}`);
    }
  }
});

// ================================================================================================
// G-FASORDNING — KOREOGRAFIN "VAPENSKÖLDEN", fyra faser i samma ordning i varje steg
//
//   ljus (600)         ljuset samlas, allt annat släckt
//   oppna (1200)       skölden reser sig, delarna fälls ut utifrån och in
//   hyllning (3500)    guldet andas, namnet står stilla, ingen konkurrerande rörelse
//   upplosning (800)   allt tonar ut i omvänd ordning, ljuset sist
//
// Fasnamnen är ASCII med flit — de blir CSS-klassnamn.
// ================================================================================================

const ORDNING = ['ljus', 'oppna', 'hyllning', 'upplosning'];

test('G-FASORDNING: FASER är de fyra faserna i rätt ordning', () => {
  const { FASER } = require('./helpers/guardian-emblem-fas-register.js');
  assert.deepEqual(FASER, ORDNING, 'koreografin spelar inte ljus → oppna → hyllning → upplosning');
});

test('G-FASORDNING: varje fas har en tid, och tiderna är de avtalade', () => {
  const { FASER, TIDER } = require('./helpers/guardian-emblem-fas-register.js');
  assert.deepEqual(Object.keys(TIDER).sort(), [...FASER].sort(),
    'TIDER och FASER är inte samma mängd — en fas utan tid eller en tid utan fas');
  assert.equal(TIDER.ljus, 600, 'ljusfasen ska vara 600 ms');
  assert.equal(TIDER.oppna, 1200, 'öppnandet ska vara 1200 ms');
  assert.equal(TIDER.hyllning, 3500, 'hyllningen ska vara 3500 ms');
  assert.equal(TIDER.upplosning, 800, 'upplösningen ska vara 800 ms');
});

test('G-FASORDNING: koreografin är inte längre än den kortaste visningen', () => {
  // Motsvarigheten till F3. En sekvens som är längre än visningstiden hinner aldrig spelas färdigt
  // innan uttoningen börjar, och tittaren ser en avhuggen rörelse.
  const { FASER, TIDER, KORTASTE_VISNING } = require('./helpers/guardian-emblem-fas-register.js');
  const total = FASER.reduce((s, f) => s + TIDER[f], 0);
  assert.equal(total, 6100, `koreografin summerar till ${total} ms, inte de avtalade 6100`);
  assert.ok(total <= KORTASTE_VISNING,
    `koreografin spelar i ${total} ms men visningen är som kortast ${KORTASTE_VISNING} ms`);
});

test('G-FASORDNING: triggern tänder första fasen synkront', () => {
  const { win, faser } = boot([geWidget('ge1')]);
  win.triggerGuardianEmblem({ username: '@TestGuardian', __test: true });
  assert.deepEqual(faser('ge1'), ['ljus'], 'ljusfasen sattes inte i samma anrop som triggern');
});

test('G-FASORDNING: faserna byter på exakt sina tider och ingen överlever', () => {
  const { TIDER } = require('./helpers/guardian-emblem-fas-register.js');
  const { win, klocka, faser } = boot([geWidget('ge1')]);
  win.triggerGuardianEmblem({ username: '@TestGuardian', __test: true });

  klocka.fram(TIDER.ljus - 1);
  assert.deepEqual(faser('ge1'), ['ljus'], 'ljuset slutade en millisekund för tidigt');
  klocka.fram(1);
  assert.deepEqual(faser('ge1'), ['oppna'], 'öppnandet började inte när ljuset tog slut');
  klocka.fram(TIDER.oppna);
  assert.deepEqual(faser('ge1'), ['hyllning'], 'hyllningen började inte när öppnandet tog slut');
  klocka.fram(TIDER.hyllning);
  assert.deepEqual(faser('ge1'), ['upplosning'], 'upplösningen började inte när hyllningen tog slut');
  klocka.fram(TIDER.upplosning);
  assert.deepEqual(faser('ge1'), [], 'en fasklass låg kvar efter sista fasen');
  assert.equal(klocka.kvar(), 0, 'en timer lämnades kvar');
});

test('G-FASORDNING: två faser är aldrig aktiva samtidigt', () => {
  // CSS:en slipper då bry sig om kombinationer, och det är hela skälet att varje fas äger sin
  // klass ensam. Provet går genom hela sekvensen i 50-millisekunderssteg.
  const { FASER, TIDER } = require('./helpers/guardian-emblem-fas-register.js');
  const total = FASER.reduce((s, f) => s + TIDER[f], 0);
  const { win, klocka, faser } = boot([geWidget('ge1', { guardianStep: 4 })]);
  win.triggerGuardianEmblem({ username: '@TestGuardian', __test: true });
  for (let t = 0; t <= total; t += 50) {
    assert.ok(faser('ge1').length <= 1, `${faser('ge1').length} faser samtidigt vid ${t} ms`);
    klocka.fram(50);
  }
});

test('G-FASORDNING: en ny trigger startar om från fas ett i stället för att lägga sig ovanpå', () => {
  const { TIDER } = require('./helpers/guardian-emblem-fas-register.js');
  const { win, klocka, faser } = boot([geWidget('ge1')]);
  win.triggerGuardianEmblem({ username: '@A', __test: true });
  klocka.fram(TIDER.ljus + 100);
  assert.deepEqual(faser('ge1'), ['oppna'], 'kontrollmätning: sekvensen skulle ha gått vidare');
  win.triggerGuardianEmblem({ username: '@B', __test: true });
  assert.deepEqual(faser('ge1'), ['ljus'], 'en ny Guardian startade inte om koreografin');
});

// ================================================================================================
// G-KLOCKA — ALL TID GÅR GENOM `klocka`, OCH KLOCKAN GÅR ATT BYTA UT
//
// Fasproven ovan är exakta och omedelbara just för att drivrutinen inte känner till setTimeout.
// Ett enda direktanrop någonstans i kedjan gör det provet till en lögn: klockan byts ut, men just
// den fasen hoppar ändå fram på riktig tid, och `klocka.fram()` mäter då en fas som redan gått.
// Ett sovande prov är dessutom flaky på en lastad maskin.
//
// Tre påståenden, i tur och ordning: klockan finns och delegerar, källan går inte förbi den, och
// ett utbyte får verkligen genomslag i koreografin.
// ================================================================================================

test('G-KLOCKA: klocka.satt och klocka.rensa finns och delegerar till fönstrets timer', () => {
  const R = require('./helpers/guardian-emblem-fas-register.js');
  const sedda = [];
  const rymd = R.rymd({ timer: { satt: (fn, ms) => { sedda.push(ms); return 42 }, rensa: id => sedda.push('rensa:' + id) } });
  const { klocka } = rymd.VyraGuardianEmblemFas;
  assert.equal(typeof klocka.satt, 'function', 'klocka.satt saknas — det finns inget att byta ut');
  assert.equal(typeof klocka.rensa, 'function', 'klocka.rensa saknas — timers går inte att avbryta');
  const handtag = klocka.satt(() => {}, 250);
  assert.deepEqual(sedda, [250], 'klocka.satt gick inte vidare till fönstrets setTimeout');
  klocka.rensa(handtag);
  assert.deepEqual(sedda, [250, 'rensa:42'], 'klocka.rensa gick inte vidare till fönstrets clearTimeout');
});

const DIREKT_TIMER = /(?:window\.)?setTimeout\s*\(/g;

test('G-KLOCKA: matcharen kan faktiskt fälla — positiv kontroll', () => {
  assert.equal([...'if(x)setTimeout(nasta,600)'.matchAll(DIREKT_TIMER)].length, 1,
    'matcharen hittar inte ens ett uppenbart direktanrop — vakten nedan mäter ingenting');
  assert.equal([...'klocka.satt(nasta,600)'.matchAll(DIREKT_TIMER)].length, 0,
    'matcharen fäller ett anrop som går genom klockan');
});

// Klockans EGEN deklaration är det enda stället i filen som får nämna setTimeout — det är den som
// delegerar. Blocket lyfts bort innan vakten läser resten.
//
// EN URKLIPPNING SOM SVÄLJER FÖR MYCKET ÄR EN TYST GRÖN VAKT. Ett girigt mönster hade kunnat ta
// halva filen med sig och lämna ingenting att mäta, och provet hade blivit grönt av tomhet — §7 i
// en form som är lätt att missa, eftersom vakten SER ut att mäta något. Kontrollen nedan kräver
// därför både att blocket hittades och att det som togs bort är litet.
function utanKlockan(kalla) {
  const traff = /const klocka = \{[\s\S]*?\n\s*\};/.exec(kalla);
  assert.ok(traff, 'hittade ingen flerradig `const klocka = {…};` — se invarianten i guardian-emblem-fas.js');
  assert.ok(traff[0].length < 400,
    `urklippningen svalde ${traff[0].length} tecken — då mäter vakten inte längre filen`);
  return kalla.replace(traff[0], '');
}

test('G-KLOCKA: koreografin anropar aldrig setTimeout förbi klockan', () => {
  assert.ok(GE_JS.trim().length > 200,
    'kontrollmätning: guardian-emblem-fas.js saknas eller är tom — frånvaroprovet skulle bli grönt utan att mäta något');
  const traffar = [...utanKlockan(GE_JS).matchAll(DIREKT_TIMER)].map(m => m[0]);
  assert.deepEqual(traffar, [],
    'ett direktanrop till setTimeout går förbi klockan — fasproven mäter då en fas som redan hunnit gå');
});

test('G-KLOCKA: urklippningen av klockan kan faktiskt fälla — positiv kontroll', () => {
  // Utan den här kontrollen är föregående prov grönt om urklippningen slutar hitta blocket på ett
  // sätt som råkar ta med sig hela filen.
  const syntetisk = 'const klocka = {\n  satt: (fn, ms) => root.setTimeout(fn, ms),\n};\nsetTimeout(x, 1);';
  assert.deepEqual([...utanKlockan(syntetisk).matchAll(DIREKT_TIMER)].map(m => m[0]), ['setTimeout('],
    'urklippningen tog med sig kod utanför klockan');
  assert.throws(() => utanKlockan('const klocka = {satt: 1};'), /flerradig/,
    'en enradig klocka ska fälla vakten, inte tyst släppas förbi');
});

test('G-KLOCKA: en utbytt klocka stoppar koreografin helt tills provet säger till', () => {
  // Kontrollmätningen för hela riggen. Om utbytet INTE fick genomslag skulle jobbet ligga i en
  // riktig timer i stället, och kön här vara tom.
  //
  // FYRA JOBB, INTE ETT. Drivrutinen beväpnar alla fasgränser på en gång vid triggern i stället för
  // att låta varje fas boka nästa. Uppmätt: 4. Skillnaden är inte kosmetisk — en kedja där varje fas
  // bokar nästa kan tappa resten av sekvensen om ETT anrop kastar, medan en upplagd lista antingen
  // finns hel eller inte alls. Siffran står utskriven här så en omskrivning till kedjeformen fäller
  // provet i stället för att glida igenom.
  const { FASER } = require('./helpers/guardian-emblem-fas-register.js');
  const { win, klocka, faser } = boot([geWidget('ge1')]);
  win.triggerGuardianEmblem({ username: '@TestGuardian', __test: true });
  assert.equal(klocka.kvar(), FASER.length,
    'koreografin la inte hela sin fassekvens i den utbytta klockan');
  klocka.fram(0);
  assert.deepEqual(faser('ge1'), ['ljus'], 'en fas bytte utan att klockan gick fram');
});

// ================================================================================================
// G-PREFIX-ISOLATION — CSS:EN RÖR BARA SIN EGEN FAMILJ
//
// guardian-emblem.css laddas på samma sida som studio.css, premium-final.css och nio andra filer.
// En selektor som inte är förankrad i familjen — `.title`, `h2`, `.widget` — träffar då widgetar
// den aldrig hört talas om, och felet syns någon annanstans än där det skrevs. §11 i tech-debt.md
// handlar om precis det: specificitet MELLAN moduler avgör utfallet, inte ordning eller avsikt.
//
// Samma sak gäller keyframe-NAMN. `@keyframes glow` är globalt i hela dokumentet, och den som
// vinner är den som lästs sist. Prefixet är enda skyddet.
//
// §7: två positiva kontroller, för matcharen fäller två olika sorters överträdelser.
// ================================================================================================

const forankrad = valjare => valjare.split(',').every(d =>
  /\.guardian-emblem\b/.test(d) || /\.ge-[a-z0-9-]+/.test(d));

function oforankrade(css) {
  return reglerI(css).map(r => r.valjare).filter(v => !v.startsWith('@') && !forankrad(v));
}
function ogeKeyframes(css) {
  return [...utanKommentarer(css).matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)]
    .map(m => m[1]).filter(n => !/^ge[A-Z]/.test(n));
}

test('G-PREFIX-ISOLATION: matcharna kan faktiskt fälla — positiva kontroller', () => {
  assert.deepEqual(oforankrade('.widget-box{opacity:1}'), ['.widget-box'],
    'matcharen hittar inte ens en uppenbart oförankrad selektor — vakten nedan mäter ingenting');
  assert.deepEqual(oforankrade('.guardian-emblem .ge-skold{opacity:1}.ge-krona{top:0}'), [],
    'matcharen fäller en selektor som ligger inne i familjen');
  assert.deepEqual(oforankrade('.ge-skold,h2{opacity:1}'), ['.ge-skold,h2'],
    'en selektorlista där EN del är oförankrad ska fällas — den delen träffar hela sidan');
  assert.deepEqual(ogeKeyframes('@keyframes glow{}@keyframes geGlow{}'), ['glow'],
    'matcharen hittar inte ett oprefixat keyframe-namn');
});

test('G-PREFIX-ISOLATION: varje selektor i guardian-emblem.css är förankrad i familjen', () => {
  kravCss();
  const fria = oforankrade(GE_CSS);
  assert.deepEqual(fria, [],
    `selektorn träffar utanför familjen och kan ändra widgetar den inte äger: ${fria.join(' | ')}`);
});

test('G-PREFIX-ISOLATION: varje keyframe heter geNagot', () => {
  kravCss();
  const namn = ogeKeyframes(GE_CSS);
  assert.deepEqual(namn, [],
    `keyframe-namnet är globalt i hela dokumentet och kan krocka: ${namn.join(', ')}`);
});

// ================================================================================================
// G-IMPORTANT — INGEN `!important` PÅ TRANSFORM, OPACITY ELLER CLIP-PATH
//
// Tre separata döda animationer i Fan Level Up hade samma rot: en vanlig regel med `!important`
// slår en CSS-animation, så halva keyframen körde aldrig. Det ser fullkomligt harmlöst ut i
// källan — loyaltys sockel, badgereveals transform och hearts opacitet såg alla korrekta ut.
// ================================================================================================

const VIKTIGT = /(transform|opacity|clip-path)\s*:[^;}]*!important/gi;

test('G-IMPORTANT: matcharen kan faktiskt fälla — positiv kontroll', () => {
  assert.ok(new RegExp(VIKTIGT.source, 'i').test('.ge-skold{transform:scale(1)!important}'),
    'matcharen hittar inte ens en uppenbar överträdelse — vakten nedan mäter ingenting');
  assert.ok(!new RegExp(VIKTIGT.source, 'i').test('.ge-skold{transform:scale(1)}'),
    'matcharen fäller en ren regel');
});

test('G-IMPORTANT: guardian-emblem.css använder inte !important på rörelseegenskaper', () => {
  const traffar = [...kravCss().matchAll(VIKTIGT)].map(m => m[0]);
  assert.deepEqual(traffar, [],
    '`!important` i en vanlig regel slår en CSS-animation — halva keyframen kör aldrig: ' + traffar.join(' | '));
});

// ================================================================================================
// G-DÖD-CSS — INGEN REGEL SOM EN SENARE REGEL MED SAMMA SPECIFICITET MOTSÄGER
//
// `.fan-layout-loyalty>h2{display:none!important}` var död på exakt det sättet: `.fan-level-up>h2`
// har samma specificitet, kommer senare och bär `display:block!important`. Sju sådana regler hade
// hunnit skrivas innan någon mätte.
// ================================================================================================

function dodaDoljningar(css) {
  const regler = reglerI(css);
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
  assert.deepEqual(dodaDoljningar('.ge-krona{display:none!important}.ge-krona{display:block!important}'),
    ['.ge-krona'], 'matcharen hittar inte ens en uppenbar motsägelse — vakten nedan mäter ingenting');
  assert.deepEqual(dodaDoljningar('.ge-krona{display:none}'), [],
    'matcharen fäller en regel som ingen motsäger');
});

test('G-DÖD-CSS: ingen döljning i guardian-emblem.css motsägs senare', () => {
  kravCss();
  assert.deepEqual(dodaDoljningar(GE_CSS), [],
    'regeln är död kod som ser levande ut — en senare regel med samma specificitet vinner');
});

// ================================================================================================
// G-VILOLAGER — EN OÄNDLIG ANIMATION FÅR INTE HÄNGA PÅ EN FASKLASS
//
// Ribbons andning lärde oss det: en `infinite` som ligger på en fasklass dör när klassen tas bort,
// alltså precis när den skulle ha börjat behövas. Guldets andning i hyllningen är en sådan
// animation, men den SKA sitta på hyllningsfasen och sluta där — det är en fas, inte ett vilolager.
// Vakten gäller därför animationer som är `infinite` utanför hyllningen.
// ================================================================================================

test('G-VILOLAGER: matcharen kan faktiskt fälla — positiv kontroll', () => {
  const syntetisk = '.ge-fas-oppna .ge-krona{animation:geGlow 2s infinite}';
  const traffad = reglerI(syntetisk).filter(r => /infinite/.test(r.kropp)
    && /ge-fas-(ljus|oppna|upplosning)\b/.test(r.valjare));
  assert.deepEqual(traffad.map(r => r.valjare), ['.ge-fas-oppna .ge-krona'],
    'matcharen hittar inte ens en uppenbar överträdelse — vakten nedan mäter ingenting');
});

test('G-VILOLAGER: ingen infinite-animation hänger på ljus, oppna eller upplosning', () => {
  kravCss();
  const doda = REGLER().filter(r => /infinite/.test(r.kropp)
    && /ge-fas-(ljus|oppna|upplosning)\b/.test(r.valjare));
  assert.deepEqual(doda.map(r => r.valjare), [],
    'en oändlig animation hänger på en fas som tas bort — den dör precis när den skulle behövas');
});

// ================================================================================================
// G-KÖ — TESTKNAPPEN KAN INTE KRINGGÅ KÖN, EFTERSOM DEN GLOBALA REFERENSEN ÄR KÖN
//
// §2 (PR #217) var en efterhandslagning: fyrverkeriets testknapp byggde raketerna direkt på DOM.
// Guardian Emblem löser det ett steg tidigare. `installQueueWrappers` i runtime-controls.js byter
// ut `window.triggerGuardianEmblem` mot en variant som bara lägger jobbet i VyraAlertQueue. Allt
// som anropar det globala namnet — testknappen, en Action-regel, bryggan — köar därmed per
// definition. Det finns ingen väg runt utom att sluta använda namnet.
// ================================================================================================

test('G-KÖ: triggerGuardianEmblem står i runtime-controls configs-tabell', () => {
  assert.match(RUNTIME, /triggerGuardianEmblem\s*:\s*\[\s*\d+\s*,\s*\d+\s*\]/,
    'triggern lindas inte av installQueueWrappers — då spelar testknappen utanför kön');
});

test('G-KÖ: testknappen anropar det globala namnet och inget annat', () => {
  const bind = MEDIA.match(/#testGuardianEmblem[\s\S]{0,400}/);
  assert.ok(bind, 'hittade ingen bindning för #testGuardianEmblem i media.js');
  const kropp = bind[0];
  assert.match(kropp, /triggerGuardianEmblem\s*\(/,
    'testknappen går inte genom triggern — den kan inte köa');
  assert.ok(!/classList\.add\(\s*['"]ge-fas/.test(kropp),
    'testknappen tänder widgeten direkt på DOM i stället för att köa — exakt §2:s fel');
  assert.ok(!/VyraGuardianEmblemFas\.spela\s*\(/.test(kropp),
    'testknappen startar koreografin direkt förbi triggern');
});

test('G-KÖ: testknappen muterar inte widgetens state vid klick', () => {
  // Kontrollmätning enligt §7: knappen MÅSTE ha gjort något (en trigger räknades), och ändå får
  // inget fält i widgeten ha ändrats. Utan första halvan är andra halvan sann för en knapp som
  // inte finns.
  const { h, win, panel, statebild } = boot([geWidget('ge1')]);
  panel('ge1');
  const fore = statebild();
  let anrop = 0;
  const original = win.triggerGuardianEmblem;
  win.triggerGuardianEmblem = function (...a) { anrop += 1; return original.apply(this, a) };
  const knapp = h.document.querySelector('#testGuardianEmblem');
  assert.ok(knapp, 'testknappen #testGuardianEmblem finns inte i panelen');
  knapp.click();
  assert.equal(anrop, 1, 'kontrollmätning: knappen anropade inte triggern');
  assert.equal(statebild(), fore,
    'knappen skrev till widgetens state — ett testklick ska inte spara något');
});

// ================================================================================================
// G-SPRÅK — ETT STÄLLE, DOKUMENTERAD ORDNING
//
// VyraLang finns inte i repot (uppmätt 2026-08-18: noll träffar). `sprak()` är därför familjens
// enda ställe där språk avgörs, och ordningen är utskriven: uttryckligt val → VyraLang om den
// någonsin byggs → navigator.language → 'sv'. När VyraLang byggs byts EN rad.
//
// Regeln för fallbacken är medvetet asymmetrisk: bara engelska ger engelska. En tysk webbläsare
// får svenska, inte engelska, eftersom svenska är appens språk och engelska är ett aktivt val.
// ================================================================================================

test('G-SPRÅK: ett uttryckligt val vinner över allt annat', () => {
  const R = require('./helpers/guardian-emblem-fas-register.js');
  assert.equal(R.sprakIRymd({ guardianLang: 'sv' }, { sprakkod: 'en-US' }), 'sv');
  assert.equal(R.sprakIRymd({ guardianLang: 'en' }, { sprakkod: 'sv-SE' }), 'en');
});

test('G-SPRÅK: auto läser navigator.language, och bara engelska ger engelska', () => {
  const R = require('./helpers/guardian-emblem-fas-register.js');
  const auto = { guardianLang: 'auto' };
  assert.equal(R.sprakIRymd(auto, { sprakkod: 'en-US' }), 'en');
  assert.equal(R.sprakIRymd(auto, { sprakkod: 'en' }), 'en');
  assert.equal(R.sprakIRymd(auto, { sprakkod: 'sv-SE' }), 'sv');
  assert.equal(R.sprakIRymd(auto, { sprakkod: 'de-DE' }), 'sv',
    'en tysk webbläsare ska få appens språk, inte engelska');
  assert.equal(R.sprakIRymd(auto, { sprakkod: '' }), 'sv', 'utan språkkod ska svenska gälla');
});

test('G-SPRÅK: VyraLang vinner över navigator när den en dag finns', () => {
  // Kroken finns redan så att inkopplingen blir en rad och inte en refaktorering. Provet är det
  // som gör kroken sann i stället för en förhoppning i en kommentar.
  const R = require('./helpers/guardian-emblem-fas-register.js');
  assert.equal(R.sprakIRymd({ guardianLang: 'auto' },
    { sprakkod: 'sv-SE', vyraLang: { current: () => 'en-GB' } }), 'en');
});

test('G-SPRÅK: båda språken har banderoll och undertext, och de skiljer sig åt', () => {
  // RUBRIKEN UTGICK med referensdesignen: emblemets banderoll ar dess namnskylt, och en rubrik
  // ovanfor hade konkurrerat med praktstegsbrickan om samma plats.
  const R = require('./helpers/guardian-emblem-fas-register.js');
  const sv = R.textIRymd('sv'), en = R.textIRymd('en');
  assert.equal(sv.banderoll, 'BESKYDDARE');
  assert.equal(en.banderoll, 'GUARDIAN');
  assert.equal(sv.undertext, 'Tack för ditt beskydd');
  assert.equal(en.undertext, 'Thank you for your protection');
  for (const nyckel of ['banderoll', 'undertext']) {
    assert.notEqual(sv[nyckel], en[nyckel],
      `språken ger samma ${nyckel} — översättningen är en attrapp`);
  }
});

test('G-SPRÅK: renderaren kastar inte om syskonfilen saknas, och reservtexten är samma svenska', () => {
  // `render()` gör `widgets.map(wh).join('')` — EN widget som kastar i sin renderare tar hela duken
  // med sig, och streamern ser en tom layout utan förklaring. I studio.html laddas filerna i rad,
  // men "kan inte inträffa i den ordning vi råkar ha idag" är inte samma sak som robust.
  //
  // Reservtexten är en sista utväg, inte ett andra språkbeslut. Att de svenska strängarna är
  // identiska vaktas här, så de aldrig kan glida isär.
  const { textIRymd } = require('./helpers/guardian-emblem-fas-register.js');
  const sv = textIRymd('sv');
  const reserv = MEDIA.match(/return \{banderoll:'([^']+)',undertext:'([^']+)'\}/);
  assert.ok(reserv, 'hittade ingen reservtext i geText — renderaren litar på att syskonfilen finns');
  assert.equal(reserv[1], sv.banderoll, 'reservbanderollen har glidit ifrån guardian-emblem-fas.js svenska');
  assert.equal(reserv[2], sv.undertext, 'reservundertexten har glidit ifrån');
});

// ================================================================================================
// FABRIKEN, PANELEN OCH MARKUPEN — kontraktet runt vaktnätet
// ================================================================================================

const MATT = { 1: [400, 450], 2: [400, 535], 3: [400, 560], 4: [400, 570] };

test('Fabriken: catalog:guardianemblem:<steg> ger rätt typ, steg och mått', () => {
  const { STEGNYCKLAR } = require('./helpers/guardian-emblem-fas-register.js');
  const F = fabrik();
  for (const steg of STEGNYCKLAR) {
    const w = F.create('catalog:guardianemblem:' + steg);
    assert.equal(w.type, 'templateGuardianEmblem', `steg ${steg} gav fel widgettyp`);
    assert.equal(String(w.guardianStep), String(steg), `steg ${steg} bar inte sitt eget steg`);
    assert.equal(w.width, MATT[steg][0], `steg ${steg} har fel bredd — familjen är 400 px bred`);
    assert.equal(w.height, MATT[steg][1], `steg ${steg} har fel utgångshöjd`);
  }
});

test('Fabriken: bredden är 400 i varje steg, höjden växer', () => {
  // Användarens val: 400 bred, automatisk höjd. Bredden är alltså inte en inställning per steg —
  // det är familjens format — och höjden är det som praktnivån betalar med.
  const { STEGNYCKLAR } = require('./helpers/guardian-emblem-fas-register.js');
  const F = fabrik();
  const skapade = STEGNYCKLAR.map(s => F.create('catalog:guardianemblem:' + s));
  assert.deepEqual([...new Set(skapade.map(w => w.width))], [400],
    'stegen har olika bredd — familjen ska vara 400 px bred i alla praktnivåer');
  for (let i = 1; i < skapade.length; i++) {
    assert.ok(skapade[i].height > skapade[i - 1].height,
      `steg ${i + 1} är inte högre än steg ${i} — prakten växer men lådan gör det inte`);
  }
});

test('Fabriken: ett okänt steg kastar med giltiga alternativ i texten', () => {
  assert.throws(() => fabrik().create('catalog:guardianemblem:9'), /1|2|3|4/,
    'felmeddelandet räknar inte upp vad som faktiskt går att välja');
});

test('Panelen: alla fyra valen har ett fält', () => {
  for (const id of ['geStep', 'geLang', 'geShowUsername', 'geCustomText']) {
    assert.match(MEDIA, new RegExp(`id="${id}"`), `panelen saknar fältet #${id}`);
  }
});

test('Panelen: fälten ligger på den delade live-vägen, inte på render()', () => {
  // panel-live-path.test.js härleder sin fillista och skulle fånga ett render()-anrop i en
  // oninput. Det här provet är den familjespecifika versionen: fälten ska använda samma mall som
  // giftFieldBind, alltså vyraLivePatch vid input och commit vid change.
  const bind = MEDIA.match(/#geCustomText[\s\S]{0,300}/);
  assert.ok(bind, 'hittade ingen bindning för #geCustomText');
  assert.ok(!/(?:^|[^.\w])render\s*\(\s*\)/.test(bind[0]),
    'ett Emblem-fält bygger om hela vyn från en oninput — fältet man skriver i byts ut vid varje tangenttryck');
});

test('Markup: widgeten bär sin stegklass och sitt stegs bild', () => {
  const { STEG, BILDBAS } = require('./helpers/guardian-emblem-fas-register.js');
  for (const steg of ['1', '2', '3', '4']) {
    const { lada } = boot([geWidget('ge' + steg, { guardianStep: Number(steg) })]);
    const box = lada('ge' + steg);
    assert.ok(box, `steg ${steg} renderades inte`);
    assert.ok(box.classList.contains('guardian-emblem'), 'familjeklassen saknas');
    assert.ok(box.classList.contains('ge-step-' + steg), `stegklassen ge-step-${steg} saknas`);
    const img = box.querySelector('.ge-bild>img');
    assert.ok(img, `steg ${steg} bär ingen bild`);
    assert.equal(img.getAttribute('src'), BILDBAS + STEG[steg].bild,
      `steg ${steg} laddar fel bild — då visar praktnivån någon annans emblem`);
  }
});

test('Markup: bildlådan bär sitt eget höjdförhållande', () => {
  // `padding-top` i procent later ladan folja konstverket. Satts hojden i pixlar racker det att ett
  // steg byts mot en bild med annan proportion for att emblemet ska bli utdraget — och det syns
  // forst i sandning.
  const { STEG } = require('./helpers/guardian-emblem-fas-register.js');
  for (const steg of ['1', '4']) {
    const { lada } = boot([geWidget('gea' + steg, { guardianStep: Number(steg) })]);
    const bild = lada('gea' + steg).querySelector('.ge-bild');
    // JAMFOR TALET, INTE STRANGEN. DOM:en normaliserar bort avslutande nollor — `98.420%` laser
    // tillbaka som `98.42%`, och ett stranglikhetsprov hade fallit pa formatering i stallet for pa
    // proportionen det pastar sig vakta.
    const uppmatt = parseFloat(bild.style.paddingTop);
    assert.match(bild.style.paddingTop, /%$/, `steg ${steg}: höjdförhållandet är inte i procent`);
    assert.ok(Math.abs(uppmatt - STEG[steg].aspect * 100) < 0.01,
      `steg ${steg} har fel höjdförhållande: ${uppmatt} mot väntade ${STEG[steg].aspect * 100}`);
  }
});

test('Markup: avatarhålet står där det mättes i bilden', () => {
  const { STEG } = require('./helpers/guardian-emblem-fas-register.js');
  for (const steg of ['1', '3']) {
    const { lada } = boot([geWidget('geb' + steg, { guardianStep: Number(steg) })]);
    const hal = lada('geb' + steg).querySelector('.ge-bild .ge-avatar');
    assert.ok(hal, `steg ${steg}: avatarhålet ligger inte inuti bildlådan`);
    const c = STEG[steg].circle;
    assert.equal(hal.style.left, c.left + '%', `steg ${steg}: fel vänsterkant`);
    assert.equal(hal.style.top, c.top + '%', `steg ${steg}: fel överkant`);
    assert.equal(hal.style.width, c.width + '%', `steg ${steg}: fel bredd`);
    assert.equal(hal.style.height, c.height + '%', `steg ${steg}: fel höjd`);
  }
});

test('Markup: en egen avatarbild saneras i stället för att tolkas som markup', () => {
  const { lada } = boot([geWidget('ge1', { guardianAvatar: 'javascript:alert(1)' })]);
  const img = lada('ge1').querySelector('.ge-avatar img');
  if (img) assert.ok(!/^javascript:/i.test(img.getAttribute('src') || ''),
    'en avatar-URL gick oskadd genom VyraSafe');
});

test('Markup: egen text ersätter undertexten när den är ifylld', () => {
  const { lada } = boot([geWidget('ge1', { guardianCustomText: 'Tack för skyddet' })]);
  assert.equal(lada('ge1').querySelector('.ge-undertext').textContent.trim(), 'Tack för skyddet');
});

test('Markup: användarnamnet saneras i stället för att tolkas som markup', () => {
  const { lada } = boot([geWidget('ge1', { guardianUsername: '<img src=x onerror=1>' })]);
  assert.equal(lada('ge1').querySelector('.ge-namn').querySelector('img'), null,
    'ett användarnamn blev markup i overlayn');
});
