'use strict';
// SLUTGRANSKNING, KONTROLLGRANSKNINGENS ANDRA OMGÅNG (2026-10-20): DE SISTA FYNDEN, MÄTTA I WEBBLÄSAREN.
//
// Varje prov nedan föll före rättningen (mätt med samma rigg, 2026-10-20):
//   N-AB-001  Heart Me: rubriken 7 px och "0% KLART" 5 px i både studion och sändningen.
//   N-AB-002  Last-X crownBanner m.fl.: "SENASTE GÅVOGIVARE" 7,2 px.
//   N-AB-004  Top Streak Flip i vila: pillret "🔥 STREAK" utan tal stod kvar under "Ingen streak än".
//   N-AB-006  "Final vid 1000 mynt" utan tusentalsmellanslag, och "2100 mynt" efter ett drag.
//   N-AB-007  Rankingens demo "98.7K".
//   N-AB-008  Egen bild och Egen video hade panelram men ingen ▶ Testa widget.
//   N-AB-009  Tidslinjen visade "Entré" i vila fast widgetens entré är 0 ms.
//   N-AB-011  Goal Pros klon bar ett eget ↘-handtag som stod kvar på duken under testet.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm' };
function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''), fil = path.join(ROOT, rel);
    if (rel.startsWith('api/')) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{}'); return; }
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' }); fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}
let server, browser, bas, skip = hoppaOver();
test.before(async () => { if (skip) return; browser = await startaWebblasare(); if (!browser) throw new Error('webblasaren kunde inte starta'); server = await servera(); bas = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });

async function studio() {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraPanelregister && typeof VyraWidgets !== 'undefined'
    && !!window.VyraTestspel && !!window.VyraTalformat, null, { timeout: 40000, polling: 100 });
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  return page;
}
async function overlay() {
  const page = await browser.newPage({ viewport: { width: 432, height: 768 } });
  await page.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VyraWidgets !== 'undefined' && typeof render === 'function', null, { timeout: 40000, polling: 100 });
  return page;
}
async function valj(page, nyckel, falt) {
  await page.evaluate(([n, f]) => {
    try { if (window.VyraTestspel.status().aktiv) VyraTestspel.stoppa(); } catch (_) {}
    state.widgets.length = 0;
    const w = VyraWidgets.create(n); w.id = 'prov'; w.x = 40; w.y = 60; Object.assign(w, f || {});
    state.widgets.push(w); selected = 'prov'; render();
  }, [nyckel, falt]);
  await page.waitForFunction(() => document.querySelector('.properties')?.dataset.panelram === '1', null, { timeout: 15000, polling: 100 });
  await page.waitForTimeout(400);
}
async function iOverlay(page, nyckel, falt) {
  await page.evaluate(async ([n, f]) => {
    const st = window.eval('state'); st.widgets.length = 0;
    const w = VyraWidgets.create(n); w.id = 'prov'; Object.assign(w, f || {});
    st.widgets.push(w); render();
    await new Promise(r => setTimeout(r, 800));
  }, [nyckel, falt]);
}
const px = (sel) => { const n = document.querySelector(sel); return n ? parseFloat(getComputedStyle(n).fontSize) : null; };

test('N-AB-001 och N-AB-002: Heart Me och Last-X-etiketten är läsbara i sändningen', { skip, timeout: 120000 }, async () => {
  const page = await overlay();
  try {
    await iOverlay(page, 'catalog:heartgoal:neon');
    assert.ok(await page.evaluate(px, '[data-id="prov"] .heart-goal-copy h3') >= 12, 'Heart Me-rubriken under 12 px');
    assert.ok(await page.evaluate(px, '[data-id="prov"] .heart-goal-copy small') >= 11, '"0% KLART" under 11 px');
    // Pillret ryms fortfarande: rubriken bryts inte och klipps inte.
    const rad = await page.evaluate(() => { const h = document.querySelector('[data-id="prov"] .heart-goal-copy h3'); return { sw: h.scrollWidth, cw: h.clientWidth, h: h.getBoundingClientRect().height }; });
    assert.ok(rad.sw <= rad.cw && rad.h < 20, 'Heart Me-rubriken ryms inte på en rad: ' + JSON.stringify(rad));
    for (const d of ['crownBanner', 'dragonFlame', 'iceKing', 'neonCyber', 'royalAmethyst']) {
      await iOverlay(page, 'catalog:lastx:crownBanner', { lastXDesign: d });
      const m = await page.evaluate(() => { const l = document.querySelector('[data-id="prov"] .last-x-label'); return l && { fs: parseFloat(getComputedStyle(l).fontSize), sw: l.scrollWidth, cw: l.clientWidth, text: l.textContent }; });
      assert.ok(m, d + ': etiketten saknas');
      assert.ok(m.fs >= 10.5, d + ': etiketten är ' + m.fs + ' px');
      assert.ok(m.sw <= m.cw + 1, d + ': "' + m.text + '" ryms inte i remsan (' + m.sw + ' > ' + m.cw + ')');
    }
  } finally { await page.close(); }
});

