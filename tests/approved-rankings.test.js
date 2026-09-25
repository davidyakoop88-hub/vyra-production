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

test('Top Like accepts the approved skins and defaults transparent', () => {
  // De fyra ursprungliga (Clean Bar, Soft Stack, Mini Podium, Side Rank) PENSIONERADES 2026-09-24
  // (Davids beslut). De står kvar i vitlistan sa en sparad widget renderas i stallet for att tappa
  // sitt skinn — ranking-sixpack.js pekar sedan om den — men Top Like-sektionen i katalogen ar tom
  // och dold, och ett saknat skinn faller tillbaka pa Voltage, inte Clean Bar.
  assert.match(js, /voltage.*basic-v2.*prism-vertical.*prism-horizontal.*celestial.*royal-rose/s);
  assert.match(js, /LIKE_SKINS\.has\(w\.skin\) \? w\.skin : 'voltage'/);
  assert.match(topLike, /widget\.showBackground = false/);
  assert.doesNotMatch(js, /TOP LIKE · VYRA ORIGINAL/, 'de pensionerade designerna ska inte listas i katalogen');
  assert.match(js, /approvedToplike = 'pensionerad'/);
  assert.match(js, /createApprovedLike/);
  // Ranking-sixpack (2026-09-24): LIKE_LABELS ar bade katalogkallan OCH samma vitlista safeSkin
  // laser — saknas ett ID har renderas widgeten alltid som clean-bar, tyst.
  for (const id of ['voltage', 'basic-v2', 'prism-vertical', 'prism-horizontal', 'celestial', 'royal-rose']) {
    assert.match(js, new RegExp(`'?${id}'?:\\s*'VYRA `), `LIKE_LABELS saknar ${id}`);
  }
});

