'use strict';
// Ett varde ska ha EN kontroll. Top Like-panelen har tva som skriver samma likeCount:
//
//   media.js:273  reglaget  "Antal profiler" (range 1-10) med varde-etikett <b>
//   media.js:276  topLikeCountBind injicerar .like-count-choice — tio sifferknappar
//                 "Hur manga ska visas?" — direkt under reglaget, ENBART for templateTopLike
//
// Bada skriver w.likeCount. Tva kontroller for samma varde pa samma panel ser ut som en bugg
// aven nar bada rakar fungera, och de kan glida isar (knapparnas .active laser bara vardet vid
// injektion). Beslut 2026-08-09: reglaget behalls, sifferknapparna tas bort.
//
// Prov 1 ar mutationsbeviset: ROTT mot HEAD (pickern finns), gront efter borttagningen.
// Prov 2 ar en REGRESSIONSVAKT och vantas gron aven mot HEAD: reglagets hela kedja
// (input -> state -> varde-etikett -> canvasrendering, via vyraLivePatch media.js:143) lases
// fast sa att borttagningen inte kan tysta den. Ingen av kontrollerna hade nagon provtackning
// alls fore den har filen — "testsviten oforandrad" bevisade darfor ingenting om panelen.
//
// Browser och inte jsdom: kedjan gar genom riktig rendering och riktiga input-event.
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

// Samma mall som panel-controls.browser.test.js: en Top Like-widget i editorn, vald, panelen byggd.
async function editorMedTopLike() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && typeof window.wh === 'function',
    null, { timeout: 20000 });
  await page.evaluate(async () => {
    view = 'editor';
    state.widgets = [{ id: 'lk1', type: 'templateTopLike', x: 20, y: 20, width: 260, likeCount: 5 }];
    selected = 'lk1';
    render();
    if (typeof bind === 'function') bind();
    await new Promise(r => setTimeout(r, 500));
  });
  return page;
}

// ---- Prov 1 · mutationsbevis -------------------------------------------------------------------
test('antal profiler har exakt EN kontroll i panelen', { skip, timeout: 90000 }, async () => {
  const page = await editorMedTopLike();
  try {
    const m = await page.evaluate(() => ({
      reglage: document.querySelectorAll('#likeCount').length,
      sifferknappar: document.querySelectorAll('.like-count-choice').length,
      knapparSomSkriverLikeCount: document.querySelectorAll('[data-like-count]').length,
    }));
    assert.equal(m.reglage, 1, 'reglaget #likeCount ska finnas, exakt ett');
    assert.equal(m.sifferknappar, 0,
      '.like-count-choice-pickern finns i panelen — tva kontroller skriver samma likeCount. ' +
      'Beslutet ar att reglaget ensamt ager vardet.');
    assert.equal(m.knapparSomSkriverLikeCount, 0,
      'data-like-count-knappar finns kvar — sifferknapparna ska vara borttagna');
  } finally { await page.close() }
});

// ---- Prov 2 · regressionsvakt ------------------------------------------------------------------
// Vantas gron aven mot HEAD. Den finns for att borttagningen av pickern inte tyst ska bryta
// reglagets kedja — som fram till nu var helt oprovad.
test('reglagets kedja: input -> state -> etikett -> rendering', { skip, timeout: 90000 }, async () => {
  const page = await editorMedTopLike();
  try {
    const m = await page.evaluate(async () => {
      const slider = document.querySelector('#likeCount');
      if (!slider) return { fel: 'reglaget saknas' };
      const widgetNod = () => document.querySelector(`.canvas [data-id="lk1"]`);
      const fore = (widgetNod()?.textContent || '').length;

      slider.value = '9';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));

      const etikett = slider.closest('label')?.querySelector('b')?.textContent || '';
      const efterInput = {
        state: state.widgets[0].likeCount,
        etikett,
        renderingVaxte: (widgetNod()?.textContent || '').length > fore,
      };

      slider.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      return { fore, efterInput, efterChange: state.widgets[0].likeCount };
    });

    assert.ok(!m.fel, m.fel);
    assert.equal(m.efterInput.state, 9, 'input ska uppdatera state.widgets[0].likeCount direkt (vyraLivePatch)');
    assert.match(m.efterInput.etikett, /^9/,
      `varde-etiketten <b> ska visa det valda heltalet — visar "${m.efterInput.etikett}". ` +
      'Utan sifferknapparna ar etiketten den enda synliga siffran, sa den far inte slacka.');
    assert.equal(m.efterInput.renderingVaxte, true,
      'canvasrenderingen ska folja med live nar antalet gar 5 -> 9');
    assert.equal(m.efterChange, 9, 'change ska bekrafta vardet i state');
  } finally { await page.close() }
});
