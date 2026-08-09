'use strict';
// Zoom i editorn (Etapp 5, andra av tre PR:er mot zoom och snapp).
//
// Fas B matte att kanvasen KLIPPS redan i dag: .workarea ar 752px hog vid 1440x900 och 572px vid
// 1280x720, mot en kanvas pa 768px. Vid 1280x720 ligger alltsa en fjardedel utanfor bild. Anpassa
// ar darfor inte en bekvamlighet — den lagar ett fel som finns nu.
//
// PR #161 la grunden: alla fem stallen som raknar om en pekarrorelse till dukpixlar delar med
// getEditorCanvasScale(), och den laser bade scale() och matrix(). Zoom kan darfor byggas ovanpa
// en stabil grund i stallet for ovanpa fyra tysta buggar.
//
// ROTT NU: ingen zoom-modul, ingen kontroll, ingen persistens.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const { hittaBrott } = require('../fixtures/inline-transform-vakt.js');

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

const WIDGET = { id: 'z1', type: 'templateTopLike', x: 40, y: 40, width: 300 };

// Ett kontext, inte en sida: sessionStorage overlever en omladdning inom samma kontext, vilket
// prov 5 och 6 bygger pa.
async function editorn(vy = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport: vy });
  const page = await context.newPage();
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function', null, { timeout: 20000 });
  await page.evaluate(async w => {
    await window.VyraSessionState.projectLocalSession();
    view = 'editor'; state.widgets = [w]; selected = w.id;
    render(); if (typeof bind === 'function') bind();
    await new Promise(r => setTimeout(r, 700));
  }, WIDGET);
  return { context, page };
}

const MATT = () => {
  const c = document.querySelector('.canvas');
  const wa = document.querySelector('.workarea');
  const cs = getComputedStyle(c);
  return {
    skala: window.getEditorCanvasScale(),
    inline: c.style.transform || '',
    origin: cs.transformOrigin,
    kanvasBredd: c.offsetWidth, kanvasHojd: c.offsetHeight,
    ytaBredd: wa ? wa.clientWidth : 0, ytaHojd: wa ? wa.clientHeight : 0,
    niva: window.VyraZoom ? window.VyraZoom.niva() : null,
  };
};

// ---- Prov 1 · vakt: skalan lases sant pa alla nivaer -------------------------------------------
test('getEditorCanvasScale ger sann skala pa varje zoomniva', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await page.evaluate(() => {
      const c = document.querySelector('.canvas');
      const las = n => { c.style.transform = `scale(${n})`; return window.getEditorCanvasScale() };
      const ut = { p75: las(0.75), p100: las(1), p150: las(1.5) };
      c.style.transform = '';
      return ut;
    });
    assert.equal(m.p75, 0.75);
    assert.equal(m.p100, 1);
    assert.equal(m.p150, 1.5);
  } finally { await context.close() }
});

// ---- Prov 2 · Anpassa far in hela duken vid bada fonsterstorlekarna ----------------------------
test('Anpassa gor hela kanvasen synlig i arbetsytan', { skip, timeout: 120000 }, async () => {
  const fel = [];
  for (const vy of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    const { context, page } = await editorn(vy);
    try {
      const fore = await page.evaluate(MATT);
      // Kontrollmatning: utan zoom KLIPPS duken — det ar felet Anpassa lagar.
      if (fore.kanvasHojd <= fore.ytaHojd) {
        fel.push(`${vy.width}x${vy.height}: kontrollmatningen visar ingen klippning ` +
          `(kanvas ${fore.kanvasHojd} <= yta ${fore.ytaHojd}) — provet mater fel sak`);
      }
      const m = await page.evaluate(async () => {
        const knapp = document.querySelector('[data-zoom="anpassa"]');
        if (!knapp) return { saknas: true };
        knapp.click();
        await new Promise(r => setTimeout(r, 300));
        const c = document.querySelector('.canvas'), wa = document.querySelector('.workarea');
        const s = window.getEditorCanvasScale();
        return { skala: s, synligBredd: c.offsetWidth * s, synligHojd: c.offsetHeight * s,
          ytaBredd: wa.clientWidth, ytaHojd: wa.clientHeight };
      });
      if (m.saknas) { fel.push(`${vy.width}x${vy.height}: knappen [data-zoom="anpassa"] saknas`); continue }
      if (m.synligHojd > m.ytaHojd + 1) {
        fel.push(`${vy.width}x${vy.height}: hojden ${Math.round(m.synligHojd)} > ytan ${m.ytaHojd}`);
      }
      if (m.synligBredd > m.ytaBredd + 1) {
        fel.push(`${vy.width}x${vy.height}: bredden ${Math.round(m.synligBredd)} > ytan ${m.ytaBredd}`);
      }
      // Passform, inte krympning: minst 90 % av den tillgangliga hojden ska anvandas.
      if (m.synligHojd < m.ytaHojd * 0.9) {
        fel.push(`${vy.width}x${vy.height}: kryper ihop i onodan — ${Math.round(m.synligHojd)} ` +
          `av ${m.ytaHojd} tillgangliga`);
      }
    } finally { await context.close() }
  }
  assert.deepEqual(fel, [], 'Anpassa ska rymma hela duken:\n  ' + fel.join('\n  '));
});

