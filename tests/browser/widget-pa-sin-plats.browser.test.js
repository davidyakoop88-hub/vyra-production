'use strict';
// VARJE WIDGET STÅR PÅ SIN x/y — I STUDION, I OVERLAYN OCH UNDER ▶ TESTA (2026-10-20).
//
// Guardian (guardian-emblem.css), Fan Level · heartbeat och Gifter Level · orbitlevel (studio.css)
// gav sina lådor `position:relative`, som slog `.widget{position:absolute}`: lådan låg i dokumentets
// FLÖDE. Ensam i duken syntes det inte. Men ▶ Testa monterar klonen som syskon efter den riktiga noden
// — i flödet hamnade klonen en hel lådhöjd längre ned — och i sändningen sköt en flödeslåda före i
// listan ned nästa. Uppmätt före rättningen (heartbeat/orbitlevel): beräknat `relative` i båda lägena.
//
// Provet går igenom VARJE katalognyckel (tests/helpers/katalognycklar.js) och kräver:
//   1. beräknat `position: absolute` på lådan, i studion och i overlayn;
//   2. lådan står på x/y ±1 i dukens enheter (offsetLeft/offsetTop — transformer i entréer räknas
//      inte, de är animation och inte placering), med en annan widget FÖRE i listan;
//   3. i studion: ▶ Testa-klonen står där den riktiga noden står (x, y ±1). Bredd och höjd jämförs
//      inte här: klonen visar testdata, och innehållsstora lådor (rankingarna, Battle MVP · royal)
//      får andra mått av andra namn — det är en storleksfråga, inte en placeringsfråga.
// Plus heartbeat + orbitlevel + Guardian efter varandra i overlayn: ingen knuffar ned nästa.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const { nycklar } = require('../helpers/katalognycklar.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.gif': 'image/gif' };

