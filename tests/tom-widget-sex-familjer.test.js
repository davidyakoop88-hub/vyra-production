'use strict';
// REGELN GALLDE TVA AV SEX FAMILJER (uppmatt i livetestet 2026-09-21).
//
// "En tom widget syns inte i sandningen" var byggd for Top Gift och Top Streak, dar tomheten star i
// state (`dataName`/`dataValue`) och wh()-haken racker. De fyra ovriga familjerna som kan hamna i
// ett nollat lage framfor publiken — Top Like, Top Coins, Top Points och Battle MVP — stod kvar som
// TOMMA SKAL: ram, rubrik och fem namnlosa rader med "♥ 0", hela sandningen tills nagon gav nagot.
//
// De far sitt innehall av livedatans riktade DOM-patchar och av live-zero-state.js nollning, sa vid
// render-tillfallet bar de fortfarande demoraderna. wh() kan darfor omojligt veta om de ar tomma —
// fragan stalls till DOM:en efter att bade renderaren och nollningen kort.
//
// KLART NAR: en mutation som tar bort en familj ur DOM_TYPER faller, och en mutation som later
// regeln galla i editorn faller. Sista provet ar sanningsprovet over antalet: sex familjer, inte tva.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const js = fs.readFileSync(path.join(__dirname, '..', 'vyra-tom-widget.js'), 'utf8');

const levande = [];
test.after(() => { while (levande.length) { try { levande.pop().close() } catch (e) {} } });

// wh() ritar de tva formerna filen fragar DOM:en om: radwidgetarna (.toplike-row med ett <strong>
// per rad) och Battle MVP (namnet i <h2>). Tomma strangar ar precis det live-zero-state.js lamnar
// efter sig i overlay, och det ar det laget som ska doljas.
const WH = `wh=w=>{
  const doljd = w.hidden ? 'display:none;' : '';
  if (w.type === 'templateBattleMvp')
    return '<div class="widget battle-mvp" data-id="'+w.id+'" style="'+doljd+'left:0"><h2>'+(w.namn||'')+'</h2></div>';
  const rader = (w.rader||[]).map(n => '<div class="toplike-row"><strong>'+n+'</strong><em>♥ 0</em></div>').join('');
  return '<div class="widget vyra-toplike" data-id="'+w.id+'" style="'+doljd+'left:0"><h3>TOP LIKES</h3>'+rader+'</div>';
}`;

const SESSION = '11111111-1111-4111-8111-111111111111';

// `sandning` ar den andra halvan av regeln: doljandet galler bara UNDER en sandning. Utan aktivt
// sessionId ror filen ingenting — det ar det som later provriggarna (och den visuella vakten) se
// widgetarna precis som forut.
function rigg({ overlay = true, sandning = SESSION } = {}) {
  const dom = new JSDOM('<!doctype html><body><div class="canvas"></div></body>',
    { url: 'http://localhost/studio.html' + (overlay ? '?overlay=1' : ''), runScripts: 'outside-only' });
  const w = dom.window;
  levande.push(w);
  w.VyraLiveSession = { runtime: () => ({ aktivSession: () => sandning }) };
  w.eval(`var view='editor',selected=null,state={widgets:[]},save=()=>{},render=()=>{},
    liveWidget=id=>state.widgets.find(x=>x.id===id),bind=()=>{},${WH};`);
  w.eval(js);
  return w;
}

const montera = (w, widget) => {
  w.eval('state').widgets.push(widget);
  const box = w.document.querySelector('.canvas');
  box.insertAdjacentHTML('beforeend', w.eval('wh')(widget));
  return box.querySelector('[data-id="' + widget.id + '"]');
};
const tick = () => new Promise(r => setTimeout(r, 5));
const TOMMA_TRE = ['', '', ''];
const RADTYPER = ['templateTopLike', 'templateTopCoins', 'templateTopPoints'];

for (const type of RADTYPER) {
  test(`${type} med bara tomma rader doljs i overlay`, () => {
    const w = rigg();
    const el = montera(w, { id: 't-' + type, type, rader: TOMMA_TRE });
    assert.equal(el.style.display, '', 'forutsattningen brast: widgeten var dold redan fore stall()');
    w.VyraTomWidget.stall();
    assert.equal(el.style.display, 'none', 'ett tomt skal stod kvar framfor publiken');
    assert.equal(el.style.getPropertyPriority('display'), 'important',
      'utan !important vinner temaklassernas display:flex!important');
  });

  test(`${type} doljs aldrig i editorn`, () => {
    const w = rigg({ overlay: false });
    const el = montera(w, { id: 'e-' + type, type, rader: TOMMA_TRE });
    w.VyraTomWidget.stall();
    assert.equal(el.style.display, '', 'i editorn maste widgeten synas for att ga att placera');
  });
}

test('Battle MVP utan namn doljs i overlay, med namn syns den', () => {
  const w = rigg();
  const el = montera(w, { id: 'm1', type: 'templateBattleMvp', namn: '' });
  w.VyraTomWidget.stall();
  assert.equal(el.style.display, 'none');

  el.querySelector('h2').textContent = 'wpwer17';
  w.VyraTomWidget.stall();
  assert.equal(el.style.display, '', 'forsta riktiga MVP:n ska visa widgeten igen');
});

