'use strict';
// Tre premiumdesigner for Battle MVP: Royal Purple, Neon Cyber, Diamond Elite.
//
// De sju befintliga stilarna delar tre lador och har ingen entre alls — .mvp-active vander bara
// opacity och en scale(.8) via en 0,4-sekunders transition. De sju ramade har en riktig entre men
// den ar dod kod: animationerna hanger pa klassen .play, som ingenting i kodbasen satter.
//
// De nya far darfor en egen fasmaskin, byggd som Last-X gor det: roten ar motorskalet som bara
// tonar, och en inre .mvp-plate bar rorelsen. Skalet ar inte kosmetiskt — roten sätter
// transform:scale(1)!important pa .mvp-active, och en !important-deklaration slar en CSS-animation.
// Ligger rorelsen pa plattan slipper den den kampen helt.
//
// Omslaget laggs BARA pa de tre nya: roten ar display:flex med gap, sa ett omslag pa de gamla hade
// gjort emblem och text till ett enda flexbarn och brutit deras layout.
//
// ROTT NU: stilarna finns inte.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const MEDIA = read('media.js'), CSS = read('studio.css');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));

const PREMIUM = ['royal-purple', 'neon-cyber', 'diamond-elite'];

test.after(closeAll);

// ---- fabriken -------------------------------------------------------------------------------------
for (const style of PREMIUM) {
  test(`catalog:battlemvp:${style} skapar en widget`, () => {
    const w = VyraWidgets.create(`catalog:battlemvp:${style}`);
    assert.equal(w.type, 'templateBattleMvp');
    assert.equal(w.mvpStyle, style);
  });
}

test('premiumstilarna haller 5 sekunder, enligt specen', () => {
  for (const style of PREMIUM) {
    assert.equal(VyraWidgets.create(`catalog:battlemvp:${style}`).mvpDuration, 5,
      `${style} har fel halltid`);
  }
});

test('de sju gamla stilarna ar orörda', () => {
  for (const style of ['inferno', 'royal', 'cyber', 'ice', 'storm', 'aurora', 'samurai']) {
    const w = VyraWidgets.create(`catalog:battlemvp:${style}`);
    assert.equal(w.mvpStyle, style);
    assert.equal(w.mvpDuration, 7, `${style} fick en ny halltid`);
  }
});

// ---- katalogen ------------------------------------------------------------------------------------
for (const style of PREMIUM) {
  test(`${style} gar att lagga till ur katalogen`, () => {
    assert.match(MEDIA, new RegExp(`data-mvp-style="${style}"`), 'ingen katalogknapp');
  });
}

test('rubriken raknar ratt antal designer', () => {
  // 7 gamla + 7 ramade + 3 nya. Rubriken sa "7 DESIGNER" trots att rutnatet redan hade 14 knappar.
  const heading = MEDIA.match(/<h4>BATTLE MVP · (\d+) DESIGNER<\/h4>/);
  assert.ok(heading, 'hittade ingen rubrik');
  assert.equal(heading[1], '17', `rubriken sager ${heading[1]}`);
});

// ---- markup ---------------------------------------------------------------------------------------
test('premiumstilarna renderas med ett rorelseomslag', () => {
  const w = VyraWidgets.create('catalog:battlemvp:royal-purple');
  w.id = 'mvp1';
  const h = createDom({ state: { widgets: [w], projectName: 'test' } });
  h.load('overlay-sanitize.js');
  const box = h.paint([w]).querySelector('[data-id="mvp1"]');
  assert.ok(box, 'widgeten ritades inte');
  assert.ok(box.className.includes('mvp-premium'), `klasser: ${box.className}`);
  assert.ok(box.className.includes('mvp-royal-purple'));
  assert.ok(box.querySelector('.mvp-plate'), 'ingen .mvp-plate — rorelsen skulle sitta pa roten');
  assert.ok(box.querySelector('.mvp-plate .mvp-copy'), 'texten ligger utanfor plattan');
  assert.ok(box.querySelector('.mvp-plate .mvp-emblem'), 'avataren ligger utanfor plattan');
});

test('de gamla stilarna far INTE omslaget', () => {
  const w = VyraWidgets.create('catalog:battlemvp:inferno');
  w.id = 'mvp2';
  const h = createDom({ state: { widgets: [w], projectName: 'test' } });
  h.load('overlay-sanitize.js');
  const box = h.paint([w]).querySelector('[data-id="mvp2"]');
  assert.ok(!box.querySelector('.mvp-plate'),
    'roten ar display:flex med gap — ett omslag gor emblem och text till ett flexbarn');
  assert.ok(!box.className.includes('mvp-premium'));
});

