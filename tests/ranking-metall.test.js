'use strict';
// GULD · SILVER · BRONS (design nr 4, byggd och provad i OBS av David 2026-10-24) — den sjunde designen i
// ranking-sixpack.js. Provet vaktar det designen har som ingen annan har: metallen följer placeringen,
// guldkronan sitter bara på ettan och är ingen <img> (livedatan tar radens första <img> som foto), och
// listan lever — den som får poäng lyser i två sekunder, och en omkörning glider i stället för att
// namnen bara byter rad.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
test.after(closeAll);

let harness = null;
function rigg() {
  if (harness) return harness;
  const h = createDom({ state: { widgets: [], projectName: 'ranking-metall' } });
  for (const f of ['overlay-sanitize.js', 'toplike-design.js', 'topcoins-v2.js', 'toppoints-v2.js', 'toplike-studio.js', 'ranking-sixpack.js']) h.load(f);
  h.window.dispatchEvent(new h.window.Event('load'));
  harness = h;
  return h;
}
const FAMILJ = (extra = {}) => [
  { id: 'gsb-tl', type: 'templateTopLike', x: 0, y: 0, width: 250, likeCount: 5, skin: 'metall', ...extra },
  { id: 'gsb-tc', type: 'templateTopCoins', x: 0, y: 0, width: 250, likeCount: 5, topCoinsDesign: 'metall', ...extra },
  { id: 'gsb-tp', type: 'templateTopPoints', x: 0, y: 0, width: 250, likeCount: 5, topPointsDesign: 'metall', ...extra }
];
function nod(w) {
  const h = rigg();
  const host = h.document.createElement('div');
  host.innerHTML = h.window.wh(w);
  const el = host.querySelector('[data-id]');
  assert.ok(el, 'widgeten renderades inte alls — provet mäter ingenting');
  return el;
}
const vanta = ms => new Promise(r => setTimeout(r, ms));

test('alla tre familjerna ritar Guld · Silver · Brons, och designen heter så i katalogen', () => {
  const h = rigg();
  assert.equal(h.window.VyraRankingSixpack.designs.metall.label, 'Guld · Silver · Brons');
  for (const w of FAMILJ()) {
    const el = nod(w);
    assert.equal(el.dataset.rk6, 'metall', `${w.type} ritades inte i Guld · Silver · Brons`);
    assert.ok(el.classList.contains('rk6-metall'));
  }
});

test('metallen följer placeringen: guld, silver, brons och sedan samma neutrala — även på plats 6-10', () => {
  for (const w of FAMILJ({ likeCount: 10 })) {
    const farg = [...nod(w).querySelectorAll('.toplike-row')].map(r => /--c:([^;]+)/.exec(r.getAttribute('style'))[1].toLowerCase());
    assert.deepEqual(farg.slice(0, 3), ['#f5c34f', '#dbe5f2', '#ce905f'], `${w.type}: plats 1-3 är inte guld/silver/brons`);
    assert.ok(farg.slice(3).every(f => f === '#a9b6c5'), `${w.type}: plats 4-10 ska vara samma neutrala metall, fick ${farg.slice(3)}`);
  }
});

test('guldkronan sitter bara på ettan och är ingen <img> — livedatan tar radens första <img> som foto', () => {
  for (const w of FAMILJ()) {
    const rader = [...nod(w).querySelectorAll('.toplike-row')];
    assert.equal(rader[0].querySelectorAll('.rk6-metallkrona').length, 1, `${w.type}: ettan saknar kronan`);
    assert.ok(rader.slice(1).every(r => !r.querySelector('.rk6-metallkrona')), `${w.type}: kronan sitter på fler än ettan`);
    for (const rad of rader) assert.equal(rad.querySelectorAll('img').length, 1, `${w.type}: en rad ska ha exakt en <img>, fotot`);
  }
  const css = fs.readFileSync('ranking-sixpack.css', 'utf8');
  assert.match(css, /\.rk6-metallkrona\{[^}]*metall-krona\.webp/, 'kronan ska ritas som bakgrund ur metall-krona.webp');
});

test('bilderna är små nog för OBS: krona och ljus under 40 kB var', () => {
  for (const f of ['metall-krona.webp', 'metall-ljus.webp']) {
    const kb = fs.statSync('assets/images/ranking-sixpack/' + f).size / 1024;
    assert.ok(kb < 40, `${f} är ${kb.toFixed(0)} kB — originalen var 2,2 MB och 1,5 MB`);
  }
});

