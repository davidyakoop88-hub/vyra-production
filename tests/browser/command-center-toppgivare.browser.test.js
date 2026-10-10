'use strict';
// TOPPGIVARNA I KOMMANDOCENTRALEN — raden som ersatte de fyra summakorten (Davids beslut
// 2026-08-20). Fem kort: avatar, namn, diamanter och andel av totalen.
//
// VANDES 2026-10-10: raden ritas ur SERVERN, inte ur liveflodet. Fram till dess holl raden en egen
// summering i minnet som fylldes av `vyra-live-event`. Uppmatt i sandningen 2026-10-09: bryggan
// vidarebefordrade 295 gavor, servern skrev 869 gavor och 98 073 diamanter till gifter_totals —
// och raden i Davids Studio stod tom hela kvallen. En rad som bara lever i en oppen, synlig flik
// under sandningen, och toms av varje omladdning, ar i praktiken alltid tom.
//
// Garantierna som FOLJDE MED fran den gamla raden, nu matta mot /stats-svaret i stallet:
//
//   · sortering hogst forst, andel av TOTALEN (inte av de fem), taket pa fem
//   · bade namn och avatar-URL ar DATA UTIFRAN — textContent, aldrig innerHTML; bara http(s) i src
//   · live-vagen bygger ALDRIG om vyn (render() river #view och darmed allt annat)
//   · teardown pa vyra-session-ended — ingen hamtning far overleva ett kontobyte
//   · fore forsta svaret star laddlaget kvar
//
// NYTT: en gava i liveflodet ger en NY HAMTNING (en per skur), inte en addition pa klienten; raden
// foljer inte periodknapparna; och ett tomt svar doljer skelettet med en arlig text.
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

// Samma form som server/stats-read.js svarar med. totalt.diamonds ar HELA summan sedan start;
// andelen ska raknas mot den, inte mot de fem som visas.
const givare = (id, diamonds, extra = {}) =>
  ({ id, namn: id, avatar: '', gifts: 1, diamonds, likes: 0, bastaGava: null, ...extra });
const SVAR = (toppGivare, totalDiamanter) => ({
  ok: true, period: 'all', fran: null, forstaDagen: '2026-06-01', konto: 'jokero060', fel: false,
  totalt: { gifts: 128, diamonds: totalDiamanter, likes: 9820 },
  dagar: [{ dag: '2026-06-01', gifts: 10, diamonds: 3000, likes: 500 }],
  toppGivare
});

// Stubbarna satts EFTER att sidan laddat, inte via addInitScript: sidans egna auth-client.js och
// cloud-sync.js definierar window.VyraAuth och window.VyraCloudSync vid laddning och skriver rakt
// over stubbarna (se command-center-alltime). Svaret kan bytas under provets gang via
// window.__svar, sa en "ny gava" kan ge ett NYTT svar fran servern.
async function framsidan(svar) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ccReady === '1',
    null, { timeout: 20000 });
  await page.evaluate(svarJson => {
    window.__begarda = [];
    window.__svar = JSON.parse(svarJson);
    window.VyraCloudSync = { current: () => ({ workspace: { id: 'ws-1' } }) };
    window.VyraAuth = {
      api: async path => { window.__begarda.push(path); return JSON.parse(JSON.stringify(window.__svar)) }
    };
  }, JSON.stringify(svar));
  await page.evaluate(() => { view = 'home'; render() });
  await page.waitForSelector('.home-welcome', { timeout: 10000 });
  return page;
}

// Vantar in forsta malningen av raden (hamtningen ar samlad bakom en kort timer).
async function vantaPaKort(page, antal = 1) {
  await page.waitForFunction(n =>
    document.querySelectorAll('[data-toppgivare] .toppgivare-kort').length >= n, antal, { timeout: 8000 })
    .catch(() => {});
}

const SKICKA = () => ([t, e]) => {
  window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: Object.assign({ type: t }, e) }));
};

// Las hela raden som data i stallet for att jaga enskilda selektorer i varje prov.
const RADEN = () => {
  const rad = document.querySelector('[data-toppgivare]');
  if (!rad) return { saknas: true };
  return {
    tomSynlig: !!rad.querySelector('.toppgivare-tom:not([hidden])'),
    tomText: rad.querySelector('.toppgivare-tom')?.textContent || '',
    skelettSynligt: !!rad.querySelector('.toppgivare-skelett:not([hidden])'),
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
  const page = await framsidan(SVAR([], 0));
  const kvar = await page.evaluate(() => ({
    kort: document.querySelectorAll('.command-stat, [data-stat-card]').length,
    tittare: /TITTARE/.test(document.querySelector('#view')?.textContent || '')
  }));
  await page.close();
  assert.equal(kvar.kort, 0, 'gamla summakort finns kvar i DOM');
  assert.equal(kvar.tittare, false, 'ordet TITTARE star kvar i vyn');
});

