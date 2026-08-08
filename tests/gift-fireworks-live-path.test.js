'use strict';
// Gift Fireworks livevag: inga writes till layouten, och en ny gava avbryter inte den forra.
//
// Bygger om det som var kvar av PR #53 (stangd — grenen byggde pa en kodbas dar
// allCampaignGiftChoices fortfarande fanns). Dess forsta fix, att combostorleken aldrig nadde fram,
// ar redan lost pa annat satt i PR #94: action-runtime skickar hela payloaden och triggern laser
// combo ?? repeatcount ?? count. Tva fel var kvar.
//
// FEL 1 — LIVE-DATA I DEN SPARADE LAYOUTEN. Triggern gjorde:
//
//   traffar.forEach(w=>{w.fwCombo=combo});save();render();
//
// Senaste gavans combo hamnade permanent i layouten, hela canvasen byggdes om per gava, och
// omritningen river ner den animation som just spelar. Gift Fireworks var den ENDA widgeten som
// fortfarande gjorde det — Last-X, Fan Level Up och Gifter Level Up patchar DOM riktat.
// Se docs/tech-debt.md punkt 3.
//
// FEL 2 — EN NY GAVA KLIPPTE DEN FORRA. Varje gava satte en egen setTimeout som tar bort .play.
// Tva gavor en sekund isar gav tva timers, och den FORSTA tog bort klassen medan den andra
// animationen fortfarande borde kora. Effekten sags som ett hack mitt i.
//
// ROTT NU.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const KALLA = fs.readFileSync(path.join(ROOT, 'gift-fireworks.js'), 'utf8');

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
  run(`state.widgets.length=0;${widgets.map(w => `state.widgets.push(${JSON.stringify(w)})`).join(';')};selected=${JSON.stringify(widgets[0].id)};view='editor';`);
  run(`document.querySelector('#view').innerHTML='<div class="editor-shell"><div class="canvas">'
    +state.widgets.map(wh).join('')+'</div></div>';`);
  // save och render ar CONST i studio.js — de gar inte att sluta om. Ett forsok kastar tyst inuti
  // sidskriptet och lamnar en raknare pa noll, alltsa ett gront test av fel skal (uppmatt).
  // Mats i stallet pa foljderna: render() ersatter noden i DOM, save() skriver om vyra-state.
  const las = uttryck => { run(`window.__ut=${uttryck}`); return h.window.__ut };
  return { h, run, las, d: h.document };
}

const fx = (d, id = 'fw1') => d.querySelector(`[data-id="${id}"] .gift-fireworks-fx`);
const raketer = (d, id = 'fw1') => fx(d, id).querySelectorAll('.fw-rocket').length;

// ---- 1. inga writes till layouten --------------------------------------------------------------

test('render() river inte ner noden som just spelar', () => {
  // Den verkliga skadan av render() i livevagen: elementet byts ut mitt i animationen. Overlever
  // SAMMA nod gavan har ingen omritning skett.
  const { h, d } = boot();
  const fore = fx(d);
  h.window.triggerGiftFireworks({ username: 'lisa', coins: 500, combo: 3 });
  const efter = fx(d);
  assert.ok(efter, 'effekten forsvann helt ur DOM');
  assert.strictEqual(efter, fore, 'noden ersattes — render() byggde om canvasen mitt i animationen');
  assert.ok(fore.isConnected, 'den gamla noden kopplades bort');
  assert.ok(efter.classList.contains('play'), 'effekten spelade inte alls');
});

test('combon skrivs inte pa widgetobjektet', () => {
  const { h, las } = boot();
  h.window.triggerGiftFireworks({ username: 'lisa', coins: 500, combo: 7 });
  assert.equal(las('state.widgets[0].fwCombo'), undefined,
    'fwCombo tillhor editorns testknapp, inte livevagen');
});

