'use strict';
// Angra/gor om i Layout-editorn (Etapp 5, forsta funktions-PR:en). Proven definierar kontraktet
// INNAN koden finns:
//
//   - Tva knappar i editorns verktygsrad: [data-angra] och [data-gor-om], disablade nar
//     respektive stack ar tom.
//   - Ett publikt API: window.VyraHistorik { length(), angra(), gorOm() } — for prov och
//     felsokning, INTE en ny skrivvag.
//   - All aterstallning gar genom save() -> writeActive(): session-write-monopoly-provet
//     ska sta orort nar implementationen ar klar.
//   - Historiken ar DIFF-baserad: bara layoutandringar (state.widgets m.fl.) skapar poster,
//     inte visningsnamn och andra icke-layoutfalt.
//   - Stacken toms pa vyra-session-ended — kontobytesLACKAN ar prov nummer ETT enligt
//     beslut 2026-08-09: Ctrl+Z far ALDRIG kunna aterstalla ett annat kontos layout.
//     Det ar A->B-lackan ur arkitekturkontraktet i ny form.
//
// ROTT NU: allihop — knapparna och API:t existerar inte.
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

// Editor med en widget pa kand position. Alla lagesandringar gar via state + save() — exakt
// samma vag som panelens kontroller tar.
async function editorMedWidget() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && typeof window.save === 'function'
    || typeof window.render === 'function', null, { timeout: 20000 });
  await page.evaluate(async () => {
    view = 'editor';
    state.widgets = [{ id: 'u1', type: 'templateTopLike', x: 100, y: 100, width: 260, likeCount: 5 }];
    selected = 'u1';
    render();
    if (typeof bind === 'function') bind();
    await new Promise(r => setTimeout(r, 400));
  });
  return page;
}

// En layoutandring som en anvandare hade gjort: flytt via state + save + render.
const FLYTTA = async (page, x, y) => page.evaluate(async ([nx, ny]) => {
  state.widgets[0].x = nx; state.widgets[0].y = ny;
  await save();
  render();
  await new Promise(r => setTimeout(r, 150));
}, [x, y]);

const LAGE = page => page.evaluate(() => ({ x: state.widgets[0]?.x, y: state.widgets[0]?.y }));

// ---- Prov 1 · KONTOBYTESLACKAN (forsta provet enligt beslut) -----------------------------------
test('stacken toms vid session-slut och knappen slocknar', { skip, timeout: 90000 }, async () => {
  const page = await editorMedWidget();
  try {
    await FLYTTA(page, 200, 220);
    await FLYTTA(page, 300, 320);
    const m = await page.evaluate(async () => {
      const fore = window.VyraHistorik ? window.VyraHistorik.length() : null;
      window.dispatchEvent(new CustomEvent('vyra-session-ended'));
      await new Promise(r => setTimeout(r, 200));
      const knapp = document.querySelector('.editor-toolbar [data-angra]');
      return {
        apiFinns: !!window.VyraHistorik,
        posterFore: fore,
        posterEfter: window.VyraHistorik ? window.VyraHistorik.length() : null,
        knappFinns: !!knapp,
        knappDisablad: knapp ? knapp.disabled : null,
      };
    });
    assert.equal(m.apiFinns, true, 'window.VyraHistorik saknas — angra/gor om ar inte byggt');
    assert.ok(m.posterFore >= 1, 'tva flyttar ska ha skapat historikposter');
    assert.equal(m.posterEfter, 0,
      'historiken ska TOMMAS pa vyra-session-ended — annars kan nasta konto angra sig till ' +
      'forra kontots layout (A->B-lackan)');
    assert.equal(m.knappFinns, true, 'angra-knappen [data-angra] saknas i editorns verktygsrad');
    assert.equal(m.knappDisablad, true, 'angra-knappen ska vara disablad nar stacken ar tom');
  } finally { await page.close() }
});

