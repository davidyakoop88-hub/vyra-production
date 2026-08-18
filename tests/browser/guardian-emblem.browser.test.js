'use strict';
// Guardian Emblem · G-STEG-HÖJD. Växer prakten på riktigt, mätt i en riktig webbläsare.
//
// VARFÖR INTE JSDOM. Allt här kräver layout och en riktig animationsmotor: rektanglar (jsdom ger
// 0×0), ärvd opacitet genom en kedja och transformmatriser. tests/guardian-emblem-fas.test.js äger
// registren, tiderna och markupen; den här filen äger den enda frågan jsdom inte kan svara på —
// SYNS det, och växer det åt rätt håll.
//
// §8 STYR VARJE PÅSTÅENDE. DOM-existens är inte synlighet. En del kan finnas, ha rätt klass och
// ändå vara osynlig — monterad utanför bild, släckt av en förälder, eller nollstor. Måtten här är
// därför rektangel + EFFEKTIV (ärvd) opacitet, aldrig `querySelector(...) !== null`.
//
// LÅDANS HÖJD HÅLLS KONSTANT I ALLA FYRA STEGEN, med flit. Fabriken ger varje steg en egen
// utgångshöjd, och att mäta den hade bara läst tillbaka en siffra jsdom redan vaktar — ett prov
// som bevisar sin egen fixtur. Det som mäts är i stället DELARNAS omfång: översta delens ovankant
// till understa delens underkant. Växer det när lådan står stilla, så är det prakten som växer.
//
// FASERNA PINNAS, INTE SOVS. Varje animation sätts till sin egen `currentTime` via Web Animations
// API, och `render()` körs före varje mätning så noden är ny och animationsfri — en pausad
// animation överlever att dess CSS-regel slutar gälla, och `cancel()`/`play()` ger detachade
// respektive dubblerade animationer (lärdom 5 i checkpoint 33 och mätningen i PR #222).
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

const STEG = ['1', '2', '3', '4'];
const LADHOJD = 700;   // samma i alla fyra stegen — se filhuvudet

// Mätfunktionerna körs INNE i sidan.
const MATARE = `(() => {
  const box = () => document.querySelector('.guardian-emblem');
  window.__geMatt = () => {
    const b = box();
    const img = b.querySelector('.ge-bild>img');
    const hal = b.querySelector('.ge-avatar');
    const lada = b.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const hr = hal.getBoundingClientRect();
    const delar = [...b.querySelectorAll('.ge-bild,.ge-namn,.ge-undertext')]
      .map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
    return {
      laddad: img.complete && img.naturalWidth > 0,
      naturlig: img.naturalWidth + 'x' + img.naturalHeight,
      src: img.getAttribute('src'),
      bildBredd: +ir.width.toFixed(1), bildHojd: +ir.height.toFixed(1),
      halBredd: +hr.width.toFixed(1), halHojd: +hr.height.toFixed(1),
      // Hålets mitt uttryckt i BILDENS egna koordinater, 0–1.
      halMittX: +((hr.left + hr.width / 2 - ir.left) / ir.width).toFixed(4),
      halMittY: +((hr.top + hr.height / 2 - ir.top) / ir.height).toFixed(4),
      omfangHojd: +(Math.max(...delar.map(r => r.bottom)) - Math.min(...delar.map(r => r.top))).toFixed(1),
      omfangBredd: +(Math.max(...delar.map(r => r.right)) - Math.min(...delar.map(r => r.left))).toFixed(1),
      ladBredd: +lada.width.toFixed(1), ladHojd: +lada.height.toFixed(1),
    };
  };
  // Läser en pixel UR SJÄLVA KONSTVERKET. Sidan serveras från samma origin, så duken smutsas inte.
  window.__gePixel = (u, v) => {
    const img = box().querySelector('.ge-bild>img');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(Math.round(u * img.naturalWidth), Math.round(v * img.naturalHeight), 1, 1).data;
    const max = Math.max(d[0], d[1], d[2]), min = Math.min(d[0], d[1], d[2]);
    return { r: d[0], g: d[1], b: d[2], a: d[3], mattnad: max - min, ljus: max };
  };
  window.__geFas = (namn, ms) => {
    render();
    const b = box();
    if (namn) b.classList.add('ge-fas-' + namn);
    void b.offsetWidth;
    if (typeof ms === 'number') {
      const alla = [...b.getAnimations()];
      b.querySelectorAll('*').forEach(n => alla.push(...n.getAnimations()));
      alla.forEach(a => { a.pause(); a.currentTime = ms });
      void b.offsetWidth;
    }
  };
  return true;
})()`;

const cache = new Map();

async function sida(steg) {
  if (cache.has(steg)) return cache.get(steg);
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: 'sv-SE' });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  const start = await page.evaluate(([s, h]) => {
    try {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:guardianemblem:' + s);
      w.x = 60; w.y = 40; w.height = h; w.guardianLang = 'sv'; w.guardianUsername = '@TestGuardian';
      state.widgets.push(w); selected = null; render();
      return { finns: !!document.querySelector('.guardian-emblem') };
    } catch (e) { return { finns: false, fel: String(e && e.message || e) } }
  }, [steg, LADHOJD]);
  const svar = { page };
  if (!start.finns) svar.fel = `steg ${steg} renderades inte${start.fel ? ': ' + start.fel : ''}`;
  else {
    await page.evaluate(MATARE);
    // Bilden laddas asynkront; utan den här väntan mäter provet en tom låda.
    await page.waitForFunction(() => {
      const i = document.querySelector('.guardian-emblem .ge-bild>img');
      return i && i.complete && i.naturalWidth > 0;
    }, null, { timeout: 15000, polling: 100 }).catch(() => {});
  }
  cache.set(steg, svar);
  return svar;
}

