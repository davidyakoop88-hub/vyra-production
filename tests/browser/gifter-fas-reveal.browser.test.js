'use strict';
// Gifter Level Up · modell `reveal` — fyrafaskoreografi. Prov 9a-9f, skrivna FORE koden.
//
// Egen fil per modell. De generella vakterna (G1 decode-ankarets synlighet, G2 fas-CSS utan
// dod rorelse) ligger i gifter-fas-generella.browser.test.js och tacker reveal automatiskt sa
// fort den star i modelltabellen — de upprepas darfor INTE har.
//
// VALD PREMISS: modellen heter `reveal` och motorns fas 2 heter `oppna`. Designen ar en IRIS —
// portrattet ar SLUTET i fas 1 och OPPNAS i fas 2. Da ar decode-grinden inte kosmetik utan
// sjalva poangen: irisen far aldrig oppnas mot en oavkodad bild. Prov 9f vaktar exakt det.
//
// UPPMATT (scratchpad/mat-modell-delar.js reveal, tand widget):
//   flexordning   diamant (1) -> BRICKA (2) -> portratt (3) -> h2 (4) -> h3 (5) -> p (6)
//                 brickan ligger alltsa OVANFOR portrattet, tvartom mot stack
//   .gifter-orbit img        86x86  — decode-ankaret, samma som risingtier och stack
//   .gifter-arrow-up .left/.right   14x14, syns bara i reveal och risingtier, pekar uppat
//   ATT NEUTRALISERA: .gifter-diamond-stack -> gl-lift .8s
//                     .gifter-arrow-up      -> gl-shoot 1.1s INFINITE
//   DOD ROrELSE (ror inte, G2 vaktar): .gifter-big-level -> gl-lift,
//                     .gifter-orbit-arrow -> heartSpark, .gifter-bottom-profile -> gl-uncover
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

const MODELL = 'reveal';
const FASER = ['ljus', 'oppna', 'hyllning', 'upplosning'];
const PLAN = { anticipationMs: 500, enterMs: 900, exitMs: 600 };
const IRIS_ANKARE = '.gifter-orbit img';
const IRIS_OPPEN_MIN = 60;   // procent — designen sager circle(72%)
const SAKNAS = `Star "${MODELL}" i modelltabellen MODELLER i gifter-fas.js, och finns iris-CSS:en?`;

async function studion() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const varningar = [];
  page.on('console', m => { if (m.type() === 'warning') varningar.push(m.text()) });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(3000);   // kowrapparna installeras vid 500/2200 ms
  page._varningar = varningar;
  return page;
}

async function korReveal(page, { gifterDuration = 2, bildSrc = null, ocksaFan = false } = {}) {
  return page.evaluate(async (arg) => {
    state.widgets.length = 0;
    const g = window.VyraWidgets.create('catalog:gifterlevel:' + arg.modell);
    g.x = 40; g.y = 40; g.gifterDuration = arg.gifterDuration;
    state.widgets.push(g);
    let fan = null;
    if (arg.ocksaFan) {
      fan = window.VyraWidgets.create('catalog:fanlevel:layout:duo');
      fan.x = 420; fan.y = 40; fan.fanDuration = 1;
      state.widgets.push(fan);
    }
    selected = null; render();
    for (let i = 0; i < 90 && !document.querySelector(`[data-id="${g.id}"]`); i++)
      await new Promise(r => requestAnimationFrame(r));
    const box = document.querySelector(`[data-id="${g.id}"]`);
    if (!box) return { fel: arg.modell + ' renderades inte' };

    const bild = box.querySelector('.gifter-orbit img');
    if (arg.bildSrc) {
      if (!bild) return { fel: 'ingen profilbild i .gifter-orbit' };
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
    window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12 });
    if (fan) window.triggerFanLevelUp({ __test: true, name: 'FanProv', level: 9 });

    let fanVid = null;
    const slut = arg.gifterDuration * 1000 + 6000;
    const start = performance.now();
    while (performance.now() - start < slut) {
      if (fan && fanVid === null) {
        const fe = document.querySelector(`[data-id="${fan.id}"]`);
        if (fe?.className.split(/\s+/).includes('fan-active')) fanVid = Math.round(performance.now() - t0);
      }
      if (!fan && logg.length >= 4 && performance.now() - t0 > logg[3].vid + 800) break;
      await new Promise(r => setTimeout(r, 25));
    }
    return { fel: null, logg, fanVid };
  }, { gifterDuration, bildSrc, ocksaFan, modell: MODELL });
}