// ---- Prov 2 · angra aterstaller en flytt -------------------------------------------------------
test('angra aterstaller senaste flytten, via writeActive', { skip, timeout: 90000 }, async () => {
  const page = await editorMedWidget();
  try {
    await FLYTTA(page, 250, 260);
    const fore = await LAGE(page);
    assert.deepEqual(fore, { x: 250, y: 260 }, 'kontrollmatning: flytten ska ha bitit');

    const m = await page.evaluate(async () => {
      const knapp = document.querySelector('.editor-toolbar [data-angra]');
      if (!knapp) return { fel: 'knappen saknas' };
      // Spion pa monopolets skrivvag: delegerar oforandrat, raknar bara. localStorage gar inte
      // att lasa har — i oautentiserad miljo svarar writeActive {ok:false,'not-writable'} och
      // skriver ingenting, sa kontraktet "aterstallning GENOM save()/writeActive" maste bevisas
      // vid anropet, inte i lagringen.
      const riktig = window.VyraSessionState.writeActive.bind(window.VyraSessionState);
      const anrop = [];
      window.VyraSessionState.writeActive = (nyckel, varde) => {
        anrop.push({ nyckel, x: nyckel === 'vyra-state' ? JSON.parse(varde).widgets?.[0]?.x : null });
        return riktig(nyckel, varde);
      };
      knapp.click();
      await new Promise(r => setTimeout(r, 300));
      window.VyraSessionState.writeActive = riktig;
      return {
        lage: { x: state.widgets[0].x, y: state.widgets[0].y },
        skrevs: anrop.filter(a => a.nyckel === 'vyra-state').map(a => a.x),
        canvasX: parseInt(document.querySelector('.canvas [data-id="u1"]')?.style.left || '-1', 10),
      };
    });
    assert.ok(!m.fel, m.fel);
    assert.deepEqual(m.lage, { x: 100, y: 100 }, 'angra ska aterstalla positionen fore flytten');
    assert.deepEqual(m.skrevs, [100],
      'aterstallningen ska ga GENOM writeActive med det aterstallda laget — ingen ny skrivvag');
    assert.equal(m.canvasX, 100, 'canvasen ska rita det aterstallda laget');
  } finally { await page.close() }
});

// ---- Prov 3 · gor om aterstaller det angrade ---------------------------------------------------
test('gor om aterstaller det angrade laget', { skip, timeout: 90000 }, async () => {
  const page = await editorMedWidget();
  try {
    await FLYTTA(page, 250, 260);
    // Farska queries efter varje klick: renderingen bygger om verktygsraden, och en
    // franskopplad knappnods .disabled ar fruset — samma matfalla som formatstatus-provet.
    const m = await page.evaluate(async () => {
      const angra = () => document.querySelector('.editor-toolbar [data-angra]');
      const gorOm = () => document.querySelector('.editor-toolbar [data-gor-om]');
      if (!angra() || !gorOm()) return { fel: 'knapparna saknas' };
      angra().click();
      await new Promise(r => setTimeout(r, 250));
      const mellan = { x: state.widgets[0].x, gorOmDisablad: gorOm().disabled };
      gorOm().click();
      await new Promise(r => setTimeout(r, 250));
      return { mellan, efter: { x: state.widgets[0].x, y: state.widgets[0].y } };
    });
    assert.ok(!m.fel, m.fel);
    assert.equal(m.mellan.x, 100, 'angra forst');
    assert.equal(m.mellan.gorOmDisablad, false, 'gor om ska tandas nar nagot angrats');
    assert.deepEqual(m.efter, { x: 250, y: 260 }, 'gor om ska aterstalla det angrade laget');
  } finally { await page.close() }
});

