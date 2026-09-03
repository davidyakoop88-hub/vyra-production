'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
const ROOT = path.join(__dirname, '..');
const MEDIA = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));
test.after(closeAll);

// ETT KONTRAKT FOR ALLA SJUTTON SEDAN 2026-09-03: MVP-rubriken och NAMNET visas, coins inte.
//
// HISTORIEN, for den star inte att lasa ur koden: mellan 2026-08-13 och 2026-09-03 hade
// stilmodellerna och rammodellerna OLIKA kontrakt. Ramarna fick visa namnet (195fc8a), de tio
// stilmodellerna behöll sitt gamla "bara MVP". Det var Davids beslut da, och det har provet
// vaktade det.
//
// VARFOR DET REVS: uppmätt 2026-09-03 under PR #313 att de tio stilmodellerna aldrig visade vem
// som faktiskt vann en battle — bara ordet MVP. David bad om ett enda kontrakt.
//
// DAR VARDET FAKTISKT BOR: widget-factory.js, inte media.js. Flaggan sätts UTTRYCKLIGT nar
// widgeten skapas, sa renderarens standardvarde ar aldrig det som avgor for en riktig widget.
// Renderaruttrycken ar anda likriktade (`===false?'none':'block'` i alla tre vagarna) sa att en
// widget UTAN flaggan — handskriven eller fran en gammal sparad layout — beter sig likadant
// overallt.
//
// COINS AR EN ANNAN FRAGA och rors inte: fortfarande av som standard i bada familjerna.
for (const key of ['catalog:battlemvp:inferno','catalog:battlemvp:royal-purple']) {
  test(`${key} visar MVP och namnet, men ingen giftdata`, () => {
    const w = VyraWidgets.create(key); w.id = key.replaceAll(':','-');
    assert.equal(w.mvpLabel, 'MVP');
    assert.equal(w.mvpShowName, true, 'namnet ska vara pa som standard aven for stilmodellerna');
    assert.equal(w.mvpShowCoins, false, 'coins ska fortfarande vara av');
    const h = createDom({ state: { widgets: [w], projectName: 'test' } });
    h.load('overlay-sanitize.js');
    const box = h.paint([w]).querySelector(`[data-id="${w.id}"]`);
    const label = box.querySelector('.mvp-copy small,.mvpf-plate small');
    assert.equal(label.textContent.trim(), 'MVP');
    const name = box.querySelector('.mvp-copy h2,.mvpf-row strong');
    const score = box.querySelector('.mvp-copy>strong,.mvpf-row b');
    assert.doesNotMatch(name.getAttribute('style') || '', /display:none/,
      'namnet ska synas utan att anvandaren behover sla pa det');
    assert.match(score.getAttribute('style') || '', /display:none/);
  });
}

// EN WIDGET UTAN FLAGGAN — och det ar HAR renderaruttrycket faktiskt mats.
//
// Fabriken satter mvpShowName uttryckligen, sa proven ovan blir grona bade med
// `===true?'block':'none'` och med `===false?'none':'block'`. Skillnaden mellan de tva formerna
// syns ENBART nar flaggan ar undefined: en handskriven widget, en gammal sparad layout, eller en
// widget byggd av kod som inte kanner till flaggan. Utan det har provet gar likriktningen i
// media.js att backa utan att nagot faller.
//
// ALLA TRE RENDERINGSVAGARNA prövas: premium (royal-purple), basvagen (inferno) och ramvagen
// (gold-crown). De ligger i olika funktioner och hade kunnat glida isar igen.
for (const [key, valj] of [
  ['catalog:battlemvp:inferno', '.mvp-copy h2'],
  ['catalog:battlemvp:royal-purple', '.mvp-copy h2'],
  ['catalog:battlemvp:frame:gold-crown', '.mvpf-row strong'],
]) {
  test(`${key} visar namnet aven nar mvpShowName saknas helt`, () => {
    const w = VyraWidgets.create(key); w.id = 'utan-flagga';
    delete w.mvpShowName;
    const h = createDom({ state: { widgets: [w], projectName: 'test' } });
    h.load('overlay-sanitize.js');
    const box = h.paint([w]).querySelector('[data-id="utan-flagga"]');
    assert.doesNotMatch(box.querySelector(valj).getAttribute('style') || '', /display:none/,
      'en widget utan flaggan doljer namnet — renderaruttrycket kraver ett uttryckligt true');
  });
}

// EN SPARAD LAYOUT VINNER OVER STANDARDVARDET. Den som medvetet slagit AV namnet ska inte fa det
// pasatt igen av en uppdatering — samma krav som ramarna redan bar i
// tests/browser/battle-mvp-ramar.browser.test.js.
test('ett uttryckligt mvpShowName:false doljer fortfarande namnet i stilmodellerna', () => {
  const w = VyraWidgets.create('catalog:battlemvp:inferno');
  w.id = 'inferno-avslaget'; w.mvpShowName = false;
  const h = createDom({ state: { widgets: [w], projectName: 'test' } });
  h.load('overlay-sanitize.js');
  const box = h.paint([w]).querySelector('[data-id="inferno-avslaget"]');
  assert.match(box.querySelector('.mvp-copy h2').getAttribute('style') || '', /display:none/,
    'anvandarens egna val overkordes av det nya standardvardet');
});