// ---- 9a. Fasordning och langder ---------------------------------------------------------------
test(`9a. ${MODELL} kor alla fyra faser i ratt ordning med planerade langder`, { skip }, async () => {
  const page = await studion();
  const r = await korReveal(page, { gifterDuration: 2 });
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

// ---- 9b. holdMs kommer fran widgetens gifterDuration ------------------------------------------
test('9b. hyllningsfasen laser gifterDuration, inte ett fast varde', { skip }, async () => {
  const page = await studion();
  const r = await korReveal(page, { gifterDuration: 3 });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  assert.ok(vid.hyllning != null && vid.upplosning != null,
    `hyllning eller upplosning uteblev — faser sedda: ${JSON.stringify(r.logg.map(l => l.fas))}. ${SAKNAS}`);
  const hyllning = vid.upplosning - vid.hyllning;
  assert.ok(Math.abs(hyllning - 3000) <= 250,
    `hyllningen varade ${hyllning} ms — widgetens gifterDuration ar 3 s. ` +
    `Ligger den nara 6000 ms laser koreografin ett fast varde i stallet for widgeten.`);
});

// ---- 9c. Kointegration -------------------------------------------------------------------------
test('9c. kon slapper inte fram nasta alert mitt i reveals sekvens', { skip }, async () => {
  const page = await studion();
  const r = await korReveal(page, { gifterDuration: 2, ocksaFan: true });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  assert.ok(vid.upplosning != null,
    `${MODELL} nadde aldrig upplosningsfasen — faser sedda: ` +
    `${JSON.stringify(r.logg.map(l => l.fas))}. ${SAKNAS}`);
  const sekvensSlut = vid.upplosning + PLAN.exitMs;
  assert.notEqual(r.fanVid, null, 'Fan fick aldrig sin tur inom provets tidsfonster');
  assert.ok(r.fanVid >= sekvensSlut - 200,
    `Fan tandes vid ${r.fanVid} ms men ${MODELL}s sekvens var klar forst vid ${sekvensSlut} ms — ` +
    `kon kanner bara till gifterDuration. Saknas posten "gifter-fas:${MODELL}" i ` +
    `window.VyraFasKoreografi? RAPPORTERA, laga inte i runtime-controls.js.`);
});

// ---- 9e. Decode-grinden i reveals koreografi --------------------------------------------------
for (const fall of [
  { namn: 'snabb bild (100 ms)', src: '/bild.png?ms=100', minOppna: 400, maxOppna: 800, varning: false },
  { namn: 'langsam men inom tidsgransen (300 ms)', src: '/bild.png?ms=300', minOppna: 400, maxOppna: 800, varning: false },
  /* 1100 ms, inte 700. Reveals decode-tak ar hojt till 900 ms (gifter-fas.js) eftersom ett tak
     pa 500 aldrig kan bli bindande mot en ljusfas pa 500. Med det taket avkodas en 700 ms-bild
     INOM gransen och loggar ingen varning — "for sen" borjar nu ovanfor 900 ms. */
  { namn: 'for sen bild (1100 ms, over taket 900 ms)', src: '/bild.png?ms=1100', minOppna: 800, maxOppna: 1300, varning: true },
  { namn: 'bilden fallerar (404)', src: '/bild.png?ms=50&fel=1', minOppna: 400, maxOppna: 900, varning: true },
]) {
  test(`9e. decode-grind pa ${MODELL} — ${fall.namn}`, { skip }, async () => {
    const page = await studion();
    const r = await korReveal(page, { gifterDuration: 1, bildSrc: fall.src });
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

/* ---- 9f. IRIS-VAKTEN — reveals egen premiss --------------------------------------------------
   Reveal ar den enda modellen dar decode-grinden ar synlig for tittaren: irisen ar portrattets
   lucka. Oppnas den innan bilden avkodats ser man ett tomt hal dar ansiktet ska vara — precis
   den bugg grinden finns for, och den enda modellen dar felet inte gar att missa.

   Tre delar:
     A  fas 1  — irisen ar STANGD (clip-path circle ~0 %)
     B  fas 3  — irisen ar OPPEN (clip-path circle >= 60 %, designen sager 72 %)
     C  grinden — irisen borjar ALDRIG oppna innan bilden ar avkodad

   Del C mats med en avsiktligt LANGSAM bild (700 ms) mot grindens tak pa 500 ms. Utan grind
   startar fas 2 exakt nar uppbyggnaden ar klar (500 ms) medan bilden avkodas forst vid 700 ms —
   alltsa oppnar irisen 200 ms for tidigt, och provet sager det rakt ut. */
function radieUr(clip) {
  if (!clip || clip === 'none') return null;
  const m = /circle\(\s*([\d.]+)%/.exec(clip);
  return m ? Number(m[1]) : null;
}

test('9f. reveals iris ar stangd i fas 1 och oppen i fas 3', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async ({ modell, ankare }) => {
    state.widgets.length = 0;
    const g = window.VyraWidgets.create('catalog:gifterlevel:' + modell);
    g.x = 40; g.y = 40; g.gifterDuration = 2;
    state.widgets.push(g); selected = null; render();
    for (let i = 0; i < 90 && !document.querySelector(`[data-id="${g.id}"]`); i++)
      await new Promise(r => requestAnimationFrame(r));
    const box = document.querySelector(`[data-id="${g.id}"]`);
    if (!box) return { fel: modell + ' renderades inte' };

    const prov = {};
    const las = () => {
      const el = box.querySelector(ankare);
      return el ? getComputedStyle(el).clipPath : 'ELEMENT SAKNAS';
    };
    new MutationObserver(() => {
      const f = box.getAttribute('data-fas');
      if (f && !(f in prov)) prov[f] = las();
    }).observe(box, { attributes: true, attributeFilter: ['data-fas'] });

    if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
    window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12 });

    // Las om mitt i varje fas ocksa — fas 1 ar ett statiskt stangt lage, fas 3 ett statiskt oppet.
    const t0 = performance.now();
    const mitt = {};
    while (performance.now() - t0 < 5200) {
      const f = box.getAttribute('data-fas');
      if (f === 'ljus' && performance.now() - t0 > 250 && !mitt.ljus) mitt.ljus = las();
      if (f === 'hyllning' && !mitt.hyllning) mitt.hyllning = las();
      await new Promise(r => setTimeout(r, 25));
    }
    return { fel: null, vidFasstart: prov, mitt };
  }, { modell: MODELL, ankare: IRIS_ANKARE });
  await page.close();

  assert.equal(r.fel, null, r.fel);

  const iLjus = r.mitt.ljus, iHyllning = r.mitt.hyllning;
  assert.ok(iLjus != null,
    `${MODELL} nadde aldrig fas "ljus" — ingen clip-path kunde mätas. ${SAKNAS}`);
  assert.ok(iHyllning != null,
    `${MODELL} nadde aldrig fas "hyllning" — ingen clip-path kunde mätas. ${SAKNAS}`);

  const rLjus = radieUr(iLjus), rHyllning = radieUr(iHyllning);
  assert.notEqual(rLjus, null,
    `Irisen saknas i fas 1: clip-path pa ${IRIS_ANKARE} ar "${iLjus}", forvantat en circle(). ` +
    `${SAKNAS}`);
  assert.ok(rLjus <= 1,
    `Irisen ar INTE stangd i fas 1: clip-path ar "${iLjus}" (radie ${rLjus} %), forvantat ~0 %. ` +
    `Portrattet syns innan det ska avslojas.`);

  assert.notEqual(rHyllning, null,
    `Irisen saknas i fas 3: clip-path pa ${IRIS_ANKARE} ar "${iHyllning}", forvantat en circle().`);
  assert.ok(rHyllning >= IRIS_OPPEN_MIN,
    `Irisen ar inte oppen i fas 3: clip-path ar "${iHyllning}" (radie ${rHyllning} %), ` +
    `forvantat minst ${IRIS_OPPEN_MIN} % (designen sager 72 %). Portrattet forblir beskuret.`);
});

test('9f. reveals iris oppnar aldrig innan bilden ar avkodad', { skip }, async () => {
  const page = await studion();
  const LANGSAM = '/bild.png?ms=700';
  const r = await page.evaluate(async ({ modell, ankare, src }) => {
    state.widgets.length = 0;
    const g = window.VyraWidgets.create('catalog:gifterlevel:' + modell);
    g.x = 40; g.y = 40; g.gifterDuration = 2;
    state.widgets.push(g); selected = null; render();
    for (let i = 0; i < 90 && !document.querySelector(`[data-id="${g.id}"]`); i++)
      await new Promise(r => requestAnimationFrame(r));
    const box = document.querySelector(`[data-id="${g.id}"]`);
    if (!box) return { fel: modell + ' renderades inte' };
    const bild = box.querySelector(ankare);
    if (!bild) return { fel: 'decode-ankaret ' + ankare + ' finns inte i ' + modell };

    const t0 = performance.now();
    let tAvkodad = null, tIris = null, sistaClip = null;

    bild.src = src;
    bild.decode().then(() => { if (tAvkodad === null) tAvkodad = Math.round(performance.now() - t0) })
                 .catch(() => { if (tAvkodad === null) tAvkodad = Math.round(performance.now() - t0) });

    if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
    window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12 });

    // Hog samplingstakt via rAF: forsta ogonblicket radien overstiger 1 % ar "irisen oppnade".
    await new Promise(klar => {
      const tick = () => {
        const clip = getComputedStyle(bild).clipPath;
        sistaClip = clip;
        const m = /circle\(\s*([\d.]+)%/.exec(clip || '');
        if (tIris === null && m && Number(m[1]) > 1) tIris = Math.round(performance.now() - t0);
        if (performance.now() - t0 > 2600) return klar();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return { fel: null, tAvkodad, tIris, sistaClip };
  }, { modell: MODELL, ankare: IRIS_ANKARE, src: LANGSAM });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.notEqual(r.tAvkodad, null, 'bilden blev varken avkodad eller fallerad inom provets fonster');
  assert.notEqual(r.tIris, null,
    `Irisen oppnade aldrig — clip-path stod kvar pa "${r.sistaClip}" hela sekvensen. ${SAKNAS}`);

  assert.ok(r.tIris >= r.tAvkodad,
    `Reveals iris oppnade vid ${r.tIris} ms, men bilden avkodades vid ${r.tAvkodad} ms — ` +
    `decode-grinden fungerar inte. Irisen avslojade ett portratt som annu inte fanns.`);
});
