'use strict';
// LIVEVÄGEN ÄR OFÖRÄNDRAD FÖR TOP STREAK (PR 10 i panelspecifikationen).
//
// Top Streak · Clean Flip och Design 1–3 har sedan PR 10 panelramens panel och ▶ Testa widget, som räknar
// en combo på en klon med streakSpelaPa (approved-rankings.js). Provet kräver att de riktiga widgetarna
// beter sig som förut:
//   * en riktig combo (vyra-live-event, samma händelse gift-event-images.js lyssnar på) skriver givaren,
//     combons längd, gåvan och profilbilden på ALLA Top Streak i state och i deras noder, markerar noden
//     med rekordpulsen och höjer sändningens rekord — och en enstaka gåva eller en combo under rekordet
//     gör ingenting (rekordregeln i gift-event-images.js),
//   * allt det gäller också efter ett ▶/■ i panelen, och ▶/■ självt ändrar varken state, rekordet eller
//     något sparat,
//   * en riktig combo MITT I ett test når den riktiga widgeten men inte klonen, som står kvar på testets
//     givare,
//   * Flippar var styr widgetens flippvarv, Ärv färgschema når den riktiga widgeten, och Återställ utseende
//     ger katalogkortets Clean Flip tillbaka kortets utseende (guldaccent, inte fabrikens cyan).
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

// a: Clean Flip (vald), b: Design 2. Två Top Streak i samma layout — livevägen skriver på båda.
const NYCKLAR = { 'lv-a': 'catalog:topstreak', 'lv-b': 'catalog:topstreak:design:2' };

