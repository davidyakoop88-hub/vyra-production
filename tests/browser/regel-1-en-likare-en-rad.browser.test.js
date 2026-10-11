'use strict';
// REGEL NR 1: EN LIKARE = EN RAD (2026-10-11).
//
// DAVIDS ORD: "Alla widget går inte aktiv om man inte aktiverar de i live. Om det bara är en som
// likar ska topplistan inte visa andra namn under tills alla börjar tappa."
//
// UPPMÄTT I CHROMIUM, overlay-läge med pågående sändning, ett like-event från EN person: Top Like
// basic-v2 visade Anna på rad 1 — och fyra rader till med tom avatar och "0 ♥" under henne. Samma
// sak i alla 20 rankingdesigner (Top Like 6, Top Coins 8, Top Points 6).
//
// ROTORSAKEN ÄR INTE ATT RADERNA GLÖMS. live-leaderboard.js skriver `row.style.display = 'none'`
// på varje rad utan person. Men temana deklarerar radens layout med `!important`
// (studio.css: `.toplike-row:has(>.pro-avatar-frame){display:grid!important}`, podiet:
// `.toplike-row:nth-child(-n+3){display:flex!important}` — 31 sådana regler), och en inline-stil
// UTAN prioritet förlorar mot dem. Uppmätt rad för rad: inline 'none', prioritet '', beräknat
// 'grid', höjd 58 px. Exakt samma fälla som vyra-tom-widget.js redan dokumenterar för hela
// widgeten ("inline display:none hamnade rätt i style-attributet men datorn räknade ändå fram
// display:flex").
//
// Provet mäter det BERÄKNADE värdet på den körande sidan, inte källtexten.
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

const SESSION = '0f3f2a8e-9c6d-4b0a-8e2d-1a2b3c4d5e6f';

// En nyckel per renderare: approved-rankings (basic-v2), ranking-sixpack (celestial/prism/royal-
// rose/voltage), topcoins-v2 (halo/signal-orbit) och toppoints-v2 — samma felbild i alla.
const NYCKLAR = ['catalog:toplike:basic-v2', 'catalog:toplike:voltage', 'catalog:toplike:prism-vertical',
  'catalog:ranking:templateTopCoins:celestial', 'catalog:ranking:templateTopPoints:royal-rose'];

async function mat(nyckel) {
  const sida = await browser.newPage({ viewport: { width: 432, height: 768 } });
  try {
    await sida.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
    await sida.waitForFunction(() => typeof VyraWidgets !== 'undefined' && typeof render === 'function' && window.VyraLiveSession, null, { timeout: 60000 });
    await sida.waitForTimeout(500);
    return await sida.evaluate(async ({ nyckel, SESSION }) => {
      const st = window.eval('state'); st.widgets = [];
      const w = VyraWidgets.create(nyckel); w.x = 16; w.y = 16; st.widgets.push(w);
      render();
      await new Promise(r => setTimeout(r, 300));
      window.VyraLiveSession.runtime().behandla({ type: 'livesession', event: 'live:start', eventId: 'live:start:' + SESSION, sessionId: SESSION, startedAt: new Date().toISOString() });
      await new Promise(r => setTimeout(r, 400));
      const rader = () => {
        const el = document.querySelector(`[data-id="${w.id}"]`);
        return [...el.querySelectorAll('.toplike-row')].map(row => ({
          namn: String((row.querySelector('strong') || {}).textContent || '').trim(),
          synlig: getComputedStyle(row).display !== 'none' && row.getBoundingClientRect().height > 0
        }));
      };
      const like = (u, n, count) => dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'like', username: u, uniqueId: u, name: n, count, likes: count } }));
      const gift = (u, n, coins) => dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'gift', username: u, uniqueId: u, name: n, giftName: 'Rose', giftId: 5655, coins, diamondCount: coins, diamonds: coins, value: coins, repeatCount: 1, count: 1, tillVarden: true } }));
      like('anna_01', 'Anna', 12); gift('anna_01', 'Anna', 3);
      await new Promise(r => setTimeout(r, 1800));
      const en = rader();
      like('bo_02', 'Bo', 40); gift('bo_02', 'Bo', 9); like('cem_03', 'Cem', 7); gift('cem_03', 'Cem', 1);
      await new Promise(r => setTimeout(r, 1800));
      const tre = rader();
      return { en, tre };
    }, { nyckel, SESSION });
  } finally { await sida.close(); }
}

for (const nyckel of NYCKLAR) {
  test(`${nyckel}: en bidragsgivare ger exakt en synlig rad, tre ger tre`, { skip, timeout: 120000 }, async () => {
    const { en, tre } = await mat(nyckel);
    const synligaEn = en.filter(r => r.synlig), synligaTre = tre.filter(r => r.synlig);
    assert.deepEqual(synligaEn.map(r => r.namn), ['Anna'], `en likare: ${JSON.stringify(en)}`);
    assert.equal(synligaTre.length, 3, `tre bidragsgivare: ${JSON.stringify(tre)}`);
    assert.ok(synligaTre.every(r => r.namn), `en synlig rad utan namn: ${JSON.stringify(tre)}`);
  });
}
