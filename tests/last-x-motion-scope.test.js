'use strict';
// Varje Last-X-design ska köra sin egen rörelse.
//
// last-x-alerts.css är en port av public/widgets/last-x-alerts.html. I OBS-filen sitter designens
// scope på <html> (`html[data-design="card"] #card.show #tilt`), vilket räcker där eftersom en
// OBS-sida bara har en widget. I Studio kan canvasen ha flera Last-X samtidigt, så scopet måste bli
// en klass på widgeten. Stilreglerna portades så — `.last-x-widget.design-royal .last-x-tilt` finns
// och är rätt — men ANIMATIONSreglerna tappade sin design och blev `.last-x-active .last-x-tilt`.
//
// Tio regler, alla med samma specificitet (0,2,0) och ingen design. Vid lika specificitet vinner
// den sista, och royalholo ligger sist. Följden, mätt i webbläsaren på main:
//
//   card, stack och royal kör alla lx-royalholo
//   varje designs avatar kör lx-coin
//   varje designs .last-x-glass kör lx-shadowbreath — och för royal ÄR .last-x-glass
//   kröningskonstverket, som därför ritas 200 px åt vänster på 55 % opacitet
//
// Den befintliga Last-X-sviten läser källkod och DOM och kan inte se det här: felet finns bara i
// kaskaden. jsdom löser kaskaden, så länge man läser `animation` och inte `animationName`.
//
// RÖTT NU: card kör royals animation, och royals konstverk animeras av stackens markskugga.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'last-x-alerts.css'), 'utf8');
const OBS = fs.readFileSync(path.join(ROOT, 'public/widgets/last-x-alerts.html'), 'utf8');

const DESIGNS = ['card', 'stack', 'skew', 'badge', 'royal'];

let dom;
test.before(() => {
  dom = new JSDOM(`<!doctype html><html><head><style>${CSS}</style></head><body>${
    DESIGNS.map(d => `
      <div class="widget last-x-widget design-${d} entrance-fade last-x-active" data-id="lx-${d}">
        <div class="last-x-tilt">
          <div class="last-x-glass"><div class="last-x-sheen"></div><div class="last-x-gleam"></div></div>
          <div class="last-x-avatar"><span class="last-x-initial">A</span><img alt=""></div>
          <div class="last-x-copy"><div class="last-x-label">L</div></div>
          <div class="last-x-emblem">✦</div>
        </div></div>`).join('')
  }</body></html>`);
});
test.after(() => { try { dom.window.close() } catch (_) {} });

// jsdom fyller animationName med 'none' men löser shorthanden korrekt — läs den.
const anim = (design, sel) => {
  const box = dom.window.document.querySelector(`.design-${design}`);
  const el = sel ? box.querySelector(sel) : box;
  return dom.window.getComputedStyle(el).animation || '';
};

// Facit är OBS-filen: den är korrekt scopad och är den som Studio porterades från.
const EXPECTED = {
  card:   { '.last-x-tilt': 'lx-holo',       '.last-x-gleam': 'lx-glide' },
  stack:  { '.last-x-tilt': 'lx-hover3d',    '.last-x-avatar': 'lx-coin',
            '.last-x-glass': 'lx-shadowbreath' },
  skew:   { '.last-x-tilt': 'lx-swing3d' },
  badge:  { '.last-x-tilt': 'lx-flipin' },
  royal:  { '.last-x-tilt': 'lx-royal-enter' }
};

for (const [design, map] of Object.entries(EXPECTED)) {
  for (const [sel, keyframe] of Object.entries(map)) {
    test(`${design} ${sel} kör ${keyframe}`, () => {
      assert.match(anim(design, sel), new RegExp(keyframe),
        `${design} fick "${anim(design, sel)}" — designernas animationer läcker mellan varandra`);
    });
  }
}

test('ingen design ärver royals rörelse', () => {
  for (const d of DESIGNS.filter(x => x !== 'royal')) {
    assert.doesNotMatch(anim(d, '.last-x-tilt'), /lx-royalholo|lx-royal-enter/,
      `${d} kör royals animation`);
  }
});

test('royals konstverk animeras inte av stackens markskugga', () => {
  // .last-x-glass är en liten skugga i stack men SJÄLVA kröningsbilden i royal. lx-shadowbreath
  // sätter translateX(-50%) och opacity .55 — konstverket hamnar halvvägs utanför sin egen ram.
  assert.doesNotMatch(anim('royal', '.last-x-glass'), /lx-shadowbreath/,
    'kröningsbilden förskjuts och tonas ned av en animation som hör till stack');
  for (const d of ['card', 'skew', 'badge']) {
    assert.doesNotMatch(anim(d, '.last-x-glass'), /lx-shadowbreath/, `${d} fick stackens markskugga`);
  }
});

test('bara stackens avatar myntsnurrar', () => {
  for (const d of DESIGNS.filter(x => x !== 'stack')) {
    assert.doesNotMatch(anim(d, '.last-x-avatar'), /lx-coin/, `${d}:s avatar snurrar som stackens`);
  }
});

test('royal loopar inte längre — rörelsen hör till entrén', () => {
  const a = anim('royal', '.last-x-tilt');
  assert.doesNotMatch(a, /infinite/, 'royal pendlar fortfarande i all oändlighet');
  assert.match(a, /both/, 'entrén ska hålla sitt sluttillstånd, annars hoppar widgeten tillbaka');
});

// De två globala rörelserna ska förbli globala — de gäller alla designer i OBS-filen också, och
// döljs där de inte hör hemma med display:none i stället för med scope.
test('sheen och emblem är fortsatt globala', () => {
  assert.match(anim('card', '.last-x-sheen'), /lx-sheen/);
  assert.match(anim('card', '.last-x-emblem'), /lx-twirl/);
});

// ---- strukturellt: Studio ska scopa exakt det OBS-filen scopar ------------------------------------
test('varje designspecifik animationsregel i Studio bär sin design', () => {
  const strip = s => s.split('\n').map(l => l.replace(/\r$/, '')).join('\n');
  const obsScoped = [...strip(OBS).matchAll(/html\[data-design="([a-z]+)"\][^{]*\{animation:([a-z0-9-]+)/g)]
    .map(m => m[2]);
  assert.ok(obsScoped.length >= 10, `OBS-filen scopar bara ${obsScoped.length} regler — facit saknas`);

  const unscoped = [...strip(CSS).matchAll(/^\.last-x-active [^{]*\{animation:(lx-[a-z0-9-]+)/gm)]
    .map(m => m[1]);
  const leaked = unscoped.filter(name => obsScoped.includes(name.replace(/^lx-/, '')));
  assert.deepEqual(leaked, [],
    `dessa är designspecifika i OBS men oscopade i Studio: ${leaked.join(', ')}`);
});
