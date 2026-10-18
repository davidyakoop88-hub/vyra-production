'use strict';
// Las proportioner + H-falt (Etapp 5, tredje punkten i minimum-trion).
//
// TRE KLASSER sedan 2026-10-18 — samma som handtagen (VyraTransform.klass):
//
//   media   templateCustomImage/-Video — last som DEFAULT, kvoten ur ladan.
//   content egen text — olast som default, H och W fria, laset valbart.
//   fast    allt annat (Top Like, Top Gift, Battle MVP med ram, Guardian ...). Bredd och Hojd visar
//           den RITADE ladan och en andring blir en likformig skala; laset visas alltid last och
//           gar inte att toggla, eftersom handtagen, Bredd, Hojd och Storlek alla haller formen.
//
// Fore 2026-10-18 hade panelen fyra klasser (css/frame skrivskyddade, content lasbar) och skrev
// w.width/w.height pa fasta kompositioner. Verifieringen i riktig Chrome matte att laset tog kvoten
// ur profilbilden (1:1) och att Bredd saknade verkan i 40 av 173 katalogmodeller — se
// vyra-proportioner.js. Proven nedan galler det nya kontraktet.
//
// aspectRatio fangas NAR laset slas pa, ur ladans matt. mediaMeta bar bara {name,id} — filens
// naturliga dimensioner finns inte i state (matt 2026-08-09).
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

// width 150, inte 300: sedan 2026-09-20 klamper widget-grans.js panelens Bredd-falt sa att hela
// widgeten ryms pa duken (432 - x). Proven nedan dubblar bredden, och 2 x 300 = 600 pa x=40 hade
// klamts till 392 - da hade de matt gransen i stallet for proportionslaset. 2 x 150 = 300 ryms.
const INNEHALL = { id: 'p1', type: 'templateCustomText', x: 40, y: 40, width: 150, height: 60, customText: 'Hej' };
const FAST = { id: 'p5', type: 'templateTopLike', x: 40, y: 40, width: 150, likeCount: 5 };
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
      wFalt.value = '380';   // ryms: 40 + 380 <= 432
      wFalt.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      return { w0, h: state.widgets[0].height, w: state.widgets[0].width };
    });
    assert.equal(m.h, 400, 'olast H ska ta det satta vardet');
    assert.equal(m.w, 380, 'olast W ska ta det satta vardet');
  } finally { await page.close() }
});

