'use strict';
// RÄTT DESIGN FRÅN FÖRSTA RITNINGEN — Top Streak, Top Like och Top Coins i en riktig webbläsare.
//
// approved-rankings.js och ranking-sixpack.js installerade förr sina omslag på fönstrets `load`,
// som väntar på varenda bild. Tills dess ritades den gamla designen: Top Streak blev en 330x92-
// remsa (streak-inferno) i stället för Clean Flip, och bytte storlek när bilderna väl kommit.
// David 2026-09-26: "de ska flippa mellan profilbilden och sen giften", som Top Gifter, från början.
//
// Provet håller inne alla bilder och kräver att rätt design redan står där innan `load`, och att
// ingenting byter storlek när bilderna släpps.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp' };
function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''), fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' }); fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}
let server, browser, bas, skip = hoppaOver();
test.before(async () => { if (skip) return; browser = await startaWebblasare(); if (!browser) throw new Error('webblasaren kunde inte starta'); server = await servera(); bas = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });

const NYCKLAR = { streak: 'catalog:topstreak', like: 'catalog:toplike:voltage', coins: 'catalog:ranking:templateTopCoins:voltage' };

test('Top Streak, Top Like och Top Coins har rätt design innan bilderna laddat', { skip, timeout: 120000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const fel = []; page.on('pageerror', e => fel.push(e.message));
  let slapp; const vantan = new Promise(r => { slapp = r; });
  await page.route(/\/assets\/.*\.(png|webp|jpe?g|gif|svg)(\?|$)/i, async rt => { await vantan; await rt.continue(); });
  try {
    await page.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState && !!window.VyraWidgets, null, { timeout: 60000, polling: 100 });
    const ids = await page.evaluate(async nycklar => {
      await VyraSessionState.projectLocalSession(); window.toast = () => {}; state.widgets.length = 0;
      const ut = {}; let y = 0;
      for (const [namn, k] of Object.entries(nycklar)) { const w = VyraWidgets.create(k); w.x = 0; w.y = y; y += 300; state.widgets.push(w); ut[namn] = w.id; }
      render(); return ut;
    }, NYCKLAR);
    await page.waitForTimeout(1500);
    const mat = () => page.evaluate(ids => {
      const ut = { laddad: document.readyState === 'complete' };
      for (const [namn, id] of Object.entries(ids)) {
        const el = document.querySelector(`.widget[data-id="${id}"]`);
        ut[namn] = el ? { streak: el.classList.contains('approved-streak') && !!el.querySelector('.streak-flip .streak-profile-face'), rk6: /\brk6/.test(el.className + ' ' + el.innerHTML.slice(0, 400)) && !!el.querySelector('.rk6-av'), b: el.offsetWidth, h: el.offsetHeight } : null;
      }
      return ut;
    }, ids);
    const fore = await mat();
    assert.equal(fore.laddad, false, 'sidan hann ladda klart — provet håller inte inne bilderna');
    assert.ok(fore.streak && fore.streak.streak, `Top Streak ritas med gammal design innan load: ${JSON.stringify(fore.streak)}`);
    assert.ok(fore.like && fore.like.rk6, `Top Like ritas med gammal design innan load: ${JSON.stringify(fore.like)}`);
    assert.ok(fore.coins && fore.coins.rk6, `Top Coins ritas med gammal design innan load: ${JSON.stringify(fore.coins)}`);

    slapp();
    await page.waitForFunction(() => document.readyState === 'complete', null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const efter = await mat();
    for (const namn of Object.keys(NYCKLAR)) {
      assert.deepEqual(efter[namn], fore[namn], `${namn} ändrades när bilderna kom: ${JSON.stringify(fore[namn])} -> ${JSON.stringify(efter[namn])}`);
    }
    assert.deepEqual(fel, []);
  } finally { slapp(); await page.close(); }
});
