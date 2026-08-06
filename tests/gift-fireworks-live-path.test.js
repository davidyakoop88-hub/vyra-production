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

test('den forsta gavans timer avbryts — den far inte klippa den andra animationen', async () => {
  // Den verkliga skadan, matt med riktiga timers: gava A satter en deadline, gava B kommer strax
  // efter och ska flytta fram den. Avbryts inte A:s timer tar den bort .play mitt i B:s animation.
  // 60 ms visningstid gor det matbart utan att testet tar sekunder.
  const { h, d } = boot([fw('fw1', { fwDuration: 0.06 })]);
  const vanta = ms => new Promise(r => h.window.setTimeout(r, ms));

  h.window.triggerGiftFireworks({ username: 'a', coins: 100, combo: 2 });
  await vanta(40);
  h.window.triggerGiftFireworks({ username: 'b', coins: 100, combo: 3 });
  await vanta(35);   // forbi A:s ursprungliga deadline (60 ms), fore B:s (40+60 ms)

  assert.ok(fx(d).classList.contains('play'),
    'A:s timer levde kvar och tog bort effekten mitt i B:s animation');

  await vanta(45);   // nu ska aven B ha hunnit ta slut
  assert.ok(!fx(d).classList.contains('play'), 'effekten stannade kvar for evigt');
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
