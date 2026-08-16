'use strict';
// Gifter Level Up · modell `duo` — fyrafaskoreografi. Prov 12a-12f, skrivna FORE koden.
//
// De generella vakterna (G1, G2) ligger i gifter-fas-generella.browser.test.js och tacker duo
// automatiskt sa fort den star i modelltabellen — de upprepas darfor INTE har.
//
// DUO AR VARKEN FLIP ELLER SIDEBADGE. Uppmatt (mat-modell-delar.js + diag-sidebadge-layout.js):
//   widgeten 300x151, CSS grid med FYRA kolumner (sidebadge 2, flip 3):
//     columns 74,4 / 24,4 / 44,4 / 108,7
//     areas "diamond pulse avatar badge" / "head head head head"
//           / "name name name name" / "msg msg msg msg"
//   Pulslinjen sitter MELLAN diamanten och portrattet. Text i full bredd under.
//   diamantskiva 74x74 · portratt 44x44 (127,27) · bricka 108x25 (179,37)
//   `.gifter-diamond-row` ar display:contents, sa SKIVAN sitter direkt i griden — tvartom mot
//   flip dar raden ar den roterande enheten.
//   Duo delar INTE ett enda animationsnamn med flip: gSnapPulse, gl-trace, gl-beat, gl-in-right
//   mot flips gl-flip / gCoinFlipIn. Ingen risk for konkurrerande keyframes.
//
// PREMISSEN: PULSEN. Den ligger i designens egna keyframes:
//     @keyframes gl-trace{0%{transform:scaleX(0);opacity:.4} 100%{transform:scaleX(1);opacity:1}}
//     @keyframes gl-beat {0%,100%{scaleY(1)} 42%{scaleY(1.9)} 58%{scaleY(.75)}}
//     @keyframes gPulseDraw{from{clip-path:inset(0 100% 0 0)} to{clip-path:inset(0 0 0 0)}}
// En linje som RITAS och sedan SLAR — scaleY 1 -> 1,9 -> 0,75 ar en EKG-spik. Basregeln har
// `clip-path:inset(0 100% 0 0)`, alltsa helt bortklippt tills nagot ritar den.
// Koreografin: pulsen gar fran gavan till personen, och portrattet snapper in nar den nar fram.
//
// ATT NEUTRALISERA (fyra): gSnapPulse pa .gifter-orbit OCH .gifter-diamond-stack,
//   gl-trace + gl-beat pa .gifter-pulse-line, gl-in-right pa .gifter-level-badge.
// DOD ROrELSE (ror inte, parkerad TODO): heartSpark, gl-in-left (raden), gl-in-right (bottenprofilen).
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

const MODELL = 'duo';
const FASER = ['ljus', 'oppna', 'hyllning', 'upplosning'];
const PLAN = { anticipationMs: 500, enterMs: 900, exitMs: 600 };
const SAKNAS = `Star "${MODELL}" i modelltabellen MODELLER i gifter-fas.js, och finns puls-CSS:en?`;

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

