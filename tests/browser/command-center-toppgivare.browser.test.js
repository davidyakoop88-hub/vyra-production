'use strict';
// TOPPGIVARNA I KOMMANDOCENTRALEN — raden som ersatte de fyra summakorten (Davids beslut
// 2026-08-20). Fem kort: avatar, namn, diamanter och andel av totalen.
//
// DEN HAR FILEN ARVER FRAN DE FYRA BORTTAGNA. command-center-{viewers,likes,gifts,diamonds}
// bar 733 rader uppmatta fakta om samma handelsestrom. Presentationen bytte form, men
// garantierna galler oforandrat och foljer darfor med hit:
//
//   · en combo laggs till med sitt TOTALVARDE, aldrig varde x count — `coins` bar redan
//     coinsEach x repeatCount, och bada bryggorna skickar bara sista ramen av en streak
//   · live-vagen bygger ALDRIG om vyn (render() river #view och darmed allt annat)
//   · teardown pa vyra-session-ended — ingen lyssnare far overleva ett kontobyte
//   · fore forsta gavan star tomlaget kvar
//
// DET SOM INTE FOLJDE MED, och det ar en medveten forlust: tittarantal och likes visas inte
// langre nagonstans i Kommandocentralen. De var ogonblicksvarden TikTok redan raknat; vill de
// tillbaka ar det ett nytt kort, inte en atergang.
//
// NYTT SOM BARA GALLER HAR: sortering, andelsberakningen, taket pa fem, och att bade namn och
// avatar-URL ar DATA UTIFRAN.
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
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
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
  await page.waitForFunction(() => document.documentElement.dataset.ccReady === '1',
    null, { timeout: 20000 });
  await page.evaluate(() => { view = 'home'; render() });
  await page.waitForSelector('.home-welcome', { timeout: 10000 });
  return page;
}

const SKICKA = () => ([t, e]) => {
  window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: Object.assign({ type: t }, e) }));
  return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
};

// Las hela raden som data i stallet for att jaga enskilda selektorer i varje prov.
const RADEN = () => {
  const rad = document.querySelector('[data-toppgivare]');
  if (!rad) return { saknas: true };
  return {
    tomSynlig: !!rad.querySelector('.toppgivare-tom:not([hidden])'),
    kort: [...rad.querySelectorAll('.toppgivare-kort')].map(k => ({
      namn: k.querySelector('b')?.textContent || '',
      varde: k.querySelector('strong')?.textContent || '',
      andel: k.querySelector('em')?.textContent || '',
      avatar: k.querySelector('img')?.getAttribute('src') || null,
      namnHtml: k.querySelector('b')?.innerHTML || '',
    })),
  };
};

// Utan raden blir tomma listor sanna i varje jamforelse nedan — samma vakt som #128.
async function kravRaden(page) {
  const finns = await page.evaluate(() => !!document.querySelector('[data-toppgivare]'));
  assert.equal(finns, true,
    '[data-toppgivare] finns inte — proven nedan hade blivit gröna utan att mäta något');
}

test('de fyra summakorten ar borta ur DOM', { skip }, async () => {
  // Beslutet var borttagning, inte gomning: dolda kort kan tandas igen av misstag, och da star
  // tva sanningar om samma sandning pa samma sida.
  const page = await framsidan();
  const kvar = await page.evaluate(() =>
    ['viewers', 'likes', 'gifts', 'diamonds', 'revenue']
      .filter(s => !!document.querySelector(`[data-stat="${s}"]`)));
  await page.close();
  assert.deepEqual(kvar, [], `summakort kvar i DOM: ${kvar.join(', ')}`);
});

test('fore forsta gavan star tomlaget kvar', { skip }, async () => {
  const page = await framsidan();
  await kravRaden(page);
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.equal(ut.kort.length, 0, `raden visade ${ut.kort.length} kort utan att någon gett något`);
  assert.equal(ut.tomSynlig, true, 'tomtexten borde stå kvar tills en riktig gåva kommit');
});

test('en gava ger ett kort med namn, varde och 100 procent', { skip }, async () => {
  const page = await framsidan();
  await kravRaden(page);
  await page.evaluate(SKICKA(), ['gift', { userId: 'u1', username: 'ana', coins: 500, count: 1 }]);
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.equal(ut.kort.length, 1, 'en gåva ska ge exakt ett kort');
  assert.equal(ut.kort[0].namn, 'ana', `namnet var "${ut.kort[0].namn}"`);
  assert.match(ut.kort[0].varde, /500/, `värdet var "${ut.kort[0].varde}"`);
  assert.match(ut.kort[0].andel, /100/, `ensam givare ska ha hela andelen, fick "${ut.kort[0].andel}"`);
});

test('en combo laggs till med sitt totalvarde, inte per gava', { skip }, async () => {
  // Arvd fran command-center-diamonds. `coins` bar redan coinsEach x repeatCount; multipliceras
  // den med count blir en combo ett kvadrattal och toppgivaren far fel andel.
  const page = await framsidan();
  await kravRaden(page);
  await page.evaluate(SKICKA(), ['gift', { userId: 'u1', username: 'ana', coins: 4500, count: 9 }]);
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.match(ut.kort[0].varde, /4\.5 K|4500/,
    `en combo på 9 x 500 ska bli 4500, inte 40500 — kortet visade "${ut.kort[0].varde}"`);
});

