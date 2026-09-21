'use strict';
// DUKENS GRÄNS I ETT RIKTIGT DRAG.
//
// Uppmätt 2026-09-19 i Davids layout: Top Gift låg på x=-16 och Top Like på x=688 i en duk
// som är 432 bred. Editorn lät honom dra dit och sa ingenting, så widgetarna fanns kvar i
// datan men syntes aldrig i OBS eller TikTok LIVE Studio. Samma sak fanns i bandet från
// sändningen 2026-09-18 (Top Gift x=736, Battle MVP y=768).
//
// Provet drar på riktigt — pointerdown/move/up genom studio.js dragmått — och kräver två
// saker av varje drag: att det SPARADE läget ryms i duken, och att det läge användaren SER
// under draget redan är inne. Klämmer man bara vid pointerup hoppar widgeten tillbaka när
// man släpper, och det ser ut som en bugg även när datan blir rätt.
//
// Ett drag inne på duken måste lämnas orört. Utan det provet hade en gräns som klämmer allt
// till 0 varit grön.
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
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

const WIDGET = { id: 'd1', type: 'templateTopLike', x: 40, y: 40, width: 300 };

async function editorn(widgets, vy) {
  const context = await browser.newContext({ viewport: vy || { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function', null, { timeout: 20000 });
  await page.evaluate(async ws => {
    await window.VyraSessionState.projectLocalSession();
    view = 'editor'; state.widgets = ws; selected = 'd1';
    render(); if (typeof bind === 'function') bind();
    await new Promise(r => setTimeout(r, 700));
  }, widgets || [WIDGET]);
  return { context, page };
}

// Drar d1 sa att dess RAA lage hamnar pa malLeft/malTop i dukpixlar, och rapporterar bade
// det SEDDA laget mitt i draget och det SPARADE laget efterat.
async function dra(page, malLeft, malTop) {
  return page.evaluate(async ({ malLeft, malTop }) => {
    const skala = window.getEditorCanvasScale();
    const el = document.querySelector('.canvas [data-id="d1"]');
    el.setPointerCapture = () => {}; el.releasePointerCapture = () => {};
    const startLeft = parseInt(el.style.left, 10), startTop = parseInt(el.style.top, 10);
    const r = el.getBoundingClientRect();
    const x0 = r.left + 5, y0 = r.top + 5;
    const dx = (malLeft - startLeft) * skala, dy = (malTop - startTop) * skala;
    const skicka = (typ, x, y) => el.dispatchEvent(new PointerEvent(typ,
      { pointerId: 1, clientX: x, clientY: y, bubbles: true }));
    skicka('pointerdown', x0, y0);
    skicka('pointermove', x0 + dx, y0 + dy);
    await new Promise(res => setTimeout(res, 200));
    const sett = { left: parseInt(el.style.left, 10), top: parseInt(el.style.top, 10) };
    skicka('pointerup', x0 + dx, y0 + dy);
    await new Promise(res => setTimeout(res, 300));
    const c = document.querySelector('.editor-shell .canvas');
    const w = state.widgets.find(x => x.id === 'd1');
    return {
      sett,
      sparat: { x: w.x, y: w.y },
      duk: { bredd: c.offsetWidth, hojd: c.offsetHeight },
      widget: { bredd: el.offsetWidth, hojd: el.offsetHeight },
      minKvar: window.VyraGrans.MIN_KVAR
    };
  }, { malLeft, malTop });
}

test('ett drag langt ut till hoger stannar vid kanten', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await dra(page, 688, 200);          // Davids faktiska varde
    // Hela widgeten ska rymmas: taket ar duk minus widgetens renderade bredd.
    const tak = m.duk.bredd - m.widget.bredd;
    assert.equal(m.sparat.x, tak, `x ${m.sparat.x} skulle vara ${tak} (duk ${m.duk.bredd})`);
    assert.ok(m.sparat.x < m.duk.bredd, 'widgeten hamnade helt utanfor duken');
    assert.equal(m.sett.left, tak, 'laget under draget slapptes ut och hoppade tillbaka forst vid slappet');
  } finally { await context.close() }
});

test('ett drag ut till vanster stannar vid noll', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await dra(page, -160, 100);
    assert.equal(m.sparat.x, 0, `x ${m.sparat.x} skulle vara 0`);
    assert.equal(m.sett.left, 0, 'laget under draget var negativt');
  } finally { await context.close() }
});

