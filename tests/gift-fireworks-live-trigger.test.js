'use strict';
// Gift Fireworks ska tandas av en riktig gava.
//
// UPPMATT MOT PRODUKTION 2026-08-06, deployad kod, riktig widget i DOM, gava genom den skarpa
// kedjan window.VyraLive.ingest:
//
//   Top Gift        -> klassen `play` lades till          (widgeten flippade)
//   Gift Fireworks  -> ingen klassandring alls
//   triggerGiftFireworks anropad                          NOLL ganger
//
// Enda anroparen i hela klienten ar action-runtime.js:62:
//
//   if(name.includes('firework'))return window.triggerGiftFireworks?.(payload)
//
// Den raden kors bara om anvandaren SJALV har lagt upp en Action vars widgetnamn innehaller
// "firework". Utan den konfigurationen nar ingen gava fram. Samma doda trigger som Battle MVP,
// Fan Level Up och Gifter Level Up hade — Gift Fireworks ar den fjarde.
//
// VARFOR DET INTE UPPTACKTES. PR #94 och #102 fixade hur triggern BETER sig: fwMin, flera widgetar,
// inga writes till layouten, gavor som inte klipper varandra. Varenda test i de PR:erna anropade
// `triggerGiftFireworks` DIREKT. Da ar hela livevagen osynlig for testerna, och de var grona medan
// widgeten var dod i sandning. Testerna nedan gar darfor via ingest/routeLiveBattleEvent — aldrig
// via triggern — och det ar hela poangen med filen.
//
// KON AR LOKAL. Den delade VyraAlertQueue trimmar vid tio vantande och kastar allt aldre an 30 s;
// den policyn galler alla alerttyper och ar OROLIG. Den har filen haller sin egen ko och slapper EN
// i taget dit.
//
// ROTT NU: gift-fireworks-session.js finns inte.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test.after(closeAll);

const fw = (id = 'fw1', over = {}) => Object.assign({
  id, type: 'templateGiftFireworks', x: 10, y: 10, width: 360, title: 'Gift Fireworks',
  fwMotion: 'magnetic', fwMin: 1, fwSpeed: 0.6, fwDuration: 5, fwGiftSize: 110,
  fwExplosion: 100, fwDensity: 70, fwSound: false
}, over);

function boot(widgets = [fw()]) {
  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout',
    state: { widgets, projectName: 'fw' } });
  h.load('overlay-sanitize.js');
  h.load('gift-fireworks.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  // Raknaren maste sitta INNANFOR session-filens omslutning, alltsa installeras FORE den laddas.
  // Satts den efteråt ligger den ytterst och raknar varje anrop oavsett vad filen gor med kedjan —
  // da ar testet gront aven om foregangaren aldrig anropas. Uppmatt genom mutationsprov.
  run(`window.__gamla=0;{const org=window.routeLiveBattleEvent;
       window.routeLiveBattleEvent=function(e){window.__gamla++;
         if(typeof org==='function')return org(e)}}`);
  h.load('gift-fireworks-session.js');
  run(`state.widgets.length=0;${widgets.map(w => `state.widgets.push(${JSON.stringify(w)})`).join(';')};view='editor';`);
  run(`document.querySelector('#view').innerHTML='<div class="editor-shell"><div class="canvas">'
    +state.widgets.map(wh).join('')+'</div></div>';`);
  // Spionen sitter PA triggern, inte i stallet for den: effekten ska fortfarande spela, sa att
  // testerna nedan ocksa bevisar att widgeten verkligen tands och inte bara att en funktion kallas.
  run(`window.__traffar=[];{const org=window.triggerGiftFireworks;
       window.triggerGiftFireworks=function(p){window.__traffar.push(p);return org.apply(this,arguments)}}`);
  const gava = (over = {}) => h.window.routeLiveBattleEvent(Object.assign(
    { id: 'g' + Math.random().toString(36).slice(2), type: 'gift', username: 'lisa',
      giftName: 'Rose', giftId: '5655', coins: 500, count: 1 }, over));
  return { h, run, d: h.document, gava, traffar: () => h.window.__traffar };
}

const fx = (d, id = 'fw1') => d.querySelector(`[data-id="${id}"] .gift-fireworks-fx`);

// ---- 1. resan fran event till trigger -----------------------------------------------------------

