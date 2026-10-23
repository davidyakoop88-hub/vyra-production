'use strict';
// Last-X Alerts: intro, outro och visningstid är inställningar — och de två filerna ska vara ense.
//
// Widgeten finns i två implementationer: public/widgets/last-x-alerts.html (OBS) och
// last-x-alerts.js + last-x-alerts.css (Studio). De ska erbjuda SAMMA val. PR #58 visade vad som
// händer när de glider isär: designens animationer portades utan sitt scope och tre designer körde
// fel rörelse i månader utan att någon svit kunde se det. Det här testet låser fast den andra halvan
// av samma kontrakt — rörelseVALEN och visningstiden.
//
// Kontraktet:
//   1. Fyra entréer, inklusive den nya "roll" (rulla in), i BÅDA filerna.
//   2. Varje entré med en vilotransform har en outro som speglar den exakt.
//      Outron är alltid intron baklänges — den är ingen egen inställning.
//   3. Visningstiden är ett reglage, 3–30 s i hela sekunder (slutgranskningen 2026-10-23; före det
//      en lista med 5, 10 och 15). De gamla listvärdena betyder exakt samma tid. Den gamla klampen
//      4–6 låg på fyra ställen och får inte komma tillbaka, annars säger panelen en sak och timern en annan.
//
// RÖTT NU: "roll" finns inte, och 4–6-klampen sitter kvar på alla fyra ställen.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'last-x-alerts.css'), 'utf8');
const OBS = fs.readFileSync(path.join(ROOT, 'public/widgets/last-x-alerts.html'), 'utf8');
const STUDIO = fs.readFileSync(path.join(ROOT, 'last-x-alerts.js'), 'utf8');

const ENTRANCES = ['slide-left', 'slide-right', 'pop', 'roll', 'fade'];
// fade rör sig bara i opacitet — den har ingen transform att spegla.
const MOVING = ENTRANCES.filter(e => e !== 'fade');
const DURATION_MIN = 3, DURATION_MAX = 30;

test.after(closeAll);

// ---- panelen ---------------------------------------------------------------------------------

function panel() {
  const widget = { id: 'lx1', type: 'templateLastX', x: 10, y: 20, width: 500,
    title: 'Last-X Alerts', lastXType: 'all', lastXDesign: 'card',
    lastXEntrance: 'slide-left', followDuration: 5 };
  const h = createDom({ state: { widgets: [widget], projectName: 'test' } });
  h.load('overlay-sanitize.js');
  h.load('last-x-alerts.js');
  // props() plockar widgeten ur state via `selected`. Båda är lexikala i studio.js, så de måste
  // sättas på sidan — samma skäl som dom-harness.js beskriver för `state`.
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`state.widgets.length=0;state.widgets.push(${JSON.stringify(widget)});selected='lx1';view='editor'`);
  const host = h.document.createElement('div');
  host.innerHTML = h.window.props();
  h.document.body.append(host);
  return { h, host, widget, run };
}

test('panelen har ett eget Animation-block med intron i sig', () => {
  const { host } = panel();
  const groups = [...host.querySelectorAll('.property-group')];
  const animation = groups.find(g => /ANIMATION/i.test(g.querySelector('h4')?.textContent || ''));
  assert.ok(animation, 'inget ANIMATION-block — intron ligger kvar hopblandad med designen');
  assert.ok(animation.querySelector('#lastXEntrance'), 'introväljaren ligger utanför Animation-blocket');
});

test('panelen har ett eget block för visningstiden', () => {
  const { host } = panel();
  const groups = [...host.querySelectorAll('.property-group')];
  const duration = groups.find(g => /VISNINGSTID/i.test(g.querySelector('h4')?.textContent || ''));
  assert.ok(duration, 'inget VISNINGSTID-block');
  assert.ok(duration.querySelector('#followDuration'), 'tidsvalet ligger utanför sitt block');
});

