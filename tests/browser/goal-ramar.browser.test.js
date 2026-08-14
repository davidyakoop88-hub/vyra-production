'use strict';
// Ramade mal · Davids anmarkningar 2026-08-14.
//
// UPPMATT ORSAK till allt tre pa hans bild: ramlayouten sätter `grid-template-columns:1fr
// !important` med specificitet 0-2-0, men `.social-goal.premium-goal.goal-landscape{
// grid-template-columns:auto 1fr!important}` fran #183 ar 0-3-0 och vinner. Ramen blir
// TVAKOLUMNS — uppmatt `133.156px 258.844px` vid 440 px bredd. Foljden:
//   * texten (.goal-copy, 133 px) klams till vansterkolumnen i stallet for konstens mittfalt
//   * "den morka ovalen" ar .goal-track: 125x40 px, bakgrund rgba(8,7,11,.867), radie 24 px,
//     ocksa i kolumn 1 — darfor nere till vanster
// Vid 220 px krymper andra kolumnen till 39 px medan hojden star fast pa 250: layouten skalar
// inte, den mosas. Det ar exakt samma specificitetskollision som klamde modell 3 fran 404 till
// 54 px, och som jag flaggade i #186 utan att da mata ramarna.
//
// BASLINJEN for modell 1-4 ar mätt FORE andringen och star som hart krav har: ramfixen far
// inte rora dem. Det var precis sa modell 3 gick sonder forra gangen.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
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

const RAMAR = ['azure-frame', 'heart-frame', 'rose-frame', 'sapphire-frame'];
const KOMPAKT = 220;   // under brytpunkten
const STOR = 440;

// Uppmatt pa main 2026-08-14, INNAN ramfixen. Ramandringen far inte rora dessa.
const BASLINJE = {
  1: { kolumner: '45px 347px', sparKol: '2', sparBredd: 347 },
  2: { kolumner: '45px 347px', sparKol: '2', sparBredd: 347 },
  3: { kolumner: '404px',      sparKol: '1', sparBredd: 404 },
  4: { kolumner: '45px 347px', sparKol: '2', sparBredd: 347 },
};

async function iEditorn() {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1150 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  // Liggande scen: i mobilformat (432 px) klipps en 440 px bred widget, och da doljs just den
  // skillnad mellan stor och liten storlek som kvot-provet ska fanga.
  await page.evaluate(() => {
    state.layoutFormat = 'widescreen';
    document.querySelector('[data-format="widescreen"]')?.click();
    document.querySelector('.editor-shell .canvas')?.style.setProperty('contain', 'none', 'important');
  });
  await page.waitForFunction(
    () => Math.round(document.querySelector('.editor-shell .canvas').getBoundingClientRect().width) === 768,
    null, { timeout: 5000, polling: 50 });
  return page;
}

async function matNyckel(nyckel, bredd) {
  const page = await iEditorn();
  const m = await page.evaluate(async ({ nyckel, bredd }) => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(nyckel);
    w.x = 24; w.y = 24; if (bredd) w.width = bredd;
    state.widgets.push(w); selected = null; render();
    const el = document.querySelector('.social-goal');
    if (!el) return { fel: 'renderades inte' };
    // Ramkonsten maste vara avkodad innan nagot mats — en olastad <img> har
    // naturalWidth 0, och da blir konstmatningen tyst null i stallet for fel.
    const bild = el.querySelector('.goal-frame-art');
    if (bild) await bild.decode().catch(() => {});
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const box = n => { const e = el.querySelector(n); if (!e) return null;
      const q = e.getBoundingClientRect(), c = getComputedStyle(e);
      return { v: q.left, h: q.right, o: q.top, u: q.bottom, bredd: q.width, hojd: q.height,
               mitt: q.left + q.width / 2, bg: c.backgroundColor, kol: c.gridColumnStart,
               synlig: q.width > 0 && q.height > 0 && c.display !== 'none' } };
    /* getBoundingClientRect pa en <img> ger ELEMENTETS ruta, inte den malade konsten —
       med object-fit:contain ar de olika, och ett prov som jamfor elementrutan mot roten
       ar darfor alltid gront aven nar konsten letterboxas. Rakna fram den verkligt
       malade rektangeln ur naturalWidth/Height + object-fit. */
    const maladKonst = () => {
      const e = el.querySelector('.goal-frame-art');
      if (!e || !e.naturalWidth) return null;
      const q = e.getBoundingClientRect();
      const fit = getComputedStyle(e).objectFit;
      const kf = e.naturalWidth / e.naturalHeight, kr = q.width / q.height;
      let b = q.width, h = q.height;
      if (fit === 'contain') { if (kf > kr) h = q.width / kf; else b = q.height * kf; }
      else if (fit === 'cover') { if (kf > kr) b = q.height * kf; else h = q.width / kf; }
      const v = q.left + (q.width - b) / 2, o = q.top + (q.height - h) / 2;
      return { v, h: v + b, o, u: o + h, bredd: b, hojd: h, fit,
               naturlig: `${e.naturalWidth}x${e.naturalHeight}` };
    };
    return { klass: el.className,
      kolumner: cs.gridTemplateColumns,
      rot: { v: r.left, h: r.right, o: r.top, u: r.bottom, bredd: r.width, hojd: r.height,
             mitt: r.left + r.width / 2 },
      kopia: box('.goal-copy'), spar: box('.goal-track'), konst: box('.goal-frame-art'),
      konstMalad: maladKonst(),
      rubrik: box('.goal-copy h3'), varde: box('.goal-copy strong') };
  }, { nyckel, bredd });
  await page.close();
  return m;
}

