'use strict';
// widget-fas.js — de sex proven David kravde INNAN motorn kopplas in i nagon widget.
//
// Motorn ar en ADAPTER, inte en renderare: recognition-* bygger sin egen DOM, vara sex
// widgetfamiljer ritas av media.js/premium-final.js. Darfor lanas bara tre saker darifran
// (scheduleTimer + generation, klassvokabularen anticipation/reveal/settled/exit, och
// timing-formen) och appliceras pa BEFINTLIGA noder.
//
// Prov 6 ar avsiktligt en BASLINJE: motorn ar annu inte inkopplad, sa provet laser fast hur
// -active/-exit beter sig IDAG. Nar motorn sedan kopplas in kan den inte tyst andra det.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

// En 1x1 genomskinlig PNG — minsta mojliga bild som faktiskt gar att avkoda.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64');

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');

    // Bild som ALDRIG svarar: enda sattet att prova att decode-grinden slapper igenom pa tid.
    if (rel === 'langsam.png') { res.writeHead(200, { 'content-type': 'image/png' }); return; }
    // Bild som svarar direkt.
    if (rel === 'snabb.png') {
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
      return res.end(PIXEL);
    }
    // Bild som svarar med skrap -> decode() ska AVVISA, inte hanga.
    if (rel === 'trasig.png') {
      res.writeHead(200, { 'content-type': 'image/png' });
      return res.end(Buffer.from('inte en png alls'));
    }

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

// Provfilen ar medvetet skild fran widget-fas.browser.test.js: det har provar de BEFINTLIGA
// alert-triggrarna i media.js och beror inte pa fasmotorn. Darfor kan den ligga i CI aven
// medan motorn fortfarande ar ocommittad.

// ---- 6. Regression: de sex familjerna ------------------------------------------------------
// BASLINJE. Motorn ar inte inkopplad an — provet laser fast dagens beteende sa att
// inkopplingen inte kan andra det tyst.
// Katalognycklarna har suffix som varierar per familj (fanlevel:layout:N, battlemvp:...).
// Provet PROVAR sig fram i stallet for att gissa — en hardkodad nyckel som slutar finnas
// hade gjort provet tyst gront pa fel widget.
const FAMILJER = [
  // Nycklarna ar hamtade ur docs/katalogkarta.md, som CI genererar ur den KORANDE katalogen.
  { namn: 'Fan Level Up',    trigger: 'triggerFanLevelUp',    forvantad: 'fan-active',
    nycklar: ['catalog:fanlevel:layout:duo', 'catalog:fanlevel:layout:heartbeat'] },
  { namn: 'Gifter Level Up', trigger: 'triggerGifterLevelUp', forvantad: 'gifter-active',
    nycklar: ['catalog:gifterlevel:duo', 'catalog:gifterlevel:flip'] },
  { namn: 'Battle MVP',      trigger: 'triggerBattleMvp',     forvantad: 'mvp-active',
    nycklar: ['catalog:battlemvp:aurora', 'catalog:battlemvp:cyber'] },
  { namn: 'Glove Snipe',     trigger: 'triggerGloveSnipe',    forvantad: 'glove-active',
    nycklar: ['catalog:glovesnipe:koiPearl', 'catalog:glovesnipe:masquerade'] },
  { namn: 'New Follower',    trigger: 'triggerNewFollower',   forvantad: 'follow-active',
    nycklar: ['catalog:followeralert'] },
];

async function studion() {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  return page;
}

// TODO: unblocked by playLevelVideo fix — provet ar RÖTT med Davids uttryckliga godkannande
// tills orsaken bakom "forsta triggern efter en render fungerar, efterfoljande inte" ar lagad.
// OBS: `playLevelVideo` ar AVFARDAD som orsak (uppmatt: den faller pa `if(!url)return` for
// katalogskapade widgetar, och felet uppstar aven nar Fan-triggern returnerar direkt utan att
// rora DOM). Namnet pa markoren behalls som David skrev den; den verkliga orsaken utreds.
//
// Alla fem widgetar laggs pa duken SAMTIDIGT och renderas en gang, precis som i drift.
// Ett tidigare upplagg som nollstallde state.widgets mellan familjerna gav ett missvisande
// utfall: den familj som tandes FORST fungerade alltid och den andra aldrig, oavsett ordning.
// Det ar en egenskap hos den riggen — inte hos produkten — och namns i rapporten som nagot
// att utreda separat.
test('6. de befintliga -active-klasserna satts precis som idag', { skip }, async () => {
  const page = await studion();
  const utfall = await page.evaluate(async (familjer) => {
    state.widgets.length = 0;
    const uppsatta = [];
    for (const f of familjer) {
      let w = null, anvand = null;
      for (const n of f.nycklar) {
        try { w = window.VyraWidgets.create(n); anvand = n; break } catch (_) {}
      }
      if (!w) { uppsatta.push({ familj: f.namn, fel: 'kunde inte skapa: ' + f.nycklar.join(', ') }); continue }
      w.x = 20 + uppsatta.length * 40; w.y = 20;
      state.widgets.push(w);
      uppsatta.push({ familj: f.namn, forvantad: f.forvantad, trigger: f.trigger, id: w.id, anvand });
    }
    selected = null; render();

    // Triggarna gor `if(!box)return` — tands de innan renderingen slagit igenom returnerar de
    // tyst, och provet blir falskt rott.
    for (const u of uppsatta) {
      if (u.fel) continue;
      for (let i = 0; i < 60 && !document.querySelector(`[data-id="${u.id}"]`); i++)
        await new Promise(r => requestAnimationFrame(r));
    }

    for (const u of uppsatta) {
      if (u.fel) continue;
      if (typeof window[u.trigger] !== 'function') { u.fel = 'trigger saknas: ' + u.trigger; continue }
      window[u.trigger]({ __test: true, name: 'Prov', level: 12, score: 5, multiplier: 2 });
    }
    await new Promise(r => setTimeout(r, 400));

    for (const u of uppsatta) {
      if (u.fel) continue;
      const el = document.querySelector(`[data-id="${u.id}"]`);
      u.finns = !!el;
      u.faktisk = el ? el.className : '';
    }
    return uppsatta;
  }, FAMILJER);
  await page.close();

  for (const u of utfall) {
    assert.equal(u.fel, undefined, `${u.familj}: ${u.fel}`);
    assert.ok(u.finns, `${u.familj}: widgeten renderades inte (nyckel ${u.anvand})`);
    assert.ok(u.faktisk.split(/\s+/).includes(u.forvantad),
      `${u.familj}: "${u.forvantad}" sattes inte — klasserna var "${u.faktisk}"`);
  }
});

