'use strict';
// Fan Level Up · de sju modellerna mot Davids referensbild 2026-08-13.
//
// LAGET FORE, uppmatt: markupen har redan varje del referensen behover — <h2> rubrik, <h3> namn,
// .fan-level-pill, .fan-ribbon, .fan-pulse-line, .fan-wing, .fan-rising-hearts, .fan-ring — och
// standardtemat ar redan orange (--fan: #ff8a20). Strukturen per modell stammer ocksa: vingar
// bara i badgereveal, puls bara i heartbeat/duo, hjartan bara i hearts, ingen profilbild i hearts.
// Det som skiljer ar UTFORANDET.
//
// EN FALLA SOM KOSTADE ETT HELT FOTOPASS: widgeten ar en ALERT och ligger pa
// `opacity:0;visibility:hidden` tills klassen `fan-active` sats. Utan den mater man tomma rutor
// och far grona prov pa ingenting. Riggen harunder tander alltid.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
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

/* `hero` ar renderarens DEFAULT (`w.fanLayout||'hero'`) och basdesignen. Den saknades i
   fabrikens tabell och gick darfor varken att skapa eller prova — trots att den var det man
   fick utan aktivt val. Nu ar den med.
   Listan ar fortfarande handskriven, och det ar en kand svaghet: den kan glida isar fran
   fabrikens tabell utan att nagot sager till. Provet "layoutlistan matchar fabrikens tabell"
   langst ned stanger den luckan — samma losning som gjorde prov 7d biconditionellt. */
const LAYOUTER = ['hero', 'stack', 'heartbeat', 'badgereveal', 'loyalty', 'hearts', 'ribbon', 'duo'];

async function mat(layout) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  const start = await page.evaluate(l => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:fanlevel:layout:' + l);
    w.x = 60; w.y = 40; state.widgets.push(w); selected = null; render();
    const el = document.querySelector('.fan-level-up');
    if (!el) return { fel: 'widgeten renderades inte' };
    el.classList.add('fan-active');                 // tandningen — utan den ar allt osynligt
    return { ok: true };
  }, layout);
  if (start.fel) { await page.close(); return start }
  // ENTREANIMATIONERNA startar pa opacity 0. Mater man i samma tick som tandningen far man
  // noll pa pill, banderoll, ring och vingar — och tror att stilarna inte bet. Vanta ut dem.
  await page.waitForTimeout(1400);
  const m = await page.evaluate(() => {
    const el = document.querySelector('.fan-level-up');
    if (!el) return { fel: 'widgeten forsvann' };
    const info = n => { const e = el.querySelector(n); if (!e) return null;
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return { synlig: r.width > 0 && r.height > 0 && cs.display !== 'none'
                       && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05,
               text: (e.textContent || '').trim(), opacity: cs.opacity,
               bild: cs.backgroundImage, skugga: cs.textShadow, filter: cs.filter,
               bredd: r.width, hojd: r.height, v: r.left, h: r.right, o: r.top, u: r.bottom } };
    return {
      rubrik: info('h2'), namn: info('h3'), pill: info('.fan-level-pill'),
      banderoll: info('.fan-ribbon'), puls: info('.fan-pulse-line'), ring: info('.fan-ring'),
      vingeV: info('.fan-wing.left'), vingeH: info('.fan-wing.right'),
      // Emblemet ritas i ::after pa halvmanen, sa det ar dar bilden ska matas.
      vingeVEmblem: (() => { const e = el.querySelector('.fan-wing.left');
        return e ? getComputedStyle(e, '::after').backgroundImage : null })(),
      vingeHEmblem: (() => { const e = el.querySelector('.fan-wing.right');
        return e ? getComputedStyle(e, '::after').backgroundImage : null })(),
      emblem: info('.fan-burst img'),
      hjartan: [...el.querySelectorAll('.fan-rising-hearts i')].map(e => {
        const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        return { synlig: r.width > 0 && parseFloat(cs.opacity) > 0.5, skugga: cs.textShadow,
                 storlek: parseFloat(cs.fontSize) };
      })
    };
  });
  await page.close();
  return m;
}

// ---- Listan far inte glida isar fran fabrikens tabell -----------------------------------------
// Utan den har vakten kan en ny modell laggas till i widget-factory.js och tyst sta oprovad,
// eller en borttagen modell ligga kvar har och prova nagot som inte finns. Bada riktningarna.
test('layoutlistan i provet matchar fabrikens fanlevel.layout-tabell', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  const fabriken = await page.evaluate(() => {
    const V = window.VyraWidgets;
    if (!V || typeof V.variants !== 'function') return null;
    return Object.keys(V.variants('fanlevel.layout'));
  });
  await page.close();
  assert.ok(Array.isArray(fabriken) && fabriken.length > 0,
    'kunde inte lasa fabrikens fanlevel.layout-tabell — exponerar VyraWidgets nagon variants()?');
  assert.deepEqual([...LAYOUTER].sort(), [...fabriken].sort(),
    `provets LAYOUTER och fabrikens tabell har glidit isar.\n  provet:   ${JSON.stringify(LAYOUTER)}` +
    `\n  fabriken: ${JSON.stringify(fabriken)}`);
});