// ---- 1. De fyra vanliga modellerna far INTE forandras ------------------------------------
for (const modell of [1, 2, 3, 4]) {
  test(`modell ${modell} star stilla nar ramfixen laggs in`, { skip }, async () => {
    const m = await matNyckel(`catalog:socialgoal:followers:${modell}:landscape`);
    assert.ok(!m.fel, m.fel);
    const b = BASLINJE[modell];
    assert.equal(m.kolumner, b.kolumner, `gridet andrades fran "${b.kolumner}"`);
    assert.equal(m.spar.kol, b.sparKol, 'sparet bytte kolumn');
    assert.ok(Math.abs(m.spar.bredd - b.sparBredd) <= 2,
      `sparet ar ${Math.round(m.spar.bredd)} px, baslinjen ar ${b.sparBredd}`);
  });
}

// ---- 2. Ramarna i stor storlek ------------------------------------------------------------
for (const ram of RAMAR) {
  test(`${ram}: gridet ar enkolumns`, { skip }, async () => {
    const m = await matNyckel(`catalog:socialgoal:likes:${ram}:landscape`, STOR);
    assert.ok(!m.fel, m.fel);
    // `minmax(0px, 1fr)` ar EN kolumn men innehaller blanksteg. Rakna parenteser som en
    // enhet, annars raknar provet fel och rapporterar tva kolumner for en enkolumnsram.
    const antal = m.kolumner.replace(/\([^)]*\)/g, 'x').trim().split(/\s+/).length;
    assert.equal(antal, 1,
      `ramen har ${antal} kolumner (${m.kolumner}) — landskapsregeln fran #183 vinner pa specificitet`);
  });

  test(`${ram}: texten ar centrerad i mittfaltet`, { skip }, async () => {
    const m = await matNyckel(`catalog:socialgoal:likes:${ram}:landscape`, STOR);
    const avvikelse = Math.abs(m.kopia.mitt - m.rot.mitt);
    assert.ok(avvikelse <= 12,
      `textens mitt ligger ${Math.round(avvikelse)} px fran widgetens mitt — den ska sitta i mittfaltet`);
  });

  test(`${ram}: ingen mork oval`, { skip }, async () => {
    const m = await matNyckel(`catalog:socialgoal:likes:${ram}:landscape`, STOR);
    const bg = m.spar.bg;
    const mork = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(bg);
    const genomskinlig = /rgba\([^)]*,\s*0\s*\)/.test(bg);
    assert.ok(genomskinlig || (mork && (+mork[1] + +mork[2] + +mork[3]) > 90),
      `sparet har bakgrunden ${bg} — den morka ovalen ska bort`);
  });

  /* ANDRAT KRAV, medvetet: forut stod har "minst 55 % av WIDGETENS bredd". Den gransen
     skrevs mot den gemensamma (felaktiga) geometrin. Uppmatt ar rose-crystals stav bara
     58,9 % bred, sa 55 %-kravet gick inte att uppfylla utan att lata sparet spilla ut ur
     ramen — alltsa precis det felet provet fanns till for att hindra. Kravet ar nu
     uttryckt mot STAVEN, vilket ar vad det hela tiden menade. */
  test(`${ram}: sparet spanner mittfaltet`, { skip }, async () => {
    const m = await matNyckel(`catalog:socialgoal:likes:${ram}:landscape`, STOR);
    const g = RAMGEOMETRI[ram];
    const stavBredd = m.rot.bredd * (100 - g.stav.v - g.stav.h) / 100;
    assert.ok(m.spar.bredd >= stavBredd * 0.85,
      `sparet ar ${Math.round(m.spar.bredd)} px av stavens ${Math.round(stavBredd)} px — for smalt`);
  });
}

