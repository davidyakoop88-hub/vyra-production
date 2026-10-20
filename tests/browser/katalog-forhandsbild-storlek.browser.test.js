'use strict';
// KATALOGKORTENS FÖRHANDSBILD FYLLER SIN BILDYTA.
//
// Granskningen 2026-10-17 (F36): "Rankingförhandsbilderna upptar en liten del av bildytan." Uppmätt
// på main vid 1400 px innan rättningen: rankingkorten (Top Like/Top Coins/Top Points) täckte 14–39 %
// av sin 104 px höga bildyta, median 31 %, och Basic v2 klipptes dessutom i vänsterkanten.
//
// Två orsaker, två ändringar:
//   · overlay-preview.js skalade efter widgetens HELA låda, genomskinlig luft inräknad, och ramade
//     bara om till det synliga innehållet när ett kort var nästan helt tomt (< 5 %). Nu ramas varje
//     kort under halv täckning om — men omramningen behålls bara när den täcker mer.
//   · Bildytan var 104 px i ett kort på ~290 px. Den är nu 140 px.
//
// Provet mäter samma sak som granskningen såg: hur stor del av kortets bildyta som täcks av MÅLAT
// innehåll (bakgrund, bild, canvas, svg eller text) inne i klippytan. Widgetrenderingen själv och
// tests/visual rörs inte — det här är bara hur katalogen ramar in miniatyren.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' };

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
const skip = hoppaOver();

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

test('rankingkortens förhandsbilder täcker sin bildyta', { skip, timeout: 240000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  try {
    await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState, null,
      { timeout: 30000, polling: 100 });
    // En ny, tom profil: aldrig användarens riktiga layout.
    await page.evaluate(async () => {
      await window.VyraSessionState.projectLocalSession();
      let forra = -1;
      for (let t = 0; t < 40; t++) {
        go('overlay');
        await new Promise(r => setTimeout(r, 250));
        const n = document.querySelectorAll('.widget-catalog [data-catalog-key]').length;
        if (n > 100 && n === forra) break;
        forra = n;
      }
    });
    // Miniatyrerna ritas lat när de närmar sig vyn: rulla rankingsektionen förbi.
    await page.evaluate(async () => {
      const sektion = [...document.querySelectorAll('.widget-catalog section')]
        .find(s => /RANKING · SAMMA/.test(s.textContent));
      const topp = sektion.getBoundingClientRect().top + scrollY, h = sektion.offsetHeight;
      for (let y = topp - 200; y < topp + h; y += 300) { scrollTo(0, y); await new Promise(r => setTimeout(r, 150)); }
      await new Promise(r => setTimeout(r, 1500));
    });
    const kort = await page.evaluate(() => {
      const ut = [];
      for (const b of document.querySelectorAll('.overlay-widget-gallery .widget-catalog button[data-catalog-key]')) {
        if (b.closest('.owg-thumb') || !/^catalog:(ranking|toplike):/.test(b.dataset.catalogKey)) continue;
        const t = b.querySelector('.owg-thumb'); if (!t || !b.getClientRects().length) continue;
        const inner = (t.shadowRoot || t).querySelector('.owg-thumb-inner'); if (!inner) continue;
        const tr = t.getBoundingClientRect();
        let l0 = Infinity, t0 = Infinity, r0 = -Infinity, b0 = -Infinity, nagot = false;
        for (const el of inner.querySelectorAll('*')) {
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
          const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
          const malad = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none'
            || /^(IMG|CANVAS|SVG|VIDEO)$/i.test(el.tagName)
            || [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
          if (!malad) continue;
          const l = Math.max(r.left, tr.left), tt = Math.max(r.top, tr.top), rr = Math.min(r.right, tr.right), bb = Math.min(r.bottom, tr.bottom);
          if (rr - l > 1 && bb - tt > 1) { nagot = true; l0 = Math.min(l0, l); t0 = Math.min(t0, tt); r0 = Math.max(r0, rr); b0 = Math.max(b0, bb); }
        }
        ut.push({ nyckel: b.dataset.catalogKey, bildHojd: Math.round(tr.height), kortHojd: Math.round(b.getBoundingClientRect().height),
          tackning: nagot ? +(((r0 - l0) * (b0 - t0)) / (tr.width * tr.height)).toFixed(2) : 0 });
      }
      return ut;
    });
    assert.ok(kort.length >= 9, `bara ${kort.length} rankingkort ritades — provet mäter inget`);
    const sorterad = kort.map(k => k.tackning).sort((a, b) => a - b), median = sorterad[sorterad.length >> 1];
    const sammanfattning = kort.map(k => `${k.nyckel.replace('catalog:', '')}=${k.tackning}`).join(', ');
    assert.ok(median >= 0.38, `median-täckningen är ${median} (main före rättningen: 0,31) — ${sammanfattning}`);
    for (const k of kort) {
      assert.ok(k.tackning >= 0.22, `${k.nyckel} täcker bara ${Math.round(k.tackning * 100)} % av bildytan (main: 14 %)`);
      assert.ok(k.bildHojd >= 0.4 * k.kortHojd,
        `${k.nyckel}: bildytan är ${k.bildHojd} px av ett ${k.kortHojd} px högt kort — under 40 %`);
    }
  } finally { await page.close(); }
});
