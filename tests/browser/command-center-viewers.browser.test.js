'use strict';
// Command Center: tittarantalet, forsta riktiga datakopplingen pa framsidan.
//
// overview-premium.js ar 61 rader helt statisk markup — de fyra korten visar `—` och texten
// "Visas under riktig LIVE", och ingenting har nagonsin matat dem. Det ar inte en trasig koppling
// utan en som aldrig byggts.
//
// Tittare ar den enklaste av de fem: bada bryggorna skickar `viewer` med ett fardigt `count`
// (electron-app/tiktok-service.js och tiktok-bridge/bridge.js), sa ingen summering behovs, inget
// tidsfonster behover beslutas och ingen dedupe kravs. Den bevisar hela kedjan
// event → ingest → dashboard och blir mall for Likes, Gavor och Pulse.
//
// Matt i RIKTIG Chrome: fragan "byggdes vyn om?" ar en fraga om nodidentitet, och rAF finns inte
// meningsfullt i jsdom.
//
// KONTRAKTET SOM PROVAS (test 2 och 6 ar vakterna som gor monstret sakert att kopiera):
//   · en liveuppdatering far ALDRIG trigga render() — den river hela vyn
//   · allt som lyssnar maste rivas pa vyra-session-ended
//
// ROTT NU: alla sex. Ingen lyssnare finns.
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

// overview-premium.js laddas ivrigt av media.js och skriver over studio.js egen home(). Utan att
// vanta pa DEN versionen matter testet fel vy.
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

// Ett riktigt viewer-event, exakt den form ingest() slapper igenom: emit() i live-client.js gor
// dispatchEvent(new CustomEvent('vyra-live-event', {detail})) pa window.
const SKICKA = (typ, extra) => ([t, e]) => {
  window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: Object.assign({ type: t }, e) }));
  // Tva bildrutor: patchen batchas via requestAnimationFrame.
  return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
};

const siffror = txt => String(txt || '').replace(/\D/g, '');

// Utan den har kraschar tre av proven nedan i tysthet: finns inte kortet blir `null === null` sant
// och `'(kortet saknas)'` innehaller inga siffror, sa de blir GRONA utan att mata nagot. Varje prov
// slar darfor fast forst att kortet finns.
async function kravKort(page) {
  const finns = await page.evaluate(() => !!document.querySelector('[data-stat="viewers"] strong'));
  assert.equal(finns, true,
    'kortet [data-stat="viewers"] finns inte — testet nedan hade blivit grönt utan att mäta något');
}

test('ett viewer-event skriver antalet i kortet', { skip }, async () => {
  const page = await framsidan();
  await page.evaluate(SKICKA(), ['viewer', { count: 1284 }]);
  const visat = await page.evaluate(() =>
    document.querySelector('[data-stat="viewers"] strong')?.textContent ?? '(kortet saknas)');
  await page.close();
  assert.equal(siffror(visat), '1284', `kortet visade "${visat}"`);
});

test('live-vägen bygger inte om vyn', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  const ut = await page.evaluate(async () => {
    const vyFore = document.querySelector('#view');
    const kortFore = document.querySelector('[data-stat="viewers"] strong');
    window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'viewer', count: 42 } }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return {
      sammaVy: document.querySelector('#view') === vyFore,
      sammaKort: document.querySelector('[data-stat="viewers"] strong') === kortFore
    };
  });
  await page.close();
  assert.equal(ut.sammaVy, true, '#view byttes ut — en liveuppdatering triggade render()');
  assert.equal(ut.sammaKort, true, 'kortet byttes ut — patchen var inte riktad');
});

test('andra eventtyper rör inte tittarkortet', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['gift', { coins: 500, username: 'A' }]);
  await page.evaluate(SKICKA(), ['like', { count: 99 }]);
  const visat = await page.evaluate(() =>
    document.querySelector('[data-stat="viewers"] strong')?.textContent ?? '(kortet saknas)');
  await page.close();
  assert.equal(siffror(visat), '', `en gåva eller like skrev "${visat}" i tittarkortet`);
});

test('värdet överlever att vyn ritas om', { skip }, async () => {
  const page = await framsidan();
  await page.evaluate(SKICKA(), ['viewer', { count: 777 }]);
  // render() bygger om #view fran grunden — utan ateranvandning av senaste vardet star kortet
  // pa `—` igen sa fort anvandaren navigerar bort och tillbaka.
  const visat = await page.evaluate(async () => {
    render();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return document.querySelector('[data-stat="viewers"] strong')?.textContent ?? '(kortet saknas)';
  });
  await page.close();
  assert.equal(siffror(visat), '777', `efter render() visade kortet "${visat}"`);
});

test('före första eventet står tomläget kvar', { skip }, async () => {
  const page = await framsidan();
  const ut = await page.evaluate(() => {
    const kort = document.querySelector('[data-stat="viewers"]');
    return { varde: kort?.querySelector('strong')?.textContent, text: kort?.textContent || '' };
  });
  await page.close();
  assert.equal(ut.varde, '—', `kortet visade "${ut.varde}" innan något hänt — en nolla ljuger`);
  assert.match(ut.text, /Visas under riktig LIVE/,
    'den ärliga tomtexten försvann');
});

test('teardown: efter vyra-session-ended uppdateras kortet inte längre', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['viewer', { count: 111 }]);
  const visat = await page.evaluate(async () => {
    window.dispatchEvent(new CustomEvent('vyra-session-ended'));
    window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'viewer', count: 999 } }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return document.querySelector('[data-stat="viewers"] strong')?.textContent ?? '(kortet saknas)';
  });
  await page.close();
  assert.notEqual(siffror(visat), '999',
    'en utloggad session fortsatte ta emot livedata — lyssnaren revs aldrig');
});
