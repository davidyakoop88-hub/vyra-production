'use strict';
// TOPPLISTORNA LÄSBARA I LITEN STORLEK (2026-10-12).
//
// Davids ord: "ramarna syns knappt så tydliga — overlaylive.app har ramar som ser tydligt på liven
// men inte mina", och "grejen är när man har dem i mini läge (liten storlek) så ser man inte dem
// tydligt". Liten storlek = widgetScale (CSS zoom). UPPMÄTT FÖRE, synlig bredd 120 px:
//   Celestial   namn 3,8 px, foto 11,8 px      Voltage   namn 6,4 px, foto 21,8 px
//   Top Gift royal namn 7,0 px                Top Coins Voltage skalade inte alls (228 px vid varje skala)
//
// KONTRAKTET som låses här, mätt i riktig Chromium:
//   1. Namn, plats och siffra är aldrig under 12 SYNLIGA designpixlar — varken i full storlek
//      eller när widgeten krymps.
//   2. Vid smal bredd slår kompaktläget till: namn och siffra står på en mörk platta
//      (rgba(10,6,16,.85)) med kant, alla platser står kvar, och fotot är större än före.
//   5. Kompaktläget slår inte till i onödan: Celestial vid 260 px behåller fem kolumner, och namnen
//      bryts på två rader i stället för att klippas (granskningen av #604).
//   3. Top Coins i de sex designerna följer widgetScale (zoom), som Top Like.
//   4. Top Gift visar familjens guldmynt, inte "◉".
//
// VARFÖR RIKTIG WEBBLÄSARE: synlig textstorlek under zoom och motzoom går bara att mäta med layout.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

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

let server, browser, bas, page;
const skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
  page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraRankingSixpack, null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: '.canvas{transform:none!important}.canvas .widget,.canvas .widget *,.canvas .widget *::before,.canvas .widget *::after{animation:none!important;transition:none!important}' });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// Ritar EN widget i editorn med given skala och mäter i SYNLIGA pixlar (zoomen inräknad med en
// 1000 px bred sond, så avrundade offsetmått inte spelar in).
async function mat(nyckel, skala) {
  return page.evaluate(([nyckel, skala]) => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(nyckel);
    w.x = 10; w.y = 40; w.widgetScale = skala;
    state.widgets.push(w); selected = null; render();
    const rot = document.querySelector(`.canvas [data-id="${w.id}"]`);
    const zoomVid = el => {
      const s = document.createElement('i');
      s.style.cssText = 'position:absolute;display:block;width:1000px;height:1px;left:0;top:0;visibility:hidden';
      el.append(s); const z = s.getBoundingClientRect().width / 1000; s.remove(); return z;
    };
    // Ett dolt element (Royal Rose visar ingen plats i full storlek) har ingen synlig storlek alls.
    const synligFont = el => { if (!el || !el.getClientRects().length) return null; return +(parseFloat(getComputedStyle(el).fontSize) * zoomVid(el)).toFixed(2); };
    const rader = [...rot.querySelectorAll('.toplike-row')].filter(r => getComputedStyle(r).display !== 'none');
    const forsta = rader[0] || rot;
    const namn = forsta.querySelector('.rk6-namn>strong, .topgift-copy strong, .tc-copy strong');
    const varde = forsta.querySelector('em');
    const rang = forsta.querySelector('.rk6-rang>i');
    const foto = forsta.querySelector('.rk6-karna>img:not(.rk6-profilram), .vyra-profile-face img');
    const platta = rader[0] ? getComputedStyle(rader[0], '::before') : (rot.querySelector('.topgift-copy') && getComputedStyle(rot.querySelector('.topgift-copy')));
    return {
      klass: rot.className, bredd: +rot.getBoundingClientRect().width.toFixed(1), rader: rader.length,
      namn: synligFont(namn), varde: synligFont(varde), rang: rang ? synligFont(rang) : null,
      foto: foto ? +foto.getBoundingClientRect().width.toFixed(1) : null,
      platta: platta ? { bg: platta.backgroundColor, kant: platta.borderTopWidth, kantstil: platta.borderTopStyle, hojd: platta.height, display: platta.display } : null,
      mynt: !!rot.querySelector('em svg'), cirkel: (varde && varde.textContent || '').includes('◉')
    };
  }, [nyckel, skala]);
}

const PLATTA = 'rgba(10, 6, 16, 0.85)';

for (const [nyckel, skala] of [
  ['catalog:toplike:voltage', 0.52], ['catalog:toplike:celestial', 0.31],
  ['catalog:ranking:templateTopCoins:prism-horizontal', 0.31], ['catalog:ranking:templateTopPoints:basic-v2', 0.54]
]) {
  test(`${nyckel} vid ~120 synliga px: kompakt, plattan bakom namn och siffra, inget under 12 px`, { skip }, async () => {
    const m = await mat(nyckel, skala);
    assert.match(m.klass, /\brk6-kompakt\b/, `kompaktläget slog inte till vid skala ${skala}: ${m.klass}`);
    assert.ok(m.bredd <= 140, `widgeten ska följa sin skala (synlig bredd ${m.bredd} px)`);
    assert.equal(m.rader, 5, 'kompaktläget behåller alla fem platserna (granskningen av #604)');
    for (const [del, v] of [['namn', m.namn], ['siffra', m.varde], ['plats', m.rang]]) {
      assert.ok(v >= 11.9, `${del} är ${v} synliga px — golvet är 12`);
    }
    assert.ok(m.foto >= 30, `profilbilden är ${m.foto} synliga px — kompaktläget ska ge en större bild`);
    assert.equal(m.platta.display, 'block', 'plattan ritas inte');
    assert.equal(m.platta.bg, PLATTA, `plattans bakgrund: ${m.platta.bg}`);
    // Kantens beräknade bredd följer zoomen (0,5 px vid motzoom), så stilen är det som provas.
    assert.ok(m.platta.kantstil === 'solid' && parseFloat(m.platta.kant) > 0, `plattan har en kant i accentfärgen (${m.platta.kantstil} ${m.platta.kant})`);
    assert.ok(parseFloat(m.platta.hojd) >= 28, `plattan är ${m.platta.hojd} hög — den omsluter inte namn och siffra`);
  });
}

