'use strict';
// FORRA SANDNINGENS VINNARE FAR INTE STA KVAR PA SCENEN.
//
// media.js triggerBattleMvp skriver in den VERKLIGA vinnarens namn pa widgetobjektet
// (`w.mvpName = namn`) och anropar save(). Ingenting nollstallde det, och live-zero-state.js blankar
// bara DEMONAMN — ett riktigt tittarnamn ar inte ett demonamn. Foljden: en streamer som kort en
// battle fick forra sandningens riktiga namn synligt fran den sekund overlayen laddades, innan en
// enda ny battle borjat.
//
// Fram till 2026-09-03 syntes det bara pa de sju ram-designerna. Nu visar alla sjutton namnet, sa
// det galler dem alla — darav det har provet.
//
// SIGNALEN ar `vyra-live-session`, INTE `vyra-session-ended`. Det senare betyder utloggning eller
// kontobyte (session-state.js), och att haka nollstallningen dar hade betytt att den aldrig fyrade
// mellan tva sandningar pa samma konto. Den forvaxlingen ar latt att gora och kostar ingenting att
// vakta mot: provet 'live:end ...' nedan skulle fortfarande vara gront med fel signal, men
// 'nytt namn ...' skulle inte.
//
// BARA live:start. Huset har redan bestamt det (live-leaderboard.js, last-x-alerts.js): nar
// sandningen tar slut ska sista resultatet sta kvar pa skarmen. Kravet "overlever inte mellan tva
// sandningar" ar anda uppfyllt, for nasta sandning MASTE passera live:start.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
const VyraWidgets = require(path.join(__dirname, '..', 'widget-factory.js'));

test.after(closeAll);

const mvpWidget = (id = 'm1', extra = {}) => Object.assign(
  VyraWidgets.create('catalog:battlemvp:inferno'), { id, x: 10, y: 10 }, extra);

function boot(widgets) {
  const h = createDom({ state: { widgets: widgets || [mvpWidget()], projectName: 'b' } });
  h.load('overlay-sanitize.js');
  // Samma ordning som produktionen: media.js definierar triggern, battle-mvp-session.js lindar den.
  h.load('battle-mvp-session.js');

  // `state` ar en top-level `const` i den DELADE globala lexikala miljon — den ligger INTE pa
  // window, och `window.eval` skapar inte heller bindningar dar (se dom-harness.js filhuvud). Enda
  // vagen in ar ett riktigt <script>, sa varden bryggas ut via window.
  const run = kalla => {
    const s = h.document.createElement('script');
    s.textContent = kalla;
    h.document.body.append(s);
  };
  const las = uttryck => { run(`window.__ut = ${uttryck}`); return h.window.__ut };

  return {
    h, run, las,
    widget: () => las("state.widgets.find(x => x.type === 'templateBattleMvp')"),
    widgetMed: id => las(`state.widgets.find(x => x.id === ${JSON.stringify(id)})`),
    vinnare: (namn, poang) => h.window.triggerBattleMvp({ name: namn, score: poang }),
    sandning: handelse => h.window.dispatchEvent(
      new h.window.CustomEvent('vyra-live-session', { detail: { event: handelse, sessionId: 's1' } })),
  };
}

// ---- 1. facit kommer fran fabriken --------------------------------------------------------------

test('nollstallningens varden ar exakt de fabriken skapar widgeten med', () => {
  // Utan den har raden kan de tva glida isar: nagon andrar fabrikens platshallare och widgeten
  // nollstalls till nagot som INTE ser ut som en fardigskapad widget. Fabriken ar facit.
  const { h } = boot();
  const tom = h.window.VyraBattleMvp.TOM_MVP;
  const fars = VyraWidgets.create('catalog:battlemvp:inferno');
  assert.equal(tom.mvpName, fars.mvpName, 'namnplatshallaren skiljer sig fran fabrikens');
  assert.equal(tom.mvpScore, fars.mvpScore, 'poangplatshallaren skiljer sig fran fabrikens');
  // Och samma varde for ramfamiljen — de renderas av en annan funktion men delar platshallare.
  assert.equal(VyraWidgets.create('catalog:battlemvp:frame:gold-crown').mvpName, tom.mvpName);
});

// ---- 2. sjalva kravet ---------------------------------------------------------------------------

test('en ny sandning moter inte forra sandningens vinnare', () => {
  const { widget, vinnare, sandning } = boot();
  vinnare('namn#13c98e19', 4258);
  assert.equal(widget().mvpName, 'namn#13c98e19', 'triggern skrev aldrig in namnet');
  assert.equal(widget().mvpScore, 4258);

  sandning('live:start');
  assert.equal(widget().mvpName, 'TestAlpha',
    'forra sandningens RIKTIGA tittarnamn stod kvar pa scenen i den nya sandningen');
  assert.equal(widget().mvpScore, 1500,
    'forra sandningens poang stod kvar — den visas inte i dag, men den ar sparad och kan tandas');
});

