'use strict';
// Last-X talar svenska i bade studion och OBS (fynd 2026-10-20).
//
// Sedan PR 5 visar studions Last-X (last-x-alerts.js) rubrikerna "SENASTE GAVOGIVARE" osv., men
// OBS-widgeten public/widgets/last-x-alerts.html hade kvar "LAST GIFTER" och standardtexterna
// "SENT ... LIKES", "SHARED THE LIVE" och "JOINED THE CLUB" - och studions egna standardmeddelanden
// var fortfarande engelska. Bada filerna sager i sina kommentarer att de ska tala samma sprak; det
// har provet haller dem till det genom att kora TYPES-tabellerna ur bada filerna och jamfora.
//
// Sparade egna texter i anvandarens widgets (followMessage, lastXMessage, followLabel) ror vi inte -
// det ar bara standardtexterna som byttes. Faltnamnen ar oforandrade.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const OBS = fs.readFileSync(path.join(ROOT, 'public/widgets/last-x-alerts.html'), 'utf8');
const STUDIO = fs.readFileSync(path.join(ROOT, 'last-x-alerts.js'), 'utf8');

function obsTypes() {
  const start = OBS.indexOf('const giftLine=');
  const slut = OBS.indexOf('const params=VyraWidget.getParams()');
  assert.ok(start > 0 && slut > start, 'hittade inte TYPES i OBS-widgeten');
  return new Function(OBS.slice(start, slut) + '\nreturn TYPES;')();
}

function studioTypes() {
  const start = STUDIO.indexOf('const giftLine =');
  const slut = STUDIO.indexOf('const TYPE_KEYS');
  assert.ok(start > 0 && slut > start, 'hittade inte TYPES i last-x-alerts.js');
  return new Function(STUDIO.slice(start, slut) + '\nreturn TYPES;')();
}

const ENGELSKA = /\b(LAST|SENT|SHARED|JOINED|FOLLOWED|GIFTER|SHARER|SUBSCRIBER|DIAMONDS|THE LIVE|THE CLUB)\b/;
const GAVA = { type: 'gift', username: 'Kim', giftName: 'Rose', count: 3, diamonds: 15 };
const LIKE = { type: 'like', username: 'Mia', count: 20 };

test('OBS-widgetens rubriker ar desamma som studions', () => {
  const obs = obsTypes(), studio = studioTypes();
  for (const typ of Object.keys(obs)) {
    assert.ok(studio[typ], `${typ} finns i OBS men inte i studion`);
    assert.equal(obs[typ].label, studio[typ].label, `rubriken for ${typ} skiljer sig mellan OBS och studion`);
    assert.doesNotMatch(obs[typ].label, ENGELSKA, `engelsk rubrik i OBS-widgeten: ${obs[typ].label}`);
  }
  assert.match(OBS, /<div id="label">SENASTE GÅVOGIVARE<\/div>/, 'vilorubriken i OBS-widgetens markup ar inte svensk');
  assert.doesNotMatch(OBS, />LAST [A-Z]+</, 'en engelsk rubrik ligger kvar i markupen');
});

test('OBS-widgetens standardmeddelanden ar svenska och desamma som studions', () => {
  const obs = obsTypes(), studio = studioTypes();
  const prov = { gifter: GAVA, liker: LIKE, sharer: { type: 'share' }, subscriber: { type: 'subscribe' } };
  for (const [typ, e] of Object.entries(prov)) {
    const o = obs[typ].message(e), s = studio[typ].message(e);
    assert.doesNotMatch(o, ENGELSKA, `engelskt standardmeddelande i OBS (${typ}): ${o}`);
    assert.equal(o, s, `${typ}: OBS sager "${o}", studion "${s}"`);
    const rader = obs[typ].lines(e);
    assert.doesNotMatch(`${rader.value} ${rader.detail}`, ENGELSKA, `engelsk rad i artwork-skalet (${typ})`);
  }
  assert.equal(obs.gifter.message(GAVA), 'SKICKADE ROSE ×3');
  assert.equal(obs.gifter.lines(GAVA).value, '15 DIAMANTER');
  assert.equal(obs.liker.message(LIKE), 'SKICKADE 20 LIKES');
  assert.match(obs.gifter.message({ type: 'gift', count: 1 }), /^SKICKADE GÅVA ×1$/, 'reservnamnet for en gava utan namn');
});

test('studions standardtexter ar svenska', () => {
  const studio = studioTypes();
  for (const [typ, cfg] of Object.entries(studio)) {
    assert.doesNotMatch(cfg.label, ENGELSKA, `${typ}: rubrik`);
    assert.doesNotMatch(cfg.defaultMsg, ENGELSKA, `${typ}: standardmeddelandet "${cfg.defaultMsg}"`);
    const ut = cfg.message(typ === 'gifter' ? GAVA : typ === 'liker' ? LIKE : { type: typ });
    assert.doesNotMatch(String(ut), ENGELSKA, `${typ}: meddelandet for en riktig handelse "${ut}"`);
  }
  assert.equal(studio.follower.message({ type: 'follow' }), 'BÖRJADE FÖLJA');
});

test('faltnamnen ar oforandrade - sparade egna texter fortsatter galla', () => {
  for (const falt of ['followMessage', 'followLabel', 'lastXMessage', 'lastXLabel', 'followName']) {
    assert.ok(STUDIO.includes(falt), `${falt} forsvann ur last-x-alerts.js`);
  }
});
