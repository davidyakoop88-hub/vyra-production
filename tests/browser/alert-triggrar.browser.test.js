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
      w.fanDuration = 1; w.gifterDuration = 1; w.mvpDuration = 1; w.gloveDuration = 1;
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

/* ---- 6d. GLOVE SNIPE OCH KON -------------------------------------------------------------
   BASLINJE, rod fore fixen. Uppmatt 2026-08-14: `triggerGloveSnipe` saknas i
   runtime-controls `configs`, sa den koas inte. Den tander direkt — aven mitt under en
   pagaende alert. Det var det som gjorde korskontaminationen synlig (den byggde om hela
   duken med render() medan Fan spelade), och det blir mycket mer stotande nar Fan/Gifter/MVP
   far fyrafaskoreografi: en Glove kan da klippa rakt in i hyllningsfasen.

   Provet tander Fan forst (som ar koad och borjar spela), och sedan Glove. Glove ska DA sta
   i kon, inte tanda. */
test('6d. Glove Snipe respekterar alertkon', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async () => {
    state.widgets.length = 0;
    const fan = window.VyraWidgets.create('catalog:fanlevel:layout:duo');
    fan.x = 20; fan.y = 20; fan.fanDuration = 3;
    const glove = window.VyraWidgets.create('catalog:glovesnipe:koiPearl');
    glove.x = 320; glove.y = 20;
    state.widgets.push(fan, glove);
    selected = null; render();
    for (let i = 0; i < 60 && !document.querySelector(`[data-id="${glove.id}"]`); i++)
      await new Promise(r => requestAnimationFrame(r));
    if (!window.VyraAlertQueue) return { fel: 'VyraAlertQueue saknas' };
    window.VyraAlertQueue.clear();

    window.triggerFanLevelUp({ __test: true, name: 'Prov', level: 12 });
    await new Promise(r => setTimeout(r, 120));          // Fan har hunnit borja spela
    const fanSpelar = !!document.querySelector(`[data-id="${fan.id}"]`)
      ?.className.split(/\s+/).includes('fan-active');

    window.triggerGloveSnipe({ __test: true, multiplier: 3 });
    await new Promise(r => setTimeout(r, 120));
    const gloveEl = document.querySelector(`[data-id="${glove.id}"]`);
    const gloveTandeDirekt = !!gloveEl?.className.split(/\s+/).includes('glove-active');
    const ko = window.VyraAlertQueue.stats();

    // Vanta ut Fan och kontrollera att Glove till slut far sin tur.
    let gloveSedd = gloveTandeDirekt;
    const start = Date.now();
    while (Date.now() - start < 15000 && !gloveSedd) {
      const el = document.querySelector(`[data-id="${glove.id}"]`);
      if (el?.className.split(/\s+/).includes('glove-active')) gloveSedd = true;
      await new Promise(r => setTimeout(r, 60));
    }
    return { fel: null, fanSpelar, gloveTandeDirekt, ko, gloveSedd };
  });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.ok(r.fanSpelar, 'Fan borjade aldrig spela — provet mater fel sak');
  assert.equal(r.gloveTandeDirekt, false,
    'Glove tande mitt under en pagaende alert i stallet for att sta i kon ' +
    `(kostatus: ${JSON.stringify(r.ko)})`);
  assert.ok(r.gloveSedd, 'Glove fick aldrig sin tur — den tappades i stallet for att koas');
});

/* ---- 6e. ANVANDARENS VISNINGSTID ----------------------------------------------------------
   Vakten mot exakt den bugg som undveks nar Glove lades i kon. De ovriga wrapparna raknar ut
   sin duration ur widgetens EGET falt (`state.widgets.find(...)?.mvpDuration||7`). Skrivs
   Glove in med ett fast 6000 slapper kon vidare efter 6 s aven om anvandaren stallt 12 —
   alerten skulle da klippas av nasta. Provet later Glove spela med gloveDuration 12 och
   kontrollerar att nasta alert far vanta pa den, inte pa ett hardkodat varde. */