// ---- Prov 3 · stegen -------------------------------------------------------------------------
test('minus och plus vandrar mellan 50, 75, 100 och 150 procent', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await page.evaluate(async () => {
      const ut = document.querySelector('[data-zoom="ut"]'), in_ = document.querySelector('[data-zoom="in"]');
      if (!ut || !in_) return { saknas: true };
      const klick = async el => { el.click(); await new Promise(r => setTimeout(r, 150));
        return window.getEditorCanvasScale() };
      const ner = [];
      for (let i = 0; i < 4; i++) ner.push(await klick(ut));
      const upp = [];
      for (let i = 0; i < 4; i++) upp.push(await klick(in_));
      return { ner, upp, etikett: document.querySelector('[data-zoom-niva]')?.textContent.trim() };
    });
    assert.ok(!m.saknas, 'knapparna [data-zoom="ut"] och [data-zoom="in"] saknas');
    assert.deepEqual(m.ner, [0.75, 0.5, 0.5, 0.5], 'ut fran 100: 75, 50, sedan stopp vid 50');
    assert.deepEqual(m.upp, [0.75, 1, 1.5, 1.5], 'in fran 50: 75, 100, 150, sedan stopp vid 150');
    assert.equal(m.etikett, '150%', 'etiketten ska visa aktuell niva');
  } finally { await context.close() }
});

// ---- Prov 4 · sessionStorage ------------------------------------------------------------------
test('zoomnivan overlever en omladdning via sessionStorage', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    await page.evaluate(async () => {
      document.querySelector('[data-zoom="ut"]').click();
      await new Promise(r => setTimeout(r, 200));
    });
    const nyckel = await page.evaluate(() => sessionStorage.getItem('vyra-editor-zoom'));
    assert.equal(nyckel, '0.75', 'sessionStorage["vyra-editor-zoom"] ska bara 0.75');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.render === 'function', null, { timeout: 20000 });
    const efter = await page.evaluate(async () => {
      view = 'editor'; render(); if (typeof bind === 'function') bind();
      await new Promise(r => setTimeout(r, 700));
      return window.getEditorCanvasScale();
    });
    assert.equal(efter, 0.75, 'zoomen ska vara kvar efter omladdning');
  } finally { await context.close() }
});

// ---- Prov 5 · INTE localStorage ---------------------------------------------------------------
test('zoomnivan lamnar inga spar i localStorage', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await page.evaluate(async () => {
      document.querySelector('[data-zoom="ut"]').click();
      await new Promise(r => setTimeout(r, 200));
      return Object.keys(localStorage).filter(k => /zoom/i.test(k));
    });
    assert.deepEqual(m, [],
      'zoom ar en sessionsinstallning: nasta gang editorn oppnas ska den bara 100 % (eller ' +
      `Anpassa), annars tror anvandaren att appen ar trasig. Hittade: ${m.join(', ')}`);
  } finally { await context.close() }
});

// ---- Prov 6 · zoom gar inte genom save() ------------------------------------------------------
test('zoom skriver inte till sessionen och fyller inte angra-stacken', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await page.evaluate(async () => {
      const foreHist = window.VyraHistorik ? window.VyraHistorik.length() : null;
      let skrivningar = 0;
      const inre = window.VyraSessionState.writeActive;
      window.VyraSessionState.writeActive = function () { skrivningar++; return inre.apply(this, arguments) };
      const klickade = [];
      for (const val of ['ut', 'in', 'anpassa']) {
        const knapp = document.querySelector(`[data-zoom="${val}"]`);
        if (!knapp) continue;
        klickade.push(val);
        knapp.click();
        await new Promise(r => setTimeout(r, 200));
      }
      window.VyraSessionState.writeActive = inre;
      return { skrivningar, foreHist, klickade,
        skalaEfter: window.getEditorCanvasScale(),
        efterHist: window.VyraHistorik ? window.VyraHistorik.length() : null };
    });
    // Utan den har raden passerar provet nar knapparna saknas — noll klick skriver forstas noll
    // ganger. Ett prov som mater franvaron av en effekt maste forst bevisa att handlingen skedde.
    assert.deepEqual(m.klickade, ['ut', 'in', 'anpassa'],
      'kontrollmatning: alla tre knapparna ska finnas och ha klickats');
    assert.equal(m.skrivningar, 0,
      `zoom anropade writeActive ${m.skrivningar} ganger — skrivmonopolet ska inte roras av en vyinstallning`);
    assert.equal(m.efterHist, m.foreHist,
      `angra-stacken vaxte fran ${m.foreHist} till ${m.efterHist} — zoom ar ingen anvandarhandling ` +
      'pa layouten och far inte bli ett angra-steg');
  } finally { await context.close() }
});

