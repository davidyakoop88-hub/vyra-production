'use strict';
// Widgeten ska rendera fritt i sandningen — inget ritat foder runt innehallet.
//
// html.overlay-output .widget (studio.css) har redan tagit bort CSS-ramen, bakgrunden och skuggan
// pa sjalva wrappern. Uppmatt i riktig webblasare: border 0px none, background rgba(0,0,0,0),
// box-shadow none. Det som ANDA syns runt Top Gift ar ingen CSS-border utan en inline-SVG som
// gift-alert-chrome.js injicerar i markupen — ett barnelement, sa .widget-strippen nar den aldrig:
//
//   royalFrame     <rect> med horprickar, position:absolute inset:0 → en ram runt hela widgeten
//   gaf-crown-badge  krona pa top:-27px → utanfor ladan, ovanfor ramen
//
// Innehallet (avatarring, rank-badge, ornament) ar design och ska sta kvar.
//
// ROTT NU: bada injiceras fortfarande.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness');

const ROOT = path.join(__dirname, '..');
const CHROME = fs.readFileSync(path.join(ROOT, 'gift-alert-chrome.js'), 'utf8');

test.after(closeAll);

const topGift = (over = {}) => ({ id: 'tg1', type: 'templateTopGift', x: 10, y: 20, width: 280, ...over });

function render(widget) {
  const h = createDom({ url: 'https://vyralive.app/studio.html?overlay=1' });
  // Samma kedja som media.js:820 laddar i produktion. Utan premium-final.js ritas Top Gift av
  // media.js gamla bastemplate i stallet for den som faktiskt syns i sandningen.
  h.load('overlay-sanitize.js');
  h.load('premium-final.js');
  h.load('gift-alert-chrome.js');
  const canvas = h.paint([widget]);
  return { h, el: canvas.querySelector('.widget') };
}

test('Top Gift ritar ingen ram runt widgeten', () => {
  const { el } = render(topGift());
  assert.equal(el.querySelector('.gaf-royal-frame'), null,
    'royalFrame-SVG:n ritar fortfarande en kant runt hela widgeten');
});

test('Top Gift har ingen flytande krona ovanfor lådan', () => {
  const { el } = render(topGift());
  assert.equal(el.querySelector('.gaf-crown-badge'), null,
    'kronan sitter kvar utanför containern');
});

test('inget kvarvarande barn ritar en heltäckande kant runt widgeten', () => {
  const { el } = render(topGift());
  const frames = [...el.children].filter(child => {
    const style = child.getAttribute('style') || '';
    return /position:\s*absolute/.test(style) && /inset:\s*0/.test(style) && /stroke=/.test(child.outerHTML);
  });
  assert.deepEqual(frames.map(f => f.getAttribute('class') || f.tagName), [],
    'ett barnelement ritar fortfarande en ram över hela widgetytan');
});

test('innehållet är orört — bara ramen och kronan togs bort', () => {
  const { el } = render(topGift());
  assert.ok(el.querySelector('.vyra-gift-title'), 'titeln försvann');
  assert.ok(el.querySelector('.vyra-flip'), 'gåvan/profilbilden försvann');
  assert.ok(el.querySelector('.topgift-copy'), 'namn- och värderaden försvann');
  assert.ok(el.querySelector('.topgift-ornament'), 'ornamenten är innehåll och ska stå kvar');
});

test('den övriga SVG-chromen är kvar — den sitter i innehållet, inte runt det', () => {
  for (const name of ['flameBadge', 'spotlightBeam', 'fanBurst', 'orbitRing']) {
    assert.match(CHROME, new RegExp(`const ${name}\\s*=`),
      `${name} togs bort — den är dekor inuti widgeten, inte en ram runt den`);
  }
});

// Teckenkronan låg dold BAKOM SVG-kronan (top:-25px mot -27px) och blev synlig först när den
// senare togs bort. Dämpningsregeln i gift-alert-chrome.js var scopad till `.theme-royal`, en klass
// renderaren aldrig sätter — den matchade alltså aldrig någonting.
test('Top Gift har ingen CSS-krona kvar heller', () => {
  const css = fs.readFileSync(path.join(ROOT, 'studio.css'), 'utf8');
  assert.equal(/\.vyra-topgift\.topgift-royal[^{}]*:before\{[^{}]*content:\s*"♛"/.test(css), false,
    'teckenkronan ritas fortfarande ovanför widgeten');
  assert.equal(/theme-royal[^{}]*\.vyra-flip:before/.test(CHROME), false,
    'den döda dämpningsregeln ligger kvar och pekar på en klass som aldrig sätts');
});

test('ingen död konstant lämnas kvar efter borttagningen', () => {
  for (const name of ['crownBadge', 'royalFrame']) {
    assert.equal(new RegExp(`const ${name}\\s*=`).test(CHROME), false,
      `${name} definieras fortfarande men används inte längre`);
  }
});
