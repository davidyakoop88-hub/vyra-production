'use strict';
// SPELINNEHÅLLET (spelinnehall.js, 2026-11-23): frågorna till Quiz och orden till Ordjakten ligger i en egen fil, så att
// listorna kan växa utan att widgetkoden ändras. Proven vaktar tre saker:
//   * själva datan har rätt form — och INGET filtreras tyst bort vid inläsning (annars ser ett fel ut som en kortare lista),
//   * widgetarna klarar att filen saknas (nödlistan) och att en post är trasig (hoppas över, aldrig krasch i en sändning),
//   * filen laddas före båda widgetarna i media.js.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const lasa = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// En sida med valfritt innehåll: undefined = riktiga filen, null = ingen fil alls, ett objekt = eget innehåll.
function sida(innehall) {
  const dom = new JSDOM('<!doctype html><head></head><body></body>', { url: 'https://vyralive.app/studio.html?overlay=1', runScripts: 'dangerously' });
  const w = dom.window;
  w.eval('var wh=function(){return ""};var render=function(){};var props=function(){return ""};var bind=function(){};var selected=null;var view="editor";');
  w.state = { widgets: [] };
  w.setInterval = () => 0;
  if (innehall === undefined) w.eval(lasa('spelinnehall.js'));
  else if (innehall !== null) w.VyraSpelinnehall = innehall;
  w.eval(lasa('quiz.js'));
  w.eval(lasa('ordjakten.js'));
  return dom;
}
const ra = () => { const d = new JSDOM('', { runScripts: 'outside-only' }); d.window.eval(lasa('spelinnehall.js')); const v = d.window.VyraSpelinnehall; d.window.close(); return v; };
const fraga = (id, extra = {}) => [id, 'Vilken färg har himlen?', ['Grön', 'Blå', 'Röd'], 1, 'Allmän kunskap.'].map((x, i) => (extra[i] !== undefined ? extra[i] : x));

test('datan: versionen har formen ÅÅÅÅMMDD-n och varje paket har namn och frågor', () => {
  const v = ra();
  assert.match(v.version, /^\d{8}-\d+$/);
  for (const [k, p] of Object.entries(v.quiz.paket)) {
    assert.match(k, /^[a-z0-9]+$/, 'paketnyckel ' + k);
    assert.ok(p.namn && p.fragor.length >= 12, k + ': namn och minst tolv frågor');
  }
});

test('datan: inget filtreras bort vid inläsning — alla frågor och ord i filen hamnar i widgetarna', () => {
  const dom = sida(), v = ra();
  try {
    for (const [k, p] of Object.entries(v.quiz.paket)) {
      assert.equal(dom.window.VyraQuiz.PAKET[k].fragor.length, p.fragor.length, k + ': en fråga i filen är ogiltig eller har ett dubblett-id');
    }
    assert.equal(dom.window.VyraOrdjakten.ORD.length, 32 + v.ordjakt.ord.length, 'ett ord i filen är ogiltigt eller en dubblett');
  } finally { dom.window.close(); }
});

test('datan: id:n är unika över hela filen och startpaketen, rätt svar finns, och orden avslöjar sig inte', () => {
  const dom = sida(), id = new Set();
  try {
    for (const p of Object.values(dom.window.VyraQuiz.PAKET)) for (const f of p.fragor) { assert.ok(!id.has(f[0]), 'dubbelt id ' + f[0]); id.add(f[0]); }
    const ord = dom.window.VyraOrdjakten.ORD.map(o => o[0]);
    assert.equal(new Set(ord).size, ord.length, 'dubblett bland orden');
    assert.ok(dom.window.VyraQuiz.INNEHALLSVERSION && dom.window.VyraQuiz.INNEHALLSVERSION === dom.window.VyraOrdjakten.INNEHALLSVERSION);
  } finally { dom.window.close(); }
});

test('nödläge: utan innehållsfilen fungerar båda widgetarna med startpaketen och de 32 första orden', () => {
  const dom = sida(null);
  try {
    const Q = dom.window.VyraQuiz, O = dom.window.VyraOrdjakten;
    assert.deepEqual(Object.keys(Q.PAKET).sort(), ['allman', 'gaming', 'sport']);
    assert.equal(Q.INNEHALLSVERSION, '');
    assert.equal(O.ORD.length, 32);
    assert.equal(O.ORD[0][0], 'BANAN');
    assert.equal(O.runda({ id: 'x' }, 0).ord, 'BANAN');
    assert.equal(Q.fragor({ id: 'x', qzPaket: 'allmansvar' }, 0).length, 3, 'okänt paket faller tillbaka på Allmänbildning');
  } finally { dom.window.close(); }
});

test('ogiltiga poster hoppas över i stället för att krascha, och ett paket kan inte ersätta ett startpaket', () => {
  const dom = sida({
    version: '20990101-1',
    quiz: { paket: {
      bra: { namn: 'Bra', fragor: [
        fraga('x1'),
        fraga('x1', { 1: 'Samma id igen?' }),           // dubblett-id
        fraga('x2', { 3: 3 }),                           // rätt-index utanför 0–2
        fraga('x3', { 2: ['Blå', 'Blå', 'Röd'] }),       // två lika svar
        fraga('x4', { 2: ['Grön', 'Blå'] }),             // bara två svar
        fraga('g1'),                                      // krockar med ett startpaket-id
        'inte en fråga', null, [],
        fraga('x5')] },
      egna: { namn: 'Får inte', fragor: [fraga('x6')] },  // reserverat namn
      allman: { namn: 'Ersätter', fragor: [fraga('x7')] }, // startpaket
      'Stora Bokstäver': { namn: 'Fel nyckel', fragor: [fraga('x8')] },
      tomt: { namn: 'Tomt', fragor: [] },
      trasigt: 'text' } },
    ordjakt: { ord: [['STJÄRNHIMMEL', 'Syns en klar natt'], ['BANAN', 'dubblett av nödlistan'], ['KORT', 'Motsats till långt'],
      ['AB', 'för kort'], ['små', 'gemener'], ['RÄKNING1', 'siffra'], ['FELLEDTRÅD', 'Innehåller FELLEDTRÅD'], ['LÅNGTLÅNGTORDHÄR', 'för långt'], 'ord', null, ['TOMLEDTRÅD']] }
  });
  try {
    const P = dom.window.VyraQuiz.PAKET;
    assert.deepEqual(Object.keys(P).sort(), ['allman', 'bra', 'gaming', 'sport']);
    assert.deepEqual(Array.from(P.bra.fragor, f => f[0]), ['x1', 'x5']);
    assert.equal(P.allman.fragor[0][0], 'g1', 'startpaketet är oförändrat');
    assert.deepEqual(Array.from(dom.window.VyraOrdjakten.ORD.slice(32), o => o[0]), ['STJÄRNHIMMEL', 'KORT']);
  } finally { dom.window.close(); }
});

test('media.js laddar spelinnehall.js före både ordjakten.js och quiz.js', () => {
  const m = lasa('media.js'), i = m.indexOf("s.src='spelinnehall.js"), o = m.indexOf("s.src='ordjakten.js"), q = m.indexOf("s.src='quiz.js");
  assert.ok(i > 0 && o > 0 && q > 0, 'alla tre skripten ska laddas');
  assert.ok(i < o && i < q, 'innehållet måste ligga först i skriptsvansen');
  assert.match(m.slice(i, i + 200), /async=false/, 'async=false håller ordningen');
});
