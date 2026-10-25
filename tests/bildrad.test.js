'use strict';
// BILDSTORLEK, RADAVSTÅND OCH RIKTNING (vyra-bildrad.js, vyra-bildrad.css) — utan webbläsare.
//
// Tre löften provas här, där de går att prova utan layout:
//   1. ORÖRT RITAS SOM FÖRUT. Utan fälten, eller med fälten på sina standardvärden, lämnar
//      wrappern markupen byte för byte orörd — i alla tre familjerna. Det är det som håller de
//      visuella referenserna gröna utan nya bilder.
//   2. VARJE REGLAGE MÄRKER ROTEN. Ändrat värde ger klassen och variabeln som CSS:en läser.
//   3. PANELEN. Kontrollerna hamnar i rätt poster (de riktiga panelfilerna laddas), direkt efter
//      Position i sektion 3, med "Återställ utseende" för fälten — och inte i Battle MVP:s ramar och
//      firanden, där de inget skulle göra.
// Layouten (zoom, gap, riktning, inget sticker ut, omladdning) provas i
// tests/browser/bildrad.browser.test.js.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
// Värden ur sandlådan har en annan Array-prototyp; jämför dem som data.
const data = x => JSON.parse(JSON.stringify(x));

// En sandlåda med registret, de tre familjernas panelfiler och vyra-bildrad.js, i laddordning.
function sandlada({ panel = true, ytterst = 3 } = {}) {
  const ctx = {
    console,
    document: { readyState: 'complete', addEventListener() {} },
    addEventListener() {},
    renderingar: 0,
    vantande: [],
  };
  ctx.window = ctx;
  ctx.setTimeout = fn => { ctx.vantande.push(fn); return ctx.vantande.length; };
  ctx.wh = w => w.__html;          // kedjan under: ger tillbaka den markup provet lägger på w
  // Som i studion: spellayout.js (rang 3) ligger ytterst när den här installeras. ytterst:null =
  // ett osorterat omslag (Gift Campaign Aura) ligger ytterst.
  if (ytterst != null) ctx.wh.__vyraYtter = ytterst;
  ctx.render = () => { ctx.renderingar++; };
  vm.createContext(ctx);
  if (panel) {
    vm.runInContext(las('vyra-panelregister.js'), ctx);
    for (const f of ['vyra-mvp-panel.js', 'vyra-ranking-panel.js', 'vyra-playground-panel.js']) vm.runInContext(las(f), ctx);
  }
  vm.runInContext(las('vyra-bildrad.js'), ctx);
  return ctx;
}

// Rotnoder som de ser ut när de når wrappern (förkortade, men med samma öppningstagg).
const ROT = {
  rk6: id => `<div class="widget vyra-toplike ranking-bg-off rk6 rk6-${id}" data-rk6="${id}" data-id="a" style="left:20px;top:40px;zoom:1;--rk6-z:1"><div class="rk6-lista"></div></div>`,
  mvp: s => `<div class="widget battle-mvp mvp-${s}" data-id="b" style="left:0px;top:0px;width:240px;--mvp:#f00;zoom:1"><div class="mvp-emblem"></div><div class="mvp-copy"></div></div>`,
  mvpRam: `<div class="widget battle-mvp mvp-framed" data-id="b" style="left:0px;top:0px;width:300px;--fa:1"><img class="mvpf-art"></div>`,
  pod: `<div class="widget templatePg templatePgPodium" data-id="c" style="left:0px;top:0px;width:396px;height:364px"><div class="pgw wroot" data-pgid="c" data-pgkind="podium"></div></div>`,
};
const RANKING = ['voltage', 'basic-v2', 'prism-vertical', 'prism-horizontal', 'celestial', 'royal-rose'];
const EGEN = { voltage: 'lodrat', 'basic-v2': 'lodrat', 'prism-vertical': 'lodrat', 'prism-horizontal': 'podium', celestial: 'vagrat', 'royal-rose': 'vagrat' };
const MVP = ['inferno', 'royal', 'cyber', 'storm', 'aurora', 'samurai'];
const MVP_EGEN = { inferno: 'vagrat', royal: 'lodrat', cyber: 'vagrat', storm: 'lodrat', aurora: 'lodrat', samurai: 'vagrat' };

function fall() {
  const ut = [];
  for (const id of RANKING) for (const type of ['templateTopLike', 'templateTopCoins', 'templateTopPoints']) ut.push({ namn: `${type} ${id}`, w: { type, __html: ROT.rk6(id) }, egen: EGEN[id] });
  for (const s of MVP) ut.push({ namn: `MVP ${s}`, w: { type: 'templateBattleMvp', mvpStyle: s, width: 240, __html: ROT.mvp(s) }, egen: MVP_EGEN[s] });
  ut.push({ namn: 'podiet', w: { type: 'templatePgPodium', width: 380, __html: ROT.pod }, egen: '2-1-3' });
  return ut;
}

