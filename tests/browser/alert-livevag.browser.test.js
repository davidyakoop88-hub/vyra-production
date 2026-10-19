'use strict';
// LIVEVÄGEN ÄR OFÖRÄNDRAD FÖR ALERTFAMILJERNA (PR 6 i panelspecifikationen).
//
// triggerFanLevelUp, triggerGifterLevelUp, triggerNewFollower och triggerGuardianEmblem (media.js)
// delegerar sedan PR 6 till per-nod-funktioner (fanSpelaPa, gifterSpelaPa, followerSpelaPa,
// guardianSpelaPa) som ▶ Testa widget också använder för sin klon. Provet kräver att en riktig händelse
// beter sig som förut:
//   * den globala triggern — det namn sessionsfilerna anropar — går via VyraAlertQueue (köomslagen i
//     runtime-controls.js), och kön får EN post per händelse,
//   * den tänder VARJE widget av typen, med händelsens namn,
//   * grindarna gäller: Automatisk trigger av och Minsta nivå stoppar en händelse, Fan Level Up kräver
//     teammedlem som standard, och ett dolt Guardian-emblem tänds aldrig,
//   * Visningstid styr hur länge widgeten visas,
//   * ingenting skrivs till widgeten och ingenting sparas,
//   * allt det gäller också efter ett ▶/■ i panelen.
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

// Tre widgetar av samma familj (a, b, c) med egna inställningar per familj, a vald. Köomslagen i
// runtime-controls.js installeras 500 och 2200 ms efter laddning, så sidan får stå längre än så.
async function oppna(fel, nycklar, extra) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fel.push(String(e && e.message || e)));
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraAlertQueue && !!window.VyraTestspel,
    null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2800);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(([nycklar, extra]) => {
    state.widgets.length = 0;
    ['a', 'b', 'c'].forEach((id, i) => {
      const w = Object.assign(window.VyraWidgets.create(nycklar[i]), extra[i] || {});
      w.id = 'lv-' + id; w.x = 20 + i * 300; w.y = 60;
      state.widgets.push(w);
    });
    selected = 'lv-a';
    save();
    render();
  }, [nycklar, extra]);
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

const lage = (page, aktiv, namnSel) => page.evaluate(([aktiv, namnSel]) => Object.fromEntries(['lv-a', 'lv-b', 'lv-c'].map(id => {
  const el = document.querySelector(`.canvas [data-id="${id}"]:not([data-testspel-klon])`);
  return [id, { aktiv: !!el && el.classList.contains(aktiv), namn: el ? ((el.querySelector(namnSel) || {}).textContent || '').trim() : null }];
})), [aktiv, namnSel]);
const raknare = page => page.evaluate(() => ({ ko: window.__ko, sparat: window.__sparat }));
const widgetar = page => page.evaluate(() => JSON.stringify(state.widgets));

// Ett ▶/■ i panelen först, så att provet också visar att testet inte lämnar något efter sig.
async function testaForst(page) {
  await page.click('#pr-testspel');
  await page.waitForTimeout(900);
  await page.click('#pr-testspel');
  await page.waitForTimeout(200);
  assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'klonen är borta efter ■');
}