test('ett drag nedanfor duken stannar vid nederkanten', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await dra(page, 100, 900);
    const tak = m.duk.hojd - m.widget.hojd;
    assert.equal(m.sparat.y, tak, `y ${m.sparat.y} skulle vara ${tak} (duk ${m.duk.hojd})`);
    assert.ok(m.sparat.y < m.duk.hojd, 'widgeten hamnade helt utanfor duken');
  } finally { await context.close() }
});

test('ett drag INNE pa duken lamnas orort av gransen', { skip, timeout: 90000 }, async () => {
  // Utan det har provet hade en gräns som klämmer allt till 0 varit grön.
  const { context, page } = await editorn();
  try {
    const m = await dra(page, 64, 120);
    assert.ok(m.sparat.x > 0 && m.sparat.x < m.duk.bredd - m.minKvar,
      `x ${m.sparat.x} blev inte ett fritt lage inne pa duken`);
    assert.ok(m.sparat.y > 0, `y ${m.sparat.y} klamdes till kanten trots att draget var inne pa duken`);
  } finally { await context.close() }
});

test('en widget som sticker ut markeras i editorn — utan att flyttas', { skip, timeout: 90000 }, async () => {
  // Markeringen ar det som faktiskt tjanar malet: gransen hindrar att en widget TAPPAS BORT,
  // men den slapper igenom lagen dar det mesta hamnar utanfor bild. Da ska editorn saga det.
  // Den far INTE flytta nagot: en engangsflytt hade skrivit om kundens sparade layout.
  const { context, page } = await editorn();
  try {
    const m = await page.evaluate(async () => {
      const w = state.widgets.find(x => x.id === 'd1');
      w.x = 300; w.y = 40;                       // 300 + 220 = 520 > 432
      render(); if (typeof bind === 'function') bind();
      await new Promise(r => setTimeout(r, 400));
      const el = document.querySelector('.canvas [data-id="d1"]');
      return { markerad: el.dataset.utanforDuken === '1', x: w.x, y: w.y };
    });
    assert.equal(m.markerad, true, 'widgeten som sticker ut fick ingen markering');
    assert.equal(m.x, 300, 'markeringen FLYTTADE widgeten — den ska bara markera');
  } finally { await context.close() }
});

test('en widget inne pa duken markeras inte', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const markerad = await page.evaluate(async () => {
      const w = state.widgets.find(x => x.id === 'd1');
      w.x = 40; w.y = 40;
      render(); if (typeof bind === 'function') bind();
      await new Promise(r => setTimeout(r, 400));
      return document.querySelector('.canvas [data-id="d1"]').dataset.utanforDuken === '1';
    });
    assert.equal(markerad, false, 'en widget inne pa duken blev felaktigt markerad');
  } finally { await context.close() }
});

// ---- RAKNAREN ----------------------------------------------------------------------------
// Markeringen ensam racker inte: ligger widgeten HELT utanfor duken ligger dess markering
// ocksa utanfor. Uppmatt pa Davids layout — Top Like pa x=688 lag utanfor hela ytan.

const UTE = { id: 'd1', type: 'templateTopLike', x: 688, y: 200, width: 76 };
const INNE = { id: 'd2', type: 'templateTopLike', x: 40, y: 40, width: 300 };

async function raknartext(page) {
  return page.evaluate(() => {
    const k = document.querySelector('.workarea [data-grans-raknare]');
    return k ? k.textContent : null;
  });
}

test('raknaren visar hur manga som ligger utanfor', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn([UTE, INNE]);
  try {
    const t = await raknartext(page);
    assert.ok(t && /1\s+widget/.test(t), `raknaren sa ${JSON.stringify(t)}, forvantade "1 widget"`);
    assert.ok(t.includes('utanf'), 'raknaren namner inte bildrutan');
  } finally { await context.close() }
});

test('raknaren finns inte alls nar allt ligger inne', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn([INNE]);
  try {
    assert.equal(await raknartext(page), null, 'raknaren visades trots att allt lag inne');
  } finally { await context.close() }
});

