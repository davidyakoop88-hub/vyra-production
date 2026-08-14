'use strict';
// Command Center: LIVE PULSE — fjarde kortet, och det enda som inte ar ett tal.
//
// RATTELSE TILL FAS A. Utredningen sa att Pulse blir enkelt eftersom VyraLiveControl.getSnapshot()
// redan finns. Filen live-control.js finns och serveras (200 i produktion) — men INGENTING laddar
// den. Varken studio.html eller media.js namner den, sa VyraLiveControl definieras aldrig i
// korningen. Pulse haller darfor sin egen buffert, precis som de tre sifferkorten.
//
// NYTT KRAV som de tre andra slapp undan: raderna innehaller ANVANDARDATA fran TikTok. Listan
// byggs darfor med createElement och textContent — aldrig innerHTML. Det ar bade
// arkitekturkontraktets regel for livevagen och det enda som gor ett anvandarnamn ofarligt.
//
// ROTT NU: alla sju.
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
const rader = () => [...document.querySelectorAll('[data-pulse] li')].map(li => li.textContent);

// Samma vakt som i #128: utan kortet blir `null === null` sant och en strang utan siffror tom, sa
// proven nedan hade blivit grona utan att mata nagot.
async function kravKort(page) {
  const finns = await page.evaluate(() => !!document.querySelector('[data-pulse]'));
  assert.equal(finns, true,
    'kortet [data-pulse] finns inte — testet nedan hade blivit grönt utan att mäta något');
}

test('en händelse dyker upp i pulsen', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['gift', { username: 'streamqueen', giftName: 'Rose', count: 3 }]);
  const lista = await page.evaluate(rader);
  await page.close();
  assert.equal(lista.length, 1, `pulsen hade ${lista.length} rader`);
  assert.match(lista[0], /streamqueen/, `raden saknar avsändaren: "${lista[0]}"`);
});

test('nyaste händelsen ligger överst', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['follow', { username: 'forst' }]);
  await page.evaluate(SKICKA(), ['follow', { username: 'sist' }]);
  const lista = await page.evaluate(rader);
  await page.close();
  assert.match(lista[0], /sist/, `överst låg "${lista[0]}" — ordningen är omvänd`);
});

test('listan växer inte obegränsat', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(async () => {
    for (let i = 1; i <= 40; i++) {
      window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'follow', username: 'u' + i } }));
    }
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  const lista = await page.evaluate(rader);
  await page.close();
  assert.ok(lista.length > 0 && lista.length <= 10,
    `40 händelser gav ${lista.length} rader — bufferten är obegränsad`);
});

// Anvandarnamn kommer fran TikTok. Ett namn som ser ut som markup far aldrig bli markup.
test('ett användarnamn injiceras inte som HTML', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['follow', { username: '<img src=x onerror=alert(1)>ond' }]);
  const ut = await page.evaluate(() => {
    const kort = document.querySelector('[data-pulse]');
    return { bilder: kort.querySelectorAll('img').length, text: kort.textContent };
  });
  await page.close();
  assert.equal(ut.bilder, 0, 'användarnamnet tolkades som HTML — ett <img> skapades');
  assert.match(ut.text, /ond/, 'namnet visas inte alls');
});

test('live-vägen bygger inte om vyn', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  const ut = await page.evaluate(async () => {
    const vyFore = document.querySelector('#view');
    const kortFore = document.querySelector('[data-pulse]');
    window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'follow', username: 'a' } }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return {
      sammaVy: document.querySelector('#view') === vyFore,
      sammaKort: document.querySelector('[data-pulse]') === kortFore
    };
  });
  await page.close();
  assert.equal(ut.sammaVy, true, '#view byttes ut — en liveuppdatering triggade render()');
  assert.equal(ut.sammaKort, true, 'kortet byttes ut — patchen var inte riktad');
});

test('före första händelsen står tomtexten kvar', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  const ut = await page.evaluate(() => {
    const kort = document.querySelector('[data-pulse]');
    return { rader: kort.querySelectorAll('li').length, text: kort.textContent };
  });
  await page.close();
  assert.equal(ut.rader, 0, 'pulsen visade rader innan något hänt');
  // Tomtexten ags av tests/fixtures/tomma-tillstand.js sedan Etapp 4 PR B — provet foljer
  // fixturen i stallet for att hardkoda en fras som sprakandringar fallde en gang redan.
  const { TOMMA } = require('../fixtures/tomma-tillstand.js');
  assert.ok(ut.text.includes(TOMMA['oversikt-puls'].text), 'den ärliga tomtexten försvann');
});

test('teardown: pulsen tystnar efter utloggning', { skip }, async () => {
  const page = await framsidan();
  await kravKort(page);
  await page.evaluate(SKICKA(), ['follow', { username: 'fore' }]);
  const lista = await page.evaluate(async () => {
    window.dispatchEvent(new CustomEvent('vyra-session-ended'));
    window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'follow', username: 'efter' } }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return [...document.querySelectorAll('[data-pulse] li')].map(li => li.textContent);
  });
  await page.close();
  assert.equal(lista.some(r => /efter/.test(r)), false,
    'en utloggad session fortsatte ta emot händelser');
});