// ---- fasmaskinen ----------------------------------------------------------------------------------
test('entren ar 900 ms och startar pa scale(.9)', () => {
  assert.match(CSS, /@keyframes mvpPremiumIn\{[^}]*scale\(\.9\)/, 'entren startar inte pa .9');
  assert.match(CSS, /animation:mvpPremiumIn \.9s cubic-bezier\(\.16,1,\.3,1\)/, 'fel langd eller easing');
});

test('exit gar till scale(.95), inte tillbaka till entrens .9', () => {
  const at = CSS.indexOf('.mvp-premium .mvp-plate{');
  assert.notEqual(at, -1, 'plattan har inget vilolage');
  const rule = CSS.slice(at, CSS.indexOf('}', at));
  assert.match(rule, /transform:scale\(\.95\)/, 'vilolaget ar exitens mal — specen sager .95');
  assert.match(rule, /transition:[^;]*\.9s/, 'exit sker via transition och maste vara 900 ms');
});

test('rorelsen sitter pa plattan, aldrig pa roten', () => {
  // Roten sätter transform:scale(1)!important pa .mvp-active. En !important-deklaration slar en
  // animation, sa en entre pa roten hade helt enkelt inte spelat.
  assert.doesNotMatch(CSS, /\.mvp-premium\.mvp-active\{[^}]*animation:mvpPremiumIn/,
    'entren ligger pa roten och kommer att forloras mot base-regelns !important');
});

test('ingen premiumdesign loopar sin entre', () => {
  const at = CSS.indexOf('/* ---- Battle MVP premium');
  assert.notEqual(at, -1, 'hittade inget premiumblock');
  const block = CSS.slice(at);
  // Stannar vid kommatecknet: en design far ha en loopande hall-effekt EFTER entren i samma
  // shorthand, men entren sjalv maste ta slut. Kommatecknet skiljer de tva animationerna at.
  assert.doesNotMatch(block, /mvpPremiumIn [^,;}]*infinite/, 'entren loopar');
  assert.match(block, /mvpPremiumIn \.9s cubic-bezier\(\.16,1,\.3,1\) both/,
    'entren halls inte kvar i sitt sluttillstand — widgeten skulle hoppa tillbaka');
});

test('varje loopande halleffekt vantar in entren', () => {
  // En hall-effekt som startar pa 0s krockar med entren de forsta 900 ms.
  const block = CSS.slice(CSS.indexOf('/* ---- Battle MVP premium'));
  for (const [, decl] of block.matchAll(/animation:([^;}]*infinite)/g)) {
    assert.match(decl, /\.9s infinite|\s\.9s\s+infinite/,
      `en loopande effekt saknar 0,9 s fordrojning: ${decl.trim()}`);
  }
});

// ---- de tre designerna ----------------------------------------------------------------------------
for (const style of PREMIUM) {
  test(`${style} har en egen stil`, () => {
    assert.match(CSS, new RegExp(`\\.battle-mvp\\.mvp-${style}`), 'ingen egen CSS-regel');
  });
}

test('Royal Purple har en krona byggd i CSS, ingen bild', () => {
  const at = CSS.indexOf('.mvp-royal-purple .mvp-crown');
  assert.notEqual(at, -1, 'ingen krona');
  const rule = CSS.slice(at, CSS.indexOf('}', at));
  assert.match(rule, /clip-path:polygon/, 'kronan ar inte byggd med clip-path');
  assert.doesNotMatch(rule, /url\(/, 'kronan laddar en extern bild — specen sager CSS');
});

test('Neon Cyber har en hexagonal avatarram', () => {
  const at = CSS.indexOf('.mvp-neon-cyber .mvp-emblem');
  assert.notEqual(at, -1);
  assert.match(CSS.slice(at, CSS.indexOf('}', at)), /clip-path:polygon/, 'ramen ar inte hexagonal');
});

test('Diamond Elite fungerar aven utan backdrop-filter', () => {
  // I OBS finns ingenting bakom widgeten att blurra — plattan maste ha en egen bakgrund, annars
  // blir glasmorfismen osynlig och texten star pa ingenting.
  const at = CSS.indexOf('.mvp-diamond-elite .mvp-plate');
  assert.notEqual(at, -1);
  const rule = CSS.slice(at, CSS.indexOf('}', at));
  assert.match(rule, /background:/, 'ingen egen bakgrund — osynlig over en stream');
});

test('inga externa bilder i nagon av de tre', () => {
  const at = CSS.indexOf('/* ---- Battle MVP premium');
  const block = CSS.slice(at, at + 6000);
  assert.doesNotMatch(block, /url\(['"]?(https?:|assets\/)/, 'en design laddar en extern bild');
});
