'use strict';
// CHATTAVATAR (chattavatar-modell.js + chattavatar.js). Paketets nio prov ("VYRA Chattavatar", Codex
// 2026-11-06) flyttade hit och skärpta efter granskningen:
//   * behörighet kommer från händelsens isModerator eller streamerns eget handtag — aldrig från texten
//     eller visningsnamnet
//   * kvällens historik vid omladdning och samma händelse två gånger spelar inget
//   * pratbubblan: högst två rader per del, hela texten visas, nästa kommando väntar tills den är klar
//   * danserna visar ingen text
//   * #stopp och en borttagen widget lämnar inga timrar som tänds senare
//   * kön: högst fem, automatiska hälsningar tar högst två platser
//   * texten skrivs som text, aldrig som HTML
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const M = require('../chattavatar-modell.js');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
test.after(closeAll);
const ROT = path.join(__dirname, '..');

// ---------------------------------------------------------------- modellen
test('tolka: kortkommandon, argument bara där de hör hemma, okänt är null', () => {
  assert.deepEqual(M.tolka('#d1'), { key: '#dansa', namn: '' });
  assert.deepEqual(M.tolka('#D3'), { key: '#dansa3', namn: '' });
  assert.deepEqual(M.tolka('#t'), { key: '#tap', namn: '' });
  assert.deepEqual(M.tolka('#g'), { key: '#glove', namn: '' });
  assert.deepEqual(M.tolka('#f'), { key: '#fira', namn: '' });
  assert.deepEqual(M.tolka('#f Vi nådde målet'), { key: '#fira', namn: 'Vi nådde målet' });
  assert.deepEqual(M.tolka('#säg  hej   allihop '), { key: '#säg', namn: 'hej allihop' });
  assert.deepEqual(M.tolka('#hej Anna'), { key: '#hej', namn: 'Anna' });
  assert.deepEqual(M.tolka('#stopp'), { key: '#stopp', namn: '' });
  assert.equal(M.tolka('#d1 extra'), null, 'en dans tar inga argument');
  assert.equal(M.tolka('#säg'), null, '#säg utan text');
  assert.equal(M.tolka('hej #d1'), null, 'kommandot måste stå först');
  assert.equal(M.tolka('#välkommen Anna'), null, 'automatiska kommandon går inte att skriva');
  assert.equal(M.tolka('#följare'), null);
  assert.equal(M.tolka('#okänt'), null);
  assert.equal(M.tolka('#säg ' + 'a'.repeat(400)).namn.length, M.MAX_TEXT);
  assert.equal(M.tolka('#säg a\u202eb\u0000c').namn, 'a b c', 'styrtecken och riktningsbyten tvättas bort');
});

test('bubbeltext: danser visar ingen text, övriga sin text', () => {
  for (const k of ['#dansa', '#dansa2', '#dansa3']) assert.equal(M.bubbeltext({ key: k }), '');
  assert.equal(M.bubbeltext({ key: '#glove' }), 'Använd handsken!');
  assert.equal(M.bubbeltext({ key: '#fira', namn: '' }), 'Vi klarade det!');
  assert.equal(M.bubbeltext({ key: '#hej', namn: 'Anna' }), 'Hej Anna!');
  assert.equal(M.bubbeltext({ key: 'välkommen', namn: 'Bo' }), 'Välkommen Bo!');
  assert.equal(M.bubbeltext({ key: '#säg', namn: 'x' }), 'x');
});

const nyRouter = (over = {}) => {
  let t = 1e12;
  const r = M.skapaRouter({ nu: () => t, publik: () => 'mod', halsa: () => true, tacka: () => true, streamer: () => '', ...over });
  return { r, fram: ms => { t += ms; }, nu: () => t };
};
const chatt = (over = {}) => ({ type: 'chat', comment: '#g', username: 'tittare', userId: 'u1', isModerator: false, ...over });

