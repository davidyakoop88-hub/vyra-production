'use strict';
// LAGER 3 — E2E i riktig webblasare. Det har lagret finns for det jsdom INTE kan se:
// bildrutor, kaskad, layout, och nätverkstrafiken sidan faktiskt gor.
const { test, expect } = require('@playwright/test');
const mock = require('./mock-live');

// Varje test borjar med en ren layout och lagger till widgets via fabriken — samma vag som
// katalogknapparna. Handknackade widgetobjekt doljer fabrikens defaults, och det ar i defaultsen
// kampanjbuggen bor.
async function layout(page, catalogKeys) {
  await page.goto('/layout.html');
  await page.waitForFunction(() => typeof window.VyraWidgets === 'object' && typeof window.render === 'function');
  return page.evaluate(keys => {
    keys.forEach((key, i) => {
      const w = window.VyraWidgets.create(key);
      w.id = 'e2e-' + i; w.x = 20 + i * 320; w.y = 40;
      window.state.widgets.push(w);
    });
    window.render();
    return window.state.widgets.map(w => ({ id: w.id, type: w.type }));
  }, catalogKeys);
}

const fire = (page, events) => page.evaluate(list => {
  for (const detail of list) window.dispatchEvent(new CustomEvent('vyra-live-event', { detail }));
}, events);

// ---- 100 gavor -> ratt antal i DOM -----------------------------------------------------------------
test('100 gavor rakans korrekt i Gift Campaign', async ({ page }) => {
  await layout(page, ['catalog:giftcampaign:neon:landscape']);
  // Alla gavor pa forsta platsen, sa summan ar exakt forutsagbar.
  const events = Array.from({ length: 100 }, (_, i) => ({
    id: 'g' + i, type: 'gift', giftName: 'Rose', username: 'wpwer17', coins: 1, count: 1
  }));
  const before = await page.locator('[data-id="e2e-0"] .campaign-gifts article span b').first().textContent();
  await fire(page, events);
  const after = await page.locator('[data-id="e2e-0"] .campaign-gifts article span b').first().textContent();
  expect(Number(after) - Number(before)).toBe(100);
});

// ---- streak raknas som combolangd, inte coins -------------------------------------------------------
test('Top Streak visar combolangd och Top Gift visar coins', async ({ page }) => {
  await layout(page, ['catalog:battlemvp:inferno']); // platshallare sa layouten inte ar tom
  await page.evaluate(() => {
    window.state.widgets.push(
      { id: 'tg', type: 'templateTopGift', x: 20, y: 400, width: 320, dataValue: 0 },
      { id: 'ts', type: 'templateTopStreak', x: 360, y: 400, width: 320, dataValue: 0 });
    window.render();
  });
  // En dyr engangsgava, sedan en billig lang combo. De ska hamna i olika widgets.
  await fire(page, [{ id: 'a', type: 'gift', giftName: 'Lion', username: 'rik', coins: 30000, count: 1 }]);
  await fire(page, [{ id: 'b', type: 'gift', giftName: 'Rose', username: 'spam', coins: 50, count: 99 }]);

  await expect(page.locator('[data-id="tg"] .topgift-copy em')).toContainText('30000');
  await expect(page.locator('[data-id="tg"] .topgift-copy strong')).toContainText('rik');
  await expect(page.locator('[data-id="ts"] .streak-score b')).toContainText('99');
  await expect(page.locator('[data-id="ts"] .streak-copy strong')).toContainText('spam');
});

// ---- kampanjsiffran far aldrig sjunka ----------------------------------------------------------------
test('kampanjsiffran gar aldrig fran hogre till lagre', async ({ page }) => {
  await layout(page, ['catalog:giftcampaign:neon:landscape']);
  const slot = page.locator('[data-id="e2e-0"] .campaign-gifts article span b').first();
  const seen = [Number(await slot.textContent())];
  for (const event of mock.stream(200, 42)) {
    await fire(page, [event]);
    seen.push(Number(await slot.textContent()));
  }
  const drops = seen.map((v, i) => ({ i, v, prev: seen[i - 1] })).filter(x => x.i > 0 && x.v < x.prev);
  expect(drops, `siffran sjonk vid ${JSON.stringify(drops.slice(0, 3))}`).toEqual([]);
});

// ---- localStorage speglar staten efter varje event ---------------------------------------------------
test('localStorage innehaller ratt state efter events', async ({ page }) => {
  await layout(page, ['catalog:giftcampaign:neon:landscape']);
  await page.evaluate(() => window.save && window.save());
  await fire(page, mock.stream(50, 7));
  const state = await page.evaluate(() => {
    window.save && window.save();
    return JSON.parse(localStorage.getItem('vyra-state') || '{}');
  });
  expect(Array.isArray(state.widgets)).toBe(true);
  expect(state.widgets.some(w => w.id === 'e2e-0')).toBe(true);
});

// ---- ingen endpoint svarar 405 ------------------------------------------------------------------------
test('ingen 405 fran nagon endpoint under en hel session', async ({ page }) => {
  const bad = [];
  page.on('response', r => { if (r.status() === 405) bad.push(`${r.request().method()} ${r.url()}`) });
  await layout(page, ['catalog:giftcampaign:neon:landscape', 'catalog:battlemvp:royal:0']);
  await fire(page, mock.stream(100, 3));
  await page.waitForTimeout(1500);   // fangar fordrojda POST:ar, t.ex. state-backup:s 3-sekunderstimer
  expect(bad, `405 fran: ${bad.join(', ')}`).toEqual([]);
});

// ---- dubbletter skapar inte dubbla noder --------------------------------------------------------------
test('300 identiska events skapar inga extra DOM-noder', async ({ page }) => {
  await layout(page, ['catalog:giftcampaign:neon:landscape']);
  const articles = page.locator('[data-id="e2e-0"] .campaign-gifts article');
  const before = await articles.count();
  await fire(page, mock.duplicates(300));
  expect(await articles.count()).toBe(before);
  expect(await page.locator('[data-id="e2e-0"]').count()).toBe(1);
});
