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
      minKvar: window.VyraGrans.MIN_KVAR,
      minSynlig: window.VyraGrans.MIN_SYNLIG
    };
  }, { malLeft, malTop });
}

// SEDAN 2026-09-26: FRI PLACERING MED EN SYNLIG DEL. Davids ord: "om jag vill gora den stor
// widget och lite hamnar utanfor den ska inte vara problem, men att man stoppar widget flytta
// vart man vill ar problem". Draget far ga delvis utanfor at alla hall; det stannar forst nar
// bara MIN_SYNLIG px av widgeten ar kvar pa duken, sa den aldrig forsvinner.
test('ett drag delvis ut till vanster och uppat lamnas dar anvandaren slappte', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await dra(page, -64, -40);          // pa snappens 8-rutnat
    assert.equal(m.sparat.x, -64, `x ${m.sparat.x}: draget stoppades fast det var tillatet`);
    assert.equal(m.sparat.y, -40, `y ${m.sparat.y}: draget stoppades fast det var tillatet`);
    assert.equal(m.sett.left, -64, 'laget under draget skilde sig fran det sparade');
  } finally { await context.close() }
});

test('ett drag langt ut till hoger lamnar en synlig del kvar pa duken', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await dra(page, 688, 200);          // Davids faktiska varde - dar var den borta
    const tak = m.duk.bredd - Math.min(m.minSynlig, m.widget.bredd);
    assert.equal(m.sparat.x, tak, `x ${m.sparat.x} skulle vara ${tak} (duk ${m.duk.bredd})`);
    assert.ok(m.sparat.x > m.duk.bredd - m.widget.bredd, 'draget stoppades vid kanten som forr');
    assert.equal(m.sett.left, tak, 'laget under draget slapptes ut och hoppade tillbaka forst vid slappet');
  } finally { await context.close() }
});

test('ett drag langt ut till vanster lamnar en synlig del kvar pa duken', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await dra(page, -9999, 100);
    const golv = Math.min(m.minSynlig, m.widget.bredd) - m.widget.bredd;
    assert.equal(m.sparat.x, golv, `x ${m.sparat.x} skulle vara ${golv}`);
    assert.equal(m.sett.left, golv, 'laget under draget skilde sig fran det sparade');
  } finally { await context.close() }
});