test('introväljaren erbjuder alla fem entréer, inklusive rulla in', () => {
  const { host } = panel();
  const opts = [...host.querySelectorAll('#lastXEntrance option')].map(o => o.value);
  assert.deepEqual(opts.sort(), [...ENTRANCES].sort(),
    'introväljarens alternativ matchar inte entréerna i koden');
});

test('visningstiden är ett reglage 3–30 s i hela sekunder som visar värdet i sekunder', () => {
  const { host } = panel();
  const el = host.querySelector('#followDuration');
  assert.ok(el, 'tidsvalet finns inte');
  assert.equal(el.tagName, 'INPUT', 'visningstiden är fortfarande en lista');
  assert.equal(el.type, 'range');
  assert.equal(Number(el.min), DURATION_MIN);
  assert.equal(Number(el.max), DURATION_MAX);
  assert.equal(Number(el.step), 1);
  assert.equal(Number(el.value), 5, 'widgetens sparade 5 s syns inte på reglaget');
  assert.equal(el.closest('label').querySelector(':scope > b').textContent, '5 s', 'reglaget visar inte sekunderna');
});

// De gamla listvärdena (5/10/15) ska ge exakt samma tid och samma läge på reglaget. Övriga tal hålls
// inom 3–30 och avrundas till hela sekunder; saknas tiden gäller 5 s.
for (const [sparat, vantat] of [[5, 5], [10, 10], [15, 15], [3, 3], [30, 30], [4, 4], [6, 6], [12.4, 12], ['20', 20],
  [2, 3], [0, 3], [-4, 3], [45, 30], [undefined, 5], [null, 5], ['', 5], ['abc', 5], [NaN, 5]]) {
  test(`sparad visningstid ${typeof sparat === "string" ? JSON.stringify(sparat) : String(sparat)} ger ${vantat} s på reglaget och i timern`, () => {
    const { h } = panel();
    assert.equal(h.window.VyraLastX.visningstid({ followDuration: sparat }), vantat);
    const w = { id: 'lx2', type: 'templateLastX', x: 0, y: 0, width: 500, lastXType: 'all', lastXDesign: 'card', followDuration: sparat };
    const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
    run(`state.widgets.length=0;state.widgets.push(${JSON.stringify(w)});selected='lx2';view='editor'`);
    if (sparat === undefined || Number.isNaN(sparat)) run(`state.widgets[0].followDuration=${sparat === undefined ? 'undefined' : 'NaN'}`);
    const host = h.document.createElement('div');
    host.innerHTML = h.window.props();
    assert.equal(Number(host.querySelector('#followDuration').value), vantat);
    assert.equal(host.querySelector('#followDuration').closest('label').querySelector(':scope > b').textContent, vantat + ' s');
  });
}

test('spannet på reglaget är exporterat', () => {
  const { h } = panel();
  assert.deepEqual({ ...h.window.VyraLastX.visningstidSpann }, { min: 3, max: 30, standard: 5 });
});

test('panelen skriver ut att outron speglar intron', () => {
  // Outron är ingen egen inställning. Står det inget blir den osynlig för användaren och
  // nästa person lägger till en andra rullgardin som inte behövs.
  const { host } = panel();
  assert.match(host.textContent, /spegl|omvänd|baklänges|tvärtom/i,
    'panelen förklarar inte vad som händer när tiden tar slut');
});

test('att välja 15 sekunder sparas på widgeten', () => {
  const { h, host, widget, run } = panel();
  // bind() letar upp kontrollerna i dokumentet, så panelen måste ligga där den letar.
  const target = h.document.getElementById('view');
  target.innerHTML = '';
  target.append(host);
  run('bind()');
  const sel = h.document.querySelector('#followDuration');
  assert.ok(sel, 'tidsvalet finns inte');
  sel.value = '15';
  sel.dispatchEvent(new h.window.Event('change'));
  // `state` är en lexikal const i studio.js, inte window.state — läs den på sidan.
  run('window.__followDuration = state.widgets[0].followDuration');
  assert.equal(h.window.__followDuration, 15,
    `valet nådde aldrig widgeten (blev ${h.window.__followDuration})`);
});