test('en live-gava tander fyrverkeriet', () => {
  const { gava, traffar, d } = boot();
  gava();
  assert.equal(traffar().length, 1, 'gavan nadde aldrig triggern — samma doda trigger som fore #112');
  assert.ok(fx(d).classList.contains('play'), 'triggern anropades men effekten spelade inte');
});

test('gavans falt foljer med hela vagen', () => {
  // Utan payloaden blir texten "{user} skickade {gift}" tom och fwMin kan inte bedomas.
  const { gava, traffar } = boot();
  gava({ username: 'omar', giftName: 'Galaxy', coins: 1200, count: 3 });
  const p = traffar()[0];
  assert.equal(p.username, 'omar');
  assert.equal(p.giftName, 'Galaxy');
  assert.equal(Number(p.coins), 1200);
});

test('gift_combo och giftcombo raknas ocksa som gavor', () => {
  // live-leaderboard.js accepterar alla tre stavningarna. Slapper den har filen bara `gift` blir
  // comboavslut tysta, och det ar just de som bar de stora beloppen.
  for (const typ of ['gift_combo', 'giftcombo']) {
    const { gava, traffar } = boot();
    gava({ type: typ });
    assert.equal(traffar().length, 1, `${typ} tande inget fyrverkeri`);
  }
});

test('allt som inte ar en gava lamnas i fred', () => {
  const { gava, traffar } = boot();
  for (const typ of ['chat', 'like', 'follow', 'share', 'member', 'battle', 'subscribe']) gava({ type: typ });
  assert.equal(traffar().length, 0, 'en icke-gava tande fyrverkeriet');
});

test('ingest ar den kedja filen hanger i', () => {
  // Filen hakar i routeLiveBattleEvent. Slutar ingest() anropa den ar allt ovan gront medan
  // widgeten ar dod i sandning — precis det lage den har PR:en stanger.
  const kalla = las('live-client.js');
  assert.match(kalla, /routeLiveBattleEvent\s*===\s*'function'\s*\)\s*routeLiveBattleEvent\(e\)/,
    'ingest() anropar inte langre routeLiveBattleEvent — livevagen ar bruten igen');
});

test('den gamla routeLiveBattleEvent kors fortfarande', () => {
  // Filen lindar en global som last-x-alerts.js och de tre session-filerna ocksa lindar.
  // Anropas inte foregangaren slacks varje widget som laddades fore den har.
  const { h, gava } = boot();
  gava();
  assert.equal(h.window.__gamla, 1,
    'foregangaren i kedjan anropades inte — allt som laddades fore den har filen slacks');
});

// ---- 2. widgetens egna filter bestammer fortfarande ---------------------------------------------

test('en gava under fwMin tander ingenting', () => {
  // Granssen hor hemma i triggern, dar varje widget gor sin EGEN bedomning. Filen far inte
  // duplicera den logiken — da kan de tva komma isar.
  const { gava, d } = boot([fw('fw1', { fwMin: 100 })]);
  gava({ coins: 5 });
  assert.ok(!fx(d).classList.contains('play'), 'fwMin ignorerades i livevagen');
});

test('filen duplicerar inte triggerns filter', () => {
  // fwMin, anonymfiltret och hidden agas av triggern, dar varje widget gor sin EGEN bedomning.
  // Kopieras nagot av det hit kan de tva komma isar utan att ett enda test blir rott.
  const src = las('gift-fireworks-session.js');
  for (const filter of ['fwMin', 'fwExcludeAnon', 'hidden']) {
    assert.doesNotMatch(src, new RegExp(filter),
      `${filter} bedoms bade har och i triggern — de kommer att komma isar`);
  }
});

// ---- 3. kon ------------------------------------------------------------------------------------

test('flera gavor koas och spelas efter varandra', () => {
  const { gava, traffar, h } = boot();
  for (let i = 0; i < 4; i++) gava();
  assert.equal(traffar().length, 1, 'alla spelades samtidigt');
  assert.equal(h.window.VyraGiftFireworks.koLangd(), 3);
});

test('kon toms i ankomstordning', () => {
  const { gava, traffar, h } = boot();
  for (const namn of ['a', 'b', 'c']) gava({ username: namn });
  h.window.VyraGiftFireworks.nastaNu();
  h.window.VyraGiftFireworks.nastaNu();
  assert.deepEqual([...traffar()].map(t => t.username), ['a', 'b', 'c']);
});

test('en skur pa tjugo tappar ingenting', () => {
  const { gava, h } = boot();
  for (let i = 0; i < 20; i++) gava();
  assert.equal(h.window.VyraGiftFireworks.koLangd(), 19);
  assert.equal(h.window.VyraGiftFireworks.kastade(), 0);
});

