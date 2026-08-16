'use strict';
// Gifter Level Up · modell `orbitlevel` — fyrafaskoreografi. Prov 15a-15g, skrivna FORE koden.
// Sista modellen av nio: stack 8, reveal 9, sidebadge 10, flip 11, duo 12, profile 13,
// number 14, orbitlevel 15.
//
// PREMISS: "BANAN". Uppmatt fore tandning kor ringen (`i` barn #1 i .gifter-orbit,
// display:block, egen opacitet 1) redan `gOrb` med iteration-count infinite. Widgeten ar
// opacity:0/visibility:hidden, sa rorelsen ar OSYNLIG — men den startar aldrig om. Scenen
// snurrar alltsa redan; alerten ar ogonblicket da medaljongen gar in i banan.
//
// DARFOR NEUTRALISERAS gOrbitSpinIn. Vid tandning lagger `.gifter-active` en KONKURRERANDE
// shorthand pa samma ring: `gOrbitSpinIn .7s, gOrb 7s linear infinite .7s`. Den ersatter
// ringens eviga rotation med ett 720-graderssnurr och startar sedan om den. Det motsager
// premissen rakt av, sa fas-CSS:en deklarerar om shorthanden med ENBART gOrb. Prov 15f mater
// exakt det — pa animationName, inte pa klassnamn.
//
// TVA MATNINGAR SOM AVGJORDE FORMEN:
//
//   1. `.gifter-diamond-stack` AGER `gl-orbit` (radie 38 px, infinit). En fas-regel som satter
//      `animation` pa DEN skulle ersatta hela shorthanden och doda banan. Darfor koreograferas
//      medaljongen via sin FORALDER `.gifter-diamond-row`, som inte har nagon animation alls.
//      Prov 15g vaktar att banan gar obrutet.
//
//   2. PORTRATTET TONAR IN I FAS 1, INTE I FAS 2 — och darfor ar decodeTimeoutMs 500, inte 900
//      som forst foreslogs. Premissen sager att SCENEN tonar in ur morkret, och portrattet hor
//      till scenen, inte till ankomsten. Duos matning ar entydig: grinden haller bara tillbaka
//      fas 2, sa ett portratt som visas i fas 1 kan den inte skydda alls. Att sla pa taket 900
//      hade da bara sett bra ut i tabellen. Grinden ar en medveten no-op har, precis som pa
//      sidebadge — och prov G1 vaktar anda att ankaret ar ett synligt element.
//      Foljden ar att G3 hoppar over orbitlevel; det ar korrekt, inte ett hal.
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

const MODELL = 'orbitlevel';
const FASER = ['ljus', 'oppna', 'hyllning', 'upplosning'];
const PLAN = { anticipationMs: 500, enterMs: 900, exitMs: 600 };
// Taktningen inuti fas 2, ur den godkanda fastabellen.
const TAKT = { medaljongFran: 300, medaljongTill: 650, textFran: 350, textTill: 860 };
const TEXTEN = ['.gifter-level-badge', 'h2', 'h3', 'p'];
const RINGEN = '.gifter-orbit > i:nth-child(1)';
const SAKNAS = `Star "${MODELL}" i modelltabellen MODELLER i gifter-fas.js?`;

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

async function korOrbit(page, { gifterDuration = 2, bildSrc = null, ocksaFan = false } = {}) {
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
    return { fel: null, logg, fanVid,
             slutKlass: box.className, slutDataFas: box.getAttribute('data-fas') };
  }, { gifterDuration, bildSrc, ocksaFan, modell: MODELL });
}

/* Deterministisk provtagning i fas 2 — samma teknik som 13g/14g: pausa allt, satt currentTime.
   De OANDLIGA lagren (gOrb, gl-orbit) lases till 0 sa provet inte varierar mellan korningar. */
