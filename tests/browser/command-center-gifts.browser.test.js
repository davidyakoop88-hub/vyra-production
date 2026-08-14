'use strict';
// Command Center: gavor — tredje kortet. Forsta som maste SUMMERA.
//
// Tittare och likes var ogonblicksvarden: TikTok raknar totalen at oss. For gavor skickas ingen
// rums-total alls, sa kortet maste rakna sjalvt. Det for med sig tva fragor som de tva forsta
// slapp undan.
//
// COMBO-SEMANTIKEN AR REDAN LOST ETT LAGER NER. Bada bryggorna vidarebefordrar bara SISTA ramen
// av en streakbar gava (tiktok-bridge/bridge.js:314, electron-app/tiktok-service.js:97) — annars
// blir en streak ett triangeltal. Nar eventet nar hit motsvarar det alltsa en avslutad gava eller
// combo, med count = repeatCount. Summering ar darfor saker.
//
// ANTAL ELLER VARDE? Kortet heter GAVOR och det finns ett separat INTAKT-kort. Alltsa ANTAL har
// (falt: count) och coin-vardet (falt: coins) hor till INTAKT. Ett byte ar en rad i KORT-tabellen.
//
// FONSTRET ar sessionen: summan lever i minnet och nollstalls pa vyra-session-ended. En omladdning
// borjar om — det ar en medveten MVP-begransning, inte en olycka.
//
// ROTT NU: alla nio.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');

const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

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

let server, browser, bas;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
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
    () => typeof home === 'function' && home.toString().includes('KOMMANDOCENTRAL'),
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
const varde = () => document.querySelector('[data-stat="gifts"] strong')?.textContent ?? '(kortet saknas)';

// Samma vakt som i #128: utan kortet blir `null === null` sant och en strang utan siffror tom, sa
// proven nedan hade blivit grona utan att mata nagot.
async function kravKort(page) {
  const finns = await page.evaluate(() => !!document.querySelector('[data-stat="gifts"] strong'));
  assert.equal(finns, true,
    'kortet [data-stat="gifts"] finns inte — testet nedan hade blivit grönt utan att mäta något');
}

test('en gåva ökar antalet', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['gift', { count: 1, coins: 5, giftName: 'Rose' }]);
  const visat = await page.evaluate(varde);
  await page.close();
  assert.equal(siffror(visat), '1', `kortet visade "${visat}"`);
});

test('flera gåvor summeras', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['gift', { count: 2, coins: 10 }]);
  await page.evaluate(SKICKA(), ['gift', { count: 3, coins: 15 }]);
  const visat = await page.evaluate(varde);
  await page.close();
  assert.equal(siffror(visat), '5', `2 + 3 gåvor gav "${visat}"`);
});

// Bryggan skickar bara sista ramen av en combo, med count = repeatCount. En combo pa tio ar alltsa
// ETT event som ska rakna tio — inte tio event, och inte ett.
test('en combo räknas som sin repeatCount', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['gift', { count: 10, coins: 500, repeatEnd: true }]);
  const visat = await page.evaluate(varde);
  await page.close();
  assert.equal(siffror(visat), '10', `en combo pa tio gav "${visat}"`);
});

// GAVOR ar ANTAL. Coin-vardet hor till INTAKT-kortet och far inte lacka in har.
test('coin-värdet hamnar inte i gåvokortet', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['gift', { count: 1, coins: 4999 }]);
  const visat = await page.evaluate(varde);
  await page.close();
  assert.equal(siffror(visat), '1', `kortet visade "${visat}" — coins läckte in i antalet`);
});

test('live-vägen bygger inte om vyn', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  const ut = await page.evaluate(async () => {
    const vyFore = document.querySelector('#view');
    const kortFore = document.querySelector('[data-stat="gifts"] strong');
    window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'gift', count: 1 } }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return {
      sammaVy: document.querySelector('#view') === vyFore,
      sammaKort: document.querySelector('[data-stat="gifts"] strong') === kortFore
    };
  });
  await page.close();
  assert.equal(ut.sammaVy, true, '#view byttes ut — en liveuppdatering triggade render()');
  assert.equal(ut.sammaKort, true, 'kortet byttes ut — patchen var inte riktad');
});

test('andra eventtyper rör inte gåvokortet', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['viewer', { count: 1284 }]);
  await page.evaluate(SKICKA(), ['likes', { count: 5, points: 900 }]);
  const visat = await page.evaluate(varde);
  await page.close();
  assert.equal(siffror(visat), '', `en tittare eller like skrev "${visat}" i gåvokortet`);
});

test('summan överlever att vyn ritas om', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['gift', { count: 7 }]);
  const visat = await page.evaluate(async () => {
    render();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return document.querySelector('[data-stat="gifts"] strong')?.textContent ?? '(kortet saknas)';
  });
  await page.close();
  assert.equal(siffror(visat), '7', `efter render() visade kortet "${visat}"`);
});

test('före första gåvan står tomläget kvar', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  const ut = await page.evaluate(() => {
    const kort = document.querySelector('[data-stat="gifts"]');
    return { varde: kort.querySelector('strong').textContent, text: kort.textContent };
  });
  await page.close();
  assert.equal(ut.varde, '—', `kortet visade "${ut.varde}" innan något hänt — en nolla ljuger`);
  assert.match(ut.text, /Visas under riktig LIVE/, 'den ärliga tomtexten försvann');
});

// Mater att lyssnaren TYSTNAR. Att summan dessutom nollstalls gar inte att observera utifran —
// `levande = false` blockerar redan varje malning, sa en mutation som tar bort nollstallningen
// faller inte har. Det ar kontrollerat, inte antaget: mutationsprovet lamnade provet gront.
// Nollstallningen ar darfor djupforsvar mot ett kontobyte, inte ett testat kontrakt, och testet
// heter det det bevisar.
test('teardown: lyssnaren tystnar efter utloggning', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['gift', { count: 4 }]);
  const visat = await page.evaluate(async () => {
    window.dispatchEvent(new CustomEvent('vyra-session-ended'));
    window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'gift', count: 50 } }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return document.querySelector('[data-stat="gifts"] strong')?.textContent ?? '(kortet saknas)';
  });
  await page.close();
  assert.equal(siffror(visat), '4',
    `efter utloggning visade kortet "${visat}" — summan fortsatte räknas eller nollställdes inte`);
});
