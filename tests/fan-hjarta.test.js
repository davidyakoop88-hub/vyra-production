'use strict';
// Fan Level Up · hjärtmodellerna (fan-hjarta.js + fan-hjarta-<id>.js/.css, David 2026-11-05).
//
// Vad som vaktas här, i jsdom och i källan:
//   R  registret — sex modeller, samma i fabriken, katalogen, modellväljaren, laddningen och panelen,
//      och samma förvalda visningstid i fabriken som i modellfilen,
//   T  tidslinjen ryms — hjärtat landar och scenen vilar innan uttoningen börjar (motsvarigheten till
//      fan-fas F3 för modeller med egen klocka),
//   M  markupen — ett introhjärta, ett märke vid nivåsiffran, dynamiska fält, inga id:n, inget ljud,
//      namnet escapas,
//   C  stilarna är skopade — varje regel under .fhm-<id>, keyframes med modellens prefix,
//   L  livscykeln — fanLevelHtml och fanSpelaPa kopplas bara för de sex, och en uppspelning fyller i
//      tittarens namn, nivå och bild.
// Rörelsen själv (ett hjärta i taget, landningen, render() mitt i) mäts i en riktig webbläsare:
// tests/browser/fan-hjarta.browser.test.js.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const MODELLER = ['ascend', 'heartreveal', 'heartgift', 'goldenstage', 'heartlift', 'luminous'];
const FABRIK = las('widget-factory.js'), MEDIA = las('media.js'), PANEL = las('vyra-alert-panel.js');

const doms = [];
test.after(() => { while (doms.length) doms.pop().window.close(); });

// En sida med motorn och alla sex modellerna, och en minimal fanLevelHtml/fanSpelaPa i media.js stil.
function sida() {
  const dom = new JSDOM('<!doctype html><html><body><div id="duk"></div></body></html>',
    { url: 'https://vyralive.app/studio.html?overlay=1', runScripts: 'dangerously', pretendToBeVisual: true });
  doms.push(dom);
  const { window } = dom;
  const kor = kod => { const s = window.document.createElement('script'); s.textContent = kod; window.document.body.append(s); };
  kor(las('overlay-sanitize.js'));
  kor(`let selected=null; const state={widgets:[]};
    window.__gamla=[]; window.__spelat=[];
    function fanLevelHtml(w){ window.__gamla.push(w.fanLayout); return '<div class="widget fan-level-up fan-layout-'+w.fanLayout+'" data-id="'+w.id+'"></div>' }
    function fanSpelaPa(box,w,e){ window.__spelat.push(w.id); box.classList.add('fan-active') }
    function render(){ document.getElementById('duk').innerHTML = state.widgets.map(w => fanLevelHtml(w)).join('') }`);
  kor(las('fan-hjarta.js'));
  for (const m of MODELLER) kor(las(`fan-hjarta-${m}.js`));
  return window;
}
const widget = (m, over = {}) => ({ id: 'w-' + m, type: 'templateFanLevel', fanLayout: m, fanName: 'HeartRiser', fanLevel: 12, width: 300, x: 0, y: 0, ...over });

// ---- R · registret ---------------------------------------------------------------------------------
test('R1: alla sex modellfilerna finns och registrerar sig under sitt eget id', () => {
  const w = sida();
  assert.deepEqual(Array.from(w.VyraFanHjarta.modeller()), MODELLER);
  for (const m of MODELLER) assert.ok(w.VyraFanHjarta.modell(m), `${m} registrerade sig inte`);
});

test('R2: fabriken, katalogen, modellväljaren och panelen känner alla sex', () => {
  const fabrik = FABRIK.match(/'fanlevel\.layout':\s*\{([^}]*)\}/)[1];
  const katalog = MEDIA.match(/let flLayouts=\[(.*?)\];/s)[1];
  const valjare = MEDIA.match(/<select id="fanLayout">(.*?)<\/select>/s)[1];
  const panel = PANEL.match(/const FAN_HJARTA = new Set\(\[([^\]]*)\]\)/)[1];
  for (const m of MODELLER) {
    assert.match(fabrik, new RegExp(`\\b${m}:`), `${m} saknas i fabrikstabellen`);
    assert.match(katalog, new RegExp(`\\['${m}'`), `${m} saknas i katalogen`);
    assert.match(valjare, new RegExp(`value="${m}"`), `${m} saknas i modellväljaren`);
    assert.match(panel, new RegExp(`'${m}'`), `${m} saknas i panelens hjärtmodeller`);
  }
});