for (const nyckel of ['catalog:toplike:voltage', 'catalog:toplike:basic-v2', 'catalog:toplike:prism-vertical',
  'catalog:toplike:prism-horizontal', 'catalog:toplike:celestial', 'catalog:toplike:royal-rose']) {
  test(`${nyckel} i full storlek: inte kompakt, och namn/plats/siffra minst 12 px`, { skip }, async () => {
    const m = await mat(nyckel, 1);
    assert.doesNotMatch(m.klass, /\brk6-kompakt\b/, 'full storlek ska se ut som förut, inte kompakt');
    assert.equal(m.rader, 5);
    for (const [del, v] of [['namn', m.namn], ['siffra', m.varde], ['plats', m.rang]]) {
      if (v == null) continue;           // Royal Rose visar ingen plats i full storlek
      assert.ok(v >= 11.9, `${del} är ${v} px i full storlek`);
    }
    if (!/voltage/.test(nyckel)) {
      assert.equal(m.platta.bg, PLATTA, 'namn och siffra står på plattan, inte direkt mot videon');
      assert.ok(parseFloat(m.platta.hojd) >= 20, `plattan har höjden ${m.platta.hojd}`);
    }
  });
}

test('Top Coins följer widgetScale som Top Like (förr 228 px vid varje skala)', { skip }, async () => {
  const hel = await mat('catalog:ranking:templateTopCoins:voltage', 1);
  const halv = await mat('catalog:ranking:templateTopCoins:voltage', 0.9);
  assert.ok(halv.bredd < hel.bredd * 0.95, `bredd ${hel.bredd} → ${halv.bredd} vid skala 0,9`);
});

test('Prism horisontal ryms på 432-duken från riggens x=40', { skip }, async () => {
  const m = await mat('catalog:toplike:prism-horizontal', 1);
  assert.ok(40 + m.bredd <= 432, `40 + ${m.bredd} px går utanför duken`);
});

// Läsbarhetslagret (ranking-sixpack.js) gäller originalmarkupen, som Design 1 (neon) bär sedan
// 2026-10-17. Design 2 och 3 har egen markup och ett eget golv i topgift-designer.css; provet under.
test('Top Gift Design 1 liten: guldmyntet i stället för ◉, namn och siffra på plattan, minst 12 px', { skip }, async () => {
  const m = await mat('catalog:topgift:premium:neon', 0.54);
  assert.match(m.klass, /\brk-kompakt\b/);
  assert.ok(m.mynt && !m.cirkel, 'värdet ska bära guldmyntet, inte ◉');
  assert.ok(m.namn >= 11.9 && m.varde >= 11.9, `namn ${m.namn} / siffra ${m.varde} synliga px`);
  assert.equal(m.platta.bg, PLATTA);
});

for (const [nyckel, skala] of [['catalog:topgift:premium:royal', 0.54], ['catalog:topgift:premium:fokus', 0.54], ['catalog:topgift:premium:fokus', 0.35]]) {
  test(`${nyckel} vid ${skala}: namn och siffra minst 12 synliga px`, { skip }, async () => {
    const m = await mat(nyckel, skala);
    assert.ok(m.namn >= 11.9 && m.varde >= 11.9, `namn ${m.namn} / siffra ${m.varde} synliga px`);
  });
}

// GRANSKNINGEN AV #604: kompaktläget slog till redan vid 260 px och klippte "Anya Pla…" och
// "Lina Nor…" där före-bilden visade hela namnen. Nu: fem kolumner kvar, namnen i 12 px bryts på
// två rader, och ingen ellips så länge två rader räcker.
for (const [nyckel, skala] of [['catalog:toplike:celestial', 0.67], ['catalog:toplike:royal-rose', 0.67], ['catalog:toplike:royal-rose', 0.82]]) {
  test(`${nyckel} vid skala ${skala}: inte kompakt, fem platser, inga klippta namn`, { skip }, async () => {
    const m = await mat(nyckel, skala);
    assert.doesNotMatch(m.klass, /\brk6-kompakt\b/, 'fem platser i 12 px ryms här — kompaktläget ska inte slå till');
    assert.equal(m.rader, 5);
    assert.ok(m.namn >= 11.9, `namn ${m.namn} px`);
    const klippta = await page.evaluate(() => [...document.querySelectorAll('.canvas .toplike-row .rk6-namn>strong')]
      .filter(s => s.textContent && (s.scrollHeight > s.clientHeight + 1 || s.scrollWidth > s.clientWidth + 1)).map(s => s.textContent));
    assert.deepEqual(klippta, [], `klippta namn: ${klippta.join(', ')}`);
  });
}
