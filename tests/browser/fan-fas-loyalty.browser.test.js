'use strict';
// Fan Level Up · modell `loyalty` — fyrafaskoreografi. Prov 19a-19g, skrivna FORE koden.
// Fan-serierna: hero 16, stack 17, ribbon 18, loyalty 19. Generella vakter F1-F3 i fan-fas-generella.
//
// PREMISS: "INRINGNINGEN". Premissen star i designens eget animationsnamn — flRingDraw.
// Ringen ar en segmenterad lojalitetsring med en GNISTA i ::after (11x11, box-shadow 22 px
// blur / 8 px spread) uppe till hoger. Gnistan ar barn till det roterande elementet, sa den
// FARDAS ett kvarts varv medan ringen vrids -90deg -> 0. Gnistan ar pennspetsen; ringen ritas.
//     fbProfilePop .4s  @ 0 ms     avataren poppar fram fran scale(.6)
//     flRingDraw   .7s  @ 0 ms     ringen vrids in fran rotate(-90deg) scale(.7)
//     fsPillPop    .4s  @ 300 ms   nivabrickan poppar fram fran scale(.5)
// Avataren anlander, ringen ritas RUNT personen, brickan stamplas som sigill.
//
// FEM MATNINGAR SOM PROVEN AR BYGGDA RUNT (rigg: mat-fan-delar.js, mat-loyaltykurvor.js,
// mat-loyalty-yta.js, mat-loyalty-ring2.js):
//
//   1. LOYALTY HAR INGA INFINITA BASLAGER — andra Fan-modellen efter ribbon. Uppmatt i bada
//      riktningar: fore tandning "inga levande animationer", och tradsvepet efter tandning ger
//      exakt de tre entreerna. `.fan-burst img` bar `fanLevelPop 2s` i berdknad stil men
//      elementet ar display:none, sa animationen existerar inte. Ett tomt fas 3 blir alltsa
//      DOTT i upp till sex sekunder. Modellen far darfor `flPuls` pa .fan-ring. 19g vaktar
//      bada hallen.
//
//   2. ALLA FYRA RORELSER SNAPPAR I ORIGINAL. Uppmatt andel av rorelsen vid halva tiden:
//      avataren 109 %, ringens rotation 68 %, ringens skala 68 %, pillen 109 %. De tva
//      109-varena bar `cubic-bezier(.34,1.56,.64,1)` — exakt samma kurva som snappade stacks
//      fall och ribbons pop, och de hinner forbi sin EGEN overskjutning fore halvtid.
//      Keyframsen ar designens och rors inte — kurvan ar klocka, och den ar var. 19f mater.
//
//   3. RINGEN ROTERAR OCH SKALAR I SAMMA KEYFRAME. m.a ur transformmatrisen blandar ihop dem
//      (m.a = cos(theta) * s), sa provet laser rotationen som atan2(m.b, m.a) och skalan som
//      hypot(m.a, m.b). Ett prov som mater m.a pa ringen mater ingenting begripligt.
//
//   4. RINGEN FAR INTE OVERSKJUTA. Den ar 102x102 i en 80x80-ruta och ligger 3 px ovanfor
//      widgetens overkant redan i vila. Geometrin ar uppmatt: mitten vid y = 48, alltsa blir
//      malad topp 48 - 51*s — scale 1,06 ger -6,1 px och 1,12 ger -9,1 px. Darfor far ringen
//      den studsfria kurvan (.5,.02,.5,.98) och passerar aldrig skala 1. 19f vaktar taket.
//
//   5. RIKTNINGARNA. Avataren ska VAXA in (scale .6 -> 1), ringen ska vridas MEDURS
//      (-90deg -> 0) och brickan ska VAXA (scale .5 -> 1). En koreografi som rakar vanda nagon
//      av dem passerar en ren ordningskontroll — darfor mats startvardena, inte bara tidsfoljden.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64');

function servera() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (rel === 'bild.png') {
      const ms = Number(url.searchParams.get('ms')) || 0;
      if (url.searchParams.get('fel') === '1') {
        setTimeout(() => { res.writeHead(404); res.end('nej') }, ms);
        return;
      }
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
        res.end(PIXEL);
      }, ms);
      return;
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