test('en enda ifylld rad racker for att widgeten ska synas', () => {
  const w = rigg();
  const el = montera(w, { id: 'r1', type: 'templateTopLike', rader: TOMMA_TRE });
  w.VyraTomWidget.stall();
  assert.equal(el.style.display, 'none', 'forutsattningen brast');

  // Livedatan patchar raderna direkt, aldrig via render() — precis som i drift.
  el.querySelector('.toplike-row strong').textContent = 'Maya';
  w.VyraTomWidget.stall();
  assert.equal(el.style.display, '', 'en topplista med en riktig tittare ska synas');
});

test('livehandelsen avslojar widgeten utan att nagon kallar stall()', async () => {
  const w = rigg();
  const el = montera(w, { id: 'r2', type: 'templateTopLike', rader: TOMMA_TRE });
  w.VyraTomWidget.stall();
  assert.equal(el.style.display, 'none');
  el.querySelector('.toplike-row strong').textContent = 'Maya';
  w.dispatchEvent(new w.CustomEvent('vyra-live-event', { detail: { type: 'likes', username: 'maya' } }));
  await tick();
  assert.equal(el.style.display, '', 'avslojandet ska ske av sig sjalvt nar livedatan landar');
});

test('en widget som annu inte ritat nagra rader doljs inte', () => {
  // Inga rader alls betyder "inte ritad an", inte "tom". Att dolja pa den grunden hade slackt varje
  // topplista en halv render lang, vid varje andring i en pagaende sandning.
  const w = rigg();
  const el = montera(w, { id: 'r3', type: 'templateTopLike', rader: [] });
  w.VyraTomWidget.stall();
  assert.equal(el.style.display, '');
});

test('w.hidden ar streamerns eget val och rors aldrig', () => {
  const w = rigg();
  const el = montera(w, { id: 'r4', type: 'templateTopLike', hidden: true, rader: ['Maya'] });
  assert.equal(el.style.display, 'none', 'forutsattningen brast: renderkedjan dolde inte widgeten');
  w.VyraTomWidget.stall();
  assert.equal(el.style.display, 'none', 'en widget streamern slackt far aldrig tandas har');
});

// ---- utan sandning ror regeln ingenting -------------------------------------------------------
for (const type of RADTYPER) {
  test(`${type} doljs INTE nar ingen sandning pagar`, () => {
    // Uppmatt 2026-09-22: utan den har grinden dolde regeln widgeten aven i provriggarna, som
    // bygger katalognyckeln utan livedata i overlay-lage. Tio browserprov foll pa "0x0, dold: true",
    // och den visuella vakten hade fatt 33 av 136 referenser omskrivna till tomma bilder.
    const w = rigg({ sandning: null });
    const el = montera(w, { id: 'ns-' + type, type, rader: TOMMA_TRE });
    w.VyraTomWidget.stall();
    assert.equal(el.style.display, '',
      'utan pagaende sandning finns ingen publik — och ingen anledning att slacka nagot');
  });
}

test('sandningsstarten slar pa regeln av sig sjalv', async () => {
  // Widgeten ar redan tom nar sandningen borjar. Utan en lyssnare pa vyra-live-session stod de
  // tomma skalen kvar anda till forsta handelsen.
  let session = null;
  const dom = new JSDOM('<!doctype html><body><div class="canvas"></div></body>',
    { url: 'http://localhost/studio.html?overlay=1', runScripts: 'outside-only' });
  const w = dom.window;
  levande.push(w);
  w.VyraLiveSession = { runtime: () => ({ aktivSession: () => session }) };
  w.eval(`var view='editor',selected=null,state={widgets:[]},save=()=>{},render=()=>{},
    liveWidget=id=>state.widgets.find(x=>x.id===id),bind=()=>{},${WH};`);
  w.eval(js);

  const el = montera(w, { id: 'start1', type: 'templateTopLike', rader: TOMMA_TRE });
  w.VyraTomWidget.stall();
  assert.equal(el.style.display, '', 'forutsattningen brast: dold redan fore sandningen');

  session = SESSION;
  w.dispatchEvent(new w.CustomEvent('vyra-live-session',
    { detail: { event: 'live:start', sessionId: SESSION } }));
  await tick();
  assert.equal(el.style.display, 'none',
    'sandningsstarten vackte aldrig regeln — tomma skal star kvar till forsta handelsen');
});

test('SANNINGSPROVET: regeln galler sex familjer, inte tva', () => {
  // De sex ar exakt de live-zero-state.js nollar i overlay — de som bar demodata i markup eller i
  // state och darmed kan hamna i ett nollat lage framfor publiken. Vaxer den listan dar ska den
  // vaxa har, och tvartom.
  const { TYPER, DOM_TYPER } = rigg().VyraTomWidget;
  const alla = [...TYPER, ...Object.keys(DOM_TYPER)].sort();
  assert.deepEqual(alla, [
    'templateBattleMvp', 'templateTopCoins', 'templateTopGift',
    'templateTopLike', 'templateTopPoints', 'templateTopStreak'
  ], 'regeln om osynliga tomma widgetar ska tacka alla sex familjer');
});