function servera() {
  const server = http.createServer((req, res) => {
    const u = String(req.url || '').split('?')[0];
    if (u.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}'); return; }
    const fil = path.join(ROOT, decodeURIComponent(u).replace(/^\/+/, ''));
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

let server, browser, bas;
const skip = hoppaOver();
const NYCKLAR = nycklar();
const X = 37, Y = 41;

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

async function oppna(url) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: 'sv-SE' });
  const fel = []; page.on('pageerror', e => fel.push(String(e && e.message || e)));
  await page.goto(`${bas}/${url}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.VyraWidgets && typeof render === 'function' && !!window.VyraTestspel, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  return { page, fel };
}

// Körs i sidan: lägg nyckeln efter en granne, mät lådan, och i studion klonen under ▶ Testa.
const MAT = async ([nycklar, X, Y, studio]) => {
  const vanta = ms => new Promise(r => setTimeout(r, ms));
  const lada = el => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
  const ut = [];
  for (const k of nycklar) {
    const w = VyraWidgets.create(k); w.id = 'plats'; w.x = X; w.y = Y;
    const g = VyraWidgets.create('catalog:toplike:voltage'); g.id = 'plats-granne'; g.x = 200; g.y = 600;
    state.widgets = [g, w]; selected = studio ? 'plats' : null; render();
    await vanta(40);
    const el = document.querySelector('.canvas [data-id="plats"]:not([data-testspel-klon])');
    const r = { k, finns: !!el };
    if (el) {
      r.pos = getComputedStyle(el).position;
      r.ritad = el.getClientRects().length > 0;
      r.lada = lada(el);
      r.forälder = el.offsetParent ? el.offsetParent.classList.contains('canvas') : null;
      if (studio && window.VyraTestspel.kan(w)) {
        window.VyraTestspel.spela(w);
        await vanta(120);
        const klon = document.querySelector('.canvas [data-testspel-klon]');
        if (klon) { r.klon = lada(klon); r.klonPos = getComputedStyle(klon).position; r.efter = lada(el); }
        window.VyraTestspel.stoppa();
      }
    }
    ut.push(r);
  }
  return ut;
};

const nara = (a, b) => Math.abs(a - b) <= 1;

for (const [lage, url, studio] of [['studio', 'studio.html?open=layout', true], ['overlay', 'studio.html?overlay=1', false]]) {
  test(`${lage}: varje katalognyckel har en absolut låda på sin x/y${studio ? ', och ▶ Testa-klonen står på samma plats' : ''}`, { skip, timeout: 600000 }, async () => {
    const { page, fel } = await oppna(url);
    try {
      const svar = await page.evaluate(MAT, [NYCKLAR, X, Y, studio]);
      const brott = [];
      let kloner = 0;
      for (const r of svar) {
        if (!r.finns) { brott.push(`${r.k}: ritades inte`); continue; }
        if (r.pos !== 'absolute') brott.push(`${r.k}: position ${r.pos}`);
        // En låda som är display:none i vila (overlayns släckta larm) har ingen offset att läsa.
        if (r.ritad && (!nara(r.lada.x, X) || !nara(r.lada.y, Y))) brott.push(`${r.k}: står på ${r.lada.x},${r.lada.y}, inte ${X},${Y}`);
        if (r.ritad && r.forälder === false) brott.push(`${r.k}: lådans offsetParent är inte duken`);
        if (r.klon) {
          kloner += 1;
          if (r.klonPos !== 'absolute') brott.push(`${r.k}: testklonen har position ${r.klonPos}`);
          for (const d of ["x", "y"]) if (!nara(r.klon[d], r.efter[d])) brott.push(`${r.k}: testklonen ${d} ${r.klon[d]}, noden ${r.efter[d]}`);
        }
      }
      assert.equal(svar.length, NYCKLAR.length);
      if (studio) assert.ok(kloner >= 20, `bara ${kloner} nycklar gav en testklon att mäta`);
      assert.deepEqual(brott, [], `${lage}: lådor som inte står på sin x/y`);
      assert.deepEqual(fel, [], `runtimefel i ${lage}`);
    } finally { await page.close() }
  });
}

test('overlay: heartbeat, orbitlevel och Guardian efter varandra — ingen knuffar ned nästa', { skip, timeout: 120000 }, async () => {
  const { page, fel } = await oppna('studio.html?overlay=1');
  try {
    const r = await page.evaluate(async () => {
      const mk = (k, id, x, y) => Object.assign(VyraWidgets.create(k), { id, x, y });
      state.widgets = [mk('catalog:fanlevel:layout:heartbeat', 'a', 10, 20), mk('catalog:gifterlevel:orbitlevel', 'b', 20, 40),
        mk('catalog:fanlevel:layout:heartbeat', 'c', 30, 60), mk('catalog:guardianemblem:model:sapphire', 'd', 16, 80)];
      selected = null; render();
      await new Promise(r => setTimeout(r, 100));
      return state.widgets.map(w => { const el = document.querySelector(`.canvas [data-id="${w.id}"]`);
        return { id: w.id, x: w.x, y: w.y, ox: el.offsetLeft, oy: el.offsetTop, pos: getComputedStyle(el).position }; });
    });
    for (const w of r) {
      assert.equal(w.pos, 'absolute', `${w.id}: position ${w.pos}`);
      assert.ok(nara(w.ox, w.x) && nara(w.oy, w.y), `${w.id}: står på ${w.ox},${w.oy}, inte ${w.x},${w.y}`);
    }
    assert.deepEqual(fel, [], 'runtimefel i overlayn');
  } finally { await page.close() }
});

test('sparade Fan Level- och Gifter Level-lådor som flödet sköt ned står kvar där de syntes, i studio och overlay', { skip, timeout: 120000 }, async () => {
  // Det gamla läget återskapas med en stilregel som ger de tre flödeslådorna `position:relative`
  // igen, och en SPARAD layout utan markeringarna (levelPlacering/guardianPlacering) ritas: först
  // med den gamla regeln (där syntes de), sedan med dagens CSS. Två designer som aldrig låg i flödet
  // (hero, profile) står kvar orörda och markeras.
  const LAYOUT = () => {
    const mk = (n, id, x, y, extra) => { const w = VyraWidgets.create(n); delete w.levelPlacering; delete w.guardianPlacering; return Object.assign(w, { id, x, y }, extra || {}); };
    return [mk('catalog:fanlevel:layout:heartbeat', 'f1', 20, 30), mk('catalog:gifterlevel:orbitlevel', 'g1', 40, 50),
      mk('catalog:fanlevel:layout:heartbeat', 'f2', 60, 10, { widgetScale: 0.5 }), mk('catalog:guardianemblem:model:sapphire', 'e1', 16, 40, { widgetScale: 0.35 }),
      mk('catalog:fanlevel:layout:hero', 'h1', 70, 300), mk('catalog:gifterlevel:profile', 'p1', 90, 400)];
  };
  const IDN = ['f1', 'g1', 'f2', 'e1', 'h1', 'p1'];
  for (const [lage, url] of [['studio', 'studio.html?open=layout'], ['overlay', 'studio.html?overlay=1']]) {
    const { page, fel } = await oppna(url);
    try {
      const matt = () => page.evaluate(idn => {
        const duk = document.querySelector('.canvas'), c = duk.getBoundingClientRect(), s = c.width / duk.offsetWidth;
        return idn.map(id => { const b = document.querySelector(`.canvas [data-id="${id}"]`).getBoundingClientRect();
          return { x: +((b.left - c.left) / s).toFixed(1), y: +((b.top - c.top) / s).toFixed(1) }; });
      }, IDN);
      await page.evaluate(L => {
        // Lådornas tomgångsanimationer (transform) flyttar rektangeln med tiden — de fryses, så att
        // det som jämförs är placeringen och inte var i en animation mätningen råkade landa.
        const frys = document.createElement('style');
        frys.textContent = '.canvas *,.canvas *::before,.canvas *::after{animation:none!important;transition:none!important}';
        document.head.append(frys);
        const stil = document.createElement('style'); stil.id = 'plats-gammalt';
        stil.textContent = '.canvas :is(.guardian-emblem,.fan-layout-heartbeat.fan-level-up,.gifter-layout-orbitlevel.gifter-level-up){position:relative!important}';
        document.head.append(stil);
        state.widgets = (new Function('return (' + L + ')()'))(); selected = null; render();
      }, LAYOUT.toString());
      await page.waitForTimeout(200);
      const gammalt = await matt();
      // Kontrollmätning: flödet sköt verkligen ned g1 (efter f1), annars bevisar provet ingenting.
      assert.ok(gammalt[1].y > 50 + 40, `kontrollmätning (${lage}): heartbeat sköt inte ned orbitlevel (${JSON.stringify(gammalt[1])})`);
      await page.evaluate(L => {
        document.getElementById('plats-gammalt').remove();
        state.widgets = (new Function('return (' + L + ')()'))(); selected = null; render();
      }, LAYOUT.toString());
      await page.waitForTimeout(300);
      const nu = await matt();
      gammalt.forEach((g, i) => assert.ok(nara(nu[i].x, g.x) && nara(nu[i].y, g.y), `${lage}: ${IDN[i]} syns på ${JSON.stringify(nu[i])}, förut ${JSON.stringify(g)}`));
      const m = await page.evaluate(() => state.widgets.map(w => w.levelPlacering || w.guardianPlacering));
      assert.deepEqual(m, ['absolut', 'absolut', 'absolut', 'absolut', 'absolut', 'absolut'], `${lage}: markeringen sattes inte`);
      const hero = await page.evaluate(() => state.widgets.filter(w => w.id === 'h1' || w.id === 'p1').map(w => [w.x, w.y]));
      assert.deepEqual(hero, [[70, 300], [90, 400]], `${lage}: en design som aldrig låg i flödet flyttades`);
      await page.evaluate(() => render());
      await page.waitForTimeout(150);
      (await matt()).forEach((g, i) => assert.ok(nara(g.x, nu[i].x) && nara(g.y, nu[i].y), `${lage}: ${IDN[i]} flyttades igen vid nästa omritning`));
      assert.deepEqual(fel, [], `runtimefel i ${lage}`);
    } finally { await page.close() }
  }
});
