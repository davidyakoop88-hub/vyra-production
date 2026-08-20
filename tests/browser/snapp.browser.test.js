'use strict';
// Snapp + rutnat i editorn (Etapp 5, sista av tre PR:er mot zoom och snapp).
//
// SNAPP FAR BARA LIGGA I DRAGMATTEN. Ligger den i render() eller save() snappas ocksa
// PROGRAMMATISKA positioner — och angra-provet (angra-gor-om.browser.test.js:87) satter x/y direkt
// och havdar exakta varden. Enda vagen ut ur den kollisionen hade varit att bryta undo/redo.
// Fas B skrev upp risken; de har proven vaktar den.
//
// TOLERANSEN MATS I PEKARPIXLAR, INTE DUKPIXLAR. 8 px vid 100 % blir 16 dukpixlar vid 50 % zoom:
// nar man ser mer ska snappen vara mer overseende. Det ar samma invariant som PR #161 — allt som
// oversatter en pekarrorelse delar med getEditorCanvasScale().
//
// PRIORITETEN: en annan widgets kant slar rutnatet. Rutnatet ar en hjalplinje, en annan widget ar
// riktigt innehall, och det ar mot innehallet man vill rikta in sig.
//
// ROTT NU: ingen snappmodul, inget rutnat, ingen vaxel.
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

// Tva widgets: en som dras (d1) och en som star still och erbjuder snappmal (m1).
// Malets lage ar med FLIT inte delbart med 8 — annars gick det inte att skilja en traff pa
// widgeten fran en traff pa rutnatet, och provet hade varit gront av fel skal.
const DRAGEN = { id: 'd1', type: 'templateTopLike', x: 40, y: 40, width: 300 };
const MALET = { id: 'm1', type: 'templateTopLike', x: 203, y: 147, width: 300 };

async function editorn(vy = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport: vy });
  const page = await context.newPage();
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function', null, { timeout: 20000 });
  await page.evaluate(async widgets => {
    await window.VyraSessionState.projectLocalSession();
    view = 'editor'; state.widgets = widgets; selected = 'd1';
    render(); if (typeof bind === 'function') bind();
    await new Promise(r => setTimeout(r, 700));
  }, [DRAGEN, MALET]);
  return { context, page };
}

// Drar d1 sa att dess RAA (osnappade) lage hamnar pa exakt malLeft/malTop i dukpixlar.
// Returnerar det lage som faktiskt hamnade pa duken.
async function dra(page, { malLeft, malTop, shift = false, zoomSteg = 0 }) {
  return page.evaluate(async ({ malLeft, malTop, shift, zoomSteg }) => {
    for (let i = 0; i < zoomSteg; i++) {
      document.querySelector('[data-zoom="ut"]').click();
      await new Promise(r => setTimeout(r, 150));
    }
    const skala = window.getEditorCanvasScale();
    const el = document.querySelector('.canvas [data-id="d1"]');
    el.setPointerCapture = () => {}; el.releasePointerCapture = () => {};
    const startLeft = parseInt(el.style.left, 10), startTop = parseInt(el.style.top, 10);
    const r = el.getBoundingClientRect();
    const x0 = r.left + 5, y0 = r.top + 5;
    // Skarmpixlar = dukpixlar * skala. Draget delar tillbaka med samma skala.
    const dx = (malLeft - startLeft) * skala, dy = (malTop - startTop) * skala;
    const skicka = (typ, x, y, extra) => el.dispatchEvent(new PointerEvent(typ,
      Object.assign({ pointerId: 1, clientX: x, clientY: y, bubbles: true }, extra || {})));
    skicka('pointerdown', x0, y0);
    skicka('pointermove', x0 + dx, y0 + dy, { shiftKey: shift });
    await new Promise(res => setTimeout(res, 200));
    const under = {
      left: parseInt(el.style.left, 10), top: parseInt(el.style.top, 10),
      rutnat: (() => { const g = document.querySelector('[data-snapp-rutnat]');
        return g ? { finns: true, opacitet: parseFloat(getComputedStyle(g).opacity),
          overgang: getComputedStyle(g).transitionDuration } : { finns: false } })(),
    };
    skicka('pointerup', x0 + dx, y0 + dy);
    await new Promise(res => setTimeout(res, 300));
    return {
      skala, startLeft, startTop, under,
      left: state.widgets.find(w => w.id === 'd1').x,
      top: state.widgets.find(w => w.id === 'd1').y,
      rutnatEfter: (() => { const g = document.querySelector('[data-snapp-rutnat]');
        return g ? parseFloat(getComputedStyle(g).opacity) : null })(),
    };
  }, { malLeft, malTop, shift, zoomSteg });
}