// ---- CSS: entré och outro speglar varandra ----------------------------------------------------

let cssDom;
test.before(() => {
  cssDom = new JSDOM(`<!doctype html><html><head><style>${CSS}</style></head><body>${
    ENTRANCES.map(e => `
      <div class="widget last-x-widget design-card entrance-${e}" data-id="rest-${e}"></div>
      <div class="widget last-x-widget design-card entrance-${e} last-x-active last-x-leaving" data-id="out-${e}"></div>`
    ).join('')
  }</body></html>`);
});
test.after(() => { try { cssDom.window.close() } catch (_) {} });

const transformOf = id =>
  cssDom.window.getComputedStyle(cssDom.window.document.querySelector(`[data-id="${id}"]`)).transform || '';

test('rulla in har en egen vilotransform', () => {
  const t = transformOf('rest-roll');
  assert.match(t, /rotate/, `entrance-roll saknar rotation (fick "${t}")`);
});

for (const e of MOVING) {
  test(`outron för ${e} speglar intron exakt`, () => {
    const rest = transformOf(`rest-${e}`), out = transformOf(`out-${e}`);
    assert.notEqual(rest, '', `${e} saknar vilotransform`);
    assert.equal(out, rest,
      `${e} går ut på "${out}" men kom in från "${rest}" — outron speglar inte intron`);
  });
}

// ---- de två filerna ska vara ense -------------------------------------------------------------

const entranceListIn = src => {
  const m = src.match(/ENTRANCES\s*=\s*\[([^\]]+)\]/);
  assert.ok(m, 'ENTRANCES-listan hittades inte');
  return m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).sort();
};

test('Studio och OBS erbjuder samma entréer', () => {
  assert.deepEqual(entranceListIn(STUDIO), entranceListIn(OBS),
    'filerna har glidit isär — samma fel som lät designerna byta rörelse i PR #58');
  assert.deepEqual(entranceListIn(STUDIO), [...ENTRANCES].sort());
});

test('OBS-filen har både vilotransform och outro för varje entré som rör sig', () => {
  for (const e of MOVING) {
    assert.match(OBS, new RegExp(`html\\[data-entrance="${e}"\\] #card\\{`),
      `OBS saknar vilotransform för ${e}`);
    assert.match(OBS, new RegExp(`html\\[data-entrance="${e}"\\] #card\\.hide\\{`),
      `OBS saknar outro för ${e} — kortet skulle tonas bort på plats i stället för att gå ut`);
  }
});

test('den gamla 4–6-klampen är borta ur båda filerna', () => {
  // Klampen låg på fyra ställen: holdMsOf(), panelens reglage, legacy-vägen och OBS HOLD_MS.
  // Blir bara några av dem ändrade säger panelen 15 sekunder medan timern kör 6.
  const clamp = /Math\.max\(\s*4\s*,\s*Math\.min\(\s*6\s*,/g;
  assert.deepEqual(STUDIO.match(clamp) || [], [],
    `${(STUDIO.match(clamp) || []).length} kvarvarande 4–6-klamp i last-x-alerts.js`);
  assert.deepEqual(OBS.match(clamp) || [], [],
    'OBS-widgeten klampar fortfarande till 4–6 sekunder');
});

test('båda filerna har samma tidsspann, 3–30 s med 5 s som standard', () => {
  for (const src of [STUDIO, OBS]) {
    const min = src.match(/DURATION_MIN\s*=\s*(\d+)/), max = src.match(/DURATION_MAX\s*=\s*(\d+)/),
      std = src.match(/DURATION_STANDARD\s*=\s*(\d+)/);
    assert.ok(min && max && std, 'inget DURATION_MIN/MAX/STANDARD — tiderna är hårdkodade någon annanstans');
    assert.deepEqual([+min[1], +max[1], +std[1]], [DURATION_MIN, DURATION_MAX, 5]);
    assert.doesNotMatch(src, /DURATIONS\s*=\s*\[/, 'den gamla listan 5/10/15 ligger kvar');
  }
});