test('nodbromsen ar lokal, hog och loggad', () => {
  const src = las('gift-fireworks-session.js');
  const tak = src.match(/NODBROMS\s*=\s*(\d+)/);
  assert.ok(tak && Number(tak[1]) >= 100, 'nodbromsen saknas eller ligger for lagt');
  assert.match(src, /console\.warn/);
});

test('global kopolicy ar orord', () => {
  const src = las('runtime-controls.js');
  assert.match(src, /MAX_VANTANDE\s*=\s*10/);
  assert.match(src, /MAX_ALDER\s*=\s*30000/);
});

// ---- 4. ingen dubbeltandning -------------------------------------------------------------------

test('samma gava tander bara ett fyrverkeri, aven om Actions ocksa fyrar', () => {
  // action-runtime.js:62 anropar redan triggern for den som har lagt upp en Action med "firework"
  // i namnet. Utan sparr far den anvandaren nu TVA fyrverkerier per gava — en regression rakt in i
  // ansiktet pa dem som redan hade det uppsatt. Sparren sitter i triggern, som ar den enda punkt
  // bada vagarna passerar.
  const { h } = boot();
  const e = { id: 'samma-1', type: 'gift', username: 'lisa', coins: 500, count: 1 };
  h.window.routeLiveBattleEvent(e);
  assert.equal(h.window.triggerGiftFireworks(e), false,
    'samma gava tandes tva ganger — den som har en Action uppsatt far dubbla fyrverkerier');
});

test('tva OLIKA gavor tander tva ganger', () => {
  const { h, traffar } = boot();
  h.window.routeLiveBattleEvent({ id: 'a', type: 'gift', username: 'lisa', coins: 500 });
  h.window.VyraGiftFireworks.nastaNu();
  h.window.routeLiveBattleEvent({ id: 'b', type: 'gift', username: 'omar', coins: 500 });
  assert.equal(traffar().length, 2, 'sparren slog till pa en annan gava');
});

test('en gava utan id sparras aldrig', () => {
  // Panelens testknapp skickar inget id. Nycklas sparren pa nagot som saknas blir andra trycket dott.
  // Matningen maste lasa RETURVARDET: spionen raknar anrop, och ett sparrat anrop sker anda.
  const { h } = boot();
  assert.equal(h.window.triggerGiftFireworks({ username: 'lisa', coins: 500 }), true);
  assert.equal(h.window.triggerGiftFireworks({ username: 'lisa', coins: 500 }), true,
    'testknappen slutade fungera vid andra trycket');
});

// ---- 5. inget lackage till layouten -------------------------------------------------------------

test('filen skriver aldrig till layouten', () => {
  const src = las('gift-fireworks-session.js');
  assert.doesNotMatch(src, /\bsave\(\)/, 'live-data blir persistent mellan sandningar');
  assert.doesNotMatch(src, /\brender\(\)/, 'hela canvasen byggs om per gava');
  assert.doesNotMatch(src, /localStorage/, 'kon overlever en omladdning och spelar gamla gavor');
});

test('media.js laddar filen', () => {
  // Skripten injiceras av media.js, inte av studio.html — filen ar dod om den inte star i listan.
  assert.match(las('media.js'), /gift-fireworks-session\.js/,
    'filen laddas av ingen, precis som support-client.js var innan #106');
});

test('filen laddas EFTER gift-fireworks.js', () => {
  // Laddas den fore finns window.triggerGiftFireworks inte an. Filen slar upp triggern vid ANROPET
  // just for att overleva det — runtime-controls byter ut den senare — men ordningen ska anda vara
  // ratt, annars ar sparren och kon beroende av en kapplopning.
  const src = las('media.js');
  assert.ok(src.indexOf('gift-fireworks.js') < src.indexOf('gift-fireworks-session.js'),
    'session-filen laddas fore triggern den behover');
});

// ---- 6. teardown -------------------------------------------------------------------------------

test('en avslutad session tommer kon', () => {
  // Utan det spelar nasta sandning upp forra sandningens gavor.
  const { h, gava } = boot();
  for (let i = 0; i < 5; i++) gava();
  h.window.dispatchEvent(new h.window.Event('vyra-session-ended'));
  assert.equal(h.window.VyraGiftFireworks.koLangd(), 0);
  assert.equal(h.window.VyraGiftFireworks.spelar(), false);
});
