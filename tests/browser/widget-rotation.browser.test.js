'use strict';
// Rotationens kontrakt i riktig Chrome — skrivet RÖTT FÖRST (vyra-rotation.js finns inte än).
//
// BESLUTEN SOM PROVAS (Davids val 2026-08-18):
//   * transform-origin är CENTER — widgeten roterar runt sin mitt som i varje designverktyg.
//   * widgetScaleY-luckan LÄKS: lodrät sträckning appliceras i dag bara på `.widget.selected`
//     (widget-handles synka()), och i sändningen är inget valt — sträckning har alltså ALDRIG
//     nått OBS. Komposören blir transformens enda skrivare och applicerar båda överallt.
//
// KOMPOSÖRSKONTRAKTET: transform på widgetroten har EN ägare. satStrackning (widget-handles.js)
// skrev `scaleY() !important` ensam förr — rotation och sträckning måste komponeras av samma
// hand (`rotate(θ) scaleY(sy)`), annars vinner den som skrev sist tyst. Neutralläget är
// FRÅNVARO: rotation 0/saknas och scaleY≈1 ⇒ ingen inline-transform alls, så orörda layouter
// förblir pixelidentiska (bakåtkompatibiliteten är ett eget prov).
//
// §7: rotationen går in via state + render()/overlay-boot (samma localStorage+projektionsväg som
// scenbakgrund-sviten) — aldrig via appliceringsfunktionen direkt.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

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

let server, browser, bas;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// En widget i editorn, seedad genom den riktiga kedjan (projektion före seedning — §7-fixturen).
async function editorMed(widgetProps) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  const id = await page.evaluate(props => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:toplike:clean');
    Object.assign(w, { x: 60, y: 90 }, props);
    state.widgets.push(w);
    selected = null; // KRITISKT för läknings-kontraktet: ingenting är valt i sändningen
    render();
    return w.id;
  }, widgetProps);
  await page.waitForTimeout(700);
  return { page, id };
}

// Sändningsytan, samma väg som scenbakgrund-sviten: localStorage + omladdning + lokal projektion.
async function overlayMed(widgetProps) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(props => {
    const w = Object.assign({ id: 'rotprov', type: 'templateTopLike', theme: 'clean',
      x: 60, y: 90, width: 320, title: 'TOP LIKES' }, props);
    localStorage.setItem('vyra-state', JSON.stringify({ widgets: [w] }));
  }, widgetProps);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(300);
  // Tokenvägen (overlay-access.js apply()) kör render() efter projektionen — samma här.
  await page.evaluate(() => { if (typeof render === 'function') render(); });
  await page.waitForTimeout(700);
  return page;
}

const matris = (page, id) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return { fel: 'elementet saknas' };
  const cs = getComputedStyle(el);
  return { fel: null, transform: cs.transform, origin: cs.transformOrigin,
    bredd: el.offsetWidth, hojd: el.offsetHeight };
}, id ? `.canvas [data-id="${id}"]` : '.canvas [data-id]');

