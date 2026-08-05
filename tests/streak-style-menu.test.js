'use strict';
// VYRA TOP STREAK — tva kataloger som inte kanner till varandra.
//
// Det finns fjorton streakdesigner, och de bor pa varsitt hall:
//
//   premium   liquid, momentum, tier, thread, chrono, chain, thermo    10 CSS-regler totalt
//   klassiska inferno, neon, ice, royal, sakura-rail, cyber-grid, storm 58 CSS-regler totalt
//
// Bada katalogerna skriver till .streak-template-section, och premium-final.js kor sist - sa de
// klassiska syns aldrig i widgetkatalogen. De finns bara i en "Stil"-meny som media.js smyger in i
// DESIGN-gruppen, och DEN listar bara de sju klassiska.
//
// Uppmatt i produktion med en liquid-widget vald:
//
//   widgetens tema:        liquid
//   menyns alternativ:     inferno, neon, ice, royal, sakura-rail, cyber-grid, storm
//   menyn visar:           inferno        <- fel design
//   liquid finns i menyn:  nej
//
// Menyn pastar alltsa att widgeten har en annan design an den har, och ett klick i den skriver
// inferno over anvandarens val.
//
// Till skillnad fran Top Gifter ar ingen CSS dod har: bada namnuppsattningarna anvander samma
// klassprefix streak-<namn>, och alla fjorton renderar unikt. Problemet ar bara att halften inte
// gar att valja.
//
// liquid har dessutom NOLL egna regler och ritas som grundutseendet.
//
// ROTT NU.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const CSS = fs.readdirSync(ROOT).filter(f => f.endsWith('.css'))
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
const PREMIUM_JS = fs.readFileSync(path.join(ROOT, 'premium-final.js'), 'utf8');

const KLASSISKA = ['inferno', 'neon', 'ice', 'royal', 'sakura-rail', 'cyber-grid', 'storm'];
const PREMIUM = ['liquid', 'momentum', 'tier', 'thread', 'chrono', 'chain', 'thermo'];
const ALLA = [...PREMIUM, ...KLASSISKA];

test.after(closeAll);

function panel(streakTheme) {
  const w = { id: 's1', type: 'templateTopStreak', streakTheme, x: 10, y: 10, width: 520,
    title: 'Top Streak', templateTitle: 'TOP STREAK', dataName: '@StreamQueen', dataValue: 18,
    accent: '#d9a441', giftSize: 64, streakSpeed: 1, streakGlow: 50 };
  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout',
    state: { widgets: [w], projectName: 'streak' } });
  h.load('overlay-sanitize.js');
  h.load('premium-final.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`state.widgets.length=0;state.widgets.push(${JSON.stringify(w)});selected='s1';view='editor';`);
  run(`document.querySelector('#view').innerHTML='<div class="editor-shell"><div class="canvas">'
    +wh(state.widgets[0])+'</div><div class="properties">'+props()+'</div></div>';bind();`);
  return { h, run, meny: () => h.document.querySelector('#streakTheme') };
}

// ---- menyn maste kanna till allt som gar att satta -------------------------------------------------
test('Stil-menyn listar alla fjorton designerna', () => {
  const { meny } = panel('inferno');
  const m = meny();
  assert.ok(m, 'Stil-menyn ritades inte alls');
  const varden = [...m.options].map(o => o.value);
  const saknas = ALLA.filter(t => !varden.includes(t));

  assert.deepEqual(saknas, [],
    `dessa gar att satta men gar inte att valja: ${saknas.join(', ')}`);
});

test('menyn visar den design widgeten faktiskt har', () => {
  // Det har ar sjalva felet: med liquid vald pastod menyn inferno.
  const fel = [];
  for (const t of ALLA) {
    const { meny } = panel(t);
    const m = meny();
    if (!m) { fel.push(t + ': ingen meny'); continue }
    if (m.value !== t) fel.push(`${t}: menyn visar ${m.value}`);
  }

  assert.deepEqual(fel, [], 'menyn pastar fel design:\n  ' + fel.join('\n  '));
});

test('menyn skiljer premium fran klassiska', () => {
  // Fjorton alternativ i en rak lista sager inget om vilka som hor ihop.
  const { meny } = panel('liquid');
  const grupper = [...meny().querySelectorAll('optgroup')].map(g => g.label);

  assert.equal(grupper.length, 2, `hittade ${grupper.length} grupper: ${grupper.join(', ')}`);
});

test('att valja en premium-design kastar inte', () => {
  // Gamla koden slog upp accentfargen med themes.find(...)[1] i den KLASSISKA listan. En premium-
  // design finns inte dar, sa uppslaget ger undefined och [1] kastar.
  const { h, run, meny } = panel('inferno');
  // render() stubbas: harnessens omritning bygger om #view och kastar da pa panelens egen
  // insertBefore. Det ar riggen, inte handlern. Testet ska mata det handlern skriver.
  run(`
    window.__v = {};
    window.render = () => {};
    try {
      const m = document.querySelector('#streakTheme');
      m.value = 'thermo'; m.onchange({ target: m });
      __v.tema = state.widgets[0].streakTheme;
      __v.accent = state.widgets[0].accent;
    } catch (e) { __v.fel = e.message }
  `);
  const v = h.window.__v;

  assert.equal(v.fel, undefined, `valet kastade: ${v.fel}`);
  assert.equal(v.tema, 'thermo', 'temat skrevs inte');
  assert.match(String(v.accent), /^#[0-9a-f]{3,8}$/i, `accenten blev ${JSON.stringify(v.accent)}`);
});

test('att valja en klassisk design fungerar fortfarande', () => {
  const { h, run } = panel('liquid');
  run(`
    window.__k = {};
    window.render = () => {};
    const m = document.querySelector('#streakTheme');
    m.value = 'royal'; m.onchange({ target: m });
    __k.tema = state.widgets[0].streakTheme; __k.accent = state.widgets[0].accent;
  `);

  assert.equal(h.window.__k.tema, 'royal');
  assert.match(String(h.window.__k.accent), /^#[0-9a-f]{3,8}$/i);
});

// ---- varje design maste ha en design -----------------------------------------------------------
test('varje streakdesign har egen CSS', () => {
  const utan = ALLA.filter(t =>
    (CSS.match(new RegExp('\\.streak-' + t.replace('-', '\\-') + '(?![a-z0-9-])', 'g')) || []).length === 0);

  assert.deepEqual(utan, [],
    `dessa erbjuds som designval men ritas som grundutseendet: ${utan.join(', ')}`);
});

test('premiumlistan gar att lasa utifran, sa menyn kan bygga sig av den', () => {
  // Utan en exponerad lista maste namnen dubbleras i media.js, och da glider de isar igen.
  assert.match(PREMIUM_JS, /VyraStreakPremium/,
    'premium-final.js exponerar ingen lista over sina designer');
});
