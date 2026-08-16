'use strict';
// Gifter Level Up · modell `flip` — fyrafaskoreografi. Prov 11a-11f, skrivna FORE koden.
//
// De generella vakterna (G1 decode-ankarets synlighet, G2 fas-CSS utan dod rorelse) ligger i
// gifter-fas-generella.browser.test.js och tacker flip automatiskt sa fort den star i
// modelltabellen — de upprepas darfor INTE har.
//
// ANDRA LIGGANDE ARKETYPEN, men INTE sidebadge med mer text. Uppmatt:
//   Widgeten ar 290x154 och bygger med CSS grid — men med TRE kolumner, inte sidebadges tva:
//     grid-template-columns: 74px 64px 104px
//     grid-template-areas:  "diamond avatar badge" / "head head head"
//                           / "name name name" / "msg msg msg"
//   Alltsa en EMBLEMRAD overst (diamant 12,12 · portratt 98,12 · bricka 174,25) och text som
//   spanner hela bredden under (rubrik 12,82 · namn 12,108 · meddelande 12,131).
//   `.gifter-streak` — sidebadges signaturelement — ar SLACKT har (0x0, position:static),
//   sa svep-receptet gar inte att flytta. Den liggande TAJMINGEN arvs daremot.
//
// PREMISSEN: MYNTVANDNINGEN. Designen sager det sjalv i sina animationsnamn (gl-flip,
// gCoinFlipIn, gl-flip-reveal) och i keyframen:
//     @keyframes gCoinFlipIn{0%{transform:perspective(500px) rotateY(0deg);width:20px}
//                            50%{...rotateY(180deg);width:44px}
//                            100%{...rotateY(360deg);width:20px}}
// Ett 3D-mynt med perspektiv. Koreografin ska vanda de tre emblemen som mynt, i foljd
// vanster -> hoger. Prov 11f vaktar rotationen, ordningen och grinden.
//
// ATT NEUTRALISERA (fyra, mot sidebadges tre — alla uppmatta pa en tand widget):
//   .gifter-orbit          -> gRevealFade .7s
//   .gifter-diamond-row    -> gl-flip .9s
//   .gifter-diamond-stack  -> gCoinFlipIn .7s   (animerar aven `width` — det ar den som far
//                                                myntet att ga pa hogkant)
//   .gifter-level-badge    -> gl-wipe-in .4s
// DOD ROrELSE (ror inte, parkerad TODO): .gifter-orbit-arrow -> heartSpark,
//   .gifter-bottom-profile -> gl-flip-reveal.
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

const MODELL = 'flip';
const FASER = ['ljus', 'oppna', 'hyllning', 'upplosning'];
const PLAN = { anticipationMs: 500, enterMs: 900, exitMs: 600 };
// Emblemraden i lasordning vanster -> hoger, med sina uppmatta x-positioner.
const EMBLEM = [
  { nyckel: 'diamant', sel: '.gifter-diamond-row', x: 12 },
  { nyckel: 'portratt', sel: '.gifter-orbit', x: 98 },
  { nyckel: 'bricka', sel: '.gifter-level-badge', x: 174 },
];
const SAKNAS = `Star "${MODELL}" i modelltabellen MODELLER i gifter-fas.js, och finns mynt-CSS:en?`;

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

