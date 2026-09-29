'use strict';
// /api/gifts — rummets gåvokatalog ur en redan öppen TikTok-anslutning.
//
// VARFÖR RUTTEN FINNS: `assets/gifts/gifts-manifest.js` bär ENGELSKA namn och inget coin-värde
// alls, medan TikTok levererar katalogen på streamerns eget språk med värdet. En svensk streamer
// söker efter "Morgonblommor" och hittar "Morning Bloom" — om hen ens vet att den heter så.
// `fetchAvailableGifts()` är ett rumsanrop och kräver ingen inloggning, men det kräver en öppen
// anslutning — därför finns det bara i desktopappen, och webbläget lär sig katalogen en gåva i
// taget i stället (live-client.js recordSeenGift).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { startLocalServer } = require('../local-server');
const { normaliseraGavor, createTikTokService } = require('../tiktok-service');

const ROOT = path.resolve(__dirname, '../..');

// Formen `fetchAvailableGifts()` svarar med varierar mellan biblioteksversioner: ibland en naken
// array, ibland `{ gifts: [...] }`, och bildfältet heter `url_list` i den ena och `urlList` i den
// andra. Normaliseringen bor i tiktok-service.js så klienten slipper känna till alla varianterna;
// stubben nedan matar därför in den RÅA formen, inte den färdiga.
async function medServer(options, fn) {
  const server = await startLocalServer(ROOT, 0, options);
  const port = server.address().port;
  try { await fn(`http://127.0.0.1:${port}`) }
  finally { await new Promise(r => server.close(r)) }
}

test('utan TikTok-del svarar rutten 503 och inte 404', async () => {
  // 503 säger "funktionen finns men inte här"; 404 hade sagt "adressen finns inte", och då hade
  // webbläget sett ut att sakna en rutt som aldrig var tänkt för det.
  await medServer({}, async origin => {
    const res = await fetch(origin + '/api/gifts');
    assert.equal(res.status, 503);
    const kropp = await res.json();
    assert.equal(kropp.ok, false);
    assert.match(kropp.error, /Desktop/);
  });
});

test('med en ansluten tjänst returneras normaliserade gåvor', async () => {
  const raa = {
    gifts: [
      { id: 5655, name: 'Rose', diamond_count: 1, image: { url_list: ['https://cdn/rose.png'] } },
      { id: 7934, name: 'Morgonblommor', diamondCount: 1, image: { urlList: ['https://cdn/bloom.png'] } },
      { id: 8912, name: 'Universum', coins: 34999, icon: { url_list: ['https://cdn/uni.png'] } },
      { id: 9, name: '', diamond_count: 5 }        // namnlös: ska falla bort, den går inte att välja
    ]
  };
  await medServer({
    createLiveConnector: () => ({ hamtaGavor: async () => ({ ok: true, gavor: normaliseraGavor(raa) }) })
  }, async origin => {
    const kropp = await (await fetch(origin + '/api/gifts')).json();
    assert.equal(kropp.ok, true);
    assert.equal(kropp.gavor.length, 3, 'den namnlösa gåvan följde med');
    assert.deepEqual(kropp.gavor[0], { giftId: '5655', name: 'Rose', coins: 1, image: 'https://cdn/rose.png' });
    assert.equal(kropp.gavor[1].image, 'https://cdn/bloom.png', 'urlList-varianten lästes inte');
    assert.equal(kropp.gavor[2].coins, 34999, 'coins-varianten lästes inte');
  });
});

test('ett fel från TikTok blir ett svar, inte en krasch', async () => {
  await medServer({
    createLiveConnector: () => ({ hamtaGavor: async () => ({ ok: false, error: 'Ingen aktiv TikTok-anslutning' }) })
  }, async origin => {
    const res = await fetch(origin + '/api/gifts');
    assert.equal(res.status, 200, 'ett väntat nej är inte ett serverfel');
    const kropp = await res.json();
    assert.equal(kropp.ok, false);
    assert.match(kropp.error, /anslutning/);
  });
});

test('tiktok-service normaliserar utan anslutning till ett nej', async () => {
  // Kontrollen: utan den kunde hamtaGavor() kasta i stället för att svara, och rutten hade gett 500.
  const tjanst = createTikTokService({ onStatus() {}, onEvent() {} });
  const svar = await tjanst.hamtaGavor();
  assert.equal(svar.ok, false);
  assert.match(svar.error, /anslutning/i);
});
