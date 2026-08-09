'use strict';
// Skalfix infor zoom (Etapp 5, PR fore zoom och snapp).
//
// Fas B matte att editorn i dag ALLTID kor skala 1: enda skrivaren av .canvas-transformen ar
// fitOverlayCanvas() (media.js:707), gated bakom ?overlay. Skaldivisionen i draget (studio.js:163)
// ar alltsa infrastruktur som forbereddes for en zoom som aldrig kom — och den ar ensam om att
// finnas. Innan zoom byggs maste allt annat som laser pekarrorelser gora samma sak, annars
// aktiverar zoomen fyra tysta buggar i stallet for att lagga till en funktion.
//
// UPPMATT I RIKTIG CHROME 2026-08-09, fore fixen:
//
//   getEditorCanvasScale()   scale(0.5) -> 0.5 ratt · matrix(0.5,0,0,0.5,0,0) -> 1 FEL
//   video-handtaget          100px pekarrorelse vid 0.5 gav 100px (skulle ge 200)
//   custom-handtaget         samma, 100px i stallet for 200
//   helskale-handtaget       widgetScale 1.56 vid 0.5 mot 1.45 vid 1 — TVA fel samtidigt:
//                            rorelsen odelad OCH startWidth taget ur en skalad rect
//   agarskapet               .resize-handle bands av TRE hanterare i media.js som skrev over
//                            varandra; manualResize (127) forlorade alltid och var DOD KOD.
//                            Ingen provfil namnde manualResize, wholeScale eller widgetScale —
//                            noll tackning pa den kod som faktiskt korde.
//
// ROTT NU: prov 2-8. Prov 1 ar en vakt — draget rar redan ratt vid inline scale(), och det ska
// det fortsatta gora nar de andra hanterarna byggs om.
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

const GENERISK = { id: 'g1', type: 'templateTopLike', x: 40, y: 40, width: 300 };
const VIDEO = { id: 'v1', type: 'video', x: 40, y: 40, width: 300, height: 450 };
const CUSTOM = { id: 'c1', type: 'templateCustomImage', x: 40, y: 40, width: 300,
  mediaMeta: { id: 'demo', name: 'demo.png' } };
const GIFT = { id: 'f1', type: 'templateTopGift', x: 40, y: 40, width: 300, giftSize: 60 };

// Skrivbar session kravs — utan projektion svarar writeActive not-writable och proven hade matt
// franvaron av en SPARNING i stallet for av ett varde (tech-debt-principen fran indikator-PR:en).
async function editorn(widget) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function', null, { timeout: 20000 });
  await page.evaluate(async w => {
    await window.VyraSessionState.projectLocalSession();
    view = 'editor';
    state.widgets = [w];
    selected = w.id;
    render();
    if (typeof bind === 'function') bind();
    await new Promise(r => setTimeout(r, 700));
  }, widget);
  return page;
}

// En dragning pa ett handtag vid en given kanvasskala. Skalan satts som INLINE transform, den
// enda form getEditorCanvasScale() kan lasa — se prov 2 for varfor det inte ar sjalvklart.
async function dra(page, { valjare, skala, dx, dy, form }) {
  return page.evaluate(async ({ valjare, skala, dx, dy, form }) => {
    const canvas = document.querySelector('.canvas');
    if (skala !== 1) {
      canvas.style.transformOrigin = 'top left';
      canvas.style.transform = form === 'matrix'
        ? `matrix(${skala},0,0,${skala},0,0)`
        : `scale(${skala})`;
    }
    const el = document.querySelector(valjare);
    if (!el) return { fel: `hittade inte ${valjare}` };
    el.setPointerCapture = () => {};
    el.releasePointerCapture = () => {};
    const r = el.getBoundingClientRect();
    const skicka = (typ, x, y) => el.dispatchEvent(
      new PointerEvent(typ, { pointerId: 1, clientX: x, clientY: y, bubbles: true }));
    skicka('pointerdown', r.left, r.top);
    skicka('pointermove', r.left + dx, r.top + dy);
    await new Promise(res => setTimeout(res, 200));
    const w = state.widgets[0];
    return {
      skala: window.getEditorCanvasScale(),
      width: w.width, height: w.height, widgetScale: w.widgetScale,
      giftSize: w.giftSize, x: w.x, y: w.y,
      elLeft: parseInt(document.querySelector(`.canvas [data-id="${w.id}"]`)?.style.left || '0', 10),
      elTop: parseInt(document.querySelector(`.canvas [data-id="${w.id}"]`)?.style.top || '0', 10),
    };
  }, { valjare, skala, dx, dy, form });
}