test('central retirement guard loads last with its own cache version', () => {
  // CSS -3 2026-09-20: <b>-talet inline igen (studio.css:s .widget b{display:block} staplade raden).
  assert.match(html, /approved-rankings\.css\?v=20260920-3/);
  assert.match(css, /\.approved-streak-copy em b\{display:inline!important/, 'talet i <b> ska ligga inline i vardesraden');
  // JS -3 2026-09-20: ramvaljaren bort. -4 samma dag: overlayens nollage synligt, talet i <b> for
  // livepatchen.
  // 20260921-1: tomd Clean Flip doljs via vyra-tom-widget.js (doljOmTom), och w.hidden/opacitet/
  // lager skrivs i mallen (wh-overriden nar aldrig media.js:s styledWh/liveVisibilityWh).
  // 20260924-1: LIKE_SKINS/LIKE_LABELS sakande ranking-sixpackens sex nya ID:n — safeSkin tvingade
  // tyst tillbaka varje ny Top Like-widget till clean-bar och katalogkorten for de sex visades
  // aldrig alls. En cachad approved-rankings.js hade fortsatt gora bada.
  // 20260924-pension: Top Like-sektionen tom och dold (de fyra ursprungliga pensionerade), och ett
  // saknat skinn faller tillbaka pa Voltage.
  // 20260924-en-design: de sex sixpack-designerna flyttade ur Top Like-sektionen till
  // ranking-sixpack.js:s grupperade katalog (en grupp per design, Top Like/Coins/Points under), och
  // createLike exporteras dit. En cachad fil hade listat dem dubbelt.
  assert.match(html, /approved-rankings\.js\?v=20260924-pension/);
  assert.ok(html.indexOf('approved-rankings.js?v=20260924-pension') > html.indexOf('vyra-state-sync.js'));
  // vyra-tom-widget.js 20260922-1: regeln om osynliga tomma widgetar galler alla sex familjer,
  // inte bara Top Gift och Top Streak. Ordningen ar oforandrad och det ar den provet vaktar.
  assert.ok(html.indexOf('vyra-tom-widget.js?v=20260922-1') > -1
    && html.indexOf('vyra-tom-widget.js?v=20260922-1') < html.indexOf('approved-rankings.js?v=20260924-pension'),
    'vyra-tom-widget.js ska laddas fore approved-rankings.js (doljOmTom laser window.VyraTomWidget)');
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

test('Clean Flip i overlay: en TOMD widget doljs (Davids beslut 2026-09-09), demovarden doljs inte', () => {
  // Riggen bar vyra-tom-widget.js:s riktiga regel: arTom = inget namn och inget varde (0 raknas
  // som inget). Uppmatt i CI fore fixen: en tomd Clean Flip syntes i overlay.
  const w = riggClean(true);
  w.eval(`window.VyraTomWidget = { arTom: w => (w.dataName == null || w.dataName === '') && (w.dataValue == null || w.dataValue === '' || Number(w.dataValue) === 0),
    dolj: html => String(html).replace(/(<div\\b[^>]*?style=")/, '$1display:none!important;') };`);
  const tomd = w.eval('wh')({ id: 's1', type: 'templateTopStreak' });
  assert.match(tomd, /style="display:none!important;/, 'tomd Clean Flip ska doljas i overlay');
  const demo = w.eval('wh')({ id: 's1', type: 'templateTopStreak', dataName: '@StreamQueen', dataValue: 18 });
  assert.doesNotMatch(demo, /display:none/, 'fabrikens demovarden ar inte "tomt" - de renderas synligt nollade');
  const editor = riggClean(false).eval('wh')({ id: 's1', type: 'templateTopStreak' });
  assert.doesNotMatch(editor, /display:none/, 'i editorn syns aven en tomd widget - annars gar den inte att placera');
});

test('Clean Flip i editorn behaller demodatan att designa mot', () => {
  const r = cleanRad(riggClean(false), { id: 's1', type: 'templateTopStreak' });
  assert.equal(r.strong.textContent, 'MAYA');
  assert.equal(r.em.textContent, '×18 STREAK');
  assert.equal(r.b.textContent, '18');
});

// ---- HELA KEDJAN FOR CLEAN FLIP: vyra-tom-widget.js + gift-event-images.js + approved-rankings.js --
// Riktiga moduler i produktens laddordning (tom-widget fore approved-rankings). Tomd Clean Flip
// doljs; forsta gavan skriver state (gift-event-images), patchar <strong> och <b> via SHAPES och
// avslojar (vyra-tom-widget). Det ar den vag en sandning faktiskt gar.
const tomJs = fs.readFileSync('vyra-tom-widget.js', 'utf8');
const giftJs = fs.readFileSync('gift-event-images.js', 'utf8');

test('hela kedjan: tomd Clean Flip doljs, forsta gavan visar "wpwer17 ×3 STREAK"', async () => {
  const dom = new JSDOM('<!doctype html><body><div class="canvas"></div></body>',
    { url: 'http://localhost/studio.html?overlay=1', runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(`var wh=()=>'',props=()=>'',bind=()=>{},selected=null,view='overlay',state={widgets:[]},
    save=()=>{},render=()=>{},toast=()=>{},liveWidget=id=>state.widgets.find(x=>x.id===id),
    VYRA_OVERLAY=true,
    VyraSafe={text:(v,f)=>(v==null||v==='')?f:String(v),url:(v,f)=>v||f},
    VyraWidgets={create:()=>({id:'ny'}),isStandalone:()=>false};`);
  w.eval(tomJs); w.eval(giftJs); w.eval(js);
  w.dispatchEvent(new w.Event('load'));
  const widget = { id: 's1', type: 'templateTopStreak' };
  w.eval('state').widgets.push(widget);
  const box = w.document.querySelector('.canvas');
  box.innerHTML = w.eval('wh')(widget);
  const el = box.querySelector('[data-id="s1"]');
  assert.ok(el && el.classList.contains('approved-streak'), 'Clean Flip renderades inte');
  assert.equal(el.style.display, 'none', 'tomd Clean Flip ska vara dold i overlay (Davids beslut 2026-09-09)');

  w.dispatchEvent(new w.CustomEvent('vyra-live-event', { detail: {
    type: 'gift', giftName: 'Rose', username: 'wpwer17', coins: 30, count: 3, profileImage: 'https://cdn/p.jpg', giftImage: 'assets/gifts/rose.png' } }));
  await new Promise(r => setTimeout(r, 40));
  assert.equal(el.querySelector('.approved-streak-copy strong').textContent, 'wpwer17');
  assert.equal(el.querySelector('.approved-streak-copy em').textContent, '×3 STREAK', 'talet i <b>, prefix och STREAK kvar');
  assert.equal(el.style.display, '', 'doljningen ska vara borta efter forsta gavan');
});

test('Clean Flip ritar w.hidden, opacitet och lager - wh-overriden nar aldrig media.js:s wrappers', () => {
  const w = riggClean(false);
  const dold = w.eval('wh')({ id: 's1', type: 'templateTopStreak', hidden: true });
  assert.match(dold, /class="widget vyra-streak approved-streak widget-hidden/);
  assert.match(dold, /style="display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;/);
  const lager = w.eval('wh')({ id: 's1', type: 'templateTopStreak', opacity: 40, layer: 7 });
  assert.match(lager, /opacity:0\.4;z-index:7;/);
  assert.doesNotMatch(lager, /display:none/);
});

test('en riktig tittare som heter Maya blankas inte - giftName skiljer demo fran livedata', () => {
  // arDemo kors vid VARJE render i overlay. Utan giftName-villkoret hade en tittare som heter
  // 'Maya' eller 'StreamQueen' fatt namnet blankat och streaken nollad mitt i sandningen, om och
  // om igen. gift-event-images.js satter giftName pa varje rekord; fabriken lamnar faltet tomt.
  const w = riggClean(true);
  const demo = cleanRad(w, { id: 's1', type: 'templateTopStreak', dataName: 'MAYA', dataValue: 18 });
  assert.equal(demo.strong.textContent, '', 'fabrikens demoperson ska inte na sandningen');

  const riktig = cleanRad(w, { id: 's1', type: 'templateTopStreak', dataName: 'Maya', dataValue: 12, giftName: 'Rose' });
  assert.equal(riktig.strong.textContent, 'Maya', 'en riktig tittare som heter Maya ska synas');
  assert.equal(riktig.em.textContent, '×12 STREAK', 'och hennes streak ska sta kvar');
});