async function provaFas2(page, punkter, { gifterDuration = 4 } = {}) {
  return page.evaluate(async (arg) => {
    state.widgets.length = 0;
    const g = window.VyraWidgets.create('catalog:gifterlevel:' + arg.modell);
    g.x = 40; g.y = 40; g.gifterDuration = arg.gifterDuration;
    state.widgets.push(g); selected = null; render();
    for (let i = 0; i < 90 && !document.querySelector(`[data-id="${g.id}"]`); i++)
      await new Promise(r => requestAnimationFrame(r));
    const box = document.querySelector(`[data-id="${g.id}"]`);
    if (!box) return { fel: arg.modell + ' renderades inte' };

    if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
    window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12 });

    const deadline = performance.now() + 6000;
    while (performance.now() < deadline && box.getAttribute('data-fas') !== 'oppna')
      await new Promise(r => setTimeout(r, 10));
    if (box.getAttribute('data-fas') !== 'oppna')
      return { fel: 'fas 2 ("oppna") kom aldrig inom 6000 ms — sedd fas: ' +
                    JSON.stringify(box.getAttribute('data-fas')) };

    const anims = box.getAnimations({ subtree: true });
    for (const a of anims) a.pause();

    const alla = arg.texten.concat(['.gifter-diamond-row', '.gifter-orbit']);
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
  }, { punkter, gifterDuration, modell: MODELL, texten: TEXTEN });
}