async function korDuo(page, { gifterDuration = 2, bildSrc = null, ocksaFan = false } = {}) {
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

// ---- 12a. Fasordning och langder --------------------------------------------------------------
test(`12a. ${MODELL} kor alla fyra faser i ratt ordning med planerade langder`, { skip }, async () => {
  const page = await studion();
  const r = await korDuo(page, { gifterDuration: 2 });
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

// ---- 12b. holdMs kommer fran widgetens gifterDuration -----------------------------------------
test('12b. hyllningsfasen laser gifterDuration, inte ett fast varde', { skip }, async () => {
  const page = await studion();
  const r = await korDuo(page, { gifterDuration: 3 });
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

// ---- 12c. Kointegration ------------------------------------------------------------------------
test('12c. kon slapper inte fram nasta alert mitt i duos sekvens', { skip }, async () => {
  const page = await studion();
  const r = await korDuo(page, { gifterDuration: 2, ocksaFan: true });
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

// ---- 12d. Duo ar inkopplad i modelltabellen ---------------------------------------------------
test('12d. duo star i modelltabellen VyraGifterFas.modeller', { skip }, async () => {
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

// ---- 12e. Decode-grinden i duos koreografi ----------------------------------------------------
// decodeTimeoutMs 900 som reveal och flip: portrattet SNAPPER IN nar pulsen nar det, alltsa
// avslojas det. Med standardtaket 500 mot en lika lang ljusfas kan grinden aldrig bli bindande.
for (const fall of [
  { namn: 'snabb bild (100 ms)', src: '/bild.png?ms=100', minOppna: 400, maxOppna: 800, varning: false },
  { namn: 'langsam men inom tidsgransen (300 ms)', src: '/bild.png?ms=300', minOppna: 400, maxOppna: 800, varning: false },
  { namn: 'for sen bild (1100 ms, over taket 900 ms)', src: '/bild.png?ms=1100', minOppna: 800, maxOppna: 1300, varning: true },
  { namn: 'bilden fallerar (404)', src: '/bild.png?ms=50&fel=1', minOppna: 400, maxOppna: 900, varning: true },
]) {
  test(`12e. decode-grind pa ${MODELL} — ${fall.namn}`, { skip }, async () => {
    const page = await studion();
    const r = await korDuo(page, { gifterDuration: 1, bildSrc: fall.src });
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

/* ---- 12f. PULSVAKTEN — duos egen premiss ------------------------------------------------------
   Tre delar, alla mätta pa BERAKNADE varden och aldrig pa klassnamn:
     A  linjen RITAS  — clip-path gar monotont fran helt klippt till helt oppen under fas 2
     B  linjen SLAR   — scaleY ur beraknad matris overstiger 1,5 minst en gang
     C  grinden       — portrattet snapper aldrig in fore avkodningen
   Ett prov som bara sag "pulslinjen syns" hade varit gront aven med en statisk streck — och
   dessutom fel, eftersom basregeln klipper bort den helt. */

// inset(t r b l): hogerkanten ar den som gar 100 % -> 0 % nar linjen ritas.
function hogerInsetUr(clip) {
  if (!clip || clip === 'none') return null;
  const m = /^inset\(([^)]+)\)/.exec(clip.trim());
  if (!m) return null;
  const bitar = m[1].split('/')[0].trim().split(/\s+/);
  const proc = v => { const x = /^([\d.]+)%$/.exec(v); return x ? Number(x[1]) : (/^0(px)?$/.test(v) ? 0 : null) };
  if (!bitar.length) return null;
  const hoger = bitar.length >= 2 ? bitar[1] : bitar[0];
  return proc(hoger);
}
function scaleYUr(transform) {
  if (!transform || transform === 'none') return null;
  const m = /matrix\(([^)]+)\)/.exec(transform);
  if (m) { const d = m[1].split(',').map(Number); return d.length >= 6 ? d[3] : null }
  const m3 = /matrix3d\(([^)]+)\)/.exec(transform);
  if (m3) { const d = m3[1].split(',').map(Number); return d.length >= 16 ? d[5] : null }
  return null;
}

test('12f. duos pulslinje ritas och slar under fas 2', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async (modell) => {
    state.widgets.length = 0;
    const g = window.VyraWidgets.create('catalog:gifterlevel:' + modell);
    g.x = 40; g.y = 40; g.gifterDuration = 2;
    state.widgets.push(g); selected = null; render();
    for (let i = 0; i < 90 && !document.querySelector(`[data-id="${g.id}"]`); i++)
      await new Promise(r => requestAnimationFrame(r));
    const box = document.querySelector(`[data-id="${g.id}"]`);
    if (!box) return { fel: modell + ' renderades inte' };
    const linje = box.querySelector('.gifter-pulse-line');
    if (!linje) return { fel: '.gifter-pulse-line finns inte i ' + modell };

    let t0 = null;
    const prov = [];
    new MutationObserver(() => {
      if (box.getAttribute('data-fas') === 'oppna' && t0 === null) t0 = performance.now();
    }).observe(box, { attributes: true, attributeFilter: ['data-fas'] });

    if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
    window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12 });

    // ABSOLUT tidsgrans (lardom fran 10f), och sampla bara INOM fas 2 (lardom fran samma prov).
    const start = performance.now();
    await new Promise(klar => {
      const tick = () => {
        const nu = performance.now();
        if (t0 !== null) {
          if (box.getAttribute('data-fas') !== 'oppna') return klar();
          const s = getComputedStyle(linje);
          prov.push({ vid: Math.round(nu - t0), clip: s.clipPath, transform: s.transform });
        }
        if (nu - start > 12000) return klar();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return { fel: null, naddeFas2: t0 !== null, prov };
  }, MODELL);
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.equal(r.naddeFas2, true,
    `${MODELL} nadde aldrig fas "oppna" — ingen puls kunde mätas. ${SAKNAS}`);

  // ---- A. Ritningen ----------------------------------------------------------------------------
  const insets = r.prov.map(p => ({ vid: p.vid, v: hogerInsetUr(p.clip), raw: p.clip }))
                       .filter(p => p.v !== null);
  const forstaClip = r.prov.length ? r.prov[0].clip : 'ingen';
  assert.ok(insets.length > 0,
    `Duos pulslinje ritas inte — clip-path stod kvar pa ${JSON.stringify(forstaClip)} hela fas 2. ` +
    `Forvantat en inset() som gar fran 100 % till 0 %. ${SAKNAS}`);
  const forst = insets[0].v, sist = insets[insets.length - 1].v;
  assert.ok(forst - sist >= 50,
    `Duos pulslinje ritas inte — clip-path stod kvar pa ${JSON.stringify(insets[0].raw)} hela fas 2 ` +
    `(hogerinset gick fran ${forst} % till ${sist} %, forvantat en rorelse pa minst 50 procentenheter).`);
  assert.ok(forst > sist,
    `Duos pulslinje ritas i fel riktning: fran ${forst} % till ${sist} % under fas 2 — ` +
    `den ska ritas fran gavan mot personen, alltsa hogerinset 100 % -> 0 %.`);
  const backslag = insets.filter((p, i) => i > 0 && p.v > insets[i - 1].v + 1);
  assert.equal(backslag.length, 0,
    `Duos pulslinje ritas i fel riktning: den gar bakat pa ${backslag.length} stallen under fas 2 ` +
    `(t.ex. ${JSON.stringify(backslag[0])}) — ritningen ska vara monoton.`);

  // ---- B. Slaget -------------------------------------------------------------------------------
  const scaleY = r.prov.map(p => scaleYUr(p.transform)).filter(v => v !== null);
  const max = scaleY.length ? Math.max(...scaleY) : 0;
  assert.ok(max > 1.5,
    `Duos pulslinje slog inte under fas 2 — uppmatt maximal scaleY: ${max.toFixed(3)} ` +
    `(forvantat > 1,5). En ritad men stillastaende linje ar ingen puls.`);
});

test('12f. duos portratt snapper aldrig in innan bilden ar avkodad', { skip }, async () => {
  const page = await studion();
  /* 1000 ms, inte 700. Duos portratt snapper 350 ms IN I fas 2, alltsa vid 850 ms absolut om
     grinden ar borta (fas 2 startar da vid ljusfasens 500 ms). En 700 ms-bild ar avkodad vid
     ~730 ms och hinner fore anda — provet passerade darfor AVEN med grinden borttagen, vilket
     mutationsprovet avslojade. Med 1000 ms kan bara grinden radda situationen:
        utan grind:  fas 2 vid 500 -> portrattet vid 850 ms < 1000 ms avkodning  -> BLANKT
        med grind:   fas 2 vid 900 -> portrattet vid 1250 ms > 1000 ms           -> ratt
     En vakt vars mutation inte faller bevisar ingenting. */
  const LANGSAM = '/bild.png?ms=1000';
  const r = await page.evaluate(async ({ modell, src }) => {
    state.widgets.length = 0;
    const g = window.VyraWidgets.create('catalog:gifterlevel:' + modell);
    g.x = 40; g.y = 40; g.gifterDuration = 2;
    state.widgets.push(g); selected = null; render();
    for (let i = 0; i < 90 && !document.querySelector(`[data-id="${g.id}"]`); i++)
      await new Promise(r => requestAnimationFrame(r));
    const box = document.querySelector(`[data-id="${g.id}"]`);
    if (!box) return { fel: modell + ' renderades inte' };
    const portratt = box.querySelector('.gifter-orbit');
    const bild = box.querySelector('.gifter-orbit img');
    if (!portratt || !bild) return { fel: 'portrattet eller dess bild saknas' };

    const t0 = performance.now();
    let tAvkodad = null, tSnapp = null, sista = null;

    bild.src = src;
    bild.decode().then(() => { if (tAvkodad === null) tAvkodad = Math.round(performance.now() - t0) })
                 .catch(() => { if (tAvkodad === null) tAvkodad = Math.round(performance.now() - t0) });

    if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
    window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12 });

    await new Promise(klar => {
      const tick = () => {
        const o = Number(getComputedStyle(portratt).opacity);
        sista = o;
        if (tSnapp === null && o > 0.5) tSnapp = Math.round(performance.now() - t0);
        if (performance.now() - t0 > 2600) return klar();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return { fel: null, tAvkodad, tSnapp, sista };
  }, { modell: MODELL, src: LANGSAM });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.notEqual(r.tAvkodad, null, 'bilden blev varken avkodad eller fallerad inom provets fonster');
  assert.notEqual(r.tSnapp, null,
    `Portrattet snappte aldrig in — opaciteten stod kvar pa ${r.sista} hela sekvensen. ${SAKNAS}`);

  assert.ok(r.tSnapp >= r.tAvkodad,
    `Duos portratt snappte in vid ${r.tSnapp} ms, men bilden avkodades vid ${r.tAvkodad} ms — ` +
    `decode-grinden fungerar inte. Portrattet snappte in blankt.`);
});
