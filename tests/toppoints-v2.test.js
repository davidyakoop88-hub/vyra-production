// TOP POINTS: FYRA DESIGNER SOM FAKTISKT SKILJER SIG.
//
// Uppmatt 2026-09-21 pa referensbilderna i tests/visual/referenser/: ranking_templateTopPoints_neon.png
// och ranking_templateTopPoints_podium.png ar bada en rak lista med samma guldbrickor. De har samma
// matt (300x406) och skiljer bara 0,68 procentenheter i fylld yta. Skalet stod i media.js: av de fyra
// katalognycklarna clean/center/podium/neon fanns bara EN gren i koden, `likeTheme==='center'`.
// Podium och neon foll darmed igenom till samma lista. Katalogen lovade fyra val och gav tva.
//
// Provet vaktar det som gick fel, inte att filerna finns: att de fyra designerna ger FYRA OLIKA
// utfall. Ett prov som bara laser DESIGNS-tabellen hade varit gront hela tiden som buggen levde.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

const js = fs.readFileSync('toppoints-v2.js', 'utf8');
const css = fs.readFileSync('toppoints-v2.css', 'utf8');
const html = fs.readFileSync('studio.html', 'utf8');

// Riggen kor modulen i jsdom med de globala studio.js annars ger den, precis som
// tests/topcoins-v2.test.js gor for Top Coins. Da lases det HTML renderaren FAKTISKT lamnar.
function rigg(url) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: url || 'http://localhost/studio.html', runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(`var wh=()=>'',props=()=>'',bind=()=>{},selected=null,view='editor',state={widgets:[]},
    save=()=>{},render=()=>{},toast=()=>{},liveWidget=id=>state.widgets.find(x=>x.id===id),
    VyraSafe={text:(v,f)=>(v==null||v==='')?f:String(v),src:(v,f)=>v||f,url:(v,f)=>v||f},
    VyraWidgets={create:()=>({id:'ny'})};`);
  w.eval(js);
  return w;
}
const widget = design => ({ id: 'tp1', type: 'templateTopPoints', topPointsDesign: design, likeCount: 5 });
const rita = (w, design) => w.VyraTopPoints.topPointsHtml(widget(design));

test('katalogens fyra nycklar har fyra designer, och ingen delar id', () => {
  const w = rigg();
  const ids = Object.keys(w.VyraTopPoints.designs);
  assert.deepEqual(ids.sort(), ['center', 'clean', 'neon', 'podium']);
  assert.equal(new Set(ids).size, 4);
});

// KARNPROVET. Det ar exakt det har paret som foll ihop i produktionen.
test('podium och neon ger OLIKA HTML — buggen var att de gav samma', () => {
  const w = rigg();
  const podium = rita(w, 'podium'), neon = rita(w, 'neon');
  assert.notEqual(podium, neon, 'podium och neon renderar identiskt igen');
  assert.match(podium, /toppoints-podium/);
  assert.match(neon, /toppoints-neon/);
  assert.doesNotMatch(podium, /toppoints-neon/);
  assert.doesNotMatch(neon, /toppoints-podium/);
});

test('alla fyra ger fyra olika utfall, inte bara paret', () => {
  const w = rigg();
  const utfall = ['clean', 'center', 'podium', 'neon'].map(d => rita(w, d));
  assert.equal(new Set(utfall).size, 4, 'tva eller fler designer renderar identiskt');
});

// En skillnad som bara ar ett klassnamn ar ingen skillnad for tittaren. Podium ska ha en
// podiumstruktur i DOM:en och neon en glodstruktur, inte samma rader med olika etikett.
test('skillnaden ar strukturell, inte bara ett klassnamn', () => {
  const w = rigg();
  const podium = rita(w, 'podium'), neon = rita(w, 'neon'), clean = rita(w, 'clean');
  assert.match(podium, /tp-podium-steg/, 'podium saknar podiumsteg i DOM:en');
  assert.doesNotMatch(clean, /tp-podium-steg/, 'listan har fatt podiumsteg');
  assert.match(neon, /tp-glod/, 'neon saknar glodlagret i DOM:en');
  assert.doesNotMatch(clean, /tp-glod/, 'listan har fatt neonglod');
});