// ---- 15a. Fasordning och langder --------------------------------------------------------------
test(`15a. ${MODELL} kor alla fyra faser i ratt ordning med planerade langder`, { skip }, async () => {
  const page = await studion();
  const r = await korOrbit(page, { gifterDuration: 2 });
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

// ---- 15b. holdMs kommer fran widgetens gifterDuration -----------------------------------------
test('15b. hyllningsfasen laser gifterDuration, inte ett fast varde', { skip }, async () => {
  const page = await studion();
  const r = await korOrbit(page, { gifterDuration: 3 });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  assert.ok(vid.hyllning != null && vid.upplosning != null,
    `hyllning eller upplosning uteblev — faser sedda: ${JSON.stringify(r.logg.map(l => l.fas))}. ${SAKNAS}`);
  const hyllning = vid.upplosning - vid.hyllning;
  assert.ok(Math.abs(hyllning - 3000) <= 250,
    `hyllningen varade ${hyllning} ms — widgetens gifterDuration ar 3 s.`);
});

// ---- 15c. Kointegration ------------------------------------------------------------------------
test('15c. kon slapper inte fram nasta alert mitt i orbitlevels sekvens', { skip }, async () => {
  const page = await studion();
  const r = await korOrbit(page, { gifterDuration: 2, ocksaFan: true });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  assert.ok(vid.upplosning != null,
    `${MODELL} nadde aldrig upplosningsfasen — faser sedda: ` +
    `${JSON.stringify(r.logg.map(l => l.fas))}. ${SAKNAS}`);
  const sekvensSlut = vid.upplosning + PLAN.exitMs;
  assert.notEqual(r.fanVid, null, 'Fan fick aldrig sin tur inom provets tidsfonster');
  assert.ok(r.fanVid >= sekvensSlut - 200,
    `Fan tandes vid ${r.fanVid} ms men ${MODELL}s sekvens var klar forst vid ${sekvensSlut} ms. ` +
    `Saknas posten "gifter-fas:${MODELL}" i window.VyraFasKoreografi?`);
});

// ---- 15d. Orbitlevel ar inkopplad, med ratt ankare och medvetet tak ---------------------------
test('15d. orbitlevel star i modelltabellen med orbitportrattet som ankare', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(() => {
    const G = window.VyraGifterFas;
    if (!G || !Array.isArray(G.modeller)) return { fel: 'VyraGifterFas.modeller saknas' };
    return { fel: null, modeller: G.modeller.slice(),
             ankare: typeof G.ankare === 'function' ? G.ankare('orbitlevel') : undefined,
             tak: typeof G.decodeTak === 'function' ? G.decodeTak('orbitlevel') : undefined };
  });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.ok(r.modeller.includes(MODELL),
    `"${MODELL}" star inte i VyraGifterFas.modeller. Registrerade: ` +
    `${JSON.stringify(r.modeller)}. ${SAKNAS}`);
  assert.equal(r.ankare, '.gifter-orbit img',
    `orbitlevel deklarerar decodeAnkare ${JSON.stringify(r.ankare)} — portrattet sitter i ` +
    'orbiten i den har modellen, och .gifter-bottom-profile ar display:none.');
  // 500, inte 900: portrattet tonar in redan i FAS 1 tillsammans med scenen, och grinden haller
  // bara tillbaka fas 2. Ett hogre tak hade sett bra ut i tabellen utan att skydda nagot.
  assert.equal(r.tak, 500,
    `orbitlevels decodeTak ar ${r.tak} ms. Portrattet tonar in i fas 1, sa grinden kan per ` +
    'konstruktion inte skydda det — taket ska darfor vara standardens 500 och no-op:en vara ' +
    'medveten, inte doljas bakom ett hogre varde.');
});

// ---- 15e. Decode-grinden i orbitlevels koreografi ---------------------------------------------
for (const fall of [
  { namn: 'snabb bild (100 ms)', src: '/bild.png?ms=100', minOppna: 400, maxOppna: 800, varning: false },
  { namn: 'langsam men inom tidsgransen (300 ms)', src: '/bild.png?ms=300', minOppna: 400, maxOppna: 800, varning: false },
  { namn: 'for sen bild (700 ms, over taket 500 ms)', src: '/bild.png?ms=700', minOppna: 450, maxOppna: 900, varning: true },
  { namn: 'bilden fallerar (404)', src: '/bild.png?ms=50&fel=1', minOppna: 400, maxOppna: 900, varning: true },
]) {
  test(`15e. decode-grind pa ${MODELL} — ${fall.namn}`, { skip }, async () => {
    const page = await studion();
    const r = await korOrbit(page, { gifterDuration: 1, bildSrc: fall.src });
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

// ---- 15f. PREMISSVAKTEN · "Banan" -------------------------------------------------------------
// Fyra pastaenden, alla matta pa BERAKNADE varden:
//   1. RINGEN SNURRAR UTAN OMSTART I FAS 1 — dess animationName innehaller gOrb och INTE
//      gOrbitSpinIn. Det ar hela skillnaden mellan "vi tonar in i nagot som redan gar" och
//      "vi snurrar upp det pa nytt".
//   2. SCENEN TONAR IN — .gifter-orbit ar pa vag upp mitt i fas 1, varken slackt eller full.
//   3. MEDALJONGEN OCH TEXTEN VANTAR — bada ligger pa 0 i fas 1 och kommer i fas 2, medaljongen
//      fore texten.
//   4. TEXTEN LASES — halva rorelsen vid halva tiden.
test('15f. orbitlevel tonar in i en redan snurrande ring, sedan medaljong, sedan text', { skip }, async () => {
  const page = await studion();

  // Del 1-3 kraver realtid: ringens animationName i FAS 1 gar inte att lasa ur en fas 2-riggning.
  const iFas1 = await page.evaluate(async ({ modell, ringen, texten }) => {
    state.widgets.length = 0;
    const g = window.VyraWidgets.create('catalog:gifterlevel:' + modell);
    g.x = 40; g.y = 40; g.gifterDuration = 3;
    state.widgets.push(g); selected = null; render();
    for (let i = 0; i < 90 && !document.querySelector(`[data-id="${g.id}"]`); i++)
      await new Promise(r => requestAnimationFrame(r));
    const box = document.querySelector(`[data-id="${g.id}"]`);
    if (!box) return { fel: modell + ' renderades inte' };

    let ljus = null, matt = null;
    new MutationObserver(() => {
      if (box.getAttribute('data-fas') === 'ljus' && ljus === null) ljus = performance.now();
    }).observe(box, { attributes: true, attributeFilter: ['data-fas'] });

    if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
    window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12 });

    /* ABSOLUT grans tagen FORE loopen. */
    const deadline = performance.now() + 8000;
    while (performance.now() < deadline && matt === null) {
      if (ljus !== null && performance.now() - ljus > 250) {
        const ring = box.querySelector(ringen);
        const op = (sel) => {
          const el = box.querySelector(sel);
          return el ? +(+getComputedStyle(el).opacity).toFixed(3) : null;
        };
        matt = {
          ringFinns: !!ring,
          ringAnimation: ring ? getComputedStyle(ring).animationName : null,
          ringIter: ring ? getComputedStyle(ring).animationIterationCount : null,
          orbit: op('.gifter-orbit'),
          medaljong: op('.gifter-diamond-row'),
          text: Object.fromEntries(texten.map(s => [s, op(s)])),
        };
      }
      await new Promise(r => setTimeout(r, 16));
    }
    return { fel: null, matt };
  }, { modell: MODELL, ringen: RINGEN, texten: TEXTEN });

  assert.equal(iFas1.fel, null, iFas1.fel + ` ${SAKNAS}`);
  assert.ok(iFas1.matt, `hann aldrig mata mitt i fas 1 — kom fasen alls? ${SAKNAS}`);
  const m = iFas1.matt;

  // 1. Ringen gar vidare utan omstart.
  assert.ok(m.ringFinns, `ringen (${RINGEN}) hittades inte i widgeten`);
  assert.match(String(m.ringAnimation), /gOrb\b/,
    `ringens animationName ar "${m.ringAnimation}" — den ska fortsatta rotera med gOrb ` +
    'genom fas 1. Scenen snurrar redan; koreografin ska inte stanna den.');
  assert.ok(!/gOrbitSpinIn/.test(String(m.ringAnimation)),
    `ringens animationName innehaller gOrbitSpinIn ("${m.ringAnimation}"). Den entren ` +
    'ERSATTER den eviga rotationen med ett 720-graderssnurr och startar om den — precis det ' +
    'premissen "en scen som redan snurrar" sager att vi INTE ska gora. Deklarera om ' +
    'shorthanden med enbart gOrb.');

  // 2. Scenen tonar in.
  assert.ok(m.orbit > 0.02 && m.orbit < 0.98,
    `.gifter-orbit har opacitet ${m.orbit} mitt i fas 1 — den ska vara PA VAG upp ur morkret, ` +
    'varken slackt eller redan framme.');

  // 3. Medaljongen och texten vantar.
  assert.ok(m.medaljong != null && m.medaljong < 0.05,
    `medaljongen (.gifter-diamond-row) har opacitet ${m.medaljong} i fas 1 — den ska ga in i ` +
    'banan forst i fas 2.');
  for (const [sel, op] of Object.entries(m.text))
    assert.ok(op != null && op < 0.05,
      `${sel} har opacitet ${op} i fas 1 — texten monteras sist av allt.`);

  // 4. Texten laser sig: halva rorelsen vid halva tiden, plus medaljongen fore texten.
  const halva = Math.round(TAKT.textFran + (TAKT.textTill - TAKT.textFran) / 2);
  const r2 = await provaFas2(page, [TAKT.medaljongFran + 30, TAKT.textFran + 5, halva,
                                    TAKT.textTill, PLAN.enterMs - 10]);
  await page.close();
  assert.equal(r2.fel, null, r2.fel);

  const tidigt = r2.matningar[TAKT.medaljongFran + 30];
  assert.ok(tidigt['.gifter-diamond-row'].opacitet > tidigt['h2'].opacitet,
    `vid ${TAKT.medaljongFran + 30} ms i fas 2 ar medaljongen pa ${tidigt['.gifter-diamond-row'].opacitet} ` +
    `och rubriken pa ${tidigt['h2'].opacitet} — medaljongen ska ga in i banan FORE texten.`);

  const s = r2.matningar[TAKT.textFran + 5]['h2'];
  const h = r2.matningar[halva]['h2'];
  const e = r2.matningar[TAKT.textTill]['h2'];
  assert.ok(Math.abs(s.ty) > 1, `texten borjar pa ${s.ty} px — den ska starta forskjuten.`);
  assert.ok(Math.abs(e.ty) <= 1, `texten har inte landat vid ${TAKT.textTill} ms (${e.ty} px).`);
  const andel = (s.ty - h.ty) / (s.ty - e.ty);
  assert.ok(andel > 0.35 && andel < 0.65,
    `vid halva monteringstiden (${halva} ms) har ${(andel * 100).toFixed(0)} % av rorelsen skett. ` +
    'Utanfor 35-65 % snappar rorelsen i stallet for att ga.');
});

// ---- 15g. BANAN GAR OBRUTET ------------------------------------------------------------------
// Davids uttryckliga krav pa slutbossen. `gl-orbit` ligger pa .gifter-diamond-stack som en
// INFINIT animation, och en fas-regel som satter `animation` pa samma element skulle ersatta
// hela shorthanden och doda banan. Provet mater inte bara ATT en gl-orbit finns i varje fas
// utan att det ar SAMMA animation: `startTime` far inte flytta sig. En omstart ger ett nytt
// startTime aven om namnet ser likadant ut.
//
// FAS 4 AR UNDANTAGET, och det ar avsiktligt: `.gifter-exit .gifter-diamond-stack` lamnar over
// till `gl-spiral`, som spiralar in medaljongen och krymper den. Overlamningen provas ocksa —
// annars hade en olycka som tappade bort exiten kunnat passera som "banan gick obrutet".
test('15g. gl-orbit gar obrutet genom fas 1-3 och lamnar over till gl-spiral i fas 4',
  { skip, timeout: 180000 }, async () => {
    const page = await studion();
    const r = await page.evaluate(async ({ modell }) => {
      state.widgets.length = 0;
      const g = window.VyraWidgets.create('catalog:gifterlevel:' + modell);
      g.x = 40; g.y = 40; g.gifterDuration = 2;
      state.widgets.push(g); selected = null; render();
      for (let i = 0; i < 90 && !document.querySelector(`[data-id="${g.id}"]`); i++)
        await new Promise(r => requestAnimationFrame(r));
      const box = document.querySelector(`[data-id="${g.id}"]`);
      if (!box) return { fel: modell + ' renderades inte' };

      const prov = {};
      const las = (fas) => {
        const stack = box.querySelector('.gifter-diamond-stack');
        if (!stack) { prov[fas] = { fel: '.gifter-diamond-stack saknas' }; return }
        prov[fas] = {
          animationer: stack.getAnimations().map(a => ({
            namn: a.animationName,
            spelar: a.playState,
            // startTime kan vara CSSNumberish; Number() ger millisekunder pa dokumentets
            // tidslinje. En omstart flyttar den, ett fortsatt lopp gor det inte.
            start: a.startTime === null ? null : Math.round(Number(a.startTime)),
          })),
          namnFranCss: getComputedStyle(stack).animationName,
        };
      };

      new MutationObserver(() => {
        const f = box.getAttribute('data-fas');
        if (f && prov[f] === undefined) las(f);
      }).observe(box, { attributes: true, attributeFilter: ['data-fas'] });

      if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
      window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12 });

      const deadline = performance.now() + 12000;
      while (performance.now() < deadline && prov.upplosning === undefined)
        await new Promise(r => setTimeout(r, 16));
      // Lat upplosningen hinna en bit in innan vi domer om overlamningen.
      await new Promise(r => setTimeout(r, 150));
      las('upplosning-sent');
      return { fel: null, prov };
    }, { modell: MODELL });
    await page.close();

    assert.equal(r.fel, null, r.fel + ` ${SAKNAS}`);
    for (const fas of FASER)
      assert.ok(r.prov[fas], `fasen "${fas}" observerades aldrig. ${SAKNAS}`);

    const banan = (fas) => (r.prov[fas].animationer || []).find(a => a.namn === 'gl-orbit');

    // Fas 1-3: samma animation, fortfarande igang.
    let referens = null;
    for (const fas of ['ljus', 'oppna', 'hyllning']) {
      const b = banan(fas);
      assert.ok(b,
        `i fasen "${fas}" kor .gifter-diamond-stack ingen gl-orbit — dess animationName ar ` +
        `"${r.prov[fas].namnFranCss}". En fas-regel som satter \`animation\` pa stacken ` +
        'ERSATTER hela shorthanden och dodar banan. Koreografera foraldern ' +
        '.gifter-diamond-row i stallet.');
      assert.equal(b.spelar, 'running',
        `gl-orbit har playState "${b.spelar}" i fasen "${fas}" — banan ska inte pausas.`);
      if (referens === null) referens = b.start;
      else assert.equal(b.start, referens,
        `gl-orbit har startTime ${b.start} i fasen "${fas}" men ${referens} i fas 1 — ` +
        'banan har STARTATS OM. Att namnet ser likadant ut racker inte; en omstart ger ett ' +
        'nytt startTime och syns som ett hopp i rorelsen.');
    }

    // Fas 4: medveten overlamning till gl-spiral.
    const sent = r.prov['upplosning-sent'];
    const spiral = (sent.animationer || []).find(a => a.namn === 'gl-spiral');
    assert.ok(spiral,
      `i upplosningen kor .gifter-diamond-stack ingen gl-spiral — dess animationName ar ` +
      `"${sent.namnFranCss}". Overlamningen till den befintliga spiralexiten ar avsiktlig och ` +
      'ska inte tappas bort.');
  });
