'use strict';
// LIVEVÄGEN ÄR OFÖRÄNDRAD FÖR BATTLE MVP (PR 7 i panelspecifikationen).
//
// triggerBattleMvp (media.js) tänder sedan PR 7 varje widget med per-nod-funktionen mvpSpelaPa, som
// ▶ Testa widget också använder för sin klon. Provet kräver att en riktig MVP beter sig som förut:
//   * den globala triggern — det namn battle-mvp-session.js och routeLiveBattleEvent anropar — går via
//     VyraAlertQueue (köomslaget i runtime-controls.js, prioritet 10), och kön får EN post,
//   * den tänder VARJE MVP-widget — klassisk, ram och firande — med vinnarens namn i noden,
//   * den skriver vinnarens namn, poäng och profilbild på varje MVP-widget och sparar (som förut:
//     battle-mvp-session.js nollställer dem igen vid nästa sändning),
//   * Visningstid styr hur länge widgeten visas,
//   * allt det gäller också efter ett ▶/■ i panelen, och ▶/■ självt ändrar ingen widgets mvpName.
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

// a: klassisk med visningstid 2 s, b: ram, c: firande. a vald. Köomslagen i runtime-controls.js
// installeras 500 och 2200 ms efter laddning, så sidan får stå längre än så.
const NYCKLAR = ['catalog:battlemvp:inferno', 'catalog:battlemvp:frame:royal-ribbon', 'catalog:battlemvp:celebration:coronation'];
const NAMN_SEL = { 'lv-a': '.mvp-copy h2', 'lv-b': '.mvpf-row strong', 'lv-c': '.mvc-copy h2' };
const BILD = 'assets/gifts/events/7460_Cap.png';

async function oppna(fel) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fel.push(String(e && e.message || e)));
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraAlertQueue && !!window.VyraTestspel,
    null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2800);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(nycklar => {
    state.widgets.length = 0;
    ['a', 'b', 'c'].forEach((id, i) => {
      const w = window.VyraWidgets.create(nycklar[i]);
      w.id = 'lv-' + id; w.x = 20 + i * 420; w.y = 60;
      if (id === 'a') w.mvpDuration = 2;
      state.widgets.push(w);
    });
    selected = 'lv-a';
    save();
    render();
  }, NYCKLAR);
  await page.waitForTimeout(1500);
  // Räknare: köns poster och sparningar (studio.js save(): VyraSessionState.writeActive('vyra-state')).
  await page.evaluate(() => {
    window.__ko = 0; window.__sparat = 0;
    const Q = window.VyraAlertQueue, push = Q.push;
    Q.push = function () { window.__ko++; return push.apply(this, arguments); };
    const S = window.VyraSessionState, orig = S.writeActive;
    S.writeActive = function () { if (String(arguments[0]).startsWith('vyra-state')) window.__sparat++; return orig.apply(this, arguments); };
  });
  return page;
}

const lage = page => page.evaluate(sel => Object.fromEntries(Object.entries(sel).map(([id, s]) => {
  const el = document.querySelector(`.canvas [data-id="${id}"]:not([data-testspel-klon])`);
  const w = state.widgets.find(x => x.id === id);
  return [id, { aktiv: !!el && el.classList.contains('mvp-active'), namn: el ? ((el.querySelector(s) || {}).textContent || '').trim() : null,
    bild: el ? (el.querySelector('img') || {}).getAttribute?.('src') || null : null, w: [w.mvpName, w.mvpScore, w.profileImage] }];
})), NAMN_SEL);
const raknare = page => page.evaluate(() => ({ ko: window.__ko, sparat: window.__sparat }));
const namnIState = page => page.evaluate(() => state.widgets.map(w => w.id + ':' + w.mvpName + ':' + w.mvpScore));

for (const forst of [false, true]) {
  const efter = forst ? ' — efter ett ▶/■' : '';

  test(`Battle MVP: livetriggern går via kön, tänder varje MVP-widget och skriver vinnaren som förut${efter}`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppna(fel);
    try {
      if (forst) {
        const fore = await namnIState(page);
        await page.click('#pr-testspel');
        await page.waitForTimeout(900);
        await page.click('#pr-testspel');
        await page.waitForTimeout(200);
        assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'klonen är borta efter ■');
        assert.deepEqual(await namnIState(page), fore, '▶/■ ändrade ingen widgets namn eller poäng');
        assert.deepEqual(await raknare(page), { ko: 0, sparat: 0 }, '▶/■ köade och sparade ingenting');
      }
      const fore = await lage(page);
      assert.deepEqual(Object.values(fore).map(x => x.aktiv), [false, false, false], 'kontrollmätning: inget är tänt');
      await page.evaluate(b => window.triggerBattleMvp({ name: 'Kim', score: 4200, profileImage: b }), BILD);
      await page.waitForTimeout(250);
      const l = await lage(page);
      for (const id of ['lv-a', 'lv-b', 'lv-c']) {
        assert.equal(l[id].aktiv, true, `${id} tändes`);
        assert.equal(l[id].namn, 'Kim', `${id} visar vinnarens namn`);
        assert.equal(l[id].bild, BILD, `${id} visar vinnarens profilbild`);
        assert.deepEqual(l[id].w, ['Kim', 4200, BILD], `${id}: vinnaren skrevs på widgeten som förut`);
      }
      const r = await raknare(page);
      assert.equal(r.ko, 1, 'en köpost för händelsen');
      assert.ok(r.sparat >= 1, 'vinnaren sparades som förut');
      // Visningstiden: a (2 s) är släckt efter ~2,4 s, b och c (10 s) visas fortfarande.
      await page.waitForTimeout(2200);
      const st = await lage(page);
      assert.deepEqual([st['lv-a'].aktiv, st['lv-b'].aktiv, st['lv-c'].aktiv], [false, true, true], 'a:s visningstid (2 s) är slut, b:s och c:s (10 s) inte');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}
