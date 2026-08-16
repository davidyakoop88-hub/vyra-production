'use strict';
// Gifter Level Up · modell `sidebadge` — fyrafaskoreografi. Prov 10a-10f, skrivna FORE koden.
//
// De generella vakterna (G1 decode-ankarets synlighet, G2 fas-CSS utan dod rorelse) ligger i
// gifter-fas-generella.browser.test.js och tacker sidebadge automatiskt sa fort den star i
// modelltabellen — de upprepas darfor INTE har.
//
// FORSTA LIGGANDE ARKETYPEN. Uppmatt (scratchpad/mat-modell-delar.js + diag-sidebadge-layout.js):
//   Widgeten ar 300x156 — bredare an hog, mot de staende modellernas 270x~400.
//   Den bygger med CSS GRID och namngivna areas, inte med flex order (alla order matte 0):
//     grid-template-columns: 64px 1fr        (uppmatt 64px 202px)
//     grid-template-areas:  "diamond head" / "diamond badge" / "avatar name" / "avatar msg"
//   Emblemkolumnen till vanster (diamant 12,12 · portratt 12,88), textkolumnen till hoger
//   (rubrik 86,18 · bricka 86,55 · namn 86,94 · meddelande 86,128).
//   Griden sätts med !important och ar sidebadges BAS — koreografin ligger ovanpa den med
//   transform/opacity/filter och ror den aldrig.
//
// PREMISSEN: STRALEN SOM SKRIVER. `.gifter-streak` ar 26x2, absolut positionerad vid
// kolumngransen (82,48), en linear-gradient(90deg) — alltsa en LJUSSTRALE, inte en form.
// Basregeln studio.css:203 slacker den globalt och BARA sidebadge tander den (studio.css:205).
// Rorelsen ska darfor ga I SIDLED: stralen sveper vanster -> hoger och textkolumnen fods BAKOM
// den. Det ar vad som gor sidebadge till en egen arketyp, och vad flip och duo sedan arver.
// Prov 10f vaktar exakt det.
//
// ATT NEUTRALISERA (alla tre synliga, uppmatta pa en tand widget):
//   .gifter-diamond-row   -> gl-spin-in .7s     (RADEN snurrar in, inte skivan — tvartom mot stack)
//   .gifter-level-badge   -> gl-wipe-in .58s
//   .gifter-streak        -> gStreakSweep .5s
// DOD ROrELSE (ror inte, parkerad TODO): .gifter-orbit-arrow -> heartSpark.
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

const MODELL = 'sidebadge';
const FASER = ['ljus', 'oppna', 'hyllning', 'upplosning'];
const PLAN = { anticipationMs: 500, enterMs: 900, exitMs: 600 };
const SAKNAS = `Star "${MODELL}" i modelltabellen MODELLER i gifter-fas.js, och finns stral-CSS:en?`;

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