test('R3: fabrikens förvalda visningstid är modellfilens', () => {
  const tabell = Function('return ' + FABRIK.match(/const FAN_HJARTA_VISNING = (\{[^}]*\})/)[1])();
  const w = sida();
  for (const m of MODELLER) assert.equal(tabell[m], w.VyraFanHjarta.modell(m).visning, `${m}: fabriken och modellen säger olika visningstid`);
});

test('R4: media.js laddar motorn före modellerna, och varje modells CSS', () => {
  const rad = MEDIA.match(/const files=\['fan-hjarta\.js\?v=[^']+'([^\]]*)\]/);
  assert.ok(rad, 'hittade inte laddningen av fan-hjarta.js i media.js');
  const ordning = [...rad[1].matchAll(/'fan-hjarta-([a-z]+)\.js\?v=\d{8}-\d+'/g)].map(x => x[1]);
  assert.deepEqual(ordning, MODELLER);
  for (const m of ['fan-hjarta', ...MODELLER.map(x => 'fan-hjarta-' + x)]) assert.match(MEDIA, new RegExp(`'${m}\\.css\\?v=\\d{8}-\\d+'`), `${m}.css laddas inte`);
});

// ---- T · tidslinjen ryms ---------------------------------------------------------------------------
test('T1: hela tidslinjen — landningen och vilan — ryms i modellens förvalda visningstid', () => {
  const w = sida();
  for (const m of MODELLER) {
    const d = w.VyraFanHjarta.modell(m);
    assert.ok(d.visning >= 2 && d.visning <= 15, `${m}: visningstiden ${d.visning} s ligger utanför reglaget 2–15 s`);
    assert.ok(d.langd <= d.visning * 1000, `${m}: tidslinjen är ${d.langd} ms men visas ${d.visning} s`);
    const landar = d.flygning ? d.flygning.start + d.flygning.langd : d.landning;
    assert.ok(Number.isFinite(landar), `${m} har varken flygning eller landning`);
    assert.ok(landar <= d.langd, `${m}: hjärtat landar (${landar} ms) efter vilan (${d.langd} ms)`);
    for (const p of d.partiklar) assert.ok(p.t <= d.langd, `${m}: en partikelskur startar efter vilan`);
  }
});

test('T2: Heart Reveal flyger inte — introhjärtat löses upp och märket kommer med nivån', () => {
  const d = sida().VyraFanHjarta.modell('heartreveal');
  assert.equal(d.flygning, null, 'Heart Reveal ska inte ha den gemensamma hjärtflygningen (David)');
  assert.ok(Number.isFinite(d.landning));
});

// ---- M · markupen ----------------------------------------------------------------------------------
test('M1: varje modell har exakt ett introhjärta, ett märke vid nivåsiffran och de dynamiska fälten', () => {
  const w = sida();
  for (const m of MODELLER) {
    const div = w.document.createElement('div');
    div.innerHTML = w.VyraFanHjarta.html(widget(m));
    const box = div.firstElementChild;
    assert.equal(box.querySelectorAll('img.fhm-hjarta').length, 1, `${m}: introhjärtan`);
    assert.equal(box.querySelectorAll('img.fhm-markhjarta').length, 1, `${m}: märken`);
    assert.equal(box.querySelectorAll('[data-fhm="namn"]').length >= 1, true, `${m}: namnfält`);
    assert.equal(box.querySelector('[data-fhm="niva"]').textContent, '12', `${m}: nivåsiffran`);
    assert.ok(box.querySelector('img[data-fhm="bild"]'), `${m}: profilbilden`);
    // Märket står bredvid SIFFRAN: samma förälder som nivåsiffran.
    assert.equal(box.querySelector('.fhm-markhjarta').parentElement, box.querySelector('[data-fhm="niva"]').parentElement,
      `${m}: märket ska stå bredvid nivåsiffran, inte någon annanstans`);
    assert.equal(box.querySelectorAll('[id]').length, 0, `${m}: id:n krockar när två widgetar står på samma duk`);
    assert.equal(box.querySelectorAll('audio').length, 0, `${m}: inget ljud`);
    assert.ok(box.classList.contains('fhm-' + m) && box.classList.contains('fan-level-up'));
  }
});

test('M2: namnet escapas och en farlig bild-URL faller tillbaka', () => {
  const w = sida();
  for (const m of MODELLER) {
    const html = w.VyraFanHjarta.html(widget(m, { fanName: '<img src=x onerror=alert(1)>', profileImage: 'javascript:alert(1)' }));
    assert.ok(!html.includes('<img src=x'), `${m}: namnet escapades inte`);
    assert.ok(!/src="javascript:/i.test(html), `${m}: farlig bild-URL slapp igenom`);
  }
});

test('M3: inget ljud någonstans i hjärtmodellernas filer', () => {
  for (const f of ['fan-hjarta.js', ...MODELLER.map(m => `fan-hjarta-${m}.js`)]) {
    assert.doesNotMatch(las(f), /new Audio|<audio|AudioContext|\.play\(\)/, `${f} spelar ljud`);
  }
});

// ---- C · skopade stilar ----------------------------------------------------------------------------
const PREFIX = { ascend: 'fa', heartreveal: 'fhr', heartgift: 'fhg', goldenstage: 'fgs', heartlift: 'fhl', luminous: 'flu' };
test('C1: varje regel i en modells CSS är skopad under .fhm-<id>, och keyframes bär modellens prefix', () => {
  for (const m of MODELLER) {
    const css = las(`fan-hjarta-${m}.css`).replace(/\/\*[\s\S]*?\*\//g, '');
    const utanKeyframes = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').replace(/@media[^{]+\{/g, '');
    for (const [, sel] of utanKeyframes.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      for (const del of sel.split(',')) {
        const s = del.trim(); if (!s) continue;
        assert.ok(s.startsWith(`.fhm-${m}`), `${m}: regeln "${s}" är inte skopad under .fhm-${m}`);
      }
    }
    for (const [, namn] of css.matchAll(/@keyframes\s+([\w-]+)/g)) {
      assert.ok(namn.startsWith(PREFIX[m]), `${m}: keyframe ${namn} saknar prefixet ${PREFIX[m]} och kan krocka med en annan familj`);
    }
  }
});

// ---- L · livscykeln --------------------------------------------------------------------------------
test('L1: fanLevelHtml ersätts bara för de sex — de åtta äldre modellerna ritas som förut', () => {
  const w = sida();
  w.eval(`state.widgets.push(${JSON.stringify(widget('hero'))}, ${JSON.stringify(widget('ascend'))}); render();`);
  assert.deepEqual(Array.from(w.__gamla), ['hero']);
  assert.ok(w.document.querySelector('.fhm.fhm-ascend[data-id="w-ascend"]'));
  assert.ok(w.document.querySelector('.fan-layout-hero:not(.fhm)'));
});

test('L2: en uppspelning går genom fanSpelaPa och fyller i tittarens namn, nivå och bild', () => {
  const w = sida();
  w.eval(`state.widgets.push(${JSON.stringify(widget('ascend'))}); render();`);
  const box = w.document.querySelector('.fhm');
  w.eval(`fanSpelaPa(document.querySelector('.fhm'), state.widgets[0], { name: 'Lisa', level: 7, profileImage: 'https://p16.tiktokcdn.com/a.jpg' })`);
  assert.deepEqual(Array.from(w.__spelat), ['w-ascend'], 'media.js egen fanSpelaPa ska fortfarande köras (kö, visningstid, uttoning)');
  assert.equal(box.querySelector('[data-fhm="namn"]').textContent, '@Lisa');
  assert.equal(box.querySelector('[data-fhm="niva"]').textContent, '7');
  assert.equal(box.querySelector('[data-fhm="fran"]').textContent, '6');
  assert.equal(box.querySelector('img[data-fhm="bild"]').getAttribute('src'), 'https://p16.tiktokcdn.com/a.jpg');
  assert.ok(w.VyraFanHjarta.aktiva().has('w-ascend'), 'en riktig visning ska minnas, så att render() kan fortsätta den');
});

test('L3: två widgetar på samma duk spelar var för sig', () => {
  const w = sida();
  w.eval(`state.widgets.push(${JSON.stringify(widget('ascend', { id: 'a' }))}, ${JSON.stringify(widget('ascend', { id: 'b' }))}); render();`);
  w.eval(`fanSpelaPa(document.querySelector('[data-id="a"]'), state.widgets[0], { name: 'Lisa', level: 3 })`);
  assert.equal(w.document.querySelector('[data-id="a"] [data-fhm="niva"]').textContent, '3');
  assert.equal(w.document.querySelector('[data-id="b"] [data-fhm="niva"]').textContent, '12', 'den andra widgeten rördes');
});

test('L4: ▶ Testa widget spelar på en klon och lämnar ingen pågående visning efter sig', () => {
  const w = sida();
  w.eval(`state.widgets.push(${JSON.stringify(widget('ascend'))}); render();`);
  const klon = w.document.querySelector('.fhm').cloneNode(true);
  w.eval('window.__klon = null');
  w.__klonNod = klon;
  w.eval(`fanSpelaPa(window.__klonNod, Object.assign({}, state.widgets[0]), { name: 'Test', level: 5 })`);
  assert.equal(w.VyraFanHjarta.aktiva().size, 0);
  assert.equal(klon.querySelector('[data-fhm="niva"]').textContent, '5');
});
