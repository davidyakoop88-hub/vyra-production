'use strict';
// LIVEVÄGEN TILL LAST-X ÄR OFÖRÄNDRAD efter att testet fick en egen per-nod-väg (PR 5).
//
// ▶ Testa widget spelar nu på en klon via lastXSpelaPa({prov:true}) i last-x-alerts.js, som hoppar
// över w.lastXLatest och save(). Provet skickar riktiga händelser genom VyraLive.ingest — samma väg
// som bryggan och molnet (live-client.js → routeLiveBattleEvent → showLastX) — till en studio med
// tre Last-X och kräver att
//   * en gåva tänder VARJE Last-X som visar gåvor, och bara dem (C visar bara likes),
//   * varje tänd widget får w.lastXLatest i state och att layouten sparas (efter 700 ms, som förut),
//   * rubrik och meddelande per typ (w.lastXLabel / w.lastXMessage) syns i sändningen,
//   * visningstiden styr hur länge kortet ligger kvar (5 s mot 10 s) och "Behåll senaste personen
//     synlig" låter kortet ligga kvar efter tiden,
//   * och att ett ▶/■ före händelserna inte ändrar något av det.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

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

let nr = 0;
const handelse = (page, e) => page.evaluate(ev => window.VyraLive.ingest(ev), Object.assign({ id: 'lx-livevag-' + (++nr) }, e));

const lage = page => page.evaluate(() => Object.fromEntries(['lx-a', 'lx-b', 'lx-c'].map(id => {
  const w = state.widgets.find(x => x.id === id);
  const el = document.querySelector(`.canvas [data-id="${id}"]:not([data-testspel-klon])`);
  const t = sel => (el.querySelector(sel) || {}).textContent || '';
  return [id, {
    senaste: w.lastXLatest ? Object.fromEntries(Object.entries(w.lastXLatest).map(([k, v]) => [k, v && v.username])) : null,
    aktiv: el.classList.contains('last-x-active'), lamnar: el.classList.contains('last-x-leaving'), kvar: el.classList.contains('last-x-sticky'),
    rubrik: t('.last-x-label'), namn: t('.last-x-name'), meddelande: t('.last-x-message'),
  }];
})));

for (const forst of [false, true]) {
  test(`livevägen tänder varje Last-X av typen och sparar lastXLatest${forst ? ' — efter ett ▶/■' : ''}`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', e => fel.push(String(e && e.message || e)));
    try {
      await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
      await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraLive && !!window.lastXSpelaPa, null, { timeout: 30000, polling: 100 });
      await page.waitForTimeout(2500);
      await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
      await page.waitForTimeout(400);
      await page.evaluate(() => {
        state.widgets.length = 0;
        const lagg = (n, id, x, y, extra) => { const w = Object.assign(window.VyraWidgets.create(n), extra); w.id = id; w.x = x; w.y = y; state.widgets.push(w); };
        // A: alla typer, visningstid 10 s och egen rubrik för likes. B: bara gåvor, 5 s och eget
        // gåvomeddelande. Ingen av dem
        // behåller kortet, så utgången syns. C: bara likes, behåller den senaste personen.
        lagg('catalog:lastx:card', 'lx-a', 40, 80, { followDuration: 10, lastXPersistent: false, lastXLabel: { liker: 'GILLA!' } });
        lagg('catalog:lastx:stack', 'lx-b', 520, 80, { lastXType: 'gifter', followDuration: 5, lastXPersistent: false, lastXMessage: { gifter: 'TACK {namn} FÖR {antal} {gåva}' } });
        lagg('catalog:lastx:badge', 'lx-c', 40, 420, { lastXType: 'liker' });
        selected = 'lx-a';
        save();
        render();
      });
      await page.waitForTimeout(1500);
      if (forst) {
        await page.click('#pr-testspel');
        await page.waitForTimeout(1500);
        await page.click('#pr-testspel');
        await page.waitForTimeout(200);
      }
      // Räkna sparningar från och med nu (studio.js save(): VyraSessionState.writeActive('vyra-state')).
      await page.evaluate(() => {
        window.__sparat = 0;
        const S = window.VyraSessionState, orig = S.writeActive;
        S.writeActive = function () { if (String(arguments[0]).startsWith('vyra-state')) window.__sparat++; return orig.apply(this, arguments); };
      });

      // En gåva: A och B tänds, C (bara likes) inte.
      await handelse(page, { type: 'gift', username: 'Kim', giftName: 'Rose', count: 3, coins: 3 });
      await page.waitForTimeout(150);
      let l = await lage(page);
      assert.equal(l['lx-a'].aktiv, true, 'A tändes av gåvan');
      assert.equal(l['lx-b'].aktiv, true, 'B tändes av gåvan');
      assert.equal(l['lx-c'].aktiv, false, 'C visar bara likes och tändes inte');
      assert.equal(l['lx-a'].namn, 'Kim');
      assert.equal(l['lx-a'].meddelande, 'SKICKADE ROSE ×3', 'standardmeddelandet för en gåva');
      assert.equal(l['lx-a'].rubrik, 'SENASTE GÅVOGIVARE');
      assert.equal(l['lx-b'].meddelande, 'TACK Kim FÖR 3 Rose', 'B:s eget meddelande för gåvor');
      await page.waitForTimeout(900);
      l = await lage(page);
      assert.deepEqual(l['lx-a'].senaste, { gifter: 'Kim' }, 'A:s lastXLatest i state');
      assert.deepEqual(l['lx-b'].senaste, { gifter: 'Kim' }, 'B:s lastXLatest i state');
      assert.equal(l['lx-c'].senaste, null);
      assert.ok(await page.evaluate(() => window.__sparat) >= 1, 'layouten sparades efter händelsen');

      // En like: A byter till likens rubrik på plats (samma kort, ny typ köas efter gåvan), C tänds.
      await handelse(page, { type: 'like', username: 'Mia', count: 20 });
      await page.waitForTimeout(150);
      l = await lage(page);
      assert.equal(l['lx-c'].aktiv, true, 'C tändes av liken');
      assert.equal(l['lx-c'].namn, 'Mia');
      assert.equal(l['lx-c'].meddelande, 'SKICKADE 20 LIKES');

      // Visningstiden: B (5 s) har gått ut efter ~6,5 s, A (10 s) visar fortfarande.
      await page.waitForTimeout(6300);
      l = await lage(page);
      assert.equal(l['lx-b'].aktiv && !l['lx-b'].lamnar, false, 'B:s 5 s är slut');
      assert.equal(l['lx-a'].aktiv, true, 'A:s 10 s är inte slut');
      // C behåller den senaste personen synlig efter sin tid.
      assert.equal(l['lx-c'].kvar, true, 'C behåller den senaste personen (last-x-sticky)');

      // A visar liken efter gåvan, med sin egen rubrik för likes.
      await page.waitForFunction(() => document.querySelector('.canvas [data-id="lx-a"]:not([data-testspel-klon]) .last-x-label').textContent === 'GILLA!',
        null, { timeout: 12000, polling: 100 });
      l = await lage(page);
      assert.equal(l['lx-a'].namn, 'Mia', 'A visar liken efter gåvan');
      assert.deepEqual(l['lx-a'].senaste, { gifter: 'Kim', liker: 'Mia' });
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}