// ---- Prov 1 · vakt: draget rar redan ratt vid inline-skala ------------------------------------
test('drag vid skala 0.5 flyttar widgeten dit pekaren pekar', { skip, timeout: 90000 }, async () => {
  const page = await editorn(GENERISK);
  try {
    const m = await dra(page, { valjare: '.canvas [data-id="g1"]', skala: 0.5, dx: 100, dy: 60 });
    assert.equal(m.skala, 0.5, 'skalan ska vara avlast som 0.5');
    // 100 skarmpixlar over en halvskalad duk ar 200 dukpixlar.
    assert.ok(Math.abs(m.elLeft - (40 + 200)) <= 2,
      `left skulle bli ~240 (40 + 100/0.5), blev ${m.elLeft}`);
    assert.ok(Math.abs(m.elTop - (40 + 120)) <= 2,
      `top skulle bli ~160 (40 + 60/0.5), blev ${m.elTop}`);
  } finally { await page.close() }
});

// ---- Prov 2 · matrix-fallan --------------------------------------------------------------------
test('getEditorCanvasScale laser skalan aven ur matrix()', { skip, timeout: 90000 }, async () => {
  const page = await editorn(GENERISK);
  try {
    const m = await page.evaluate(() => {
      const c = document.querySelector('.canvas');
      const las = t => { c.style.transform = t; const v = window.getEditorCanvasScale(); return v };
      const ut = {
        inline: las('scale(0.5)'),
        matris: las('matrix(0.5,0,0,0.5,0,0)'),
        matris3d: las('matrix3d(0.25,0,0,0,0,0.25,0,0,0,0,1,0,0,0,0,1)'),
        medFlytt: las('matrix(0.75,0,0,0.75,120,40)'),
        ingen: las(''),
      };
      c.style.transform = '';
      return ut;
    });
    assert.equal(m.inline, 0.5, 'inline scale() ska ge 0.5');
    assert.equal(m.matris, 0.5,
      'matrix(0.5,...) ska ge 0.5 — en zoom satt via CSS-klass computear till matrix och blir ' +
      'annars osynlig for dragmatten');
    assert.equal(m.matris3d, 0.25, 'matrix3d ska ge 0.25');
    assert.equal(m.medFlytt, 0.75, 'matrix med translation ska ge 0.75');
    assert.equal(m.ingen, 1, 'ingen transform ska ge 1');
  } finally { await page.close() }
});

// ---- Prov 3 · drag vid matrix-satt skala -------------------------------------------------------
test('drag vid matrix-satt skala 0.5 landar ocksa ratt', { skip, timeout: 90000 }, async () => {
  const page = await editorn(GENERISK);
  try {
    const m = await dra(page, { valjare: '.canvas [data-id="g1"]', skala: 0.5, dx: 100, dy: 0,
      form: 'matrix' });
    assert.equal(m.skala, 0.5, 'skalan ska lasas ur matrix');
    assert.ok(Math.abs(m.elLeft - 240) <= 2, `left skulle bli ~240, blev ${m.elLeft}`);
  } finally { await page.close() }
});

// ---- Prov 4 · helskale-handtaget (agare for generiska widgets) ---------------------------------
test('helskale-handtaget respekterar skalan', { skip, timeout: 90000 }, async () => {
  const page = await editorn(GENERISK);
  try {
    const ettTill1 = await dra(page, { valjare: '.resize-handle', skala: 1, dx: 100, dy: 0 });
    const page2 = await editorn(GENERISK);
    const vidHalv = await dra(page2, { valjare: '.resize-handle', skala: 0.5, dx: 100, dy: 0 });
    await page2.close();
    // startScale 1 + rorelse/max(180, bredd). Bredden ar 300 i BADA fallen: den far inte tas ur
    // en skalad rect, for da krymper namnaren och samma rorelse ger olika resultat.
    assert.ok(Math.abs(ettTill1.widgetScale - (1 + 100 / 300)) <= 0.02,
      `vid skala 1: forvantat ~1.33, fick ${ettTill1.widgetScale}`);
    assert.ok(Math.abs(vidHalv.widgetScale - (1 + 200 / 300)) <= 0.02,
      `vid skala 0.5 ska 100 skarmpixlar rakna som 200 dukpixlar mot en OSKALAD bredd 300: ` +
      `forvantat ~1.67, fick ${vidHalv.widgetScale}`);
  } finally { await page.close() }
});