// ---- Prov 1 · rutnatet ------------------------------------------------------------------------
test('draget snappar till rutnatet', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    // 53 och 61 ligger bada 3px fran narmaste attapixelslinje, och langt fran malwidgeten.
    const m = await dra(page, { malLeft: 53, malTop: 61 });
    assert.equal(m.left % 8, 0, `x ${m.left} ar inte delbart med 8`);
    assert.equal(m.top % 8, 0, `y ${m.top} ar inte delbart med 8`);
    assert.equal(m.left, 56, 'narmaste linje under 53 ar 56');
    assert.equal(m.top, 64, 'narmaste linje under 61 ar 64');
  } finally { await context.close() }
});

// ---- Prov 2 · annan widgets X ------------------------------------------------------------------
test('draget snappar till en annan widgets vansterkant i X', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    // Rat lage 200 ligger 0px fran rutnatslinjen 200 och 3px fran malwidgetens 203.
    // Vinner 203 sa slar widgetmalet rutnatet — det ar prioriteringen provet mater.
    const m = await dra(page, { malLeft: 200, malTop: 400 });
    assert.equal(m.left, 203,
      `x blev ${m.left}. Widgetmalet 203 ska sla rutnatslinjen 200 aven nar rutnatet ligger narmare`);
  } finally { await context.close() }
});

// ---- Prov 3 · annan widgets Y ------------------------------------------------------------------
test('draget snappar till en annan widgets overkant i Y', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await dra(page, { malLeft: 600, malTop: 144 });
    assert.equal(m.top, 147, `y blev ${m.top}, forvantat 147 (malwidgetens overkant)`);
  } finally { await context.close() }
});

// ---- Prov 4 · kant mot kant --------------------------------------------------------------------
test('draget snappar mot en annan widgets hoger- och nederkant', { skip, timeout: 120000 }, async () => {
  const { context, page } = await editorn();
  try {
    const matt = await page.evaluate(() => {
      const m = document.querySelector('.canvas [data-id="m1"]');
      return { bredd: m.offsetWidth, hojd: m.offsetHeight };
    });
    // Malets hogerkant, och dess nederkant. Sikta 3px fran bada.
    const x = 203 + matt.bredd, y = 147 + matt.hojd;
    const m = await dra(page, { malLeft: x - 3, malTop: y - 3 });
    assert.equal(m.left, x, `x blev ${m.left}, forvantat ${x} (malets hogerkant)`);
    assert.equal(m.top, y, `y blev ${m.top}, forvantat ${y} (malets nederkant)`);
  } finally { await context.close() }
});

// ---- Prov 5 · toleransen mats i pekarpixlar ----------------------------------------------------
test('toleransen ar 8 pekarpixlar och blir 16 dukpixlar vid halv zoom', { skip, timeout: 120000 }, async () => {
  const vid100 = await editorn();
  const vid50 = await editorn();
  try {
    // 12 dukpixlar fran malet: utanfor tolerans vid 100 % (8), innanfor vid 50 % (16).
    const a = await dra(vid100.page, { malLeft: 203 - 12, malTop: 400 });
    const b = await dra(vid50.page, { malLeft: 203 - 12, malTop: 400, zoomSteg: 2 });
    assert.equal(a.skala, 1, 'kontrollmatning: forsta fallet ska sta pa 100 %');
    assert.equal(b.skala, 0.5, 'kontrollmatning: andra fallet ska sta pa 50 %');
    assert.notEqual(a.left, 203,
      `vid 100 % ligger 12 dukpixlar UTANFOR toleransen — x skulle falla pa rutnatet, blev ${a.left}`);
    assert.equal(a.left % 8, 0, 'vid 100 % ska rutnatet ta over');
    assert.equal(b.left, 203,
      `vid 50 % ar toleransen 16 dukpixlar och widgetmalet ska vinna — blev ${b.left}`);
  } finally { await vid100.context.close(); await vid50.context.close() }
});

