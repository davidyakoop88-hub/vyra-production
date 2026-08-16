'use strict';
// Fan Level Up · modell `hero` — fyrafaskoreografi. Prov 16a-16g, skrivna FORE koden.
// Forsta Fan-modellen: Gifter-serierna gick 7-15, Fan borjar pa 16.
//
// PREMISS: "SAMLINGEN". hero ar den NAKNA basdesignen — noll egna CSS-regler, for att basen
// `.fan-level-up` (18 regler) ar modellen. Den ar ocksa renderarens DEFAULT
// (`w.fanLayout||'hero'`, media.js:546), alltsa det varje fan-widget utan uttryckligt val far.
//
// Uppmatt: hjartfiguren (.fan-burst, 145x145) pulsar REDAN FORE TANDNING — `fanLevelPop 2s`
// pa bilden och `fanRing 2s` pa dess ring, bada infinita, precis som orbitlevels `gOrb`.
// Hjartat ar alltsa redan igang; alerten ar nar ljuset nar det och resten SAMLAS under det.
//   fas 1  hjartat tonar in ensamt, redan pulsande
//   fas 2  avataren stiger upp under det, sedan nivapillen, sist rubrik/namn/meddelande
//   fas 3  inget nytt — fanLevelPop och fanRing bar hyllningen
//   fas 4  samlingen skingras nerifran och upp, hjartat sist
//
// TRE MATNINGAR SOM PROVEN AR BYGGDA RUNT:
//
//   1. ROTENS TRANSFORM AR LAST. `.fan-level-up.fan-active` satter
//      `transform:translateY(0) scale(1)!important`, och viktiga deklarationer slar
//      animationer. Beviset finns redan i produktionen: `fanAlertEnter .65s` animerar
//      `scale(.6) translateY(25px)` -> `scale(1.08)` -> `scale(1)`, och uppmatt rot-transform
//      under HELA entren ar `matrix(1,0,0,1,0,0)` vid 80/200/350/500 ms. Bara `filter: blur`
//      nar fram. Overskjutningen har aldrig synts for en enda tittare.
//      Koreografin laggs darfor pa BARNEN, precis som i Gifters `profile`.
//
//   2. `fanAlertEnter` SLOPAS. Den ar halvdod och ersatts av koreografin. Prov 16g vaktar att
//      den ar borta ur rotens animationName — annars ligger en blur-puls kvar och konkurrerar
//      med fas 1.
//
//   3. DE INFINITA BASLAGREN LAMNAS I FRED. Orbitlevel-regeln: satt aldrig `animation` pa ett
//      element som ager ett infinit lager — shorthanden ersatter allt. Prov 16g mater
//      `startTime` pa bada, sa en omstart syns aven nar namnet ser likadant ut.
//
// GENERELLA FAN-VAKTER (motsvarande G1-G3) kommer med MODELL 2. En vakt som loopar over en
// tabell med en enda post bevisar nastan ingenting, och "tom lista gronskar" ar en kand falla.
// Tills dess bar 16d ankarkravet for hero specifikt.
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

const MODELL = 'hero';
const FASER = ['ljus', 'oppna', 'hyllning', 'upplosning'];
const PLAN = { anticipationMs: 500, enterMs: 900, exitMs: 600 };
// Taktningen inuti fas 2, ur den godkanda fastabellen.
const TAKT = { avatarTill: 380, pillFran: 220, pillTill: 560, textFran: 380, textTill: 860 };
const SAMLAS = ['.fan-profile', '.fan-level-pill', 'h2', 'h3', 'p'];
const BASLAGER = ['fanLevelPop', 'fanRing'];
const SAKNAS = `Star "${MODELL}" i modelltabellen MODELLER i fan-fas.js? Ar fan-fas.js laddad i studio.html?`;

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

/* Tander en hero-widget och loggar nar varje fas BORJADE. `ocksaGifter` lagger en Gifter-widget
   som foljande alert — spegelbilden av vad Gifter-proven gor, sa kointegrationen provas fran
   Fans hall. */
async function korHero(page, { fanDuration = 2, bildSrc = null, ocksaGifter = false } = {}) {
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

    /* Ankaret i Fan ar anvandarens avatar i .fan-profile — INTE hjartfiguren i .fan-burst,
       som ar en statisk dekorbild ur assets. */
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
    return { fel: null, logg, gifterVid, slutKlass: box.className };
  }, { fanDuration, bildSrc, ocksaGifter, modell: MODELL });
}