test('6e. kon respekterar anvandarens gloveDuration, inte ett fast varde', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async () => {
    state.widgets.length = 0;
    const glove = window.VyraWidgets.create('catalog:glovesnipe:koiPearl');
    glove.x = 20; glove.y = 20; glove.gloveDuration = 12;       // anvandarens val
    const fan = window.VyraWidgets.create('catalog:fanlevel:layout:duo');
    fan.x = 320; fan.y = 20; fan.fanDuration = 1;
    state.widgets.push(glove, fan);
    selected = null; render();
    for (let i = 0; i < 60 && !document.querySelector(`[data-id="${fan.id}"]`); i++)
      await new Promise(r => requestAnimationFrame(r));
    if (!window.VyraAlertQueue) return { fel: 'VyraAlertQueue saknas' };
    window.VyraAlertQueue.clear();

    const t0 = performance.now();
    window.triggerGloveSnipe({ __test: true, multiplier: 3 });
    window.triggerFanLevelUp({ __test: true, name: 'Prov', level: 12 });

    let fanVid = null;
    while (performance.now() - t0 < 20000 && fanVid === null) {
      const el = document.querySelector(`[data-id="${fan.id}"]`);
      if (el?.className.split(/\s+/).includes('fan-active')) fanVid = performance.now() - t0;
      await new Promise(r => setTimeout(r, 60));
    }
    return { fel: null, fanVid: fanVid === null ? null : Math.round(fanVid) };
  });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.notEqual(r.fanVid, null, 'Fan fick aldrig sin tur inom 20 s');
  assert.ok(r.fanVid >= 10000,
    `nasta alert slapptes fram efter ${r.fanVid} ms — kon anvander inte widgetens ` +
    `gloveDuration (12 s) utan ett kortare, troligen hardkodat varde`);
  assert.ok(r.fanVid <= 16000,
    `nasta alert vantade ${r.fanVid} ms — langre an de 12 s anvandaren stallt in`);
});

/* ---- PUBLICERINGSLISTAN window.VyraFasKoreografi -------------------------------------------
   Kon holl tidigare en alerts lucka i bara dess visningstid. En koreograferad widget ar
   langre an sa: 500 + 900 + hold + 600. Uppmatt fore fixen slapptes nasta alert fram vid
   2036 ms medan Gifters sekvens var klar forst vid 4052 ms — tva sekunders overlapp.

   Kon far INTE kanna till nagra widgettyper. Koreografifilerna publicerar sig sjalva i
   window.VyraFasKoreografi och kon slar upp generiskt. */

// 6f. Koreograferad widget: kon ska halla hela sekvensen, inte bara visningstiden.
test('6f. kon haller hela sekvensen for en koreograferad widget', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async () => {
    state.widgets.length = 0;
    // `duo` valjs medvetet: gifter-fas.js koreograferar bara risingtier, sa den har
    // registreringen ar provets egen och kan inte forvaxlas med produktionens.
    const g = window.VyraWidgets.create('catalog:gifterlevel:duo');
    g.x = 20; g.y = 20; g.gifterDuration = 3;
    const fan = window.VyraWidgets.create('catalog:fanlevel:layout:duo');
    fan.x = 320; fan.y = 20; fan.fanDuration = 1;
    state.widgets.push(g, fan); selected = null; render();
    for (const w of [g, fan])
      for (let i = 0; i < 90 && !document.querySelector(`[data-id="${w.id}"]`); i++)
        await new Promise(r => requestAnimationFrame(r));

    window.VyraFasKoreografi = window.VyraFasKoreografi || [];
    window.VyraFasKoreografi.push({
      passar: w => w.type === 'templateGifterLevel' && (w.gifterLayout || '') === 'duo',
      tider: { anticipationMs: 500, enterMs: 900, exitMs: 600 },
    });

    if (!window.VyraAlertQueue) return { fel: 'VyraAlertQueue saknas' };
    window.VyraAlertQueue.clear();
    const t0 = performance.now();
    window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12 });
    window.triggerFanLevelUp({ __test: true, name: 'FanProv', level: 9 });

    let fanVid = null;
    while (performance.now() - t0 < 12000 && fanVid === null) {
      const el = document.querySelector(`[data-id="${fan.id}"]`);
      if (el?.className.split(/\s+/).includes('fan-active')) fanVid = Math.round(performance.now() - t0);
      await new Promise(r => setTimeout(r, 40));
    }
    return { fel: null, fanVid };
  });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.notEqual(r.fanVid, null, 'Fan fick aldrig sin tur inom 12 s');
  // 3000 hold + 500 + 900 + 600 = 5000 ms. Utan publiceringslistan slapps Fan vid ~3000 ms.
  assert.ok(r.fanVid >= 4600,
    `Fan slapptes fram vid ${r.fanVid} ms — kon raknade bara visningstiden (3000 ms) och ` +
    `inte hela sekvensen (5000 ms)`);
  assert.ok(r.fanVid <= 6200,
    `Fan vantade ${r.fanVid} ms — langre an hela sekvensen pa 5000 ms`);
});