test('raden ritas ur serverns svar: namn, varde och andel av totalen', { skip }, async () => {
  // 500 av 2 000 diamanter sedan start = 25 %. Andelen raknas mot HELA totalen, inte mot de fem
  // som visas — annars summerade raden alltid till 100 %.
  const page = await framsidan(SVAR([givare('ana', 500)], 2000));
  await kravRaden(page);
  await vantaPaKort(page);
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.equal(ut.kort.length, 1, 'raden skulle ha ett kort');
  assert.equal(ut.kort[0].namn, 'ana');
  assert.match(ut.kort[0].varde, /500/);
  assert.match(ut.kort[0].andel, /25 %/);
  assert.equal(ut.tomSynlig, false, 'tomtexten star kvar fast raden ar ritad');
  assert.equal(ut.skelettSynligt, false, 'skelettet star kvar fast raden ar ritad');
});

test('flera givare sorteras hogst forst', { skip }, async () => {
  const page = await framsidan(SVAR([givare('liten', 100), givare('stor', 300)], 400));
  await kravRaden(page);
  await vantaPaKort(page, 2);
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.deepEqual(ut.kort.map(k => k.namn), ['stor', 'liten']);
  assert.match(ut.kort[0].andel, /75 %/);
  assert.match(ut.kort[1].andel, /25 %/);
});

test('raden visar hogst fem', { skip }, async () => {
  const atta = Array.from({ length: 8 }, (_, i) => givare('g' + (i + 1), (i + 1) * 100));
  const page = await framsidan(SVAR(atta, 3600));
  await kravRaden(page);
  await vantaPaKort(page, 5);
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.equal(ut.kort.length, 5, 'raden visade fler an fem');
  assert.equal(ut.kort[0].namn, 'g8', 'den storsta ligger inte forst');
});

test('under en procent skrivs som <1 %, aldrig 0 %', { skip }, async () => {
  const page = await framsidan(SVAR([givare('stor', 100000), givare('liten', 1)], 100001));
  await kravRaden(page);
  await vantaPaKort(page, 2);
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.match(ut.kort[1].andel, /<1 %/, `andelen for en liten givare blev "${ut.kort[1].andel}"`);
});

test('ett namn som ser ut som markup visas som text', { skip }, async () => {
  const page = await framsidan(SVAR([givare('<img src=x onerror=alert(1)>', 100)], 100));
  await kravRaden(page);
  await vantaPaKort(page);
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.equal(ut.kort.length, 1);
  assert.equal(ut.kort[0].namn, '<img src=x onerror=alert(1)>', 'namnet skrevs inte som text');
  assert.doesNotMatch(ut.kort[0].namnHtml, /<img/, 'namnet tolkades som markup');
});

test('en avatar-URL som inte ar http slapps inte in i en img', { skip }, async () => {
  const page = await framsidan(SVAR([givare('ana', 100, { avatar: 'javascript:alert(1)' })], 100));
  await kravRaden(page);
  await vantaPaKort(page);
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.equal(ut.kort[0].avatar, null, 'en javascript:-URL hamnade i en <img>');
});

test('en riktig avatar visas', { skip }, async () => {
  const page = await framsidan(SVAR([givare('ana', 100, { avatar: 'https://exempel.test/a.jpg' })], 100));
  await kravRaden(page);
  await vantaPaKort(page);
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.equal(ut.kort[0].avatar, 'https://exempel.test/a.jpg');
});

test('utan givare doljs skelettet och en arlig text star kvar', { skip }, async () => {
  const page = await framsidan(SVAR([], 0));
  await kravRaden(page);
  await page.waitForFunction(() => /Inga gåvor registrerade/.test(
    document.querySelector('[data-toppgivare] .toppgivare-tom')?.textContent || ''), null, { timeout: 8000 })
    .catch(() => {});
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.equal(ut.kort.length, 0);
  assert.equal(ut.tomSynlig, true, 'tomtexten doldes fast servern inte hade nagra givare');
  assert.match(ut.tomText, /Inga gåvor registrerade ännu/);
  assert.equal(ut.skelettSynligt, false, 'skelettet andas vidare over "inga gavor" — det ser ut som att nagot hamtas');
});