// ---- Prov 7 · transform-origin ----------------------------------------------------------------
test('kanvasen zoomar fran ovre vanstra hornet', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await page.evaluate(async () => {
      document.querySelector('[data-zoom="ut"]').click();
      await new Promise(r => setTimeout(r, 200));
      const c = document.querySelector('.canvas');
      return { origin: getComputedStyle(c).transformOrigin, inline: c.style.transformOrigin };
    });
    assert.equal(m.origin, '0px 0px',
      `origin ar ${m.origin} — med centrum som origin vandrar innehallet under zoomningen och ` +
      'dragmatten maste kompensera for en forskjutning som inte syns i skalan');
    // Webblasaren normaliserar sokordsformen: 'top left' lases tillbaka som 'left top'. Provet
    // godtar bada serialiseringarna i stallet for att lasa in en av dem.
    assert.ok(/^(0px 0px|left top|top left)$/.test(m.inline),
      `origin ska sattas inline, inte via stilark — inline-vardet ar "${m.inline}"`);
  } finally { await context.close() }
});

// ---- Prov 8 · vakten: transform pa .canvas maste vara inline ----------------------------------
test('ingen CSS-regel satter transform pa .canvas', { skip: false }, () => {
  const filer = fs.readdirSync(ROOT).filter(f => f.endsWith('.css'));
  const brott = hittaBrott(ROOT, filer);
  assert.deepEqual(brott.map(b => `${b.fil}: ${b.selektor} { ${b.kropp} }`), [],
    'en transform satt i ett stilark kan inte andras per anvandare och kan overskuggas av ' +
    '!important-regler som JavaScript inte ser. Zoom maste sattas inline.');
});

// ---- Prov 9 · draget respekterar zoom ---------------------------------------------------------
test('samma pekarrorelse ger samma dukrorelse oavsett zoom', { skip, timeout: 90000 }, async () => {
  const lage = async (steg, dx) => {
    const { context, page } = await editorn();
    try {
      return await page.evaluate(async ({ steg, dx }) => {
        for (let i = 0; i < steg; i++) {
          document.querySelector('[data-zoom="ut"]').click();
          await new Promise(r => setTimeout(r, 150));
        }
        const el = document.querySelector('.canvas [data-id="z1"]');
        el.setPointerCapture = () => {}; el.releasePointerCapture = () => {};
        const r = el.getBoundingClientRect();
        const skicka = (t, x) => el.dispatchEvent(
          new PointerEvent(t, { pointerId: 1, clientX: x, clientY: r.top + 5, bubbles: true }));
        skicka('pointerdown', r.left + 5);
        skicka('pointermove', r.left + 5 + dx);
        await new Promise(res => setTimeout(res, 200));
        return { skala: window.getEditorCanvasScale(), left: parseInt(el.style.left, 10) };
      }, { steg, dx });
    } finally { await context.close() }
  };
  // 200 dukpixlar bada gangerna: 200 skarmpixlar vid 100 %, 100 vid 50 %.
  const vid100 = await lage(0, 200);
  const vid50 = await lage(2, 100);
  assert.equal(vid100.skala, 1, 'kontrollmatning: forsta fallet ska sta pa 100 %');
  assert.equal(vid50.skala, 0.5, 'kontrollmatning: andra fallet ska sta pa 50 %');
  assert.ok(Math.abs(vid100.left - vid50.left) <= 2,
    `samma dukrorelse ska ge samma lage: ${vid100.left} vid 100 % mot ${vid50.left} vid 50 %`);
});

// ---- Prov 10 · kontrollens plats --------------------------------------------------------------
test('zoomkontrollen sitter nere till hoger i arbetsytan och syns', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await page.evaluate(() => {
      const box = document.querySelector('[data-vy-kontroll]');
      if (!box) return { saknas: true };
      const wa = document.querySelector('.workarea');
      const b = box.getBoundingClientRect(), w = wa.getBoundingClientRect();
      return {
        bredd: b.width, hojd: b.height,
        franHoger: Math.round(w.right - b.right), franBotten: Math.round(w.bottom - b.bottom),
        iYtan: b.right <= w.right + 1 && b.bottom <= w.bottom + 1,
        knappar: [...box.querySelectorAll('[data-zoom]')].map(k => k.dataset.zoom),
        snappPlats: !!box.querySelector('[data-snapp-plats]'),
      };
    });
    assert.ok(!m.saknas, 'behallaren [data-vy-kontroll] saknas');
    assert.ok(m.bredd > 0 && m.hojd > 0, 'kontrollen ska ha en yta pa skarmen, inte bara finnas i DOM');
    assert.ok(m.iYtan, 'kontrollen ska ligga innanfor arbetsytan');
    assert.ok(m.franHoger >= 0 && m.franHoger <= 32, `avstand fran hoger kant: ${m.franHoger}px`);
    assert.ok(m.franBotten >= 0 && m.franBotten <= 32, `avstand fran nedre kant: ${m.franBotten}px`);
    assert.deepEqual(m.knappar, ['ut', 'in', 'anpassa'], 'tre knappar: minus, plus, Anpassa');
    assert.ok(m.snappPlats, 'platsen for snappvaxeln (#163) ska vara reserverad i samma behallare');
  } finally { await context.close() }
});
