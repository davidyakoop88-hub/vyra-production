'use strict';
// RANKING-SIXPACK: sex godkanda Claude Artifact-prototyper (Voltage, Basic v2, Prism vertikal,
// Prism horisontal, Celestial, Royal Rose) integrerade som valbara designer for Top Like/Top
// Coins/Top Points. Samma regel som skinn-bara-top-like.test.js provar galler fortfarande: bara
// Top Like far en `skin-<id>`-klass, Top Coins/Top Points bar sin egen design i EGET falt.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
test.after(closeAll);

// Sju sedan 2026-10-25: Guld · Silver · Brons (design nr 4) lades till sist.
const SIXPACK = ['voltage', 'basic-v2', 'prism-vertical', 'prism-horizontal', 'celestial', 'royal-rose', 'metall'];

let harness = null;
function rigg() {
  if (harness) return harness;
  const h = createDom({ state: { widgets: [], projectName: 'ranking-sixpack' } });
  h.load('overlay-sanitize.js');
  h.load('toplike-design.js');
  h.load('topcoins-v2.js');
  h.load('toppoints-v2.js');
  h.load('toplike-studio.js');
  harness = h;
  return h;
}

function klasser(w) {
  const h = rigg();
  const host = h.document.createElement('div');
  host.innerHTML = h.window.wh(w);
  const el = host.querySelector('[data-id]');
  assert.ok(el, 'widgeten renderades inte alls — provet mater ingenting');
  return [...el.classList];
}

test('toplike-design.js listar alla sex nya skinn en gang var', () => {
  const h = rigg();
  const ids = h.window.VYRA_TOPLIKE_STYLES.map(([id]) => id);
  for (const id of SIXPACK) {
    assert.ok(ids.includes(id), `saknar ${id} i VYRA_TOPLIKE_STYLES`);
    assert.equal(ids.filter(x => x === id).length, 1, `${id} listad mer an en gang`);
  }
});

// EN DESIGN, TRE DATAKALLOR (2026-09-24, omgjord). Prototyperna sager "Samma design anvands till Top
// Like, Top Coins och Top Points — bara symbolen och datakallan bakom siffran byts". ranking-sixpack.js
// ritar darfor de sex designerna med EN markup for alla tre familjerna, och tar bort familjernas egna
// skinn-/designklasser fran roten sa deras ~200 !important-regler inte bygger om raderna till tre
// olika saker (det var precis vad forsta integrationen gjorde — mat i riktig Chromium).
function sixpackRigg() {
  const h = rigg();
  if (!h.window.VyraRankingSixpack) {
    h.load('ranking-sixpack.js');
    h.window.dispatchEvent(new h.window.Event('load'));
  }
  return h;
}
function nod(w) {
  const h = sixpackRigg();
  const host = h.document.createElement('div');
  host.innerHTML = h.window.wh(w);
  const el = host.querySelector('[data-id]');
  assert.ok(el, 'widgeten renderades inte alls — provet mater ingenting');
  return el;
}
const FAMILJ = id => [
  { id: 'tl-' + id, type: 'templateTopLike', x: 0, y: 0, width: 300, likeCount: 5, skin: id },
  { id: 'tc-' + id, type: 'templateTopCoins', x: 0, y: 0, width: 300, likeCount: 1, topCoinsDesign: id },
  { id: 'tp-' + id, type: 'templateTopPoints', x: 0, y: 0, width: 300, likeCount: 5, topPointsDesign: id }
];

test('alla tre familjerna ritar samma design: rk6-<id>, och inga familjeegna skinn-/designklasser', () => {
  for (const id of SIXPACK) {
    for (const w of FAMILJ(id)) {
      const el = nod(w);
      const k = [...el.classList];
      assert.ok(k.includes('rk6') && k.includes('rk6-' + id), `${w.type} ${id} saknar rk6-${id}: ${k.join(' ')}`);
      assert.deepEqual(k.filter(c => /^(skin-|like-|topcoins-|toppoints-)/.test(c) || c === 'vyra-topcoins-new' || c === 'vyra-toppoints-new'), [],
        `${w.type} ${id} bar kvar en familjeklass som bygger om raderna`);
      assert.equal(el.dataset.id, w.id, 'rotens data-id maste overleva omslaget');
    }
  }
});