test('ett klick pa raknaren flyttar in dem — och bara dem', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn([UTE, INNE]);
  try {
    const m = await page.evaluate(async () => {
      const innanX = state.widgets.find(w => w.id === 'd2').x;
      document.querySelector('.workarea [data-grans-raknare]').click();
      await new Promise(r => setTimeout(r, 600));
      const c = document.querySelector('.editor-shell .canvas');
      const ute = state.widgets.find(w => w.id === 'd1');
      const el = document.querySelector('.canvas [data-id="d1"]');
      return {
        uteX: ute.x, uteBredd: el.offsetWidth, dukBredd: c.offsetWidth,
        inneX: state.widgets.find(w => w.id === 'd2').x, innanX,
        kvar: !!document.querySelector('.workarea [data-grans-raknare]')
      };
    });
    assert.ok(m.uteX + m.uteBredd <= m.dukBredd,
      `widgeten ligger fortfarande utanfor: ${m.uteX} + ${m.uteBredd} > ${m.dukBredd}`);
    assert.equal(m.inneX, m.innanX, 'en widget som redan lag inne FLYTTADES av knappen');
    assert.equal(m.kvar, false, 'raknaren stod kvar trots att allt nu ligger inne');
  } finally { await context.close() }
});

test('ett klick pa raknaren gar att angra', { skip, timeout: 90000 }, async () => {
  // Jag PASTOD att angra fungerar for att save() anropar VyraHistorik.notera(). Det ar inte
  // sjalvklart: flyttaInAlla muterar state FORE save(), sa om notera() spelade in nulaget hade
  // den spelat in det NYA laget och angra blivit verkningslos. notera() lagger i stallet
  // `senast` — det foregaende laget — pa stacken. Det har provet ar skillnaden mellan att tro
  // det och att veta det, och utan det kan en anvandare som klickat fel bli inlast.
  const { context, page } = await editorn([UTE, INNE]);
  try {
    const m = await page.evaluate(async () => {
      const fore = state.widgets.find(w => w.id === 'd1').x;
      document.querySelector('.workarea [data-grans-raknare]').click();
      await new Promise(r => setTimeout(r, 600));
      const efterFlytt = state.widgets.find(w => w.id === 'd1').x;

      const apiFinns = !!(window.VyraHistorik && typeof window.VyraHistorik.angra === 'function');
      if (apiFinns) await window.VyraHistorik.angra();
      await new Promise(r => setTimeout(r, 600));

      return {
        apiFinns, fore, efterFlytt,
        efterAngra: state.widgets.find(w => w.id === 'd1').x,
        knappFinns: !!document.querySelector('.editor-toolbar [data-angra]')
      };
    });
    assert.equal(m.apiFinns, true, 'window.VyraHistorik.angra saknas');
    assert.notEqual(m.efterFlytt, m.fore, 'knappen flyttade ingenting — provet mater inget');
    assert.equal(m.efterAngra, m.fore,
      `angra tog inte tillbaka widgeten: ${m.fore} -> ${m.efterFlytt} -> ${m.efterAngra}`);
  } finally { await context.close() }
});

test('angra-knappen i verktygsraden blir klickbar efter en flytt', { skip, timeout: 90000 }, async () => {
  // API:t ar en sak, knappen anvandaren faktiskt ser en annan.
  const { context, page } = await editorn([UTE, INNE]);
  try {
    const m = await page.evaluate(async () => {
      const k = () => document.querySelector('.editor-toolbar [data-angra]');
      const foreDisablad = k() ? k().disabled : null;
      document.querySelector('.workarea [data-grans-raknare]').click();
      await new Promise(r => setTimeout(r, 600));
      return { foreDisablad, efterDisablad: k() ? k().disabled : null, finns: !!k() };
    });
    assert.equal(m.finns, true, 'angra-knappen saknas i verktygsraden');
    assert.equal(m.efterDisablad, false, 'angra-knappen ar fortfarande disablad efter flytten');
  } finally { await context.close() }
});

test('banderollen ar LASBAR vid ett smalt fonster, inte bara narvarande', { skip, timeout: 90000 }, async () => {
  // DET HAR PROVET SAKNADES, och det kostade en deploy. Forsta versionen la varningen i
  // editorns verktygsrad och provade bara textContent. I produktion, vid 1280 px
  // fonsterbredd, hade raden 538 px synligt at nio knappar — den spillde over med 6 px REDAN
  // utan varningen — sa flexboxen klamde ihop knappen till 54 px. Ratt text, oläslig knapp,
  // gront prov. Darav: mat den RENDERADE rutan, inte strangen.
  const { context, page } = await editorn([UTE, INNE], { width: 1280, height: 800 });
  try {
    const m = await page.evaluate(() => {
      const k = document.querySelector('.workarea [data-grans-raknare]');
      if (!k) return { finns: false };
      const yta = document.querySelector('.editor-shell .workarea');
      const kr = k.getBoundingClientRect(), yr = yta.getBoundingClientRect();
      return {
        finns: true,
        klamd: k.scrollWidth > k.clientWidth + 1,
        bredd: Math.round(kr.width),
        innehall: k.scrollWidth,
        inomYtan: kr.left >= yr.left - 1 && kr.right <= yr.right + 1,
        text: k.textContent
      };
    });
    assert.equal(m.finns, true, 'banderollen saknas vid 1280 px');
    assert.equal(m.klamd, false,
      `banderollen ar ihopklamd: rutan ar ${m.bredd} px men innehallet kraver ${m.innehall} px`);
    assert.equal(m.inomYtan, true, 'banderollen ligger utanfor arbetsytans synliga del');
    assert.ok(m.text.includes('utanf'), 'banderollen namner inte bildrutan');
  } finally { await context.close() }
});

