'use strict';
// LAGER 4 — Electron. Det har lagret finns for att desktop-buggarna INTE syns nagon annanstans:
// 405 pa inloggning, CORS mot 127.0.0.1, en tyst pollningsslinga som aldrig slapper in nagon.
// Alla tre levde i produktion medan bade enhetstester och webblasartester var grona.
//
// Kraver: npm i -D @playwright/test  (Electron-stodet foljer med)
const { test, expect, _electron } = require('@playwright/test');
const path = require('path');

const APP = path.join(__dirname, '..', '..', 'electron-app');

// Appen laddar vyralive.app i skarpt lage. I CI finns inget konto och ingen molnsession, sa den
// pekas om till den lokala statiska servern. Det gor att inloggningsflodet inte kan testas har —
// se "Vad som inte kan automatiseras" i docs/pre-merge-checklist.md.
const ENV = { ...process.env, VYRA_CLOUD_ORIGIN: 'http://127.0.0.1:4321', VYRA_E2E: '1' };

let app, page, consoleErrors, badResponses;

test.beforeAll(async () => {
  app = await _electron.launch({ args: [APP], env: ENV });
  page = await app.firstWindow();
  consoleErrors = [];
  badResponses = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  page.on('response', r => {
    if (r.status() === 405) badResponses.push(`405 ${r.request().method()} ${r.url()}`);
  });
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => { if (app) await app.close() });

test('appen startar och oppnar ett fonster', async () => {
  expect(await app.windows()).not.toHaveLength(0);
  expect(await page.title()).toBeTruthy();
});

test('ingen 405 nagonstans i appen', async () => {
  await page.waitForTimeout(4000);
  expect(badResponses, badResponses.join('\n')).toEqual([]);
});

test('inga CORS-fel i konsolen', async () => {
  const cors = consoleErrors.filter(t => /CORS|Cross-Origin|Access-Control/i.test(t));
  expect(cors, cors.join('\n')).toEqual([]);
});

test('inga oväntade console.error', async () => {
  // Kanda och ofarliga meddelanden filtreras med namn, inte med ett brett monster — annars doljer
  // filtret nasta riktiga fel.
  const KNOWN = [/Autofill\.enable/i, /Request Autofill/i, /devtools/i];
  const unexpected = consoleErrors.filter(t => !KNOWN.some(re => re.test(t)));
  expect(unexpected, unexpected.join('\n')).toEqual([]);
});

test('appen tar emot ett live-event och uppdaterar DOM', async () => {
  const got = await page.evaluate(async () => {
    if (typeof window.VyraWidgets !== 'object' || typeof window.render !== 'function') return null;
    const w = window.VyraWidgets.create('catalog:giftcampaign:neon:landscape');
    w.id = 'desk-1'; w.x = 20; w.y = 40;
    window.state.widgets.push(w); window.render();
    const read = () => document.querySelector('[data-id="desk-1"] .campaign-gifts article span b')?.textContent;
    const before = read();
    window.dispatchEvent(new CustomEvent('vyra-live-event', {
      detail: { id: 'd1', type: 'gift', giftName: 'Rose', username: 'u', coins: 1, count: 5 } }));
    return { before, after: read() };
  });
  expect(got, 'Studio laddades aldrig i appfonstret').not.toBeNull();
  expect(got.after).not.toBe(got.before);
});
