'use strict';
// QUIZ (quiz.js, David 2026-11-07). Proven vaktar kontraktet:
//   * gratis anmälan — alla som svarar är med, ingen gåva krävs (prototypens gåvokrav är medvetet inte byggt),
//   * bara en moderator startar en omgång, och den kan inte startas om mitt i,
//   * tidslinjen räknas från startens tidsstämpel och svar bedöms på sin egen tid — samma resultat i varje källa,
//   * ett svar per tittare och fråga (det första räknas), poängen på userId,
//   * svarsalternativens ordning är bestämd av ett frö, egna frågor tolkas säkert, och ingen text blir HTML.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const F = require(path.join(ROOT, 'widget-factory.js'));

function sida() {
  const dom = new JSDOM('<!doctype html><head></head><body></body>', { url: 'https://vyralive.app/studio.html?overlay=1', runScripts: 'dangerously' });
  const w = dom.window;
  w.eval('var wh=function(){return ""};var render=function(){};var props=function(){return ""};var bind=function(){};var selected=null;var view="editor";');
  w.state = { widgets: [] };
  w.setInterval = () => 0;
  w.eval(fs.readFileSync(path.join(ROOT, 'quiz.js'), 'utf8'));
  return dom;
}
let nr = 0;
const ny = (extra = {}) => Object.assign(F.create('catalog:vyrapaket:quiz:fragerad'), { id: 'qz-' + (++nr) + '-' + Date.now() }, extra);
const T0 = 1_800_000_000_000;
const chatt = (comment, at, extra = {}) => Object.assign({ type: 'chat', userId: 'u1', nickname: 'Anna', comment, at }, extra);

test('fabriken: tre designer, allmänbildning, inga gåvofält', () => {
  for (const d of ['fragerad', 'spelkort', 'quizshow']) {
    const w = F.create('catalog:vyrapaket:quiz:' + d);
    assert.equal(w.type, 'templateQuiz');
    assert.equal(w.qzDesign, d);
    assert.ok(w.x >= 0 && w.x + w.width <= 432);
    assert.ok(!Object.keys(w).some(k => /gift|gava|gåva/i.test(k)), 'gåvokrav får inte finnas');
  }
});

test('tidslinjen: fråga (20 s), rättning (6 s), nästa fråga, slut', () => {
  const dom = sida(), Q = dom.window.VyraQuiz, w = ny();
  try {
    assert.equal(Q.fas(w, 0, T0).fas, 'vila');
    assert.deepEqual({ ...Q.fas(w, T0, T0 + 1000) }, { fas: 'fraga', i: 0, kvar: 19 });
    assert.equal(Q.fas(w, T0, T0 + 21000).fas, 'svar');
    assert.equal(Q.fas(w, T0, T0 + 27000).i, 1);
    assert.equal(Q.fas(w, T0, T0 + 3 * 26000 + 1).fas, 'slut');
  } finally { dom.window.close(); }
});

test('bara en moderator startar, och inte mitt i en omgång', () => {
  const dom = sida(), Q = dom.window.VyraQuiz, w = ny();
  try {
    assert.equal(Q.hantera(w, chatt('!quiz', T0)), null);
    assert.equal(Q.hantera(w, chatt('!quiz', T0, { isModerator: true })), 'start');
    assert.equal(Q.hantera(w, chatt('!quiz', T0 + 5000, { isModerator: true })), null, 'omstart mitt i en fråga');
  } finally { dom.window.close(); }
});

