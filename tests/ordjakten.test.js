'use strict';
// ORDJAKTEN (ordjakten.js, David 2026-11-07). Proven vaktar kontraktet:
//   * blandningen är bestämd av ordet och rundan — två OBS-källor visar samma bokstäver,
//   * den första rätta chattraden vinner, en gång per ord, poängen nycklas på userId,
//   * bara moderatorer kan byta ord eller visa lösningen,
//   * streamerns egna ord tolkas säkert, och ordlistan börjar om när den tar slut,
//   * läget överlever en omladdning, och ingen text blir HTML.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const F = require(path.join(ROOT, 'widget-factory.js'));

function sida(lagring) {
  const dom = new JSDOM('<!doctype html><head></head><body></body>', { url: 'https://vyralive.app/studio.html?overlay=1', runScripts: 'dangerously' });
  const w = dom.window;
  if (lagring) for (const [k, v] of Object.entries(lagring)) w.localStorage.setItem(k, v);
  w.eval('var wh=function(){return ""};var render=function(){};var props=function(){return ""};var bind=function(){};var selected=null;var view="editor";');
  w.state = { widgets: [] };
  w.setTimeout = () => 0;
  w.eval(fs.readFileSync(path.join(ROOT, 'ordjakten.js'), 'utf8'));
  return dom;
}
let nr = 0;
const ny = (extra = {}) => Object.assign(F.create('catalog:vyrapaket:ordjakten'), { id: 'oj-' + (++nr) + '-' + Date.now() }, extra);
const chatt = (comment, extra = {}) => Object.assign({ type: 'chat', userId: 'u1', username: 'anna', nickname: 'Anna', comment, at: Date.now() }, extra);

test('fabriken: ett kort inom duken, inga gåvokrav', () => {
  const w = F.create('catalog:vyrapaket:ordjakten');
  assert.equal(w.type, 'templateWordHunt');
  assert.equal(w.ojPoang, 100);
  assert.ok(w.x >= 0 && w.x + w.width <= 432);
});

test('blandningen är bestämd av ordet och rundan, och aldrig ordet självt', () => {
  const a = sida(), b = sida();
  try {
    for (let r = 0; r < 20; r++) {
      const x = a.window.VyraOrdjakten.blanda('BANAN', r), y = b.window.VyraOrdjakten.blanda('BANAN', r);
      assert.equal(x, y, 'två källor visade olika bokstäver');
      assert.notEqual(x, 'BANAN');
      assert.deepEqual(Array.from(x).sort(), Array.from('BANAN').sort());
    }
    assert.notEqual(a.window.VyraOrdjakten.blanda('VINTER', 1), a.window.VyraOrdjakten.blanda('VINTER', 2));
  } finally { a.window.close(); b.window.close(); }
});

test('första rätta svaret vinner, en gång per ord; versaler, mellanslag och utropstecken spelar ingen roll', () => {
  const dom = sida(), O = dom.window.VyraOrdjakten, w = ny();
  try {
    dom.window.state.widgets.push(w);
    const ord = O.runda(w, 0).ord;
    assert.equal(O.hantera(w, chatt('fel')), null);
    assert.equal(O.hantera(w, chatt('  !' + ord.toLowerCase() + ' ')), 'vinst');
    assert.equal(O.hantera(w, chatt(ord, { userId: 'u2', nickname: 'Leo' })), null, 'två vinnare på samma ord');
    const s = O.lage(w);
    assert.equal(s.lost.namn, 'Anna');
    assert.equal(s.poang.u1.p, 100);
    assert.equal(s.poang.u2, undefined);
  } finally { dom.window.close(); }
});

test('bara moderatorer byter ord eller visar lösningen', () => {
  const dom = sida(), O = dom.window.VyraOrdjakten, w = ny();
  try {
    dom.window.state.widgets.push(w);
    assert.equal(O.hantera(w, chatt('!nästa')), null);
    assert.equal(O.lage(w).nr, 0);
    assert.equal(O.hantera(w, chatt('!nästa', { isModerator: true })), 'nasta');
    assert.equal(O.lage(w).nr, 1);
    assert.equal(O.hantera(w, chatt('!lösning', { isModerator: true })), 'losning');
    assert.equal(O.lage(w).lost.sjalv, true);
    assert.equal(O.hantera(w, chatt(O.runda(w, 1).ord)), null, 'inga poäng efter visad lösning');
  } finally { dom.window.close(); }
});

test('egna ord: säker tolkning, bara egna om valt, listan börjar om', () => {
  const dom = sida(), O = dom.window.VyraOrdjakten;
  try {
    // JSON: arrayerna kommer från jsdoms fönster och har en annan prototyp än nodens.
    assert.equal(JSON.stringify(O.egnaOrd('banan; En frukt\n<script>; x\nÄPPLE;Rött\n;\nA;för kort')), JSON.stringify([['BANAN', 'En frukt'], ['ÄPPLE', 'Rött']]));
    const w = ny({ ojOrd: 'KATT; Ett husdjur\nHUND; Skäller', ojBaraEgna: true });
    assert.equal(O.ordlista(w).length, 2);
    assert.equal(O.runda(w, 2).ord, 'KATT', 'listan ska börja om');
    assert.ok(O.ordlista(ny({ ojOrd: 'KATT; x' })).length > 2, 'utan "bara egna" läggs de inbyggda till');
  } finally { dom.window.close(); }
});

test('läget överlever en omladdning', () => {
  const w = ny();
  const dom = sida({ ['vyra-ordjakten-' + w.id]: JSON.stringify({ nr: 4, lost: null, poang: { u9: { namn: 'Sara', p: 300 } } }) });
  try {
    dom.window.state.widgets.push(w);
    const s = dom.window.VyraOrdjakten.lage(w);
    assert.equal(s.nr, 4);
    assert.equal(s.poang.u9.p, 300);
  } finally { dom.window.close(); }
});

test('renderingen: bokstavsbrickor, topplista, och namn blir aldrig HTML', () => {
  const dom = sida(), O = dom.window.VyraOrdjakten, w = ny();
  try {
    dom.window.state.widgets.push(w);
    O.hantera(w, chatt(O.runda(w, 0).ord, { nickname: '<img src=x onerror=alert(1)>' }));
    const box = dom.window.document.createElement('div'); box.innerHTML = dom.window.wh(w);
    assert.equal(box.querySelector('[onerror]'), null);
    assert.equal(box.querySelectorAll('.oj-bokstav').length, Array.from(O.runda(w, 0).ord).length);
    assert.ok(box.querySelector('.vyra-ordjakten.oj-lost'));
    assert.equal(box.querySelectorAll('.oj-topp li').length, 1);
  } finally { dom.window.close(); }
});

test('chattrader via live-strömmen: gamla rader räknas inte, dolda widgetar räknas inte', () => {
  const dom = sida(), O = dom.window.VyraOrdjakten, w = ny(), dold = ny({ hidden: true });
  try {
    dom.window.state.widgets.push(w, dold);
    const skicka = e => dom.window.dispatchEvent(new dom.window.CustomEvent('vyra-live-event', { detail: e }));
    skicka(chatt(O.runda(w, 0).ord, { at: Date.now() - 60000 }));
    assert.equal(O.lage(w).lost, null, 'en gammal chattrad vann');
    skicka(chatt(O.runda(w, 0).ord));
    assert.equal(O.lage(w).lost.namn, 'Anna');
    assert.equal(O.lage(dold).lost, null);
  } finally { dom.window.close(); }
});
