'use strict';
// Fan Level Up · modell `ribbon` — fyrafaskoreografi. Prov 18a-18g, skrivna FORE koden.
// Fan-serierna: hero 16, stack 17, ribbon 18. Generella vakter F1-F3 i fan-fas-generella.
//
// PREMISS: "VALKOMNANDET". Dramaturgin ar designens egen — POP -> UTRULLNING -> TEXT:
//     fbProfilePop .4s  @ 0 ms     avataren poppar fram fran scale(.6)
//     frbUnfurl    .5s  @ 150 ms   bandet rullas ut fran scaleX(.3) under den
// Modellen heter Welcome Ribbon och meddelandet ar "TROGEN SUPPORTER" — det ar ett
// valkomnande, inte en ankomst. Personen dyker upp, och ett band rullas ut under dem for att
// namnge dem. Keyframsen ateranvands; bara KLOCKAN byts, som i stack.
//
// FYRA MATNINGAR SOM PROVEN AR BYGGDA RUNT:
//
//   1. RIBBON HAR INGA INFINITA BASLAGER. Uppmatt fore tandning: noll levande animationer.
//      Hero och stack far sin hyllning buren av fanLevelPop och fanRing — ribbon har
//      ingenting, sa ett tomt fas 3 blir DOTT i upp till sex sekunder, inte aterhallet.
//      Modellen far darfor ett eget vilolager, `frbAndas` pa .fan-profile. Prov 18g vaktar
//      att det finns i hyllningen OCH att det inte finns i ljus eller oppna — ett andetag som
//      smyger in i oppningen gor entren svajig utan att nagot annat prov marker det.
//
//   2. BADA KURVORNA SNAPPAR I DAG. `fbProfilePop` bar EXAKT samma
//      `cubic-bezier(.34,1.56,.64,1)` som gjorde att stacks fall avverkade 98,6 % av strackan
//      pa 35,7 % av tiden, och `frbUnfurl` bar `cubic-bezier(.16,1,.3,1)` som ar en kraftig
//      ease-out. Keyframsen ar designens och rors inte — kurvan ar klocka, och den ar var.
//      Prov 18f mater halva rorelsen vid halva tiden for alla tre.
//
//   3. RIKTNINGARNA. Avataren ska VAXA in (scale .6 -> 1) och bandet ska RULLAS UT i sidled
//      (scaleX .3 -> 1). En koreografi som rakar vanda nagon av dem passerar en ren
//      ordningskontroll — darfor mats startvardena, inte bara tidsfoljden.
//
//   4. `.fan-burst img` HAR EN DOD `fanLevelPop`: bursten ar display:none!important i ribbon.
//      Ingen fas-regel far rikta sig mot den — F2 faller annars.
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

const MODELL = 'ribbon';
const FASER = ['ljus', 'oppna', 'hyllning', 'upplosning'];
const PLAN = { anticipationMs: 500, enterMs: 900, exitMs: 600 };
// Taktningen inuti fas 2, ur den godkanda fastabellen.
const TAKT = { popTill: 380, rullFran: 260, rullTill: 660, textFran: 520, textTill: 860 };
// Vem ska ateranvanda vilken befintlig keyframe — kontraktet 18g vaktar.
const ATERANVANDS = { '.fan-profile': 'fbProfilePop', '.fan-ribbon': 'frbUnfurl' };
const VILOLAGER = { sel: '.fan-profile', namn: 'frbAndas' };
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