// ---- 3. Kompakt lage vid liten storlek ----------------------------------------------------
for (const ram of RAMAR) {
  test(`${ram}: kompakt lage behaller proportionerna`, { skip }, async () => {
    const stor = await matNyckel(`catalog:socialgoal:likes:${ram}:landscape`, STOR);
    const liten = await matNyckel(`catalog:socialgoal:likes:${ram}:landscape`, KOMPAKT);
    const kvotStor = stor.rot.hojd / stor.rot.bredd;
    const kvotLiten = liten.rot.hojd / liten.rot.bredd;
    assert.ok(Math.abs(kvotStor - kvotLiten) <= 0.12,
      `hojd/bredd gick fran ${kvotStor.toFixed(2)} till ${kvotLiten.toFixed(2)} — ramen deformeras`);
  });

  test(`${ram}: inget hamnar utanfor i kompakt lage`, { skip }, async () => {
    const m = await matNyckel(`catalog:socialgoal:likes:${ram}:landscape`, KOMPAKT);
    for (const [namn, d] of [['texten', m.kopia], ['sparet', m.spar]]) {
      if (!d) continue;
      assert.ok(d.v >= m.rot.v - 1 && d.h <= m.rot.h + 1,
        `${namn} sticker ut i sidled: ${Math.round(d.v)}–${Math.round(d.h)} mot ramens ${Math.round(m.rot.v)}–${Math.round(m.rot.h)}`);
    }
  });

  test(`${ram}: progressfaltet syns fortfarande i kompakt lage`, { skip }, async () => {
    const m = await matNyckel(`catalog:socialgoal:likes:${ram}:landscape`, KOMPAKT);
    assert.ok(m.spar && m.spar.synlig, 'sparet syns inte');
    assert.ok(m.spar.hojd >= 6, `sparet ar ${Math.round(m.spar.hojd)} px hogt — det pressas platt`);
  });
}

