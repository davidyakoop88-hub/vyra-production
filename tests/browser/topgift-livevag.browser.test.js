'use strict';
// LIVEVÄGEN TILL TOP GIFT ÄR OFÖRÄNDRAD efter att testet fick en egen per-nod-funktion (PR 4).
//
// gift-event-images.js patchProfileWidget skriver nu via skrivProfilNod — samma funktion som
// ▶ Testa widget (topGiftSpelaPa) använder på klonen. Provet skickar riktiga gåvohändelser
// (vyra-live-event, samma väg som bryggan) till en studio med två Top Gift och kräver att
//   * VARJE Top Gift får givaren, gåvans styckvärde och bilden, i state och i DOM,
//   * flippen och rekordpulsen sätts på de riktiga noderna,
//   * den strikta rekordregeln gäller (records.bedom): en lika stor gåva byter inte person,
//     en större gör det,
//   * och att ett ▶/■ före gåvorna inte ändrar något av det.
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

const gava = (page, detail) => page.evaluate(d => {
  window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: Object.assign({ type: 'gift', count: 1 }, d) }));
}, detail);

const lage = page => page.evaluate(() => ['tg-a', 'tg-b'].map(id => {
  const w = state.widgets.find(x => x.id === id);
  const el = document.querySelector(`.canvas [data-id="${id}"]:not([data-testspel-klon])`);
  return {
    state: { namn: w.dataName, varde: String(w.dataValue), gava: w.giftImage },
    dom: {
      namn: el.querySelector('.topgift-copy strong').textContent,
      varde: el.querySelector('.topgift-copy em').textContent,
      gava: el.querySelector('.vyra-gift-face img').getAttribute('src'),
      play: el.classList.contains('play'), record: el.classList.contains('record'),
    },
  };
}));

for (const forst of [false, true]) {
  test(`livevägen uppdaterar varje Top Gift med strikt rekordregel${forst ? ' — efter ett ▶/■' : ''}`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', e => fel.push(String(e && e.message || e)));
    try {
      await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
      await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraGiftRecords, null, { timeout: 30000, polling: 100 });
      await page.waitForTimeout(2500);
      await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
      await page.waitForTimeout(400);
      await page.evaluate(() => {
        state.widgets.length = 0;
        const a = window.VyraWidgets.create('catalog:topgift:premium:neon'); a.id = 'tg-a'; a.x = 60; a.y = 120;
        const b = window.VyraWidgets.create('catalog:topgift:premium:royal'); b.id = 'tg-b'; b.x = 420; b.y = 120;
        state.widgets.push(a, b);
        selected = 'tg-a';
        render();
      });
      await page.waitForTimeout(1500);
      if (forst) {
        await page.click('#pr-testspel');
        await page.waitForTimeout(1500);
        await page.click('#pr-testspel');
        await page.waitForTimeout(200);
      }
      const rekord0 = await page.evaluate(() => window.VyraGiftRecords.giftCoins);

      await gava(page, { username: 'Kim', giftName: 'Rose', coins: rekord0 + 5 });
      await page.waitForTimeout(600);
      const v1 = String(rekord0 + 5);
      for (const w of await lage(page)) {
        assert.equal(w.state.namn, 'Kim', 'givaren skrivs i state');
        assert.equal(w.state.varde, v1, 'gåvans värde skrivs i state');
        assert.match(w.state.gava, /Rose/, 'gåvobilden från gåvonamnet');
        assert.equal(w.dom.namn, 'Kim', 'givaren syns i den riktiga noden');
        assert.match(w.dom.varde, new RegExp(v1 + '$'), 'värdet syns i den riktiga noden');
        assert.match(w.dom.gava, /Rose/);
        assert.equal(w.dom.play, true, 'flippen går');
        assert.equal(w.dom.record, true, 'rekordpulsen sattes');
      }
      assert.equal(await page.evaluate(() => window.VyraGiftRecords.giftCoins), rekord0 + 5);

      // Lika stor gåva: ingen ny person.
      await gava(page, { username: 'Lo', giftName: 'Rose', coins: rekord0 + 5 });
      await page.waitForTimeout(600);
      for (const w of await lage(page)) {
        assert.equal(w.state.namn, 'Kim', 'en lika stor gåva byter inte person (state)');
        assert.equal(w.dom.namn, 'Kim', 'en lika stor gåva byter inte person (DOM)');
      }

      // Större gåva per styck: ny person. Fem stycken à rekord+10 är värt rekord+10 styck.
      const per = rekord0 + 10;
      await gava(page, { username: 'Noa', giftName: 'Lion', coins: per * 5, count: 5 });
      await page.waitForTimeout(600);
      for (const w of await lage(page)) {
        assert.equal(w.state.namn, 'Noa');
        assert.equal(w.state.varde, String(per), 'styckvärdet, inte combons summa');
        assert.equal(w.dom.namn, 'Noa');
        assert.match(w.dom.varde, new RegExp(per + '$'));
      }
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}
