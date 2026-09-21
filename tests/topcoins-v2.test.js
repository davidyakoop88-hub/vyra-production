const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const js = fs.readFileSync('topcoins-v2.js', 'utf8');
const css = fs.readFileSync('topcoins-v2.css', 'utf8');
const html = fs.readFileSync('studio.html', 'utf8');

test('Top Coins ships only the approved Halo and Signal Orbit designs', () => {
  assert.match(js, /halo:\s*\{\s*label: 'Halo'/);
  assert.match(js, /'signal-orbit':\s*\{\s*label: 'Signal Orbit'/);
  assert.match(js, /querySelectorAll\('\[data-ranking="templateTopCoins"\]'\).*\.remove\(\)/);
  assert.match(js, /data-catalog-key="catalog:ranking:templateTopCoins:\$\{id\}"/);
});

test('Top Coins is a single leader with no legacy rank badge', () => {
  assert.match(js, /likeCount: 1/);
  assert.match(js, /UTAN PLACERINGSTAL/);
  assert.doesNotMatch(js, /<b>[1-9]<\/b>/);
  assert.match(js, /toplike-row rank-1/);
});

test('both approved designs are transparent by default and animated independently', () => {
  assert.match(js, /showBackground: false/);
  assert.match(css, /background:none!important/);
  assert.match(css, /topcoins-halo .*animation:tc-spin/);
  assert.match(css, /tc-o1.*animation:tc-spin/);
  assert.match(css, /topcoins-paused/);
});

test('Top Coins assets are loaded after media with a fresh shared cache version', () => {
  assert.match(html, /topcoins-v2\.css\?v=20260920-1/);
  // Laddordningen mäts över de riktiga <script src>-taggarna i dokumentordning. media.js:s
  // ?v= låses inte: den bumpas i varje PR som rör media.js, och en låst sträng som inte
  // längre fanns gav indexOf -1 och en vakt som var grön oavsett ordning.
  const scriptSrc = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1]);
  const mediaIndex = scriptSrc.findIndex((src) => src.startsWith('media.js?v='));
  const topcoinsIndex = scriptSrc.indexOf('topcoins-v2.js?v=20260920-3');
  const scripts = () => scriptSrc.map((s, i) => `[${i}]${s}`).join(' ');
  assert.ok(mediaIndex !== -1 && topcoinsIndex !== -1,
    `Expected both media.js and topcoins-v2.js to be present. mediaIndex=${mediaIndex}, topcoinsIndex=${topcoinsIndex}. Scripts: ${scripts()}`);
  assert.ok(mediaIndex < topcoinsIndex,
    `Expected media.js to load before topcoins-v2.js. mediaIndex=${mediaIndex}, topcoinsIndex=${topcoinsIndex}. Scripts: ${scripts()}`);
});

// RIKTIG RENDERING, INTE KALLKODSREGEX. Riggen kor topcoins-v2.js i jsdom med de globala som
// studio.js annars ger den, och laser tillbaka det HTML renderaren faktiskt lamnar.
const { JSDOM } = require('jsdom');
function rigg(url) {
  const dom = new JSDOM('<!doctype html><body></body>', { url, runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(`var wh=()=>'',props=()=>'',bind=()=>{},selected=null,view='editor',state={widgets:[]},
    save=()=>{},render=()=>{},toast=()=>{},liveWidget=id=>state.widgets.find(x=>x.id===id),
    VyraSafe={text:(v,f)=>(v==null||v==='')?f:String(v),src:(v,f)=>v||f},
    VyraWidgets={create:()=>({id:'ny'})};`);
  w.eval(js);
  return w;
}
function rad(w, widget) {
  const box = w.document.createElement('div');
  box.innerHTML = w.VyraTopCoins.topCoinsHtml(widget);
  return { strong: box.querySelector('.toplike-row strong'), em: box.querySelector('.toplike-row em') };
}

test('overlay: Top Coins ritar leaderboardens nollform sjalv, editorn behaller demodatan', () => {
  // createTopCoins bakar in dataName 'MAYA' och dataValue 44999 i state - overlayen far anda inte
  // visa dem. Uppmatt 2026-09-20 (halo foll 2 av 3 i den visuella riggen): live-leaderboard.js
  // skrev om raden en sekund efter render, och bilden berodde pa vilken sida om tick:et fotot tog.
  const widget = { id: 'tc1', type: 'templateTopCoins', dataName: 'MAYA', dataValue: 44999 };
  const ov = rad(rigg('http://localhost/studio.html?overlay=1'), widget);
  assert.equal(ov.strong.textContent, '', 'ingen pahittad person i overlay');
  // Exakt det live-leaderboard.js skriver i overlay utan livedata: forsta ordet + ' 0'. Ar
  // texten redan den blir skrivningen en no-op, och <i>-ikonen overlever.
  const ikon = ov.em.textContent.trim().split(' ')[0];
  assert.equal(ikon, 'V', `ikonen ska vara forsta ordet, texten ar "${ov.em.textContent}"`);
  assert.equal(ov.em.textContent, ikon + ' 0');
  assert.ok(ov.em.querySelector('i'), 'myntikonen ar kvar som <i>');

  const ed = rad(rigg('http://localhost/studio.html'), widget);
  assert.equal(ed.strong.textContent, 'MAYA');
  assert.equal(ed.em.textContent.trim().split(' ')[0], 'V',
    `mellanslag efter ikonen, annars blir ett livevarde "V44 999 12 300": "${ed.em.textContent}"`);
  assert.match(ed.em.textContent, /44.999 COINS$/);
});