// ---- 4. De atta staende ska ga att valja i katalogen ---------------------------------------
test('alla atta staende ramar finns i overlay-katalogen', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=overlay`, { waitUntil: 'load' });
  await page.waitForTimeout(5000);
  const nycklar = await page.evaluate(() =>
    [...document.querySelectorAll('[data-catalog-key]')].map(b => b.dataset.catalogKey)
      .filter(k => /socialgoal/.test(k) && /portrait/.test(k)).sort());
  await page.close();
  const vantade = [];
  for (const kind of ['followers', 'likes']) for (const f of RAMAR)
    vantade.push(`catalog:socialgoal:${kind}:${f}:portrait`);
  for (const v of vantade.sort()) {
    assert.ok(nycklar.includes(v), `${v} saknas i katalogen (hittade ${nycklar.length} staende malval)`);
  }
});

/* ---- 5. VARJE RAM BAR SIN EGEN GEOMETRI --------------------------------------------------
   Foregaende varv satte EN aspect-ratio (1.76) for alla fyra ramarna. Uppmatt ur filerna
   med scratchpad/mat-ramkonst.js + mat-ramstav.js (riktig Chrome, canvas, alfakanal):

   - Filens matt sager inget om konsten. Tre av fyra filer ar 800x800 med stora GENOMSKINLIGA
     marginaler; sjalva konsten ar liggande i alla fyra (1.42-1.63).
   - Stavens insida ar inte vit utan ett HAL (alfa 0) — det vita man ser i en bildvisare ar
     visarens egen bakgrund. Stavrektangeln nedan ar storsta inneslutna halet.

   Sifforna ar i procent av KONSTBOXEN, som efter fixen fyller widgeten exakt. */
const RAMGEOMETRI = {
  'azure-frame':    { aspect: 1.4159, fil: [800, 800], konst: [0, 79, 800, 565],
                      stav: { v: 18.13, h: 18.13, t: 51.33, hojd: 12.21 } },
  'heart-frame':    { aspect: 1.4717, fil: [800, 800], konst: [10, 104, 780, 530],
                      stav: { v: 14.62, h: 14.62, t: 39.43, hojd: 16.23 } },
  'rose-frame':     { aspect: 1.6317, fil: [800, 800], konst: [4, 128, 793, 486],
                      stav: { v: 20.55, h: 20.55, t: 43.42, hojd: 16.26 } },
  'sapphire-frame': { aspect: 1.5269, fil: [800, 533], konst: [1, 6, 794, 520],
                      stav: { v: 16.75, h: 16.12, t: 42.50, hojd: 14.04 } },
};

for (const ram of RAMAR) {
  const g = RAMGEOMETRI[ram];

  test(`${ram}: widgeten far ramens EGNA proportioner`, { skip }, async () => {
    const m = await matNyckel(`catalog:socialgoal:likes:${ram}:landscape`, STOR);
    assert.ok(!m.fel, m.fel);
    const kvot = m.rot.bredd / m.rot.hojd;
    assert.ok(Math.abs(kvot - g.aspect) / g.aspect < 0.02,
      `kvoten ar ${kvot.toFixed(3)}, ramens konst ar ${g.aspect} — en gemensam aspect-ratio ` +
      `letterboxar konsten och da foljer procentkoordinaterna ladan i stallet for ramen`);
  });

  /* Konsten ska fylla widgeten exakt. Har maste man mata den SYNLIGA konsten, inte bilden:
     tre av fyra filer ar 800x800 med genomskinlig marginal, sa aven en perfekt inpassad
     BILD lamnar konsten for liten och forskjuten — och det ar precis den forskjutningen
     som gor att procentkoordinaterna hamnar utanfor ramen. */
  test(`${ram}: den synliga konsten fyller widgeten`, { skip }, async () => {
    const m = await matNyckel(`catalog:socialgoal:likes:${ram}:landscape`, STOR);
    assert.ok(m.konstMalad, 'ramkonsten renderas inte');
    const [fb, fh] = g.fil, [kx, ky, kb, kh] = g.konst;
    const mk = m.konstMalad;
    const synlig = {
      v: mk.v + mk.bredd * kx / fb,
      o: mk.o + mk.hojd * ky / fh,
      bredd: mk.bredd * kb / fb,
      hojd: mk.hojd * kh / fh,
    };
    const tol = Math.max(2, m.rot.bredd * 0.02);
    assert.ok(Math.abs(synlig.bredd - m.rot.bredd) <= tol,
      `konsten ar ${Math.round(synlig.bredd)} px bred mot widgetens ${Math.round(m.rot.bredd)} px`);
    assert.ok(Math.abs(synlig.hojd - m.rot.hojd) <= tol,
      `konsten ar ${Math.round(synlig.hojd)} px hog mot widgetens ${Math.round(m.rot.hojd)} px`);
    assert.ok(Math.abs(synlig.v - m.rot.v) <= tol && Math.abs(synlig.o - m.rot.o) <= tol,
      `konsten ar forskjuten ${Math.round(synlig.v - m.rot.v)},${Math.round(synlig.o - m.rot.o)} px ` +
      `mot widgetens hornpunkt`);
  });

  for (const bredd of [STOR, KOMPAKT]) {
    const lage = bredd === STOR ? 'stor' : 'kompakt';
    test(`${ram}: sparet ligger i ramens stav (${lage})`, { skip }, async () => {
      const m = await matNyckel(`catalog:socialgoal:likes:${ram}:landscape`, bredd);
      assert.ok(!m.fel, m.fel);
      assert.ok(m.spar && m.spar.synlig, 'sparet syns inte');

      // stavens rektangel i sidkoordinater, harledd ur widgetens egen box
      const stav = {
        v: m.rot.v + m.rot.bredd * g.stav.v / 100,
        h: m.rot.h - m.rot.bredd * g.stav.h / 100,
        o: m.rot.o + m.rot.hojd * g.stav.t / 100,
        u: m.rot.o + m.rot.hojd * (g.stav.t + g.stav.hojd) / 100,
      };
      const slack = Math.max(3, m.rot.bredd * 0.015);
      assert.ok(m.spar.o >= stav.o - slack && m.spar.u <= stav.u + slack,
        `sparet ligger ${Math.round(m.spar.o)}-${Math.round(m.spar.u)} px, staven ` +
        `${Math.round(stav.o)}-${Math.round(stav.u)} px — det hamnar utanfor ramen`);
      assert.ok(m.spar.v >= stav.v - slack && m.spar.h <= stav.h + slack,
        `sparet ar bredare an staven i sidled`);
    });

    test(`${ram}: texten ligger i ramens stav (${lage})`, { skip }, async () => {
      const m = await matNyckel(`catalog:socialgoal:likes:${ram}:landscape`, bredd);
      assert.ok(m.kopia && m.kopia.synlig, 'texten syns inte');
      const stavO = m.rot.o + m.rot.hojd * g.stav.t / 100;
      const stavU = m.rot.o + m.rot.hojd * (g.stav.t + g.stav.hojd) / 100;
      const slack = Math.max(3, m.rot.hojd * 0.03);
      assert.ok(m.kopia.o >= stavO - slack && m.kopia.u <= stavU + slack,
        `texten ligger ${Math.round(m.kopia.o)}-${Math.round(m.kopia.u)} px, staven ` +
        `${Math.round(stavO)}-${Math.round(stavU)} px`);
    });
  }
}
