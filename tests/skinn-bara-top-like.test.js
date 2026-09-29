'use strict';
// SKINNKLASSEN STAMPLADES PA FAMILJER SOM BAR SIN EGEN DESIGN.
//
// `toplike-studio.js` injicerar `skin-<id>` pa alla RANKING_TYPES, och `skin` faller tillbaka pa
// 'clean-bar' nar widgetens `skin` inte ar ett kant skinn-id. Top Coins v2 och Top Points v2 skriver
// bada sin DESIGN i samma falt ('halo', 'podium', …) — aldrig ett skinn-id — sa bada fick
// `skin-clean-bar`.
//
// For Top Coins lagades det i #493 med ett undantag som namnde just den typen. Top Points fick sina
// fyra designer i #492 och foll darfor igenom pa exakt samma satt.
//
// UPPMATT 2026-09-22 i pinnad Chromium, samma nod med och utan klassen:
//   clean   250x185 -> 300x185      podium  250x208 -> 300x208
//   center  250x210 -> 300x210      neon    250x205 -> 300x205
// .widget.vyra-toplike.skin-clean-bar{width:250px!important} slar designens egen bredd, som
// katalogen satter som inline-stil.
//
// REGELN SOM PROVAS: bara templateTopLike bar ett skinn. De andra tva rankingfamiljerna far ingen
// skin-klass alls.
//
// KLART NAR: bada halvorna faller. Ett prov som bara mater franvaron hade varit gront aven om hela
// injektionen togs bort — darfor mater tre av proven att Top Like FORTFARANDE far sin klass, aven
// med ett pensionerat eller saknat skinn.
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
test.after(closeAll);

// Laddordningen i studio.html: topcoins-v2 och toppoints-v2 efter media.js, toplike-studio sist.
// Sist betyder YTTERST i wh-kedjan, alltsa den som stamplar efter att de andra ritat — det ar den
// ordningen buggen bor i, och darfor den provet maste anvanda.
let harness = null;
function rigg() {
  if (harness) return harness;
  const h = createDom({ state: { widgets: [], projectName: 'skinn-scope' } });
  h.load('overlay-sanitize.js');
  h.load('toplike-design.js');
  h.load('topcoins-v2.js');
  h.load('toppoints-v2.js');
  h.load('toplike-studio.js');
  harness = h;
  return h;
}

// Klasserna las ur den RENDERADE noden, inte ur strangen: det ar noden CSS:en traffar, och en
// regex mot html hade inte sett skillnad pa widgetens klassattribut och en swatch langre in.
function skinnklasser(w) {
  const h = rigg();
  const host = h.document.createElement('div');
  host.innerHTML = h.window.wh(w);
  const el = host.querySelector('[data-id]');
  assert.ok(el, 'widgeten renderades inte alls — provet mater ingenting');
  return [...el.classList].filter(c => c.startsWith('skin-'));
}

const topLike = over => ({ id: 'tl', type: 'templateTopLike', x: 0, y: 0, width: 300, likeCount: 3, ...over });
const topCoins = design => ({ id: 'tc-' + design, type: 'templateTopCoins', x: 0, y: 0, width: 300,
  likeCount: 3, topCoinsDesign: design, skin: design, likeTheme: design });
const topPoints = design => ({ id: 'tp-' + design, type: 'templateTopPoints', x: 0, y: 0, width: 300,
  likeCount: 5, topPointsDesign: design, skin: design, likeTheme: design });

// ---- de tva familjer som bar sin egen design ------------------------------------------------
for (const design of ['halo', 'signal-orbit']) {
  test(`Top Coins (${design}) far ingen skinnklass`, () => {
    assert.deepEqual(skinnklasser(topCoins(design)), [],
      'en frammande design stamplades pa widgeten och slar dess egen bredd');
  });
}

for (const design of ['clean', 'center', 'podium', 'neon']) {
  test(`Top Points (${design}) far ingen skinnklass`, () => {
    assert.deepEqual(skinnklasser(topPoints(design)), [],
      'skin-clean-bar klamde widgeten till 250 px i stallet for designens 300');
  });
}