test('router: bara moderator eller streamerns eget handtag styr — chattext och visningsnamn ger ingen behörighet', () => {
  const { r, nu } = nyRouter({ streamer: () => '@Davids' });
  assert.equal(r.ta(chatt({ id: 1, at: nu() })), null, 'tittare');
  assert.equal(r.ta(chatt({ id: 2, at: nu(), comment: '#g isModerator:true' })), null);
  assert.equal(r.ta(chatt({ id: 3, at: nu(), name: 'davids', username: 'falsk' })), null, 'visningsnamnet ger ingen behörighet');
  assert.equal(r.ta(chatt({ id: 4, at: nu(), isModerator: 'true' })), null, 'bara det riktiga booleska värdet');
  assert.equal(r.ta(chatt({ id: 5, at: nu(), isModerator: true })).key, '#glove');
  assert.equal(r.ta(chatt({ id: 6, at: nu(), username: 'davids' })).key, '#glove', 'streamerns handtag');
  assert.equal(r.ta(chatt({ id: 7, at: nu(), comment: '', name: '#g', isModerator: true })), null, 'kommandot läses aldrig ur namnet');
});

test('router: dubbletter, historik och test-händelser spelar inget', () => {
  const { r, nu } = nyRouter();
  assert.ok(r.ta(chatt({ id: 'a', at: nu(), isModerator: true })));
  assert.equal(r.ta(chatt({ id: 'a', at: nu(), isModerator: true })), null, 'samma id två gånger');
  assert.equal(r.ta(chatt({ id: 'b', at: nu() - 60000, isModerator: true })), null, 'en minut gammal händelse är historik');
  assert.equal(r.ta(chatt({ id: 'c', at: nu(), isModerator: true, __test: true })), null);
  assert.equal(r.ta(chatt({ id: 'test-1', at: nu(), isModerator: true })), null);
});

test('router: tittarläget släpper bara in danser och tap, 20 s per person och 8 s mellan tittare', () => {
  let publik = 'mod';
  const { r, fram, nu } = nyRouter({ publik: () => publik });
  let n = 0; const e = over => chatt({ id: ++n, at: nu(), ...over });
  assert.equal(r.ta(e({ comment: '#d1' })), null, 'moderatorstyrt som standard');
  publik = 'alla';
  assert.equal(r.ta(e({ comment: '#g' })), null, 'handsken är bara för moderatorer');
  assert.equal(r.ta(e({ comment: '#säg hej' })), null);
  assert.equal(r.ta(e({ comment: '#d1' })).kalla, 'tittare');
  fram(1000); assert.equal(r.ta(e({ comment: '#d2', userId: 'u2', username: 'b' })), null, 'global väntetid 8 s');
  fram(8000); assert.ok(r.ta(e({ comment: '#d2', userId: 'u2', username: 'b' })));
  fram(9000); assert.equal(r.ta(e({ comment: '#d3' })), null, 'samma tittare inom 20 s');
  fram(12000); assert.ok(r.ta(e({ comment: '#d3' })));
  assert.ok(r.ta(e({ comment: '#g', isModerator: true })), 'moderatorn påverkas inte av tittarnas väntetid');
});

test('router: medlemshälsning och följartack', () => {
  let halsa = true;
  const { r, fram, nu } = nyRouter({ halsa: () => halsa });
  let n = 0; const e = over => ({ id: ++n, at: nu(), username: 'anna', name: 'Anna 🌸', ...over });
  assert.equal(r.ta(e({ type: 'member', fanClubLevel: 0 })), null, 'vanlig tittare som går in hälsas inte');
  const h = r.ta(e({ type: 'member', fanClubLevel: 3 }));
  assert.deepEqual([h.key, h.namn], ['välkommen', 'Anna 🌸'], 'visningsnamnet används i hälsningen');
  fram(5 * 60000); assert.equal(r.ta(e({ type: 'member', fanClubLevel: 3 })), null, 'samma person inom tio minuter');
  assert.ok(r.ta(e({ type: 'subscribe', username: 'bo', name: 'Bo' })));
  assert.ok(r.ta(e({ type: 'member', isSubscriber: true, username: 'cia', name: 'Cia' })));
  halsa = false; assert.equal(r.ta(e({ type: 'member', fanClubLevel: 9, username: 'dan', name: 'Dan' })), null, 'avstängt');
  assert.equal(r.ta(e({ type: 'follow' })).key, 'följare');
  fram(3000); assert.equal(r.ta(e({ type: 'follow', username: 'x' })), null, 'högst var tionde sekund');
  fram(10000); assert.ok(r.ta(e({ type: 'follow', username: 'y' })));
});