/* Deterministisk provtagning i fas 2 — pausa allt, satt currentTime. De infinita baslagren
   lases till 0 sa provet inte varierar mellan korningar. */
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

    const las = () => {
      const ut = {};
      for (const sel of arg.samlas) {
        const el = box.querySelector(sel);
        if (!el) { ut[sel] = null; continue }
        const cs = getComputedStyle(el);
        const m = new DOMMatrixReadOnly(cs.transform === 'none' ? '' : cs.transform);
        ut[sel] = { ty: +m.f.toFixed(2), opacitet: +cs.opacity };
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
  }, { punkter, fanDuration, modell: MODELL, samlas: SAMLAS });
}

// ---- 16a. Fasordning och langder --------------------------------------------------------------
test(`16a. ${MODELL} kor alla fyra faser i ratt ordning med planerade langder`, { skip }, async () => {
  const page = await studion();
  const r = await korHero(page, { fanDuration: 2 });
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

// ---- 16b. holdMs kommer fran widgetens fanDuration ---------------------------------------------
// FAN-SPECIFIKT: faltet heter fanDuration, inte gifterDuration. En koreografi som kopierats fran
// Gifter utan att byta falt skulle lasa undefined och falla tillbaka pa ett fast varde.
test('16b. hyllningsfasen laser fanDuration, inte ett fast varde', { skip }, async () => {
  const page = await studion();
  const r = await korHero(page, { fanDuration: 3 });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  assert.ok(vid.hyllning != null && vid.upplosning != null,
    `hyllning eller upplosning uteblev — faser sedda: ${JSON.stringify(r.logg.map(l => l.fas))}. ${SAKNAS}`);
  const hyllning = vid.upplosning - vid.hyllning;
  assert.ok(Math.abs(hyllning - 3000) <= 250,
    `hyllningen varade ${hyllning} ms — widgetens fanDuration ar 3 s. Ligger den nara 6000 ms ` +
    'laser koreografin ett fast varde, eller fel falt.');
});

// ---- 16c. Kointegration, fran Fans hall -------------------------------------------------------
test('16c. kon slapper inte fram nasta alert mitt i heros sekvens', { skip }, async () => {
  const page = await studion();
  const r = await korHero(page, { fanDuration: 2, ocksaGifter: true });
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
    `${sekvensSlut} ms — kon kanner bara till fanDuration. Saknas posten "fan-fas:${MODELL}" i ` +
    'window.VyraFasKoreografi? RAPPORTERA, laga inte i runtime-controls.js.');
});

// ---- 16d. Hero ar inkopplad, med ratt ankare ---------------------------------------------------
test('16d. hero star i modelltabellen med avataren som ankare', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async () => {
    const F = window.VyraFanFas;
    if (!F || !Array.isArray(F.modeller)) return { fel: 'VyraFanFas.modeller saknas' };
    const ut = { fel: null, modeller: F.modeller.slice(),
      ankare: typeof F.ankare === 'function' ? F.ankare('hero') : undefined,
      tak: typeof F.decodeTak === 'function' ? F.decodeTak('hero') : undefined };
    // Ankaret maste peka pa nagot som FAKTISKT SYNS i en tand widget — annars avkodar grinden
    // ett element som aldrig renderas och fas 2 oppnar mot en tom yta. (Gifters prov G1.)
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:fanlevel:layout:hero');
    w.x = 40; w.y = 40; w.fanDuration = 2;
    state.widgets.push(w); selected = null; render();
    for (let i = 0; i < 90 && !document.querySelector(`[data-id="${w.id}"]`); i++)
      await new Promise(r => requestAnimationFrame(r));
    const box = document.querySelector(`[data-id="${w.id}"]`);
    if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
    window.triggerFanLevelUp({ __test: true, name: 'Prov', level: 9 });
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline &&
           !box.className.split(/\s+/).includes('fan-active'))
      await new Promise(r => setTimeout(r, 20));
    await new Promise(r => setTimeout(r, 400));
    const el = typeof ut.ankare === 'string' ? box.querySelector(ut.ankare) : null;
    if (el) {
      const cs = getComputedStyle(el), rect = el.getBoundingClientRect();
      ut.ankareSynligt = cs.display !== 'none' && cs.visibility !== 'hidden'
        && Number(cs.opacity) > 0.01 && rect.width > 1 && rect.height > 1;
      ut.ankareMatt = Math.round(rect.width) + 'x' + Math.round(rect.height);
    } else ut.ankareSynligt = false;
    return ut;
  });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.ok(r.modeller.includes(MODELL),
    `"${MODELL}" star inte i VyraFanFas.modeller. Registrerade: ` +
    `${JSON.stringify(r.modeller)}. ${SAKNAS}`);
  assert.equal(r.ankare, '.fan-profile img',
    `hero deklarerar decodeAnkare ${JSON.stringify(r.ankare)} — anvandarens avatar sitter i ` +
    '.fan-profile. Hjartfiguren i .fan-burst ar en statisk dekorbild ur assets och duger inte ' +
    'som grind: den ar densamma vid varje alert.');
  assert.equal(r.tak, 900,
    `heros decodeTak ar ${r.tak} ms. Avataren halls MORK i fas 1 och stiger upp i fas 2, ` +
    'alltsa avslojas den — och da ar 500 mot en ljusfas pa 500 en no-op som inte skyddar nagot.');
  assert.ok(r.ankareSynligt,
    `ankaret "${r.ankare}" ar inte synligt i en tand widget (matt ${r.ankareMatt}). ` +
    'Grinden skulle vakta ett element som aldrig renderas.');
});