// ---- och den familj som faktiskt bar ett skinn ------------------------------------------------
test('Top Like far sitt valda skinn', () => {
  // Soft Stack m.fl. ar pensionerade 2026-09-24 — provet anvander ett skinn som finns kvar.
  assert.deepEqual(skinnklasser(topLike({ skin: 'voltage' })), ['skin-voltage']);
});

test('Top Like utan skinn faller tillbaka pa clean-bar', () => {
  assert.deepEqual(skinnklasser(topLike({})), ['skin-clean-bar'],
    'en widget utan skinn ska stylas, inte sta oskyddad');
});

test('Top Like med ett PENSIONERAT skinn faller tillbaka pa clean-bar', () => {
  // Samma klamning som approved-rankings.js gor (LIKE_SKINS.has(w.skin) ? w.skin : 'clean-bar').
  // Den har halvan ar skalet att regeln inte far vara en sanningstest pa SKIN_IDS.has(w.skin):
  // da hade en sparad layout med 'royal-gold' blivit helt ostylad i stallet for clean-bar.
  assert.deepEqual(skinnklasser(topLike({ skin: 'royal-gold' })), ['skin-clean-bar']);
});

// ---- skinnvaljaren i panelen ------------------------------------------------------------------
// Samma regel, andra anden: ritas ingen skinnklass ska heller ingen skinnvaljare ritas. Gruppen
// gjorde ingenting i Top Coins och Top Points, och skrev anda `w.skin` — samma falt som de tva
// familjerna bar sin EGEN design i.
// `state`, `selected` och `view` ar top-level const/let i studio.js och ligger darfor i det delade
// lexikala scopet, inte pa window (se dom-harness.js huvudkommentar). Panelen byggs alltsa av ett
// injicerat skript, med den RIKTIGA props()-kedjan — samma monster som campaign-gift-picker-provet.
function panel(w) {
  const h = rigg();
  const script = h.document.createElement('script');
  script.textContent = `view='editor';`
    + `Object.keys(state).forEach(k=>delete state[k]);`
    + `Object.assign(state, ${JSON.stringify({ widgets: [w] })});`
    + `selected=${JSON.stringify(w.id)};`
    + `window.__panel = props();`;
  h.document.body.append(script);
  const html = h.window.__panel;
  assert.equal(typeof html, 'string', 'panelen byggdes aldrig — provet mater ingenting');
  return html;
}

test('skinnvaljaren ritas for Top Like', () => {
  const html = panel(topLike({ skin: 'voltage' }));
  assert.match(html, /DESIGN · VÄLJ TEMA/, 'Top Like tappade sin temavaljare');
  assert.match(html, /data-ws-skin="voltage"/);
  // De pensionerade gar inte att valja i panelen.
  assert.doesNotMatch(html, /data-ws-skin="(clean-bar|soft-stack|mini-podium|side-rank)"/);
});

for (const [namn, w] of [['Top Coins', topCoins('halo')], ['Top Points', topPoints('podium')]]) {
  test(`skinnvaljaren ritas INTE for ${namn}`, () => {
    const html = panel(w);
    assert.doesNotMatch(html, /DESIGN · VÄLJ TEMA/,
      'dod UI: swatcharna gor ingenting och skriver over widgetens egen design');
    assert.doesNotMatch(html, /data-ws-skin=/);
  });
}

test('entreanimationen foljer med oavsett familj — den ar en rorelse, inte en design', () => {
  const h = rigg();
  for (const w of [topLike({ skin: 'soft-stack', entranceAnimation: 'pop' }),
                   Object.assign(topPoints('podium'), { entranceAnimation: 'pop' })]) {
    const host = h.document.createElement('div');
    host.innerHTML = h.window.wh(w);
    const el = host.querySelector('[data-id]');
    assert.ok(el.classList.contains('ws-anim-pop'),
      `${w.type} tappade sin intradeseffekt nar skinnregeln andrades`);
  }
});