const MODELL = 'loyalty';
const FASER = ['ljus', 'oppna', 'hyllning', 'upplosning'];
const PLAN = { anticipationMs: 500, enterMs: 900, exitMs: 600 };
// Taktningen inuti fas 2 (900 ms), ur den godkanda fastabellen.
const TAKT = { popTill: 300, ringFran: 200, ringTill: 800,
               textFran: 520, textTill: 860, pillFran: 640, pillTill: 900 };
// Vem ska ateranvanda vilken befintlig keyframe — kontraktet 19g vaktar.
const ATERANVANDS = { '.fan-profile img': 'fbProfilePop', '.fan-ring': 'flRingDraw',
                      '.fan-level-pill': 'fsPillPop' };
/* ALLT som ska vara slackt i fas 1 — inte bara det som ateranvander en keyframe.
   `.fan-profile` ar med for att den ar en EGEN orange sockel med radialgradient och glod, inte
   en osynlig wrapper. Forsta implementationen dolde bara sockelns innehall, och en lysande
   orange skiva stod kvar genom hela anticipationen medan alla tre keyframe-elementen korrekt
   lag pa opacitet 0. Provet var gront; FOTOT avslojade det. Listan ar darfor bredare an
   ATERANVANDS med flit. */
const DOLDA_I_FAS1 = ['.fan-profile', '.fan-profile img', '.fan-ring', '.fan-level-pill'];
const VILOLAGER = { sel: '.fan-ring', namn: 'flPuls' };
const TEXTEN = ['h2', 'h3', 'p'];
const SAKNAS = `Star "${MODELL}" i modelltabellen MODELLER i fan-fas.js?`;

async function studion() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const varningar = [];
  page.on('console', m => { if (m.type() === 'warning') varningar.push(m.text()) });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(3000);
  page._varningar = varningar;
  return page;
}

async function korLoyalty(page, { fanDuration = 2, bildSrc = null, ocksaGifter = false } = {}) {
  return page.evaluate(async (arg) => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:fanlevel:layout:' + arg.modell);
    w.x = 40; w.y = 40; w.fanDuration = arg.fanDuration;
    state.widgets.push(w);
    let gif = null;
    if (arg.ocksaGifter) {
      gif = window.VyraWidgets.create('catalog:gifterlevel:risingtier');
      gif.x = 420; gif.y = 40; gif.gifterDuration = 1;
      state.widgets.push(gif);
    }
    selected = null; render();
    for (let i = 0; i < 90 && !document.querySelector(`[data-id="${w.id}"]`); i++)
      await new Promise(r => requestAnimationFrame(r));
    const box = document.querySelector(`[data-id="${w.id}"]`);
    if (!box) return { fel: arg.modell + ' renderades inte' };

    const bild = box.querySelector('.fan-profile img');
    if (arg.bildSrc) {
      if (!bild) return { fel: 'ingen avatar i .fan-profile' };
      bild.src = arg.bildSrc;
    }

    const logg = [];
    const t0 = performance.now();
    new MutationObserver(muts => {
      for (const m of muts) {
        if (m.attributeName !== 'data-fas') continue;
        const f = box.getAttribute('data-fas');
        if (f) logg.push({ fas: f, vid: Math.round(performance.now() - t0) });
      }
    }).observe(box, { attributes: true, attributeFilter: ['data-fas'] });

    if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
    window.triggerFanLevelUp({ __test: true, name: 'Prov', level: 9, fromLevel: 8 });
    if (gif) window.triggerGifterLevelUp({ __test: true, name: 'GifterProv', level: 12 });

    let gifterVid = null;
    const slut = arg.fanDuration * 1000 + 6000;
    const start = performance.now();
    while (performance.now() - start < slut) {
      if (gif && gifterVid === null) {
        const ge = document.querySelector(`[data-id="${gif.id}"]`);
        if (ge?.className.split(/\s+/).includes('gifter-active'))
          gifterVid = Math.round(performance.now() - t0);
      }
      if (!gif && logg.length >= 4 && performance.now() - t0 > logg[3].vid + 800) break;
      await new Promise(r => setTimeout(r, 25));
    }
    return { fel: null, logg, gifterVid };
  }, { fanDuration, bildSrc, ocksaGifter, modell: MODELL });
}

/* Deterministisk provtagning i fas 2. currentTime raknar in delay, sa samma varde ger samma
   ogonblick for alla de staggrade rorelserna.
   RINGEN roterar OCH skalar i samma keyframe, sa `skala` (m.a) ar meningslos for den —
   `rot` (atan2) och `hypot` laser ut de tva rorelserna var for sig. */