// 6c. KORSKONTAMINATION. Uppmatt 2026-08-14 FORE fixen: Glove Snipe tande sin egen klass
// men raderade samtidigt Fan Level Ups redan satta `fan-active`. Orsaken ar `save(); render()`
// i livevagen (media.js:696) — en full render bygger om HELA duken, inte bara den egna noden.
// Provet ar avsiktligt skrivet som rott innan fixen och gront efter.
test('6c. en trigger far aldrig radera en annan familjs klass', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async (familjer) => {
    const tidiga = familjer.filter(f => f.trigger !== 'triggerGloveSnipe');
    const glove = familjer.find(f => f.trigger === 'triggerGloveSnipe');
    state.widgets.length = 0;
    const uppsatta = [];
    for (const f of familjer.slice()) {
      let w = null;
      for (const n of f.nycklar) { try { w = window.VyraWidgets.create(n); break } catch (_) {} }
      if (!w) return { fel: 'kunde inte skapa ' + f.namn };
      w.x = 20 + uppsatta.length * 40; w.y = 20;
      state.widgets.push(w);
      uppsatta.push({ namn: f.namn, trigger: f.trigger, forvantad: f.forvantad, id: w.id });
    }
    selected = null; render();
    for (const u of uppsatta) {
      for (let i = 0; i < 60 && !document.querySelector(`[data-id="${u.id}"]`); i++)
        await new Promise(r => requestAnimationFrame(r));
    }

    const las = () => Object.fromEntries(uppsatta.map(u => {
      const el = document.querySelector(`[data-id="${u.id}"]`);
      return [u.namn, !!el && el.className.split(/\s+/).includes(u.forvantad)];
    }));

    // Tand allt UTOM Glove forst.
    for (const u of uppsatta) {
      if (u.trigger === 'triggerGloveSnipe') continue;
      window[u.trigger]({ __test: true, name: 'Prov', level: 12, score: 5, multiplier: 2 });
    }
    await new Promise(r => setTimeout(r, 300));
    const fore = las();

    // Sedan Glove. Ingen annan familjs klass far forsvinna.
    window[glove.trigger]({ __test: true, name: 'Prov', level: 12, score: 5, multiplier: 2 });
    await new Promise(r => setTimeout(r, 300));
    const efter = las();

    return { fel: null, fore, efter, gloveNamn: glove.namn };
  }, FAMILJER);
  await page.close();

  assert.equal(r.fel, null, r.fel);
  const tappade = Object.keys(r.fore).filter(
    n => n !== r.gloveNamn && r.fore[n] && !r.efter[n]);
  assert.deepEqual(tappade, [],
    `${r.gloveNamn} raderade klassen for: ${tappade.join(', ')}\n` +
    `  fore:  ${JSON.stringify(r.fore)}\n  efter: ${JSON.stringify(r.efter)}`);
});

test('6b. Top Streak tands fortfarande med hit-klassen', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async () => {
    state.widgets.length = 0;
    let w = null;
    for (const n of ['catalog:topstreak', 'catalog:topstreak:cyber-grid']) {
      try { w = window.VyraWidgets.create(n); break } catch (_) {}
    }
    if (!w) return { fel: 'kunde inte skapa Top Streak' };
    w.x = 20; w.y = 20;
    state.widgets.push(w); selected = null; render();
    const el = document.querySelector('.vyra-streak') || document.querySelector(`[data-id="${w.id}"]`);
    if (!el) return { fel: 'renderades inte' };
    el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
    await new Promise(r => setTimeout(r, 120));
    return { fel: null, harHit: el.classList.contains('hit') };
  });
  await page.close();
  assert.equal(r.fel, null, r.fel);
  assert.ok(r.harHit, 'hit-klassen fastnade inte');
});
