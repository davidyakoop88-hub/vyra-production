'use strict';
// Gift Fireworks egenskapspanel, i nivå med TIKTORY:s.
//
// Jamforelsen gjordes mot en skarmbild av TIKTORY 1.2.2:s panel. Det som fanns dar och saknades
// har: ett NUMERISKT falt bredvid varje reglage, en kryssruta for att exkludera anonyma tittare,
// och en egen TEXT-sektion. Ljudvolym fanns ocksa, men den ar utelamnad med flit - VYRA:s
// "Aktivera ljud" spelar inget ljud alls idag, sa en volymreglage hade blivit en andra dod knapp.
//
// Namnen ar VYRA:s egna. Deras "Exclude Enigma viewers" heter har "Exkludera anonyma tittare",
// eftersom Enigma ar deras ord.
//
// TEXT-sektionen var hopfalld i skarmbilden, sa dess innehall ar VYRA:s eget val: pa/av, en mall
// med platshallare, storlek och farg.
//
// ROTT NU.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');

test.after(closeAll);

function panel(extra = {}) {
  const w = Object.assign({ id: 'fw1', type: 'templateGiftFireworks', x: 10, y: 10, width: 360,
    title: 'Gift Fireworks', fwMotion: 'magnetic', fwMin: 1, fwSpeed: 0.6, fwDuration: 5,
    fwGiftSize: 110, fwExplosion: 100, fwDensity: 70, fwColor: '#ff4fa3', fwColor2: '#ffd45b',
    fwSound: true }, extra);
  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout',
    state: { widgets: [w], projectName: 'fw' } });
  h.load('overlay-sanitize.js');
  h.load('gift-fireworks.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`state.widgets.length=0;state.widgets.push(${JSON.stringify(w)});selected='fw1';view='editor';`);
  run(`document.querySelector('#view').innerHTML='<div class="editor-shell"><div class="canvas">'
    +wh(state.widgets[0])+'</div><div class="properties">'+props()+'</div></div>';bind();`);
  return { h, run, d: h.document };
}

const REGLAGE = ['fwSpeed', 'fwDuration', 'fwGiftSize', 'fwExplosion', 'fwDensity'];

// ---- 1. numeriskt falt bredvid varje reglage ---------------------------------------------------
test('varje reglage har ett numeriskt falt bredvid sig', () => {
  const { d } = panel();
  const utan = REGLAGE.filter(id => !d.querySelector('#' + id + 'Num'));

  assert.deepEqual(utan, [],
    `dessa reglage saknar nummerfalt, sa exakta varden gar inte att skriva in: ${utan.join(', ')}`);
});

test('nummerfaltet visar reglagets varde och bar samma granser', () => {
  const { d } = panel();
  const reglage = d.querySelector('#fwGiftSize'), nummer = d.querySelector('#fwGiftSizeNum');

  assert.equal(nummer.value, reglage.value, 'faltet visar inte reglagets varde');
  assert.equal(nummer.min, reglage.min, 'olika minvarde — faltet slapper igenom varden reglaget inte kan');
  assert.equal(nummer.max, reglage.max, 'olika maxvarde');
});

test('skriver man i faltet foljer reglaget och widgeten med', () => {
  const { h, d, run } = panel();
  run(`const n = document.querySelector('#fwGiftSizeNum');
       n.value = '240'; n.onchange({ target: n });
       window.__n = { widget: state.widgets[0].fwGiftSize,
                      reglage: document.querySelector('#fwGiftSize').value }`);
  const n = h.window.__n;

  assert.equal(n.widget, 240, `widgeten fick ${n.widget}`);
  assert.equal(n.reglage, '240', 'reglaget foljde inte med');
});

test('drar man reglaget foljer faltet med', () => {
  const { h, run } = panel();
  run(`const r = document.querySelector('#fwGiftSize');
       r.value = '180'; r.oninput({ target: r });
       window.__r = { falt: document.querySelector('#fwGiftSizeNum').value,
                      widget: state.widgets[0].fwGiftSize }`);
  const r = h.window.__r;

  assert.equal(r.falt, '180', 'nummerfaltet visade fortfarande det gamla vardet');
  assert.equal(r.widget, 180);
});

test('ett varde utanfor granserna klamps, det slapps inte igenom', () => {
  const { h, run } = panel();
  run(`const n = document.querySelector('#fwGiftSizeNum');
       n.value = '9999'; n.onchange({ target: n });
       window.__k = { widget: state.widgets[0].fwGiftSize };`);

  assert.equal(h.window.__k.widget, 320,
    'ett varde over maxgransen skrevs rakt in i widgeten');
});

