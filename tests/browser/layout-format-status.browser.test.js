'use strict';
// Formatvaljarens statusyta ser ut som ett tredje val. layout-format.js:70 lagger
// <output class="layout-format-status" aria-live="polite"> SIST INUTI .layout-format-picker
// (role="group") — direkt efter de tva riktiga knapparna, pa samma rad, i samma grupp.
// Statusen ar text ("Mobil · 9:16") men star dar ett tredje klickbart val forvantas sta.
//
// Beslut 2026-08-09: flytta ut statusen ur knappgruppen. Behall id/klass och aria-live=polite —
// skarmavlasare ska fortsatt fa formatbytet upplast.
//
// Prov 1 ar mutationsbeviset: ROTT mot HEAD (outputen ar barn av pickern).
// Prov 2 ar vakt: statusen uppdateras vid byte och har ingen knappstyling.
// Prov 3 ar hygienvakt: html.overlay-output ska dolja statusen. I dag doljs den gratis via
//   `html.overlay-output .layout-format-picker{display:none}` (studio.css:536) eftersom den
//   ligger INUTI pickern — flyttas den ut utan att CSS-regeln foljer med borjar en statusrad
//   lacka in i OBS-laget. Provet ar gront fore flytten och tvingar regeln att folja med.
//
// Ingen av delarna hade provtackning: grep mot tests/ gav noll traffar for layout-format.
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

// Pickern byggs av layout-format.js nar editor-vyn har sin toolbar.
async function editorMedToolbar() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function', null, { timeout: 20000 });
  await page.evaluate(async () => {
    view = 'editor';
    state.widgets = [];
    render();
    if (typeof bind === 'function') bind();
    await new Promise(r => setTimeout(r, 400));
  });
  await page.waitForFunction(() => !!document.querySelector('.layout-format-picker'),
    null, { timeout: 10000 });
  return page;
}

// ---- Prov 1 · mutationsbevis -------------------------------------------------------------------
test('statusytan ligger utanfor formatvaljarens knappgrupp', { skip, timeout: 90000 }, async () => {
  const page = await editorMedToolbar();
  try {
    const m = await page.evaluate(() => {
      const picker = document.querySelector('.layout-format-picker');
      const status = document.querySelector('.layout-format-status');
      return {
        knapparIGruppen: picker.querySelectorAll('button').length,
        interaktivaIGruppen: picker.querySelectorAll('button,[role="button"],a,input,select,output').length,
        statusFinns: !!status,
        statusIGruppen: !!status && picker.contains(status),
        ariaLive: status ? status.getAttribute('aria-live') : null,
        iSammaToolbar: !!status && !!status.closest('.editor-toolbar'),
      };
    });

    assert.equal(m.knapparIGruppen, 2, 'gruppen ska ha exakt tva formatknappar');
    assert.equal(m.statusFinns, true, 'statusytan ska finnas kvar — den far flyttas, inte tas bort');
    assert.equal(m.ariaLive, 'polite', 'aria-live=polite maste behallas for skarmavlasare');
    assert.equal(m.iSammaToolbar, true, 'statusen ska sta kvar i toolbaren, bara utanfor knappgruppen');
    assert.equal(m.statusIGruppen, false,
      'statusytan ligger INUTI role=group tillsammans med knapparna — den ser ut som ett tredje ' +
      'val. Gruppen ska bara innehalla etiketten och de tva knapparna.');
    assert.equal(m.interaktivaIGruppen, 2,
      'gruppen ska innehalla exakt tva interaktionsbara element');
  } finally { await page.close() }
});

// ---- Prov 2 · vakt: uppdatering + icke-knapp-utseende ------------------------------------------
test('statusen uppdateras vid byte och ser inte ut som en knapp', { skip, timeout: 90000 }, async () => {
  const page = await editorMedToolbar();
  try {
    // Fraga om noderna EFTER varje klick: persist() kan trigga omrendering, och en
    // franskopplad nods computed styles ar tomma/transparenta — det gav ett falskt matvarde
    // i den har filens forsta version.
    const m = await page.evaluate(async () => {
      document.querySelector('[data-format="widescreen"]').click();
      await new Promise(r => setTimeout(r, 300));
      const efterDator = document.querySelector('.layout-format-status').textContent;
      document.querySelector('[data-format="mobile"]').click();
      await new Promise(r => setTimeout(r, 300));
      const status = document.querySelector('.layout-format-status');
      const knapp = document.querySelector('.layout-format-picker [data-format="mobile"]');
      const cs = getComputedStyle(status), kc = getComputedStyle(knapp);
      return {
        efterDator,
        efterMobil: status.textContent,
        statusRam: cs.borderTopWidth,
        statusBakgrund: cs.backgroundColor,
        knappRam: kc.borderTopWidth,
      };
    });

    assert.match(m.efterDator, /Dator/, 'statusen ska folja bytet till Dator');
    assert.match(m.efterMobil, /Mobil/, 'statusen ska folja bytet tillbaka till Mobil');
    // Diskriminatorn mot knapp-utseende: knapparna bar ram (styles i studio.css:524),
    // statusen ska vara ramlos och transparent — ren text.
    assert.equal(m.knappRam, '1px', 'kontrollmatning: riktiga knappar ska ha 1px ram');
    assert.equal(m.statusRam, '0px', 'statusen far ingen knappram');
    assert.equal(m.statusBakgrund, 'rgba(0, 0, 0, 0)',
      'statusen ska vara transparent — en fylld bakgrund ser klickbar ut');
  } finally { await page.close() }
});

// ---- Prov 3 · hygienvakt: OBS-laget ------------------------------------------------------------
test('overlay-output doljer statusen precis som resten av verktygsraden', { skip, timeout: 90000 }, async () => {
  const page = await editorMedToolbar();
  try {
    const m = await page.evaluate(async () => {
      document.documentElement.classList.add('overlay-output');
      await new Promise(r => setTimeout(r, 200));
      const status = document.querySelector('.layout-format-status');
      const picker = document.querySelector('.layout-format-picker');
      const dold = el => {
        const r = el.getBoundingClientRect();
        return getComputedStyle(el).display === 'none' || (r.width === 0 && r.height === 0);
      };
      const ut = { pickerDold: dold(picker), statusDold: dold(status) };
      document.documentElement.classList.remove('overlay-output');
      return ut;
    });

    assert.equal(m.pickerDold, true, 'pickern ska vara dold i OBS-laget (studio.css:536)');
    assert.equal(m.statusDold, true,
      'statusen ska ocksa vara dold i OBS-laget. I dag doljs den gratis som barn av pickern — ' +
      'efter utflytten maste dolj-regeln folja med, annars lacker en statusrad in i OBS.');
  } finally { await page.close() }
});