test('flera givare sorteras hogst forst och far ratt andel', { skip }, async () => {
  const page = await framsidan();
  await kravRaden(page);
  await page.evaluate(SKICKA(), ['gift', { userId: 'u1', username: 'liten', coins: 100, count: 1 }]);
  await page.evaluate(SKICKA(), ['gift', { userId: 'u2', username: 'stor', coins: 300, count: 1 }]);
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.deepEqual(ut.kort.map(k => k.namn), ['stor', 'liten'],
    `fel ordning: ${ut.kort.map(k => k.namn).join(', ')}`);
  assert.match(ut.kort[0].andel, /75/, `300 av 400 är 75 %, fick "${ut.kort[0].andel}"`);
  assert.match(ut.kort[1].andel, /25/, `100 av 400 är 25 %, fick "${ut.kort[1].andel}"`);
});

test('samma givare summeras till EN rad', { skip }, async () => {
  const page = await framsidan();
  await kravRaden(page);
  await page.evaluate(SKICKA(), ['gift', { userId: 'u1', username: 'ana', coins: 100, count: 1 }]);
  await page.evaluate(SKICKA(), ['gift', { userId: 'u1', username: 'ana', coins: 200, count: 1 }]);
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.equal(ut.kort.length, 1, 'samma userId ska inte ge två rader');
  assert.match(ut.kort[0].varde, /300/, `summan var "${ut.kort[0].varde}"`);
});

test('tva givare med samma visningsnamn slas inte ihop', { skip }, async () => {
  // Nyckeln ar userId nar det finns. Slogs de ihop pa namn skulle tva vanliga tittare kunna se
  // ut som en storgivare.
  const page = await framsidan();
  await kravRaden(page);
  await page.evaluate(SKICKA(), ['gift', { userId: 'u1', username: 'ana', coins: 100, count: 1 }]);
  await page.evaluate(SKICKA(), ['gift', { userId: 'u2', username: 'ana', coins: 100, count: 1 }]);
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.equal(ut.kort.length, 2, 'samma namn men olika userId ska ge två rader');
});

test('raden visar hogst fem', { skip }, async () => {
  const page = await framsidan();
  await kravRaden(page);
  for (let i = 1; i <= 7; i++) {
    await page.evaluate(SKICKA(), ['gift', { userId: 'u' + i, username: 'g' + i, coins: i * 100, count: 1 }]);
  }
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.equal(ut.kort.length, 5, `raden visade ${ut.kort.length} kort`);
  assert.equal(ut.kort[0].namn, 'g7', 'den som gett mest ska stå först');
});

test('ett namn som ser ut som markup visas som text', { skip }, async () => {
  const page = await framsidan();
  await kravRaden(page);
  await page.evaluate(SKICKA(), ['gift',
    { userId: 'u1', username: '<img src=x onerror=alert(1)>', coins: 100, count: 1 }]);
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.match(ut.kort[0].namnHtml, /&lt;img/,
    `namnet tolkades som markup: "${ut.kort[0].namnHtml}" — raden bär användardata och måste `
    + 'byggas med textContent');
});

test('en avatar-URL som inte ar http slapps inte in i en img', { skip }, async () => {
  const page = await framsidan();
  await kravRaden(page);
  await page.evaluate(SKICKA(), ['gift',
    { userId: 'u1', username: 'ana', coins: 100, count: 1, profileImage: 'javascript:alert(1)' }]);
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.equal(ut.kort[0].avatar, null,
    `en icke-http-URL hamnade i img.src: "${ut.kort[0].avatar}"`);
});

test('en riktig avatar visas', { skip }, async () => {
  // Kontrollmatning mot provet ovan: utan den kunde saker() returnera tomt for ALLT och bada
  // proven vore grona.
  const page = await framsidan();
  await kravRaden(page);
  await page.evaluate(SKICKA(), ['gift',
    { userId: 'u1', username: 'ana', coins: 100, count: 1, profileImage: 'https://exempel.test/a.jpg' }]);
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.equal(ut.kort[0].avatar, 'https://exempel.test/a.jpg', 'en https-avatar ska visas');
});

test('live-vagen bygger inte om vyn', { skip }, async () => {
  // Arvd. render() satter viewRoot.innerHTML och river hela vyn — en oppen panel, en pagaende
  // redigering, allt. Live-vagen far bara byta noder.
  const page = await framsidan();
  await kravRaden(page);
  await page.evaluate(() => { document.querySelector('.home-welcome').dataset.markor = 'kvar' });
  await page.evaluate(SKICKA(), ['gift', { userId: 'u1', username: 'ana', coins: 100, count: 1 }]);
  const kvar = await page.evaluate(() =>
    document.querySelector('.home-welcome')?.dataset.markor === 'kvar');
  await page.close();
  assert.equal(kvar, true, 'vyn byggdes om — markören försvann');
});

test('teardown: raden tystnar efter utloggning', { skip }, async () => {
  const page = await framsidan();
  await kravRaden(page);
  await page.evaluate(SKICKA(), ['gift', { userId: 'u1', username: 'ana', coins: 100, count: 1 }]);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vyra-session-ended')));
  await page.evaluate(() => { view = 'home'; render() });
  await page.waitForSelector('.home-welcome');
  await page.evaluate(SKICKA(), ['gift', { userId: 'u2', username: 'ny', coins: 900, count: 1 }]);
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.equal(ut.kort.length, 0,
    'raden uppdaterades efter utloggning — föregående kontos siffror kan nå nästa användare');
});