async function provaFas2(page, punkter, { fanDuration = 4 } = {}) {
  return page.evaluate(async (arg) => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:fanlevel:layout:' + arg.modell);
    w.x = 40; w.y = 40; w.fanDuration = arg.fanDuration;
    state.widgets.push(w); selected = null; render();
    for (let i = 0; i < 90 && !document.querySelector(`[data-id="${w.id}"]`); i++)
      await new Promise(r => requestAnimationFrame(r));
    const box = document.querySelector(`[data-id="${w.id}"]`);
    if (!box) return { fel: arg.modell + ' renderades inte' };

    if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
    window.triggerFanLevelUp({ __test: true, name: 'Prov', level: 9, fromLevel: 8 });

    const deadline = performance.now() + 6000;
    while (performance.now() < deadline && box.getAttribute('data-fas') !== 'oppna')
      await new Promise(r => setTimeout(r, 10));
    if (box.getAttribute('data-fas') !== 'oppna')
      return { fel: 'fas 2 ("oppna") kom aldrig inom 6000 ms — sedd fas: ' +
                    JSON.stringify(box.getAttribute('data-fas')) };

    const anims = box.getAnimations({ subtree: true });
    for (const a of anims) a.pause();

    const alla = Object.keys(arg.ateranvands).concat(arg.texten, ['.fan-profile']);
    const las = () => {
      const ut = {};
      for (const sel of alla) {
        const el = box.querySelector(sel);
        if (!el) { ut[sel] = null; continue }
        const cs = getComputedStyle(el);
        const m = new DOMMatrixReadOnly(cs.transform === 'none' ? '' : cs.transform);
        ut[sel] = { ty: +m.f.toFixed(2), skala: +m.a.toFixed(3),
          hypot: +Math.hypot(m.a, m.b).toFixed(3),
          rot: +(Math.atan2(m.b, m.a) * 180 / Math.PI).toFixed(2),
          opacitet: +cs.opacity };
      }
      return ut;
    };

    const matningar = {};
    for (const p of arg.punkter) {
      for (const a of anims) {
        const ti = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
        if (ti.iterations === Infinity) { try { a.currentTime = 0 } catch (e) {} continue }
        try { a.currentTime = p } catch (e) {}
      }
      matningar[p] = las();
    }
    return { fel: null, matningar, antalAnimationer: anims.length };
  }, { punkter, fanDuration, modell: MODELL, ateranvands: ATERANVANDS, texten: TEXTEN });
}

// ---- 19a. Fasordning och langder --------------------------------------------------------------
test(`19a. ${MODELL} kor alla fyra faser i ratt ordning med planerade langder`, { skip }, async () => {
  const page = await studion();
  const r = await korLoyalty(page, { fanDuration: 2 });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.deepEqual(r.logg.map(l => l.fas), FASER,
    `${MODELL} korde faserna ${JSON.stringify(r.logg.map(l => l.fas))} — forvantat ` +
    `${JSON.stringify(FASER)}. ${SAKNAS}`);

  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  const nara = (fick, vantat, vad) => assert.ok(Math.abs(fick - vantat) <= 150,
    `${vad}: ${fick} ms, planerat ~${vantat} ms`);
  nara(vid.ljus, 0, 'ljus startar direkt');
  nara(vid.oppna, PLAN.anticipationMs, 'oppna startar efter anticipationMs');
  nara(vid.hyllning, PLAN.anticipationMs + PLAN.enterMs, 'hyllning startar efter enterMs');
  nara(vid.upplosning, PLAN.anticipationMs + PLAN.enterMs + 2000, 'upplosning startar efter holdMs');
});

// ---- 19b. holdMs kommer fran widgetens fanDuration ---------------------------------------------
test('19b. hyllningsfasen laser fanDuration, inte ett fast varde', { skip }, async () => {
  const page = await studion();
  const r = await korLoyalty(page, { fanDuration: 3 });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  assert.ok(vid.hyllning != null && vid.upplosning != null,
    `hyllning eller upplosning uteblev — faser sedda: ${JSON.stringify(r.logg.map(l => l.fas))}. ${SAKNAS}`);
  const hyllning = vid.upplosning - vid.hyllning;
  assert.ok(Math.abs(hyllning - 3000) <= 250,
    `hyllningen varade ${hyllning} ms — widgetens fanDuration ar 3 s. Laser koreografin ` +
    'fanDuration och inte gifterDuration? (prov 16b finns for exakt den copy-paste-fallan)');
});