test('samma DOM i alla tre: ram, karna, foto, namn och varde per rad — bara ikonen skiljer', () => {
  for (const id of SIXPACK) {
    const skelett = FAMILJ(id).map(w => {
      const el = nod(w);
      const rader = [...el.querySelectorAll('.toplike-row')];
      assert.equal(rader.length, 5, `${w.type} ${id}: ${rader.length} rader, prototypen har fem (Top Coins var en ensam ledare)`);
      for (const rad of rader) {
        // Det live-leaderboard.js / live-zero-state.js / vyra-tom-widget.js laser, en gang per rad.
        for (const sel of ['.rk6-ring', '.rk6-karna', 'img', 'strong', 'small', 'em']) {
          assert.equal(rad.querySelectorAll(sel).length, 1, `${w.type} ${id}: ${sel} ska finnas exakt en gang per rad`);
        }
        // skrivTal() skriver bara textnoden efter ett forsta <i> — ikonen ska sta kvar vid livedata.
        assert.equal(rad.querySelector('em').firstElementChild.tagName, 'I', 'ikonen ska vara forsta barnet i <em>');
      }
      return rader[0].innerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '');
    });
    assert.equal(skelett[1], skelett[0], `${id}: Top Coins ritar inte samma rad som Top Like`);
    assert.equal(skelett[2], skelett[0], `${id}: Top Points ritar inte samma rad som Top Like`);
  }
});

test('ramen ar en riktig nod, inte img::before/::after (ett <img> far aldrig pseudoelement)', () => {
  const css = fs.readFileSync('ranking-sixpack.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /img[^{,]*::(before|after)/, 'en regel pa img::before/::after ritar aldrig nagot');
  // Katalogens miniatyrer ritas i en shadow root dar `html body` aldrig matchar.
  assert.doesNotMatch(css, /html\s+body/, '`html body` matchar inte i katalogens shadow root');
  // Fotot farg-cyklar inte — prototyperna cyklar bara ledlisten och ikonen.
  assert.match(css, /\.toplike-row img\{[^}]*filter:none!important[^}]*animation:none!important/);
});

test('katalogen: en grupp per design, med Top Like / Top Coins / Top Points under', () => {
  const h = sixpackRigg();
  const catalog = h.document.createElement('div');
  catalog.className = 'widget-catalog';
  h.document.body.append(catalog);
  h.window.VyraRankingSixpack.katalog();
  const grupper = [...catalog.querySelectorAll('.rk6-grupp')];
  assert.deepEqual(grupper.map(g => g.dataset.rk6Grupp), SIXPACK);
  for (const g of grupper) {
    const id = g.dataset.rk6Grupp;
    assert.deepEqual([...g.querySelectorAll('button')].map(b => b.dataset.catalogKey), [
      'catalog:toplike:' + id, 'catalog:ranking:templateTopCoins:' + id, 'catalog:ranking:templateTopPoints:' + id
    ]);
  }
  catalog.remove();
});

test('de sex listas inte langre i familjernas egna sektioner — bara i den grupperade', () => {
  for (const fil of ['topcoins-v2.js', 'toppoints-v2.js']) {
    assert.match(fs.readFileSync(fil, 'utf8'), /!SIXPACK\.has\(id\)/, `${fil} filtrerar inte bort sixpack ur sin katalogsektion`);
  }
  // Top Like har ingen egen sektion alls langre (de fyra ursprungliga ar pensionerade).
  assert.doesNotMatch(fs.readFileSync('approved-rankings.js', 'utf8'), /data-top-like-theme=/);
});

// PENSIONERINGEN (2026-09-24, Davids beslut: "ta bort de gamla helt och hallet, att de inte kommer
// tillbaka"). Top Likes fyra och Top Points fyra ursprungliga designer ritas aldrig mer — en sparad
// widget med en av dem, eller utan design alls, ritas som narmaste nya.
test('pensionerade och saknade designer ritas som narmaste nya — aldrig som den gamla', () => {
  const fall = [
    [{ type: 'templateTopLike', skin: 'clean-bar' }, 'voltage'],
    [{ type: 'templateTopLike', skin: 'soft-stack' }, 'voltage'],
    [{ type: 'templateTopLike', skin: 'side-rank' }, 'voltage'],
    [{ type: 'templateTopLike', skin: 'mini-podium' }, 'prism-horizontal'],
    [{ type: 'templateTopLike' }, 'voltage'],
    [{ type: 'templateTopLike', skin: 'royal-gold' }, 'voltage'],
    [{ type: 'templateTopPoints', topPointsDesign: 'clean' }, 'voltage'],
    [{ type: 'templateTopPoints', topPointsDesign: 'neon' }, 'voltage'],
    [{ type: 'templateTopPoints', topPointsDesign: 'center' }, 'prism-horizontal'],
    [{ type: 'templateTopPoints', likeTheme: 'podium' }, 'prism-horizontal'],
    [{ type: 'templateTopPoints' }, 'voltage'],
    [{ type: 'templateTopLike', skin: 'celestial' }, 'celestial'],
    [{ type: 'templateTopPoints', topPointsDesign: 'royal-rose' }, 'royal-rose']
  ];
  fall.forEach(([w, vantat], i) => {
    const el = nod({ id: 'pens-' + i, x: 0, y: 0, width: 300, likeCount: 5, ...w });
    assert.equal(el.dataset.rk6, vantat, `${JSON.stringify(w)} ritades som ${el.dataset.rk6}, inte ${vantat}`);
  });
});