// ---- Krav som galler ALLA atta ----------------------------------------------------------------
for (const layout of LAYOUTER) {
  test(`${layout}: "FAN LEVEL UP" syns`, { skip }, async () => {
    const m = await mat(layout);
    assert.ok(!m.fel, m.fel);
    assert.ok(m.rubrik, 'rubrikelementet <h2> saknas');
    assert.ok(m.rubrik.synlig, `rubriken ar osynlig (opacity ${m.rubrik.opacity})`);
    assert.match(m.rubrik.text.toUpperCase(), /FAN LEVEL UP/,
      `rubriken sager "${m.rubrik.text}"`);
  });

  test(`${layout}: anvandarnamnet bar snabel-a`, { skip }, async () => {
    const m = await mat(layout);
    assert.ok(m.namn && m.namn.synlig, 'namnet syns inte');
    assert.match(m.namn.text, /^@/, `namnet ar "${m.namn.text}" — referensen visar @anvandarnamn`);
  });

  test(`${layout}: pillen visar en enkel niva`, { skip }, async () => {
    const m = await mat(layout);
    // Welcome Ribbon har ingen LV-pill i referensen — banderollen bar nivan i stallet.
    // Undantaget foljer bilden, det urvattnar inte kravet for de sex andra.
    if (layout === 'ribbon') { assert.ok(!m.pill || !m.pill.synlig,
      'ribbon ska visa nivan i banderollen, inte i en pill'); return }
    assert.ok(m.pill && m.pill.synlig, 'nivapillen syns inte');
    assert.match(m.pill.text.replace(/\s+/g, ' ').trim(), /^LV\.? ?\d+$/i,
      `pillen sager "${m.pill.text}" — referensen visar "LV. 12", utan pil och utan foregaende niva`);
  });
}

// ---- Krav per modell --------------------------------------------------------------------------
for (const layout of ['heartbeat', 'duo']) {
  test(`${layout}: pulslinjen ar en EKG-kurva, inte ett streck`, { skip }, async () => {
    const m = await mat(layout);
    assert.ok(m.puls && m.puls.synlig, 'pulslinjen syns inte');
    assert.notEqual(m.puls.bild, 'none',
      'pulslinjen har ingen bild — referensen visar en EKG-kurva med ett hjarta i mitten');
  });
}

test('hearts: de tre hjartana glodar och ar olika stora', { skip }, async () => {
  const m = await mat('hearts');
  assert.equal(m.hjartan.length, 3, `hittade ${m.hjartan.length} hjartan, referensen har tre`);
  for (const [i, h] of m.hjartan.entries()) {
    assert.ok(h.synlig, `hjarta ${i + 1} syns inte`);
    assert.notEqual(h.skugga, 'none', `hjarta ${i + 1} saknar glod`);
  }
  const storlekar = m.hjartan.map(h => h.storlek);
  assert.ok(new Set(storlekar).size > 1,
    `alla tre hjartan ar ${storlekar[0]} px — referensen trappar storleken`);
});

test('ribbon: banderollen visar FAN LEVEL med nivan', { skip }, async () => {
  const m = await mat('ribbon');
  assert.ok(m.banderoll && m.banderoll.synlig, 'banderollen syns inte');
  assert.match(m.banderoll.text.replace(/\s+/g, ' '), /FAN LEVEL ?\d+/i,
    `banderollen sager "${m.banderoll.text}"`);
});

test('loyalty: ringen ar segmenterad', { skip }, async () => {
  const m = await mat('loyalty');
  assert.ok(m.ring && m.ring.synlig, 'ringen syns inte');
  assert.match(m.ring.bild, /conic-gradient/,
    'ringen ar inte segmenterad — referensen visar en delad ring med en gnista');
});

test('badgereveal: bada halvmanarna bar emblemet', { skip }, async () => {
  const m = await mat('badgereveal');
  for (const [namn, v, emblem] of [['vanster', m.vingeV, m.vingeVEmblem],
                                   ['hoger', m.vingeH, m.vingeHEmblem]]) {
    assert.ok(v && v.synlig, `${namn} halvmane syns inte`);
    assert.ok(v.bredd >= 60 && v.hojd >= 100,
      `${namn} halvmane ar ${Math.round(v.bredd)}x${Math.round(v.hojd)} px — referensen visar en STOR `
      + 'bage som omfamnar profilbilden, inte en liten ikon vid kanten');
    assert.notEqual(emblem, 'none',
      `${namn} halvmane bar inget emblem — referensen visar ett hjarta i varje`);
  }
});