// ---- 19c. Kointegration ------------------------------------------------------------------------
test('19c. kon slapper inte fram nasta alert mitt i loyaltys sekvens', { skip }, async () => {
  const page = await studion();
  const r = await korLoyalty(page, { fanDuration: 2, ocksaGifter: true });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  assert.ok(vid.upplosning != null,
    `${MODELL} nadde aldrig upplosningsfasen — faser sedda: ` +
    `${JSON.stringify(r.logg.map(l => l.fas))}. ${SAKNAS}`);
  const sekvensSlut = vid.upplosning + PLAN.exitMs;
  assert.notEqual(r.gifterVid, null, 'Gifter fick aldrig sin tur inom provets tidsfonster');
  assert.ok(r.gifterVid >= sekvensSlut - 200,
    `Gifter tandes vid ${r.gifterVid} ms men ${MODELL}s sekvens var klar forst vid ` +
    `${sekvensSlut} ms. Saknas posten "fan-fas:${MODELL}" i window.VyraFasKoreografi?`);
});

// ---- 19d. Loyalty ar inkopplad, med ratt ankare -------------------------------------------------
test('19d. loyalty star i modelltabellen med avataren som ankare', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async () => {
    const F = window.VyraFanFas;
    if (!F || !Array.isArray(F.modeller)) return { fel: 'VyraFanFas.modeller saknas' };
    return { fel: null, modeller: F.modeller.slice(),
      ankare: typeof F.ankare === 'function' ? F.ankare('loyalty') : undefined,
      tak: typeof F.decodeTak === 'function' ? F.decodeTak('loyalty') : undefined };
  });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.ok(r.modeller.includes(MODELL),
    `"${MODELL}" star inte i VyraFanFas.modeller. Registrerade: ` +
    `${JSON.stringify(r.modeller)}. ${SAKNAS}`);
  // Bursten ar display:none i loyalty (uppmatt 0x0), sa .fan-profile img ar modellens enda
  // bild — och den enda dynamiska. F1 vaktar att den syns, F3 att grinden lyder den.
  assert.equal(r.ankare, '.fan-profile img',
    `loyalty deklarerar decodeAnkare ${JSON.stringify(r.ankare)} — .fan-burst ar display:none ` +
    'har (uppmatt 0x0), sa avataren ar modellens enda bild.');
  assert.equal(r.tak, 900,
    `loyaltys decodeTak ar ${r.tak} ms. Fas 1 ar TOM och avataren poppar fram i fas 2, alltsa ` +
    'avslojas den — och da ar 500 mot en ljusfas pa 500 en strukturell no-op.');
});

// ---- 19e. Decode-grinden ------------------------------------------------------------------------
for (const fall of [
  { namn: 'snabb bild (100 ms)', src: '/bild.png?ms=100', minOppna: 400, maxOppna: 800, varning: false },
  { namn: 'langsam men inom taket (700 ms)', src: '/bild.png?ms=700', minOppna: 550, maxOppna: 1000, varning: false },
  { namn: 'for sen bild (1100 ms, over taket 900 ms)', src: '/bild.png?ms=1100', minOppna: 800, maxOppna: 1300, varning: true },
  { namn: 'bilden fallerar (404)', src: '/bild.png?ms=50&fel=1', minOppna: 400, maxOppna: 1000, varning: true },
]) {
  test(`19e. decode-grind pa ${MODELL} — ${fall.namn}`, { skip }, async () => {
    const page = await studion();
    const r = await korLoyalty(page, { fanDuration: 1, bildSrc: fall.src });
    const varningar = page._varningar.filter(v => /VyraFas/.test(v));
    await page.close();

    assert.equal(r.fel, null, r.fel);
    assert.deepEqual(r.logg.map(l => l.fas), FASER,
      `sekvensen brots vid "${fall.namn}": ${JSON.stringify(r.logg.map(l => l.fas))}. ${SAKNAS}`);
    const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
    assert.ok(vid.oppna >= fall.minOppna,
      `oppna startade vid ${vid.oppna} ms — fore uppbyggnaden var klar`);
    assert.ok(vid.oppna <= fall.maxOppna,
      `oppna startade forst vid ${vid.oppna} ms — grinden holl kvar for lange`);
    if (fall.varning) {
      assert.ok(varningar.length > 0,
        'ingen console.warn loggades trots att bilden aldrig blev avkodad i tid');
    }
  });
}