test('Top Coins Halo/Signal Orbit berors inte av pensioneringen', () => {
  const el = nod({ id: 'tc-halo', type: 'templateTopCoins', x: 0, y: 0, width: 230, likeCount: 1, topCoinsDesign: 'halo' });
  assert.equal(el.dataset.rk6, undefined);
  assert.ok(el.classList.contains('topcoins-halo'));
});

test('fabriken skapar aldrig en ny widget med en pensionerad design', () => {
  const h = sixpackRigg();
  const par = [
    ['catalog:toplike:clean-bar', 'skin', 'voltage'], ['catalog:toplike:mini-podium', 'skin', 'prism-horizontal'],
    ['catalog:ranking:templateTopPoints:clean', 'topPointsDesign', 'voltage'],
    ['catalog:ranking:templateTopPoints:podium', 'topPointsDesign', 'prism-horizontal']
  ];
  if (!h.window.VyraWidgets) h.load('widget-factory.js');
  assert.ok(h.window.VyraWidgets, 'fabriken laddades inte — provet mater ingenting');
  for (const [nyckel, falt, vantat] of par) {
    const w = h.window.VyraWidgets.create(nyckel);
    assert.equal(w[falt], vantat, `${nyckel} sparade ${falt}=${w[falt]}`);
  }
});

test('topcoins-v2.js och toppoints-v2.js DESIGNS-tabeller har alla sex nya nycklar', () => {
  const h = rigg();
  for (const id of SIXPACK) {
    assert.ok(Object.prototype.hasOwnProperty.call(h.window.VyraTopCoins.designs, id), `Top Coins saknar ${id}`);
    assert.ok(Object.prototype.hasOwnProperty.call(h.window.VyraTopPoints.designs, id), `Top Points saknar ${id}`);
  }
});

test('riktnings-/spegelvaxeln (rankingMirror) galler for alla tre familjerna, inte bara skinnbararen', () => {
  const topLike = { id: 'm-tl', type: 'templateTopLike', x: 0, y: 0, width: 300, likeCount: 3, skin: 'voltage', rankingMirror: true };
  const topCoins = { id: 'm-tc', type: 'templateTopCoins', x: 0, y: 0, width: 300, likeCount: 1, topCoinsDesign: 'halo', rankingMirror: true };
  const topPoints = { id: 'm-tp', type: 'templateTopPoints', x: 0, y: 0, width: 300, likeCount: 5, topPointsDesign: 'clean', rankingMirror: true };
  for (const w of [topLike, topCoins, topPoints]) {
    assert.ok(klasser(w).includes('ranking-mirrored'), `${w.type} fick inte ranking-mirrored`);
  }
  const utanMirror = { id: 'm-off', type: 'templateTopLike', x: 0, y: 0, width: 300, likeCount: 3, skin: 'voltage' };
  assert.ok(!klasser(utanMirror).includes('ranking-mirrored'), 'ranking-mirrored satt aven utan att valjas');
});

test('bildassets kopierade till assets/images/ranking-sixpack/, samma mapp-konvention som profile-frames', () => {
  assert.ok(fs.existsSync('assets/images/ranking-sixpack/celestial-wing-ring.png'));
  assert.ok(fs.existsSync('assets/images/ranking-sixpack/gold-crown-rose-ring.png'));
  // Basic v2 och Prism hade egna PNG-ramar i prototyperna som saknades i forsta integrationen.
  for (const f of ['gold-crystal-crown.png', 'gold-ruby-wreath.png', 'gold-black-frame.png']) {
    assert.ok(fs.existsSync('assets/images/ranking-sixpack/' + f), f + ' saknas');
    assert.match(fs.readFileSync('ranking-sixpack.css', 'utf8'), new RegExp('assets/images/ranking-sixpack/' + f.replace('.', '\\.')));
  }
  const css = fs.readFileSync('ranking-sixpack.css', 'utf8');
  assert.match(css, /assets\/images\/ranking-sixpack\/celestial-wing-ring\.png/);
  assert.match(css, /assets\/images\/ranking-sixpack\/gold-crown-rose-ring\.png/);
});

test('ranking-sixpack.js laddas efter approved-rankings.js (wrappern maste ligga ytterst)', () => {
  const html = fs.readFileSync('studio.html', 'utf8');
  assert.match(html, /ranking-sixpack\.js\?v=/);
  assert.ok(html.indexOf('approved-rankings.js?v=') < html.indexOf('ranking-sixpack.js?v='));
});