const matt = page => page.evaluate(() => window.__geMatt());
const pixel = (page, u, v) => page.evaluate(([u, v]) => window.__gePixel(u, v), [u, v]);

async function allaSteg() {
  const ut = {};
  for (const s of STEG) {
    const { page, fel } = await sida(s);
    assert.ok(!fel, `kontrollmätning: ${fel}`);
    ut[s] = await matt(page);
    assert.ok(ut[s].laddad, `steg ${s}: bilden ${ut[s].src} laddades aldrig — widgeten är tom i overlayn`);
  }
  return ut;
}

// ================================================================================================
// G-BILD — KONSTVERKET ÄR FAKTISKT DÄR
//
// Det här är provet som jsdom aldrig kan ersätta. En felstavad sökväg, en fil som inte committades,
// en bild som ligger utanför den serverade katalogen — allt ger samma sak i jsdom: markup som ser
// perfekt ut. Först en riktig webbläsare säger om bilden VERKLIGEN laddades.
// ================================================================================================

test('G-BILD: varje steg laddar sin bild på riktigt', { skip }, async () => {
  const m = await allaSteg();
  for (const s of STEG) {
    assert.ok(m[s].naturlig !== '0x0', `steg ${s}: bilden har inga mått`);
    assert.ok(m[s].bildBredd > 300, `steg ${s}: bilden målas ${m[s].bildBredd} px bred i en 400 px låda`);
  }
});

test('G-BILD: avatarhålet landar på konstverkets egen platshållarskiva', { skip }, async () => {
  // GEOMETRINS ENDA ÄRLIGA PROV. Tabellen säger var hålet sitter; det här läser pixeln som faktiskt
  // ligger där i bilden och kräver att den är mörk och omättad — alltså skivan, inte guldet.
  // Kontrollmätningen ligger i samma prov: en punkt en bit UTANFÖR hålet ska vara mättad eller ljus,
  // annars mäter provet en bild som är mörk överallt.
  for (const s of STEG) {
    const { page, fel } = await sida(s);
    assert.ok(!fel, `kontrollmätning: ${fel}`);
    const m = await matt(page);
    const inne = await pixel(page, m.halMittX, m.halMittY);
    assert.ok(inne.a > 200, `steg ${s}: hålets mitt är genomskinlig — tabellen pekar utanför emblemet`);
    assert.ok(inne.mattnad < 40 && inne.ljus < 190,
      `steg ${s}: hålets mitt är mättad/ljus (${inne.r},${inne.g},${inne.b}) — tabellen pekar på guldet, inte på skivan`);
    // Kontrollmätningen tar en RING av punkter runt hålet, inte en enda. En enskild punkt landar
    // förr eller senare i en genomskinlig lucka mellan två guldblad — uppmätt i steg 2, där punkten
    // 0,34 åt höger föll utanför emblemet och rapporterade svart. Ett prov vars kontroll beror på
    // var i ornamentet man råkar peka mäter ornamentet, inte påståendet.
    const ring = [];
    for (let i = 0; i < 12; i++) {
      const v = i / 12 * Math.PI * 2;
      const u = m.halMittX + Math.cos(v) * 0.30, w = m.halMittY + Math.sin(v) * 0.30 / (m.bildHojd / m.bildBredd);
      if (u < 0.02 || u > 0.98 || w < 0.02 || w > 0.98) continue;
      ring.push(await pixel(page, u, w));
    }
    const malade = ring.filter(q => q.a > 200);
    assert.ok(malade.length >= 4,
      `kontrollmätning steg ${s}: bara ${malade.length} av ${ring.length} punkter runt hålet är målade`);
    assert.ok(malade.some(q => q.mattnad > 40 || q.ljus > 190),
      `kontrollmätning steg ${s}: ingen punkt runt hålet är mättad eller ljus — bilden är mörk överallt och provet mäter ingenting`);
  }
});

// ================================================================================================
// G-STEG-HÖJD — PRAKTEN VÄXER, OCH DET SYNS
// ================================================================================================

test('G-STEG-HÖJD: emblemets målade omfång växer för varje steg, med lådan konstant', { skip }, async () => {
  const m = await allaSteg();
  assert.deepEqual([...new Set(STEG.map(s => m[s].ladHojd))], [LADHOJD],
    `lådan är inte lika hög i alla steg — då mäter provet fixturen, inte prakten`);
  const h = STEG.map(s => m[s].omfangHojd);
  for (let i = 1; i < STEG.length; i++) {
    assert.ok(h[i] > h[i - 1],
      `steg ${STEG[i]} målar inte högre än steg ${STEG[i - 1]}: ${h.join(' / ')} px`);
  }
});

test('G-STEG-HÖJD: inget steg målar utanför sin 400 px breda låda', { skip }, async () => {
  const m = await allaSteg();
  for (const s of STEG) {
    assert.equal(m[s].ladBredd, 400, `steg ${s} har inte 400 px bred låda`);
    assert.ok(m[s].omfangBredd <= 400.5,
      `steg ${s} målar ${m[s].omfangBredd} px brett i en 400 px låda — kanterna klipps i overlayn`);
  }
});

test('G-STEG-HÖJD: avatarhålet är runt i renderad form', { skip }, async () => {
  // Tabellen bär procenttal mot en bild med egen proportion. Att de blir en CIRKEL på skärmen är ett
  // annat påstående än att talen ser rimliga ut, och det är det här provet som mäter det.
  const m = await allaSteg();
  for (const s of STEG) {
    const kvot = m[s].halBredd / m[s].halHojd;
    assert.ok(kvot > 0.88 && kvot < 1.14,
      `steg ${s}: hålet renderas ${m[s].halBredd}×${m[s].halHojd} px — det är ingen cirkel`);
  }
});
