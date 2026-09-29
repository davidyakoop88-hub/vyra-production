'use strict';
// MYNTIKONEN OVERLEVDE INTE FORSTA LIVEVARDET. Top Coins v2 (topcoins-v2.js) ritar sin rad som
// <em><i>V</i>44 999 COINS</em>: myntet ar ett stylat <i> (rund guldbricka, topcoins-v2.css).
// live-leaderboard.js skrev talet med `em.textContent = ikon + ' ' + tal`, och textContent river
// ALLA barn — <i> forsvann och myntet blev ett vanligt "V" i lopande text. Ikonen hamtades
// dessutom ur textContent.trim().split(' ')[0], som for "V44 999 COINS" ar "V44", inte "V".
// Uppmatt 2026-09-20 under arbetet med PR #487. Nollningsgrenen (!top.length i overlay) skrev
// ikon + ' 0' pa samma satt och rev ikonen likadant.
//
// Regeln som provas: finns ett <i> forst i <em> star det kvar och talet skrivs i textnoden EFTER
// det, i bada grenarna. Top Like-raderna har inget <i> (ikonen ar text, ♥) och ska bete sig
// exakt som forut.
//
// Provet kor i jsdom med de riktiga filerna: Top Coins v2 ritar via VyraTopCoins.topCoinsHtml i
// overlay-lage, och leaderboarden drivs via samma event som i drift (vyra-live-event +
// vyra-live-repaint). updateLiveLeaderboards ar inte exporterad, och det ar med flit.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const las = fil => fs.readFileSync(path.join(ROOT, fil), 'utf8');
const SANITIZE = las('overlay-sanitize.js');
const TOPCOINS = las('topcoins-v2.js');
const LEADERBOARD = las('live-leaderboard.js');

// Ett overlay-fonster (?overlay i URL:en ar VYRA_OVERLAY:s enda sanning) med de globala symboler
// topcoins-v2.js och live-leaderboard.js laser vid laddning. `fetch` saknas i jsdom och anropas
// pa toppniva i live-leaderboard.js — utan attrapp dor hela IIFE:n innan lyssnarna registreras,
// och provet skulle mata en leaderboard som aldrig kopplats in. Darfor kontrolleras att bada
// filerna kom hela vagen fram innan nagot mats.
function overlayFonster(widgets) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'https://vyralive.app/studio.html?overlay=1', runScripts: 'outside-only' });
  const w = dom.window;
  w.fetch = () => Promise.reject(new Error('ingen server i provet'));
  w.eval(`var state = ${JSON.stringify({ widgets })};
    var selected = null; var view = 'overlay';
    var wh = () => ''; var props = () => ''; var bind = () => {};
    var liveWidget = id => state.widgets.find(x => x.id === id);`);
  w.eval(SANITIZE);
  w.eval(TOPCOINS);
  w.eval(LEADERBOARD);
  assert.ok(w.VyraTopCoins, 'topcoins-v2.js laddades inte — provet mater ingenting');
  assert.ok(w.VyraLeaderboard, 'live-leaderboard.js laddades inte hela vagen — provet mater ingenting');
  return { dom, w };
}

const handelse = (w, detail) => w.dispatchEvent(new w.CustomEvent('vyra-live-event', { detail }));
const malaOm = w => w.dispatchEvent(new w.Event('vyra-live-repaint'));
const TOPCOINS_WIDGET = { id: 'tc1', type: 'templateTopCoins', topCoinsDesign: 'halo', useLiveData: true, liveMetric: 'coins' };

test('Top Coins v2: <i>-myntet star kvar och livevardet skrivs i textnoden efter det', () => {
  const { dom, w } = overlayFonster([TOPCOINS_WIDGET]);
  try {
    w.document.body.innerHTML = w.VyraTopCoins.topCoinsHtml(TOPCOINS_WIDGET);
    const em = w.document.querySelector('.toplike-row em');
    assert.ok(em && em.querySelector('i'), 'forutsattningen brast: Top Coins v2 ritar inte langre <i> i <em>');

    handelse(w, { type: 'gift', username: 'maya', name: 'Maya', coins: 12300 });
    malaOm(w);

    assert.equal(w.document.querySelector('.toplike-row strong').textContent, 'Maya',
      'leaderboarden skrev aldrig raden — provet nadde inte skrivvagen');
    const ikon = em.querySelector('i');
    assert.ok(ikon, 'myntikonen <i> revs av skrivningen: textContent byter ut alla barn');
    assert.equal(ikon.textContent, 'V');
    assert.equal(em.textContent, 'V 12.3K');
    assert.equal(em.lastChild.nodeType, 3, 'talet ska ligga i en textnod efter <i>');
    assert.equal(em.lastChild.nodeValue, ' 12.3K');
  } finally { dom.window.close(); }
});

test('Top Coins v2 i overlay utan livedata: nollningen behaller <i>, skriver "V 0" och skriver inte om samma varde', () => {
  const { dom, w } = overlayFonster([TOPCOINS_WIDGET]);
  try {
    w.document.body.innerHTML = w.VyraTopCoins.topCoinsHtml(TOPCOINS_WIDGET);
    const em = w.document.querySelector('.toplike-row em');
    assert.ok(em && em.querySelector('i'), 'forutsattningen brast: Top Coins v2 ritar inte langre <i> i <em>');

    malaOm(w);

    assert.equal(w.document.querySelector('.toplike-row strong').textContent, '',
      'nollningen nadde aldrig raden — provet mater ingenting');
    assert.ok(em.querySelector('i'), 'myntikonen <i> revs av nollningen');
    assert.equal(em.textContent, 'V 0');

    // Andra varvet med oforandrat varde far inte rora DOM:en: en identisk skrivning ar anda en
    // mutation som vacker observatorer som kallar hit igen (regeln vid `satt` i live-leaderboard.js).
    const vakt = new w.MutationObserver(() => {});
    vakt.observe(em, { childList: true, characterData: true, subtree: true });
    malaOm(w);
    assert.equal(vakt.takeRecords().length, 0, 'nollningen skrev om raden fast den redan stod pa "V 0"');
    vakt.disconnect();
  } finally { dom.window.close(); }
});

test('Top Like: <em>♥ 0</em> far "♥ 98.7K" utan strukturandring', () => {
  const widget = { id: 'tl1', type: 'templateTopLike', useLiveData: true, liveMetric: 'likes' };
  const { dom, w } = overlayFonster([widget]);
  try {
    w.document.body.innerHTML = '<div class="widget vyra-toplike" data-id="tl1"><div class="toplike-list">'
      + '<div class="toplike-row"><strong>Alex</strong><small>@alex</small><em>♥ 0</em></div></div></div>';

    handelse(w, { type: 'like', username: 'alex', name: 'Alex', count: 98700 });
    malaOm(w);

    const em = w.document.querySelector('.toplike-row em');
    assert.equal(em.textContent, '♥ 98.7K');
    assert.equal(em.childNodes.length, 1, 'Top Like-raden fick fler barn an sin enda textnod');
    assert.equal(em.firstChild.nodeType, 3, 'Top Like-radens enda barn ska vara en textnod');
    assert.equal(em.children.length, 0, 'ett element smog in i en Top Like-rad');
  } finally { dom.window.close(); }
});