// RAMMODELLERNA gick forst: de har visat MVP, profilbild och namn sedan 2026-08-13, och bar ingen
// giftdata alls. Sedan 2026-09-03 galler samma namnkrav for stilmodellerna ovan — men de tva
// familjerna testas anda var for sig, eftersom de renderas av OLIKA funktioner (battleMvpHtml:s
// ram-vag mot battleMvpPremiumHtml och basvagen) med var sin DOM-struktur. Ett gemensamt prov hade
// dolt att en av vagarna slutat visa namnet.
test('catalog:battlemvp:frame:gold-crown visar MVP och namn, men ingen giftdata', () => {
  const w = VyraWidgets.create('catalog:battlemvp:frame:gold-crown');
  w.id = 'ram-gold-crown';
  assert.equal(w.mvpLabel, 'MVP');
  assert.equal(w.mvpShowName, true, 'namnet ska vara pa som standard for ramarna');
  const h = createDom({ state: { widgets: [w], projectName: 'test' } });
  h.load('overlay-sanitize.js');
  const box = h.paint([w]).querySelector(`[data-id="${w.id}"]`);
  assert.equal(box.querySelector('.mvpf-plate small').textContent.trim(), 'MVP');
  const name = box.querySelector('.mvpf-row strong');
  assert.doesNotMatch(name.getAttribute('style') || '', /display:none/,
    'namnet ska synas utan att anvandaren behover slå pa det');
  assert.equal(box.querySelector('.mvpf-row b'), null,
    'coinselementet ska inte finnas i DOM — dolt racker inte, det kan tandas av gammal state');
});

test('äldre BATTLE MVP-state visas som MVP utan migration', () => {
  assert.match(MEDIA, /trim\(\)\.toUpperCase\(\)==='BATTLE MVP'\?'MVP':label/);
});

// EN ENDA FORM FOR HELA FILEN — och det ar den vakten som gor de tre andringarna provbara ihop.
//
// mvpShowName lases pa FYRA stallen i media.js: de tva renderaruttrycken, kryssrutans utgangslage
// i panelen, och synken som satter kryssrutan efter en ombindning. Uppmätt 2026-09-03 att synken
// stod pa `===true` medan ramrenderaren stod pa `===false?` — panelen visade darfor rutan
// OKRYSSAD for en widget vars namn faktiskt syntes. En kryssruta som ljuger om laget ar varre an
// ingen kryssruta.
//
// `===true` betyder "bara om nagon uttryckligen slagit pa det" och ar fel form overallt numera:
// den behandlar en saknad flagga som ett nej. Att forbjuda formen HELT i filen tacker alla fyra
// stallena med ett villkor, och fangar ett nytt femte stalle som nagon skriver i morgon.
test('ingen kod i media.js kraver ett uttryckligt true for att visa namnet', () => {
  assert.doesNotMatch(MEDIA, /mvpShowName===true/,
    'nagot stalle laser mvpShowName som `===true` — da doljs namnet for varje widget som saknar '
    + 'flaggan, och panelen och renderaren kan sluta vara overens. Anvand `!==false` respektive '
    + "`===false?'none':'block'`.");
  assert.match(MEDIA, /name\.checked=w\.mvpShowName!==false/,
    'synken som satter kryssrutan efter ombindning saknas eller har bytt form');
});

// RAMPANELENS POANGKONTROLLER AR DODA — och ska darfor inte gå att röra.
//
// Ramgrenen bygger inget coins-element ALLS (Davids spec 2026-08-13: MVP-etikett, profilbild och
// namn, inget annat). tests/browser/battle-mvp-ramar.browser.test.js bevisar att `.mvpf-plate b`
// inte finns i DOM. Anda satt det bade en kryssruta "Poang" och ett reglage "Poangstorlek" i
// rampanelen: kryssrutan skrev `mvpShowCoins` som ramrenderaren aldrig laser, och reglaget skrev
// `mvpScoreSize` som ingen ram anvander. Tva kontroller som gjorde exakt ingenting nar man drog i
// dem — och en kontroll som inte gor nagot ar samre an ingen kontroll, for anvandaren tror att den
// verkar.
//
// De ar avstangda i stallet for bortplockade: en tom lucka forklarar ingenting, medan en avstangd
// ruta med sin motivering i title sager BADE att alternativet finns for andra designer och varfor
// det inte galler har.
test('rampanelens döda poängkontroller är avstängda', () => {
  const ruta = MEDIA.match(/mvpShowCoinsF"[^>]*>/);
  assert.ok(ruta, 'hittade inte kryssrutan #mvpShowCoinsF');
  assert.match(ruta[0], /\sdisabled\b/,
    'kryssrutan "Poang" i rampanelen gar att klicka fast ramarna aldrig visar poang');
  assert.match(ruta[0], /title="[^"]{20,}"/, 'den avstängda rutan saknar en motivering i title');

  const reglage = MEDIA.match(/mvpScoreSize" type="range"[^>]*>/);
  assert.ok(reglage, 'hittade inte reglaget #mvpScoreSize');
  assert.match(reglage[0], /\sdisabled\b/,
    'reglaget "Poangstorlek" gar att dra fast inget poangelement finns att storleksandra');
});

test('panelkontroller kan slå på namn och coins', () => {
  for (const id of ['mvpShowLabelMain','mvpShowNameMain','mvpShowCoins']) assert.match(MEDIA, new RegExp(`id="${id}"`));
  assert.match(MEDIA, /\['#mvpShowNameMain','mvpShowName'\]/);
  assert.match(MEDIA, /w\.mvpShowCoins===true\?'checked':''/);
});