// ---- 2. exkludera anonyma tittare ---------------------------------------------------------------
test('panelen har en kryssruta for att exkludera anonyma tittare', () => {
  const { d } = panel();

  assert.ok(d.querySelector('#fwExcludeAnon'), 'kryssrutan saknas');
});

test('ar den pa tands inget fyrverkeri av en anonym gava', () => {
  const { h, run } = panel({ fwExcludeAnon: true });
  run(`window.__a = { svar: triggerGiftFireworks({ combo: 3, isAnonymous: true }),
                      combo: state.widgets[0].fwCombo }`);

  assert.equal(h.window.__a.svar, false,
    'en anonym gava tande fyrverkeriet trots att filtret ar pa');
});

test('ar den pa slapper en namngiven gava fortfarande igenom', () => {
  const { h, run } = panel({ fwExcludeAnon: true });
  run(`window.__b = { svar: triggerGiftFireworks({ combo: 3, isAnonymous: false }) }`);

  assert.equal(h.window.__b.svar, true, 'filtret stoppade en gava som inte var anonym');
});

test('ar den av tands fyrverkeriet aven av en anonym gava', () => {
  const { h, run } = panel({ fwExcludeAnon: false });
  run(`window.__c = { svar: triggerGiftFireworks({ combo: 3, isAnonymous: true }) }`);

  assert.equal(h.window.__c.svar, true, 'filtret var av men stoppade anda');
});

test('ett rent tal fungerar fortfarande som argument', () => {
  // runtime-controls koar triggern och action-runtime har skickat ett tal i alla tider. Bade den
  // gamla och den nya formen maste ga.
  //
  // Assertionen om w.fwCombo ar BORTTAGEN med flit. Den lasta fast att livevagen skrev combon pa
  // widgetobjektet — precis det som gjorde senaste gavans combo persistent i den sparade layouten.
  // Avsikten testet skyddar ar talformen, inte skrivningen; den mats nu pa antalet raketer i stallet.
  // Se tests/gift-fireworks-live-path.test.js och docs/tech-debt.md punkt 3.
  const { h, run, d } = panel();
  run(`window.__d = { svar: triggerGiftFireworks(4), combo: state.widgets[0].fwCombo }`);

  assert.equal(h.window.__d.svar, true, 'den gamla anropsformen slutade fungera');
  assert.equal(d.querySelectorAll('[data-id="fw1"] .fw-rocket').length, 4,
    'combon lastes inte ur talet');
  assert.equal(h.window.__d.combo, undefined,
    'livevagen skrev combon pa widgeten igen — den blir da persistent mellan sandningar');
});

// ---- 3. TEXT-sektionen ---------------------------------------------------------------------------
test('panelen har en egen TEXT-sektion', () => {
  const { d } = panel();
  const rubriker = [...d.querySelectorAll('.properties h4')].map(h => h.textContent.trim());

  assert.ok(rubriker.includes('TEXT'), `sektionerna ar ${rubriker.join(', ')}`);
});

test('TEXT-sektionen har pa/av, mall, storlek och farg', () => {
  const { d } = panel();
  const saknas = ['fwTextOn', 'fwText', 'fwTextSize', 'fwTextColor'].filter(id => !d.querySelector('#' + id));

  assert.deepEqual(saknas, [], `dessa falt saknas: ${saknas.join(', ')}`);
});

test('ar texten av ritas ingen text i widgeten', () => {
  const { d } = panel({ fwTextOn: false });

  assert.equal(d.querySelector('.canvas .fw-text'), null, 'texten ritades trots att den ar av');
});

test('ar texten pa ritas mallen, med platshallarna utbytta', () => {
  const { h, run } = panel({ fwTextOn: true, fwText: '{user} skickade {gift}' });
  run(`triggerGiftFireworks({ combo: 2, username: 'wpwer17', giftName: 'Lion' });
       window.__t = { text: document.querySelector('.canvas .fw-text')?.textContent }`);

  assert.equal(h.window.__t.text, 'wpwer17 skickade Lion',
    'platshallarna byttes inte ut mot eventets varden');
});

test('texten skrivs som text, inte som HTML', () => {
  // Ett anvandarnamn kommer fran TikTok och gar genom molnet. Det ar inte betrott innehall.
  const { h, run } = panel({ fwTextOn: true, fwText: '{user}' });
  run(`triggerGiftFireworks({ combo: 1, username: '<img src=x onerror=alert(1)>' });
       const el = document.querySelector('.canvas .fw-text');
       window.__x = { html: el?.innerHTML, barn: el?.children.length }`);

  assert.equal(h.window.__x.barn, 0,
    'anvandarnamnet tolkades som HTML — ett namn fran TikTok far aldrig bli markup');
});

