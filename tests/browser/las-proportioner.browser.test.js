'use strict';
// Las proportioner + H-falt (Etapp 5, tredje punkten i minimum-trion).
//
// Fas A mätte varfor ett GLOBALT las var omojligt: 17 aspect-ratio-regler i studio.css och 53
// ramar via --fa ager redan hojden for vissa widgets. Ett globalt las hade antingen ignorerats
// av CSS eller krävt att de reglerna revs ut. Darav fyra klasser, var och en med eget beteende:
//
//   css     Top Gift + varianter — .vyra-topgift har aspect-ratio. H skrivskyddat.
//   frame   giftFrame/streakFrame/mvpFrame satt — --fa ur ramdata. H skrivskyddat.
//   media   templateCustomImage/-Video — last som DEFAULT.
//   content allt annat — olast som default, H vaxer med innehallet.
//
// Kedjelaset visas bara for de tva sista: dar det ar CSS eller ramdata som ager hojden finns
// ingenting att toggla, och en knapp som inte gor nagot ar precis den sortens UI-logn Etapp 4
// stangde.
//
// aspectRatio fangas NAR laset slas pa, ur elementets faktiska matt. mediaMeta bar bara
// {name,id} — filens naturliga dimensioner finns inte i state (matt 2026-08-09), sa "las mot
// filens ratio" maste lasa den renderade noden.
//
// ROTT NU: inget H-falt, inget kedjelas, ingen aspectLocked.
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

// En widget av vald sort, vald i editorn med panelen byggd. Skrivbar session kravs — utan
// projektion svarar writeActive not-writable och prov 9 hade matt franvaron av en SPARNING
// i stallet for av persistens (tech-debt-principen fran indikator-PR:en).
async function panelenFor(widget) {
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
    await new Promise(r => setTimeout(r, 500));
  }, widget);
  return page;
}

const INNEHALL = { id: 'p1', type: 'templateTopLike', x: 40, y: 40, width: 300, likeCount: 5 };
const MEDIA = { id: 'p2', type: 'templateCustomImage', x: 40, y: 40, width: 300,
  mediaMeta: { id: 'demo', name: 'demo.png' } };
const CSSLAST = { id: 'p3', type: 'templateTopGift', x: 40, y: 40, width: 300 };
const RAMAD = { id: 'p4', type: 'templateBattleMvp', x: 40, y: 40, width: 300, mvpFrame: 'ocean-oracle' };

const FALT = () => ({
  bredd: !!document.querySelector('#propWidth'),
  hojd: !!document.querySelector('#propHeight'),
  hojdSkrivskyddad: document.querySelector('#propHeight')?.disabled ?? null,
  hojdTitle: document.querySelector('#propHeight')?.title || '',
  kedjelas: !!document.querySelector('[data-aspect-lock]'),
  kedjelasSynlig: (() => { const b = document.querySelector('[data-aspect-lock]');
    if (!b) return false; const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 })(),
  kalla: document.querySelector('[data-aspect-source]')?.dataset.aspectSource || null,
  last: state.widgets[0].aspectLocked === true,
});

// ---- Prov 1 · H-faltet finns overallt ---------------------------------------------------------
test('H-faltet renderas i panelen for varje widgetklass', { skip, timeout: 120000 }, async () => {
  const fel = [];
  for (const [namn, w] of [['innehallsstyrd', INNEHALL], ['media', MEDIA], ['css-last', CSSLAST], ['ramad', RAMAD]]) {
    const page = await panelenFor(w);
    try {
      const m = await page.evaluate(FALT);
      if (!m.bredd) fel.push(`${namn}: #propWidth saknas (kontrollmatning)`);
      if (!m.hojd) fel.push(`${namn}: #propHeight saknas i panelen`);
    } finally { await page.close() }
  }
  assert.deepEqual(fel, [], 'H-faltet ska finnas i alla paneler:\n  ' + fel.join('\n  '));
});