// ---- Prov 6 · rutnatet visas under drag ---------------------------------------------------------
test('rutnatet tonas in under dragningen', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await dra(page, { malLeft: 300, malTop: 300 });
    assert.equal(m.under.rutnat.finns, true, 'lagret [data-snapp-rutnat] saknas');
    assert.ok(m.under.rutnat.opacitet > 0,
      `rutnatet ska synas under dragningen — opacitet ${m.under.rutnat.opacitet}`);
    assert.ok(/^0?\.15s|150ms/.test(m.under.rutnat.overgang),
      `overgangen ska vara ~150 ms, ar "${m.under.rutnat.overgang}" — utan toning kanns det hackigt`);
  } finally { await context.close() }
});

// ---- Prov 7 · rutnatet forsvinner efterat -------------------------------------------------------
test('rutnatet tonas ut nar dragningen slapps', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await dra(page, { malLeft: 300, malTop: 300 });
    assert.equal(m.rutnatEfter, 0,
      `rutnatet ska vara slackt efter dragningen — opacitet ${m.rutnatEfter}. Ett standigt synligt ` +
      'rutnat bryter mot det ramlosa formspraket.');
  } finally { await context.close() }
});

// ---- Prov 8 · Shift stanger av snappen tillfalligt ----------------------------------------------
test('Shift under drag stanger av snappen', { skip, timeout: 120000 }, async () => {
  const utan = await editorn();
  const med = await editorn();
  try {
    // Kontrollmatning forst. Utan den passerar provet nar snapp inte finns alls — ett orort lage
    // ser likadant ut oavsett om Shift stangde av nagot eller om det aldrig fanns nagot att stanga.
    const a = await dra(utan.page, { malLeft: 205, malTop: 61 });
    assert.notEqual(a.left, 205, `kontrollmatning: utan Shift SKA laget snappa — blev ${a.left}`);
    const b = await dra(med.page, { malLeft: 205, malTop: 61, shift: true });
    assert.equal(b.left, 205, `med Shift ska laget vara orort — blev ${b.left}`);
    assert.equal(b.top, 61, `med Shift ska laget vara orort — blev ${b.top}`);
  } finally { await utan.context.close(); await med.context.close() }
});

// ---- Prov 9 · vaxeln syns och stanger av varaktigt ----------------------------------------------
test('snappvaxeln syns och stanger av snappen', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const synlig = await page.evaluate(() => {
      const v = document.querySelector('[data-snapp-vaxel]');
      if (!v) return { saknas: true };
      const r = v.getBoundingClientRect();
      return { bredd: r.width, hojd: r.height, tryckt: v.getAttribute('aria-pressed'),
        iKontrollen: !!v.closest('[data-vy-kontroll]') };
    });
    assert.ok(!synlig.saknas, 'vaxeln [data-snapp-vaxel] saknas');
    assert.ok(synlig.bredd > 0 && synlig.hojd > 0,
      'vaxeln ska ha en yta pa skarmen, inte bara finnas i DOM');
    assert.ok(synlig.iKontrollen, 'vaxeln ska sitta i vykontrollen, pa platsen #162 reserverade');
    assert.equal(synlig.tryckt, 'true', 'snapp ar pa som default');
    // aria-pressed racker inte: forsta versionen skilde lagen med #2a1140 mot #160c1f, och den
    // skillnaden gick inte att se pa skarm vid 26px hojd. Vaxeln maste SYNAS vara av.
    const utseende = await page.evaluate(async () => {
      const v = document.querySelector('[data-snapp-vaxel]');
      const las = () => { const cs = getComputedStyle(v);
        return cs.backgroundImage + '|' + cs.backgroundColor + '|' + cs.borderTopColor };
      const pa = las();
      v.click();
      await new Promise(r => setTimeout(r, 250));
      return { pa, av: las() };
    });
    assert.notEqual(utseende.pa, utseende.av,
      `pa- och av-laget ser likadana ut (${utseende.pa}) — en vaxel man inte ser laget pa ar ` +
      'lika oanvandbar som en knapp utan verkan');
    const m = await dra(page, { malLeft: 205, malTop: 61 });
    assert.equal(m.left, 205, `med snappen avstangd ska laget vara orort — blev ${m.left}`);
  } finally { await context.close() }
});