async function korSidebadge(page, { gifterDuration = 2, bildSrc = null, ocksaFan = false } = {}) {
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

// ---- 10a. Fasordning och langder --------------------------------------------------------------
test(`10a. ${MODELL} kor alla fyra faser i ratt ordning med planerade langder`, { skip }, async () => {
  const page = await studion();
  const r = await korSidebadge(page, { gifterDuration: 2 });
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

// ---- 10b. holdMs kommer fran widgetens gifterDuration -----------------------------------------
test('10b. hyllningsfasen laser gifterDuration, inte ett fast varde', { skip }, async () => {
  const page = await studion();
  const r = await korSidebadge(page, { gifterDuration: 3 });
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

// ---- 10c. Kointegration ------------------------------------------------------------------------
test('10c. kon slapper inte fram nasta alert mitt i sidebadges sekvens', { skip }, async () => {
  const page = await studion();
  const r = await korSidebadge(page, { gifterDuration: 2, ocksaFan: true });
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

// ---- 10d. Sidebadge ar inkopplad i modelltabellen ---------------------------------------------
test('10d. sidebadge star i modelltabellen VyraGifterFas.modeller', { skip }, async () => {
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

// ---- 10e. Decode-grinden i sidebadges koreografi ----------------------------------------------
// Sidebadge AVSLOJAR inte portrattet som reveal — den tonar in det — sa standardtaket 500 ms
// racker. Grinden ar anda ratt inkopplad: fas 2 far inte starta mot en bild som saknas.
for (const fall of [
  { namn: 'snabb bild (100 ms)', src: '/bild.png?ms=100', minOppna: 400, maxOppna: 800, varning: false },
  { namn: 'langsam men inom tidsgransen (300 ms)', src: '/bild.png?ms=300', minOppna: 400, maxOppna: 800, varning: false },
  { namn: 'for sen bild (700 ms, over 500 ms)', src: '/bild.png?ms=700', minOppna: 450, maxOppna: 900, varning: true },
  { namn: 'bilden fallerar (404)', src: '/bild.png?ms=50&fel=1', minOppna: 400, maxOppna: 900, varning: true },
]) {
  test(`10e. decode-grind pa ${MODELL} — ${fall.namn}`, { skip }, async () => {
    const page = await studion();
    const r = await korSidebadge(page, { gifterDuration: 1, bildSrc: fall.src });
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

/* ---- 10f. STRALVAKTEN — sidebadges egen premiss ----------------------------------------------
   Sidebadge ar den forsta liggande arketypen, och dess enda unika element ar en ljusstrale vid
   kolumngransen. Koreografin ar darfor: stralen sveper I SIDLED och textkolumnen fods BAKOM den.
   Tre delar, alla mätta med rAF-sampling under fas 2:
     A  stralen ror sig i sidled — translateX andras, monotont
     B  textkolumnens fyra delar fods i ordning: rubrik -> bricka -> namn -> meddelande
     C  ingen textdel fods innan stralen har borjat svepa
   Ett prov som bara sag "texten kom in" hade varit gront aven med en helt statisk strale. */
function translateXUr(transform) {
  if (!transform || transform === 'none') return null;
  const m = /matrix\(([^)]+)\)/.exec(transform);
  if (m) { const d = m[1].split(',').map(Number); return d.length >= 6 ? d[4] : null }
  const m3 = /matrix3d\(([^)]+)\)/.exec(transform);
  if (m3) { const d = m3[1].split(',').map(Number); return d.length >= 16 ? d[12] : null }
  return null;
}

test('10f. sidebadges strale sveper i sidled och textkolumnen fods bakom den', { skip }, async () => {
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
    const strale = box.querySelector('.gifter-streak');
    if (!strale) return { fel: '.gifter-streak finns inte i ' + modell };

    const DELAR = [
      { nyckel: 'rubrik', sel: 'h2' },
      { nyckel: 'bricka', sel: '.gifter-level-badge' },
      { nyckel: 'namn', sel: 'h3' },
      { nyckel: 'meddelande', sel: 'p' },
    ].map(d => ({ ...d, el: box.querySelector(d.sel) }));
    const saknas = DELAR.filter(d => !d.el).map(d => d.sel);
    if (saknas.length) return { fel: 'textkolumnen saknar ' + saknas.join(', ') };

    let t0 = null;
    const stralProv = [];
    const fodd = {};
    new MutationObserver(() => {
      if (box.getAttribute('data-fas') === 'oppna' && t0 === null) t0 = performance.now();
    }).observe(box, { attributes: true, attributeFilter: ['data-fas'] });

    if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
    window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12 });

    /* Sampla genom hela fas 2 med rAF — bade stralens lage och nar varje textdel fods.
       TAKET MATS MOT EN ABSOLUT START, inte mot t0. Forsta versionen jamforde mot t0, som ar
       null tills fas 2 borjar — uttrycket blev `nu - performance.now()` ~= 0 och loopen kunde
       aldrig lopa ut. Vid rod baslinje kommer fas 2 aldrig, och provet snurrade for evigt. */
    const start = performance.now();
    await new Promise(klar => {
      const tick = () => {
        const nu = performance.now();
        if (t0 !== null) {
          /* SAMPLA BARA INOM FAS 2. Forsta versionen korde till 1000 ms medan fasen ar 900, och
             fangade darmed fasovergangen: nar fas 2:s regel slutar galla aterstalls stralens
             transform till basen vid kolumngransen — uppmatt som ett hopp 180 -> 0 — och
             monotonitetsvakten las det som att svepet vande. Fas 3:s aterstallning ar avsiktlig;
             provet ska inte se den. */
          if (box.getAttribute('data-fas') !== 'oppna') return klar();
          const vid = Math.round(nu - t0);
          const s = getComputedStyle(strale);
          stralProv.push({ vid, transform: s.transform, opacity: Number(s.opacity) });
          for (const d of DELAR) {
            if (fodd[d.nyckel] === undefined && Number(getComputedStyle(d.el).opacity) > 0.5)
              fodd[d.nyckel] = vid;
          }
        }
        if (nu - start > 12000) return klar();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return { fel: null, naddeFas2: t0 !== null, stralProv, fodd,
             sistaTransform: stralProv.length ? stralProv[stralProv.length - 1].transform : null };
  }, MODELL);
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.equal(r.naddeFas2, true,
    `${MODELL} nadde aldrig fas "oppna" — ingen stralrorelse kunde mätas. ${SAKNAS}`);

  // ---- A. Stralen ror sig i sidled -------------------------------------------------------------
  const xs = r.stralProv.map(p => translateXUr(p.transform)).filter(x => x !== null);
  assert.ok(xs.length > 0,
    `Sidebadges strale ror sig inte i sidled under fas 2 — uppmatt transform: ` +
    `${JSON.stringify(r.sistaTransform)}. ${SAKNAS}`);
  const spann = Math.max(...xs) - Math.min(...xs);
  assert.ok(spann >= 40,
    `Sidebadges strale ror sig inte i sidled under fas 2 — uppmatt transform: ` +
    `translateX rorde sig bara ${Math.round(spann)} px (forvantat minst 40). ` +
    `Sista transform: ${JSON.stringify(r.sistaTransform)}`);
  // Monotont: sveper at ETT hall, inte fram och tillbaka.
  const bak = [], fram = [];
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] < xs[i - 1] - 1) bak.push({ i, fran: Math.round(xs[i - 1]), till: Math.round(xs[i]) });
    if (xs[i] > xs[i - 1] + 1) fram.push(i);
  }
  assert.ok(bak.length === 0 || fram.length === 0,
    `Sidebadges strale sveper fram och tillbaka under fas 2 (${fram.length} steg framat, ` +
    `${bak.length} bakat) — svepet ska ga at ETT hall. Backslagen: ` +
    JSON.stringify(bak) + '. Hela serien: ' + JSON.stringify(xs.map(x => Math.round(x))));

  // ---- B. Textkolumnen fods i ordning ---------------------------------------------------------
  const ORDNING = ['rubrik', 'bricka', 'namn', 'meddelande'];
  for (const nyckel of ORDNING)
    assert.notEqual(r.fodd[nyckel], undefined,
      `Textkolumnens ${nyckel} foddes aldrig under fas 2 — uppmatta fodslar: ` +
      `${JSON.stringify(r.fodd)}. ${SAKNAS}`);
  for (let i = 1; i < ORDNING.length; i++) {
    const fore = ORDNING[i - 1], nu = ORDNING[i];
    assert.ok(r.fodd[nu] > r.fodd[fore],
      `Textkolumnens ${nu} foddes vid ${r.fodd[nu]} ms, men ${fore} vid ${r.fodd[fore]} ms — ` +
      `koreografin ar omvand. Delarna ska fodas i ordning bakom stralen: ${ORDNING.join(' -> ')}.`);
  }

  // ---- C. Ingen textdel fods innan stralen borjat svepa ---------------------------------------
  const forstaRorelse = (() => {
    const start = xs[0];
    for (const p of r.stralProv) {
      const x = translateXUr(p.transform);
      if (x !== null && Math.abs(x - start) > 1) return p.vid;
    }
    return null;
  })();
  assert.notEqual(forstaRorelse, null, 'stralen borjade aldrig rora sig under fas 2');
  const forst = ORDNING.reduce((a, k) => r.fodd[k] < r.fodd[a] ? k : a, ORDNING[0]);
  assert.ok(r.fodd[forst] >= forstaRorelse,
    `Textkolumnens ${forst} foddes vid ${r.fodd[forst]} ms, men stralen passerade den positionen ` +
    `forst vid ${forstaRorelse} ms — koreografin ar omvand. Texten ska fodas BAKOM stralen.`);
});
