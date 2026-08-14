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

/* ---- 6. ALERTKON ------------------------------------------------------------------------
   Provet ar OMSKRIVET 2026-08-14. Den forsta versionen tande fem alerts och forvantade sig
   fem samtidiga -active-klasser. Den premissen motsade produktens design och gav mig tva
   felaktiga slutsatser ("tre av fem satter aldrig sin klass", "en tidigare trigger forgiftar
   senare"). Bada var matfel: jag lasde av 150-400 ms in i en ko som serialiserar 6-8 sekunder.

   DET VERKLIGA KONTRAKTET, uppmatt i runtime-controls.js:14-52:
   `installQueueWrappers()` (500 ms, 2200 ms och pa `load`) byter ut triggrarna mot koade
   varianter. Kon spelar EN alert i taget och haller nasta i max(800, duration) ms:
     triggerBattleMvp 8000/prio 10 · triggerGifterLevelUp 6000/8 · triggerFanLevelUp 6000/7
     triggerNewFollower 5000/3 · triggerGiftFireworks 6000/6
   triggerGloveSnipe SAKNAS i configs och koas alltsa inte — darfor kunde den tanda mitt under
   en annan alert. Provet asserterar INTE att Glove tander direkt, sa det forblir gront nar
   Glove laggs i kon.

   Visningstiderna kortas till 1 s per widget sa sviten inte tar en minut: wrappern raknar ut
   sin duration ur widgetens egen `fanDuration`/`gifterDuration`/`mvpDuration`. */
test('6. alertkon serialiserar, tappar ingenting och varje familj far sin klass', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async (familjer) => {
    state.widgets.length = 0;
    const uppsatta = [];
    for (const f of familjer) {
      let w = null;
      for (const n of f.nycklar) { try { w = window.VyraWidgets.create(n); break } catch (_) {} }
      if (!w) return { fel: 'kunde inte skapa ' + f.namn };
      w.x = 20 + uppsatta.length * 40; w.y = 20;
      // Kort visningstid -> kon dranerar snabbt. Wrappern laser dessa faltet.
      w.fanDuration = 1; w.gifterDuration = 1; w.mvpDuration = 1;
      state.widgets.push(w);
      uppsatta.push({ namn: f.namn, trigger: f.trigger, forvantad: f.forvantad, id: w.id, sedd: false });
    }
    selected = null; render();
    for (const u of uppsatta) {
      for (let i = 0; i < 60 && !document.querySelector(`[data-id="${u.id}"]`); i++)
        await new Promise(r => requestAnimationFrame(r));
    }

    if (!window.VyraAlertQueue) return { fel: 'VyraAlertQueue saknas — kon installerades aldrig' };
    window.VyraAlertQueue.clear();

    for (const u of uppsatta) {
      if (typeof window[u.trigger] !== 'function') return { fel: 'trigger saknas: ' + u.trigger };
      window[u.trigger]({ __test: true, name: 'Prov', level: 12, score: 5, multiplier: 2 });
    }
    const direkt = window.VyraAlertQueue.stats();

    // Polla tills alla setts tanda minst en gang, eller tills tiden gar ut.
    const start = Date.now();
    while (Date.now() - start < 25000 && uppsatta.some(u => !u.sedd)) {
      for (const u of uppsatta) {
        if (u.sedd) continue;
        const el = document.querySelector(`[data-id="${u.id}"]`);
        if (el && el.className.split(/\s+/).includes(u.forvantad)) u.sedd = true;
      }
      await new Promise(r => setTimeout(r, 60));
    }
    return { fel: null, direkt, slut: window.VyraAlertQueue.stats(),
             resultat: uppsatta.map(u => ({ namn: u.namn, sedd: u.sedd })),
             vantetid: Date.now() - start };
  }, FAMILJER);
  await page.close();

  assert.equal(r.fel, null, r.fel);

  // 1. Ingenting far tappas. `kastade` raknar alerts kon slangt pa tak eller alder.
  assert.equal(r.direkt.kastade, 0, `kon kastade ${r.direkt.kastade} alerts direkt vid tandning`);
  assert.equal(r.slut.kastade, 0, `kon kastade ${r.slut.kastade} alerts under korningen`);

  // 2. Alerts ska SERIALISERAS, inte spelas samtidigt: nagot spelar och nagot star och vantar.
  assert.ok(r.direkt.spelar, 'ingen alert borjade spela — kon startade aldrig');
  assert.ok(r.direkt.vantande >= 1,
    `inget hamnade i kon (vantande=${r.direkt.vantande}) — alerts spelades samtidigt`);

  // 3. Var och en ska till slut fa sin klass.
  const uteblivna = r.resultat.filter(x => !x.sedd).map(x => x.namn);
  assert.deepEqual(uteblivna, [],
    `dessa fick aldrig sin klass inom ${Math.round(r.vantetid / 1000)} s: ${uteblivna.join(', ')}`);

  // 4. Kon ska vara tom nar allt spelat klart.
  assert.equal(r.slut.vantande, 0, 'alerts ligger kvar i kon efter att alla setts');
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
