'use strict';
// REGELNYCKLAR — proven för att en inlärd gåva alltid hamnar i rätt "låda".
//
// Varför det spelar roll: gift_rule_identity har PRIMARY KEY (workspace_id, rule_key), och
// nyckeln är enda kopplingen mellan "det Studio lärde in" och "det en regel senare slår upp".
// Väljs den fritt av webbläsaren kan Studio lära in Heart Me under en nyckel medan Goal frågar
// efter en annan. Felet syns inte som ett fel — bara som en widget som står på noll.
//
// Kräver ingen databas: modulen är ren.
const test = require('node:test'), assert = require('node:assert/strict');
const R = require('../regelnycklar');

// ---- HEART ME ---------------------------------------------------------------------------------

test('heart_me är en enda fast nyckel', () => {
  assert.equal(R.HEART_ME, 'heart_me');
  assert.equal(R.validera('heart_me'), 'heart_me');
});

test('varianter av heart_me är INTE samma låda', () => {
  // Att acceptera dem hade varit värre än att neka: två stavningar, två lådor, en alltid tom.
  for (const fel of ['heartme', 'heart-me', 'Heart_Me', 'heart_me_2', 'HEART_ME']) {
    assert.equal(R.validera(fel), null, `"${fel}" ska inte accepteras`);
  }
});

test('omgivande blanktecken trimmas bort', () => {
  assert.equal(R.validera('  heart_me  '), 'heart_me');
});

// ---- KAMPANJNYCKLAR ---------------------------------------------------------------------------

test('en kampanjnyckel bär både widget och slot', () => {
  // En kampanjwidget har flera slots, och VARJE slot väljer sin egen gåva med sin egen räknare
  // (gift-event-images.js:238-252). En nyckel per widget hade tvingat alla slots att dela gåva.
  assert.equal(R.giftCampaign('templateGiftCampaign-ab12', 0), 'gift_campaign:templateGiftCampaign-ab12:0');
  assert.equal(R.giftCampaign('templateGiftCampaign-ab12', 3), 'gift_campaign:templateGiftCampaign-ab12:3');
});

test('två slots i samma widget är två olika lådor', () => {
  const a = R.giftCampaign('w1', 0), b = R.giftCampaign('w1', 1);
  assert.notEqual(a, b, 'annars delar slotarna gåva och räknare');
});

test('slot kanoniseras — 007 och 7 är samma låda', () => {
  assert.equal(R.validera('gift_campaign:w1:007'), 'gift_campaign:w1:7');
  assert.equal(R.validera('gift_campaign:w1:7'), 'gift_campaign:w1:7');
});

test('sträng och tal ger samma nyckel', () => {
  assert.equal(R.giftCampaign('w1', '3'), R.giftCampaign('w1', 3));
});

// ---- OGILTIGT KASTAS ELLER NEKAS --------------------------------------------------------------

test('giftCampaign kastar hellre än returnerar en halvgiltig nyckel', () => {
  assert.throws(() => R.giftCampaign('', 0), /widget-id/i);
  assert.throws(() => R.giftCampaign('w:1', 0), /widget-id/i, 'kolon är nyckelns egen separator');
  assert.throws(() => R.giftCampaign('w1', -1), /slot/i);
  assert.throws(() => R.giftCampaign('w1', 1000), /intervallet/i);
  assert.throws(() => R.giftCampaign('w1', 'abc'), /slot/i);
});

test('okända former ger null — ingen låda alls', () => {
  for (const fel of [
    'nagot_annat', 'gift_campaign', 'gift_campaign:', 'gift_campaign:w1',
    'gift_campaign:w1:', 'gift_campaign:w1:abc', 'gift_campaign:w1:1000',
    'gift_campaign:w:1:2', '', '   ', null, undefined, 42, {}, []
  ]) {
    assert.equal(R.validera(fel), null, `${JSON.stringify(fel)} ska ge null`);
  }
});

test('inget släpps igenom som kan bära något annat än en nyckel', () => {
  for (const fel of [
    "heart_me; DROP TABLE gift_rule_identity",
    'heart_me\nheart_me',
    '../../etc/passwd',
    'gift_campaign:w1:1 OR 1=1',
    'heart_me%00'
  ]) {
    assert.equal(R.validera(fel), null, `"${fel}" ska nekas`);
  }
});

test('för långa nycklar nekas', () => {
  assert.equal(R.validera('gift_campaign:' + 'w'.repeat(200) + ':1'), null);
});

// ---- VAKT: RUTTEN ANVÄNDER VALIDERAREN --------------------------------------------------------

test('vakt: rutten släpper aldrig igenom en ovaliderad nyckel', () => {
  const fs = require('node:fs'), path = require('node:path');
  const kall = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/).map(r => r.replace(/\/\/.*$/, '')).join('\n');

  assert.ok(/Regelnycklar\.validera\(/.test(kall),
    'gift-identity-rutten måste gå genom valideraren — annars äger webbläsaren nyckeln');
  // Och att den nekar: en validerad nyckel som blir null ska ge 400, inte fortsätta.
  assert.ok(/if\(!ruleKey\)return send\(res,400/.test(kall.replace(/\s+/g, ' ').replace(/ /g, '')) ||
            /!ruleKey/.test(kall),
    'ett null-resultat måste stoppa anropet');

  // KONTROLLMÄTNING: mönstret kan träffa.
  assert.ok(/Regelnycklar\.validera\(/.test('const k=Regelnycklar.validera(x);'));
});

// ---- FORMERNA ÄR DOKUMENTERADE ----------------------------------------------------------------

test('varje form i FORMER är antingen fast eller har ett byggande anrop', () => {
  // Läggs en ny form till utan validering faller det här provet — FORMER och validera() måste
  // följas åt.
  assert.deepEqual(R.FORMER, ['heart_me', 'gift_campaign:<widgetId>:<slot>']);
  assert.equal(R.validera(R.HEART_ME), R.HEART_ME);
  assert.ok(R.validera(R.giftCampaign('w1', 0)), 'en byggd kampanjnyckel måste också validera');
});
