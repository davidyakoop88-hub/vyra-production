'use strict';
// Gift Jar · katalogkontrakt och livevag.
//
// Widgeten porterades 2026-08-10 fran en 192 commits gammal gren. Den versionen kunde inte
// anvandas rakt av: den skrev state.widgets.find(x=>x.id===selected) dar dagens kod har
// liveWidget(selected), och pekade pa assets/gifts/part1/gifts/ som inte finns langre.
//
// Proven nedan vaktar de tva saker som gjort ont forut i just den har kodbasen:
//
//   1. Livevagen far INTE rora widgetobjektet eller den sparade layouten. Det ar tech-debt §3,
//      skulden som kunde forstora en layout anvandaren ager — den ska inte aterskapas i en ny
//      widget. Antalet gavor bor i en runtime-Map, aldrig i w.jarCount.
//   2. En katalogpost utan renderare ar en dod knapp. Fyra widgetar har drabbats av varianten
//      "fardig grafik, ingen live-trigger"; har vaktas bada riktningarna.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');

const ROT = path.join(__dirname, '..');
const MEDIA = fs.readFileSync(path.join(ROT, 'media.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROT, 'studio.css'), 'utf8');

// Ingen global.window har. Fabriken tar sitt root-objekt fran window om det finns, annars
// globalThis — satter provet ett tomt window forlorar den crypto.randomUUID och vagrar skapa
// widgets. Ovriga katalogprov gor bara require, och det ar ratt.
const VyraWidgets = require(path.join(ROT, 'widget-factory.js'));

const MODELLER = ['crystal', 'royal', 'neon', 'fire', 'ice', 'heart', 'galaxy'];

// ---- Katalogkontraktet -------------------------------------------------------------------------
test('varje modell bygger en giltig widget ur sin katalognyckel', () => {
  for (const modell of MODELLER) {
    const w = VyraWidgets.create('catalog:giftjar:' + modell);
    assert.equal(w.type, 'templateGiftJar', `${modell}: fel typ`);
    assert.equal(w.jarModel, modell, `${modell}: modellen foljde inte med`);
    assert.match(w.jarAccent, /^#[0-9a-f]{6}$/i, `${modell}: accent saknas`);
    assert.match(w.jarLight, /^#[0-9a-f]{6}$/i, `${modell}: ljusfarg saknas`);
    assert.ok(w.jarSymbol, `${modell}: symbol saknas`);
    assert.ok(w.id, `${modell}: inget id`);
  }
});

test('en okand modell kastar med giltiga alternativ i texten', () => {
  assert.throws(() => VyraWidgets.create('catalog:giftjar:finnsinte'), /gift jar-modell/i);
  assert.throws(() => VyraWidgets.create('catalog:giftjar'), /kräver en modell/);
});

test('burken fods tom', () => {
  // En burk som fods halvfull ljuger om vad tittarna har gett.
  const w = VyraWidgets.create('catalog:giftjar:crystal');
  assert.equal(w.jarCount, 0);
  assert.equal(w.jarShowCounter, true);
});

// ---- Alla gavor, inte en ------------------------------------------------------------------------
// En Gift Jar tar emot ALLT. Porteringen slapade med ett filter (vald gava / minsta coins) fran
// referensgrenen utan att nagon fragade om det horde hemma — en burk som bara tar emot en
// gavosort ar ingen gavoburk.
test('inga filterfalt finns kvar i defaults', () => {
  const w = VyraWidgets.create('catalog:giftjar:crystal');
  for (const falt of ['jarFilterMode', 'jarGiftName', 'jarMinCoins']) {
    assert.ok(!(falt in w), `${falt} finns kvar i katalogens defaults`);
  }
});

test('panelen erbjuder inget filter', () => {
  for (const id of ['jarFilterMode', 'jarGiftName', 'jarMinCoins']) {
    assert.ok(!MEDIA.includes('id="' + id + '"'),
      `egenskapspanelen har kvar filterkontrollen ${id}`);
  }
});

test('varje gavotyp slapps igenom', () => {
  const i = MEDIA.indexOf('function giftJarAccepts');
  assert.ok(i > 0, 'kontrollmatning: giftJarAccepts hittades inte');
  const rad = MEDIA.slice(i, MEDIA.indexOf('\n', i));
  // Funktionen ska saga ja utan att titta pa vare sig widgeten eller eventet.
  assert.match(rad, /function giftJarAccepts\(\)\{return true\}/,
    'giftJarAccepts vager fortfarande in nagot — burken ska ta emot alla gavor: ' + rad.slice(0, 120));
});

test('gamla filtervarden pa sparade widgetar ignoreras, inte overskrivs', () => {
  // Widgetar som sparats fore andringen kan bara jarFilterMode:'selected' med ett gavonamn.
  // Livevagen ska strunta i faltet — men den far ALDRIG stada bort det, for da skriver den till
  // den sparade layouten. Det ar exakt tech-debt §3.
  const i = MEDIA.indexOf('function dropIntoGiftJar');
  const kropp = MEDIA.slice(i, MEDIA.indexOf('\nfunction triggerGiftJarDrop', i));
  for (const falt of ['jarFilterMode', 'jarGiftName', 'jarMinCoins']) {
    assert.ok(!kropp.includes(falt),
      `dropIntoGiftJar rör ${falt} — gamla falt ska ignoreras, varken lasas eller raderas`);
  }
  assert.ok(!/delete\s+w\.jar/.test(MEDIA),
    'nagot raderar jar-falt fran widgetobjektet — det ar en skrivning till sparad layout');
});

// ---- Livevagen ---------------------------------------------------------------------------------
test('livevagen ror varken layouten eller widgetobjektet', () => {
  const i = MEDIA.indexOf('function dropIntoGiftJar');
  assert.ok(i > 0, 'kontrollmatning: dropIntoGiftJar hittades inte i media.js');
  const slut = MEDIA.indexOf('\nfunction triggerGiftJarDrop', i);
  assert.ok(slut > i, 'kontrollmatning: kunde inte avgransa dropIntoGiftJar');
  const kropp = MEDIA.slice(i, slut);

  for (const forbjudet of ['save(', 'render(', 'innerHTML', 'localStorage']) {
    assert.ok(!kropp.includes(forbjudet),
      `dropIntoGiftJar anropar ${forbjudet} — livevagen ska patcha DOM riktat, se tech-debt §3`);
  }
  // Antalet ar live-data. Skrivs det till widgeten hamnar varje gava i den sparade layouten.
  assert.ok(!/\bw\.jarCount\s*=(?!=)/.test(kropp),
    'dropIntoGiftJar skriver till w.jarCount — antalet hor hemma i runtime-Mappen');
});

test('DOM-sokningen matchar exakt id och tacker alla renderingsytor', () => {
  const i = MEDIA.indexOf('function giftJarRoot');
  assert.ok(i > 0, 'kontrollmatning: giftJarRoot hittades inte');
  const rad = MEDIA.slice(i, MEDIA.indexOf('\n', i));
  assert.ok(rad.includes('dataset.id===String(w.id)'),
    'giftJarRoot matchar inte exakt widget-id — med tva burkar fylls fel burk');

  const ytor = MEDIA.match(/const GIFT_JAR_YTOR='([^']+)'/);
  assert.ok(ytor, 'kontrollmatning: hittade ingen ytlista');
  assert.ok(!rad.includes('document.querySelectorAll(\'.gift-jar-widget\')'),
    'giftJarRoot soker i hela dokumentet utan begransning');
  // .canvas ensamt racker inte: uppmatt att overlay-vyn renderar i .overlay-live-preview-stage
  // och saknar .canvas helt. Provet skyddar mot att listan krymps tillbaka till editorn.
  for (const yta of ['.canvas', '.overlay-live-preview-stage']) {
    assert.ok(ytor[1].includes(yta), `renderingsytan ${yta} saknas i GIFT_JAR_YTOR`);
  }
});

test('en riktig gavohandelse nar burken', () => {
  // Fardig grafik utan live-trigger har drabbat fyra widgetar. Vakten kraver att modulen
  // lyssnar pa vyra-live-event och slapper igenom gift-typer.
  assert.ok(/addEventListener\('vyra-live-event'[\s\S]{0,240}triggerGiftJarDrop/.test(MEDIA),
    'ingen vyra-live-event-lyssnare leder till triggerGiftJarDrop');
  assert.ok(/type\.includes\('gift'\)/.test(MEDIA),
    'lyssnaren filtrerar inte pa gift-typ');
});

test('teardown vid kontobyte', () => {
  assert.ok(/addEventListener\('vyra-session-ended'[\s\S]{0,200}giftJarRuntime\.clear\(\)/.test(MEDIA),
    'runtime-Mappen toms inte pa vyra-session-ended — nasta konto arver forra kontots burkar');
});

// ---- Editorn -----------------------------------------------------------------------------------
test('editorbindningarna anvander liveWidget(selected)', () => {
  for (const namn of ['giftJarProps', 'giftJarBind']) {
    const i = MEDIA.indexOf('const ' + namn + '=');
    assert.ok(i > 0, `kontrollmatning: ${namn} hittades inte`);
    const block = MEDIA.slice(i, MEDIA.indexOf('\n', i));
    assert.ok(block.includes('liveWidget(selected)'),
      `${namn} anvander inte liveWidget(selected)`);
    assert.ok(!block.includes('state.widgets.find'),
      `${namn} anvander state.widgets.find — den vagen ersattes av liveWidget()`);
  }
});

test('testknappen pekar pa en gavobild som faktiskt finns', () => {
  const m = MEDIA.match(/giftImage:'(assets\/gifts\/[^']+)'/);
  assert.ok(m, 'kontrollmatning: hittade ingen gavobild i testknappen');
  assert.ok(fs.existsSync(path.join(ROT, m[1])),
    `testknappen pekar pa ${m[1]} som inte finns — grenen bar den gamla part1-sokvagen`);
});

// ---- Utseendet ---------------------------------------------------------------------------------
test('varje animation som CSS:en anropar finns ocksa definierad', () => {
  // Det har provet finns for att jag missade just det. CSS:en porterades med en regexutdragning
  // som bara tog "selektor { ... }" — @keyframes har nastlade klamrar och foll bort. Foljden:
  // .gift-jar-item stod kvar pa sin startposition top:-22%, ovanfor burken, medan raknaren sa
  // 5/50. Alla prov var grona; bara skarmkontrollen sag det.
  const anropade = new Set([...CSS.matchAll(/animation:\s*([A-Za-z][\w-]*)/g)].map(m => m[1]));
  const definierade = new Set([...CSS.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]));
  const saknas = [...anropade].filter(n => !definierade.has(n) && !['none', 'inherit'].includes(n));
  assert.deepEqual(saknas, [],
    'CSS anropar animationer som inte ar definierade: ' + saknas.join(', '));
});

test('rorelsedodaren galler bara den som bett om reducerad rorelse', () => {
  // Tredje traffen for samma rotorsak: CSS:en porterades med en regexutdragning som inte
  // matchade nastlade klamrar. Forst foll @keyframes bort, sedan det har @media-omslaget — och
  // utan omslaget slog animation-duration:.01ms!important mot ALLA anvandare.
  //
  // Skarmkontrollen kunde inte se det: .01ms betyder att animationen fullbordas omedelbart, sa
  // partiklarna star pa ratt slutposition i en stillbild. Det som saknas ar rorelsen dit.
  const rad = '.gift-jar-widget *{animation-duration:.01ms!important';
  const i = CSS.indexOf(rad);
  assert.ok(i > 0, 'kontrollmatning: hittade inte reduced-motion-regeln alls');
  const fore = CSS.slice(Math.max(0, i - 60), i);
  assert.match(fore, /@media\s*\(?prefers-reduced-motion/,
    'regeln som stoppar Gift Jars animationer ligger utanfor sitt @media-omslag och galler ' +
    'darmed alla — inte bara den som bett om reducerad rorelse');
});

test('ingen modellsymbol ar en emoji', () => {
  // Fire bar 🔥 fran referensgrenen. En emoji ritas av teckensnittets EGNA farger och har svart
  // kontur — den arver varken var(--jar-light) eller glodet, sa den sag billigare ut an de sex
  // ovriga. Alla symboler ska vara monokroma glyfer som tar burkens farg.
  const fel = [];
  for (const [namn, m] of Object.entries(VyraWidgets.variants('giftjar.model'))) {
    const kod = m.symbol.codePointAt(0);
    // Emoji-blocken: Misc Symbols and Pictographs, Emoticons, Transport, Supplemental.
    if (kod >= 0x1f300) fel.push(`${namn}: ${m.symbol} (U+${kod.toString(16).toUpperCase()})`);
    if (m.symbol.includes('️')) fel.push(`${namn}: bar variantväljare U+FE0F`);
  }
  assert.deepEqual(fel, [], 'modeller med emoji i stallet for monokrom glyf: ' + fel.join(', '));
});

test('varje modell utom grundutforandet har en egen CSS-regel', () => {
  // crystal ar GRUNDUTFORANDET och styrs av .gift-jar-widget sjalv — en tom .jar-crystal hade
  // bara varit en regel som sager "som vanligt". De sex ovriga ar avvikelser och maste synas.
  assert.ok(!CSS.includes('.jar-crystal'),
    'crystal har fatt en egen regel — da ar den inte langre grundutforandet, och vilken av de tva ' +
    'som vinner beror pa ordningen i filen');
  const utan = MODELLER.filter(m => m !== 'crystal' && !CSS.includes('.jar-' + m));
  assert.deepEqual(utan, [], 'modeller utan egen styling: ' + utan.join(', '));
});
