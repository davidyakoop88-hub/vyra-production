'use strict';
// Fan Level Up · de atta modellerna mot Davids referensbild 2026-08-13.
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
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

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

let server, browser, bas;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// 'hero' star forst for att den ar STANDARD: fanLevelHtml gor fan-layout-${w.fanLayout||'hero'},
// och katalogens tema-ingang satter tema utan layout. Varje widget som skapas den vagen far alltsa
// hero — den mest anvanda modellen var lange den enda utan tackning har.
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

// ---- Krav som galler ALLA atta -----------------------------------------------------------------
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

// MATT OVER TID, inte i en enda bildruta.
//
// Provet hette forr samma sak och laste EN matning: alla tre hjartan skulle ligga over opacity
// 0.5 samtidigt. Det var sant per definition, eftersom
// `.fan-layout-hearts .fan-rising-hearts i{opacity:1!important}` pinnade opaciteten och dodade
// halva frHeartRise. Hjartana steg 26 px och teleporterade tillbaka till noll VID FULL
// LJUSSTYRKA, var 1,6:e sekund. Provet skyddade alltsa buggen, inte designen.
//
// Med tonningen lagad ar tre samtidigt ljusa hjartan omojligt — de ar forskjutna med 0,4 s
// vardera, och det ar hela effekten. Kravet ar i stallet att vart och ett NAR full styrka nagon
// gang under en cykel, och att det tonar hela vagen ner igen sa aterhoppet aldrig syns.
async function hjartanOverTid() {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:fanlevel:layout:hearts');
    w.x = 60; w.y = 40; state.widgets.push(w); selected = null; render();
    document.querySelector('.fan-level-up').classList.add('fan-active');
  });
  await page.waitForTimeout(600);
  // En hel cykel (1,6 s) plus den storsta forskjutningen (0,8 s), med marginal.
  const prov = [];
  for (let i = 0; i < 26; i += 1) {
    prov.push(await page.evaluate(() => [...document.querySelectorAll('.fan-rising-hearts i')]
      .map(e => { const cs = getComputedStyle(e);
        return { op: +cs.opacity, skugga: cs.textShadow, storlek: parseFloat(cs.fontSize) } })));
    await page.waitForTimeout(100);
  }
  await page.close();
  return prov;
}

test('hearts: de tre hjartana glodar, tonar och ar olika stora', { skip }, async () => {
  const prov = await hjartanOverTid();
  assert.ok(prov.length, 'ingen matning gjordes');
  assert.equal(prov[0].length, 3, `hittade ${prov[0].length} hjartan, referensen har tre`);
  for (let i = 0; i < 3; i += 1) {
    const serie = prov.map(p => p[i]);
    const hogst = Math.max(...serie.map(h => h.op));
    const lagst = Math.min(...serie.map(h => h.op));
    assert.ok(hogst > 0.9,
      `hjarta ${i + 1} nadde bara ${hogst.toFixed(2)} i opacitet — det tands aldrig helt`);
    assert.ok(lagst < 0.2,
      `hjarta ${i + 1} gick aldrig under ${lagst.toFixed(2)} — utan uttoning syns aterhoppet `
      + 'till botten som ett hopp vid full ljusstyrka');
    assert.notEqual(serie[0].skugga, 'none', `hjarta ${i + 1} saknar glod`);
  }
  const storlekar = prov[0].map(h => h.storlek);
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