async function oppna(fel) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fel.push(String(e && e.message || e)));
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraTestspel && !!window.VyraGiftRecords,
    null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2800);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(nycklar => {
    state.widgets.length = 0;
    Object.entries(nycklar).forEach(([id, n], i) => {
      const w = window.VyraWidgets.create(n);
      w.id = id; w.x = 40 + i * 420; w.y = 120;
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

// Varje riktig Top Streak (klonen undantagen): namn, tal, bilder och klasser, och samma fält i state.
const lage = page => page.evaluate(ids => Object.fromEntries(ids.map(id => {
  const el = document.querySelector(`.canvas [data-id="${id}"]:not([data-testspel-klon])`);
  const w = liveWidget(id);
  return [id, {
    namn: el && (el.querySelector('.approved-streak-copy strong') || {}).textContent,
    tal: el && (el.querySelector('.approved-streak-copy em b') || {}).textContent,
    profil: el && (el.querySelector('.streak-profile-face img') || {}).getAttribute?.('src'),
    gava: el && (el.querySelector('.streak-gift-face img') || {}).getAttribute?.('src'),
    record: !!(el && el.classList.contains('record')),
    state: [w.dataName, w.dataValue],
  }];
})), Object.keys(NYCKLAR));

// En riktig combo: 30 rosor från Ola (combons värde 30 coins, gift-event-images.js records.bedom).
const combo = (page, d) => page.evaluate(d => window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: d })),
  Object.assign({ type: 'gift', username: 'ola', name: 'Ola', giftName: 'Rose', diamonds: 30, count: 30, profileImage: 'assets/gifts/events/7460_Cap.png' }, d || {}));

for (const forst of [false, true]) {
  const efter = forst ? ' — efter ett ▶/■' : '';

  test(`Top Streak: en riktig combo skriver på alla Top Streak som förut${efter}`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppna(fel);
    try {
      const rekord0 = await page.evaluate(() => JSON.stringify(window.VyraGiftRecords));
      if (forst) {
        const stateFore = await page.evaluate(() => JSON.stringify(state));
        await page.click('#pr-testspel');
        await page.waitForTimeout(2500);
        await page.click('#pr-testspel');
        await page.waitForTimeout(200);
        assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'klonen är borta efter ■');
        assert.equal(await page.evaluate(() => JSON.stringify(state)), stateFore, '▶/■ ändrade inte state');
        assert.equal(await page.evaluate(() => JSON.stringify(window.VyraGiftRecords)), rekord0, '▶/■ ändrade inte sändningens rekord');
        assert.equal(await page.evaluate(() => window.__sparat), 0, '▶/■ sparade ingenting');
      }
      const fore = await lage(page);
      for (const id of Object.keys(NYCKLAR)) assert.notEqual(fore[id].namn, 'ola', `kontrollmätning: ${id} har ingen livedata före combon`);

      // En enstaka gåva är ingen combo och tar aldrig streaken.
      await combo(page, { count: 1, diamonds: 500, username: 'ensam' });
      await page.waitForTimeout(300);
      assert.deepEqual((await lage(page))['lv-a'].state, fore['lv-a'].state, 'en enstaka gåva ändrar inte Top Streak');

      await combo(page);
      await page.waitForTimeout(400);
      const l = await lage(page);
      for (const id of Object.keys(NYCKLAR)) {
        assert.deepEqual(l[id].state, ['ola', 30], `${id}: givaren och combons längd i state`);
        assert.equal(l[id].namn, 'ola', `${id}: givaren i noden`);
        assert.equal(l[id].tal, '30', `${id}: combons längd i noden`);
        assert.match(l[id].profil || '', /7460_Cap\.png$/, `${id}: givarens profilbild`);
        assert.match(l[id].gava || '', /Rose/, `${id}: gåvan`);
        assert.equal(l[id].record, true, `${id}: rekordpulsen`);
      }
      assert.equal(await page.evaluate(() => window.VyraGiftRecords.streakCoins), 30, 'sändningens rekord är combons värde');

      // En kortare combo under rekordet ändrar ingenting.
      await combo(page, { username: 'kim', name: 'Kim', diamonds: 10, count: 10 });
      await page.waitForTimeout(300);
      assert.deepEqual((await lage(page))['lv-b'].state, ['ola', 30], 'en combo under rekordet tar inte streaken');

      // render() ritar livevärdet (det står i state).
      await page.evaluate(() => render());
      await page.waitForTimeout(600);
      const r = await lage(page);
      assert.equal(r['lv-a'].namn, 'ola', 'en omritning visar livevärdet');
      assert.equal(r['lv-a'].tal, '30');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

test('Top Streak: en riktig combo mitt i ett test når den riktiga widgeten men inte klonen', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel);
  try {
    await page.click('#pr-testspel');
    await page.waitForTimeout(1200);
    await combo(page);
    await page.waitForTimeout(400);
    const klon = await page.evaluate(() => (document.querySelector('.canvas [data-testspel-klon] .approved-streak-copy strong') || {}).textContent);
    assert.equal(klon, 'Alex', 'klonen står kvar på testets givare');
    const l = await lage(page);
    assert.equal(l['lv-a'].namn, 'ola', 'den riktiga (dolda) widgeten fick combon');
    assert.deepEqual(l['lv-a'].state, ['ola', 30]);
    await page.click('#pr-testspel');
    await page.waitForTimeout(300);
    assert.equal((await lage(page))['lv-a'].namn, 'ola', 'efter ■ visar widgeten den riktiga givaren');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

test('Top Streak: Flippar var, Ärv färgschema och Återställ utseende verkar på den riktiga widgeten', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel);
  try {
    const flipp = id => page.evaluate(id => {
      const el = document.querySelector(`.canvas [data-id="${id}"]:not([data-testspel-klon]) .streak-flip`);
      return el ? getComputedStyle(el).animationDuration : null;
    }, id);
    assert.equal(await flipp('lv-a'), '8s', 'Clean Flip vänder var 8:e sekund från början');
    await page.evaluate(() => document.querySelector('[data-panelram-sektion="6"]')?.classList.add('open'));
    await page.evaluate(() => {
      const el = document.querySelector('.properties #approvedStreakSeconds');
      el.value = '12';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => liveWidget('lv-a').streakFlipSeconds), 12, 'Flippar var sparar streakFlipSeconds');
    assert.equal(await flipp('lv-a'), '12s', 'och widgeten vänder i den takten');
    assert.match(await page.textContent('.properties [data-pr-kontroll="falt:streakFlipSeconds"] b'), /^12 s$/, 'etiketten visar sekunder');

    // Ärv färgschema: accentfärgen kommer från färgschemat (ringen runt cirkeln).
    await page.evaluate(() => { state.brandKit = Object.assign({}, state.brandKit, { highlight: '#12ab34' }); liveWidget('lv-a').inheritBrandKit = true; render(); });
    await page.waitForTimeout(500);
    const ring = () => page.evaluate(() => getComputedStyle(document.querySelector('.canvas [data-id="lv-a"] .streak-flip')).borderTopColor);
    assert.equal(await ring(), 'rgb(18, 171, 52)', 'ringen har färgschemats accent');
    await page.evaluate(() => { liveWidget('lv-a').inheritBrandKit = false; render(); });
    await page.waitForTimeout(500);
    assert.notEqual(await ring(), 'rgb(18, 171, 52)', 'utan arv är det widgetens egen accent');

    // Katalogkortets Clean Flip: Återställ utseende ger kortets guldaccent och flippvarv tillbaka.
    await page.evaluate(() => {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:topstreak');
      Object.assign(w, window.VyraApprovedRankings.cleanGrund, { id: 'kort', x: 60, y: 120 });
      w.accent = '#ff00ff'; w.streakFlipSeconds = 15; w.dataName = 'Kvar';
      state.widgets.push(w); selected = 'kort'; render();
    });
    await page.waitForTimeout(900);
    await page.evaluate(() => document.querySelector('[data-panelram-sektion="7"]')?.classList.add('open'));
    await page.click('#pr-aterstall-utseende');
    await page.waitForTimeout(600);
    const w = await page.evaluate(() => { const w = liveWidget('kort'); return [w.accent, w.streakFlipSeconds, w.dataName, w.x]; });
    assert.deepEqual(w, ['#ffc94d', 8, 'Kvar', 60], 'kortets accent och flippvarv tillbaka, innehåll och placering kvar');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});
