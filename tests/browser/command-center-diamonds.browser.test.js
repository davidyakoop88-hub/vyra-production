'use strict';
// Command Center: DIAMANTER — fjarde och sista kortet.
//
// Kortet hette INTAKT, och det var fel pa tva satt.
//
// 1. INGEN AV KONKURRENTERNA rakar om till pengar. TikFinitys malmatt heter "Coins Earned",
//    TikControls dashboard visar "Total Diamonds". Bada stannar i TikToks egen enhet, eftersom
//    kursen varierar med region och avtal — en app som visar fel belopp i kronor skapar ett
//    fortroendeproblem som inte gar att laga i efterhand.
//
// 2. VART EGET FALT HETER FEL. Faltet gift.coins fylls fran diamondCount i bada bryggorna
//    (tiktok-bridge/normalizer.js:67, electron-app/tiktok-service.js:104). Coins ar vad TITTAREN
//    kopar for; diamanter ar vad KREATOREN far — grovt haften. Det ar diamanter TikToks
//    utbetalning bygger pa. Kortet visar alltsa diamanter och heter darfor DIAMANTER.
//
// GAVOR och DIAMANTER kommer fran SAMMA event men ar olika tal: antal (count) mot varde (coins).
// Ett eget prov vaktar att de inte blandas ihop.
//
// ROTT NU: alla atta.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');

let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

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

async function startaWebblasare() {
  for (const channel of ['chrome', 'msedge', 'chromium']) {
    try { return await chromium.launch({ channel }) } catch (_) {}
  }
  try { return await chromium.launch() } catch (_) {}
  return null;
}

let server, browser, bas;
let skip = chromium ? false : 'playwright-core saknas — kor `npm i` (hoppar, faller inte)';

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) { skip = 'ingen Chrome/Edge/Chromium hittades pa maskinen (hoppar, faller inte)'; return }
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

async function framsidan() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => typeof home === 'function' && home.toString().includes('COMMAND CENTER'),
    null, { timeout: 20000 });
  await page.evaluate(() => { view = 'home'; render() });
  await page.waitForSelector('.home-welcome', { timeout: 10000 });
  return page;
}

const SKICKA = () => ([t, e]) => {
  window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: Object.assign({ type: t }, e) }));
  return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
};

const siffror = txt => String(txt || '').replace(/\D/g, '');
const varde = () => document.querySelector('[data-stat="diamonds"] strong')?.textContent ?? '(kortet saknas)';

// Samma vakt som i #128: utan kortet blir `null === null` sant och en strang utan siffror tom, sa
// proven nedan hade blivit grona utan att mata nagot.
async function kravKort(page) {
  const finns = await page.evaluate(() => !!document.querySelector('[data-stat="diamonds"] strong'));
  assert.equal(finns, true,
    'kortet [data-stat="diamonds"] finns inte — testet nedan hade blivit grönt utan att mäta något');
}



test('kortet heter DIAMANTER, inte INTÄKT', { skip }, async () => {
  const page = await framsidan();
  const ut = await page.evaluate(() => {
    const kort = document.querySelector('[data-stat="diamonds"]');
    return { finns: !!kort, etikett: kort?.querySelector('small')?.textContent || '',
             intaktKvar: !!document.querySelector('[data-stat="revenue"]') };
  });
  await page.close();
  assert.equal(ut.finns, true, 'kortet [data-stat="diamonds"] finns inte');
  assert.equal(ut.etikett, 'DIAMANTER', `etiketten var "${ut.etikett}"`);
  assert.equal(ut.intaktKvar, false, 'det gamla INTÄKT-kortet finns kvar — två kort för samma sak');
});

test('en gåva lägger till sitt diamantvärde', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['gift', { count: 1, coins: 500, giftName: 'Galaxy' }]);
  const visat = await page.evaluate(varde);
  await page.close();
  assert.equal(siffror(visat), '500', `kortet visade "${visat}"`);
});

test('diamanter summeras över flera gåvor', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['gift', { count: 1, coins: 100 }]);
  await page.evaluate(SKICKA(), ['gift', { count: 1, coins: 250 }]);
  const visat = await page.evaluate(varde);
  await page.close();
  assert.equal(siffror(visat), '350', `100 + 250 gav "${visat}"`);
});

// Bryggan skickar coins = diamantvarde PER GAVA x repeatCount, alltsa hela combons varde i ETT
// event. Kortet ska darfor lagga till talet rakt av, inte multiplicera om det med count.
test('en combo läggs till med sitt totalvärde, inte per gåva', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['gift', { count: 10, coins: 1000, repeatEnd: true }]);
  const visat = await page.evaluate(varde);
  await page.close();
  assert.equal(siffror(visat), '1000', `en combo pa 10 a 100 gav "${visat}" — ska vara 1000`);
});

// Samma event, tva olika tal. Blandas de ihop visar det ena kortet fel med flera tiopotenser.
test('GÅVOR räknar antal medan DIAMANTER räknar värde', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['gift', { count: 3, coins: 1500 }]);
  const ut = await page.evaluate(() => ({
    gavor: document.querySelector('[data-stat="gifts"] strong').textContent,
    diamanter: document.querySelector('[data-stat="diamonds"] strong').textContent
  }));
  await page.close();
  assert.equal(siffror(ut.gavor), '3', `GÅVOR visade "${ut.gavor}"`);
  assert.equal(siffror(ut.diamanter), '1500', `DIAMANTER visade "${ut.diamanter}"`);
});

test('live-vägen bygger inte om vyn', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  const ut = await page.evaluate(async () => {
    const vyFore = document.querySelector('#view');
    const kortFore = document.querySelector('[data-stat="diamonds"] strong');
    window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'gift', count: 1, coins: 5 } }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return {
      sammaVy: document.querySelector('#view') === vyFore,
      sammaKort: document.querySelector('[data-stat="diamonds"] strong') === kortFore
    };
  });
  await page.close();
  assert.equal(ut.sammaVy, true, '#view byttes ut — en liveuppdatering triggade render()');
  assert.equal(ut.sammaKort, true, 'kortet byttes ut — patchen var inte riktad');
});

test('före första gåvan står tomläget kvar', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  const ut = await page.evaluate(() => {
    const kort = document.querySelector('[data-stat="diamonds"]');
    return { varde: kort.querySelector('strong').textContent, text: kort.textContent };
  });
  await page.close();
  assert.equal(ut.varde, '—', `kortet visade "${ut.varde}" innan något hänt`);
  assert.match(ut.text, /Visas under riktig LIVE/, 'den ärliga tomtexten försvann');
});

test('teardown: kortet tystnar efter utloggning', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['gift', { count: 1, coins: 42 }]);
  const visat = await page.evaluate(async () => {
    window.dispatchEvent(new CustomEvent('vyra-session-ended'));
    window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'gift', count: 1, coins: 9999 } }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return document.querySelector('[data-stat="diamonds"] strong')?.textContent ?? '(kortet saknas)';
  });
  await page.close();
  assert.equal(siffror(visat), '42', `efter utloggning visade kortet "${visat}"`);
});