// ---- Prov 5 · video-handtaget, bade X och Y ----------------------------------------------------
test('video-handtaget respekterar skalan i bade X och Y', { skip, timeout: 90000 }, async () => {
  const page = await editorn(VIDEO);
  try {
    const m = await dra(page, { valjare: '.resize-handle', skala: 0.5, dx: 100, dy: 100 });
    assert.equal(m.width, 500, `bredd skulle bli 300 + 100/0.5 = 500, blev ${m.width}`);
    assert.equal(m.height, 650, `hojd skulle bli 450 + 100/0.5 = 650, blev ${m.height}`);
  } finally { await page.close() }
});

// ---- Prov 6 · custom-handtaget -----------------------------------------------------------------
test('custom-widgetens handtag respekterar skalan', { skip, timeout: 90000 }, async () => {
  const page = await editorn(CUSTOM);
  try {
    const m = await dra(page, { valjare: '.resize-handle', skala: 0.5, dx: 100, dy: 100 });
    assert.equal(m.width, 500, `bredd skulle bli 300 + 100/0.5 = 500, blev ${m.width}`);
    assert.equal(m.height, 500, `hojd skulle bli 300 + 100/0.5 = 500, blev ${m.height}`);
  } finally { await page.close() }
});

// ---- Prov 7 · gavohandtaget --------------------------------------------------------------------
test('gavohandtaget respekterar skalan', { skip, timeout: 90000 }, async () => {
  const page = await editorn(GIFT);
  try {
    const m = await dra(page, { valjare: '.gift-resize-handle', skala: 0.5, dx: 40, dy: 0 });
    assert.equal(m.giftSize, 140, `giftSize skulle bli 60 + 40/0.5 = 140, blev ${m.giftSize}`);
  } finally { await page.close() }
});

// ---- Prov 8 · agarskapet ar uttalat, inte en fraga om bindningsordning -------------------------
test('varje widgettyp har en utpekad handtagsagare', { skip, timeout: 90000 }, async () => {
  const page = await editorn(GENERISK);
  try {
    const m = await page.evaluate(() => {
      if (!window.VyraResize || typeof window.VyraResize.agare !== 'function') return { saknas: true };
      return {
        generisk: window.VyraResize.agare({ type: 'templateTopLike' }),
        video: window.VyraResize.agare({ type: 'video' }),
        custom: window.VyraResize.agare({ type: 'templateCustomImage' }),
        customText: window.VyraResize.agare({ type: 'templateCustomText' }),
      };
    });
    assert.ok(!m.saknas,
      'window.VyraResize.agare(w) saknas — agarskapet avgors fortfarande av vilken bindare som ' +
      'rakar kora sist, och manualResize forlorar tyst varje gang');
    assert.equal(m.generisk, 'helskala', 'generiska widgets skalas i sin helhet');
    assert.equal(m.video, 'video', 'video andrar bredd och hojd');
    assert.equal(m.custom, 'custom', 'custom-widgets.js ager sina egna typer');
    assert.equal(m.customText, 'custom', 'aven custom text');
  } finally { await page.close() }
});

// ---- Prov 9 · den doda bindaren ar borta -------------------------------------------------------
test('ingen bindare skriver over en annans handtag', { skip, timeout: 90000 }, async () => {
  const page = await editorn(GENERISK);
  try {
    // Bredden ar det manualResize skulle ha andrat. Att den star still bevisar att helskala ager
    // handtaget — och efter fixen ska det vara ett UTTALAT val, inte en bieffekt av ordningen.
    const m = await dra(page, { valjare: '.resize-handle', skala: 1, dx: 100, dy: 0 });
    assert.equal(m.width, 300, 'bredden ska inte andras av helskale-handtaget');
    assert.ok(m.widgetScale > 1, 'helskala ska ha andrats');
    const kalla = await page.evaluate(async () => {
      const svar = await fetch('media.js').then(r => r.text());
      return { manualResize: svar.includes('manualResizeBind') };
    });
    assert.equal(kalla.manualResize, false,
      'manualResizeBind finns kvar i media.js — den binder .resize-handle utan typvakt, forlorar ' +
      'alltid mot helskala och tacks av noll prov');
  } finally { await page.close() }
});