// ---- Prov 2 · kedjelaset finns dar det betyder nagot -------------------------------------------
test('kedjelaset visas for lasbara widgets', { skip, timeout: 90000 }, async () => {
  const page = await panelenFor(INNEHALL);
  try {
    const m = await page.evaluate(FALT);
    assert.equal(m.kedjelas, true, 'kedjelas-knappen [data-aspect-lock] saknas mellan W och H');
    assert.equal(m.kedjelasSynlig, true, 'kedjelaset ska synas pa skarmen, inte bara i DOM');
  } finally { await page.close() }
});

// ---- Prov 3 · kedjelaset togglar flaggan ------------------------------------------------------
test('kedjelaset togglar aspectLocked i widgetens state', { skip, timeout: 90000 }, async () => {
  const page = await panelenFor(INNEHALL);
  try {
    const m = await page.evaluate(async () => {
      const fore = state.widgets[0].aspectLocked === true;
      document.querySelector('[data-aspect-lock]').click();
      await new Promise(r => setTimeout(r, 300));
      const efter = state.widgets[0].aspectLocked === true;
      document.querySelector('[data-aspect-lock]').click();
      await new Promise(r => setTimeout(r, 300));
      return { fore, efter, tillbaka: state.widgets[0].aspectLocked === true };
    });
    assert.equal(m.fore, false, 'innehallsstyrd widget ska vara OLAST som default');
    assert.equal(m.efter, true, 'ett klick ska lasa');
    assert.equal(m.tillbaka, false, 'ett till klick ska lasa upp');
  } finally { await page.close() }
});

// ---- Prov 4 · last: W styr H ------------------------------------------------------------------
test('last proportion: W-andring uppdaterar H proportionellt', { skip, timeout: 90000 }, async () => {
  const page = await panelenFor(INNEHALL);
  try {
    const m = await page.evaluate(async () => {
      document.querySelector('[data-aspect-lock]').click();
      await new Promise(r => setTimeout(r, 300));
      const h0 = state.widgets[0].height, w0 = state.widgets[0].width;
      const falt = document.querySelector('#propWidth');
      falt.value = String(w0 * 2);
      falt.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      return { w0, h0, w1: state.widgets[0].width, h1: state.widgets[0].height };
    });
    assert.ok(m.h0 > 0, 'hojden ska ha ett varde nar laset slas pa (fangad ur elementet)');
    assert.equal(m.w1, m.w0 * 2, 'bredden ska ha andrats');
    assert.ok(Math.abs(m.h1 - m.h0 * 2) <= 2,
      `hojden skulle folja proportionellt: ${m.h0} -> forvantat ~${m.h0 * 2}, fick ${m.h1}`);
  } finally { await page.close() }
});

// ---- Prov 5 · last: H styr W ------------------------------------------------------------------
test('last proportion: H-andring uppdaterar W proportionellt', { skip, timeout: 90000 }, async () => {
  const page = await panelenFor(INNEHALL);
  try {
    const m = await page.evaluate(async () => {
      document.querySelector('[data-aspect-lock]').click();
      await new Promise(r => setTimeout(r, 300));
      const h0 = state.widgets[0].height, w0 = state.widgets[0].width;
      const falt = document.querySelector('#propHeight');
      falt.value = String(h0 * 2);
      falt.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      return { w0, h0, w1: state.widgets[0].width, h1: state.widgets[0].height };
    });
    assert.equal(m.h1, m.h0 * 2, 'hojden ska ha andrats');
    assert.ok(Math.abs(m.w1 - m.w0 * 2) <= 2,
      `bredden skulle folja proportionellt: ${m.w0} -> forvantat ~${m.w0 * 2}, fick ${m.w1}`);
  } finally { await page.close() }
});

// ---- Prov 6 · olast: fritt --------------------------------------------------------------------
test('olast: W och H andras oberoende', { skip, timeout: 90000 }, async () => {
  const page = await panelenFor(INNEHALL);
  try {
    const m = await page.evaluate(async () => {
      const hFalt = document.querySelector('#propHeight');
      hFalt.value = '400';
      hFalt.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      const w0 = state.widgets[0].width;
      const wFalt = document.querySelector('#propWidth');
      wFalt.value = '600';
      wFalt.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      return { w0, h: state.widgets[0].height, w: state.widgets[0].width };
    });
    assert.equal(m.h, 400, 'olast H ska ta det satta vardet');
    assert.equal(m.w, 600, 'olast W ska ta det satta vardet');
  } finally { await page.close() }
});

