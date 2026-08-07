'use strict';
// Kallkodsvakt: render() far inte anropas fran en oninput-handler.
//
// render() i studio.js ar `viewRoot.innerHTML = m[view]()` — den river hela vyn, inklusive
// egenskapspanelen. En oninput-handler kor vid VARJE pixel i en dragning, sa ett render()-anrop dar
// ersatter elementet anvandaren haller i innan dragningen ens borjat. Uppmatt i riktig Chrome pa
// Top Likes wsOutlineWidth: elementet var utbytt efter ett enda dragsteg, och panelens scrollTop
// gick fran 1408 till 0.
//
// Regeln ar en egenskap hos tradet, inte hos en korning — darfor en kallkodsskanning, precis som
// session-write-monopoly.test.js. Beteendet i sig provas i tests/browser/panel-controls.browser.test.js.
//
// ROTT NU: toplike-studio.js binder oninput-handlers som anropar render().
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');

// Panelfilerna. Enbart de som faktiskt binder egenskapskontroller — resten av klienten har sina
// egna renderingsvagar och ar inte det som provas har.
const FILER = ['media.js', 'premium-final.js', 'toplike-studio.js', 'gift-alert-frames.js',
  'widget-background.js', 'standalone-widgets.js'];

// Kommentarer bort, sa en fil som DOKUMENTERAR regeln inte anklagas for att bryta mot den.
//
// `[^\r\n]*`, INTE `.*$`: JS-punkten matchar inte \r, sa pa en CRLF-checkout matchade `$` aldrig och
// strippningen blev en no-op. Proven nedan ar assert.match — en kommentar som namner vyraLivePatch
// hade darfor kunnat halla vakten gron utan att funktionen fanns.
function kod(fil) {
  return fs.readFileSync(path.join(ROOT, fil), 'utf8')
    .split(/\r?\n/).map(rad => rad.replace(/^\s*\/\/[^\r\n]*/, '')).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

// En oninput-tilldelning och kroppen som foljer. Handlers ar skrivna bade som
// `el.oninput = e => {...}` och `el.oninput = e => uttryck`, sa vi tar med ett generost fonster
// och letar efter ett render()-anrop innan nasta bindning borjar.
function oninputKroppar(src) {
  const ut = [];
  const re = /\.oninput\s*=\s*/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index;
    const rest = src.slice(start, start + 400);
    // Klipp vid nasta handlerbindning sa vi inte laser in grannens kropp.
    const nasta = rest.slice(4).search(/\.(oninput|onchange|onclick|onpointerdown)\s*=/);
    ut.push({ index: start, kropp: nasta > -1 ? rest.slice(0, nasta + 4) : rest });
  }
  return ut;
}

const radFor = (src, index) => src.slice(0, index).split('\n').length;

test('render() anropas inte från någon oninput-handler', () => {
  const brott = [];
  for (const fil of FILER) {
    const src = kod(fil);
    for (const { index, kropp } of oninputKroppar(src)) {
      if (/(?:^|[^.\w])render\s*\(\s*\)/.test(kropp)) {
        brott.push(`${fil}:${radFor(src, index)}`);
      }
    }
  }
  assert.deepEqual(brott, [],
    'en oninput-handler bygger om hela vyn — elementet användaren drar i ersätts mitt i dragningen');
});

test('live-vägen finns och är den panelbindarna använder', () => {
  const media = kod('media.js');
  assert.match(media, /function\s+vyraLivePatch/,
    'ingen delad live-väg finns — då får varje bindare uppfinna sin egen och de glider isär igen');

  // Den generiska bindaren i media.js maste binda BADE input (live) och change (commit).
  // Utan oninput star px-etiketten och widgeten stilla tills man slapper, och kontrollen kanns dod.
  const bindare = media.slice(media.indexOf('function vyraLivePatch'));
  assert.match(media, /\.oninput\s*=/,
    'media.js binder ingen oninput alls — ingen live-förhandsvisning under dragningen');
  assert.ok(bindare.length > 0);
});

test('en full omrendering från panelen bevarar scroll och fokus', () => {
  const media = kod('media.js');
  assert.match(media, /function\s+vyraRenderKeepingPanel/,
    'ingen omrendering som bevarar panelens läge finns');
  const fn = media.slice(media.indexOf('function vyraRenderKeepingPanel'), media.indexOf('function vyraRenderKeepingPanel') + 800);
  assert.match(fn, /scrollTop/, 'omrenderingen läser/återställer inte scrollTop');
  assert.match(fn, /activeElement|focus\s*\(/, 'omrenderingen återställer inte fokus');
});