// ---- Prov 7 · fasta kompositioner: alltid last, Bredd/Hojd visar det ritade --------------------
test('fasta kompositioner: laset ar alltid pa, Bredd/Hojd visar ritad storlek och Storlek skalar likformigt', { skip, timeout: 160000 }, async () => {
  const fel = [];
  for (const [namn, w] of [['Top Like', FAST], ['css-last (Top Gift)', CSSLAST], ['ramad (Battle MVP)', RAMAD]]) {
    const page = await panelenFor(w);
    try {
      const m = await page.evaluate(async id => {
        const el = () => document.querySelector(`.editor-shell .canvas [data-id="${id}"]`) || document.querySelector(`.canvas [data-id="${id}"]`);
        const vis = () => { const z = parseFloat(getComputedStyle(el()).zoom) || 1; return { b: el().offsetWidth * z, h: el().offsetHeight * z }; };
        const knapp = document.querySelector('[data-aspect-lock]');
        const wf = document.querySelector('#propWidth'), hf = document.querySelector('#propHeight');
        const fore = vis(), falt = { b: +wf.value, h: +hf.value, bDis: wf.disabled, hDis: hf.disabled };
        const w0 = JSON.parse(JSON.stringify(state.widgets[0]));
        if (knapp) knapp.click();
        // ett skript som anda skickar en andring far inte skriva w.width
        wf.disabled = false; wf.value = String(Math.round(falt.b * 2));
        wf.dispatchEvent(new Event('input', { bubbles: true })); wf.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 300));
        const efterFalt = JSON.parse(JSON.stringify(state.widgets[0]));
        const s = document.querySelector('#propScale');
        s.value = '130'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 500));
        const efter = vis();
        return { kalla: document.querySelector('[data-aspect-source]')?.dataset.aspectSource, disabled: knapp && knapp.disabled,
          pressed: knapp && knapp.getAttribute('aria-pressed'), fore, falt, efter, w0, efterFalt, w1: JSON.parse(JSON.stringify(state.widgets[0])),
          faltEfter: { b: +document.querySelector('#propWidth').value, h: +document.querySelector('#propHeight').value } };
      }, w.id);
      if (m.kalla !== 'fast') fel.push(`${namn}: data-aspect-source ${m.kalla}`);
      if (m.disabled !== true || m.pressed !== 'true') fel.push(`${namn}: laset ska visas last och inte ga att toggla`);
      if (!m.falt.bDis || !m.falt.hDis) fel.push(`${namn}: Bredd/Hojd ska vara skrivskyddade (en storleksfrihet, en kontroll: Storlek)`);
      if (Math.abs(m.falt.b - m.fore.b) > 1 || Math.abs(m.falt.h - m.fore.h) > 1) fel.push(`${namn}: falten ${m.falt.b}x${m.falt.h} mot ritat ${m.fore.b.toFixed(0)}x${m.fore.h.toFixed(0)}`);
      if (m.efterFalt.width !== m.w0.width || m.efterFalt.height !== m.w0.height || m.efterFalt.widgetScale !== m.w0.widgetScale) fel.push(`${namn}: en andring i Bredd-faltet slapp igenom`);
      if (m.w1.width !== m.w0.width || m.w1.height !== m.w0.height) fel.push(`${namn}: w.width/w.height andrades`);
      if (Math.abs(m.efter.b / m.fore.b - 1.3) > 0.02 || Math.abs(m.efter.h / m.fore.h - 1.3) > 0.03) fel.push(`${namn}: Storlek 130 %: X ${(m.efter.b / m.fore.b).toFixed(3)} Y ${(m.efter.h / m.fore.h).toFixed(3)}`);
      if (Math.abs(m.faltEfter.b - m.efter.b) > 1 || Math.abs(m.faltEfter.h - m.efter.h) > 1) fel.push(`${namn}: falten efter Storlek ${m.faltEfter.b}x${m.faltEfter.h}, ritat ${m.efter.b.toFixed(0)}x${m.efter.h.toFixed(0)}`);
    } finally { await page.close() }
  }
  assert.deepEqual(fel, [], 'fasta kompositioner:' + String.fromCharCode(10) + fel.join(String.fromCharCode(10)));
});

// ---- Prov 8 · defaultlagen -------------------------------------------------------------------
test('media ar last som default, innehallsstyrd ar olast', { skip, timeout: 120000 }, async () => {
  const fel = [];
  for (const [namn, w, vantatLast, kalla] of [
    ['media (bild)', MEDIA, true, 'media'],
    ['egen text', INNEHALL, false, 'content'],
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

// ---- Prov 10 · nytt media -> ny ratio ---------------------------------------------------------
// Byter anvandaren fran en liggande fil till en staende ska laset folja den NYA filen. Gammal
// ratio kvar hade strackt eller beskurit bilden tyst — samma klass av tyst fel som resten av
// det har arbetet stangt.
test('nytt media uppdaterar aspectRatio nar laset ar pa', { skip, timeout: 90000 }, async () => {
  const page = await panelenFor(MEDIA);
  try {
    const m = await page.evaluate(async () => {
      const w = state.widgets[0];
      if (w.aspectLocked !== true) return { fel: 'media ska vara last som default (prov 8)' };
      const fore = w.aspectRatio;
      // Byt fil: ny mediaMeta + ny form pa den renderade noden.
      const nod = document.querySelector('.canvas [data-id="p2"]');
      if (nod) { nod.style.width = '200px'; nod.style.height = '400px' }
      w.mediaMeta = { id: 'demo2', name: 'staende.png' };
      window.dispatchEvent(new CustomEvent('vyra-media-bytt', { detail: { id: 'p2' } }));
      await new Promise(r => setTimeout(r, 500));
      return { fore, efter: state.widgets[0].aspectRatio };
    });
    assert.ok(!m.fel, m.fel);
    assert.ok(m.efter > 0, 'aspectRatio ska finnas efter filbytet');
    assert.notEqual(m.efter, m.fore,
      `aspectRatio skulle folja den nya filen: var ${m.fore}, ar ${m.efter}`);
  } finally { await page.close() }
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