test('ingen placeringssiffra i panelen — metallen är placeringen (som Royal Rose)', () => {
  const kod = fs.readFileSync('vyra-ranking-panel.js', 'utf8');
  assert.match(kod, /id !== 'royal-rose' && id !== 'metall' \? \[\{[^\]]*showRank/);
});

test('rörelsen respekterar "minska rörelse": alla metallanimationer står i no-preference-blocket', () => {
  const css = fs.readFileSync('ranking-sixpack.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const block = /@media\(prefers-reduced-motion:no-preference\)\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(block, 'no-preference-blocket saknas');
  const utanfor = css.replace(block[0], '');
  for (const namn of ['rk6-metall-svep', 'rk6-metall-reflex', 'rk6-metall-namn', 'rk6-metall-slag', 'rk6-metall-puls']) {
    assert.ok(block[1].includes(namn), `${namn} startas inte i blocket`);
    assert.doesNotMatch(utanfor, new RegExp('animation:' + namn), `${namn} startas utanför blocket och går även med "minska rörelse"`);
  }
});

test('listan lever: den som får poäng lyser i två sekunder, och en omkörning glider till sin nya plats', async () => {
  const h = rigg();
  const win = h.window, doc = h.document;
  // jsdom gör ingen layout: raderna står 68 px isär, som i designen, och animate() spelas in.
  const forut = Object.getOwnPropertyDescriptor(win.HTMLElement.prototype, 'offsetTop');
  Object.defineProperty(win.HTMLElement.prototype, 'offsetTop', { configurable: true,
    get() { const p = this.parentElement; return p ? [...p.children].indexOf(this) * 68 : 0; } });
  const glid = [];
  win.HTMLElement.prototype.animate = function (kf) { glid.push({ namn: this.querySelector('strong')?.textContent, fran: kf[0].transform }); return {}; };
  try {
    doc.body.insertAdjacentHTML('beforeend', win.wh({ id: 'gsb-live', type: 'templateTopLike', x: 0, y: 0, width: 250, likeCount: 5, skin: 'metall' }));
    const rot = doc.querySelector('[data-id="gsb-live"]');
    const rader = () => [...rot.querySelectorAll('.rk6-lista>.toplike-row')];
    // Exakt som live-leaderboard.js skriver: namnet i <strong>, talet i textnoden efter ikonen.
    const skriv = lista => rader().forEach((r, i) => {
      r.querySelector('strong').textContent = lista[i][0];
      r.querySelector('em').lastChild.nodeValue = ' ' + lista[i][1];
    });
    const aktiva = () => rader().filter(r => r.classList.contains('rk6-aktiv')).map(r => r.querySelector('strong').textContent);

    skriv([['Anya Plays', '998'], ['Kave', '833'], ['Lina Nordin', '721'], ['Omar_92', '657'], ['Sara K', '590']]);
    await vanta(60);
    assert.deepEqual(aktiva(), [], 'första gången listan fylls ska ingen lysa — ingen har ökat än');
    assert.equal(glid.length, 0, 'första gången listan fylls ska inget glida');

    // Sara K får 150 och går om Omar och Lina.
    skriv([['Anya Plays', '998'], ['Kave', '833'], ['Sara K', '740'], ['Lina Nordin', '721'], ['Omar_92', '657']]);
    await vanta(60);
    assert.deepEqual(aktiva(), ['Sara K'], 'bara den som fick poäng ska lysa');
    const sara = glid.find(g => g.namn === 'Sara K');
    assert.ok(sara, 'Sara K:s rad gled inte upp');
    assert.equal(sara.fran, 'translateY(136px)', 'Sara K ska glida från plats 5 (två rader ner)');
    assert.deepEqual(glid.filter(g => g.namn !== 'Sara K').map(g => g.namn).sort(), ['Lina Nordin', 'Omar_92'], 'de två som blev omkörda glider ner');

    // En miljon skrivs "1,2 mn" (formatNum) — det är mer än 999 999, inte 1,2.
    skriv([['Anya Plays', '1,2 mn'], ['Kave', '833'], ['Sara K', '740'], ['Lina Nordin', '721'], ['Omar_92', '657']]);
    await vanta(60);
    assert.ok(aktiva().includes('Anya Plays'), '"1,2 mn" lästes inte som en ökning');

    await vanta(2100);
    assert.deepEqual(aktiva(), [], 'ljuset ska slockna efter två sekunder');
  } finally {
    delete win.HTMLElement.prototype.animate;
    if (forut) Object.defineProperty(win.HTMLElement.prototype, 'offsetTop', forut);
    else delete win.HTMLElement.prototype.offsetTop;
  }
});