test('ett svar per tittare och fråga; svar efter fönstret räknas inte; poängen på userId', () => {
  const dom = sida(), Q = dom.window.VyraQuiz, w = ny();
  try {
    Q.hantera(w, chatt('!quiz', T0, { isModerator: true }));
    const alt = Q.alternativ(Q.fragor(w)[0], T0), ratt = 'ABC'[alt.findIndex(a => a.ratt)], fel = 'ABC'[alt.findIndex(a => !a.ratt)];
    assert.equal(Q.hantera(w, chatt(ratt, T0 + 1000)), 'svar');
    assert.equal(Q.hantera(w, chatt(fel, T0 + 2000)), 'redan', 'ett andra svar räknades');
    assert.equal(Q.hantera(w, chatt(fel, T0 + 3000, { userId: 'u2', nickname: 'Leo' })), 'svar');
    assert.equal(Q.hantera(w, chatt(ratt, T0 + 21000, { userId: 'u3', nickname: 'Sara' })), null, 'svar under rättningen räknades');
    const p = Q.poang(w, T0 + 22000);
    assert.equal(p.length, 1);
    assert.equal(p[0].uid, 'u1');
    assert.equal(p[0].p, 100);
    assert.equal(JSON.stringify(Q.poang(w, T0 + 10000)), '[]', 'poäng före rättningen');
  } finally { dom.window.close(); }
});

test('svarsordningen är bestämd av frö — två källor visar samma bokstäver, och rätt svar finns alltid', () => {
  const a = sida(), b = sida();
  try {
    const fr = a.window.VyraQuiz.PAKET.allman.fragor[0];
    for (const start of [1, T0, T0 + 7]) {
      const x = a.window.VyraQuiz.alternativ(fr, start).map(o => o.text).join(), y = b.window.VyraQuiz.alternativ(fr, start).map(o => o.text).join();
      assert.equal(x, y);
      assert.equal(a.window.VyraQuiz.alternativ(fr, start).filter(o => o.ratt).length, 1);
    }
  } finally { a.window.close(); b.window.close(); }
});

test('egna frågor: säker tolkning, och "egna" använder bara dem', () => {
  const dom = sida(), Q = dom.window.VyraQuiz;
  try {
    const e = Q.egnaFragor('Vilken färg har himlen? | Grön | Blå | Röd | B\nTrasig rad | A | B\nX | 1 | 2 | 3 | D');
    assert.equal(e.length, 1);
    assert.equal(e[0][1], 'Vilken färg har himlen?');
    assert.equal(e[0][3], 1);
    assert.equal(Q.fragor(ny({ qzPaket: 'egna', qzEgna: 'F? | a | b | c | C' })).length, 1);
    assert.equal(Q.fragor(ny({ qzPaket: 'sport' }))[0][0], 's1');
  } finally { dom.window.close(); }
});

test('renderingen: dold i OBS i vila, rättning markerar rätt svar, text blir aldrig HTML', () => {
  const dom = sida(), Q = dom.window.VyraQuiz, w = ny({ qzPaket: 'egna', qzEgna: '<img src=x onerror=alert(1)> | <b>a</b> | b | c | A' });
  try {
    dom.window.state.widgets.push(w);
    let box = dom.window.document.createElement('div'); box.innerHTML = dom.window.wh(w);
    assert.ok(box.querySelector('.vyra-quiz.qz-dold'), 'i vila ska quizet vara dolt i OBS');
    Q.starta(w, Date.now() - 21000);
    box = dom.window.document.createElement('div'); box.innerHTML = dom.window.wh(w);
    assert.equal(box.querySelector('[onerror]'), null);
    assert.equal(box.querySelector('.qz-rad b b'), null);
    assert.equal(box.querySelectorAll('.qz-rad.qz-ratt').length, 1);
    assert.match(box.querySelector('.qz-klocka').textContent, /RÄTTNING/);
  } finally { dom.window.close(); }
});

test('CSS: dold i vila i OBS, ingen kortram från studion', () => {
  const css = fs.readFileSync(path.join(ROOT, 'quiz.css'), 'utf8');
  assert.match(css, /\.overlay-output \.vyra-quiz\.qz-dold\{visibility:hidden\}/);
  assert.match(css, /\.widget\.vyra-quiz\{background:transparent!important/);
  assert.match(fs.readFileSync(path.join(ROOT, 'overlay-aktivering.js'), 'utf8'), /const UNDANTAG = new Set\(\[[^\]]*'templateQuiz'/);
});