async function korRibbon(page, { fanDuration = 2, bildSrc = null, ocksaGifter = false } = {}) {
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
   ogonblick for bada de staggrade rorelserna. */
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

    const alla = Object.keys(arg.ateranvands).concat(arg.texten);
    const las = () => {
      const ut = {};
      for (const sel of alla) {
        const el = box.querySelector(sel);
        if (!el) { ut[sel] = null; continue }
        const cs = getComputedStyle(el);
        const m = new DOMMatrixReadOnly(cs.transform === 'none' ? '' : cs.transform);
        ut[sel] = { ty: +m.f.toFixed(2), skala: +m.a.toFixed(3), opacitet: +cs.opacity };
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

// ---- 18a. Fasordning och langder --------------------------------------------------------------
test(`18a. ${MODELL} kor alla fyra faser i ratt ordning med planerade langder`, { skip }, async () => {
  const page = await studion();
  const r = await korRibbon(page, { fanDuration: 2 });
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

// ---- 18b. holdMs kommer fran widgetens fanDuration ---------------------------------------------
test('18b. hyllningsfasen laser fanDuration, inte ett fast varde', { skip }, async () => {
  const page = await studion();
  const r = await korRibbon(page, { fanDuration: 3 });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  assert.ok(vid.hyllning != null && vid.upplosning != null,
    `hyllning eller upplosning uteblev — faser sedda: ${JSON.stringify(r.logg.map(l => l.fas))}. ${SAKNAS}`);
  const hyllning = vid.upplosning - vid.hyllning;
  assert.ok(Math.abs(hyllning - 3000) <= 250,
    `hyllningen varade ${hyllning} ms — widgetens fanDuration ar 3 s.`);
});

// ---- 18c. Kointegration ------------------------------------------------------------------------
test('18c. kon slapper inte fram nasta alert mitt i ribbons sekvens', { skip }, async () => {
  const page = await studion();
  const r = await korRibbon(page, { fanDuration: 2, ocksaGifter: true });
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

// ---- 18d. Ribbon ar inkopplad, med ratt ankare --------------------------------------------------
test('18d. ribbon star i modelltabellen med avataren som ankare', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async () => {
    const F = window.VyraFanFas;
    if (!F || !Array.isArray(F.modeller)) return { fel: 'VyraFanFas.modeller saknas' };
    return { fel: null, modeller: F.modeller.slice(),
      ankare: typeof F.ankare === 'function' ? F.ankare('ribbon') : undefined,
      tak: typeof F.decodeTak === 'function' ? F.decodeTak('ribbon') : undefined };
  });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.ok(r.modeller.includes(MODELL),
    `"${MODELL}" star inte i VyraFanFas.modeller. Registrerade: ` +
    `${JSON.stringify(r.modeller)}. ${SAKNAS}`);
  // Ribbon har VARKEN burst eller nivapill — .fan-profile img ar modellens enda bild, och
  // dessutom den enda dynamiska. F1 vaktar att den syns, F3 att grinden lyder den.
  assert.equal(r.ankare, '.fan-profile img',
    `ribbon deklarerar decodeAnkare ${JSON.stringify(r.ankare)} — modellen har varken ` +
    '.fan-burst eller .fan-level-pill (bada display:none), sa avataren ar dess enda bild.');
  assert.equal(r.tak, 900,
    `ribbons decodeTak ar ${r.tak} ms. Avataren halls MORK i fas 1 och poppar fram i fas 2, ` +
    'alltsa avslojas den — och da ar 500 mot en ljusfas pa 500 en no-op.');
});

// ---- 18e. Decode-grinden ------------------------------------------------------------------------
for (const fall of [
  { namn: 'snabb bild (100 ms)', src: '/bild.png?ms=100', minOppna: 400, maxOppna: 800, varning: false },
  { namn: 'langsam men inom taket (700 ms)', src: '/bild.png?ms=700', minOppna: 550, maxOppna: 1000, varning: false },
  { namn: 'for sen bild (1100 ms, over taket 900 ms)', src: '/bild.png?ms=1100', minOppna: 800, maxOppna: 1300, varning: true },
  { namn: 'bilden fallerar (404)', src: '/bild.png?ms=50&fel=1', minOppna: 400, maxOppna: 1000, varning: true },
]) {
  test(`18e. decode-grind pa ${MODELL} — ${fall.namn}`, { skip }, async () => {
    const page = await studion();
    const r = await korRibbon(page, { fanDuration: 1, bildSrc: fall.src });
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

// ---- 18f. PREMISSVAKTEN · "Valkomnandet" -------------------------------------------------------
// POP -> UTRULLNING -> TEXT, med RIKTNINGARNA matta och inte bara ordningen:
//   1. Vid 150 ms vaxer avataren annu (skala mellan .6 och 1) och bandet ar orort.
//   2. Vid 450 ms har avataren landat och bandet rullas ut (skalaX mellan .3 och 1).
//   3. Vid 700 ms har texten borjat.
//   4. Vid fasens slut ar allt framme.
//   5. Halva rorelsen vid halva tiden for alla tre.
test('18f. ribbon poppar, rullar ut och skriver — i den ordningen och at ratt hall',
  { skip }, async () => {
    const page = await studion();
    const r = await provaFas2(page, [1, 150, 190, 261, 380, 450, 460, 521, 660, 690, 700, 860,
                                     PLAN.enterMs - 10]);
    await page.close();

    assert.equal(r.fel, null, r.fel + ` ${SAKNAS}`);
    assert.ok(r.antalAnimationer > 0,
      `inga animationer alls i widgeten under fas 2 — koreografins CSS saknas. ${SAKNAS}`);

    // RIKTNINGARNA: bada ska VAXA, fran sina egna startvarden.
    const v1 = r.matningar[1];
    for (const sel of Object.keys(ATERANVANDS).concat(TEXTEN))
      assert.ok(v1[sel], `delen ${sel} hittades inte i widgeten`);
    assert.ok(v1['.fan-profile'].skala < 0.7,
      `avataren startar pa skala ${v1['.fan-profile'].skala} — fbProfilePop borjar pa ` +
      'scale(.6) och den ska VAXA in, inte krympa fram.');
    assert.ok(v1['.fan-ribbon'].skala < 0.4,
      `bandet startar pa skalaX ${v1['.fan-ribbon'].skala} — frbUnfurl borjar pa scaleX(.3) ` +
      'och det ska RULLAS UT i sidled.');

    // 1. Avataren vaxer, bandet vantar.
    const v150 = r.matningar[150];
    assert.ok(v150['.fan-profile'].skala > 0.6 && v150['.fan-profile'].skala < 1,
      `avataren star pa skala ${v150['.fan-profile'].skala} vid 150 ms — den ska vara mitt i ` +
      'sin pop.');
    assert.ok(v150['.fan-ribbon'].opacitet < 0.05,
      `bandet syns redan vid 150 ms (${v150['.fan-ribbon'].opacitet}) — det rullas ut forst ` +
      `vid ${TAKT.rullFran} ms.`);
    assert.ok(v150['h2'].opacitet < 0.05,
      `texten syns redan vid 150 ms (${v150['h2'].opacitet}) — den kommer sist.`);

    // 2. Avataren landad, bandet rullas ut.
    const v450 = r.matningar[450];
    assert.ok(Math.abs(v450['.fan-profile'].skala - 1) <= 0.03,
      `avataren har inte landat vid 450 ms (skala ${v450['.fan-profile'].skala}) — poppen ska ` +
      `vara klar vid ${TAKT.popTill} ms.`);
    assert.ok(v450['.fan-ribbon'].skala > 0.3 && v450['.fan-ribbon'].skala < 1,
      `bandet star pa skalaX ${v450['.fan-ribbon'].skala} vid 450 ms — det ska vara mitt i ` +
      'utrullningen.');
    assert.ok(v450['h2'].opacitet < 0.05,
      `texten har redan borjat vid 450 ms (${v450['h2'].opacitet}) — den kommer efter bandet.`);

    // 3. Texten har borjat.
    assert.ok(r.matningar[700]['h2'].opacitet > 0.02,
      `texten har inte borjat vid 700 ms (${r.matningar[700]['h2'].opacitet}) — den gar ` +
      `${TAKT.textFran}-${TAKT.textTill} ms.`);

    // 4. Allt framme.
    const slut = r.matningar[PLAN.enterMs - 10];
    for (const sel of Object.keys(ATERANVANDS).concat(TEXTEN))
      assert.ok(slut[sel].opacitet > 0.95,
        `${sel} ar inte framme nar fas 2 tar slut (opacitet ${slut[sel].opacitet}).`);
    assert.ok(Math.abs(slut['.fan-ribbon'].skala - 1) <= 0.02,
      `bandet slutar pa skalaX ${slut['.fan-ribbon'].skala} — det ska vara helt utrullat.`);

    /* 5. HALVA ROVELSEN VID HALVA TIDEN. Bada originalkurvorna snappar:
       `cubic-bezier(.34,1.56,.64,1)` pa poppen ar samma kurva som gjorde att stacks fall
       avverkade 98,6 % av strackan pa 35,7 % av tiden, och `cubic-bezier(.16,1,.3,1)` pa
       utrullningen ar en kraftig ease-out. Keyframen ar designens — kurvan ar var. */
    const halvAtHalv = (sel, falt, t0, tHalv, tSlut) => {
      const s = r.matningar[t0][sel][falt];
      const h = r.matningar[tHalv][sel][falt];
      const e = r.matningar[tSlut][sel][falt];
      const andel = (s - h) / (s - e);
      assert.ok(andel > 0.35 && andel < 0.65,
        `${sel} (${falt}) har ${(andel * 100).toFixed(0)} % av rorelsen gjord vid halva tiden ` +
        `(${s} -> ${h} -> ${e}). Utanfor 35-65 % snappar den i stallet for att ga.`);
    };
    halvAtHalv('.fan-profile', 'skala', 1, 190, 380);
    halvAtHalv('.fan-ribbon', 'skala', 261, 460, 660);
    halvAtHalv('h2', 'ty', 521, 690, 860);
  });

// ---- 18g. KONTRAKTET: ateranvandning + vilolagret pa RATT stalle -------------------------------
// TVA saker, och den andra ar ribbon-specifik.
//
//   A) Keyframsen ATERANVANDS: fas 2 kor exakt fbProfilePop och frbUnfurl, och fas 1 kor dem
//      inte. Det ar den felplaceringen koreografin finns till for att ratta.
//
//   B) VILOLAGRET LIGGER BARA I HYLLNINGEN. Ribbon ar forsta Fan-modellen utan infinita
//      baslager — hero och stack far sin hyllning buren av fanLevelPop och fanRing, ribbon har
//      ingenting. Ett tomt fas 3 blir darfor DOTT, inte aterhallet, och modellen far ett eget
//      `frbAndas`. Men det maste ligga PRECIS i hyllningen: smyger det in i ljus eller oppna
//      blir entren svajig, och inget annat prov skulle marka det.
test('18g. fas 2 ateranvander keyframsen, och vilolagret finns bara i hyllningen',
  { skip }, async () => {
    const page = await studion();
    const r = await page.evaluate(async ({ modell, ateranvands, vilolager }) => {
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
        for (const sel of Object.keys(ateranvands).concat([vilolager.sel])) {
          const el = box.querySelector(sel);
          ut[sel] = el ? getComputedStyle(el).animationName : null;
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
    }, { modell: MODELL, ateranvands: ATERANVANDS, vilolager: VILOLAGER });
    await page.close();

    assert.equal(r.fel, null, r.fel + ` ${SAKNAS}`);
    for (const fas of ['ljus', 'oppna', 'hyllning'])
      assert.ok(r.prov[fas], `fasen "${fas}" observerades aldrig. ${SAKNAS}`);

    // A) Ateranvandningen.
    for (const [sel, keyframe] of Object.entries(ATERANVANDS)) {
      assert.ok(!new RegExp(keyframe).test(String(r.prov.ljus[sel])),
        `i fas 1 kor ${sel} redan "${r.prov.ljus[sel]}". Entreerna spelar i dag under hela ` +
        'anticipationsfasen — det ar den felplaceringen som ska rattas. Vinner ' +
        'neutraliseringen over `.fan-layout-ribbon.fan-active .X` (0,3,0)?');
      assert.match(String(r.prov.oppna[sel]), new RegExp(keyframe),
        `i fas 2 kor ${sel} "${r.prov.oppna[sel]}" i stallet for "${keyframe}". Formen ar ` +
        'redan designad — byt klocka, skriv inte en egen kopia.');
    }

    // B) Vilolagret, bada hallen.
    assert.match(String(r.prov.hyllning[VILOLAGER.sel]), new RegExp(VILOLAGER.namn),
      `i hyllningen kor ${VILOLAGER.sel} "${r.prov.hyllning[VILOLAGER.sel]}" — ribbon har ` +
      'inga infinita baslager, sa utan ett eget vilolager star modellen HELT stilla i upp ' +
      'till sex sekunder. Det ar dott, inte aterhallet.');
    for (const fas of ['ljus', 'oppna'])
      assert.ok(!new RegExp(VILOLAGER.namn).test(String(r.prov[fas][VILOLAGER.sel])),
        `i fas "${fas}" kor ${VILOLAGER.sel} redan "${r.prov[fas][VILOLAGER.sel]}". ` +
        'Vilolagret hor hemma i HYLLNINGEN — smyger det in i ljus eller oppna blir entren ' +
        'svajig, och inget annat prov skulle marka det.');
  });