// ---- NEDSKALAD WIDGET: HELA DUKEN SKA GA ATT ANVANDA ------------------------------------
//
// UPPMATT 2026-09-21 i Davids egen layout, i riktig Chrome: Top Gift hade offsetWidth 340 men
// syntes bara 119 px bred, for widgeten bar `zoom:0.35` som inline-stil (widgetScale). Den
// gamla inneslutningen reserverade 340 och slappte darfor aldrig widgeten forbi x=92 i en 432
// bred duk, trots att den hade fatt plats anda till 313. Top Likes stoppades vid 50 och Top
// Streak vid 212 av samma skal. Det var darfor allt klumpade ihop sig uppe till vanster.
//
// Provet drar en NEDSKALAD widget sa langt at hoger det gar och kraver tva saker:
//   1. den SYNLIGA hogerkanten ska na dukens hogerkant — hela ytan ar anvandbar
//   2. den far anda inte passera den — regeln "hela widgeten ska synas" ar oforandrad
// Ett prov som bara krävde (1) hade varit grönt aven om gransen tagits bort helt.
test('en nedskalad widget nar anda ut till dukens hogerkant', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn([{ ...WIDGET, widgetScale: 0.35 }]);
  try {
    const fore = await page.evaluate(() => {
      const el = document.querySelector('.canvas [data-id="d1"]');
      return { zoom: getComputedStyle(el).zoom, offsetBredd: el.offsetWidth };
    });
    assert.ok(parseFloat(fore.zoom) > 0 && parseFloat(fore.zoom) < 1,
      `riggen gav ingen nedskalning: zoom=${fore.zoom}`);

    const r = await dra(page, 9999, 40);
    const skala = parseFloat(fore.zoom);
    const synligBredd = r.widget.bredd * skala;
    const synligHoger = r.sparat.x * skala + synligBredd;

    // 1. Hela duken ar anvandbar: den synliga hogerkanten nar anda fram.
    assert.ok(synligHoger > r.duk.bredd - 2,
      `widgeten stannade ${Math.round(r.duk.bredd - synligHoger)} px fran hogerkanten `
      + `(sparat x=${r.sparat.x}, syns ${Math.round(synligBredd)} av ${r.duk.bredd})`);

    // 2. Men inte utanfor.
    assert.ok(synligHoger <= r.duk.bredd + 1,
      `widgeten hamnade ${Math.round(synligHoger - r.duk.bredd)} px UTANFOR hogerkanten`);

    // 3. Den gamla gransen lag pa duk minus OSKALAD bredd. Passeras den ar buggen borta.
    assert.ok(r.sparat.x > r.duk.bredd - r.widget.bredd,
      `x=${r.sparat.x} passerade aldrig den gamla gransen ${r.duk.bredd - r.widget.bredd}`);

    // 4. Det man SER under draget ar redan inne — inget hopp nar man slapper.
    assert.equal(r.sett.left, r.sparat.x, 'sett och sparat lage skiljer sig');
  } finally { await context.close(); }
});

test('en nedskalad widget markeras inte som utanfor nar den star vid kanten', { skip, timeout: 90000 }, async () => {
  // Klampen och markeringen maste vara ense aven med nedskalning. Annars star banderollen
  // och sager att widgeten ligger utanfor bilden precis dar klampen just lagt den.
  const { context, page } = await editorn([{ ...WIDGET, widgetScale: 0.35 }]);
  try {
    await dra(page, 9999, 40);
    const r = await page.evaluate(() => {
      const el = document.querySelector('.canvas [data-id="d1"]');
      return { markerad: el.dataset.utanforDuken === '1', ute: window.VyraGrans.rakna().length };
    });
    assert.equal(r.markerad, false, 'klampen la den dar markeringen kallar den utanfor');
    assert.equal(r.ute, 0, 'raknaren sager att en widget ligger utanfor bilden');
  } finally { await context.close(); }
});