test('orört: utan fälten är markupen byte för byte densamma, i alla 25 modeller', () => {
  const ctx = sandlada({ panel: false });
  for (const f of fall()) assert.equal(ctx.wh(f.w), f.w.__html, f.namn);
});

test('orört: fälten på standardvärdena (100 %, 0 px, designens egen riktning) ändrar ingenting', () => {
  const ctx = sandlada({ panel: false });
  for (const f of fall()) {
    const w = Object.assign({}, f.w, { bildStorlek: 100, radAvstand: 0, riktning: f.egen });
    assert.equal(ctx.wh(w), f.w.__html, f.namn);
    // Ett värde som panelen aldrig skriver (tom text, okänd riktning) ritar heller inget nytt.
    assert.equal(ctx.wh(Object.assign({}, f.w, { bildStorlek: '', radAvstand: null, riktning: 'snett' })), f.w.__html, f.namn + ' (skräpvärden)');
  }
});

test('Bildstorlek märker roten med vb-bild och --vb-bild, i alla tre familjerna', () => {
  const ctx = sandlada({ panel: false });
  for (const f of fall()) {
    const html = ctx.wh(Object.assign({}, f.w, { bildStorlek: 80 }));
    assert.match(html, /^<div class="[^"]*\bvb-bild\b/, f.namn);
    assert.match(html, /style="[^"]*--vb-bild:0\.8"/, f.namn);
    // Bara roten: innehållet efter öppningstaggen är orört.
    assert.equal(html.slice(html.indexOf('>') + 1), f.w.__html.slice(f.w.__html.indexOf('>') + 1), f.namn);
    // Data-id, position och de andra variablerna står kvar.
    assert.match(html, /data-id="[abc]"/, f.namn);
    assert.match(html, /style="left:/, f.namn);
  }
});

test('Radavstånd märker roten med vb-rad; Battle MVP får det färdiga avståndet, podiet designpixlar', () => {
  const ctx = sandlada({ panel: false });
  const [rk] = fall();
  assert.match(ctx.wh(Object.assign({}, rk.w, { radAvstand: 15 })), /class="[^"]*\bvb-rad\b[^"]*"[^>]*--vb-rad:15px/);
  assert.match(ctx.wh(Object.assign({}, rk.w, { radAvstand: -10 })), /--vb-rad:-10px/);
  assert.match(ctx.wh(Object.assign({}, rk.w, { radAvstand: 99 })), /--vb-rad:40px/, 'kläms till reglagets max');
  // Inferno: designens 7 px + 10. Royal i kolumn: 3 + 40. Aldrig under noll.
  const mvp = s => Object.assign({ type: 'templateBattleMvp', mvpStyle: s, width: 240, __html: ROT.mvp(s) });
  assert.match(ctx.wh(Object.assign(mvp('inferno'), { radAvstand: 10 })), /--vb-rad:17px/);
  assert.match(ctx.wh(Object.assign(mvp('royal'), { radAvstand: 40 })), /--vb-rad:43px/);
  assert.match(ctx.wh(Object.assign(mvp('royal'), { radAvstand: -10 })), /--vb-rad:0px/);
  // Podiet: 940 designpixlar på 380 px bredd → 10 px blir 24,7 designpixlar.
  assert.match(ctx.wh({ type: 'templatePgPodium', width: 380, __html: ROT.pod, radAvstand: 10 }), /--vb-rad:24\.7px/);
});

test('Riktning märker roten efter familjens lägen', () => {
  const ctx = sandlada({ panel: false });
  const rk = (id, riktning) => ctx.wh({ type: 'templateTopLike', __html: ROT.rk6(id), riktning });
  assert.match(rk('voltage', 'vagrat'), /\bvb-vagrat\b/);
  assert.doesNotMatch(rk('voltage', 'lodrat'), /\bvb-/, 'listan står redan lodrätt');
  assert.match(rk('celestial', 'lodrat'), /\bvb-lodrat\b/);
  assert.match(rk('prism-horizontal', 'lodrat'), /\bvb-lodrat\b/);
  assert.match(rk('prism-horizontal', 'rad'), /\bvb-rak\b/);
  assert.doesNotMatch(rk('celestial', 'rad'), /\bvb-/, 'rak rad finns bara i Prism horisontal');
  const mvp = (s, riktning) => ctx.wh({ type: 'templateBattleMvp', mvpStyle: s, width: 240, __html: ROT.mvp(s), riktning });
  assert.match(mvp('inferno', 'lodrat'), /\bvb-lodrat\b/);
  assert.match(mvp('royal', 'vagrat'), /\bvb-vagrat\b/);
  assert.match(mvp('storm', 'vagrat'), /\bvb-vagrat\b/);
  const pod = riktning => ctx.wh({ type: 'templatePgPodium', width: 380, __html: ROT.pod, riktning });
  assert.match(pod('1-2-3'), /\bvb-pall-1-2-3\b/);
  assert.match(pod('3-1-2'), /\bvb-pall-3-1-2\b/);
});

