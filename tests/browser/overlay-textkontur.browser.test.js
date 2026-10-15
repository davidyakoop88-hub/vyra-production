'use strict';
// TEXTKONTUR I OVERLAY-UTGÅNGEN (overlay-textkontur.js).
//
// Kravet: användarnamn och siffror ligger över streamarens kamera eller spel och ska gå att läsa
// mot BÅDE vit och svart bakgrund. Uppmätt 2026-10-15: Battle MVP Auroras namn var vitt med en
// ensam mjuk skugga (0 1px 4px) och nästan osynligt mot ljus bakgrund.
//
// Tre påståenden:
//   1. I overlay-läget får namnet en tät kontur, och designens egen skugga ligger kvar efter den.
//   2. I studion rörs ingenting — samma widget, samma skugga som stilmallen ger.
//   3. En design som uttryckligen släckt skuggan (`none !important`, ranking-sixpack.css #604,
//      siffror på egna plattor) får behålla det.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4', '.webm': 'video/webm' };

function servera() {
  const server = http.createServer((req, res) => {
    const fil = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''));
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

let server, browser, bas;
const skip = hoppaOver();

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

async function oppna(url) {
  const sida = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await sida.goto(`${bas}/${url}`, { waitUntil: 'load' });
  await sida.waitForFunction(() => !!window.VyraWidgets && typeof window.render === 'function',
    null, { timeout: 30000, polling: 100 });
  await sida.waitForTimeout(3000);
  return sida;
}

// Bygger widgeten, utlöser larmet och läser namnet medan det syns.
async function battleMvpNamn(sida) {
  return sida.evaluate(async () => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:battlemvp:aurora');
    w.x = 40; w.y = 30; state.widgets.push(w); selected = null; render();
    await new Promise(r => setTimeout(r, 400));
    window.triggerBattleMvp({ username: '@Kontur', __test: true });
    const t0 = Date.now();
    let h;
    while (Date.now() - t0 < 6000) {
      h = document.querySelector('.battle-mvp h2');
      if (h && h.textContent.includes('@Kontur') && h.dataset.vyraKontur) break;
      await new Promise(r => setTimeout(r, 100));
    }
    h = document.querySelector('.battle-mvp h2');
    return { txt: h && h.textContent, skugga: h && getComputedStyle(h).textShadow,
             flagga: h && h.dataset.vyraKontur || null,
             laddad: !!window.VyraTextKontur };
  });
}

test('overlay: Battle MVP-namnet får en tät kontur och behåller sin egen skugga', { skip }, async () => {
  const sida = await oppna('studio.html?overlay=1');
  const m = await battleMvpNamn(sida);
  await sida.close();
  assert.ok(m.laddad, 'overlay-textkontur.js laddades inte — saknas raden i media.js skript-svans?');
  assert.equal(m.txt, '@Kontur');
  assert.equal(m.flagga, '1', `namnet fick ingen kontur: ${m.skugga}`);
  // Fyra täta skuggor (blur 0) åt fyra håll = konturen.
  const tata = (m.skugga.match(/-?[\d.]+px -?[\d.]+px 0px/g) || []).length;
  assert.ok(tata >= 4, `väntade minst fyra täta skuggor, fick: ${m.skugga}`);
  assert.match(m.skugga, /0px 1px 4px$/, `designens egen skugga ska ligga kvar sist: ${m.skugga}`);
});

test('studio: samma widget rörs inte', { skip }, async () => {
  const sida = await oppna('studio.html');
  const m = await sida.evaluate(async () => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:battlemvp:aurora');
    w.x = 40; w.y = 30; state.widgets.push(w); selected = null; render();
    await new Promise(r => setTimeout(r, 400));
    // Utlös larmet även här, så att namnet faktiskt finns att jämföra.
    window.triggerBattleMvp({ username: '@Kontur', __test: true });
    await new Promise(r => setTimeout(r, 2500));
    const h = document.querySelector('.battle-mvp h2');
    return { overlay: document.documentElement.classList.contains('overlay-output'),
             flaggor: document.querySelectorAll('[data-vyra-kontur]').length,
             inline: h ? h.style.textShadow : null };
  });
  await sida.close();
  assert.equal(m.overlay, false, 'kontrollmätning: sidan ska vara i studioläge');
  assert.equal(m.flaggor, 0, 'studion fick konturer — ska bara ske i overlay-utgången');
  assert.ok(!m.inline, `studions namn fick en inline-skugga: ${m.inline}`);
});

test('overlay: `text-shadow: none !important` i designen respekteras', { skip }, async () => {
  const sida = await oppna('studio.html?overlay=1');
  const m = await sida.evaluate(async () => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:ranking:templateTopCoins:basic-v2');
    w.x = 40; w.y = 30; state.widgets.push(w); selected = null; render();
    await new Promise(r => setTimeout(r, 1200));
    const em = document.querySelector('.rk6 .toplike-row > em');
    return em && { skugga: getComputedStyle(em).textShadow, flagga: em.dataset.vyraKontur || null,
                   inline: em.style.textShadow };
  });
  await sida.close();
  assert.ok(m, 'kontrollmätning: rk6-raden renderades inte');
  assert.equal(m.skugga, 'none');
  assert.equal(m.flagga, null, 'flaggan sattes fast konturen aldrig slog igenom');
  assert.equal(m.inline, '', 'en verkningslös inline-skugga lämnades kvar');
});

test('kontrastkvoten räknas som WCAG', { skip }, async () => {
  const sida = await oppna('studio.html?overlay=1');
  const k = await sida.evaluate(() => [
    window.VyraTextKontur.kvot([255, 255, 255], [0, 0, 0]),
    window.VyraTextKontur.kvot([255, 255, 255], [255, 255, 255]),
  ]);
  await sida.close();
  assert.equal(Math.round(k[0]), 21);
  assert.equal(k[1], 1);
});
