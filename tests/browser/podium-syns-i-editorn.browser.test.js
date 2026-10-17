'use strict';
// PODIET OCH STREAK-FLIPPEN SYNS I EDITORN, MEN VISAR BARA RIKTIGA TITTARE I OVERLAY (2026-10-11).
//
// DAVIDS ORD, med en skärmbild av editorn: "de modellerna knappt man kan se de". Utan events stod
// Top Gifter Podium med tre dimmade ringar (.pcol.dim = opacity .4), "?" och "—", och Top Streak
// Flip med "Ingen streak än" — i editorn, där man ska se hur designen ser ut. Alla andra familjer
// visar demovärden där.
//
// Två mätningar på den körande sidan: i editorn är ingen kolumn dimmad och demonamnen står där;
// i overlay utan events står inga namn alls (regel nr 1), och efter en riktig gåva står givaren.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  '.json': 'application/json', '.woff2': 'font/woff2', '.gif': 'image/gif', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
    if (rel.startsWith('api/')) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{}'); return; }
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
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
test.after(async () => { if (browser) await browser.close(); if (server) server.close(); });

async function mat(overlay, nyckel, medGava) {
  const sida = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  try {
    await sida.goto(`${bas}/studio.html?${overlay ? 'overlay=1' : 'open=layout'}`, { waitUntil: 'load' });
    await sida.waitForFunction(() => typeof VyraWidgets !== 'undefined' && typeof render === 'function' && typeof routeLiveBattleEvent === 'function', null, { timeout: 60000 });
    await sida.waitForTimeout(500);
    return await sida.evaluate(async ({ nyckel, medGava }) => {
      const st = window.eval('state'); st.widgets = [];
      const w = VyraWidgets.create(nyckel); w.x = 16; w.y = 16; st.widgets.push(w);
      try { window.eval('selected=null') } catch (e) {}
      render();
      await new Promise(r => setTimeout(r, 900));
      if (medGava) {
        const d = { type: 'gift', username: 'anna_01', name: 'Anna', giftName: 'Rose', giftId: 5655, coins: 5, diamonds: 5, repeatCount: 3, count: 3, tillVarden: true };
        dispatchEvent(new CustomEvent('vyra-live-event', { detail: d })); routeLiveBattleEvent(d);
        await new Promise(r => setTimeout(r, 900));
      }
      const el = document.querySelector(`[data-id="${w.id}"]`);
      const namn = [...el.querySelectorAll('.pcol .nm, .stk-nm')].map(n => n.textContent.trim()).filter(Boolean);
      const dimmade = el.querySelectorAll('.pcol.dim').length;
      const pill = (el.querySelector('.stk-pill b') || {}).textContent;
      return { namn, dimmade, pill, tom: el.classList.contains('stk-empty') || !!el.querySelector('.stk-empty') };
    }, { nyckel, medGava });
  } finally { await sida.close(); }
}

test('podiet i editorn: tre demopersoner, ingen kolumn dimmad', { skip, timeout: 120000 }, async () => {
  const m = await mat(false, 'catalog:pgpodium:celestial-serpent', false);
  assert.deepEqual(m.namn, ['Jokero', 'Lina', 'Nova'], JSON.stringify(m));   // kolumnordning 2-1-3
  assert.equal(m.dimmade, 0, 'ingen kolumn ska vara dimmad i editorn');
});

test('podiet i overlay: inga demonamn utan events, givaren efter en gåva', { skip, timeout: 120000 }, async () => {
  const utan = await mat(true, 'catalog:pgpodium:celestial-serpent', false);
  assert.ok(!utan.namn.some(n => /Lina|Jokero|Nova/.test(n)), `demonamn i sändningen: ${JSON.stringify(utan)}`);
  const med = await mat(true, 'catalog:pgpodium:celestial-serpent', true);
  assert.ok(med.namn.includes('anna_01'), JSON.stringify(med));
  assert.ok(!med.namn.some(n => /Lina|Jokero|Nova/.test(n)), `demonamn bredvid en riktig givare: ${JSON.stringify(med)}`);
});

test('streak-flippen i editorn visar en demostreak, i overlay bara riktiga', { skip, timeout: 120000 }, async () => {
  const editor = await mat(false, 'catalog:pgstreak:emerald-wings', false);
  assert.deepEqual(editor.namn, ['Lina'], JSON.stringify(editor));
  assert.equal(editor.pill, '12');
  assert.equal(editor.tom, false, 'stk-empty ska inte stå kvar i editorn');
  const overlay = await mat(true, 'catalog:pgstreak:emerald-wings', true);
  assert.deepEqual(overlay.namn, ['anna_01'], JSON.stringify(overlay));
});
