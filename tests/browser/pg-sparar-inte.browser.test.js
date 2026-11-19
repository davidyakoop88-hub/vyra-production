'use strict';
// GOAL PRO OCH PODIUM SPARAR INTE LAYOUTEN VID HÄNDELSER (2026-11-19).
//
// Provet i sändningen (#798) såg sex layoutsparningar på 15 s när Goal Pro, Podium och Like Fountain låg i samma layout,
// och ingen kunde säga vilken widget som skrev. Like Fountain visade sig skriva och spara per like (rättat i #801).
// Det här provet mäter de två andra FÖR SIG: en layout med bara Goal Pro och Top Gifter Podium, riktiga händelser
// genom samma ingång som live-client.js (VyraLive.ingest: emit + routeLiveBattleEvent), och två mått:
//   * hur många gånger save() anropas (save() skriver hela layouten, och cloud-sync.js skickar den vidare),
//   * om den sparade layouten (localStorage 'vyra-state') ändrats av händelserna.
// Utfallet, vad det än blir, är vaktat: ett fel som kommer tillbaka syns här i stället för i en sändning.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };

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

async function oppna(fel, widgets, vald) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fel.push(String(e && e.message || e)));
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraTestspel && !!window.VyraPlayground,
    null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(([lista, vald]) => {
    state.widgets.length = 0;
    lista.forEach(([id, n, pg], i) => {
      const w = window.VyraWidgets.create(n);
      w.id = id; w.x = 10 + (i % 3) * 140; w.y = 40 + Math.floor(i / 3) * 360; w.width = 130;
      if (pg) w.pg = Object.assign({}, w.pg, pg, { x: Object.assign({}, (w.pg || {}).x, pg.x || {}) });
      state.widgets.push(w);
    });
    selected = vald;
    save();
    render();
  }, [widgets, vald]);
  await page.waitForTimeout(1500);
  return page;
}


const LAYOUT = [
  ['sp-pa', 'catalog:pgpodium:royal-phoenix'], ['sp-pb', 'catalog:pgpodium:none'],
  ['sp-ma', 'catalog:pggoal:1', { x: { metric: 'coins', target: 2000 } }], ['sp-mb', 'catalog:pggoal:6', { x: { metric: 'coins', target: 2000 } }],
];
let lopnummer = 0;
const ingest = (page, e) => page.evaluate(e => window.VyraLive.ingest(Object.assign({ at: Date.now() }, e)), { id: 'sp-' + (++lopnummer), ...e });

test('en ström av gåvor, likes och följare sparar inte layouten (bara Goal Pro och Podium)', { skip, timeout: 180000 }, async () => {
  const fel = [];
  const page = await oppna(fel, LAYOUT, 'sp-pa');
  try {
    // `save` är en const i det globala lexikala scopet: den ligger inte på window och går inte att skriva över, så en spion
    // på window.save fångar aldrig något. Det som alla sparningar slutar i är en skrivning av nyckeln 'vyra-state', så den räknas.
    await page.evaluate(() => {
      window.__sparningar = 0;
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === 'vyra-state') window.__sparningar += 1; return orig.apply(this, arguments); };
    });
    const fore = await page.evaluate(() => localStorage.getItem('vyra-state'));
    // En livlig minut i komprimerad form: gåvor (olika givare, combo med repeatEnd), likes och följare.
    for (let i = 0; i < 12; i++) {
      await ingest(page, { type: 'gift', username: 'givare' + (i % 4), giftName: 'Rose', giftId: 'rose', diamonds: 5 * (1 + i % 3),
        coins: 5 * (1 + i % 3), count: 1 + i % 3, repeatEnd: true, profileImage: 'assets/gifts/events/7460_Cap.png' });
      await ingest(page, { type: 'like', username: 'tittare' + (i % 5), count: 4, profileImage: 'assets/gifts/events/7460_Cap.png' });
      if (i % 4 === 0) await ingest(page, { type: 'follow', username: 'ny' + i });
    }
    await page.waitForTimeout(3000);
    const efter = await page.evaluate(() => ({ sparningar: window.__sparningar, lagrat: localStorage.getItem('vyra-state'),
      mal: [...document.querySelectorAll('.canvas [data-id="sp-ma"] .pc, .canvas [data-id="sp-mb"] .pc')].map(n => n.textContent).join(),
      podium: (document.querySelector('.canvas [data-id="sp-pa"] .pcol.r1 .nm') || {}).textContent }));
    // Sanity: provet mäter fel sak om händelserna aldrig nådde widgetarna.
    assert.ok(efter.podium && efter.podium !== '', `podiet fick inga händelser: ${JSON.stringify(efter)}`);
    assert.equal(efter.sparningar, 0, `händelser skrev layouten (vyra-state) ${efter.sparningar} gånger (Goal Pro/Podium)`);
    assert.equal(efter.lagrat, fore, 'den sparade layouten ändrades av händelser');
    // KONTROLL: mätningen ser en riktig sparning. Utan den kunde "0 skrivningar" betyda att mätningen aldrig kunde ge något annat
    // (den första versionen av provet spionerade på window.save, som inte finns, och hade gett 0 vad som än hände).
    // writeActive är asynkron (värdet landar först när låset är taget), så skrivningen väntas in.
    await page.evaluate(() => { save(); });
    await page.waitForTimeout(600);
    const kontroll = await page.evaluate(() => window.__sparningar);
    assert.ok(kontroll >= 1, 'mätningen ser ingen skrivning av vyra-state ens när save() anropas — noll ovan betyder då ingenting');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally { await page.close(); }
});