// ---- 19f. PREMISSVAKTEN · "Inringningen" -------------------------------------------------------
// AVATAR -> RING -> BRICKA, med RIKTNINGARNA matta och inte bara ordningen:
//   1. Vid 1 ms startar var och en pa SITT eget startvarde (.6 / -90deg+.7 / .5).
//   2. Vid 150 ms vaxer avataren annu och ringen ar orord (den borjar vid 200 ms).
//   3. Vid 300 ms har avataren landat och ringen ar mitt i vridningen.
//   4. Vid 630 ms ar brickan annu orord; vid 800 ms ar ringen framme och brickan pa vag.
//   5. Vid fasens slut ar allt framme och ringen star rakt.
//   6. RINGEN OVERSKJUTER ALDRIG skala 1 — geometrin talar inte det (48 - 51*s).
//   7. Halva rorelsen vid halva tiden for alla fyra.
test('19f. loyalty ringar in: avatar -> ring -> bricka, i den ordningen och at ratt hall',
  { skip }, async () => {
    const page = await studion();
    const r = await provaFas2(page, [1, 150, 200, 299, 300, 500, 520, 630, 641, 690, 770,
                                     799, 800, 860, 890, 899]);
    await page.close();

    assert.equal(r.fel, null, r.fel + ` ${SAKNAS}`);
    assert.ok(r.antalAnimationer > 0,
      `inga animationer alls i widgeten under fas 2 — koreografins CSS saknas. ${SAKNAS}`);

    const v = (t) => r.matningar[t];
    for (const sel of Object.keys(ATERANVANDS).concat(TEXTEN))
      assert.ok(v(1)[sel], `delen ${sel} hittades inte i widgeten`);

    // 1. RIKTNINGARNA, fran vars och ens eget startvarde.
    assert.ok(v(1)['.fan-profile img'].hypot < 0.7,
      `avataren startar pa skala ${v(1)['.fan-profile img'].hypot} — fbProfilePop borjar pa ` +
      'scale(.6) och den ska VAXA in, inte krympa fram.');
    assert.ok(v(1)['.fan-ring'].rot < -80,
      `ringen startar pa ${v(1)['.fan-ring'].rot} grader — flRingDraw borjar pa rotate(-90deg) ` +
      'och ska vridas MEDURS upp till 0. En vand ring passerar en ren ordningskontroll.');
    assert.ok(v(1)['.fan-ring'].hypot < 0.75,
      `ringen startar pa skala ${v(1)['.fan-ring'].hypot} — flRingDraw borjar pa scale(.7).`);
    assert.ok(v(1)['.fan-level-pill'].hypot < 0.6,
      `brickan startar pa skala ${v(1)['.fan-level-pill'].hypot} — fsPillPop borjar pa scale(.5).`);

    // 2. Avataren vaxer, ringen vantar, brickan och texten ororda.
    assert.ok(v(150)['.fan-profile img'].hypot > 0.6 && v(150)['.fan-profile img'].hypot < 1,
      `avataren star pa skala ${v(150)['.fan-profile img'].hypot} vid 150 ms — den ska vara ` +
      'mitt i sin pop.');
    assert.ok(v(150)['.fan-ring'].opacitet < 0.05,
      `ringen syns redan vid 150 ms (${v(150)['.fan-ring'].opacitet}) — den ritas forst fran ` +
      `${TAKT.ringFran} ms.`);
    assert.ok(v(150)['.fan-level-pill'].opacitet < 0.05,
      `brickan syns redan vid 150 ms (${v(150)['.fan-level-pill'].opacitet}) — den stamplas ` +
      `forst vid ${TAKT.pillFran} ms.`);
    assert.ok(v(150)['h2'].opacitet < 0.05,
      `texten syns redan vid 150 ms (${v(150)['h2'].opacitet}) — den kommer efter ringen.`);

    // 3. Avataren landad, ringen mitt i vridningen — den ritas RUNT nagon som ar dar.
    assert.ok(Math.abs(v(300)['.fan-profile img'].hypot - 1) <= 0.05,
      `avataren har inte landat vid 300 ms (skala ${v(300)['.fan-profile img'].hypot}) — ` +
      `poppen ska vara klar vid ${TAKT.popTill} ms, sa ringen ritas runt nagon som ar dar.`);
    assert.ok(v(500)['.fan-ring'].rot < -25 && v(500)['.fan-ring'].rot > -65,
      `ringen star pa ${v(500)['.fan-ring'].rot} grader vid 500 ms — halvvags i vridningen ` +
      `${TAKT.ringFran}-${TAKT.ringTill} ms ska den ligga kring -45.`);

    // 4. Brickan sist.
    assert.ok(v(630)['.fan-level-pill'].opacitet < 0.05,
      `brickan har redan borjat vid 630 ms (${v(630)['.fan-level-pill'].opacitet}) — sigillet ` +
      `stamplas ${TAKT.pillFran}-${TAKT.pillTill} ms, efter att ringen slutits.`);
    assert.ok(Math.abs(v(800)['.fan-ring'].rot) <= 3,
      `ringen star pa ${v(800)['.fan-ring'].rot} grader vid 800 ms — den ska vara helt sluten.`);
    assert.ok(v(800)['.fan-level-pill'].opacitet > 0.02,
      `brickan har inte borjat vid 800 ms (${v(800)['.fan-level-pill'].opacitet}).`);
    assert.ok(v(690)['h2'].opacitet > 0.02,
      `texten har inte borjat vid 690 ms (${v(690)['h2'].opacitet}) — den gar ` +
      `${TAKT.textFran}-${TAKT.textTill} ms.`);

    /* 4b. SOCKELN TONAR IN, den slar inte pa. `.fan-profile` ar dold hela fas 1, och fas 1-
       regeln slutar matcha i fas 2:s forsta bildruta — utan en egen intoning star sockeln pa
       full opacitet direkt, alltsa ett hugg precis innan avataren hinner poppa. Inget annat
       prov ser det: fas 1 ar korrekt slackt och fas 2 slutar korrekt pa 1. */
    assert.ok(v(1)['.fan-profile'].opacitet < 0.15,
      `sockeln .fan-profile star pa opacitet ${v(1)['.fan-profile'].opacitet} redan vid 1 ms i ` +
      'fas 2 — den ska TONA in under avatarens pop, inte sla pa i forsta bildrutan.');
    assert.ok(v(150)['.fan-profile'].opacitet > 0.3 && v(150)['.fan-profile'].opacitet < 0.75,
      `sockeln star pa opacitet ${v(150)['.fan-profile'].opacitet} vid 150 ms — den ska vara ` +
      'mitt i sin intoning (0-300 ms).');

    // 5. Allt framme.
    const slut = v(899);
    assert.ok(slut['.fan-profile'].opacitet > 0.95,
      `sockeln ar inte framme nar fas 2 tar slut (opacitet ${slut['.fan-profile'].opacitet}).`);
    for (const sel of Object.keys(ATERANVANDS).concat(TEXTEN))
      assert.ok(slut[sel].opacitet > 0.95,
        `${sel} ar inte framme nar fas 2 tar slut (opacitet ${slut[sel].opacitet}).`);
    assert.ok(Math.abs(slut['.fan-ring'].rot) <= 2,
      `ringen slutar pa ${slut['.fan-ring'].rot} grader — den ska sta rakt.`);
    assert.ok(Math.abs(slut['.fan-ring'].hypot - 1) <= 0.02,
      `ringen slutar pa skala ${slut['.fan-ring'].hypot} — den ska vara helt utritad.`);

    /* 6. RINGEN OVERSKJUTER ALDRIG. Uppmatt geometri: ringen ar 102 px hog med mitten vid
       y = 48 i en widget vars overkant ar 0, sa malad topp = 48 - 51*s. Vid skala 1 ligger
       den redan -3 px; vid 1,06 blir det -6,1 och vid 1,12 -9,1. Ringen far darfor den
       studsfria kurvan, och det ar ett TAK och inte en smakfraga. */
    for (const t of [1, 200, 299, 300, 500, 630, 641, 690, 770, 799, 800, 860, 890, 899])
      assert.ok(v(t)['.fan-ring'].hypot <= 1.005,
        `ringen star pa skala ${v(t)['.fan-ring'].hypot} vid ${t} ms — den overskjuter. ` +
        'Ringen ar 102x102 i en 80x80-ruta och maler redan 3 px ovanfor widgeten vid skala 1.');

    /* 7. HALVA RORELSEN VID HALVA TIDEN. Alla fyra snappar i original — uppmatt 109 / 68 / 68 /
       109 %. De tva 109-varena bar `cubic-bezier(.34,1.56,.64,1)`, samma kurva som snappade
       stacks fall och ribbons pop, och hinner forbi sin EGEN overskjutning fore halvtid. */
    const halvAtHalv = (sel, falt, t0, tHalv, tSlut) => {
      const s = v(t0)[sel][falt], h = v(tHalv)[sel][falt], e = v(tSlut)[sel][falt];
      const andel = (s - h) / (s - e);
      assert.ok(andel > 0.35 && andel < 0.65,
        `${sel} (${falt}) har ${(andel * 100).toFixed(0)} % av rorelsen gjord vid halva tiden ` +
        `(${s} -> ${h} -> ${e}). Utanfor 35-65 % snappar den i stallet for att ga.`);
    };
    halvAtHalv('.fan-profile img', 'hypot', 1, 150, 299);
    halvAtHalv('.fan-ring', 'rot', 200, 500, 799);
    halvAtHalv('.fan-ring', 'hypot', 200, 500, 799);
    halvAtHalv('.fan-level-pill', 'hypot', 641, 770, 899);
  });

