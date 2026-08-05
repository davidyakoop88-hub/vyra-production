'use strict';
// Miniatyrerna i widgetkatalogen ritades aldrig. Noll av 136 knappar hade en, i produktion.
//
// Orsaken ar en rad jag sjalv skrev i PR #69:
//
//   if (d.catalogKey) {
//     try { return root.VyraWidgets.create(d.catalogKey) } catch (e) { return null }
//   }
//
// overlay-preview.js ar INGEN IIFE - den ar ett vanligt toppnivaskript och har inget `root`.
// root.VyraWidgets kastar alltsa ReferenceError for varje knapp, try/catch sväljer det, och
// resolvern returnerar null. owgRenderCardThumb ger da upp innan den ritat nagot.
//
// Att felet overlevde beror pa hur jag verifierade #69: jag injicerade min EGEN kopia av resolvern
// i sidan - en som anvande window - och matte den. Den levererade koden kordes aldrig. Testet
// nedan kor filen som den ligger.
//
// jsdom har ingen IntersectionObserver. Stubben som ges nedan loser ut direkt vid observe(), vilket
// ar precis vad som gor testet meningsfullt: det matar hela vagen fran knapp till ritad miniatyr.
//
// ROTT NU.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');

test.after(closeAll);

function katalogMedMiniatyrer() {
  const h = createDom({ url: 'https://vyralive.app/studio.html', state: { widgets: [], projectName: 'thumb' } });
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };

  // Loser ut direkt: en observer som aldrig fyrar hade gjort testet gront utan att rita nagot.
  run(`window.IntersectionObserver = function (cb) {
    this.observe = el => cb([{ isIntersecting: true, target: el }], this);
    this.unobserve = () => {}; this.disconnect = () => {};
  };`);

  h.load('overlay-sanitize.js');
  h.load('custom-widgets.js');
  h.load('last-x-alerts.js');
  h.load('gift-fireworks.js');
  h.load('premium-final.js');
  h.load('overlay-preview.js');
  // OVERLAY-vyn: styleOverlayCatalogCards() letar efter .overlay-widget-gallery .widget-catalog
  // och gor ingenting i editorvyn. Med view='editor' ritades noll miniatyrer oavsett kod.
  run(`view='overlay';selected=null;render();bind();`);
  return h;
}

test('resolvern refererar inget som inte finns i filen', () => {
  // Den direkta orsaken, som statisk kontroll: `root` ar inte deklarerat nagonstans i filen, sa
  // varje anvandning av det kastar. try/catch runt anropet gor felet osynligt.
  const rakall = fs.readFileSync(path.join(ROOT, 'overlay-preview.js'), 'utf8');
  // Kommentarer bort forst. Vakten trafffade tidigare pa prosa — meningen "en shadow root. Den
  // finns inte i dokumentet" innehaller `root.` och gjorde testet rott for korrekt kod. Vad som
  // KORS ar det enda som kan kasta ReferenceError.
  const kall = rakall.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const deklarerar = /(^|\W)(const|let|var|function)\s+root\W/.test(kall) ||
    /\(function\s*\([^)]*\broot\b/.test(kall);
  const anvander = /\broot\s*\./.test(kall);

  assert.equal(anvander && !deklarerar, false,
    'overlay-preview.js anvander `root` utan att deklarera det — varje traff kastar ' +
    'ReferenceError, och try/catch runt anropet gor det osynligt');
});

test('varje katalogknapp far en miniatyr', () => {
  const h = katalogMedMiniatyrer();
  const knappar = h.document.querySelectorAll('.widget-catalog button').length;
  const miniatyrer = h.document.querySelectorAll('.widget-catalog .owg-thumb').length;

  assert.ok(knappar > 100, `bara ${knappar} knappar byggdes — testet mater nastan ingenting`);
  assert.equal(miniatyrer, knappar,
    `${miniatyrer} miniatyrer av ${knappar} knappar — en knapp utan miniatyr visar en generisk ikon ` +
    'i stallet for hur widgeten faktiskt ser ut');
});

test('miniatyren ersatter ikonen, den laggs inte ovanpa', () => {
  const h = katalogMedMiniatyrer();
  const kvar = [...h.document.querySelectorAll('.widget-catalog button')]
    // Bara kortets EGEN ikon raknas. querySelector('i') traffar aven <i> inuti miniatyren -
    // fyrverkeriets partiklar ar <i> - och gjorde testet rott for ratt kod.
    .filter(b => b.querySelector('.owg-thumb') &&
      [...b.children].some(c => c.tagName === 'I')).length;

  assert.equal(kvar, 0, `${kvar} knappar har bade miniatyr och ikon`);
});

test('att rita miniatyrerna ror inte anvandarens layout', () => {
  // Hela poangen med PR #69: previewen far inte ga via layouten. Med observern som loser ut direkt
  // ritas varje kort har, sa det ar ratt plats att kontrollera det pa igen.
  const h = katalogMedMiniatyrer();
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`window.__l = { minnet: state.widgets.length,
    lagring: (JSON.parse(localStorage.getItem('vyra-state') || '{}').widgets || []).length }`);

  // Kopieras till var realm forst: assert/strict jamfor prototyper, och ett objekt fran
  // jsdom-realmen har en annan Object.prototype an vart.
  assert.deepEqual({ ...h.window.__l }, { minnet: 0, lagring: 0 },
    'katalogen la widgets i layouten nar miniatyrerna ritades');
});