test('CSS ger varje design egna regler — annars ser de likadana ut anda', () => {
  for (const d of ['clean', 'center', 'podium', 'neon']) {
    assert.match(css, new RegExp('toppoints-' + d), 'ingen CSS for ' + d);
  }
  assert.match(css, /tp-podium-steg/);
  assert.match(css, /tp-glod/);
  // Nolltoleransvakten fotograferar stillastaende bilder. En design som animerar i evighet gar
  // inte att jamfora, sa rorelsen maste ga att stanga av pa samma satt som Top Coins gor.
  assert.match(css, /toppoints-paused/);
  assert.match(css, /prefers-reduced-motion/);
});

test('okant design-id faller tillbaka pa listan i stallet for att kasta', () => {
  const w = rigg();
  assert.equal(w.VyraTopPoints.designId({ topPointsDesign: 'finns-inte' }), 'clean');
  assert.equal(w.VyraTopPoints.designId({ topPointsDesign: 'neon' }), 'neon');
  assert.equal(w.VyraTopPoints.designId({ skin: 'podium' }), 'podium');
});

// KATALOGNYCKLARNA FAR INTE BYTA NAMN. Byter de namn blir de fyra referensbilderna
// foraldralosa, precis som de 70 i #489, och docs/katalogkarta.md maste genereras om.
test('katalognycklarna ar oforandrade', () => {
  assert.match(js, /catalog:ranking:templateTopPoints:/);
  for (const d of ['clean', 'center', 'podium', 'neon']) {
    assert.ok(js.includes("'" + d + "'") || js.includes('"' + d + '"'), 'nyckeln ' + d + ' saknas');
  }
  // Modulen tar over media.js generiska knappar, annars star tva uppsattningar i katalogen.
  assert.match(js, /querySelectorAll\('\[data-ranking="templateTopPoints"\]'\)/);
});

// OVERLAY-NOLLFORMEN, samma kontrakt som Top Coins bevisade 2026-09-20.
// live-leaderboard.js nollar varje .toplike-row i overlay utan livedata: strong -> '', small -> '',
// em -> forsta ordet + ' 0'. Ritar renderaren redan den formen blir skrivningen en no-op, och den
// visuella vakten far samma bild oavsett vilken sida om tick:et fotot hamnar pa.
test('overlay ritar leaderboardens nollform, editorn behaller demodatan', () => {
  const ov = rigg('http://localhost/studio.html?overlay=1');
  const box = ov.document.createElement('div');
  box.innerHTML = ov.VyraTopPoints.topPointsHtml({ id: 'tp1', type: 'templateTopPoints', likeCount: 3, dataName: 'MAYA', dataValue: 1500 });
  for (const rad of box.querySelectorAll('.toplike-row')) {
    assert.equal(rad.querySelector('strong').textContent, '', 'pahittad person i overlay');
    const em = rad.querySelector('em');
    const ikon = em.textContent.trim().split(' ')[0];
    assert.equal(em.textContent, ikon + ' 0', `nollformen matchar inte: "${em.textContent}"`);
  }
  const ed = rigg();
  const box2 = ed.document.createElement('div');
  box2.innerHTML = ed.VyraTopPoints.topPointsHtml({ id: 'tp1', type: 'templateTopPoints', likeCount: 3, dataName: 'MAYA', dataValue: 1500 });
  assert.notEqual(box2.querySelector('.toplike-row strong').textContent, '', 'editorn tappade demodatan');
});

test('antalet rader foljer likeCount, och podium klarar farre an tre', () => {
  const w = rigg();
  const box = w.document.createElement('div');
  box.innerHTML = w.VyraTopPoints.topPointsHtml({ id: 'a', type: 'templateTopPoints', topPointsDesign: 'clean', likeCount: 7 });
  assert.equal(box.querySelectorAll('.toplike-row').length, 7);
  box.innerHTML = w.VyraTopPoints.topPointsHtml({ id: 'b', type: 'templateTopPoints', topPointsDesign: 'podium', likeCount: 2 });
  assert.equal(box.querySelectorAll('.toplike-row').length, 2, 'podium kraschar eller fyller pa under tre rader');
});

test('modulen laddas efter media.js med egen cachebust', () => {
  assert.match(html, /toppoints-v2\.css\?v=/);
  assert.match(html, /toppoints-v2\.js\?v=/);
  const media = html.indexOf('media.js?v=');
  assert.ok(media > -1 && media < html.indexOf('toppoints-v2.js?v='),
    'toppoints-v2.js maste laddas EFTER media.js — den lindar wh/props/bind som media.js definierar');
});