test('ranking-sixpack.css laddas i studio.html efter toppoints-v2.css', () => {
  const html = fs.readFileSync('studio.html', 'utf8');
  assert.match(html, /ranking-sixpack\.css\?v=/);
  assert.ok(html.indexOf('toppoints-v2.css?v=') < html.indexOf('ranking-sixpack.css?v='),
    'ranking-sixpack.css maste laddas efter toppoints-v2.css for att kunna komplettera dess klasser');
});

// LÄSBARHETSLÄGET (2026-10-12): skalan är zoom för alla tre familjerna, och kompaktläget väljs ur
// den synliga bredden (designens uppmätta grundmått gånger widgetScale). Mätt i riktig Chromium i
// tests/browser/topplistor-lasbar.browser.test.js — här låses besluten i renderaren.
// --rk6-z bär textgolven. Utanför det valda kompaktläget är den 1, så att zoomen skalar texten med
// resten av kompositionen (granskningen 2026-10-25: golven gjorde lådan bredare vid liten storlek).
test('alla tre familjerna bär widgetScale som zoom; textgolven följer bara det valda kompaktläget', () => {
  for (const w of FAMILJ('voltage')) {
    const el = nod({ ...w, widgetScale: 0.9 });
    assert.match(el.getAttribute('style'), /zoom:0\.9;--rk6-z:1;--rk6-mot:1;/, `${w.type}: ${el.getAttribute('style')}`);
    assert.equal((el.getAttribute('style').match(/zoom:/g) || []).length, 1, 'en zoom, inte två');
    assert.match(nod({ ...w, widgetScale: 0.9, kompaktLage: true }).getAttribute('style'), /zoom:0\.9;--rk6-z:0\.9;/);
  }
});

// STORLEKEN VÄLJER ALDRIG DESIGN (granskningen 2026-10-25): kompaktläget slog förr till av sig självt
// vid liten skala och bytte bort kronor, ringar och metallkomposition. Nu är det bara ett uttryckligt val.
test('kompaktläget: aldrig av storleken, bara när streamern valt det', () => {
  for (const id of SIXPACK) {
    for (const w of FAMILJ(id)) {
      for (const z of [1, 0.75, 0.5, 0.3, 0.2, 2])
        assert.ok(!nod({ ...w, widgetScale: z }).classList.contains('rk6-kompakt'), `${w.type} ${id} blev kompakt av skala ${z}`);
      assert.ok(nod({ ...w, widgetScale: 1, kompaktLage: true }).classList.contains('rk6-kompakt'), `${w.type} ${id}: det valda kompaktläget syns inte`);
    }
  }
  const l = sixpackRigg().window.VyraRankingSixpack.lasbarhet;
  assert.equal(l('voltage', 5, 0.2).kompakt, false, 'skala 0,2 ska inte ge kompaktläge');
  assert.equal(l('voltage', 5, 1, true).kompakt, true, 'valt kompaktläge ska gälla i full storlek');
  assert.equal(l('celestial', 5, 0.5).synlig, Math.round((4 * 78 + 70 + 8) * 0.5), 'måtten följer fortfarande skalan');
});

test('en myntsymbol: Top Gift får guldmyntet i stället för ◉', () => {
  const rs = sixpackRigg().window.VyraRankingSixpack;
  const html = '<div class="widget vyra-topgift premium-topgift topgift-royal" data-id="g" style="left:0;zoom:0.5">'
    + '<div class="topgift-copy"><strong style="font-size:20px;color:#fff">Anya</strong><em style="display:block">◉ 48 210</em></div></div>';
  const ut = rs.enkelLasbar(html, { type: 'templateTopGift', theme: 'royal', widgetScale: 0.5 });
  assert.ok(!ut.includes('◉'), 'cirkeln ska vara ersatt');
  assert.ok(ut.includes(rs.mynt), 'guldmyntet saknas');
  // Royal vid skala 0,5 behåller sin design (förr blev den kompakt här); kompakt bara när det är valt.
  assert.match(ut, /class="[^"]*\brk-lasbar"/);
  assert.match(rs.enkelLasbar(html, { type: 'templateTopGift', theme: 'royal', widgetScale: 0.5, kompaktLage: true }), /class="[^"]*\brk-lasbar rk-kompakt\b/);
  // Neon är kompakt i sin egen design (136 px grund) — i alla storlekar, inte bara i en.
  for (const z of [0.3, 1, 2]) assert.match(rs.enkelLasbar(html.replace('topgift-royal', 'topgift-neon'), { type: 'templateTopGift', theme: 'neon', widgetScale: z }), /\brk-kompakt\b/);
  assert.match(ut, /font-size:max\(20px,calc\(12px \/ var\(--rk-z,1\)\)\)/, 'namnet får golvet 12 synliga px');
  assert.equal(rs.enkelLasbar('<div class="widget">x</div>', { type: 'templateTopLike' }), '<div class="widget">x</div>');
});
