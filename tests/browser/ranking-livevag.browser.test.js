'use strict';
// LIVEVÄGEN ÄR OFÖRÄNDRAD FÖR TOP LIKE, TOP COINS OCH TOP POINTS (PR 8 i panelspecifikationen).
//
// Rankingfamiljerna har sedan PR 8 panelramens panel och ▶ Testa widget, som spelar en klon med en
// egen lista (k.__provlista). Provet kräver att de riktiga listorna beter sig som förut:
//   * riktiga likes och gåvor (vyra-live-event, samma händelse live-leaderboard.js lyssnar på) och
//     riktiga poäng (VyraPoints, Actions & Events) fyller topplistorna — Top Like med likes, Top Coins
//     med coins, Top Points med poäng,
//   * Rangordna efter byter vilken lista en widget visar,
//   * allt det gäller också efter ett ▶/■ i panelen, och ▶/■ självt ändrar varken topplistornas
//     totaler, poängen eller state, och sparar ingenting,
//   * en riktig händelse MITT I ett test når den riktiga widgeten men inte klonen, som står kvar på
//     testets lista.
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

// a: Top Like (likes), b: Top Coins (coins), c: Top Points (poäng, som createTopPoints sätter). a vald.
const NYCKLAR = { 'lv-a': 'catalog:toplike:voltage', 'lv-b': 'catalog:ranking:templateTopCoins:prism-horizontal',
  'lv-c': 'catalog:ranking:templateTopPoints:celestial' };

async function oppna(fel) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fel.push(String(e && e.message || e)));
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraTestspel && !!window.VyraLeaderboard,
    null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2800);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(nycklar => {
    state.widgets.length = 0;
    Object.entries(nycklar).forEach(([id, n], i) => {
      const w = window.VyraWidgets.create(n);
      w.id = id; w.x = 20 + (i % 2) * 420; w.y = 40 + Math.floor(i / 2) * 420;
      if (id === 'lv-c') w.liveMetric = 'points';
      state.widgets.push(w);
    });
    selected = 'lv-a';
    save();
    render();
  }, NYCKLAR);
  await page.waitForTimeout(1500);
  // Räknare: sparningar (studio.js save(): VyraSessionState.writeActive('vyra-state')).
  await page.evaluate(() => {
    window.__sparat = 0;
    const S = window.VyraSessionState, orig = S.writeActive;
    S.writeActive = function () { if (String(arguments[0]).startsWith('vyra-state')) window.__sparat++; return orig.apply(this, arguments); };
  });
  return page;
}

// Första raden i varje riktig widget (klonen undantagen): namn och värde.
const ettor = page => page.evaluate(ids => Object.fromEntries(ids.map(id => {
  const el = document.querySelector(`.canvas [data-id="${id}"]:not([data-testspel-klon])`);
  const rad = el && el.querySelector('.toplike-row');
  return [id, rad ? [(rad.querySelector('strong') || {}).textContent || '', ((rad.querySelector('em') || {}).textContent || '').trim()] : null];
})), Object.keys(NYCKLAR));

const livedata = page => page.evaluate(() => {
  const ev = d => window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: d }));
  ev({ type: 'like', username: 'kim', name: 'Kim', count: 300 });
  ev({ type: 'gift', username: 'ola', name: 'Ola', diamonds: 500, giftName: 'Rose' });
  window.VyraPoints.add('Pia', 900);
  window.dispatchEvent(new Event('vyra-live-repaint'));
});

const totaler = page => page.evaluate(() => JSON.stringify([window.VyraLeaderboard.getTop('likes', 10), window.VyraLeaderboard.getTop('coins', 10), window.VyraPoints.getTop(10)]));

for (const forst of [false, true]) {
  const efter = forst ? ' — efter ett ▶/■' : '';

  test(`Ranking: riktiga likes, gåvor och poäng fyller topplistorna som förut${efter}`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppna(fel);
    try {
      if (forst) {
        const stateFore = await page.evaluate(() => JSON.stringify(state));
        const toppFore = await totaler(page);
        await page.click('#pr-testspel');
        await page.waitForTimeout(3200);
        await page.click('#pr-testspel');
        await page.waitForTimeout(200);
        assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'klonen är borta efter ■');
        assert.equal(await page.evaluate(() => JSON.stringify(state)), stateFore, '▶/■ ändrade inte state');
        assert.equal(await totaler(page), toppFore, '▶/■ ändrade inte topplistornas totaler eller poängen');
        assert.equal(await page.evaluate(() => window.__sparat), 0, '▶/■ sparade ingenting');
      }
      const fore = await ettor(page);
      for (const id of Object.keys(NYCKLAR)) assert.ok(fore[id], `${id} har rader`);
      assert.ok(!['Kim', 'Ola', 'Pia'].includes(fore['lv-a'][0]), 'kontrollmätning: ingen livedata före händelserna');

      await livedata(page);
      await page.waitForTimeout(300);
      const l = await ettor(page);
      assert.equal(l['lv-a'][0], 'Kim', 'Top Like visar den som gett flest likes');
      assert.match(l['lv-a'][1], /\b300$/, 'med antalet likes');
      assert.equal(l['lv-b'][0], 'Ola', 'Top Coins visar den som gett flest coins');
      assert.match(l['lv-b'][1], /\b500$/, 'med antalet coins');
      assert.equal(l['lv-c'][0], 'Pia', 'Top Points visar den som har flest poäng');
      assert.match(l['lv-c'][1], /\b900$/, 'med poängen');

      // Rangordna efter: Top Like efter coins visar gåvan i stället.
      await page.evaluate(() => { liveWidget('lv-a').liveMetric = 'coins'; save(); render(); });
      await page.waitForTimeout(1300);
      const m = await ettor(page);
      assert.equal(m['lv-a'][0], 'Ola', 'Rangordna efter coins byter listan i Top Like');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

test('Ranking: en riktig händelse mitt i ett test når den riktiga widgeten men inte klonen', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel);
  try {
    await page.click('#pr-testspel');
    await page.waitForTimeout(300);
    await livedata(page);
    await page.waitForTimeout(1300);
    const klon = await page.evaluate(() => [...document.querySelectorAll('.canvas [data-testspel-klon] .toplike-row strong')].map(n => n.textContent));
    // Testets lista har hunnit sortera om en gång (1,2 s); den består fortfarande av exempelpersonerna.
    assert.deepEqual([...klon].sort(), ['Alex', 'Leo', 'Mia', 'Sara', 'Zoe'], 'klonen står kvar på testets lista');
    assert.equal((await ettor(page))['lv-a'][0], 'Kim', 'den riktiga (dolda) widgeten fick den riktiga listan');
    await page.click('#pr-testspel');
    await page.waitForTimeout(300);
    assert.equal((await ettor(page))['lv-a'][0], 'Kim', 'efter ■ visar widgeten den riktiga listan');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});