test('en gava i liveflodet ger en ny hamtning, och raden foljer serverns nya svar', { skip }, async () => {
  const page = await framsidan(SVAR([givare('ana', 500)], 500));
  await kravRaden(page);
  await vantaPaKort(page);
  const fore = await page.evaluate(() => window.__begarda.length);
  // Servern har nu raknat in gavan; klienten ska INTE addera sjalv utan fraga om.
  await page.evaluate(svarJson => { window.__svar = JSON.parse(svarJson) },
    JSON.stringify(SVAR([givare('ana', 500), givare('bo', 1500)], 2000)));
  await page.evaluate(SKICKA(), ['gift', { userId: 'u2', username: 'bo', coins: 1500, count: 1 }]);
  await page.waitForFunction(n => window.__begarda.length > n, fore, { timeout: 8000 }).catch(() => {});
  await vantaPaKort(page, 2);
  const ut = await page.evaluate(RADEN);
  const efter = await page.evaluate(() => window.__begarda.length);
  await page.close();
  assert.ok(efter > fore, 'gavan gav ingen ny hamtning av /stats');
  assert.deepEqual(ut.kort.map(k => k.namn), ['bo', 'ana'], 'raden foljde inte serverns nya svar');
  assert.match(ut.kort[0].andel, /75 %/);
});

test('en skur av gavor ger EN hamtning, inte en per gava', { skip }, async () => {
  const page = await framsidan(SVAR([givare('ana', 500)], 500));
  await kravRaden(page);
  await vantaPaKort(page);
  const fore = await page.evaluate(() => window.__begarda.length);
  for (let i = 0; i < 20; i++) {
    await page.evaluate(SKICKA(), ['gift', { userId: 'u' + i, username: 'g' + i, coins: 10, count: 1 }]);
  }
  await page.waitForFunction(n => window.__begarda.length > n, fore, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(800);
  const efter = await page.evaluate(() => window.__begarda.length);
  await page.close();
  assert.equal(efter - fore, 1, `20 gavor gav ${efter - fore} hamtningar`);
});

test('raden foljer inte periodknapparna', { skip }, async () => {
  // gifter_totals bar livstidssummor; ett 30-dagarssvar med andra toppGivare far inte skriva om
  // raden som sager "sedan start".
  const page = await framsidan(SVAR([givare('ana', 500)], 500));
  await kravRaden(page);
  await vantaPaKort(page);
  await page.evaluate(svarJson => { window.__svar = JSON.parse(svarJson) },
    JSON.stringify({ ...SVAR([givare('annan', 9000)], 9000), period: '30d', fran: '2026-09-10' }));
  await page.click('[data-alltime-period="30d"]');
  await page.waitForFunction(() => (window.__begarda || []).some(p => /period=30d/.test(p)), null, { timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(300);
  const ut = await page.evaluate(RADEN);
  await page.close();
  assert.deepEqual(ut.kort.map(k => k.namn), ['ana'], 'raden skrevs om av ett periodsvar');
});

test('live-vagen bygger inte om vyn', { skip }, async () => {
  // Arvd. render() satter viewRoot.innerHTML och river hela vyn — en oppen panel, en pagaende
  // redigering, allt. Live-vagen och hamtningen far bara byta noder.
  const page = await framsidan(SVAR([givare('ana', 500)], 500));
  await kravRaden(page);
  await vantaPaKort(page);
  await page.evaluate(() => { document.querySelector('.home-welcome').dataset.markor = 'kvar' });
  await page.evaluate(SKICKA(), ['gift', { userId: 'u1', username: 'ana', coins: 100, count: 1 }]);
  await page.waitForTimeout(2500);
  const kvar = await page.evaluate(() =>
    document.querySelector('.home-welcome')?.dataset.markor === 'kvar');
  await page.close();
  assert.equal(kvar, true, 'vyn byggdes om — markören försvann');
});

test('teardown: raden hamtar inget efter utloggning', { skip }, async () => {
  const page = await framsidan(SVAR([givare('ana', 500)], 500));
  await kravRaden(page);
  await vantaPaKort(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vyra-session-ended')));
  const fore = await page.evaluate(() => window.__begarda.length);
  await page.evaluate(() => { view = 'home'; render() });
  await page.waitForSelector('.home-welcome');
  await page.evaluate(SKICKA(), ['gift', { userId: 'u2', username: 'ny', coins: 900, count: 1 }]);
  await page.waitForTimeout(2500);
  const ut = await page.evaluate(RADEN);
  const efter = await page.evaluate(() => window.__begarda.length);
  await page.close();
  assert.equal(efter, fore, 'en hamtning gjordes efter utloggning — föregående kontos siffror kan nå nästa användare');
  assert.equal(ut.kort.length, 0, 'raden ritades efter utloggning');
});