// ---- testknappen gar genom triggern, inte forbi den --------------------------------------------
//
// LAGET FORE: klicklyssnaren i gift-fireworks.js byggde raketerna och satte `.play` direkt pa
// DOM-noden. Den anropade aldrig `window.triggerGiftFireworks`, och darmed:
//
//   - hamnade den aldrig i VyraAlertQueue (runtime-controls.js lindar bara triggern),
//   - passerade den aldrig dubblettsparren fwRedanTand,
//   - tande den bara den VALDA widgeten, medan en riktig gava tander alla synliga,
//   - och den skrev `w.fwCombo = combo; save()` vid varje klick.
//
// Man kunde alltsa inte prova hur fyrverkerier pacear mot andra alerts — vilket ar precis det man
// vill se innan en sandning. Kobeteendet i sig provas i tests/alert-queue.test.js.

function klicka(h, id) {
  const knapp = h.document.querySelector('#' + id);
  assert.ok(knapp, `knappen #${id} finns inte i panelen`);
  knapp.dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }));
}

test('testknappen anropar triggern i stallet for att tanda DOM:en sjalv', () => {
  const { h, run, d } = panel();
  run(`window.__trigg=[];{const org=window.triggerGiftFireworks;
       window.triggerGiftFireworks=function(p){window.__trigg.push(p);return true}}`);
  const fx = d.querySelector('.gift-fireworks-fx');
  assert.ok(fx, 'kontrollmatning: effektnoden finns inte');

  klicka(h, 'testFw');

  assert.equal(h.window.__trigg.length, 1,
    'klicket gick inte genom triggern — da hamnar det aldrig i alertkon');
  assert.equal(fx.classList.contains('play'), false,
    'klicket satte .play direkt pa noden, forbi bade kon och dubblettsparren');
});

test('testknappen skickar __test sa den inte tystas av fwMin', () => {
  // Utan flaggan hade en widget med hogt fwMin gjort knappen tyst: man trycker och ingenting
  // hander, eftersom fwSlapperIgenom avvisar. Flaggan hoppar over min- och anonymgrinden men
  // behaller kon och dubblettsparren — samma monster som triggerFanLevelUp redan har.
  const { h, run } = panel({ fwMin: 5000, fwExcludeAnon: true });
  run(`window.__trigg=[];{const org=window.triggerGiftFireworks;
       window.triggerGiftFireworks=function(p){window.__trigg.push(p);return org.apply(this,arguments)}}`);
  klicka(h, 'testFw');
  assert.equal(h.window.__trigg.length, 1, 'triggern anropades inte');
  assert.equal(h.window.__trigg[0].__test, true,
    'anropet bar ingen __test-flagga — knappen tystnar sa fort widgetens fwMin hojs');
});

test('en riktig gava under fwMin tander fortfarande ingenting', () => {
  // Grinden far inte oppnas for alla bara for att testknappen behover slippa den.
  const { h, run } = panel({ fwMin: 5000 });
  run(`window.__svar = triggerGiftFireworks({ combo: 2, username: 'lisa', coins: 10 })`);
  assert.equal(h.window.__svar, false,
    'en gava pa 10 coins tande ett fyrverkeri med fwMin 5000 — __test oppnade grinden for alla');
});

// `save` ar en `const` i studio.js. Ett prov som lindar den kastar "Assignment to constant
// variable", raknaren star kvar pa noll, och provet blir gront utan att ha matt nagot. Forsta
// versionen av det har provet gjorde precis det. Bada mater darfor VERKAN i stallet: klicket far
// inte andra widgetens sparade combo, och faltet ska.
const sparadCombo = (h, run) => {
  run(`window.__combo = state.widgets[0].fwCombo`);
  return h.window.__combo;
};

test('klicket laser combon men skriver den aldrig till layouten', () => {
  const { h, run, d } = panel({ fwCombo: 1 });
  run(`window.__trigg=[];window.triggerGiftFireworks=function(p){window.__trigg.push(p);return true}`);
  const falt = d.querySelector('#fwCombo');
  assert.ok(falt, 'kontrollmatning: combofaltet finns inte');
  falt.value = '9';                       // andrat i faltet, men ANNU inte bekraftat med change
  klicka(h, 'testFw');

  assert.equal(h.window.__trigg[0]?.combo, 9, 'klicket skickade inte faltets varde som argument');
  assert.equal(sparadCombo(h, run), 1,
    'klicket skrev combon till den sparade layouten — den ska sparas av faltets onchange, '
    + 'inte av varje test man kor');
});

test('combofaltet skriver sitt varde till widgeten', () => {
  const { h, run, d } = panel({ fwCombo: 1 });
  const falt = d.querySelector('#fwCombo');
  falt.value = '7';
  falt.dispatchEvent(new h.window.Event('change', { bubbles: true }));
  assert.equal(sparadCombo(h, run), 7, 'faltet skrev inte combon till widgeten');
});
