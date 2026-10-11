'use strict';
// REGEL NR 1: INGEN WIDGET SYNS I SÄNDNINGEN FÖRRÄN RIKTIGA EVENTS TÄNT DEN (2026-10-11).
//
// DAVIDS ORD: "Alla widget går inte aktiv om man inte aktiverar de i live … samma sak med Top Gift,
// de ska inte visas i skärmen om ingen börjat gifta först."
//
// UPPMÄTT I CHROMIUM, overlay-läge, pågående sändning, noll events — fyra familjer stod framme:
//   Top Gift (premium)   när widgeten läggs till EFTER live:start behåller den fabrikens
//                        '@StreamQueen · 44 999'; live-zero-state.js nollar texten till "◉ 0"
//                        men ramen och demogåvans bild står kvar.
//   Top Streak           samma mekanism: en ros och "×0 STREAK".
//   Top Gifter Podium    tre tomma ringar med "0" under varje.
//   Top Streak Flip      "?" i ramen och "Ingen streak än".
//   Fan Level 50         demomedlemmarna MICHELLY / GARY B. / NOVA STORM som riktiga fans.
//
// Provet mäter beräknad display på den körande sidan: dold vid noll, synlig efter första riktiga
// eventet. Eventen levereras som ingest() gör — både 'vyra-live-event' och routeLiveBattleEvent().
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

// [nyckel, hur den tänds]
const FALL = [
  ['catalog:topgift:premium:neon', 'gift'],
  ['catalog:topstreak', 'streak'],
  ['catalog:pgpodium:celestial-serpent', 'gift'],
  ['catalog:pgstreak:emerald-grove', 'streak'],
  ['catalog:fanlevel50:royal', 'fan50']
];

async function mat(nyckel, tand) {
  const sida = await browser.newPage({ viewport: { width: 432, height: 768 } });
  try {
    await sida.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
    await sida.waitForFunction(() => typeof VyraWidgets !== 'undefined' && typeof render === 'function'
      && window.VyraLiveSession && window.VyraTomWidget && typeof routeLiveBattleEvent === 'function', null, { timeout: 60000 });
    await sida.waitForTimeout(500);
    return await sida.evaluate(async ({ nyckel, tand, SESSION }) => {
      // Sändningen pågår REDAN när widgeten läggs till — det är fallet som bar platshållaren in.
      window.VyraLiveSession.runtime().behandla({ type: 'livesession', event: 'live:start', eventId: 'live:start:' + SESSION, sessionId: SESSION, startedAt: new Date().toISOString() });
      await new Promise(r => setTimeout(r, 300));
      const st = window.eval('state'); st.widgets = [];
      const w = VyraWidgets.create(nyckel); w.x = 16; w.y = 16; st.widgets.push(w);
      render();
      await new Promise(r => setTimeout(r, 1200));
      const synlig = () => {
        const el = document.querySelector(`[data-id="${w.id}"]`);
        if (!el) return 'saknas';
        const cs = getComputedStyle(el), r = el.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      };
      const text = () => (document.querySelector(`[data-id="${w.id}"]`) || { innerText: '' }).innerText.replace(/\s+/g, ' ').trim();
      const fore = { synlig: synlig(), text: text() };
      const leverera = d => { dispatchEvent(new CustomEvent('vyra-live-event', { detail: d })); routeLiveBattleEvent(d); };
      const gift = (u, n, coins, rep) => leverera({ type: 'gift', username: u, uniqueId: u, name: n, giftName: 'Rose', giftId: 5655, coins, diamondCount: coins, diamonds: coins, value: coins, repeatCount: rep, count: rep, combo: rep, tillVarden: true });
      if (tand === 'gift') gift('anna_01', 'Anna', 5, 1);
      else if (tand === 'streak') { gift('anna_01', 'Anna', 1, 1); await new Promise(r => setTimeout(r, 150)); gift('anna_01', 'Anna', 2, 2); await new Promise(r => setTimeout(r, 150)); gift('anna_01', 'Anna', 3, 3); }
      else if (tand === 'fan50') window.VyraFanLevel50.addAuto({ name: 'Anna', avatar: '' });
      await new Promise(r => setTimeout(r, 1800));
      return { fore, efter: { synlig: synlig(), text: text() } };
    }, { nyckel, tand, SESSION });
  } finally { await sida.close(); }
}

for (const [nyckel, tand] of FALL) {
  test(`${nyckel}: dold utan events, synlig efter första riktiga eventet`, { skip, timeout: 120000 }, async () => {
    const m = await mat(nyckel, tand);
    assert.equal(m.fore.synlig, false, `syns i sändningen utan ett enda event: "${m.fore.text}"`);
    assert.equal(m.efter.synlig, true, `tändes inte av eventet: "${m.efter.text}"`);
    assert.match(m.efter.text, /Anna|anna_01/i, `namnet saknas efter eventet: "${m.efter.text}"`);
  });
}