test('tva sandningar i rad: den andra ser aldrig den forstas vinnare', () => {
  // Kravet formulerat som det faktiskt upplevs: sandning 1 kar en battle, sandning 2 borjar.
  const { widget, vinnare, sandning } = boot();
  sandning('live:start');
  vinnare('namn#forsta', 900);
  sandning('live:end');
  // Mellan sandningarna star vinnaren kvar — det ar meningen.
  assert.equal(widget().mvpName, 'namn#forsta', 'vinnaren forsvann redan nar sandningen tog slut');

  sandning('live:start');
  assert.equal(widget().mvpName, 'TestAlpha');
  assert.equal(widget().mvpScore, 1500);
});

test('live:end nollstaller INTE — sista vinnaren star kvar pa skarmen', () => {
  // Medvetet val, samma som live-leaderboard.js och last-x-alerts.js: att nolla vid slutet hade
  // raderat vinnaren i samma sekund som sandningen slutade, precis nar tittarna ska se den.
  const { widget, vinnare, sandning } = boot();
  vinnare('namn#topp', 4258);
  sandning('live:end');
  assert.equal(widget().mvpName, 'namn#topp',
    'vinnaren raderades vid sandningens slut i stallet for vid nasta sandnings start');
  assert.equal(widget().mvpScore, 4258);
});

// ---- 3. ratt signal, och inget annat ------------------------------------------------------------

test('bara live:start raknas — andra livssignaler rors inte', () => {
  for (const handelse of ['live:end', 'live:paus', '', null, undefined, 'start']) {
    const { widget, vinnare, sandning } = boot();
    vinnare('namn#topp', 4258);
    sandning(handelse);
    assert.equal(widget().mvpName, 'namn#topp',
      `signalen ${JSON.stringify(handelse)} tolkades som en ny sandning`);
  }
});

test('en trasig signal kastar inte', () => {
  const { h, widget, vinnare } = boot();
  vinnare('namn#topp', 4258);
  for (const detalj of [undefined, null, {}, { event: null }, { sessionId: 's' }]) {
    h.window.dispatchEvent(new h.window.CustomEvent('vyra-live-session', { detail: detalj }));
  }
  assert.equal(widget().mvpName, 'namn#topp');
});

// ---- 4. rors ingenting annat --------------------------------------------------------------------

test('andra widgettyper rors inte av nollstallningen', () => {
  const annan = Object.assign(VyraWidgets.create('catalog:topgift:neon'), { id: 'tg1' });
  const fore = JSON.stringify(annan);
  const { widgetMed, sandning } = boot([mvpWidget(), annan]);
  sandning('live:start');
  const efter = widgetMed('tg1');
  assert.deepEqual(JSON.parse(JSON.stringify(efter)), JSON.parse(fore),
    'nollstallningen rorde en widget som inte ar en Battle MVP');
});

test('en widget som redan star pa platshallarna skrivs inte om alls', () => {
  // Ingen save(), ingen render() nar ingenting behover andras. En nollstallning som alltid skriver
  // hade tvingat fram en omritning av hela duken vid varje sandningsstart.
  const { h, sandning } = boot();
  const rorda = h.window.VyraBattleMvp.nollstallText();
  assert.equal(rorda, 0, 'en orord widget rapporterades som stadad');
  sandning('live:start');
  assert.equal(h.window.VyraBattleMvp.nollstallText(), 0);
});

// ---- 5. den nollstallda widgeten ritas om --------------------------------------------------------

test('skarmen visar platshallaren efter nollstallningen, inte bara objektet', () => {
  // Att objektet ar rensat racker inte: syns det gamla namnet kvar i DOM tills nasta omritning har
  // tittarna det fortfarande framfor sig. Namnet ligger i .mvp-copy h2 for stilmodellerna.
  const { h, widget, vinnare, sandning } = boot();
  vinnare('namn#13c98e19', 4258);
  sandning('live:start');
  const box = h.paint([widget()]).querySelector('[data-id="m1"]');
  const namn = box.querySelector('.mvp-copy h2');
  assert.ok(namn, 'namnelementet finns inte i DOM');
  assert.equal(namn.textContent.trim(), 'TestAlpha',
    'DOM bar fortfarande forra sandningens namn');
});

// ---- 6. OBS-kallan far inte falla ---------------------------------------------------------------

test('en save() som nekar stoppar inte nollstallningen', () => {
  // I en OBS-kalla ar laget 'overlay-token-readonly' och skrivningen svarar not-writable. Kastar
  // save() dar ska nollstallningen anda ha skett i minnet — annars star namnet kvar pa den enda
  // skarm som tittarna faktiskt ser.
  const { run, widget, vinnare, sandning } = boot();
  vinnare('namn#topp', 4258);
  // save ar en top-level const och gar inte att skriva over. Det som FAKTISKT nekar i en
  // OBS-kalla ar lagret under: VyraSessionState.writeActive svarar not-writable.
  run("VyraSessionState.writeActive = function(){ throw new Error('not-writable') }");
  sandning('live:start');
  assert.equal(widget().mvpName, 'TestAlpha',
    'nollstallningen gav upp for att sparandet nekades — i OBS ar det just dar den behovs');
});