test('inget sticker ut: Battle MVP:s emblem kläms till lådan, podiets bild till 130 %', () => {
  const ctx = sandlada({ panel: false });
  const faktor = html => Number((/--vb-bild:([\d.]+)/.exec(html) || [])[1]);
  const mvp = (falt) => ctx.wh(Object.assign({ type: 'templateBattleMvp', mvpStyle: 'inferno', width: 240, __html: ROT.mvp('inferno') }, falt));
  // Bredvid texten: 240 − 20 padding − 90 åt namnet − 7 avstånd = 123 px åt ett 105 px emblem.
  assert.ok(faktor(mvp({ bildStorlek: 150 })) <= 123 / 105 + 1e-9, 'bredvid texten');
  // Ovanför texten: hela innerbredden, 220 px.
  assert.equal(faktor(mvp({ bildStorlek: 150, riktning: 'lodrat' })), 1.5);
  assert.ok(faktor(mvp({ bildStorlek: 150, width: 140, riktning: 'lodrat' })) <= 120 / 105 + 1e-9, 'smal låda');
  // Avståndet ger vika för bilden bredvid texten.
  const html = mvp({ bildStorlek: 110, radAvstand: 40 });
  const gap = Number(/--vb-rad:(\d+)px/.exec(html)[1]);
  assert.ok(105 * faktor(html) + gap <= 240 - 20 - 90 + 0.5, 'emblem + avstånd ryms bredvid namnet');
  assert.equal(faktor(ctx.wh({ type: 'templatePgPodium', width: 380, __html: ROT.pod, bildStorlek: 150 })), 1.3);
});

test('Battle MVP:s ramar och firanden får inga märken', () => {
  const ctx = sandlada({ panel: false });
  const ram = { type: 'templateBattleMvp', mvpFrame: 'royal-ribbon', mvpStyle: 'inferno', __html: ROT.mvpRam, bildStorlek: 140, radAvstand: 20, riktning: 'lodrat' };
  assert.equal(ctx.wh(ram), ROT.mvpRam);
  const firande = { type: 'templateBattleMvp', mvpStyle: 'coronation', __html: '<div class="widget battle-mvp mvc" style="">', bildStorlek: 140 };
  assert.equal(ctx.wh(firande), firande.__html);
});

test('panelen: tre kontroller direkt efter Position i 18 + 6 + 1 poster', () => {
  const ctx = sandlada();
  const R = ctx.VyraPanelregister;
  const medBild = R.poster().filter(p => p.kontroller.some(k => k.falt === 'bildStorlek'));
  const ranking = medBild.filter(p => p.test === 'ranking'), mvp = medBild.filter(p => p.typ === 'templateBattleMvp'), pod = medBild.filter(p => p.typ === 'templatePgPodium');
  assert.equal(ranking.length, 18, 'alla 18 rankingposter');
  assert.equal(mvp.length, 6, 'de sex klassiska MVP-stilarna');
  assert.deepEqual(data(mvp.map(p => p.galler[0]).sort()), MVP.map(s => 'klassisk:' + s).sort());
  assert.equal(pod.length, 1, 'podiets post (alla tretton modeller)');
  for (const p of medBild) {
    const i = p.kontroller.findIndex(k => k.typ === 'std-position');
    const tre = p.kontroller.slice(i + 1, i + 4);
    assert.deepEqual(data(tre.map(k => [k.sektion, k.typ, k.falt])), [[3, 'tal', 'bildStorlek'], [3, 'tal', 'radAvstand'], [3, 'val', 'riktning']], p.typ + ' ' + p.galler);
    assert.equal(tre[0].standard, 100); assert.equal(tre[0].enhet, '%');
    assert.equal(tre[1].standard, 0); assert.equal(tre[1].enhet, 'px');
    assert.ok(tre[2].alternativ.length >= 2);
    for (const f of ['bildStorlek', 'radAvstand', 'riktning']) assert.ok(p.utseendeFalt.includes(f), 'Återställ utseende tar ' + f);
    // Posten är fortfarande giltig enligt registrets egen validering.
    assert.deepEqual(data(R.validera(p)), [], p.typ + ' ' + p.galler);
  }
  assert.equal(pod[0].kontroller.find(k => k.falt === 'bildStorlek').max, 130, 'podiets reglage slutar där bilden ryms');
  // Riktningens första alternativ är designens egen — det listan visar när fältet saknas.
  const egen = p => p.kontroller.find(k => k.falt === 'riktning').alternativ[0][0];
  for (const p of ranking) assert.equal(egen(p), EGEN[p.galler[0]], p.galler[0]);
  for (const p of mvp) assert.equal(egen(p), MVP_EGEN[p.galler[0].slice(9)], p.galler[0]);
  assert.equal(egen(pod[0]), '2-1-3');
});