async function korFlip(page, { gifterDuration = 2, bildSrc = null, ocksaFan = false } = {}) {
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

// ---- 11a. Fasordning och langder --------------------------------------------------------------
test(`11a. ${MODELL} kor alla fyra faser i ratt ordning med planerade langder`, { skip }, async () => {
  const page = await studion();
  const r = await korFlip(page, { gifterDuration: 2 });
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

// ---- 11b. holdMs kommer fran widgetens gifterDuration -----------------------------------------
test('11b. hyllningsfasen laser gifterDuration, inte ett fast varde', { skip }, async () => {
  const page = await studion();
  const r = await korFlip(page, { gifterDuration: 3 });
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

// ---- 11c. Kointegration ------------------------------------------------------------------------
test('11c. kon slapper inte fram nasta alert mitt i flips sekvens', { skip }, async () => {
  const page = await studion();
  const r = await korFlip(page, { gifterDuration: 2, ocksaFan: true });
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

// ---- 11d. Flip ar inkopplad i modelltabellen --------------------------------------------------
test('11d. flip star i modelltabellen VyraGifterFas.modeller', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(() => {
    const G = window.VyraGifterFas;
    if (!G || !Array.isArray(G.modeller)) return { fel: 'VyraGifterFas.modeller saknas' };
    return { fel: null, modeller: G.modeller.slice() };
  });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.ok(r.modeller.includes(MODELL),
    `"${MODELL}" star inte i VyraGifterFas.modeller — koreografin ar inte inkopplad. ` +
    `Registrerade modeller: ${JSON.stringify(r.modeller)}. ${SAKNAS}`);
});

// ---- 11e. Decode-grinden i flips koreografi ---------------------------------------------------
// Flip har SAMMA exponering som reveal: portrattet sitter i ett mynt som VANDER SIG och avslojar
// ansiktet. Darfor har den ocksa decodeTimeoutMs 900 — med standardtaket 500 mot en lika lang
// ljusfas kan grinden aldrig bli bindande, och "for sen" borjar darfor ovanfor 900 ms.
for (const fall of [
  { namn: 'snabb bild (100 ms)', src: '/bild.png?ms=100', minOppna: 400, maxOppna: 800, varning: false },
  { namn: 'langsam men inom tidsgransen (300 ms)', src: '/bild.png?ms=300', minOppna: 400, maxOppna: 800, varning: false },
  { namn: 'for sen bild (1100 ms, over taket 900 ms)', src: '/bild.png?ms=1100', minOppna: 800, maxOppna: 1300, varning: true },
  { namn: 'bilden fallerar (404)', src: '/bild.png?ms=50&fel=1', minOppna: 400, maxOppna: 900, varning: true },
]) {
  test(`11e. decode-grind pa ${MODELL} — ${fall.namn}`, { skip }, async () => {
    const page = await studion();
    const r = await korFlip(page, { gifterDuration: 1, bildSrc: fall.src });
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

/* ---- 11f. MYNTVAKTEN — flips egen premiss ----------------------------------------------------
   Tre delar, alla mätta pa BERAKNAD TRANSFORM (matrix3d), aldrig pa klassnamn — samma disciplin
   som iris-vaktens clip-path-matning:
     A  de tre emblemen roterar kring Y-axeln under fas 2
     B  de landar i foljd vanster -> hoger: diamant, portratt, bricka
     C  portrattmyntet vander sig aldrig mot tittaren innan bilden ar avkodad
   Ett prov som bara sag "emblemen kom in" hade varit gront aven med en ren fade. */

// perspective(500px) rotateY(θ) ger en matrix3d dar m11 = cos θ. Ett rent 2D-matrix() betyder
// att ingen Y-rotation sker alls.
function m11Ur(transform) {
  if (!transform || transform === 'none') return null;
  const m = /matrix3d\(([^)]+)\)/.exec(transform);
  if (!m) return null;
  const d = m[1].split(',').map(Number);
  return d.length >= 16 ? d[0] : null;
}

test('11f. flips tre emblem roterar kring Y och landar vanster -> hoger', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async ({ modell, emblem }) => {
    state.widgets.length = 0;
    const g = window.VyraWidgets.create('catalog:gifterlevel:' + modell);
    g.x = 40; g.y = 40; g.gifterDuration = 2;
    state.widgets.push(g); selected = null; render();
    for (let i = 0; i < 90 && !document.querySelector(`[data-id="${g.id}"]`); i++)
      await new Promise(r => requestAnimationFrame(r));
    const box = document.querySelector(`[data-id="${g.id}"]`);
    if (!box) return { fel: modell + ' renderades inte' };

    const delar = emblem.map(e => ({ ...e, el: box.querySelector(e.sel) }));
    const saknas = delar.filter(d => !d.el).map(d => d.sel);
    if (saknas.length) return { fel: 'emblemraden saknar ' + saknas.join(', ') };

    let t0 = null;
    const prov = {};
    for (const d of delar) prov[d.nyckel] = [];
    new MutationObserver(() => {
      if (box.getAttribute('data-fas') === 'oppna' && t0 === null) t0 = performance.now();
    }).observe(box, { attributes: true, attributeFilter: ['data-fas'] });

    if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
    window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12 });

    // ABSOLUT tidsgrans — aldrig relativ till t0, som ar null vid rod baslinje (lardom fran 10f).
    const start = performance.now();
    await new Promise(klar => {
      const tick = () => {
        const nu = performance.now();
        if (t0 !== null) {
          if (box.getAttribute('data-fas') !== 'oppna') return klar();
          const vid = Math.round(nu - t0);
          for (const d of delar)
            prov[d.nyckel].push({ vid, transform: getComputedStyle(d.el).transform });
        }
        if (nu - start > 12000) return klar();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return { fel: null, naddeFas2: t0 !== null, prov };
  }, { modell: MODELL, emblem: EMBLEM });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.equal(r.naddeFas2, true,
    `${MODELL} nadde aldrig fas "oppna" — ingen myntvandning kunde mätas. ${SAKNAS}`);

  // ---- A. Rotationen ---------------------------------------------------------------------------
  const landning = {};
  for (const e of EMBLEM) {
    const serie = r.prov[e.nyckel] || [];
    const m11 = serie.map(p => ({ vid: p.vid, v: m11Ur(p.transform), raw: p.transform }))
                     .filter(p => p.v !== null);
    assert.ok(m11.length > 0,
      `Flips emblem ${e.nyckel} roterar inte kring Y-axeln under fas 2 — uppmatt transform: ` +
      `${JSON.stringify(serie.length ? serie[Math.floor(serie.length / 2)].transform : 'ingen')}. ` +
      `En ren 2D-matrix betyder att ingen Y-rotation sker. ${SAKNAS}`);
    const spann = Math.max(...m11.map(p => p.v)) - Math.min(...m11.map(p => p.v));
    assert.ok(spann >= 0.3,
      `Flips emblem ${e.nyckel} roterar inte kring Y-axeln under fas 2 — uppmatt transform: ` +
      `m11 (cos av rotationen) rorde sig bara ${spann.toFixed(3)} (forvantat minst 0,3). ` +
      `Sista transform: ${JSON.stringify(m11[m11.length - 1].raw)}`);

    // Landat = m11 nara 1 (rotateY ~0 eller 360) EFTER att ha varit tydligt bortvant.
    let sagBortvand = false, landadeVid = null;
    for (const p of m11) {
      if (p.v < 0.9) sagBortvand = true;
      if (sagBortvand && landadeVid === null && p.v > 0.98) landadeVid = p.vid;
    }
    landning[e.nyckel] = landadeVid;
  }

  // ---- B. Ordningen ----------------------------------------------------------------------------
  for (const e of EMBLEM)
    assert.notEqual(landning[e.nyckel], null,
      `Flips emblem ${e.nyckel} landade aldrig under fas 2 (m11 nadde aldrig 1 efter att ha varit ` +
      `bortvant). Uppmatta landningar: ${JSON.stringify(landning)}.`);
  for (let i = 1; i < EMBLEM.length; i++) {
    const fore = EMBLEM[i - 1].nyckel, nu = EMBLEM[i].nyckel;
    assert.ok(landning[nu] > landning[fore],
      `Flips ${nu} landade vid ${landning[nu]} ms, men ${fore} vid ${landning[fore]} ms — ` +
      `myntvandningen ska ga vanster -> hoger: ${EMBLEM.map(e => e.nyckel).join(' -> ')}.`);
  }
});

test('11f. flips portrattmynt vander sig aldrig innan bilden ar avkodad', { skip }, async () => {
  const page = await studion();
  const LANGSAM = '/bild.png?ms=700';
  const r = await page.evaluate(async ({ modell, src }) => {
    state.widgets.length = 0;
    const g = window.VyraWidgets.create('catalog:gifterlevel:' + modell);
    g.x = 40; g.y = 40; g.gifterDuration = 2;
    state.widgets.push(g); selected = null; render();
    for (let i = 0; i < 90 && !document.querySelector(`[data-id="${g.id}"]`); i++)
      await new Promise(r => requestAnimationFrame(r));
    const box = document.querySelector(`[data-id="${g.id}"]`);
    if (!box) return { fel: modell + ' renderades inte' };
    const mynt = box.querySelector('.gifter-orbit');
    const bild = box.querySelector('.gifter-orbit img');
    if (!mynt || !bild) return { fel: 'portrattmyntet eller dess bild saknas' };

    const t0 = performance.now();
    let tAvkodad = null, tVand = null, sista = null;

    bild.src = src;
    bild.decode().then(() => { if (tAvkodad === null) tAvkodad = Math.round(performance.now() - t0) })
                 .catch(() => { if (tAvkodad === null) tAvkodad = Math.round(performance.now() - t0) });

    if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
    window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12 });

    /* "Vand mot tittaren" = rotationen har passerat 90 grader, alltsa m11 > 0 med tydlig marginal.
       ABSOLUT tidsgrans (lardom fran 10f). */
    await new Promise(klar => {
      const tick = () => {
        const t = getComputedStyle(mynt).transform;
        sista = t;
        const m = /matrix3d\(([^)]+)\)/.exec(t || '');
        if (m) {
          const v = Number(m[1].split(',')[0]);
          if (tVand === null && v > 0.1) tVand = Math.round(performance.now() - t0);
        }
        if (performance.now() - t0 > 2600) return klar();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return { fel: null, tAvkodad, tVand, sista };
  }, { modell: MODELL, src: LANGSAM });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.notEqual(r.tAvkodad, null, 'bilden blev varken avkodad eller fallerad inom provets fonster');
  assert.notEqual(r.tVand, null,
    `Portrattmyntet vande sig aldrig mot tittaren — beraknad transform stod kvar pa ` +
    `${JSON.stringify(r.sista)} hela sekvensen. ${SAKNAS}`);

  assert.ok(r.tVand >= r.tAvkodad,
    `Flips portrattmynt vande sig mot tittaren vid ${r.tVand} ms, men bilden avkodades vid ` +
    `${r.tAvkodad} ms — decode-grinden fungerar inte. Myntet landade blankt.`);
});