// ---- Prov 10 · vaxeln persisterar i localStorage ------------------------------------------------
test('snappvaxeln kommer ihag sig i localStorage', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    await page.evaluate(async () => {
      document.querySelector('[data-snapp-vaxel]').click();
      await new Promise(r => setTimeout(r, 200));
    });
    const lagrat = await page.evaluate(() => ({
      lokal: localStorage.getItem('vyra-editor-snap-enabled'),
      session: sessionStorage.getItem('vyra-editor-snap-enabled'),
    }));
    assert.equal(lagrat.lokal, 'false', 'valet ska ligga i localStorage');
    assert.equal(lagrat.session, null,
      'snapp ar en anvandarpreferens, inte en sessionsinstallning — till skillnad fran zoom');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.render === 'function', null, { timeout: 20000 });
    const efter = await page.evaluate(async () => {
      view = 'editor'; render(); if (typeof bind === 'function') bind();
      await new Promise(r => setTimeout(r, 700));
      return document.querySelector('[data-snapp-vaxel]')?.getAttribute('aria-pressed');
    });
    assert.equal(efter, 'false', 'valet ska overleva en omladdning');
  } finally { await context.close() }
});

// ---- Prov 11 · snappen ar en dragberakning, inte en statandring ---------------------------------
test('snappen skriver inte till sessionen under dragningen', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await page.evaluate(async () => {
      let underDrag = 0, totalt = 0, slappt = false;
      const inre = window.VyraSessionState.writeActive;
      window.VyraSessionState.writeActive = function () {
        totalt++; if (!slappt) underDrag++;
        return inre.apply(this, arguments);
      };
      const el = document.querySelector('.canvas [data-id="d1"]');
      el.setPointerCapture = () => {}; el.releasePointerCapture = () => {};
      const r = el.getBoundingClientRect();
      const skicka = (t, x, y) => el.dispatchEvent(
        new PointerEvent(t, { pointerId: 1, clientX: x, clientY: y, bubbles: true }));
      skicka('pointerdown', r.left + 5, r.top + 5);
      // 21 och 9 med flit: slutlagen 40+126=166 och 40+54=94 ar INTE delbara med 8, sa
      // avslutningsprovet "x ska ligga pa rutnatet" kan inte passera utan att snappen kort.
      for (let i = 1; i <= 6; i++) skicka('pointermove', r.left + 5 + i * 21, r.top + 5 + i * 9);
      await new Promise(res => setTimeout(res, 200));
      slappt = true;
      skicka('pointerup', r.left + 5 + 126, r.top + 5 + 54);
      await new Promise(res => setTimeout(res, 400));
      window.VyraSessionState.writeActive = inre;
      const w = state.widgets.find(x => x.id === 'd1');
      return { underDrag, totalt, x: w.x, y: w.y,
        domX: parseInt(el.style.left, 10), domY: parseInt(el.style.top, 10) };
    });
    assert.equal(m.underDrag, 0,
      `snappen anropade writeActive ${m.underDrag} ganger under dragningen — den ar en berakning, ` +
      'inte en statandring, och skrivningen sker forst nar pekaren slapps');
    assert.ok(m.totalt > 0, 'kontrollmatning: laget ska ha sparats nar pekaren slapptes');
    assert.equal(m.x, m.domX, 'det sparade x ska vara det snappade vardet, inte det raa');
    assert.equal(m.y, m.domY, 'det sparade y ska vara det snappade vardet, inte det raa');
    assert.equal(m.x % 8, 0, 'och det ska ligga pa rutnatet');
  } finally { await context.close() }
});

// ---- Prov 12 · toleransen delas med skalan ------------------------------------------------------
test('toleransen delas med kanvasskalan', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await page.evaluate(() => {
      if (!window.VyraSnapp || typeof window.VyraSnapp.tolerans !== 'function') return { saknas: true };
      return { vid1: window.VyraSnapp.tolerans(1), vid05: window.VyraSnapp.tolerans(0.5),
        vid15: window.VyraSnapp.tolerans(1.5) };
    });
    assert.ok(!m.saknas, 'window.VyraSnapp.tolerans(skala) saknas');
    assert.equal(m.vid1, 8, 'vid 100 % ar toleransen 8 dukpixlar');
    assert.equal(m.vid05, 16, 'vid 50 % ar samma 8 pekarpixlar 16 dukpixlar');
    assert.ok(Math.abs(m.vid15 - 8 / 1.5) < 0.001, 'vid 150 % krymper den till 8/1.5');
  } finally { await context.close() }
});