// matrix(a,b,c,d,e,f): rotation θ ⇒ a=cosθ·sx, b=sinθ·sx. Vinkeln ur atan2(b,a) är
// skalinvariant; scaleY läses ur kolonn 2:s längd.
function tolkaMatris(t) {
  const m = /matrix\(([-\d.e]+),\s*([-\d.e]+),\s*([-\d.e]+),\s*([-\d.e]+)/.exec(t || '');
  if (!m) return null;
  const [a, b, c, d] = m.slice(1).map(Number);
  return { vinkel: Math.atan2(b, a) * 180 / Math.PI, scaleY: Math.hypot(c, d) };
}

test('bakåtkompatibilitet: utan rotation och utan sträckning finns ingen transform alls', { skip }, async () => {
  const { page, id } = await editorMed({});
  const m = await matris(page, id);
  await page.close();
  assert.equal(m.fel, null, m.fel || '');
  assert.equal(m.transform, 'none',
    `en orörd widget fick en transform (${m.transform}) — gamla layouter ska vara pixelidentiska`);
});

test('w.rotation=30 roterar roten runt mitten i editorn', { skip }, async () => {
  const { page, id } = await editorMed({ rotation: 30 });
  const m = await matris(page, id);
  await page.close();
  assert.equal(m.fel, null, m.fel || '');
  const t = tolkaMatris(m.transform);
  assert.ok(t, `ingen matris på roten (transform=${m.transform}) — rotationen appliceras inte`);
  assert.ok(Math.abs(t.vinkel - 30) < 0.5, `fel vinkel: ${t.vinkel}° (väntade 30°)`);
  const [ox, oy] = m.origin.split(' ').map(parseFloat);
  assert.ok(Math.abs(ox - m.bredd / 2) < 1 && Math.abs(oy - m.hojd / 2) < 1,
    `origin är ${m.origin}, inte mitten (${m.bredd / 2} ${m.hojd / 2}) — Davids beslut är center`);
});

test('rotationen når sändningen genom den riktiga overlay-vägen', { skip }, async () => {
  const page = await overlayMed({ rotation: -45 });
  const m = await matris(page, null);
  await page.close();
  assert.equal(m.fel, null, m.fel || '');
  const t = tolkaMatris(m.transform);
  assert.ok(t, `ingen matris i sändningen (transform=${m.transform})`);
  assert.ok(Math.abs(t.vinkel + 45) < 0.5, `fel vinkel i sändningen: ${t.vinkel}° (väntade -45°)`);
});

test('LÄKNINGEN: widgetScaleY når sändningen — utan att något är valt', { skip }, async () => {
  // RÖTT I DAG av rätt skäl: synka() applicerar bara på .widget.selected, och i sändningen är
  // inget valt. Davids beslut 2026-08-18: komposören applicerar sträckningen överallt.
  const page = await overlayMed({ widgetScaleY: 1.5 });
  const m = await matris(page, null);
  await page.close();
  assert.equal(m.fel, null, m.fel || '');
  const t = tolkaMatris(m.transform);
  assert.ok(t, `ingen matris i sändningen (transform=${m.transform}) — sträckningen når fortfarande inte OBS`);
  assert.ok(Math.abs(t.scaleY - 1.5) < 0.01, `fel scaleY i sändningen: ${t.scaleY} (väntade 1.5)`);
});

test('komposörskontraktet: rotation och sträckning i SAMMA matris', { skip }, async () => {
  const { page, id } = await editorMed({ rotation: 30, widgetScaleY: 1.5 });
  const m = await matris(page, id);
  await page.close();
  assert.equal(m.fel, null, m.fel || '');
  const t = tolkaMatris(m.transform);
  assert.ok(t, `ingen matris (transform=${m.transform})`);
  assert.ok(Math.abs(t.vinkel - 30) < 0.5, `rotationen förlorade mot sträckningen: ${t.vinkel}°`);
  assert.ok(Math.abs(t.scaleY - 1.5) < 0.01, `sträckningen förlorade mot rotationen: scaleY=${t.scaleY}`);
});

test('markeringens sträckningsväg och komposören skriver inte om varandra', { skip }, async () => {
  // Samma widget, nu VALD i editorn — synka()-vägen är aktiv samtidigt som komposören.
  // Den som skriver sist får inte vinna tyst: slutmatrisen ska bära BÅDA värdena.
  const { page, id } = await editorMed({ rotation: 30, widgetScaleY: 1.5 });
  await page.evaluate(wid => { selected = wid; render(); }, id);
  await page.waitForTimeout(700);
  const m = await matris(page, id);
  await page.close();
  assert.equal(m.fel, null, m.fel || '');
  const t = tolkaMatris(m.transform);
  assert.ok(t, `ingen matris (transform=${m.transform})`);
  assert.ok(Math.abs(t.vinkel - 30) < 0.5, `markeringen raderade rotationen: ${t.vinkel}°`);
  assert.ok(Math.abs(t.scaleY - 1.5) < 0.01, `markeringen raderade sträckningen: scaleY=${t.scaleY}`);
});