test('panelen: inga reglage i Battle MVP:s ramar och firanden, och utoka() är idempotent', () => {
  const ctx = sandlada();
  const R = ctx.VyraPanelregister;
  const utan = R.poster().filter(p => p.typ === 'templateBattleMvp' && !String(p.galler[0]).startsWith('klassisk:'));
  assert.ok(utan.length >= 14, 'ramar och firanden finns');
  for (const p of utan) assert.ok(!p.kontroller.some(k => ['bildStorlek', 'radAvstand', 'riktning'].includes(k.falt)), p.galler[0]);
  const fore = R.poster().map(p => p.kontroller.length);
  assert.equal(ctx.VyraBildrad.utoka(), 0, 'andra varvet lägger inget');
  assert.deepEqual(data(R.poster().map(p => p.kontroller.length)), data(fore));
});

test('panelen: rankingens reglage döljs i kompaktläget (liten widget), där de inget gör', () => {
  const ctx = sandlada();
  const R = ctx.VyraPanelregister;
  ctx.VyraRankingSixpack = { designFor: () => 'voltage', antal: () => 5, lasbarhet: (id, n, z) => ({ kompakt: z < 0.8 }) };
  const post = R.hitta({ type: 'templateTopLike', skin: 'voltage' });
  const bild = post.kontroller.find(k => k.falt === 'bildStorlek');
  assert.equal(bild.om({ type: 'templateTopLike', skin: 'voltage', widgetScale: 1 }), true);
  assert.equal(bild.om({ type: 'templateTopLike', skin: 'voltage', widgetScale: 0.5 }), false);
});

test('CSS: varje regel kräver en vb-klass — en orörd widget träffas inte av någon', () => {
  const css = las('vyra-bildrad.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const regler = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(m => m[1].trim()).filter(Boolean);
  assert.ok(regler.length > 40, 'regler hittades');
  // Komman på toppnivå skiljer selektorer; komman inne i :is()/:not() gör det inte.
  const delar = sel => { const ut = []; let d = 0, nu = ''; for (const c of sel) { if (c === '(') d++; if (c === ')') d--; if (c === ',' && !d) { ut.push(nu); nu = ''; } else nu += c; } return ut.concat(nu); };
  for (const sel of regler) for (const del of delar(sel)) assert.match(del, /\.vb-/, 'utan vb-klass: ' + del.trim());
});

test('laddningen: media.js skript-svans laddar vyra-bildrad.css och .js, även i overlay-läget', () => {
  const media = las('media.js');
  const rad = media.split('\n').find(r => r.includes("vyra-bildrad.js?v="));
  assert.ok(rad, 'laddraden finns');
  assert.match(rad, /vyra-bildrad\.css\?v=\d{8}-\d+/);
  assert.doesNotMatch(rad, /has\('overlay'\)\)return/, 'laddas även i overlay-utgången');
  assert.match(las('studio.html'), /media\.js\?v=20261025-11/);
});

// ORDNINGEN I KEDJAN (CI 2026-10-23, två gånger): Gift Campaign Aura laddas asynkront och lägger sig
// ytterst utan rang. Installerades den här då (rang 4) kunde spellayout.js (rang 3) aldrig lägga sig
// utanför Aura igen, och gamingtemats Gift Campaign ritades av Aura med 0 platser. Den här väntar nu
// tills rang 1–3 har sorterat sig ytterst.
test('installeras inte ovanpå ett osorterat omslag — väntar tills spellayout (rang 3) ligger ytterst', () => {
  const ctx = sandlada({ panel: false, ytterst: null });
  assert.equal(ctx.wh.__vyraYtter, undefined, 'lade sig ytterst ovanpå Aura — spellayout kommer då aldrig utanför den');
  assert.ok(ctx.vantande.length >= 1, 'ingen ny kontroll schemalades');
  // spellayout.js sorterar sig ytterst vid nästa skript-load …
  const aura = ctx.wh;
  const spel = function (w) { return aura(w); };
  spel.__vyraYtter = 3;
  ctx.wh = spel;
  ctx.vantande.shift()();
  // … och först då lägger sig den här utanför den.
  assert.equal(ctx.wh.__vyraYtter, 4, 'installerades inte när spellayout låg ytterst');
});

test('installeras ändå efter ~5 s om inget sorterar kedjan', () => {
  const ctx = sandlada({ panel: false, ytterst: null });
  for (let i = 0; i < 40 && ctx.wh.__vyraYtter !== 4 && ctx.vantande.length; i++) ctx.vantande.shift()();
  assert.equal(ctx.wh.__vyraYtter, 4);
});
