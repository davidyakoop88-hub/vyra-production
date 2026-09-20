const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const js = fs.readFileSync('approved-rankings.js', 'utf8');
const css = fs.readFileSync('approved-rankings.css', 'utf8');
const html = fs.readFileSync('studio.html', 'utf8');
const topLike = fs.readFileSync('toplike-design.js', 'utf8');

test('old Top Streak catalog families are centrally removed and replaced once', () => {
  assert.match(js, /querySelectorAll\('\.streak-template-section:not\(\[data-approved-streak\]\)'\).*remove/);
  assert.match(js, /VYRA TOP STREAK · CLEAN FLIP/);
  assert.doesNotMatch(js, /Inferno Streak|Liquid Gold Fuse|Golden Wings/);
});

test('approved Top Streak is transparent and flips forever every eight seconds', () => {
  assert.match(js, /streakFlipSeconds: 8/);
  assert.match(css, /animation:approved-streak-flip var\(--flip-duration,8s\).*infinite/);
  assert.match(css, /background:none!important/);
});

test('Top Like accepts only the four approved skins and defaults transparent', () => {
  assert.match(js, /clean-bar.*soft-stack.*mini-podium.*side-rank/);
  assert.match(js, /LIKE_SKINS\.has\(w\.skin\).*'clean-bar'/s);
  assert.match(topLike, /widget\.showBackground = false/);
  assert.match(js, /TOP LIKE · VYRA ORIGINAL/);
  assert.match(js, /createApprovedLike/);
});

test('central retirement guard loads last with its own cache version', () => {
  // CSS -3 2026-09-20: <b>-talet inline igen (studio.css:s .widget b{display:block} staplade raden).
  assert.match(html, /approved-rankings\.css\?v=20260920-3/);
  assert.match(css, /\.approved-streak-copy em b\{display:inline!important/, 'talet i <b> ska ligga inline i vardesraden');
  // JS -3 2026-09-20: ramvaljaren bort. -4 samma dag: overlayens nollage synligt, talet i <b> for
  // livepatchen.
  assert.match(html, /approved-rankings\.js\?v=20260920-4/);
  assert.ok(html.indexOf('approved-rankings.js?v=20260920-4') > html.indexOf('vyra-state-sync.js'));
});

// RIKTIG RENDERING AV CLEAN FLIP. approved-rankings.js kors i jsdom med de globala studio.js ger
// den; install() hakar in wh() nar dokumentet ar komplett, sa wh(widget) ar renderaren.
const { JSDOM } = require('jsdom');
function riggClean(overlay) {
  const dom = new JSDOM('<!doctype html><body></body>',
    { url: 'http://localhost/studio.html' + (overlay ? '?overlay=1' : ''), runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(`var wh=()=>'',props=()=>'',bind=()=>{},selected=null,view='overlay',state={widgets:[]},
    save=()=>{},render=()=>{},toast=()=>{},liveWidget=id=>state.widgets.find(x=>x.id===id),
    VYRA_OVERLAY=${overlay ? 'true' : 'false'},
    VyraSafe={text:(v,f)=>(v==null||v==='')?f:String(v),url:(v,f)=>v||f},
    VyraWidgets={create:()=>({id:'ny'}),isStandalone:()=>false};`);
  w.eval(js);
  // install() hakar in wh() forst pa window 'load' - jsdom ar inte 'complete' vid eval.
  w.dispatchEvent(new w.Event('load'));
  return w;
}
function cleanRad(w, widget) {
  const box = w.document.createElement('div');
  box.innerHTML = w.eval('wh')(widget);
  const rot = box.querySelector('.approved-streak');
  return { rot, strong: rot.querySelector('.approved-streak-copy strong'),
    em: rot.querySelector('.approved-streak-copy em'), b: rot.querySelector('.approved-streak-copy em b') };
}

test('Clean Flip i overlay: fabrikens demoperson blir ett synligt nollage, ett riktigt rekord visas', () => {
  // Fabriken bakar in '@StreamQueen'/18 (widget-factory.js) och createCleanStreak 'MAYA'/18.
  // Uppmatt 2026-09-20 i den visuella riggen: overlayen visade "@StreamQueen x18 STREAK".
  for (const demo of ['@StreamQueen', 'MAYA', 'maya', undefined]) {
    const r = cleanRad(riggClean(true), { id: 's1', type: 'templateTopStreak', dataName: demo, dataValue: 18 });
    assert.equal(r.strong.textContent, '', `demonamnet ${demo} ska inte na sandningen`);
    assert.equal(r.em.textContent, '×0 STREAK', 'nollaget ar synligt, inte dolt');
    assert.equal(r.b && r.b.textContent, '0', 'talet ligger i ett eget <b> for livepatchen');
    assert.doesNotMatch(r.rot.getAttribute('style') || '', /display:\s*none/, 'ingen dold widget - livepatchen kan inte avsloja den');
  }
  // Ett riktigt namn i state (skrivet av gift-event-images.js vid ett rekord) ska renderas aven
  // vid en omritning mitt i sandningen.
  const live = cleanRad(riggClean(true), { id: 's1', type: 'templateTopStreak', dataName: 'wpwer17', dataValue: 23 });
  assert.equal(live.strong.textContent, 'wpwer17');
  assert.equal(live.em.textContent, '×23 STREAK');
});

test('Clean Flip i editorn behaller demodatan att designa mot', () => {
  const r = cleanRad(riggClean(false), { id: 's1', type: 'templateTopStreak' });
  assert.equal(r.strong.textContent, 'MAYA');
  assert.equal(r.em.textContent, '×18 STREAK');
  assert.equal(r.b.textContent, '18');
});

