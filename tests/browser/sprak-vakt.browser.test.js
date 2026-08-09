'use strict';
// Sprakvaktens DOM-LAGER: vandrar varje synligt navval och laser den RENDERADE texten —
// det anvandaren ser, dar identifierare aldrig dyker upp och dit dynamiskt byggda strangar
// (textContent = '⚙ Configure') alltid nar. Kallkodslagret i tests/sprak-vakt.test.js ar
// den snabba grinden; det har ar sanningen.
//
// Tva nivaer, ur samma ordlista (tests/fixtures/sprak-ordlista.js):
//   DOM_FRASER    — far aldrig synas nagonstans (Configure, Preview, All time ...)
//   NAV_TITEL_ORD — far inte synas i navetiketter, grupprubriker, #title eller #crumb,
//                   men ar tillatna som domantermer inne i en vy: Automatik-vyns
//                   "Events"-kolumn ar funktionens eget begrepp och ska inte jagas.
//
// ROTT NU (Etapp 4 PR A): Oversikt (All time, VYRA LIVE COMMAND CENTER), Overlay-vyn
// (Configure/Preview pa varje kort), Statistik-vyn (Top supporters + navnamnet Analytics),
// navet (Events, grupprubrikerna Core/Automation/Insights), Mediabiblioteket m.fl.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const { DOM_FRASER, NAV_TITEL_ORD } = require('../fixtures/sprak-ordlista.js');

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

test('renderad text ar svensk i varje vy', { skip, timeout: 180000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('[data-view],[data-extra]'),
      null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    const navval = await page.evaluate(() =>
      [...document.querySelectorAll('[data-view],[data-extra]')]
        .filter(b => b.getBoundingClientRect().width > 0)
        .map(b => b.dataset.view || b.dataset.extra));

    const fel = [];

    // Nav, grupprubriker — en gang, de ar samma i alla vyer.
    const navFel = await page.evaluate(ord => {
      const ut = [];
      document.querySelectorAll('[data-view] span, [data-extra] span, .nav-section-label').forEach(el => {
        const t = el.textContent.trim();
        for (const o of ord) if (new RegExp(`\\b${o}\\b`).test(t)) ut.push(`nav/grupprubrik "${t}" innehaller "${o}"`);
      });
      return ut;
    }, NAV_TITEL_ORD);
    fel.push(...navFel);

    for (const nyckel of navval) {
      await page.click(`[data-view="${nyckel}"],[data-extra="${nyckel}"]`, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(700);
      const vyFel = await page.evaluate(([vy, fraser, navOrd]) => {
        const ut = [];
        // Titel + brodsmula vaktas mot NAV_TITEL_ORD.
        for (const el of [document.querySelector('#title'), document.querySelector('#crumb')]) {
          const t = (el?.textContent || '').trim();
          for (const o of navOrd) if (new RegExp(`\\b${o}\\b`, 'i').test(t)) ut.push(`${vy}: titel/brodsmula "${t}" innehaller "${o}"`);
        }
        // Hela vyns synliga text vaktas mot DOM_FRASER.
        const sedd = new Set();
        const walker = document.createTreeWalker(document.querySelector('#view'), NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) {
          const el = n.parentElement;
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const rad = n.textContent.replace(/\s+/g, ' ').trim();
          if (!rad || sedd.has(rad)) continue;
          sedd.add(rad);
          for (const f of fraser) {
            if (new RegExp(`\\b${f.replace(/ /g, '\\s+')}\\b`, 'i').test(rad)) {
              ut.push(`${vy}: "${rad.slice(0, 60)}" innehaller "${f}"`);
            }
          }
        }
        return ut;
      }, [nyckel, DOM_FRASER, NAV_TITEL_ORD]);
      fel.push(...vyFel);
    }

    const unika = [...new Set(fel)];
    assert.deepEqual(unika, [],
      'engelska UI-strangar i renderad text:\n  ' + unika.join('\n  '));
  } finally { await page.close() }
});