// ---- 19g. KONTRAKTET: ateranvandning + vilolagret pa RATT stalle -------------------------------
// TVA saker, och den andra ar loyalty-specifik.
//
//   A) Keyframsen ATERANVANDS: fas 2 kor exakt fbProfilePop, flRingDraw och fsPillPop, och
//      fas 1 kor dem inte. Det ar den felplaceringen koreografin finns till for att ratta.
//
//   B) VILOLAGRET LIGGER BARA I HYLLNINGEN. Loyalty ar andra Fan-modellen utan infinita
//      baslager (uppmatt i bada riktningar), sa ett tomt fas 3 blir DOTT, inte aterhallet.
//      Modellen far `flPuls` pa .fan-ring — sigillet fortsatter lysa. Men det maste ligga
//      PRECIS i hyllningen: smyger det in i ljus eller oppna blir entren svajig, och inget
//      annat prov skulle marka det.
test('19g. fas 2 ateranvander keyframsen, och vilolagret finns bara i hyllningen',
  { skip }, async () => {
    const page = await studion();
    const r = await page.evaluate(async ({ modell, ateranvands, vilolager, dolda }) => {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:fanlevel:layout:' + modell);
      w.x = 40; w.y = 40; w.fanDuration = 2;
      state.widgets.push(w); selected = null; render();
      for (let i = 0; i < 90 && !document.querySelector(`[data-id="${w.id}"]`); i++)
        await new Promise(r => requestAnimationFrame(r));
      const box = document.querySelector(`[data-id="${w.id}"]`);
      if (!box) return { fel: modell + ' renderades inte' };

      const prov = {};
      const las = (fas) => {
        const ut = {};
        /* EFFEKTIV synlighet, inte elementets eget varde. Ankaret `.fan-profile img` FAR inte
           slackas direkt — den generella vakten F1 mater dess egna beraknade opacitet mitt i
           fas 1, och ett ankare pa 0 ar inget ankare (samma lax som Gifters G1). Sockeln
           slacks i stallet, och avataren arver nollan. Ett prov som laste elementets eget
           varde hade darfor krävt precis det som F1 forbjuder. */
        const effektiv = (el) => {
          let o = 1;
          /* TVA SAKER SOM BADA GJORDE DEN HAR VAKTEN TANDLOS, och bada handlar om att
             widgetrotens EGET tillstand lacker in i matningen:

             1. Vandringen stannar FORE roten. Rotens opacitet ar alertens globala intoning och
                star pa 0 precis vid fasbytet — rakna man in den blir varje matning 0.

             2. INGEN `visibility`-kontroll. `visibility` ARVS, till skillnad fran `opacity` och
                `display`. Roten star pa `visibility:hidden` under hela intoningen, sa varje
                attling rapporterar "hidden" oavsett vad fas-CSS:en gor. Forsta versionen
                returnerade darfor 0 for ALLA element i ALLA lagen, och bade M6 och M7 gick
                igenom med defekten kvar. Uppmatt: `.fan-profile` eget varde 1, direkt barn
                till roten, och anda "effektiv 0".

             `display` ar kvar: det arvs inte, sa det mater elementets egen ruta. */
          for (let n = el; n && n !== box; n = n.parentElement) {
            const cs = getComputedStyle(n);
            if (cs.display === 'none') return 0;
            o *= Number(cs.opacity);
          }
          return +o.toFixed(4);
        };
        for (const sel of Object.keys(ateranvands).concat([vilolager.sel], dolda)) {
          const el = box.querySelector(sel);
          ut[sel] = el
            ? { anim: getComputedStyle(el).animationName, opacitet: effektiv(el) }
            : null;
        }
        prov[fas] = ut;
      };
      new MutationObserver(() => {
        const f = box.getAttribute('data-fas');
        if (f && prov[f] === undefined) las(f);
      }).observe(box, { attributes: true, attributeFilter: ['data-fas'] });

      if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
      window.triggerFanLevelUp({ __test: true, name: 'Prov', level: 9 });

      /* ABSOLUT grans tagen FORE loopen. */
      const deadline = performance.now() + 12000;
      while (performance.now() < deadline && prov.hyllning === undefined)
        await new Promise(r => setTimeout(r, 16));
      return { fel: null, prov };
    }, { modell: MODELL, ateranvands: ATERANVANDS, vilolager: VILOLAGER, dolda: DOLDA_I_FAS1 });
    await page.close();

    assert.equal(r.fel, null, r.fel + ` ${SAKNAS}`);
    for (const fas of ['ljus', 'oppna', 'hyllning'])
      assert.ok(r.prov[fas], `fasen "${fas}" observerades aldrig. ${SAKNAS}`);

    // A) Ateranvandningen.
    for (const [sel, keyframe] of Object.entries(ATERANVANDS)) {
      assert.ok(!new RegExp(keyframe).test(String(r.prov.ljus[sel].anim)),
        `i fas 1 kor ${sel} redan "${r.prov.ljus[sel].anim}". Entreerna spelar i dag under hela ` +
        'anticipationsfasen — det ar den felplaceringen som ska rattas. Vinner ' +
        'neutraliseringen over `.fan-layout-loyalty.fan-active .X` (0,3,0 / 0,3,1)?');
      assert.match(String(r.prov.oppna[sel].anim), new RegExp(keyframe),
        `i fas 2 kor ${sel} "${r.prov.oppna[sel].anim}" i stallet for "${keyframe}". Formen ar ` +
        'redan designad — byt klocka, skriv inte en egen kopia.');
    }

    /* FAS 1 AR EN TOM SCEN — och listan ar BREDARE an keyframe-listan med flit.
       Tva sjalvstandiga fallor bakom den har slingan:
       1. En neutralisering utan `opacity:0` ar ingen neutralisering. Alla tre entreerna bar
          `both`, och det ar FYLLNINGEN som haller elementen dolda fore sin tid — tas bara
          animationen bort slapps de till sitt vilolage, som ar fullt synligt.
       2. `.fan-profile` ar en EGEN orange sockel med radialgradient och glod, inte en osynlig
          wrapper. Doljs bara dess innehall star skivan kvar och lyser genom hela
          anticipationen — med alla keyframe-element korrekt pa opacitet 0. Den defekten var
          gron i provet och syntes forst pa fotot. */
    for (const sel of DOLDA_I_FAS1)
      assert.ok(r.prov.ljus[sel] && r.prov.ljus[sel].opacitet < 0.05,
        `i fas 1 star ${sel} pa opacitet ${r.prov.ljus[sel] && r.prov.ljus[sel].opacitet}. ` +
        'Fas 1 ar en TOM scen. Kolla bada fallorna: racker `animation:none` (nej — `both`-' +
        'fyllningen var det som holl elementet dolt), och ar SOCKELN `.fan-profile` med i ' +
        'neutraliseringen (den har egen bakgrund och glod)?');

    // B) Vilolagret, bada hallen.
    assert.match(String(r.prov.hyllning[VILOLAGER.sel].anim), new RegExp(VILOLAGER.namn),
      `i hyllningen kor ${VILOLAGER.sel} "${r.prov.hyllning[VILOLAGER.sel].anim}" — loyalty har ` +
      'inga infinita baslager, sa utan ett eget vilolager star modellen HELT stilla i upp ' +
      'till sex sekunder. Det ar dott, inte aterhallet.');
    for (const fas of ['ljus', 'oppna'])
      assert.ok(!new RegExp(VILOLAGER.namn).test(String(r.prov[fas][VILOLAGER.sel].anim)),
        `i fas "${fas}" kor ${VILOLAGER.sel} redan "${r.prov[fas][VILOLAGER.sel].anim}". ` +
        'Vilolagret hor hemma i HYLLNINGEN — smyger det in i ljus eller oppna blir entren ' +
        'svajig, och inget annat prov skulle marka det.');
  });
