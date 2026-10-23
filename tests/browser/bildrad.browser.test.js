'use strict';
// BILDSTORLEK, RADAVSTÅND OCH RIKTNING i riktig webbläsare (vyra-bildrad.js, vyra-bildrad.css).
//
// Det som bara layouten kan svara på:
//   A. orört ritar EXAKT som förut — varje element på samma pixel med fälten på standardvärdena som
//      utan dem, i alla tre familjerna,
//   B. varje reglage ändrar den ritade CSS:en (zoom, gap, flex-riktning, ordning),
//   C. inget sticker ut ur widgetens låda vid min, max och båda riktningarna,
//   D. panelen: reglagen finns i sektion 3, sparar fältet och ritar om, och Återställ utseende tar
//      bort dem,
//   E. sparade värden överlever en omladdning och ritas i overlay-utgången (?overlay=1).
//
// RIGGEN SKAPAR WIDGETEN MED NYTT ID. widget-grans.js passar in en NYSKAPAD widget i duken i 15 s
// (krymper widgetScale); en sparad widget som streamern drar i reglagen på rörs aldrig av den.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

let server, browser, bas, editor;
const skip = hoppaOver();

const STIL = '.canvas .widget, .canvas .widget *, .canvas .widget *:before, .canvas .widget *:after { animation: none !important; transition: none !important; }';

async function oppnaEditor() {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraBildrad, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: STIL });
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  return page;
}

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
  editor = await oppnaEditor();
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// Ritar en widget ur katalognyckeln, sätter fälten efter första ritningen (som reglaget gör) och
// väntar in podiets montering.
async function rita(page, nyckel, falt, { vald = true } = {}) {
  await page.evaluate(([nyckel, vald]) => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(nyckel);
    w.id = 'vb' + Math.random().toString(36).slice(2);
    w.x = 20; w.y = 40;
    state.widgets.push(w);
    selected = vald ? w.id : null;
    window.__vbId = w.id;
    render();
  }, [nyckel, vald]);
  await page.waitForTimeout(350);
  await page.evaluate(falt => {
    const w = state.widgets.find(x => x.id === window.__vbId);
    for (const k of ['bildStorlek', 'radAvstand', 'riktning']) delete w[k];
    Object.assign(w, falt || {});
    render();
  }, falt);
  await page.waitForTimeout(/pgpodium/.test(nyckel) ? 700 : 350);
}