test('kön: högst fem, inga dubbletter, hälsningar tar högst två platser', () => {
  const ko = M.skapaKo(), t = 1e12;
  assert.equal(ko.lagg({ key: '#glove', namn: '' }, null, t), 'köad');
  assert.equal(ko.lagg({ key: '#glove', namn: '' }, null, t + 5000), 'dubblett', 'redan i kön');
  assert.equal(ko.lagg({ key: '#fira', namn: '' }, { key: '#fira', namn: '' }, t), 'dubblett', 'spelas redan');
  assert.equal(ko.lagg({ key: 'välkommen', namn: 'a' }, null, t), 'köad');
  assert.equal(ko.lagg({ key: 'välkommen', namn: 'b' }, null, t), 'full', 'hälsningar tränger inte undan moderatorer');
  for (const k of ['#dansa', '#dansa2', '#dansa3']) assert.equal(ko.lagg({ key: k, namn: '' }, null, t), 'köad');
  assert.equal(ko.lagg({ key: '#tap', namn: '' }, null, t), 'full');
  assert.equal(ko.antal, M.MAX_KO);
  ko.ta(); ko.ta();
  assert.equal(ko.lagg({ key: '#glove', namn: '' }, null, t + 1000), 'dubblett', 'samma kommando inom 2 s');
  assert.equal(ko.lagg({ key: '#glove', namn: '' }, null, t + 3000), 'köad');
});

test('sidor: högst två rader per del, hela texten, långa ord delas', () => {
  const matt = s => Array.from(s).length * 10;
  const text = 'Tack alla fantastiska människor som hjälper oss att fira tillsammans i kväll och varje kväll framåt!';
  const delar = M.sidor(text, matt, 144);
  assert.ok(delar.length > 2);
  for (const d of delar) { assert.ok(d.split('\n').length <= 2, d); for (const rad of d.split('\n')) assert.ok(matt(rad) <= 144, rad); }
  assert.equal(delar.join(' ').replace(/\s+/g, ' '), text);
  const lang = 'x'.repeat(40);
  assert.equal(M.sidor(lang, matt, 144).join('').replace(/\n/g, ''), lang, 'ett långt ord delas utan att något försvinner');
  assert.deepEqual(M.sidor('', matt, 144), []);
});

// ---------------------------------------------------------------- widgeten i studion och i OBS
function klocka(win) {
  let tid = 0, nr = 0; const timers = new Map();
  win.setTimeout = (fn, ms) => { timers.set(++nr, { fn, at: tid + (Number(ms) || 0) }); return nr; };
  win.clearTimeout = id => { timers.delete(id); };
  win.setInterval = (fn, ms) => { timers.set(++nr, { fn, at: tid + ms, upprepa: ms }); return nr; };
  win.clearInterval = win.clearTimeout;
  const fram = ms => {
    const slut = tid + ms;
    for (;;) {
      const n = [...timers].filter(([, t]) => t.at <= slut).sort((a, b) => a[1].at - b[1].at)[0];
      if (!n) break;
      tid = n[1].at; timers.delete(n[0]);
      if (n[1].upprepa) timers.set(n[0], { ...n[1], at: tid + n[1].upprepa });
      n[1].fn();
    }
    tid = slut;
  };
  return { fram, vantande: () => [...timers.values()].filter(t => !t.upprepa).length };
}
function rigg({ overlay = false } = {}) {
  const h = createDom({ url: 'https://vyralive.app/studio.html' + (overlay ? '?overlay=1' : '') });
  const spelade = [];
  Object.defineProperty(h.window.HTMLMediaElement.prototype, 'duration', { get() { return 8; }, configurable: true });
  h.window.HTMLMediaElement.prototype.load = function () {};
  h.window.HTMLMediaElement.prototype.pause = function () {};
  h.window.HTMLMediaElement.prototype.play = function () { spelade.push(this.dataset.klipp); return Promise.resolve(); };
  h.window.HTMLCanvasElement.prototype.getContext = () => null;
  const k = klocka(h.window);
  h.load('chattavatar-modell.js');
  h.load('chattavatar.js');
  const w = { ...h.window.VyraWidgets.create('catalog:vyrapaket:chattavatar'), id: 'ca1' };
  h.window.eval(`state.widgets.length=0;state.widgets.push(${JSON.stringify(w)});render()`);
  // I studion ritar render() bara i editorvyn; där ritar provet duken med samma renderarkedja.
  if (!overlay) h.paint([w]);
  const $ = sel => h.window.document.querySelector(sel);
  const skicka = e => h.window.dispatchEvent(new h.window.CustomEvent('vyra-live-event', { detail: { at: Date.now(), ...e } }));
  return { h, k, $, skicka, spelade, CA: h.window.VyraChattavatar, w: () => h.window.eval('state.widgets[0]') };
}
const mikro = () => new Promise(r => setImmediate(r));
let id = 0;
const mod = (comment, over = {}) => ({ type: 'chat', id: 'e' + (++id), comment, username: 'moddan', isModerator: true, ...over });