// ---- Prov 7 · aspektstyrda: inget las, skrivskyddat H -----------------------------------------
test('aspektstyrda widgets har skrivskyddat H och inget kedjelas', { skip, timeout: 120000 }, async () => {
  const fel = [];
  for (const [namn, w, kalla] of [['css-last (Top Gift)', CSSLAST, 'css'], ['ramad (Battle MVP)', RAMAD, 'frame']]) {
    const page = await panelenFor(w);
    try {
      const m = await page.evaluate(FALT);
      if (m.hojdSkrivskyddad !== true) fel.push(`${namn}: H-faltet ska vara disabled — ar ${m.hojdSkrivskyddad}`);
      if (!m.hojdTitle) fel.push(`${namn}: H-faltet ska forklara varfor det ar last (title-attribut)`);
      if (m.kedjelasSynlig) fel.push(`${namn}: kedjelaset ska vara DOLT — har finns inget att toggla`);
      if (m.kalla !== kalla) fel.push(`${namn}: data-aspect-source ska vara "${kalla}", ar "${m.kalla}"`);
    } finally { await page.close() }
  }
  assert.deepEqual(fel, [], 'aspektstyrda widgets:\n  ' + fel.join('\n  '));
});

// ---- Prov 8 · defaultlagen -------------------------------------------------------------------
test('media ar last som default, innehallsstyrd ar olast', { skip, timeout: 120000 }, async () => {
  const fel = [];
  for (const [namn, w, vantatLast, kalla] of [
    ['media (bild)', MEDIA, true, 'media'],
    ['innehallsstyrd (Top Likes)', INNEHALL, false, 'content'],
  ]) {
    const page = await panelenFor(w);
    try {
      const m = await page.evaluate(FALT);
      if (m.last !== vantatLast) fel.push(`${namn}: aspectLocked ska vara ${vantatLast}, ar ${m.last}`);
      if (m.kalla !== kalla) fel.push(`${namn}: data-aspect-source ska vara "${kalla}", ar "${m.kalla}"`);
      if (!m.kedjelasSynlig) fel.push(`${namn}: kedjelaset ska synas — bada klasserna ar lasbara`);
    } finally { await page.close() }
  }
  assert.deepEqual(fel, [], 'defaultlagen:\n  ' + fel.join('\n  '));
});

// ---- Prov 9 · persistens genom monopolet ------------------------------------------------------
test('last tillstand persisterar via writeActive', { skip, timeout: 90000 }, async () => {
  const page = await panelenFor(INNEHALL);
  try {
    const m = await page.evaluate(async () => {
      const riktig = window.VyraSessionState.writeActive.bind(window.VyraSessionState);
      const skrivna = [];
      window.VyraSessionState.writeActive = (k, v) => {
        if (k === 'vyra-state') {
          const w = JSON.parse(v).widgets[0];
          skrivna.push({ last: w.aspectLocked === true, h: w.height });
        }
        return riktig(k, v);
      };
      document.querySelector('[data-aspect-lock]').click();
      await new Promise(r => setTimeout(r, 400));
      window.VyraSessionState.writeActive = riktig;
      const lagrat = JSON.parse(localStorage.getItem('vyra-state') || '{}').widgets?.[0];
      return { skrivna, lagratLast: lagrat?.aspectLocked === true };
    });
    assert.ok(m.skrivna.length >= 1,
      'lasningen ska ga genom writeActive — ingen ny skrivvag, monopolvakten star orort');
    assert.equal(m.skrivna[m.skrivna.length - 1].last, true, 'det skrivna tillstandet ska vara last');
    assert.equal(m.lagratLast, true, 'tillstandet ska ligga kvar i lagringen efter sparning');
  } finally { await page.close() }
});