for (const forst of [false, true]) {
  const efter = forst ? ' — efter ett ▶/■' : '';

  test(`Fan Level Up: livetriggern går via kön och tänder varje widget som släpps igenom${efter}`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    // a: visningstid 2 s. b: automatiken av. c: minsta nivå 30.
    const page = await oppna(fel, ['catalog:fanlevel:layout:hero', 'catalog:fanlevel:layout:stack', 'catalog:fanlevel:layout:duo'],
      [{ fanDuration: 2 }, { autoTrigger: false }, { minLevel: 30 }]);
    try {
      if (forst) await testaForst(page);
      const fore = await widgetar(page);
      // Inte teammedlem: Endast teammedlemmar är på som standard, så ingenting tänds — men kön får posten.
      await page.evaluate(() => window.triggerFanLevelUp({ name: 'Utanför', level: 20, isTeamMember: false }));
      await page.waitForTimeout(150);
      let l = await lage(page, 'fan-active', 'h3');
      assert.deepEqual([l['lv-a'].aktiv, l['lv-b'].aktiv, l['lv-c'].aktiv], [false, false, false], 'en icke-medlem tänder ingenting');
      // Kön håller platsen i den första Fan-widgetens visningstid (a: 2 s, runtime-controls.js).
      await page.waitForTimeout(2300);
      await page.evaluate(() => window.triggerFanLevelUp({ name: 'Kim', level: 20, fromLevel: 19, isTeamMember: true }));
      await page.waitForTimeout(150);
      l = await lage(page, 'fan-active', 'h3');
      assert.equal(l['lv-a'].aktiv, true, 'a tändes');
      assert.equal(l['lv-a'].namn, 'Kim', 'händelsens namn');
      assert.equal(l['lv-b'].aktiv, false, 'b har Automatisk trigger av');
      assert.equal(l['lv-c'].aktiv, false, 'c har minsta nivå 30');
      assert.deepEqual(await raknare(page), { ko: 2, sparat: 0 }, 'en köpost per händelse och ingen sparning');
      // Visningstiden: a (2 s) är på väg ut eller släckt efter ~2,7 s.
      await page.waitForTimeout(2600);
      const ute = await page.evaluate(() => { const el = document.querySelector('.canvas [data-id="lv-a"]'); return !el.classList.contains('fan-active') || el.classList.contains('fan-exit'); });
      assert.equal(ute, true, 'a:s visningstid på 2 s är slut');
      assert.equal(await widgetar(page), fore, 'ingenting skrevs till widgetarna');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });

  test(`Gifter Level Up: livetriggern går via kön och tänder varje widget som släpps igenom${efter}`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppna(fel, ['catalog:gifterlevel:profile', 'catalog:gifterlevel:number', 'catalog:gifterlevel:duo'],
      [{ gifterDuration: 2 }, {}, { minLevel: 30 }]);
    try {
      if (forst) await testaForst(page);
      const fore = await widgetar(page);
      await page.evaluate(() => window.triggerGifterLevelUp({ name: 'Kim', level: 20, fromLevel: 19 }));
      await page.waitForTimeout(150);
      const l = await lage(page, 'gifter-active', 'h3');
      assert.equal(l['lv-a'].aktiv, true, 'a tändes');
      assert.equal(l['lv-b'].aktiv, true, 'b av samma typ tändes också');
      assert.equal(l['lv-a'].namn, 'Kim');
      assert.equal(l['lv-b'].namn, 'Kim');
      assert.equal(l['lv-c'].aktiv, false, 'c har minsta nivå 30');
      // Nivåbytet: 19 → 20 på den stora siffran när transformationen gått klart.
      await page.waitForTimeout(1300);
      assert.equal(await page.evaluate(() => document.querySelector('.canvas [data-id="lv-b"] .gifter-big-level').textContent), '20');
      assert.deepEqual(await raknare(page), { ko: 1, sparat: 0 }, 'en köpost och ingen sparning');
      await page.waitForTimeout(1400);
      const st = await page.evaluate(() => ['lv-a', 'lv-b'].map(id => { const el = document.querySelector(`.canvas [data-id="${id}"]`); return el.classList.contains('gifter-active') && !el.classList.contains('gifter-exit'); }));
      assert.deepEqual(st, [false, true], 'a (2 s) är på väg ut, b (6 s) visas fortfarande');
      assert.equal(await widgetar(page), fore, 'ingenting skrevs till widgetarna');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });

  test(`Follower Spotlight: livetriggern går via kön och tänder varje widget${efter}`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppna(fel, ['catalog:followeralert:gold', 'catalog:followeralert:ocean', 'catalog:followeralert:blush'],
      [{ followDuration: 2 }, {}, {}]);
    try {
      if (forst) await testaForst(page);
      const fore = await widgetar(page);
      await page.evaluate(() => window.triggerNewFollower({ name: 'Kim' }));
      await page.waitForTimeout(150);
      const l = await lage(page, 'follow-active', 'h2');
      assert.deepEqual(Object.values(l).map(x => [x.aktiv, x.namn]), [[true, 'Kim'], [true, 'Kim'], [true, 'Kim']], 'alla tre tändes med följarens namn');
      assert.deepEqual(await raknare(page), { ko: 1, sparat: 0 }, 'en köpost och ingen sparning');
      await page.waitForTimeout(2300);
      const st = await page.evaluate(() => ['lv-a', 'lv-b'].map(id => document.querySelector(`.canvas [data-id="${id}"]`).classList.contains('follow-active')));
      assert.deepEqual(st, [false, true], 'a:s visningstid (2 s) är slut, b:s (6 s) inte');
      assert.equal(await widgetar(page), fore, 'ingenting skrevs till widgetarna');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });

  test(`Guardian Emblem: livetriggern går via kön och tänder varje synligt emblem${efter}`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppna(fel, ['catalog:guardianemblem:3', 'catalog:guardianemblem:model:sapphire', 'catalog:guardianemblem:1'],
      [{}, {}, { hidden: true }]);
    try {
      if (forst) await testaForst(page);
      const fore = await widgetar(page);
      await page.evaluate(() => window.triggerGuardianEmblem({ username: '@Kim' }));
      await page.waitForTimeout(150);
      const l = await lage(page, 'ge-active', '.ge-namn');
      assert.equal(l['lv-a'].aktiv, true, 'a tändes');
      assert.equal(l['lv-b'].aktiv, true, 'b tändes');
      assert.equal(l['lv-a'].namn, '@Kim');
      assert.equal(l['lv-c'].aktiv, false, 'ett dolt emblem tänds aldrig');
      const fas = await page.evaluate(() => ['lv-a', 'lv-b'].map(id => /\bge-fas-ljus\b/.test(document.querySelector(`.canvas [data-id="${id}"]`).className)));
      assert.deepEqual(fas, [true, true], 'koreografin startade på båda');
      assert.deepEqual(await raknare(page), { ko: 1, sparat: 0 }, 'en köpost och ingen sparning');
      assert.equal(await widgetar(page), fore, 'ingenting skrevs till widgetarna');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}
