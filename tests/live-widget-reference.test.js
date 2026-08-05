'use strict';
// "varfor kan jag inte byta gift-bilder"
//
// Uppmatt i produktion, i den inloggade Studion. Valjaren oppnades, sokningen hittade Lion, valet
// klickades, modalen stangdes - och ingenting skrevs:
//
//   fore = state.widgets[0]
//   save()
//   state.widgets[0] === fore   -> false
//   fore.giftImage5 = '...'     -> vardet sattes pa fore
//   state.widgets[0].giftImage5 -> undefined
//
// session-state.js:94 byter ut hela innehallet vid varje projektion:
//
//   function swapActive(next){
//     Object.keys(activeStateObject).forEach(k=>{delete activeStateObject[k]});
//     Object.assign(activeStateObject, clone(next));
//   }
//
// clone() ger NYA widgetobjekt. `state` behaller sin identitet - det ar hela poangen med den
// permanenta referensen - men state.widgets och varje widget i den ersatts.
//
// Egenskapspanelens handlers gor allihop sa har:
//
//   let w = state.widgets.find(x=>x.id===selected);      // vid bind
//   ...
//   el.onchange = e => { w[key] = e.target.value; save() }   // vid klick, kanske sekunder senare
//
// Cloud-syncs tickare sparar varje sekund. Hinner en sparning emellan skriver handlern till ett
// objekt som inte langre finns i layouten, och andringen ar borta utan ett felmeddelande.
// Monstret finns pa 66 stallen i klienten.
//
// Fixen ar att sla upp widgeten nar man skriver, inte nar man binder.
//
// ROTT NU.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));

test.after(closeAll);

function boot(widgets) {
  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout',
    state: { widgets, projectName: 'ref' } });
  h.load('overlay-sanitize.js');
  h.load('assets/gifts/gifts-manifest.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`state.widgets.length=0;state.widgets.push(...${JSON.stringify(widgets)});`);
  return { h, run };
}

// jsdom saknar Web Locks, sa session-state faller tillbaka pa read-only och save() projicerar inte.
// Bytet reproduceras darfor direkt - det ar exakt vad swapActive gor med arrayen, och det ar mätt i
// produktion enligt kommentaren ovan. Att lita pa save() har hade gett ett gront test av fel skal.
const BYT = `(() => { const kopia = JSON.parse(JSON.stringify(state.widgets));
  state.widgets.length = 0; state.widgets.push(...kopia); })()`;

// ---- helparen -------------------------------------------------------------------------------------
test('liveWidget finns', () => {
  const { h } = boot([{ id: 'w1', type: 'templateTopGift' }]);

  assert.equal(typeof h.window.liveWidget, 'function',
    'ingen liveWidget — handlers har inget satt att na den aktuella widgeten pa');
});

test('en skrivning efter ett objektbyte nar den widget som faktiskt ligger i layouten', () => {
  const { h, run } = boot([{ id: 'w1', type: 'templateTopGift' }]);
  run(`
    window.__r = {};
    const w = liveWidget('w1');            // som vid bind
    ${BYT}                                  // som en sparning mittemellan
    w.giftImage = 'assets/gifts/events/8371_Lion.png';   // som vid klick
    __r.iState = state.widgets[0].giftImage;
    __r.antal = state.widgets.length;
  `);

  assert.equal(h.window.__r.iState, 'assets/gifts/events/8371_Lion.png',
    'skrivningen hamnade pa ett objekt som inte langre finns i layouten — det ar sa andringen tappas');
  assert.equal(h.window.__r.antal, 1, 'skrivningen skapade en extra widget');
});

test('en lasning efter ett objektbyte ser det aktuella vardet, inte ett gammalt', () => {
  const { h, run } = boot([{ id: 'w1', type: 'templateTopGift', giftName: 'Rose' }]);
  run(`
    window.__l = {};
    const w = liveWidget('w1');
    ${BYT}
    state.widgets[0].giftName = 'Lion';    // nagon annan andrade under tiden
    __l.viaRef = w.giftName;
  `);

  assert.equal(h.window.__l.viaRef, 'Lion',
    'referensen visade ett foralddrat varde, sa panelen kan rita fel');
});

// ---- det som MASTE fortsatta fungera ----------------------------------------------------------------
test('en okand id ger nagot falskt, sa `if(!w)return` fortfarande stoppar', () => {
  const { h, run } = boot([{ id: 'w1', type: 'templateTopGift' }]);
  run(`window.__f = { varde: liveWidget('finns-inte'), falsk: !liveWidget('finns-inte') }`);

  assert.equal(h.window.__f.falsk, true,
    'en proxy ar alltid sann — da slutar varje `if(!w||w.type!==...)return` att skydda');
});

test('typkontroll, spread och JSON fungerar som pa ett vanligt objekt', () => {
  const { h, run } = boot([{ id: 'w1', type: 'templateTopGift', x: 10, y: 20 }]);
  run(`
    const w = liveWidget('w1');
    window.__o = { typ: w.type, harX: 'x' in w, nycklar: Object.keys(w).join(','),
      kopia: JSON.stringify({ ...w }), json: JSON.stringify(w) };
  `);
  const o = h.window.__o;

  assert.equal(o.typ, 'templateTopGift');
  assert.equal(o.harX, true, '`in` fungerar inte — nagon kontroll nagonstans slutar galla');
  assert.match(o.nycklar, /id/, 'Object.keys gav inget');
  assert.match(o.kopia, /templateTopGift/, 'spread tappade falten');
  assert.match(o.json, /templateTopGift/, 'JSON.stringify tappade falten');
});

test('att ta bort ett falt gar fortfarande', () => {
  const { h, run } = boot([{ id: 'w1', type: 'templateTopGift', giftFrame: 'x' }]);
  run(`const w = liveWidget('w1'); delete w.giftFrame;
       window.__d = { kvar: 'giftFrame' in state.widgets[0] }`);

  assert.equal(h.window.__d.kvar, false, 'delete nadde inte den aktuella widgeten');
});

// ---- hela kedjan: gavovaljaren -----------------------------------------------------------------------
test('gavovaljaren skriver ratt aven om en sparning skett mellan bind och klick', () => {
  const w = VyraWidgets.create('catalog:giftcampaign:neon:landscape');
  w.id = 'c1'; w.x = 10; w.y = 10; w.giftCount = 6;
  const { h, run } = boot([w]);
  run(`selected='c1';view='editor';
    document.querySelector('#view').innerHTML='<div class="editor-shell"><div class="canvas">'
      +wh(state.widgets[0])+'</div><div class="properties">'+props()+'</div></div>';
    bind();`);

  run(`
    window.__g = {};
    try {
      document.querySelectorAll('.open-gift-picker')[5].onclick();   // valjaren oppnas
      ${BYT}                                                          // tickaren sparar
      document.querySelectorAll('.gift-picker-modal section button')[2].onclick();
      __g.bild = state.widgets[0].giftImage5;
      __g.namn = state.widgets[0].giftName5;
    } catch (e) { __g.fel = e.message }
  `);
  const g = h.window.__g;

  assert.ok(g.bild && g.bild.startsWith('assets/gifts/events/'),
    `giftImage5 blev ${JSON.stringify(g.bild)} — precis det som mattes i produktion ${g.fel || ''}`);
  assert.ok(g.namn, 'namnet foljde inte med');
});
