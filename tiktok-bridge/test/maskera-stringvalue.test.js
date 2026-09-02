'use strict';
// `stringValue` lämnade visningsnamn i klartext i inspelningarna.
//
// UPPTÄCKT 2026-09-02 vid genomgång av natten innan. Inspelaren hashar `nickname`, `uniqueId` och
// `displayId` — men `stringValue` stod inte i någon fältmängd, så det passerade orört:
//
//   BARRAGE / guardian_shield_card_used
//     content.pieces[0].stringValue = "• PiiikaboOom ♛"     <- namnet, i klartext
//     user.nickname                 = "namn#e3b0c442"       <- hashat som det ska
//
// Filerna ar gitignorerade och ligger utanfor repot, men de ar avsedda att kunna DELAS for
// felsokning. Ett namn i klartext i en fil man skickar vidare ar precis det maskeringen finns for.
//
// MEN `stringValue` BÄR OCKSÅ DATA VI BEHÖVER. Samma fält, samma nivå i payloaden:
//
//   BARRAGE / fans_upgrade
//     content.pieces[0].stringValue = "32"                  <- NIVÅN, som feat/fanlevelup läser
//
// Att maskera hela fältet hade förstört exakt den mätning natten byggde på. Regeln är därför
// SMAL: ett rent tal (`^\d+$`) lämnas orört, allt annat maskeras. Nivåer, antal och räknare
// överlever; namn, texter och emoji-dekorerade smeknamn gör det inte.
//
// RÖTT NU: maskera() rör inte stringValue alls.
const test = require('node:test'), assert = require('node:assert/strict');
const I = require('../inspelare.js');

// ---- de verkliga strängarna ur inspelningen 2026-09-01 -------------------------------------------

test('ett visningsnamn i stringValue maskeras', () => {
  const ut = I.maskera({ stringValue: '• PiiikaboOom ♛' }, '');
  assert.notEqual(ut.stringValue, '• PiiikaboOom ♛', 'namnet står kvar i klartext');
  assert.match(ut.stringValue, /^namn#[0-9a-f]{8}$/, `oväntad form: ${ut.stringValue}`);
});

test('en nivå i stringValue lämnas orörd — annars förstörs mätningen', () => {
  // fans_upgrade bar nya nivan har. Maskeras den gar bade analysera-inspelning.js punkt 6 och
  // feat/fanlevelup-bryggan sonder, och en inspelning slutar kunna svara pa varfor en widget teg.
  for (const niva of ['32', '18', '10', '19', '11', '1', '50']) {
    assert.equal(I.maskera({ stringValue: niva }, '').stringValue, niva,
      `nivån ${niva} maskerades bort`);
  }
});

test('hela fans_upgrade-payloaden överlever maskeringen', () => {
  const ut = I.maskera({
    subType: 'fans_upgrade',
    content: { key: 'pm_mt_fan_live_upgrade_bullet', pieces: [{ type: 1, stringValue: '32' }] },
    user: { nickname: 'Lisa', displayId: 'lisa' }
  }, '');
  assert.equal(ut.content.pieces[0].stringValue, '32', 'nivån gick förlorad');
  assert.equal(ut.subType, 'fans_upgrade', 'subType maskerades — då går analysen inte att köra');
  assert.match(ut.user.nickname, /^namn#/, 'nickname maskerades inte längre');
});

test('hela guardian_shield-payloaden får inte längre bära namnet', () => {
  const ut = I.maskera({
    subType: 'guardian_shield_card_used',
    content: { key: 'ttlive_guardian_commonNotice_shieldActivated',
      pieces: [{ type: 1, stringValue: '• PiiikaboOom ♛' }] }
  }, '');
  assert.doesNotMatch(JSON.stringify(ut), /Piiikabo/i, 'namnet finns kvar någonstans i payloaden');
  assert.equal(ut.subType, 'guardian_shield_card_used');
});

// ---- gränsfallen ---------------------------------------------------------------------------------

test('bara RENA tal slipper undan', () => {
  const rent = ['0', '7', '32', '999999'];
  const inte = ['32 ', ' 32', '3.5', '-4', '1e3', '32a', 'Lv.32', '', 'abc', '♛'];
  for (const v of rent) {
    assert.equal(I.maskera({ stringValue: v }, '').stringValue, v, `${JSON.stringify(v)} maskerades`);
  }
  for (const v of inte) {
    assert.match(I.maskera({ stringValue: v }, '').stringValue, /^namn#/,
      `${JSON.stringify(v)} slapp igenom omaskerad`);
  }
});

test('hashen är stabil — samma namn ger samma maskering', () => {
  // Hela poangen med hashar i stallet for platshallare: samma person gar att folja genom filen.
  const a = I.maskera({ stringValue: '• PiiikaboOom ♛' }, '').stringValue;
  const b = I.maskera({ stringValue: '• PiiikaboOom ♛' }, '').stringValue;
  assert.equal(a, b);
  assert.notEqual(a, I.maskera({ stringValue: 'någon annan' }, '').stringValue);
});

test('samma sträng får samma hash oavsett vilket fält den kom i', () => {
  // Ett namn som star bade i nickname och i stringValue ska ga att koppla ihop — annars tappar
  // inspelningen just den korshanvisning maskeringen finns for att bevara.
  const iNamn = I.maskera({ nickname: 'PiiikaboOom' }, '').nickname;
  const iStr = I.maskera({ stringValue: 'PiiikaboOom' }, '').stringValue;
  assert.equal(iNamn, iStr, 'samma namn gav olika hash i olika fält');
});

// ---- inget annat får ha ändrats -------------------------------------------------------------------

test('övriga fältregler är orörda', () => {
  const ut = I.maskera({
    userId: 'u1', nickname: 'Lisa', comment: 'hej hopp',
    avatarThumb: 'https://cdn.example.com/a/b.jpg', level: 7, aktiv: true
  }, '');
  assert.match(ut.userId, /^id#/);
  assert.match(ut.nickname, /^namn#/);
  assert.match(ut.comment, /^<text \d+ tecken>$/);
  assert.match(ut.avatarThumb, /^https:\/\/cdn\.example\.com\//);
  assert.equal(ut.level, 7, 'tal ska aldrig maskeras');
  assert.equal(ut.aktiv, true);
});
