'use strict';
// Command Center: likes — andra kortet, samma monster som tittarantalet (#128).
//
// Like-eventet bar TVA tal, och skillnaden avgor hela designen:
//
//   count   likes i DEN HAR skuren (en anvandares tappserie)
//   points  TikToks egen totalLikeCount for rummet
//
// `points` ar alltsa ett ogonblicksvarde precis som viewer.count — TikTok raknar redan totalen at
// oss. Darfor behover kortet varken summera sjalvt eller besluta nagot tidsfonster: perioden ar den
// TikTok raknar for den pagaende sandningen. Att i stallet summera `count` hade krävt ett beslut om
// nollstallning mellan sandningar, och riskerat dubbelrakning vid aterkoppling.
//
// TVA STAVNINGAR. Bada bryggorna skickar typen `likes` (plural). Molnets event-bus aliasar
// `likes → like` (server/event-bus.js:6), men desktopvagen gar direkt via den lokala servern utan
// det aliaset. Kortet maste darfor ta emot bada — det ar exakt den sortens glapp som gjort fyra
// widgetar tysta tidigare.
//
// ROTT NU: alla sju. Ingen lyssnare finns for likes.
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
const varde = () => document.querySelector('[data-stat="likes"] strong')?.textContent ?? '(kortet saknas)';

// Samma vakt som i #128: utan kortet blir `null === null` sant och en strang utan siffror tom, sa
// proven nedan hade blivit grona utan att mata nagot.
async function kravKort(page) {
  const finns = await page.evaluate(() => !!document.querySelector('[data-stat="likes"] strong'));
  assert.equal(finns, true,
    'kortet [data-stat="likes"] finns inte — testet nedan hade blivit grönt utan att mäta något');
}

test('ett likes-event skriver TikToks totalsiffra', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['likes', { count: 15, points: 48200 }]);
  const visat = await page.evaluate(varde);
  await page.close();
  assert.equal(siffror(visat), '48200',
    `kortet visade "${visat}" — ska visa totalen (points), inte skuren (count)`);
});

test('båda stavningarna tas emot — like och likes', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['like', { count: 3, points: 777 }]);
  const efterSingular = await page.evaluate(varde);
  await page.evaluate(SKICKA(), ['likes', { count: 3, points: 888 }]);
  const efterPlural = await page.evaluate(varde);
  await page.close();
  assert.equal(siffror(efterSingular), '777', `typen "like" ignorerades — visade "${efterSingular}"`);
  assert.equal(siffror(efterPlural), '888', `typen "likes" ignorerades — visade "${efterPlural}"`);
});

test('live-vägen bygger inte om vyn', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  const ut = await page.evaluate(async () => {
    const vyFore = document.querySelector('#view');
    const kortFore = document.querySelector('[data-stat="likes"] strong');
    window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'likes', points: 42 } }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return {
      sammaVy: document.querySelector('#view') === vyFore,
      sammaKort: document.querySelector('[data-stat="likes"] strong') === kortFore
    };
  });
  await page.close();
  assert.equal(ut.sammaVy, true, '#view byttes ut — en liveuppdatering triggade render()');
  assert.equal(ut.sammaKort, true, 'kortet byttes ut — patchen var inte riktad');
});

test('andra eventtyper rör inte likes-kortet', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['viewer', { count: 1284 }]);
  await page.evaluate(SKICKA(), ['gift', { coins: 500 }]);
  const visat = await page.evaluate(varde);
  await page.close();
  assert.equal(siffror(visat), '', `en tittare eller gåva skrev "${visat}" i likes-kortet`);
});

test('värdet överlever att vyn ritas om', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['likes', { points: 9001 }]);
  const visat = await page.evaluate(async () => {
    render();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return document.querySelector('[data-stat="likes"] strong')?.textContent ?? '(kortet saknas)';
  });
  await page.close();
  assert.equal(siffror(visat), '9001', `efter render() visade kortet "${visat}"`);
});

test('före första eventet står tomläget kvar', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  const ut = await page.evaluate(() => {
    const kort = document.querySelector('[data-stat="likes"]');
    return { varde: kort.querySelector('strong').textContent, text: kort.textContent };
  });
  await page.close();
  assert.equal(ut.varde, '—', `kortet visade "${ut.varde}" innan något hänt — en nolla ljuger`);
  assert.match(ut.text, /Visas under riktig LIVE/, 'den ärliga tomtexten försvann');
});

test('teardown: efter vyra-session-ended uppdateras kortet inte längre', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['likes', { points: 111 }]);
  const visat = await page.evaluate(async () => {
    window.dispatchEvent(new CustomEvent('vyra-session-ended'));
    window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'likes', points: 999 } }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return document.querySelector('[data-stat="likes"] strong')?.textContent ?? '(kortet saknas)';
  });
  await page.close();
  assert.notEqual(siffror(visat), '999',
    'en utloggad session fortsatte ta emot livedata — lyssnaren revs aldrig');
});
