'use strict';
// Fan Level Up · modell `stack` — fyrafaskoreografi. Prov 17a-17g, skrivna FORE koden.
// Fan-serierna: hero 16, stack 17. De generella vakterna F1-F3 bor i fan-fas-generella.
//
// PREMISS: "MOTTAGANDET". Stack har REDAN en komplett, staggrad entre, och den ar bra:
//     fsIconDrop   .5s  @ 0 ms    hjartat faller fran -40px, scale(.7), overskjutande kurva
//     fsPillPop    .4s  @ 100 ms  nivapillen poppar fran scale(.5)
//     fsAvatarRise .45s @ 200 ms  avataren stiger fran +20px
// Dramaturgin ar alltsa FALL -> POP -> STIGNING: hjartat faller in, pillen poppar ut under
// det, och avataren stiger upp for att mota det. Det ar premissen, och den ar designens egen.
//
// KOREOGRAFIN ATERANVANDER KEYFRAMSEN, DEN DUPLICERAR DEM INTE. Problemet i dag ar inte
// formen utan KLOCKAN: hela sekvensen (0-650 ms) spelar under ANTICIPATIONSFASEN, som ska
// vara uppbyggnad och inte ankomst. Fas 1 neutraliserar dem alltsa, och fas 2 utfardar SAMMA
// keyframes pa nytt med fasens klocka. Prov 17g gor det till ett kontrakt i stallet for en
// avsikt — det ar latt att av bekvamlighet skriva `fstHjartaFall` och tappa bort att formen
// redan fanns.
//
// TVA SAKER SOM PROVEN AR BYGGDA RUNT:
//
//   1. SPECIFICITET. Entreerna kommer fran `.fan-layout-stack.fan-active .X` = (0,3,0).
//      Neutraliseringen i fas 1 maste vinna over dem UTAN att doda fas 2:s aterinforda
//      animationer, sa bada bar `.fan-active` + `[data-fas="..."]` = (0,4,0) och ar scopade
//      till var sin fas. 17g mater bada hallen: inget i fas 1, ratt namn i fas 2.
//
//   2. `h2` SYNS I STACK, trots `.fan-layout-stack>h2{display:none!important}`. Den regeln ar
//      DOD: `.fan-level-up>h2{display:block!important}` (studio.css:1072) har SAMMA
//      specificitet (0,1,1) och ligger senare, sa den vinner. Uppmatt display: block, 108x16.
//      Det ar inte en visuell bugg — fan-level-referens KRAVER att rubriken syns i alla atta
//      enligt referensbilden — men det ar en fallgrop for den som skriver fastabellen.
//      Rubriken ar alltsa MED i samlingen och koreograferas som text.
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

const MODELL = 'stack';
const FASER = ['ljus', 'oppna', 'hyllning', 'upplosning'];
const PLAN = { anticipationMs: 500, enterMs: 900, exitMs: 600 };
// Taktningen inuti fas 2, ur den godkanda fastabellen.
const TAKT = { fallTill: 420, popFran: 300, popTill: 620, stigFran: 480, stigTill: 800,
               textFran: 560, textTill: 870 };
// Vem ska ateranvanda vilken befintlig keyframe — kontraktet 17g vaktar.
const ATERANVANDS = {
  '.fan-burst': 'fsIconDrop',
  '.fan-level-pill': 'fsPillPop',
  '.fan-profile': 'fsAvatarRise',
};
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