test('livevagen gor inga writes i kallan heller', () => {
  // Ett strukturellt lås: nasta person som lagger till en rad ska inte kunna smyga in ett save().
  const rad = KALLA.split('\n').find(l => /window\.triggerGiftFireworks\s*=/.test(l))
    || KALLA.slice(KALLA.indexOf('window.triggerGiftFireworks'));
  const kropp = KALLA.slice(KALLA.indexOf('window.triggerGiftFireworks'));
  const slut = kropp.indexOf('\ndocument.addEventListener');
  // Kommentarer bort först: både källan och det här testet beskriver det GAMLA beteendet i prosa,
  // och en kommentar som citerar `save()` får inte fälla ett test om koden.
  const livevagen = kropp.slice(0, slut > 0 ? slut : 2000)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  assert.doesNotMatch(livevagen, /\bsave\(\)/, 'save() finns kvar i livevagen');
  assert.doesNotMatch(livevagen, /\brender\(\)/, 'render() finns kvar i livevagen');
  assert.ok(rad !== undefined);
});

// ---- 2. combon hanteras ratt -------------------------------------------------------------------

test('en combo pa fem bygger fem raketer', () => {
  const { h, d } = boot();
  h.window.triggerGiftFireworks({ username: 'lisa', coins: 500, combo: 5 });
  assert.equal(raketer(d), 5);
});

test('combon lases aven som count och repeatcount', () => {
  for (const [falt, varde] of [['count', 4], ['repeatcount', 6]]) {
    const { h, d } = boot();
    h.window.triggerGiftFireworks({ username: 'lisa', coins: 500, [falt]: varde });
    assert.equal(raketer(d), varde, `${falt} nadde inte fram`);
  }
});

test('en gava utan combo ger en raket', () => {
  const { h, d } = boot();
  h.window.triggerGiftFireworks({ username: 'lisa', coins: 500 });
  assert.equal(raketer(d), 1);
});

test('combon klamps till 1-100', () => {
  for (const [in_, ut] of [[0, 1], [-5, 1], [500, 100], ['tolv', 1]]) {
    const { h, d } = boot();
    h.window.triggerGiftFireworks({ username: 'lisa', coins: 500, combo: in_ });
    assert.equal(raketer(d), ut, `combo ${JSON.stringify(in_)} gav ${raketer(d)} raketer`);
  }
});

// ---- 3. en ny gava forlanger, den avbryter inte -------------------------------------------------

test('den forsta gavans timer avbryts — den far inte klippa den andra animationen', () => {
  // MATT DETERMINISTISKT, och pa det FAKTISKA anropet.
  //
  // Forsta forsoket vantade ut riktiga timers (60 ms visningstid) och foll 3 av 5 lokala korningar
  // — och rev main efter merge, dar korningen tog 1030 ms i stallet for 120. En belastad maskin
  // hinner lata A:s deadline passera innan B ens triggas; da mater testet schemalaggaren.
  //
  // Andra forsoket raknade avbrott i en variabel koden sjalv okade. Den gick att luras: tar man
  // bort clearTimeout men later raknaren sta kvar blev testet gront anda (uppmatt).
  //
  // Det har spionerar pa clearTimeout och kraver att just A:s timer-id rensades.
  const { h, d, run } = boot();
  const el = fx(d);

  h.window.triggerGiftFireworks({ username: 'a', coins: 100, combo: 2 });
  run(`window.__idA = VyraFireworks.aktivId(document.querySelector('[data-id="fw1"] .gift-fireworks-fx'))`);
  const idA = h.window.__idA;
  assert.ok(idA, 'forsta gavan satte ingen timer alls');

  run(`window.__rensade=[];const c0=clearTimeout;clearTimeout=id=>{window.__rensade.push(id);return c0(id)}`);
  h.window.triggerGiftFireworks({ username: 'b', coins: 100, combo: 3 });

  assert.ok([...h.window.__rensade].includes(idA),
    `A:s timer (${idA}) rensades aldrig — den kommer att ta bort .play mitt i B:s animation`);
  assert.equal(h.window.VyraFireworks.timers(), 1, 'timers staplades i stallet for att ersattas');
  assert.notEqual(h.window.VyraFireworks.aktivId(el), idA, 'ingen ny timer sattes for B');
  assert.ok(el.classList.contains('play'), 'effekten slutade spela');
});

test('den andra gavans raketer bygger pa, de ersatter inte', () => {
  const { h, d } = boot();
  h.window.triggerGiftFireworks({ username: 'a', coins: 100, combo: 2 });
  h.window.triggerGiftFireworks({ username: 'b', coins: 100, combo: 3 });
  assert.equal(raketer(d), 3, 'den senaste gavans combo ska styra antalet raketer');
});

