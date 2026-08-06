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
