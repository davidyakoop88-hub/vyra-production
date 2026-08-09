'use strict';
// Autosparet FINNS redan — mätt 2026-08-09: save() anropas fran 170 stallen i 26 filer, och
// att dra ett reglage skriver via writeActive utan att nagon ror Spara-knappen. Det som
// saknades var att anvandaren kunde SE det.
//
// Darav den har PR:en, och darav dessa prov:
//
//   - Spara-knappen ska bort. Den anropade samma save() som allt annat redan gor
//     (studio.js:194 -> save();toast). Med en synlig "sparat kl."-indikator blir en
//     Spara-knapp aktivt vilseledande: "maste jag trycka?".
//   - Indikatorn ska bara TIDPUNKTEN for senaste lyckade sparning, och uppdateras.
//   - Det ska finnas EXAKT EN sparindikator. .cloud-status ager redan fragan "ar det
//     sparat?"; en andra vore samma dubbelkontroll som Etapp 3 tog bort.
//
// Signalen ar `vyra-session-state-saved` fran session-state.js — agaren annonserar sin egen
// lyckade skrivning. Ingen ny skrivvag, ingen pollning, ingen wrap av monopolet.
//
// ROTT NU: knappen finns, ingen tidsstampel.
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

async function editorn() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function', null, { timeout: 20000 });
  await page.evaluate(async () => {
    // SKRIVBAR session kravs: utan projektion ar mode varken studio- eller local-committed,
    // och writeActive svarar {ok:false,'not-writable'} utan att skriva nagot alls. Da naar
    // ingen sparning success-vagen och indikatorn har inget att visa — provet hade matt
    // franvaron av en sparning, inte franvaron av en tidsstampel.
    // projectLocalSession() ar samma vag desktopappen tar (cloud-sync.js:202, vyra-auth-local).
    await window.VyraSessionState.projectLocalSession();
    view = 'editor';
    state.widgets = [{ id: 's1', type: 'templateTopLike', x: 100, y: 100, width: 260, likeCount: 5 }];
    selected = 's1';
    render();
    await new Promise(r => setTimeout(r, 500));
  });
  // cloud-sync monterar .cloud-status fran sin sekundtickare, inte synkront med renderingen
  // (cloud-sync.js:44-46 — lankraden finns annu inte nar den bootar). Utan den har vantan
  // laste ett prov indikatorn innan den fanns och rapporterade "ingen .cloud-status" — ett
  // riggfel som ser ut som ett produktfel.
  await page.waitForFunction(() => !!document.querySelector('.cloud-status'), null, { timeout: 15000 });
  return page;
}

// ---- Prov 1 · Spara-knappen ar borta -----------------------------------------------------------
test('editorn har ingen Spara-knapp — autosparet ar sanningen', { skip, timeout: 90000 }, async () => {
  const page = await editorn();
  try {
    const m = await page.evaluate(() => {
      const knappar = [...document.querySelectorAll('.editor-toolbar button')];
      return {
        saveProject: !!document.querySelector('#saveProject:not([hidden])'),
        sparaText: knappar.filter(b => /^\s*spara\s*$/i.test(b.textContent)).length,
        toolbarFinns: !!document.querySelector('.editor-toolbar'),
      };
    });
    assert.equal(m.toolbarFinns, true, 'kontrollmatning: verktygsraden ska finnas');
    assert.equal(m.saveProject, false,
      'en synlig #saveProject finns kvar — den anropar samma save() som autosparet redan kor ' +
      'och far anvandaren att tro att sparning kraver ett knapptryck');
    assert.equal(m.sparaText, 0, 'ingen knapp i verktygsraden ska heta bara "Spara"');
  } finally { await page.close() }
});

// ---- Prov 2 · indikatorn bar tidpunkten --------------------------------------------------------
test('sparindikatorn visar klockslag efter en andring', { skip, timeout: 90000 }, async () => {
  const page = await editorn();
  try {
    const m = await page.evaluate(async () => {
      const status = document.querySelector('.cloud-status');
      if (!status) return { fel: 'ingen .cloud-status i UI:t' };
      const fore = status.textContent.trim();
      // En vanlig andring — samma vag som allt annat i editorn tar.
      state.widgets[0].x = 240;
      await save();
      await new Promise(r => setTimeout(r, 500));
      return { fore, efter: document.querySelector('.cloud-status').textContent.trim() };
    });
    assert.ok(!m.fel, m.fel);
    assert.match(m.efter, /\b\d{1,2}[:.]\d{2}\b/,
      `indikatorn ska bara klockslaget for senaste lyckade sparning — sager "${m.efter}"`);
  } finally { await page.close() }
});

// ---- Prov 3 · tidpunkten folger med -----------------------------------------------------------
test('tidpunkten uppdateras vid nasta sparning', { skip, timeout: 90000 }, async () => {
  const page = await editorn();
  try {
    const m = await page.evaluate(async () => {
      const las = () => document.querySelector('.cloud-status')?.dataset.sparatVid || null;
      state.widgets[0].x = 240;
      await save();
      await new Promise(r => setTimeout(r, 400));
      const forsta = las();
      await new Promise(r => setTimeout(r, 1100));
      state.widgets[0].x = 260;
      await save();
      await new Promise(r => setTimeout(r, 400));
      return { forsta, andra: las() };
    });
    assert.ok(m.forsta, 'indikatorn ska bara tidpunkten i data-sparat-vid (maskinlasbar, for provet)');
    assert.ok(m.andra, 'tidpunkten ska finnas kvar efter andra sparningen');
    assert.notEqual(m.andra, m.forsta, 'tidpunkten ska uppdateras vid nasta lyckade sparning');
  } finally { await page.close() }
});

// ---- Prov 4 · indikatorn syns pa skarmen ------------------------------------------------------
// Monterad rackte inte: forsta implementationen la statusen som eget rutnatsradsobjekt och den
// hamnade pa y=902 i ett 900px fonster — under vikningen, osynlig precis som A10. En indikator
// ingen ser bar ingen information.
test('indikatorn ligger inom synligt fonster', { skip, timeout: 90000 }, async () => {
  const page = await editorn();
  try {
    const m = await page.evaluate(async () => {
      state.widgets[0].x = 240;
      await save();
      await new Promise(r => setTimeout(r, 500));
      const r = document.querySelector('.cloud-status').getBoundingClientRect();
      return { topp: Math.round(r.top), botten: Math.round(r.bottom), hojd: Math.round(r.height),
               fonster: window.innerHeight };
    });
    assert.ok(m.hojd > 0, 'indikatorn ska ha hojd');
    assert.ok(m.botten <= m.fonster,
      `indikatorn slutar pa y=${m.botten} i ett ${m.fonster}px fonster — under vikningen, ` +
      'alltsa osynlig for anvandaren');
    assert.ok(m.topp >= 0, `indikatorn borjar pa y=${m.topp} — ovanfor fonstret`);
  } finally { await page.close() }
});

// ---- Prov 5 · en indikator, inte tva ----------------------------------------------------------
test('det finns exakt en sparindikator i UI:t', { skip, timeout: 90000 }, async () => {
  const page = await editorn();
  try {
    const antal = await page.evaluate(async () => {
      state.widgets[0].x = 240;
      await save();
      await new Promise(r => setTimeout(r, 500));
      return [...document.querySelectorAll('.cloud-status, [data-sparat-vid]')]
        .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
        .length;
    });
    assert.equal(antal, 1,
      `${antal} synliga sparindikatorer — .cloud-status ager fragan "ar det sparat?" ensam, ` +
      'en andra vore samma dubbelkontroll som Etapp 3 tog bort');
  } finally { await page.close() }
});