// Alla synliga element i lådan: ruta relativt lådan, och hur långt något sticker ut.
const mat = page => page.evaluate(() => {
  const box = document.querySelector('.canvas .widget[data-id="' + window.__vbId + '"]');
  if (!box) return null;
  const b = box.getBoundingClientRect();
  const rutor = [];
  const ut = { l: 0, t: 0, r: 0, b: 0 }, vem = {};
  box.querySelectorAll('*').forEach(el => {
    if (el.closest('.resize-handle, [class*=handle]')) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    rutor.push([Math.round((r.left - b.left) * 10) / 10, Math.round((r.top - b.top) * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]);
    const s = { l: b.left - r.left, t: b.top - r.top, r: r.right - b.right, b: r.bottom - b.bottom };
    const namn = el.tagName + '.' + String(typeof el.className === 'string' ? el.className : '').split(' ')[0];
    for (const k in s) if (s[k] > ut[k]) { ut[k] = s[k]; vem[k] = namn; }
  });
  return { bredd: b.width, hojd: b.height, rutor, ut, vem, klass: box.className, html: box.outerHTML.replace(/ selected\b/, '') };
});

const RANKING = ['voltage', 'basic-v2', 'prism-vertical', 'prism-horizontal', 'celestial', 'royal-rose'];
const EGEN = { voltage: 'lodrat', 'basic-v2': 'lodrat', 'prism-vertical': 'lodrat', 'prism-horizontal': 'podium', celestial: 'vagrat', 'royal-rose': 'vagrat' };
const ANDRA = { voltage: 'vagrat', 'basic-v2': 'vagrat', 'prism-vertical': 'vagrat', 'prism-horizontal': 'lodrat', celestial: 'lodrat', 'royal-rose': 'lodrat' };
const MVP = ['inferno', 'royal', 'cyber', 'storm', 'aurora', 'samurai'];
const MVP_EGEN = { inferno: 'vagrat', royal: 'lodrat', cyber: 'vagrat', storm: 'lodrat', aurora: 'lodrat', samurai: 'vagrat' };
const motsatt = r => r === 'lodrat' ? 'vagrat' : 'lodrat';
const PODIER = ['none', 'royal-phoenix', 'neon-valkyrie'];

// ---- A. Orört ritar som förut ------------------------------------------------------------------
test('A: med fälten på standardvärdena ritas varje element på samma pixel som utan dem', { skip }, async () => {
  const fall = [
    ...RANKING.map(id => ['catalog:toplike:' + id, EGEN[id]]),
    ...MVP.map(s => ['catalog:battlemvp:' + s, MVP_EGEN[s]]),
    ['catalog:battlemvp:frame:royal-ribbon', 'lodrat'],
    ...PODIER.map(m => ['catalog:pgpodium:' + m, '2-1-3']),
  ];
  for (const [nyckel, egen] of fall) {
    await rita(editor, nyckel, {});
    const utan = await mat(editor);
    await rita(editor, nyckel, { bildStorlek: 100, radAvstand: 0, riktning: egen });
    const med = await mat(editor);
    assert.ok(utan && med, nyckel + ' ritades');
    assert.doesNotMatch(med.klass, /\bvb-/, nyckel + ': ingen vb-klass');
    const norm = h => h.replace(/vb[a-z0-9]{6,}/g, 'ID');
    assert.equal(norm(med.html), norm(utan.html), nyckel + ': samma markup');
    assert.deepEqual([med.bredd, med.hojd], [utan.bredd, utan.hojd], nyckel + ': lådan');
    assert.deepEqual(med.rutor, utan.rutor, nyckel + ': varje element');
  }
});

// ---- B. Varje reglage ändrar den ritade CSS:en ---------------------------------------------------
const cs = (page, sel, ...props) => page.evaluate(([sel, props]) => {
  const el = document.querySelector('.canvas .widget[data-id="' + window.__vbId + '"]' + (sel ? ' ' + sel : ''));
  if (!el) return null;
  const s = getComputedStyle(el);
  return props.map(p => s.getPropertyValue(p) || s[p]);
}, [sel, props]);

test('B: ranking — Bildstorlek zoomar avataren, Radavstånd ändrar gap, Riktning vänder listan', { skip }, async () => {
  await rita(editor, 'catalog:toplike:voltage', {});
  const [zoom0] = await cs(editor, '.rk6-av', 'zoom');
  const [gap0, dir0] = await cs(editor, '.rk6-lista', 'row-gap', 'flex-direction');
  assert.equal(Number(zoom0), 1); assert.equal(gap0, '12px'); assert.equal(dir0, 'column');
  await rita(editor, 'catalog:toplike:voltage', { bildStorlek: 130 });
  assert.equal(Number((await cs(editor, '.rk6-av', 'zoom'))[0]), 1.3);
  await rita(editor, 'catalog:toplike:voltage', { radAvstand: 20 });
  assert.equal((await cs(editor, '.rk6-lista', 'row-gap'))[0], '32px');
  await rita(editor, 'catalog:toplike:voltage', { radAvstand: -10 });
  assert.equal((await cs(editor, '.rk6-lista', 'row-gap'))[0], '2px');
  await rita(editor, 'catalog:toplike:voltage', { riktning: 'vagrat' });
  assert.equal((await cs(editor, '.rk6-lista', 'flex-direction'))[0], 'row');
  await rita(editor, 'catalog:toplike:celestial', { riktning: 'lodrat' });
  assert.equal((await cs(editor, '.rk6-lista', 'flex-direction'))[0], 'column');
  await rita(editor, 'catalog:toplike:prism-horizontal', { riktning: 'rad' });
  const ordning = await editor.evaluate(() => [...document.querySelectorAll('.canvas .widget[data-id="' + window.__vbId + '"] .toplike-row')].map(r => getComputedStyle(r).order));
  assert.deepEqual(ordning, ['0', '0', '0', '0', '0'], 'rak rad: 1 · 2 · 3 · 4 · 5');
});

// Avståndet mäts som i sändningen, utan markering: vald i Layout ger .battle-mvp.selected 12 px åt
// alla stilar (studio.css), i overlay har Inferno sina 7 px — och det är dem tillägget räknas från.
test('B: Battle MVP — emblemet zoomas, avståndet och riktningen ändras', { skip }, async () => {
  await rita(editor, 'catalog:battlemvp:inferno', {}, { vald: false });
  assert.equal(Number((await cs(editor, '.mvp-emblem', 'zoom'))[0]), 1);
  assert.deepEqual(await cs(editor, '', 'column-gap', 'flex-direction'), ['7px', 'row']);
  await rita(editor, 'catalog:battlemvp:inferno', { bildStorlek: 80 });
  assert.equal(Number((await cs(editor, '.mvp-emblem', 'zoom'))[0]), 0.8);
  await rita(editor, 'catalog:battlemvp:inferno', { radAvstand: 10 }, { vald: false });
  assert.equal((await cs(editor, '', 'column-gap'))[0], '17px');
  await rita(editor, 'catalog:battlemvp:inferno', { riktning: 'lodrat' });
  assert.equal((await cs(editor, '', 'flex-direction'))[0], 'column');
  await rita(editor, 'catalog:battlemvp:royal', { riktning: 'vagrat' });
  assert.equal((await cs(editor, '', 'flex-direction'))[0], 'row');
});

test('B: podiet — avataren zoomas, mellanrummet och pallplatsernas ordning ändras', { skip }, async () => {
  await rita(editor, 'catalog:pgpodium:none', {});
  assert.equal(Number((await cs(editor, '.pod .r1 .avw', 'zoom'))[0]), 1);
  assert.equal((await cs(editor, '.pod-cols', 'column-gap'))[0], '8px');
  await rita(editor, 'catalog:pgpodium:none', { bildStorlek: 120 });
  assert.equal(Number((await cs(editor, '.pod .r1 .avw', 'zoom'))[0]), 1.2);
  await rita(editor, 'catalog:pgpodium:none', { radAvstand: 10 });
  assert.notEqual((await cs(editor, '.pod-cols', 'column-gap'))[0], '8px');
  await rita(editor, 'catalog:pgpodium:none', { riktning: '1-2-3' });
  const ordning = await editor.evaluate(() => {
    const kol = [...document.querySelectorAll('.canvas .widget[data-id="' + window.__vbId + '"] .pcol')];
    return kol.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map(k => /\br(\d)\b/.exec(k.className)[1]).join('');
  });
  assert.equal(ordning, '123');
});

// ---- C. Inget sticker ut ------------------------------------------------------------------------
// Orörda Prism vertikal/horisontal har en ring som sticker ut 3–5 px redan i dag; den mäts inte här
// (A vaktar att den är oförändrad). Med ett ändrat reglage får listans kant plats för den.
test('C: inget sticker ut ur lådan vid min, max och båda riktningarna', { skip }, async () => {
  const fall = [];
  for (const id of RANKING) {
    const n = 'catalog:toplike:' + id;
    fall.push([n, { bildStorlek: 150, radAvstand: 40 }], [n, { bildStorlek: 60, radAvstand: -10 }],
      [n, { riktning: ANDRA[id], bildStorlek: 150, radAvstand: 40 }], [n, { riktning: ANDRA[id], bildStorlek: 60, radAvstand: -10 }]);
  }
  fall.push(['catalog:toplike:prism-horizontal', { riktning: 'rad', bildStorlek: 150, radAvstand: 40 }]);
  for (const s of MVP) {
    const n = 'catalog:battlemvp:' + s;
    fall.push([n, { bildStorlek: 150, radAvstand: 40 }], [n, { riktning: motsatt(MVP_EGEN[s]), bildStorlek: 150, radAvstand: 40 }],
      [n, { riktning: motsatt(MVP_EGEN[s]), bildStorlek: 60, radAvstand: -10 }]);
  }
  for (const m of PODIER) {
    const n = 'catalog:pgpodium:' + m;
    fall.push([n, { bildStorlek: 130, radAvstand: 40 }], [n, { bildStorlek: 60, radAvstand: -10 }],
      [n, { riktning: '1-2-3', bildStorlek: 130, radAvstand: 40 }], [n, { riktning: '3-1-2', bildStorlek: 130, radAvstand: 40 }]);
  }
  const fel = [];
  for (const [nyckel, falt] of fall) {
    await rita(editor, nyckel, falt);
    const m = await mat(editor);
    assert.match(m.klass, /\bvb-/, nyckel + ' ' + JSON.stringify(falt) + ': märkt');
    const ut = Object.entries(m.ut).filter(([, v]) => v > 1.5);
    if (ut.length) fel.push(`${nyckel} ${JSON.stringify(falt)}: ${ut.map(([k, v]) => `${k} ${v.toFixed(1)} px (${m.vem[k]})`).join(', ')}`);
  }
  assert.deepEqual(fel, []);
});

// ---- D. Panelen ---------------------------------------------------------------------------------
async function satt(page, id, v) {
  await page.evaluate(([id, v]) => {
    const el = document.querySelector('.properties #' + id);
    el.value = String(v);
    if (el.type === 'range') el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [id, v]);
  await page.waitForTimeout(400);
}

test('D: panelen — reglagen i sektion 3 sparar fältet, ritar om och återställs', { skip }, async () => {
  await rita(editor, 'catalog:toplike:royal-rose', {});
  const fore = await editor.evaluate(() => ['#pr-bildStorlek', '#pr-radAvstand', '#pr-riktning'].map(s => {
    const el = document.querySelector('.properties ' + s);
    return el && Object.assign({ sektion: el.closest('[data-panelram-sektion]')?.dataset.panelramSektion, varde: el.value }, el.type === 'range' ? { min: el.min, max: el.max } : {});
  }));
  assert.deepEqual(fore, [{ sektion: '3', varde: '100', min: '60', max: '150' }, { sektion: '3', varde: '0', min: '-10', max: '40' }, { sektion: '3', varde: 'vagrat' }]);
  await satt(editor, 'pr-bildStorlek', 120);
  await satt(editor, 'pr-radAvstand', 12);
  await satt(editor, 'pr-riktning', 'lodrat');
  const efter = await editor.evaluate(() => {
    const w = state.widgets.find(x => x.id === window.__vbId);
    const el = document.querySelector('.canvas .widget[data-id="' + w.id + '"]');
    const lagrat = JSON.parse(localStorage.getItem('vyra-state') || '{}').widgets?.find(x => x.id === w.id);
    return { falt: [w.bildStorlek, w.radAvstand, w.riktning], klass: el.className, lagrat: lagrat && [lagrat.bildStorlek, lagrat.radAvstand, lagrat.riktning],
      panel: [document.querySelector('.properties #pr-bildStorlek').value, document.querySelector('.properties #pr-riktning').value] };
  });
  assert.deepEqual(efter.falt, [120, 12, 'lodrat']);
  assert.deepEqual(efter.lagrat, [120, 12, 'lodrat'], 'sparat');
  assert.match(efter.klass, /\bvb-bild\b.*\bvb-rad\b.*\bvb-lodrat\b/);
  assert.deepEqual(efter.panel, ['120', 'lodrat'], 'panelen visar de nya värdena efter omritningen');
  // Återställ utseende tar bort fälten — widgeten ritas som en ny.
  await editor.evaluate(() => document.querySelector('.properties #pr-aterstall-utseende').click());
  await editor.waitForTimeout(500);
  const aterstalld = await editor.evaluate(() => {
    const w = state.widgets.find(x => x.id === window.__vbId);
    return { falt: ['bildStorlek', 'radAvstand', 'riktning'].map(k => k in w), klass: document.querySelector('.canvas .widget[data-id="' + w.id + '"]').className };
  });
  assert.deepEqual(aterstalld.falt, [false, false, false]);
  assert.doesNotMatch(aterstalld.klass, /\bvb-/);
});

test('D: panelen — Battle MVP:s ramar har inga av reglagen, podiet slutar på 130 %', { skip }, async () => {
  await rita(editor, 'catalog:battlemvp:frame:dark-wings', {});
  assert.deepEqual(await editor.evaluate(() => ['#pr-bildStorlek', '#pr-radAvstand', '#pr-riktning'].map(s => !!document.querySelector('.properties ' + s))), [false, false, false]);
  await rita(editor, 'catalog:battlemvp:cyber', {});
  assert.deepEqual(await editor.evaluate(() => ['#pr-bildStorlek', '#pr-radAvstand', '#pr-riktning'].map(s => !!document.querySelector('.properties ' + s))), [true, true, true]);
  await rita(editor, 'catalog:pgpodium:gilded-lion', {});
  assert.deepEqual(await editor.evaluate(() => {
    const el = document.querySelector('.properties #pr-bildStorlek'), r = document.querySelector('.properties #pr-riktning');
    return [el && el.max, r && [...r.options].map(o => o.value).join(' ')];
  }), ['130', '2-1-3 1-2-3 3-1-2']);
});

// ---- E. Omladdning och overlay -------------------------------------------------------------------
test('E: sparade värden överlever en omladdning och ritas i overlay-utgången', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const like = Object.assign(window.VyraWidgets.create('catalog:toplike:basic-v2'), { id: 'vbRank', x: 10, y: 10, bildStorlek: 120, radAvstand: 6, riktning: 'vagrat' });
    const mvp = Object.assign(window.VyraWidgets.create('catalog:battlemvp:samurai'), { id: 'vbMvp', x: 10, y: 400, bildStorlek: 90, riktning: 'lodrat' });
    const pod = Object.assign(window.VyraWidgets.create('catalog:pgpodium:none'), { id: 'vbPod', x: 400, y: 10, riktning: '3-1-2', radAvstand: 20 });
    const orord = Object.assign(window.VyraWidgets.create('catalog:toplike:celestial'), { id: 'vbOrord', x: 400, y: 500 });
    localStorage.setItem('vyra-state', JSON.stringify({ widgets: [like, mvp, pod, orord] }));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.VyraBildrad, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(300);
  await page.evaluate(() => { if (typeof render === 'function') render(); });
  await page.waitForTimeout(1200);
  const ut = await page.evaluate(() => Object.fromEntries(['vbRank', 'vbMvp', 'vbPod', 'vbOrord'].map(id => {
    const el = document.querySelector('[data-id="' + id + '"]');
    const w = state.widgets.find(x => x.id === id);
    return [id, el && { klass: el.className, falt: w && [w.bildStorlek, w.radAvstand, w.riktning] }];
  })));
  assert.ok(ut.vbRank && ut.vbMvp && ut.vbPod && ut.vbOrord, 'alla fyra ritades i overlay');
  assert.deepEqual(ut.vbRank.falt, [120, 6, 'vagrat']);
  assert.match(ut.vbRank.klass, /\bvb-bild\b.*\bvb-rad\b.*\bvb-vagrat\b/);
  assert.match(ut.vbMvp.klass, /\bvb-bild\b.*\bvb-lodrat\b/);
  assert.match(ut.vbPod.klass, /\bvb-rad\b.*\bvb-pall-3-1-2\b/);
  assert.doesNotMatch(ut.vbOrord.klass, /\bvb-/, 'en orörd widget får ingen klass');
  assert.equal(Number(await page.evaluate(() => getComputedStyle(document.querySelector('[data-id="vbRank"] .rk6-av')).zoom)), 1.2);
  // Ingen studio-chrome i overlay: CSS:en lägger inget synligt utanför widgetarna.
  assert.equal(await page.evaluate(() => document.querySelectorAll('.properties #pr-bildStorlek').length), 0);
  await page.close();
});