test('katalognyckeln bygger widgeten, alla klipp finns och den ritas i paketets mått', () => {
  const { $, CA, w } = rigg();
  assert.equal(w().type, 'templateChatAvatar');
  assert.equal(w().width, CA.STANDARD_B);
  assert.deepEqual([w().caPublik, w().caHalsa, w().caTacka], ['mod', true, true]);
  for (const f of [...Object.values(CA.KLIPP), CA.VILA]) assert.ok(fs.existsSync(path.join(ROT, f)), f + ' saknas');
  const rot = $('.vyra-chattavatar[data-id="ca1"]');
  assert.ok(rot, 'widgeten ritades');
  assert.equal(rot.style.height, Math.round(CA.STANDARD_B * CA.SCEN_H / CA.SCEN_B) + 'px');
  const css = fs.readFileSync(path.join(ROT, 'chattavatar.css'), 'utf8');
  assert.match(css, /\.ca-avatar\{[^}]*width:180px;height:265px/, 'avataren är 180 x 265 som i paketet');
  assert.match(css, /\.ca-bubbla\{[^}]*bottom:246px/, 'bubblan sitter ovanför huvudet');
  assert.doesNotMatch(css, /\.ca-bubbla\{[^}]*(?:left:auto|right:\d{3})/);
});

test('studion reagerar inte på riktig chatt — bara OBS', async () => {
  const { skicka, spelade, k } = rigg();
  skicka(mod('#g')); await mikro(); k.fram(100);
  assert.deepEqual(spelade, []);
});

test('OBS: moderatorns #g spelar handsken med text ovanför, tittaren gör ingenting', async () => {
  const { skicka, spelade, $, k } = rigg({ overlay: true });
  skicka(mod('#g', { isModerator: false, username: 'tittare' })); await mikro();
  assert.deepEqual(spelade, []);
  skicka(mod('#g')); await mikro();
  assert.deepEqual(spelade, ['glove']);
  assert.equal($('.ca-bubbla').textContent.replace(/\s+/g, ' '), 'Använd handsken!');
  assert.ok($('.ca-bubbla').classList.contains('ca-syns'));
  assert.ok($('.ca-klipp[data-klipp="glove"]').classList.contains('ca-pa'));
  assert.ok($('.ca-vila').classList.contains('ca-dold'));
  k.fram(4000); assert.equal($('.ca-bubbla').classList.contains('ca-syns'), false, 'bubblan tonas ut när texten visats');
  $('.ca-klipp[data-klipp="glove"]').onended(); k.fram(300);
  assert.equal($('.ca-vila').classList.contains('ca-dold'), false, 'tillbaka i vila');
  assert.equal(k.vantande(), 0, 'inga timrar kvar');
});

test('OBS: danserna visar aldrig text', async () => {
  const { skicka, $, spelade } = rigg({ overlay: true });
  skicka(mod('#d2')); await mikro();
  assert.deepEqual(spelade, ['dance2']);
  assert.equal($('.ca-bubbla').classList.contains('ca-syns'), false);
  assert.equal($('.ca-bubbla').textContent, '');
});