test('timern satts om vid varje ny gava', () => {
  const { h } = boot();
  h.window.triggerGiftFireworks({ username: 'a', coins: 100, combo: 1 });
  const forsta = h.window.VyraFireworks.slutarVid();
  h.window.triggerGiftFireworks({ username: 'b', coins: 100, combo: 1 });
  assert.ok(h.window.VyraFireworks.slutarVid() >= forsta,
    'sluttiden flyttades inte fram — en ny gava forlanger inte visningen');
});

// ---- 4. testknappen ar orord -------------------------------------------------------------------

test('editorns testknapp far fortfarande spara sitt combovarde', () => {
  // w.fwCombo tillhor testknappen och ar en editorinstallning, inte live-data. Den ska inte
  // forsvinna bara for att livevagen slutade skriva till widgeten.
  assert.match(KALLA, /w\.fwCombo\s*=\s*Math\.max\(1,Math\.min\(100/,
    'testknappens combofalt togs bort av misstag');
});

// ---- 4. raketen visar den gava som faktiskt skickades -------------------------------------------
//
// Davids rapport 2026-08-08, ordagrant: "GIFT FIREWORKS vissar bara rose gift och den ska skicka
// vilken gava man ska skicka ... skickar man en rose da flyger en raket om skickar 2 lion da flyger
// tva lion".
//
// HALVA VAGEN FANNS REDAN. Rad 82 laser combon ur eventet (combo ?? repeatcount ?? count) och
// buildComboRockets bygger en raket per styck — ANTALET var alltsa alltid ratt. Men samma funktion
// gor:
//
//   let gift = w.fwGiftImage || campaignGiftList()[0]?.file
//
// Bilden kommer fran PANELINSTALLNINGEN, aldrig fran eventet. Standardvardet ar 0001_Rose.png, sa
// den som inte bytt bild ser en ros oavsett vad som skickas. Tva lion gav tva raketer med rosbild.
//
// Eventets giftImage nar hela vagen fram — molnbryggan (giftImageOf), desktop (giftPictureUrl) och
// servern (cleanEvent) bar alla faltet. Widgeten kastade bort det.
//
// Samma monster som tystat fyra widgetar: fardig grafik utan live-trigger. Har hade TEXTEN en
// trigger (raden ovanfor satter gavonamnet) men bilden inte — halva kopplingen, vilket ar svarare
// att se an ingen alls.
//
// ROTT NU.
const bilder = (d, id = 'fw1') =>
  [...fx(d, id).querySelectorAll('.fw-rocket .fw-rocket-gift')].map(i => i.getAttribute('src'));

const LION = 'https://p16.tiktokcdn.com/img/lion.png';

test('raketen visar gavan ur eventet, inte panelbilden', () => {
  const { h, d } = boot([fw('fw1', { fwGiftImage: 'assets/gifts/events/0001_Rose.png' })]);
  h.window.triggerGiftFireworks({ username: 'lisa', coins: 500, count: 1, giftName: 'Lion', giftImage: LION });
  assert.deepEqual(bilder(d), [LION],
    'raketen visar fortfarande panelbilden — en ros flyger nar nagon skickat ett lejon');
});

// Antalet fungerade redan; provet halls kvar sa en fix av bilden inte rakar ta sonder det.
test('tva lion ger tva raketer, bada med lejonbilden', () => {
  const { h, d } = boot([fw('fw1', { fwGiftImage: 'assets/gifts/events/0001_Rose.png' })]);
  h.window.triggerGiftFireworks({ username: 'lisa', coins: 500, count: 2, giftName: 'Lion', giftImage: LION });
  assert.equal(raketer(d), 2, 'antalet foljer inte gavans count');
  assert.deepEqual(bilder(d), [LION, LION], 'bara nagra av raketerna fick ratt bild');
});

// Panelinstallningen far inte bli meningslos: editorns testknapp har ingen gava alls, och ett event
// utan bild ska inte ge en trasig <img src="">.
test('utan bild i eventet anvands panelbilden', () => {
  const { h, d } = boot([fw('fw1', { fwGiftImage: 'assets/gifts/events/0042_Galaxy.png' })]);
  h.window.triggerGiftFireworks({ username: 'lisa', coins: 500, count: 1, giftName: 'Galaxy' });
  assert.deepEqual(bilder(d), ['assets/gifts/events/0042_Galaxy.png'],
    'reserven foll bort — en gava utan bild ger nu en tom <img>');
});

test('en ny gava byter bild pa raketerna', () => {
  const { h, d } = boot([fw('fw1', { fwGiftImage: 'assets/gifts/events/0001_Rose.png' })]);
  h.window.triggerGiftFireworks({ username: 'a', coins: 5, count: 1, giftImage: LION });
  assert.deepEqual(bilder(d), [LION]);
  const ros = 'https://p16.tiktokcdn.com/img/rose.png';
  h.window.triggerGiftFireworks({ username: 'b', coins: 5, count: 1, giftImage: ros });
  assert.deepEqual(bilder(d), [ros], 'bilden fastnade pa den forra gavan');
});

// DEN CENTRALA GAVAN — den som faktiskt syns storst.
//
// Raketerna var bara halva felet. Basmarkupen (gift-fireworks.js:9) har en NAKEN <img> som ar
// gavan som aterformas i mitten:
//
//   <div class="fw-burst">…</div><div class="fw-ring"></div><img src="${w.fwGiftImage||'…0001_Rose.png'}">
//
// Den byggs EN gang av wh() ur panelinstallningen och rors aldrig av live-vagen. Uppmatt i riktig
// Chrome efter att raketerna fixats: raketerna bar ratt gava, men mitt i bilden satt fortfarande
// en ros. Det ar den David faktiskt ser — den ar storst.
//
// ROTT NU.
const mittbild = (d, id = 'fw1') => {
  const nod = [...fx(d, id).children].find(n => n.tagName === 'IMG');
  return nod ? nod.getAttribute('src') : '(ingen central bild)';
};

test('den centrala gavan byts till den som skickades', () => {
  const { h, d } = boot([fw('fw1', { fwGiftImage: 'assets/gifts/events/0001_Rose.png' })]);
  h.window.triggerGiftFireworks({ username: 'lisa', coins: 500, count: 1, giftName: 'Lion', giftImage: LION });
  assert.equal(mittbild(d), LION,
    'mittbilden visar fortfarande panelbilden — det ar den storsta grafiken i widgeten');
});

test('utan bild i eventet star den centrala kvar pa panelbilden', () => {
  const { h, d } = boot([fw('fw1', { fwGiftImage: 'assets/gifts/events/0042_Galaxy.png' })]);
  h.window.triggerGiftFireworks({ username: 'lisa', coins: 500, count: 1, giftName: 'Galaxy' });
  assert.equal(mittbild(d), 'assets/gifts/events/0042_Galaxy.png');
});

// ---- 5. en gava som inte gar att ladda faller tillbaka pa en GAVA, inte ett ansikte -------------
//
// FOLJD AV FIXEN OVAN. Fore den var raketernas src alltid en lokal fil som alltid finns; nu ar den
// en TikTok-CDN-URL som kan fallera (natet, en utgangen signatur, en blockerad domain).
//
// runtime-controls.js:52 fangar image-fel globalt och byter till en platshallare — men valet gors
// pa `img.closest('.vyra-gift-face,.streak-gift-face,.campaign-gift-image')`. En raketbild matchar
// ingen av dem, sa den fick PROFILPLATSHALLAREN: ett ansiktsfoto flygande i ett fyrverkeri.
//
// Den centrala bilden har redan ett eget onerror (gift-fireworks.js:118 lagger pa det), sa det ar
// raketerna som saknar skydd.
//
// ROTT NU: selektorn kanner inte igen fyrverkeriets bilder.
const KALLA_RUNTIME = fs.readFileSync(path.join(ROOT, 'runtime-controls.js'), 'utf8');

test('fyrverkeriets bilder raknas som gavor i fallback-selektorn', () => {
  const rad = KALLA_RUNTIME.split(/\r?\n/).find(l => /fallbackApplied/.test(l) && /closest\(/.test(l));
  assert.ok(rad, 'hittade ingen fallback-rad att kontrollera');
  const selektor = /closest\('([^']+)'\)/.exec(rad);
  assert.ok(selektor, `kunde inte lasa selektorn ur: ${rad.trim().slice(0, 120)}`);
  assert.match(selektor[1], /gift-fireworks-fx/,
    'en gavobild som inte gar att ladda i Gift Fireworks byts mot ett PROFILFOTO i stallet for en gava');
});

// ---- 6. raketen visar avsandaren och flippar till gavan -----------------------------------------
//
// Davids avsikt, ordagrant: "nar raketen nar toppen visar profilbilden sen flipar gift bild".
//
// Raketen hade EN bild. Nu tva sidor: avsandarens profilbild pa framsidan, gavan pa baksidan, och
// en rotateY i vandpunkten. Samma 3D-idiom som TOP GIFT redan anvander (.vyra-flip i studio.css) —
// widgetarna ska rora sig som slaktingar, inte som framlingar.
//
// PROFILBILDEN BAR TVA NAMN: `profileImage` pa desktopvagen, `profileUrl` fran molnet
// (server/event-bus.js cleanEvent doper om det). Bada lases — samma faltglapp som en gang gjorde
// alla diamanter till noll.
//
// UTAN AVSANDARBILD SKA DET INTE FLIPPA. En tom framsida ar samre an ingen flip alls.
//
// ROTT NU.
const AVATAR = 'https://p16.tiktokcdn.com/img/anna.png';
const framsidor = (d, id = 'fw1') =>
  [...fx(d, id).querySelectorAll('.fw-rocket .fw-rocket-avatar')].map(i => i.getAttribute('src'));

test('raketen bar avsandarens profilbild pa framsidan', () => {
  const { h, d } = boot();
  h.window.triggerGiftFireworks({ username: 'anna', coins: 500, count: 1,
    giftImage: LION, profileImage: AVATAR });
  assert.deepEqual(framsidor(d), [AVATAR],
    'raketen har ingen avsandarsida — det finns inget att flippa fran');
  assert.deepEqual(bilder(d), [LION], 'gavosidan forsvann nar framsidan lades till');
});

test('molnets profileUrl duger lika bra som desktops profileImage', () => {
  const { h, d } = boot();
  h.window.triggerGiftFireworks({ username: 'anna', coins: 500, count: 1,
    giftImage: LION, profileUrl: AVATAR });
  assert.deepEqual(framsidor(d), [AVATAR],
    'bara ett av de tva faltnamnen lases — halva anvandarna far ingen avsandarbild');
});

// BARA FORSTA RAKETEN bar avsandaren. Davids beslut: samma ansikte pa tjugo raketer blir brus —
// den forsta racker for att saga VEM, resten sager VAD.
test('bara forsta raketen bar avsandaren, resten ar ren gava', () => {
  const { h, d } = boot();
  h.window.triggerGiftFireworks({ username: 'anna', coins: 500, count: 3,
    giftImage: LION, profileImage: AVATAR });
  assert.equal(raketer(d), 3, 'antalet foljer inte gavans count');
  assert.deepEqual(framsidor(d), [AVATAR], 'fler an en raket bar avsandarbilden');
  assert.deepEqual(bilder(d), [LION, LION, LION], 'alla tre ska anda visa gavan');
});

// Utan avsandarbild ska raketen se ut precis som fore: en gava, ingen tom framsida.
test('utan profilbild finns ingen avsandarsida alls', () => {
  const { h, d } = boot();
  h.window.triggerGiftFireworks({ username: 'anna', coins: 500, count: 1, giftImage: LION });
  assert.deepEqual(framsidor(d), [], 'en tom <img> lades till som framsida');
  assert.deepEqual(bilder(d), [LION], 'gavan forsvann nar avsandaren saknades');
});

// Flippen ska vara CSS-driven pa en behallare, inte en JS-timer per raket: en timer per raket vid
// hundra raketer ar hundra timers, och de overlever inte att widgeten rivs.
test('flippen ar CSS-driven, inte en JS-timer', () => {
  assert.equal(/setTimeout\([^)]*flip/i.test(KALLA), false,
    'flippen drivs av en timer i JS — den overlever inte att noden byts ut');
  assert.match(KALLA, /fw-rocket-flip|fw-rocket-avatar/,
    'ingen flipstruktur byggs alls');
});