test('ett drag nedanfor duken lamnar en synlig del kvar', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await dra(page, 100, 9999);
    const tak = m.duk.hojd - Math.min(m.minSynlig, m.widget.hojd);
    assert.equal(m.sparat.y, tak, `y ${m.sparat.y} skulle vara ${tak} (duk ${m.duk.hojd})`);
    assert.ok(m.sparat.y > m.duk.hojd - m.widget.hojd, 'draget stoppades vid nederkanten som forr');
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

test('en widget som forsvunnit ur bild markeras i editorn — utan att flyttas', { skip, timeout: 90000 }, async () => {
  // En sparad layout kan ha en widget helt utanfor (Top Like pa x=688, 2026-09-19). Den ska
  // markeras, men far INTE flyttas: en engangsflytt hade skrivit om kundens sparade layout.
  const { context, page } = await editorn();
  try {
    const m = await page.evaluate(async () => {
      const w = state.widgets.find(x => x.id === 'd1');
      w.x = 688; w.y = 40;
      render(); if (typeof bind === 'function') bind();
      await new Promise(r => setTimeout(r, 400));
      const el = document.querySelector('.canvas [data-id="d1"]');
      return { markerad: el.dataset.utanforDuken === '1', x: w.x, y: w.y };
    });
    assert.equal(m.markerad, true, 'widgeten som forsvunnit fick ingen markering');
    assert.equal(m.x, 688, 'markeringen FLYTTADE widgeten — den ska bara markera');
  } finally { await context.close() }
});

test('en widget som bara sticker ut delvis markeras inte', { skip, timeout: 90000 }, async () => {
  // Delvis utanfor ar ett val sedan 2026-09-26, inte ett fel - ingen markering, ingen banderoll.
  const { context, page } = await editorn();
  try {
    const m = await page.evaluate(async () => {
      const w = state.widgets.find(x => x.id === 'd1');
      w.x = 300; w.y = -60;
      render(); if (typeof bind === 'function') bind();
      await new Promise(r => setTimeout(r, 400));
      const el = document.querySelector('.canvas [data-id="d1"]');
      return { markerad: el.dataset.utanforDuken === '1', banderoll: !!document.querySelector('[data-grans-raknare]') };
    });
    assert.equal(m.markerad, false, 'en widget som bara sticker ut delvis blev markerad');
    assert.equal(m.banderoll, false, 'banderollen visades for en widget som syns');
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
// Provet drar en NEDSKALAD widget sa langt at hoger det gar. Sedan 2026-09-26 far den ga
// delvis utanfor, och den synliga delen som blir kvar ska vara MIN_SYNLIG SKARMPIXLAR - inte
// MIN_SYNLIG i widgetens oskalade rum, som vid zoom 0.35 bara hade lamnat 17 px att ta tag i.
test('en nedskalad widget nar forbi hogerkanten och lamnar lika manga synliga pixlar', { skip, timeout: 90000 }, async () => {
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
    const synligVanster = r.sparat.x * skala;
    const synligHoger = synligVanster + r.widget.bredd * skala;

    // 1. Den far ga forbi hogerkanten.
    assert.ok(synligHoger > r.duk.bredd + 10, `widgeten stoppades vid kanten (hogerkant ${Math.round(synligHoger)})`);
    // 2. Men MIN_SYNLIG skarmpixlar ligger kvar, sa den gar att ta tag i.
    assert.ok(Math.abs((r.duk.bredd - synligVanster) - r.minSynlig) <= 2,
      `${Math.round(r.duk.bredd - synligVanster)} px syns, skulle vara ${r.minSynlig}`);
    // 3. Det man SER under draget ar det som sparas — inget hopp nar man slapper.
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

// HELA KATALOGEN RYMS NÄR DEN SKAPAS. Uppmätt 2026-09-26: 39 av 124 katalogkort skapade sin
// widget med en del utanför duken, 17 av dem bredare än hela duken (Glove Snipe 760, Like Fountain
// 620, Gift Campaign 608, Last-X 500 i en 432-ruta). Varje fynd rättades förr ett i taget, i
// widgetens egna standardmått, och nästa widget hade samma fel. Nu gör widget-grans.js samma sak
// som "flytta in"-knappen automatiskt för en widget som just skapats — och provet går igenom
// VARJE kort som användaren gör: klick i katalogen, sedan layouten, sedan bilderna laddade.
test('varje katalogkort skapar en widget som ryms helt på duken', { skip, timeout: 900000 }, async () => {
  const { context, page } = await editorn([]);
  try {
    await page.evaluate(() => { window.toast = () => {} });
    const antal = await page.evaluate(async () => {
      let n = 0;
      for (let t = 0; t < 60 && n < 100; t++) {
        view = 'overlay'; render(); bind();
        n = document.querySelectorAll('[data-catalog-key]').length;
        if (n < 100) await new Promise(r => setTimeout(r, 250));
      }
      return n;
    });
    assert.ok(antal >= 100, `katalogen byggdes inte, bara ${antal} kort`);
    const ute = [], ingen = [];
    for (let i = 0; i < antal; i++) {
      const m = await page.evaluate(async i => {
        state.widgets.length = 0; view = 'overlay'; render(); bind();
        const k = document.querySelectorAll('[data-catalog-key]')[i];
        if (!k) return null;
        const nyckel = k.dataset.catalogKey;
        k.click();
        const w = state.widgets[state.widgets.length - 1];
        if (!w) return { nyckel, ingen: true };
        view = 'editor'; render(); bind();
        const hitta = () => document.querySelector('.editor-shell .canvas .widget[data-id="' + w.id + '"]');
        const el = hitta();
        if (!el) return { nyckel, ingen: true };
        const media = [...el.querySelectorAll('img,video')];
        await Promise.race([
          Promise.all(media.map(x => x.tagName === 'IMG'
            ? (x.complete ? 0 : new Promise(r => { x.addEventListener('load', r); x.addEventListener('error', r) }))
            : (x.readyState >= 1 ? 0 : new Promise(r => { x.addEventListener('loadedmetadata', r); x.addEventListener('error', r) })))),
          new Promise(r => setTimeout(r, 4000))
        ]);
        await new Promise(r => setTimeout(r, 300));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const e2 = hitta() || el, d = window.VyraGrans.dukFor(e2);
        const x = parseInt(e2.style.left, 10), y = parseInt(e2.style.top, 10);
        return { nyckel, ut: window.VyraGrans.stickerUt(x, y, e2.offsetWidth, e2.offsetHeight, d),
          matt: `${x},${y} ${e2.offsetWidth}x${e2.offsetHeight} i ${Math.round(d.bredd)}x${Math.round(d.hojd)}` };
      }, i);
      if (!m) continue;
      if (m.ingen) ingen.push(m.nyckel);
      else if (m.ut) ute.push(`${m.nyckel} (${m.matt})`);
    }
    assert.deepEqual(ute, [], `${ute.length} widgetar skapas utanför duken`);
    assert.deepEqual(ingen, [], 'katalogkort som inte ritar någon widget på duken');
  } finally { await context.close() }
});

// EN SPARAD LAYOUT RÖRS INTE. Passningen gäller bara det som skapas i katalogen — en widget som
// kommer ur en sparad layout, molnet eller en scen skapas aldrig där, och flyttas därför inte.
test('en inläst widget utanför duken flyttas inte av passningen för nya', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn([{ id: 'd1', type: 'templateGiftFireworks', x: 700, y: 120, width: 540, fwTheme: 'royal' }]);
  try {
    const m = await page.evaluate(async () => {
      render(); bind(); await new Promise(r => setTimeout(r, 500));
      const w = state.widgets.find(x => x.id === 'd1');
      return { x: w.x, width: w.width, raknad: window.VyraGrans.rakna().length };
    });
    assert.equal(m.x, 700); assert.equal(m.width, 540);
    assert.equal(m.raknad, 1, 'den ska fortfarande markeras, så att användaren ser den');
  } finally { await context.close() }
});

// ANVANDAREN BESTAMMER OVER EN NY WIDGET. Passningen for nyskapade widgetar (widget-grans.js)
// ger dem ett lage som ryms - men sa fort anvandaren tar i widgeten ska den sluta, annars hade
// den krympt tillbaka en widget som just gjorts storre an duken med flit.
test('en ny widget som anvandaren gjort storre an duken krymps inte tillbaka', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn([]);
  try {
    const m = await page.evaluate(async () => {
      const w = window.VyraWidgets.create('catalog:giftfireworks:royal');
      state.widgets.push(w); selected = w.id; view = 'editor'; render(); bind();
      await new Promise(r => setTimeout(r, 300));
      const el = document.querySelector('.editor-shell .canvas [data-id="' + w.id + '"]');
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
      w.width = 700; w.x = -40; render(); bind();
      await new Promise(r => setTimeout(r, 800));
      render(); bind();
      await new Promise(r => setTimeout(r, 300));
      return { bredd: w.width, x: w.x };
    });
    assert.equal(m.bredd, 700, `bredden krymptes till ${m.bredd}`);
    assert.equal(m.x, -40, `laget flyttades till ${m.x}`);
  } finally { await context.close() }
});