test('OBS: ett långt meddelande visas helt i delar om två rader, och nästa kommando väntar', async () => {
  const { skicka, $, k, spelade } = rigg({ overlay: true });
  const text = 'Tack alla fantastiska människor som hjälper oss att fira tillsammans i kväll!';
  skicka(mod('#säg ' + text)); skicka(mod('#g')); await mikro();
  const delar = [];
  for (let i = 0; i < 10 && $('.ca-bubbla').classList.contains('ca-syns'); i++) {
    delar.push($('.ca-bubbla').textContent);
    assert.ok($('.ca-bubbla').textContent.split('\n').length <= 2);
    assert.deepEqual(spelade, [], 'handsken väntar tills hela texten visats');
    k.fram(4000); await mikro();
  }
  assert.ok(delar.length >= 3);
  assert.equal(delar.join(' ').replace(/\s+/g, ' '), text);
  k.fram(300); await mikro();
  assert.deepEqual(spelade, ['glove'], 'sedan nästa i kön');
});

test('OBS: #stopp tömmer kön och lämnar inga timrar som tänds senare', async () => {
  const { skicka, $, k, spelade } = rigg({ overlay: true });
  skicka(mod('#säg ett ganska långt meddelande som behöver flera delar för att visas helt')); skicka(mod('#d1')); skicka(mod('#f'));
  await mikro();
  skicka(mod('#stopp')); await mikro();
  assert.equal($('.ca-bubbla').classList.contains('ca-syns'), false);
  assert.equal(k.vantande(), 0, 'alla timrar rensade');
  k.fram(60000); await mikro();
  assert.deepEqual(spelade, [], 'inget köat spelades efter stopp');
  assert.equal($('.ca-bubbla').classList.contains('ca-syns'), false);
});

test('OBS: kön tar högst fem, och en borttagen widget stoppas', async () => {
  const { h, skicka, k, CA } = rigg({ overlay: true });
  skicka(mod('#g')); await mikro();
  for (let i = 0; i < 8; i++) skicka(mod('#säg meddelande ' + i));
  await mikro();
  assert.equal(CA._live.get('ca1').ko.antal, 5);
  h.window.eval('state.widgets.length=0;render()');
  k.fram(1100);
  assert.equal(CA._live.has('ca1'), false);
  assert.equal(k.vantande(), 0);
});

test('OBS: en dold widget ritas inte och reagerar inte', async () => {
  const { h, skicka, spelade, $ } = rigg({ overlay: true });
  h.window.eval("state.widgets[0].hidden=true;render()");
  assert.equal($('.vyra-chattavatar'), null);
  skicka(mod('#g')); await mikro();
  assert.deepEqual(spelade, []);
});

test('OBS: namn och meddelanden skrivs som text, aldrig som HTML', async () => {
  const { skicka, $ } = rigg({ overlay: true });
  skicka(mod('#säg <img src=x onerror=alert(1)>')); await mikro();
  assert.equal($('.ca-bubbla img'), null);
  assert.match($('.ca-bubbla').textContent, /<img/);
  skicka({ type: 'member', id: 'm1', fanClubLevel: 2, username: 'x', name: '<b>Elak</b>' });
});

test('studion: ▶ Testa spelar i fliken; panelen och katalogen är på svenska', async () => {
  const { h, $, spelade } = rigg();
  h.window.eval("selected='ca1'");
  const panel = h.window.eval('props()');
  for (const ord of ['VEM FÅR STYRA', 'Bara du och dina moderatorer', 'Hälsa fanklubbsmedlemmar', 'TESTA', 'Eget meddelande']) assert.ok(panel.includes(ord), ord);
  h.window.VyraChattavatar.testa(h.window.eval('state.widgets[0]'), '#d1'); await mikro();
  assert.deepEqual(spelade, ['dance']);
  assert.ok($('.ca-status').textContent.startsWith('Dans 1'));
});

test('overlay-aktiveringen visar avataren från första bildrutan', () => {
  const kod = fs.readFileSync(path.join(ROT, 'overlay-aktivering.js'), 'utf8');
  assert.match(kod, /const UNDANTAG = new Set\(\[[^\]]*'templateChatAvatar'/);
});
