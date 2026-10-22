'use strict';
// HEART ME: VARJE TEMA SKA GÅ ATT KÄNNA IGEN (slutgranskningen, 2026-10-23).
//
// Fyra teman såg nästan likadana ut: Dark (#b331ff) och Galax (#a764ff) var båda lila, Hav låg mellan
// Is och Frost och Citrus (#ffb020) var samma orange som Guld (#ffbd2e). Dark är nu svart med glödröd
// accent, Hav turkos, Midnatt blå och Citrus limegrön.
//
// Provet låser fast:
//   1. inga två teman har nästan samma accentfärg (RGB-avstånd under 60),
//   2. Dark är svart: pillen får en svart botten, och accenten är inte lila,
//   3. fabrikens register och renderarens tabell är samma färger,
//   4. en SPARAD widget bär temats gamla standardfärg i heartColor/heartNumberColor (fabriken
//      sparade den). Den läses som temats nya färg — men en färg användaren själv valt står kvar.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const { createDom, closeAll, heartGoal } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));

test.after(closeAll);

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const avstand = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
const nyans = hex => {
  const [r, g, b] = rgb(hex).map(v => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

let h;
test.before(() => { h = createDom({ state: { widgets: [], projectName: 'test' } }); });
const teman = () => {
  const s = h.document.createElement('script');
  s.textContent = 'window.__teman = JSON.stringify(heartThemes)';
  h.document.body.append(s);
  return JSON.parse(h.window.__teman);
};

test('inga två Heart Me-teman har nästan samma accentfärg', () => {
  const t = teman(), namn = Object.keys(t);
  assert.equal(namn.length, 12);
  const nara = [];
  for (let i = 0; i < namn.length; i++) for (let j = i + 1; j < namn.length; j++) {
    const d = avstand(t[namn[i]][0], t[namn[j]][0]);
    if (d < 60) nara.push(`${namn[i]}/${namn[j]} (${Math.round(d)})`);
  }
  assert.deepEqual(nara, [], 'teman som ser likadana ut');
});

test('Dark är svart med egen accent — inte lila som Galax', () => {
  const t = teman();
  const h1 = nyans(t.dark[0]);
  assert.ok(!(h1 > 250 && h1 < 300), `Darks accent är lila (nyans ${Math.round(h1)})`);
  assert.ok(avstand(t.dark[0], t.galaxy[0]) > 150, 'Dark och Galax ligger för nära varandra');
  const box = h.paint([heartGoal('hd', { heartTheme: 'dark', heartColor: t.dark[0] })]).querySelector('[data-id="hd"]');
  const pill = box.querySelector('.heart-goal-copy');
  assert.match(pill.getAttribute('style') || '', /background:linear-gradient\(110deg,#0[0-9a-f]{5}/, 'Darks pill har ingen svart botten');
  const galax = h.paint([heartGoal('hg', { heartTheme: 'galaxy', heartColor: t.galaxy[0] })]).querySelector('[data-id="hg"] .heart-goal-copy');
  assert.equal(galax.getAttribute('style'), null, 'bara Dark ska ha den svarta pillen');
});

test('fabrikens register och renderarens tabell har samma färger', () => {
  const t = teman(), reg = VyraWidgets.variants('heartgoal.theme');
  for (const namn of Object.keys(t)) {
    const w = VyraWidgets.create('catalog:heartgoal:' + namn);
    assert.equal(w.heartColor, t[namn][0], namn + ': fabriken sparar en annan färg än renderaren visar');
    assert.ok(reg[namn], namn + ' saknas i fabrikens register');
  }
});

const heartVar = box => (box.getAttribute('style').match(/--heart:([^;]+)/) || [])[1];
const talVar = box => (box.getAttribute('style').match(/--heart-number:([^;]+)/) || [])[1];

for (const [tema, gammal] of [['dark', '#b331ff'], ['ocean', '#2caeff'], ['midnight', '#5b6bff'], ['citrus', '#ffb020']]) {
  test(`en sparad ${tema}-widget med den gamla standardfärgen får temats nya färg`, () => {
    const t = teman();
    const box = h.paint([heartGoal('ho', { heartTheme: tema, heartColor: gammal, heartTextColor: '#ffffff', heartNumberColor: gammal })])
      .querySelector('[data-id="ho"]');
    assert.equal(heartVar(box), t[tema][0]);
    assert.equal(talVar(box), '#ffffff', 'talet ska vara vitt som för en ny widget, inte den gamla färgen');
  });
}

test('en egen färg på en sparad Dark-widget står kvar', () => {
  const box = h.paint([heartGoal('he', { heartTheme: 'dark', heartColor: '#123456', heartNumberColor: '#abcdef' })])
    .querySelector('[data-id="he"]');
  assert.equal(heartVar(box), '#123456');
  assert.equal(talVar(box), '#abcdef');
});

test('den gamla lila färgen är egen färg i ett tema där den aldrig var standard', () => {
  const box = h.paint([heartGoal('hc', { heartTheme: 'classic', heartColor: '#b331ff' })]).querySelector('[data-id="hc"]');
  assert.equal(heartVar(box), '#b331ff');
});