async function korStack(page, { fanDuration = 2, bildSrc = null, ocksaGifter = false } = {}) {
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

/* Deterministisk provtagning i fas 2. currentTime RAKNAR IN animationens delay, sa samma
   varde ger samma ogonblick i fasen for alla tre staggrade animationerna — det ar just
   darfor tekniken fungerar pa en sekvens med fordrojningar. */
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

// ---- 17a. Fasordning och langder --------------------------------------------------------------
test(`17a. ${MODELL} kor alla fyra faser i ratt ordning med planerade langder`, { skip }, async () => {
  const page = await studion();
  const r = await korStack(page, { fanDuration: 2 });
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

// ---- 17b. holdMs kommer fran widgetens fanDuration ---------------------------------------------
test('17b. hyllningsfasen laser fanDuration, inte ett fast varde', { skip }, async () => {
  const page = await studion();
  const r = await korStack(page, { fanDuration: 3 });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  assert.ok(vid.hyllning != null && vid.upplosning != null,
    `hyllning eller upplosning uteblev — faser sedda: ${JSON.stringify(r.logg.map(l => l.fas))}. ${SAKNAS}`);
  const hyllning = vid.upplosning - vid.hyllning;
  assert.ok(Math.abs(hyllning - 3000) <= 250,
    `hyllningen varade ${hyllning} ms — widgetens fanDuration ar 3 s.`);
});

// ---- 17c. Kointegration ------------------------------------------------------------------------
test('17c. kon slapper inte fram nasta alert mitt i stacks sekvens', { skip }, async () => {
  const page = await studion();
  const r = await korStack(page, { fanDuration: 2, ocksaGifter: true });
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

// ---- 17d. Stack ar inkopplad, med ratt ankare ---------------------------------------------------
test('17d. stack star i modelltabellen med avataren som ankare', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async () => {
    const F = window.VyraFanFas;
    if (!F || !Array.isArray(F.modeller)) return { fel: 'VyraFanFas.modeller saknas' };
    return { fel: null, modeller: F.modeller.slice(),
      ankare: typeof F.ankare === 'function' ? F.ankare('stack') : undefined,
      tak: typeof F.decodeTak === 'function' ? F.decodeTak('stack') : undefined };
  });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.ok(r.modeller.includes(MODELL),
    `"${MODELL}" star inte i VyraFanFas.modeller. Registrerade: ` +
    `${JSON.stringify(r.modeller)}. ${SAKNAS}`);
  // F1 vaktar att ankaret SYNS, F3 att grinden lyder det. Att det ar RATT element kan bara
  // modellen sjalv veta — hjartfiguren i .fan-burst ar synlig men statisk dekor.
  assert.equal(r.ankare, '.fan-profile img',
    `stack deklarerar decodeAnkare ${JSON.stringify(r.ankare)} — anvandarens avatar sitter i ` +
    '.fan-profile. Hjartfiguren i .fan-burst ar densamma vid varje alert och duger inte som grind.');
  assert.equal(r.tak, 900,
    `stacks decodeTak ar ${r.tak} ms. Avataren stiger upp SIST i sekvensen (480-800 ms i ` +
    'fas 2), sa en oavkodad bild ger en tom cirkel i mottagandets slutbeat.');
});

// ---- 17e. Decode-grinden ------------------------------------------------------------------------
for (const fall of [
  { namn: 'snabb bild (100 ms)', src: '/bild.png?ms=100', minOppna: 400, maxOppna: 800, varning: false },
  { namn: 'langsam men inom taket (700 ms)', src: '/bild.png?ms=700', minOppna: 550, maxOppna: 1000, varning: false },
  { namn: 'for sen bild (1100 ms, over taket 900 ms)', src: '/bild.png?ms=1100', minOppna: 800, maxOppna: 1300, varning: true },
  { namn: 'bilden fallerar (404)', src: '/bild.png?ms=50&fel=1', minOppna: 400, maxOppna: 1000, varning: true },
]) {
  test(`17e. decode-grind pa ${MODELL} — ${fall.namn}`, { skip }, async () => {
    const page = await studion();
    const r = await korStack(page, { fanDuration: 1, bildSrc: fall.src });
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

// ---- 17f. PREMISSVAKTEN · "Mottagandet" ---------------------------------------------------------
// FALL -> POP -> STIGNING, mott pa berakriade varden, aldrig pa klassnamn:
//   1. Vid 150 ms faller hjartat annu — det star OVANFOR sitt landningslage (ty < 0) — och
//      varken pillen eller avataren har borjat.
//   2. Vid 450 ms har hjartat LANDAT och pillen poppar, medan avataren fortfarande vantar.
//   3. Vid 700 ms stiger avataren (den star UNDER sitt lage, ty > 0) och texten har borjat.
//   4. Vid fasens slut ar allt framme.
test('17f. stack faller, poppar och stiger — i den ordningen', { skip }, async () => {
  const page = await studion();
  const r = await provaFas2(page, [1, 150, 210, 301, 420, 450, 460, 620, 481, 640, 700, 800,
                                   PLAN.enterMs - 10]);
  await page.close();

  assert.equal(r.fel, null, r.fel + ` ${SAKNAS}`);
  assert.ok(r.antalAnimationer > 0,
    `inga animationer alls i widgeten under fas 2 — koreografins CSS saknas. ${SAKNAS}`);

  // 1. Fallet pagar, resten vantar.
  const v150 = r.matningar[150];
  for (const sel of Object.keys(ATERANVANDS).concat(TEXTEN))
    assert.ok(v150[sel], `delen ${sel} hittades inte i widgeten`);
  assert.ok(v150['.fan-burst'].ty < -1,
    `hjartat star pa ty ${v150['.fan-burst'].ty} vid 150 ms — det ska annu vara pa vag NED ` +
    'mot sitt lage (fsIconDrop startar pa translateY(-40px)).');
  assert.ok(v150['.fan-level-pill'].opacitet < 0.05,
    `pillen syns redan vid 150 ms (${v150['.fan-level-pill'].opacitet}) — den poppar forst ` +
    `vid ${TAKT.popFran} ms.`);
  assert.ok(v150['.fan-profile'].opacitet < 0.05,
    `avataren syns redan vid 150 ms (${v150['.fan-profile'].opacitet}) — den stiger forst ` +
    `vid ${TAKT.stigFran} ms.`);

  // 2. Hjartat landat, pillen poppar, avataren vantar an.
  const v450 = r.matningar[450];
  assert.ok(Math.abs(v450['.fan-burst'].ty) <= 2,
    `hjartat har inte landat vid 450 ms (ty ${v450['.fan-burst'].ty}) — fallet ska vara klart ` +
    `vid ${TAKT.fallTill} ms.`);
  assert.ok(v450['.fan-level-pill'].opacitet > 0.05,
    `pillen har inte borjat poppa vid 450 ms (${v450['.fan-level-pill'].opacitet}).`);
  assert.ok(v450['.fan-profile'].opacitet < 0.05,
    `avataren stiger redan vid 450 ms (${v450['.fan-profile'].opacitet}) — den ska mota ` +
    'hjartat EFTER att pillen poppat.');

  // 3. Avataren stiger, och den kommer NEDIFRAN.
  const v700 = r.matningar[700];
  assert.ok(v700['.fan-profile'].opacitet > 0.05,
    `avataren har inte borjat vid 700 ms (${v700['.fan-profile'].opacitet}).`);
  assert.ok(v700['.fan-profile'].ty > 0.5,
    `avataren star pa ty ${v700['.fan-profile'].ty} vid 700 ms — den ska stiga UPPIFRAN ` +
    'sitt startlage under (fsAvatarRise startar pa translateY(20px)).');
  assert.ok(v700['h2'].opacitet > 0.02,
    `texten har inte borjat vid 700 ms (${v700['h2'].opacitet}) — den kommer sist, ` +
    `fran ${TAKT.textFran} ms.`);

  // 4. Allt framme nar fasen tar slut.
  const slut = r.matningar[PLAN.enterMs - 10];
  for (const sel of Object.keys(ATERANVANDS).concat(TEXTEN))
    assert.ok(slut[sel].opacitet > 0.95,
      `${sel} ar inte framme nar fas 2 tar slut (opacitet ${slut[sel].opacitet}).`);

  /* 5. HALVA ROVELSEN VID HALVA TIDEN — for alla tre ateranvanda rorelserna.
     Originalens `cubic-bezier(.34,1.56,.64,1)` ar extremt fronttung: UPPMATT stod hjartat pa
     ty -0,55 vid 150 ms av ett 420 ms-fall, alltsa 98,6 % av strackan pa 35,7 % av tiden. Det
     SNAPPAR i stallet for att falla. Keyframsen ar designens och rors inte — men kurvan ar
     klocka, inte form, och den ar var. Efter bytet: 59 / 59 / 50 %.
     Utan den har vakten kan nagon "aterstalla originalkurvan" och tro att det ar trohet mot
     designen, medan rorelsen i praktiken forsvinner. */
  const halvAtHalv = (sel, falt, t0, tHalv, tSlut) => {
    const s = r.matningar[t0][sel][falt];
    const h = r.matningar[tHalv][sel][falt];
    const e = r.matningar[tSlut][sel][falt];
    const andel = (s - h) / (s - e);
    assert.ok(andel > 0.35 && andel < 0.65,
      `${sel} (${falt}) har ${(andel * 100).toFixed(0)} % av rorelsen gjord vid halva tiden ` +
      `(${s} -> ${h} -> ${e}). Utanfor 35-65 % snappar den i stallet for att ga. ` +
      'Timingfunktionen ar var att valja — keyframen ar designens.');
  };
  halvAtHalv('.fan-burst', 'ty', 1, 210, 420);
  halvAtHalv('.fan-level-pill', 'skala', 301, 460, 620);
  halvAtHalv('.fan-profile', 'ty', 481, 640, 800);
});

// ---- 17g. KONTRAKTET: befintliga keyframes ATERANVANDS, och spelar inte i fas 1 ----------------
// Det ar latt att av bekvamlighet skriva `fstHjartaFall` och tappa bort att formen redan fanns
// designad. Provet gor ateranvandningen till ett kontrakt: fas 2 ska kora EXAKT fsIconDrop,
// fsPillPop och fsAvatarRise. Och lika viktigt — de far INTE spela i fas 1, for det ar just
// den felplaceringen koreografin finns till for att ratta.
test('17g. fas 2 ateranvander fsIconDrop/fsPillPop/fsAvatarRise, och fas 1 spelar dem inte',
  { skip }, async () => {
    const page = await studion();
    const r = await page.evaluate(async ({ modell, ateranvands }) => {
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
        for (const sel of Object.keys(ateranvands)) {
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
      while (performance.now() < deadline && prov.oppna === undefined)
        await new Promise(r => setTimeout(r, 16));
      return { fel: null, prov };
    }, { modell: MODELL, ateranvands: ATERANVANDS });
    await page.close();

    assert.equal(r.fel, null, r.fel + ` ${SAKNAS}`);
    assert.ok(r.prov.ljus, `fas 1 ("ljus") observerades aldrig. ${SAKNAS}`);
    assert.ok(r.prov.oppna, `fas 2 ("oppna") observerades aldrig. ${SAKNAS}`);

    for (const [sel, keyframe] of Object.entries(ATERANVANDS)) {
      // Fas 1: entren far inte spela har. Det ar hela poangen med koreografin.
      assert.ok(!new RegExp(keyframe).test(String(r.prov.ljus[sel])),
        `i fas 1 kor ${sel} redan "${r.prov.ljus[sel]}". Entreerna spelar i dag under hela ` +
        'anticipationsfasen — det ar just den felplaceringen som ska rattas, sa fas 1 maste ' +
        'neutralisera dem. Vinner neutraliseringen over `.fan-layout-stack.fan-active .X` ' +
        '(0,3,0)? Den behover bade `.fan-active` och `[data-fas="ljus"]`.');

      // Fas 2: SAMMA keyframe ska ateranvandas, inte en ny kopia.
      assert.match(String(r.prov.oppna[sel]), new RegExp(keyframe),
        `i fas 2 kor ${sel} "${r.prov.oppna[sel]}" i stallet for "${keyframe}". Formen ar ` +
        'redan designad — koreografin ska ateranvanda keyframen och bara byta klocka, inte ' +
        'skriva en egen kopia.');
    }
  });