// ---- 16e. Decode-grinden i heros koreografi ----------------------------------------------------
for (const fall of [
  { namn: 'snabb bild (100 ms)', src: '/bild.png?ms=100', minOppna: 400, maxOppna: 800, varning: false },
  /* Taket ar 900, sa en 700 ms-bild avkodas INOM gransen och varnar inte. */
  { namn: 'langsam men inom taket (700 ms)', src: '/bild.png?ms=700', minOppna: 550, maxOppna: 1000, varning: false },
  { namn: 'for sen bild (1100 ms, over taket 900 ms)', src: '/bild.png?ms=1100', minOppna: 800, maxOppna: 1300, varning: true },
  { namn: 'bilden fallerar (404)', src: '/bild.png?ms=50&fel=1', minOppna: 400, maxOppna: 1000, varning: true },
]) {
  test(`16e. decode-grind pa ${MODELL} — ${fall.namn}`, { skip }, async () => {
    const page = await studion();
    const r = await korHero(page, { fanDuration: 1, bildSrc: fall.src });
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

// ---- 16f. PREMISSVAKTEN · "Samlingen" ----------------------------------------------------------
// Fyra pastaenden, alla matta pa BERAKNADE varden:
//   1. FAS 1 AR HJARTAT ENSAMT — .fan-burst ar pa vag upp och dess infinita puls GAR, medan
//      allt som ska samlas under det ligger pa 0.
//   2. AVATAREN FORST — vid 150 ms i fas 2 ar avataren pa vag upp medan pillen och texten
//      fortfarande ar slackta.
//   3. ORDNINGEN HALLER — avatar fore pill fore text, mott vid 300 ms.
//   4. TEXTEN LASES — halva rorelsen vid halva tiden.
test('16f. hero tonar in hjartat ensamt och samlar sedan avatar, pill och text i ordning',
  { skip }, async () => {
    const page = await studion();

    const iFas1 = await page.evaluate(async ({ modell, samlas }) => {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:fanlevel:layout:' + modell);
      w.x = 40; w.y = 40; w.fanDuration = 3;
      state.widgets.push(w); selected = null; render();
      for (let i = 0; i < 90 && !document.querySelector(`[data-id="${w.id}"]`); i++)
        await new Promise(r => requestAnimationFrame(r));
      const box = document.querySelector(`[data-id="${w.id}"]`);
      if (!box) return { fel: modell + ' renderades inte' };

      let ljus = null, matt = null;
      new MutationObserver(() => {
        if (box.getAttribute('data-fas') === 'ljus' && ljus === null) ljus = performance.now();
      }).observe(box, { attributes: true, attributeFilter: ['data-fas'] });

      if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
      window.triggerFanLevelUp({ __test: true, name: 'Prov', level: 9, fromLevel: 8 });

      /* ABSOLUT grans tagen FORE loopen. */
      const deadline = performance.now() + 8000;
      while (performance.now() < deadline && matt === null) {
        if (ljus !== null && performance.now() - ljus > 250) {
          const op = (sel) => {
            const el = box.querySelector(sel);
            return el ? +(+getComputedStyle(el).opacity).toFixed(3) : null;
          };
          const bildEl = box.querySelector('.fan-burst img');
          matt = {
            burst: op('.fan-burst'),
            pulsar: bildEl ? bildEl.getAnimations().some(a =>
              a.animationName === 'fanLevelPop' && a.playState === 'running') : false,
            samlas: Object.fromEntries(samlas.map(s => [s, op(s)])),
          };
        }
        await new Promise(r => setTimeout(r, 16));
      }
      return { fel: null, matt };
    }, { modell: MODELL, samlas: SAMLAS });

    assert.equal(iFas1.fel, null, iFas1.fel + ` ${SAKNAS}`);
    assert.ok(iFas1.matt, `hann aldrig mata mitt i fas 1 — kom fasen alls? ${SAKNAS}`);
    const m = iFas1.matt;

    // 1. Hjartat ensamt, och det pulsar.
    assert.ok(m.burst > 0.02,
      `.fan-burst har opacitet ${m.burst} mitt i fas 1 — hjartat ska vara pa vag upp ur morkret.`);
    assert.ok(m.pulsar,
      'fanLevelPop gar inte pa .fan-burst img i fas 1 — det infinita baslagret ska leva genom ' +
      'hela sekvensen, inte stallas av eller startas om av koreografin.');
    for (const [sel, op] of Object.entries(m.samlas))
      assert.ok(op != null && op < 0.05,
        `${sel} har opacitet ${op} i fas 1 — allt utom hjartat ska samlas forst i fas 2.`);

    // 2-4. Ordningen och laslighet i fas 2.
    const halva = Math.round(TAKT.textFran + (TAKT.textTill - TAKT.textFran) / 2);
    const r2 = await provaFas2(page, [150, 300, TAKT.textFran + 5, halva, TAKT.textTill,
                                      PLAN.enterMs - 10]);
    await page.close();
    assert.equal(r2.fel, null, r2.fel);
    assert.ok(r2.antalAnimationer > 0,
      `inga animationer alls i widgeten under fas 2 — koreografins CSS saknas. ${SAKNAS}`);

    const v150 = r2.matningar[150];
    assert.ok(v150['.fan-profile'].opacitet > 0.05,
      `avataren har opacitet ${v150['.fan-profile'].opacitet} vid 150 ms i fas 2 — den ska ` +
      'stiga upp forst av allt.');
    assert.ok(v150['.fan-level-pill'].opacitet < 0.05,
      `nivapillen syns redan vid 150 ms (${v150['.fan-level-pill'].opacitet}) — den kommer ` +
      `forst vid ${TAKT.pillFran} ms.`);
    assert.ok(v150['h2'].opacitet < 0.05,
      `rubriken syns redan vid 150 ms (${v150['h2'].opacitet}) — texten ar sist i samlingen.`);

    const v300 = r2.matningar[300];
    assert.ok(v300['.fan-profile'].opacitet > v300['.fan-level-pill'].opacitet,
      `vid 300 ms ar avataren pa ${v300['.fan-profile'].opacitet} och pillen pa ` +
      `${v300['.fan-level-pill'].opacitet} — avataren ska ligga fore.`);
    assert.ok(v300['.fan-level-pill'].opacitet > v300['h2'].opacitet,
      `vid 300 ms ar pillen pa ${v300['.fan-level-pill'].opacitet} och rubriken pa ` +
      `${v300['h2'].opacitet} — pillen ska ligga fore texten.`);

    const s = r2.matningar[TAKT.textFran + 5]['h2'];
    const h = r2.matningar[halva]['h2'];
    const e = r2.matningar[TAKT.textTill]['h2'];
    assert.ok(Math.abs(s.ty) > 1, `texten borjar pa ${s.ty} px — den ska starta forskjuten.`);
    assert.ok(Math.abs(e.ty) <= 1, `texten har inte landat vid ${TAKT.textTill} ms (${e.ty} px).`);
    const andel = (s.ty - h.ty) / (s.ty - e.ty);
    assert.ok(andel > 0.35 && andel < 0.65,
      `vid halva texttiden (${halva} ms) har ${(andel * 100).toFixed(0)} % av rorelsen skett. ` +
      'Utanfor 35-65 % snappar rorelsen i stallet for att ga.');
    assert.ok(r2.matningar[PLAN.enterMs - 10]['h2'].opacitet > 0.95,
      'texten ar inte framme nar fas 2 tar slut.');
  });

// ---- 16g. FAN-SPECIFIKA VAKTER: den doda entren ar borta, baslagren gar obrutna ---------------
// Tva saker som bara galler Fan:
//   A) `fanAlertEnter` ska vara NEUTRALISERAD. Den ar halvdod i dag (rotens transform ar last av
//      !important, bara blur nar fram) och ersatts av koreografin. Ligger den kvar konkurrerar
//      dess blur-puls med fas 1.
//   B) `fanLevelPop` och `fanRing` ska ga OBRUTNA genom fas 1-3. De ar infinita baslager som
//      lever redan fore tandning. Provet mater `startTime`: en omstart ger ett nytt varde aven
//      om namnet ser likadant ut — samma vakt som Gifters 15g pa `gl-orbit`.
test('16g. fanAlertEnter ar borta och de infinita baslagren gar obrutna', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async ({ modell, baslager }) => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:fanlevel:layout:' + modell);
    w.x = 40; w.y = 40; w.fanDuration = 2;
    state.widgets.push(w); selected = null; render();
    for (let i = 0; i < 90 && !document.querySelector(`[data-id="${w.id}"]`); i++)
      await new Promise(r => requestAnimationFrame(r));
    const box = document.querySelector(`[data-id="${w.id}"]`);
    if (!box) return { fel: modell + ' renderades inte' };

    /* VANTA IN ATT BASLAGREN FAKTISKT HAR STARTAT innan vi triggar. En nyss skapad animation
       ar PENDING tills den fatt sin forsta bildruta, och da ar startTime `null`. Utan den har
       vantan mattes fas 1 pa null och fas 2 pa ett riktigt varde, och provet rapporterade en
       "omstart" som aldrig hant. Att gora forutsattningen sann ar ratt fix — att lata provet
       godta null hade dolt en akta omstart, som ocksa passerar genom pending. */
    const startade = () => ['.fan-burst img', '.fan-burst > i'].every(sel => {
      const el = box.querySelector(sel);
      return el && el.getAnimations().some(a => a.startTime !== null);
    });
    const startDeadline = performance.now() + 3000;
    while (performance.now() < startDeadline && !startade())
      await new Promise(r => requestAnimationFrame(r));
    if (!startade()) return { fel: 'baslagren startade aldrig — kor fanLevelPop/fanRing alls?' };

    const prov = {};
    const las = (fas) => {
      const bild = box.querySelector('.fan-burst img');
      const ring = box.querySelector('.fan-burst > i');
      const plocka = (el) => el ? el.getAnimations().map(a => ({
        namn: a.animationName, spelar: a.playState,
        start: a.startTime === null ? null : Math.round(Number(a.startTime)) })) : [];
      prov[fas] = {
        rotAnimation: getComputedStyle(box).animationName,
        baslager: [...plocka(bild), ...plocka(ring)]
          .filter(a => baslager.includes(a.namn)),
      };
    };

    new MutationObserver(() => {
      const f = box.getAttribute('data-fas');
      if (f && prov[f] === undefined) las(f);
    }).observe(box, { attributes: true, attributeFilter: ['data-fas'] });

    if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
    window.triggerFanLevelUp({ __test: true, name: 'Prov', level: 9 });

    const deadline = performance.now() + 12000;
    while (performance.now() < deadline && prov.upplosning === undefined)
      await new Promise(r => setTimeout(r, 16));
    return { fel: null, prov };
  }, { modell: MODELL, baslager: BASLAGER });
  await page.close();

  assert.equal(r.fel, null, r.fel + ` ${SAKNAS}`);
  for (const fas of FASER)
    assert.ok(r.prov[fas], `fasen "${fas}" observerades aldrig. ${SAKNAS}`);

  // A) Den doda entren ska vara borta i ALLA faser.
  for (const fas of FASER)
    assert.ok(!/fanAlertEnter/.test(String(r.prov[fas].rotAnimation)),
      `i fasen "${fas}" har roten fortfarande animationName "${r.prov[fas].rotAnimation}". ` +
      '`fanAlertEnter` ar halvdod — dess transform blockeras av `transform:...!important` pa ' +
      'samma element och bara `filter: blur` nar fram. Den ska neutraliseras, inte lagas.');

  // B) Baslagren obrutna genom fas 1-3.
  const referens = {};
  for (const fas of ['ljus', 'oppna', 'hyllning']) {
    for (const namn of BASLAGER) {
      const a = r.prov[fas].baslager.find(x => x.namn === namn);
      assert.ok(a, `i fasen "${fas}" kor ${namn} inte alls. Ett infinit baslager far aldrig ` +
        'stallas av — satt aldrig `animation` pa ett element som ager ett.');
      // En pending animation (startTime null) far aldrig godtas tyst: bade en nystartad och en
      // OMSTARTAD animation passerar genom det laget, sa null hade gjort vakten tandlos.
      assert.notEqual(a.start, null,
        `${namn} ar pending (startTime null) i fasen "${fas}" — den har antingen aldrig ` +
        'startat eller precis startats om.');
      assert.equal(a.spelar, 'running',
        `${namn} har playState "${a.spelar}" i fasen "${fas}".`);
      if (referens[namn] === undefined) referens[namn] = a.start;
      else assert.equal(a.start, referens[namn],
        `${namn} har startTime ${a.start} i fasen "${fas}" men ${referens[namn]} i fas 1 — ` +
        'baslagret har STARTATS OM. Att namnet ser likadant ut racker inte.');
    }
  }
});