test('N-AB-004: Top Streak Flip i vila visar inget tomt STREAK-piller', { skip, timeout: 120000 }, async () => {
  const page = await overlay();
  try {
    await iOverlay(page, 'catalog:pgstreak:royal-wings');
    const t = await page.evaluate(() => document.querySelector('[data-id="prov"]').innerText.replace(/\s+/g, ' ').trim());
    assert.match(t, /Ingen streak än/);
    assert.doesNotMatch(t, /STREAK/, 'pillret står kvar utan tal: ' + t);
  } finally { await page.close(); }
});

test('N-AB-006 och N-AB-007: talen i panelen och i rankingen skrivs på svenska', { skip, timeout: 160000 }, async () => {
  const page = await studio();
  try {
    await valj(page, 'catalog:giftfireworks:supernova');
    const b = () => Object.fromEntries([...document.querySelectorAll('.properties label > b')]
      .map(b => [b.parentElement.firstChild.textContent.trim(), b.textContent]));
    let v = await page.evaluate(b);
    assert.equal(v['Final vid'], '1 000 coins');
    assert.equal(v['Glöd'], '0,80 ×');
    // Efter ett drag: samma form (förut "0,8 ×" och "2100 mynt").
    v = await page.evaluate(async () => {
      const satt = (id, x) => { const el = document.querySelector('.properties ' + id); el.value = x; el.dispatchEvent(new Event('input', { bubbles: true })); };
      satt('#fwGlow', '0.8'); satt('#fwFinal', '2100');
      await new Promise(r => setTimeout(r, 100));
      return Object.fromEntries([...document.querySelectorAll('.properties label > b')].map(b => [b.parentElement.firstChild.textContent.trim(), b.textContent]));
    });
    assert.equal(v['Glöd'], '0,80 ×', 'Glöd efter drag');
    assert.equal(v['Final vid'], '2 100 coins', 'Final vid efter drag');

    await valj(page, 'catalog:toplike:voltage');
    const rader = await page.evaluate(() => [...document.querySelectorAll('.canvas [data-id="prov"] .toplike-row em')].map(e => ({ t: e.textContent.trim(), sw: e.scrollWidth, cw: e.clientWidth })));
    assert.ok(rader.length >= 3);
    assert.equal(rader[0].t, '98 700');
    for (const r of rader) {
      assert.doesNotMatch(r.t, /\d\.\d|K$/, 'engelsk kortform: ' + r.t);
      assert.ok(r.sw <= r.cw + 1, 'värdet klipps: ' + JSON.stringify(r));
    }
  } finally { await page.close(); }
});

test('N-AB-008, N-AB-009, N-AB-011: testknappen, tidslinjen i vila och handtagen under testet', { skip, timeout: 200000 }, async () => {
  const page = await studio();
  try {
    for (const n of ['catalog:custom:image', 'catalog:custom:video']) {
      await valj(page, n);
      assert.ok(await page.$('#pr-testspel'), n + ': ▶ Testa widget saknas');
      // Ingen inträdeseffekt vald: entrén är 0 ms och syns inte i tidslinjen ens i vila.
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.pr-tidslinje li[data-fas="entre"]')).display), 'none', n);
      assert.ok(await page.evaluate(() => window.VyraTestspel.spela(liveWidget('prov'))), n + ': testet startade inte');
      assert.equal(await page.evaluate(() => window.VyraTestspel.status().faser.entre), 0);
      await page.evaluate(() => window.VyraTestspel.stoppa());
    }
    await valj(page, 'catalog:custom:image', { entranceAnimation: 'pop', entranceDuration: 600 });
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.pr-tidslinje li[data-fas="entre"]')).display), 'none', 'med effekt ska Entré visas');

    await valj(page, 'catalog:latonskningar:youtube');
    assert.match(await page.evaluate(() => (document.querySelector('[data-panelram-sektion="1"]') || {}).innerText || ''), /Inget att testa/);

    // N-AB-009: Heart Me i vila (entré 0 ms).
    await valj(page, 'catalog:heartgoal:neon');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.pr-tidslinje li[data-fas="entre"]')).display), 'none', 'Heart Me i vila visar Entré');

    // N-AB-011: Goal Pro ritar ↘ i klonen; det får inte synas under testet.
    await valj(page, 'catalog:pggoal:1');
    await page.click('#pr-testspel');
    await page.waitForTimeout(600);
    const handtag = await page.evaluate(() => [...document.querySelectorAll('.canvas .resize-handle, .canvas .vyra-handle')]
      .filter(h => { const r = h.getBoundingClientRect(), cs = getComputedStyle(h); return r.width > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; })
      .map(h => h.className));
    assert.deepEqual(handtag, [], 'handtag syns på duken under testet');
    await page.evaluate(() => window.VyraTestspel.stoppa());
  } finally { await page.close(); }
});