// 6g. Okoreograferad widget: oforandrat beteende. Regressionsvakt.
test('6g. en okoreograferad widget haller kon exakt sin visningstid', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async () => {
    state.widgets.length = 0;
    const f = window.VyraWidgets.create('catalog:followeralert');
    f.x = 20; f.y = 20;
    const fan = window.VyraWidgets.create('catalog:fanlevel:layout:duo');
    fan.x = 320; fan.y = 20; fan.fanDuration = 1;
    state.widgets.push(f, fan); selected = null; render();
    for (const w of [f, fan])
      for (let i = 0; i < 90 && !document.querySelector(`[data-id="${w.id}"]`); i++)
        await new Promise(r => requestAnimationFrame(r));

    if (!window.VyraAlertQueue) return { fel: 'VyraAlertQueue saknas' };
    const registrerade = Array.isArray(window.VyraFasKoreografi) ? window.VyraFasKoreografi.length : 0;
    window.VyraAlertQueue.clear();
    const t0 = performance.now();
    window.triggerNewFollower({ __test: true, name: 'Prov' });
    window.triggerFanLevelUp({ __test: true, name: 'FanProv', level: 9 });

    let fanVid = null;
    while (performance.now() - t0 < 12000 && fanVid === null) {
      const el = document.querySelector(`[data-id="${fan.id}"]`);
      if (el?.className.split(/\s+/).includes('fan-active')) fanVid = Math.round(performance.now() - t0);
      await new Promise(r => setTimeout(r, 40));
    }
    return { fel: null, fanVid, registrerade };
  });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.notEqual(r.fanVid, null, 'Fan fick aldrig sin tur inom 12 s');
  // triggerNewFollower har 5000 ms i configs och ingen matchande koreografi.
  assert.ok(Math.abs(r.fanVid - 5000) <= 700,
    `Fan slapptes fram vid ${r.fanVid} ms — New Follower ar inte koreograferad och luckan ` +
    `ska vara exakt dess 5000 ms (${r.registrerade} koreografier registrerade)`);
});

// 6h. En trasig koreografifil far inte doda alertsystemet.
test('6h. en passar() som kastar stoppar inte kon', { skip }, async () => {
  const page = await studion();
  const varningar = [];
  page.on('console', m => { if (m.type() === 'warning') varningar.push(m.text()) });
  const r = await page.evaluate(async () => {
    state.widgets.length = 0;
    const g = window.VyraWidgets.create('catalog:gifterlevel:duo');
    g.x = 20; g.y = 20; g.gifterDuration = 1;
    const fan = window.VyraWidgets.create('catalog:fanlevel:layout:duo');
    fan.x = 320; fan.y = 20; fan.fanDuration = 1;
    state.widgets.push(g, fan); selected = null; render();
    for (const w of [g, fan])
      for (let i = 0; i < 90 && !document.querySelector(`[data-id="${w.id}"]`); i++)
        await new Promise(r => requestAnimationFrame(r));

    window.VyraFasKoreografi = window.VyraFasKoreografi || [];
    window.VyraFasKoreografi.push({
      passar: () => { throw new Error('boom') },
      tider: { anticipationMs: 500, enterMs: 900, exitMs: 600 },
    });

    if (!window.VyraAlertQueue) return { fel: 'VyraAlertQueue saknas' };
    window.VyraAlertQueue.clear();
    const t0 = performance.now();
    window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12 });
    window.triggerFanLevelUp({ __test: true, name: 'FanProv', level: 9 });

    let fanVid = null;
    while (performance.now() - t0 < 10000 && fanVid === null) {
      const el = document.querySelector(`[data-id="${fan.id}"]`);
      if (el?.className.split(/\s+/).includes('fan-active')) fanVid = Math.round(performance.now() - t0);
      await new Promise(r => setTimeout(r, 40));
    }
    return { fel: null, fanVid, koLever: window.VyraAlertQueue.stats().kastade === 0 };
  });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.notEqual(r.fanVid, null,
    'Fan fick aldrig sin tur — en kastande passar() dodade kon');
  assert.ok(r.koLever, 'kon kastade alerts efter att passar() fallerade');
  // Utan koreografi kvar: luckan ar bara visningstiden, alltso max(800, 1000) ms.
  assert.ok(r.fanVid <= 2500,
    `Fan slapptes fram vid ${r.fanVid} ms — den trasiga koreografin borde ha hoppats over helt`);
  assert.ok(varningar.some(v => /koreografi|passar|VyraFas/i.test(v)),
    'ingen console.warn loggades nar passar() kastade');
});
