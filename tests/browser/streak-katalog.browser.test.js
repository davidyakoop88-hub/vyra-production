'use strict';
// Top Streak · katalogen ska bara ALLA val samtidigt.
//
// ORSAKEN, uppmatt 2026-08-13 i overlay-vyn: `.streak-template-section` fanns, hade 5644 tecken
// innehall och `dataset.styles="1"` — men noll av media.js knappar. Ett manuellt `bind()`
// andrade ingenting.
//
//   1. media.js:121 kor forst, satter dataset.styles='1' och bygger 7 klassiska stilar + 8 ramar
//   2. premium-final.js:68 kor EFTER och gor `streak.innerHTML = '<h4>…PREMIUM</h4>…'`
//      — vilket RADERAR allt media.js just byggde
//   3. media.js-flaggan star kvar, sa blocket bygger aldrig om. Permanent.
//
// Foljden: 15 val som finns i koden men inte gar att valja. Inte bara de atta ramarna — aven de
// sju klassiska stilarna. Samma familj som `.resize-handle` hade (media.js:128): tva byggare om
// samma yta dar laddningsordningen avgor i stallet for ett uttalat agarskap.
//
// FIXEN ror bara premium-final.js: den lagger till sin sektion i stallet for att ersatta.
// Registret och renderaren ar ororda — de fungerade redan, vilket det har provet ocksa visar
// genom att alla atta ramar gar att skapa och rendera.
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

const RAMAR = ['amethyst-heart', 'crystal-spire', 'crystal-tiara', 'gold-wings',
               'luna-stars', 'rose-heart', 'star-crown', 'violet-wings'];

async function katalogen() {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=overlay`, { waitUntil: 'load' });
  await page.waitForTimeout(5000);
  const m = await page.evaluate(() => {
    const s = document.querySelector('.streak-template-section');
    return {
      sektion: !!s,
      rubriker: s ? [...s.querySelectorAll('h4')].map(h => h.textContent.trim()) : [],
      stilar: document.querySelectorAll('[data-streak-style]').length,
      ramar: [...document.querySelectorAll('[data-streak-frame]')].map(b => b.dataset.streakFrame).sort(),
      premium: document.querySelectorAll('[data-pf-streak]').length
    };
  });
  await page.close();
  return m;
}

test('katalogen visar bada rubrikerna, REDIGERBARA och PREMIUM', { skip }, async () => {
  const m = await katalogen();
  assert.ok(m.sektion, '.streak-template-section saknas i overlay-vyn');
  const text = m.rubriker.join(' | ').toUpperCase();
  assert.match(text, /REDIGERBARA/, `rubrikerna ar: ${m.rubriker.join(' | ') || '(inga)'}`);
  assert.match(text, /PREMIUM/, `rubrikerna ar: ${m.rubriker.join(' | ') || '(inga)'}`);
});

test('de sju klassiska stilarna gar att valja', { skip }, async () => {
  const m = await katalogen();
  assert.equal(m.stilar, 7,
    `hittade ${m.stilar} klassiska stilknappar — premium-final.js raderar media.js sektion`);
});

test('alla atta ramar gar att valja', { skip }, async () => {
  const m = await katalogen();
  assert.deepEqual(m.ramar, [...RAMAR].sort(),
    `hittade ${m.ramar.length} ramknappar: ${m.ramar.join(', ') || '(inga)'}`);
});

test('alla 22 Top Streak-val syns samtidigt', { skip }, async () => {
  const m = await katalogen();
  const summa = m.stilar + m.ramar.length + m.premium;
  assert.equal(summa, 22,
    `hittade ${summa} val (${m.stilar} klassiska + ${m.ramar.length} ramar + ${m.premium} premium) `
    + '— kravet ar 7 + 8 + 7');
});

test('premiumdesignerna finns kvar', { skip }, async () => {
  const m = await katalogen();
  assert.ok(m.premium >= 7, `hittade ${m.premium} premiumknappar, forvantade minst 7`);
});

// ---- Davids ovriga krav ------------------------------------------------------------------
async function ram(fid) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  const m = await page.evaluate(f => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:topstreak:frame:' + f);
    w.x = 30; w.y = 40; state.widgets.push(w); selected = null; render();
    const el = document.querySelector('.vyra-streak');
    if (!el) return { fel: 'widgeten renderades inte' };
    el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
    const konst = el.querySelector('.sframe-art');
    const fram = el.querySelector('.streak-profile-face'), gift = el.querySelector('.streak-gift-face');
    return { klass: el.className, konstSrc: konst ? konst.getAttribute('src') : null,
      text: (el.textContent || '').trim().replace(/\s+/g, ' '),
      framIter: fram ? getComputedStyle(fram).animationIterationCount : null,
      giftIter: gift ? getComputedStyle(gift).animationIterationCount : null,
      giftTransformViktig: gift ? getComputedStyle(gift).transform : null };
  }, fid);
  await page.waitForTimeout(600);
  const konstLaddad = await page.evaluate(() => {
    const i = document.querySelector('.sframe-art');
    return !!i && i.complete && i.naturalWidth > 0;
  });
  await page.close();
  return { ...m, konstLaddad };
}

for (const fid of RAMAR) {
  test(`ram ${fid}: renderar med sin konst`, { skip }, async () => {
    const m = await ram(fid);
    assert.ok(!m.fel, m.fel);
    assert.match(m.klass, /streak-framed/, `klasserna ar "${m.klass}"`);
    assert.equal(m.konstSrc, `assets/topstreak-frames/${fid}.png`);
    assert.ok(m.konstLaddad, `${fid}.png laddade inte`);
  });

  test(`ram ${fid}: flippen loopar oandligt`, { skip }, async () => {
    const m = await ram(fid);
    assert.equal(m.framIter, 'infinite', 'profilsidan loopar inte');
    assert.equal(m.giftIter, 'infinite', 'gavosidan loopar inte');
  });

  test(`ram ${fid}: visar streak, aldrig coins`, { skip }, async () => {
    const m = await ram(fid);
    assert.match(m.text, /×\d+|x\d+/i, `hittade ingen streak-siffra i "${m.text}"`);
    assert.ok(!/coin|diamond|◉/i.test(m.text), `giftdata syns i texten: "${m.text}"`);
  });
}