// ---- Prov 4 · angra efter kontobyte nar inte forra kontots layout ------------------------------
test('angra efter kontobyte kan inte na forra kontots layout', { skip, timeout: 90000 }, async () => {
  const page = await editorMedWidget();
  try {
    await FLYTTA(page, 400, 420); // "konto A" gor en andring
    const m = await page.evaluate(async () => {
      window.dispatchEvent(new CustomEvent('vyra-session-ended'));
      await new Promise(r => setTimeout(r, 200));
      // "konto B" projiceras: annan widget, annat lage.
      state.widgets = [{ id: 'b1', type: 'templateTopLike', x: 50, y: 60, width: 260, likeCount: 3 }];
      selected = 'b1';
      render();
      await new Promise(r => setTimeout(r, 200));
      if (window.VyraHistorik) window.VyraHistorik.angra();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      await new Promise(r => setTimeout(r, 250));
      return {
        apiFinns: !!window.VyraHistorik,
        poster: window.VyraHistorik ? window.VyraHistorik.length() : null,
        widgets: state.widgets.map(w => ({ id: w.id, x: w.x, y: w.y })),
      };
    });
    assert.equal(m.apiFinns, true, 'window.VyraHistorik saknas');
    assert.equal(m.poster, 0, 'konto B ska borja med tom historik');
    assert.deepEqual(m.widgets, [{ id: 'b1', x: 50, y: 60 }],
      'angra fick ALDRIG rora konto B:s layout — och absolut inte aterstalla konto A:s');
  } finally { await page.close() }
});

// ---- Prov 5 · inputfokus behaller native undo --------------------------------------------------
test('Ctrl+Z i ett textfalt ror inte layouten', { skip, timeout: 90000 }, async () => {
  const page = await editorMedWidget();
  try {
    await FLYTTA(page, 250, 260);
    const m = await page.evaluate(async () => {
      // Ett SYNLIGT textfalt — selektorer utan synlighetsfilter traffade #pt, ett gomt falt
      // vars focus() tyst misslyckas, och da star activeElement kvar pa body och vakten ser
      // aldrig nagot fokus att respektera.
      const falt = [...document.querySelectorAll('.properties input')].find(i => {
        const r = i.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (i.type === 'text' || !i.getAttribute('type'));
      });
      if (!falt) return { fel: 'hittar inget SYNLIGT textfalt i panelen' };
      falt.focus();
      const posterFore = window.VyraHistorik ? window.VyraHistorik.length() : null;
      falt.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      await new Promise(r => setTimeout(r, 250));
      return {
        apiFinns: !!window.VyraHistorik,
        posterFore,
        posterEfter: window.VyraHistorik ? window.VyraHistorik.length() : null,
        lage: { x: state.widgets[0].x, y: state.widgets[0].y },
      };
    });
    assert.ok(!m.fel, m.fel);
    assert.equal(m.apiFinns, true, 'window.VyraHistorik saknas');
    assert.deepEqual(m.lage, { x: 250, y: 260 },
      'Ctrl+Z med fokus i textfalt far inte rora layouten — faltet har egen text-undo');
    assert.equal(m.posterEfter, m.posterFore, 'historiken far inte konsumeras av faltets Ctrl+Z');
  } finally { await page.close() }
});

// ---- Prov 6 · taklangd ------------------------------------------------------------------------
test('historiken toppar pa 50 poster', { skip, timeout: 120000 }, async () => {
  const page = await editorMedWidget();
  try {
    const m = await page.evaluate(async () => {
      for (let i = 0; i < 55; i++) {
        state.widgets[0].x = 100 + i;
        await save();
      }
      await new Promise(r => setTimeout(r, 200));
      return { apiFinns: !!window.VyraHistorik,
               poster: window.VyraHistorik ? window.VyraHistorik.length() : null };
    });
    assert.equal(m.apiFinns, true, 'window.VyraHistorik saknas');
    assert.ok(m.poster <= 50, `stacken ska toppa pa 50 poster — har ${m.poster}`);
    assert.ok(m.poster >= 45, `stacken ska ha behallit de senaste (~50) posterna — har ${m.poster}`);
  } finally { await page.close() }
});
